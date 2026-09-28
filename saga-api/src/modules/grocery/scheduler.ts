import type { FastifyInstance } from "fastify";
import { startNewWeek, triggerScanIfDue } from "./service.js";

// Hourly polling is plenty of precision for a once-a-week boundary — same
// lightweight "check if it's due" pattern as trash/reminders' schedulers,
// no separate cron dependency needed.
const POLL_INTERVAL_MS = 60 * 60 * 1000;

// Wednesday morning: most grocery chains' weekly ad reset lands Tue
// night/Wed morning, and this comfortably precedes Brandon's usual
// Thu-through-weekend shopping trips — by the time he goes, this week's
// list and this week's scanned prices are both already fresh. Both the
// checklist rotation and the price scan below are anchored to this exact
// same instant, so they land together rather than drifting apart.
const TARGET_WEEKDAY = 3; // 0 = Sunday
const TARGET_HOUR = 6;

// The most recent Wednesday-6am instant at or before `now` — comparing a
// checklist's createdAt (or a deal's scannedAt) against this tells us
// whether this week's rotation/scan has already happened, without needing
// a separate "last run" record that could get out of sync on a restart.
function mostRecentTargetBoundary(now: Date): Date {
  const d = new Date(now);
  d.setHours(TARGET_HOUR, 0, 0, 0);
  const daysSinceTarget = (d.getDay() - TARGET_WEEKDAY + 7) % 7;
  d.setDate(d.getDate() - daysSinceTarget);
  if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 7);
  return d;
}

export function startGroceryWeekScheduler(server: FastifyInstance) {
  const timer = setInterval(async () => {
    const boundary = mostRecentTargetBoundary(new Date());

    try {
      const scanned = await triggerScanIfDue(server.prisma, boundary);
      if (scanned) server.log.info("Kicked off this week's grocery price scan");
    } catch (error) {
      server.log.error(error, "Grocery scan trigger failed");
    }

    try {
      const current = await server.prisma.checklist.findFirst({
        where: { kind: "grocery", deletedAt: null, archivedAt: null },
        select: { createdAt: true },
      });
      if (!current || current.createdAt < boundary) {
        await startNewWeek(server.prisma);
        server.log.info("Started a new grocery week (automatic weekly rotation)");
      }
    } catch (error) {
      server.log.error(error, "Grocery week rotation failed");
    }
  }, POLL_INTERVAL_MS);

  server.addHook("onClose", () => clearInterval(timer));
}
