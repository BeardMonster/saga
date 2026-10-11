import type { FastifyInstance } from "fastify";
import { processDueReminders } from "./service.js";
import { processDailyTaskReminders } from "../dailyTasks/service.js";

const POLL_INTERVAL_MS = 60_000;

// One once-a-minute tick for everything that's time-triggered and goes to the
// phone: dated reminders (+ their snooze nags) and daily-task reminders. Each
// runs in its own try so one failing never silences the other.
export function startReminderScheduler(server: FastifyInstance) {
  const timer = setInterval(async () => {
    try {
      const count = await processDueReminders(server.prisma);
      if (count > 0) {
        server.log.info(`Sent ${count} due reminder(s)`);
      }
    } catch (error) {
      server.log.error(error, "Reminder scheduler tick failed");
    }
    try {
      const count = await processDailyTaskReminders(server.prisma);
      if (count > 0) {
        server.log.info(`Sent ${count} daily-task reminder(s)`);
      }
    } catch (error) {
      server.log.error(error, "Daily-task reminder tick failed");
    }
  }, POLL_INTERVAL_MS);

  server.addHook("onClose", () => clearInterval(timer));
}
