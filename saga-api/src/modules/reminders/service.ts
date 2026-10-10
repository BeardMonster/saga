import type { Prisma, PrismaClient, ReminderSubjectType } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";
import { sendReminder } from "../../lib/ntfy.js";

export async function listCascades(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.reminderCascade.findMany({
    where: { userId, deletedAt: null, archivedAt: null },
    orderBy: { anchorDate: "asc" },
    include: { instances: { orderBy: { fireAt: "asc" } }, goal: true, person: true },
  });
}

export async function listArchivedCascades(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.reminderCascade.findMany({
    where: { userId, deletedAt: null, archivedAt: { not: null } },
    orderBy: { archivedAt: "desc" },
    include: { instances: { orderBy: { fireAt: "asc" } }, goal: true, person: true },
  });
}

export async function archiveCascade(prisma: PrismaClient, id: string) {
  return prisma.reminderCascade.update({ where: { id }, data: { archivedAt: new Date() } });
}

export async function unarchiveCascade(prisma: PrismaClient, id: string) {
  return prisma.reminderCascade.update({ where: { id }, data: { archivedAt: null } });
}

// The timezone "9:00 AM" means. The API container's TZ env is the single
// source of truth for this app's local time (see the grocery/stats day-
// boundary fix), so reminders agree with everything else about what "today" is.
const APP_TZ = process.env.TZ || "America/New_York";
export const DEFAULT_FIRE_TIME = "09:00";

// How often a snoozed (still-open) reminder re-notifies after each re-send,
// until it's marked Done.
const NAG_INTERVAL_MS = 60 * 60 * 1000;

export function isValidFireTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// How far ahead of UTC a timezone is at a given instant (ms). Derived from
// Intl rather than a hardcoded offset so daylight saving is handled.
function tzOffsetMs(ts: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(ts));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(ts / 1000) * 1000;
}

// Wall-clock time in `tz` -> the real instant. Offset is re-checked once at
// the candidate instant so a date that straddles a DST change lands right.
function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - tzOffsetMs(guess, tz);
  return new Date(guess - tzOffsetMs(first, tz));
}

// YYYY-MM-DD of an instant as seen in the app timezone.
function localDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// anchor is always a date-only value (UTC midnight — see schema.prisma's
// @db.Date), so its Y-M-D is read with UTC getters; reading it with local
// ones would shift it by a day. Each offset is applied to that calendar
// date, then the result is turned into a real instant at `fireTime` in the
// app's timezone (so "9:00 AM" stays 9:00 AM across daylight saving).
function computeFireDates(anchor: Date, cadenceDays: number[], fireTime: string): Date[] {
  const [hh, mm] = fireTime.split(":").map(Number);
  return cadenceDays.map((offsetDays) => {
    const day = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() + offsetDays));
    return zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hh, mm, APP_TZ);
  });
}

// The core "set the date once" mechanism: given an anchor date and a cadence
// like [-30, -7, -1, 0] (days relative to the anchor), generate one
// ReminderInstance per offset. This is what replaces Brandon manually
// setting several reminders by hand for the same event — including, now
// that Person exists, the actual birthday use case this was built for.
export async function createCascade(
  prisma: PrismaClient,
  input: {
    title: string;
    anchorDate: string;
    cadenceDays?: number[];
    subjectType?: ReminderSubjectType;
    goalId?: string;
    personId?: string;
    calendarEventId?: string;
    isRecurringAnnually?: boolean;
    fireTime?: string;
  },
) {
  const userId = await getCurrentUserId(prisma);
  const cadence = input.cadenceDays ?? [-30, -7, -1, 0];
  const anchor = new Date(input.anchorDate);
  const fireTime = isValidFireTime(input.fireTime) ? input.fireTime : DEFAULT_FIRE_TIME;

  const cascade = await prisma.reminderCascade.create({
    data: {
      userId,
      title: input.title,
      anchorDate: anchor,
      cadenceDays: cadence,
      fireTime,
      subjectType: input.subjectType ?? "freeform",
      goalId: input.goalId,
      personId: input.personId,
      calendarEventId: input.calendarEventId,
      isRecurringAnnually: input.isRecurringAnnually ?? false,
    },
  });

  const instances = computeFireDates(anchor, cadence, fireTime).map((fireAt) => ({ cascadeId: cascade.id, fireAt }));
  await prisma.reminderInstance.createMany({ data: instances });

  return prisma.reminderCascade.findUniqueOrThrow({
    where: { id: cascade.id },
    include: { instances: { orderBy: { fireAt: "asc" } } },
  });
}

// Editing a cascade's title is a simple field update. Editing its
// anchorDate/cadenceDays needs to regenerate the instance schedule — but
// already-sent instances are historical record and must be left alone, so
// only pending (unsent) instances are replaced.
export async function updateCascade(
  prisma: PrismaClient,
  id: string,
  input: Partial<{ title: string; anchorDate: string; cadenceDays: number[]; isRecurringAnnually: boolean; fireTime: string }>,
) {
  const scheduleChanged = input.anchorDate !== undefined || input.cadenceDays !== undefined || input.fireTime !== undefined;

  const cascade = await prisma.reminderCascade.update({
    where: { id },
    data: {
      title: input.title,
      anchorDate: input.anchorDate ? new Date(input.anchorDate) : undefined,
      cadenceDays: input.cadenceDays,
      isRecurringAnnually: input.isRecurringAnnually,
      fireTime: isValidFireTime(input.fireTime) ? input.fireTime : undefined,
    },
  });

  if (scheduleChanged) {
    await prisma.reminderInstance.deleteMany({ where: { cascadeId: id, sentAt: null } });
    // Don't re-create a slot that already fired: the form regenerates the
    // WHOLE schedule, so without this an edit made after e.g. the 1-week
    // reminder was sent would generate it again, already overdue, and send
    // it a second time.
    const alreadyFiredDays = new Set(
      (await prisma.reminderInstance.findMany({ where: { cascadeId: id }, select: { fireAt: true } })).map((i) => localDateKey(i.fireAt)),
    );
    const instances = computeFireDates(cascade.anchorDate, cascade.cadenceDays, cascade.fireTime)
      .filter((fireAt) => !alreadyFiredDays.has(localDateKey(fireAt)))
      .map((fireAt) => ({ cascadeId: id, fireAt }));
    await prisma.reminderInstance.createMany({ data: instances });
  }

  return prisma.reminderCascade.findUniqueOrThrow({
    where: { id },
    include: { instances: { orderBy: { fireAt: "asc" } } },
  });
}

export async function deleteCascade(prisma: PrismaClient, id: string) {
  return prisma.reminderCascade.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listDeletedCascades(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.reminderCascade.findMany({ where: { userId, deletedAt: { not: null } } });
}

export async function restoreCascade(prisma: PrismaClient, id: string) {
  return prisma.reminderCascade.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteCascade(prisma: PrismaClient, id: string) {
  await prisma.reminderInstance.deleteMany({ where: { cascadeId: id } });
  return prisma.reminderCascade.delete({ where: { id } });
}

// Rolls a recurring cascade's anchor forward one year and generates next
// year's instances. Called once the final (day-of) instance of a cycle
// fires — see processDueReminders below.
async function regenerateForNextYear(prisma: PrismaClient, cascadeId: string) {
  const cascade = await prisma.reminderCascade.findUniqueOrThrow({ where: { id: cascadeId } });

  const nextAnchor = new Date(cascade.anchorDate);
  nextAnchor.setUTCFullYear(nextAnchor.getUTCFullYear() + 1);

  await prisma.reminderCascade.update({
    where: { id: cascadeId },
    data: { anchorDate: nextAnchor },
  });

  const instances = computeFireDates(nextAnchor, cascade.cadenceDays, cascade.fireTime).map((fireAt) => ({ cascadeId, fireAt }));
  await prisma.reminderInstance.createMany({ data: instances });
}

const STALE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;
// How long a just-fired reminder stays in the "needs attention" list even if
// it was never snoozed, so it can still be snoozed or marked Done in the app.
const OPEN_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

// A reminder stays silent while what it belongs to (the person, goal or
// calendar event) is sitting in Trash, or while the cascade itself is
// archived; it resumes if that is restored/unarchived. Shared by first sends,
// nags, and the open list so they can never disagree about what's "live".
const liveCascade: Prisma.ReminderCascadeWhereInput = {
  deletedAt: null,
  archivedAt: null,
  OR: [{ personId: null }, { person: { deletedAt: null } }],
  AND: [
    { OR: [{ goalId: null }, { goal: { deletedAt: null } }] },
    { OR: [{ calendarEventId: null }, { calendarEvent: { deletedAt: null } }] },
  ],
};

// Polled by the scheduler (see scheduler.ts). Two passes:
//  1. instances whose fireAt has passed and haven't been sent yet — send via
//     ntfy and mark sent. After sending, checks whether that was the last
//     instance of a recurring cascade's cycle and, if so, queues up next
//     year's instances automatically.
//  2. snoozed instances (nagAt due, not yet Done) — send again and push
//     nagAt out by NAG_INTERVAL_MS, so a snoozed reminder keeps coming back
//     until it's marked Done rather than being forgotten after one snooze.
// `send` is injectable so tests can run this against real data without
// buzzing a phone.
export async function processDueReminders(prisma: PrismaClient, send: typeof sendReminder = sendReminder) {
  const now = new Date();
  const due = await prisma.reminderInstance.findMany({
    where: { sentAt: null, fireAt: { lte: now }, cascade: liveCascade },
    include: { cascade: { include: { instances: true } } },
  });

  for (const instance of due) {
    // cascade.anchorDate is date-only (UTC midnight) — format in UTC so the
    // date in the notification always matches what's on the calendar, e.g.
    // "Jess's birthday — Sep 11" rather than just the bare title.
    const anchorLabel = instance.cascade.anchorDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    // Overdue by more than two days means it came due while paused (e.g. the
    // person was in Trash) — mark it missed rather than firing a stale alert,
    // but still fall through so a recurring cycle rolls forward.
    const stale = Date.now() - instance.fireAt.getTime() > STALE_AFTER_MS;
    if (!stale) await send("Saga Reminder", `${instance.cascade.title} — ${anchorLabel}`, { instanceId: instance.id });
    await prisma.reminderInstance.update({
      where: { id: instance.id },
      data: { sentAt: new Date() },
    });

    const isLastInCycle = instance.cascade.instances.every(
      (i) => i.id === instance.id || i.fireAt.getTime() <= instance.fireAt.getTime(),
    );

    if (isLastInCycle && instance.cascade.isRecurringAnnually) {
      await regenerateForNextYear(prisma, instance.cascade.id);
    }
  }

  const nagging = await prisma.reminderInstance.findMany({
    where: { acknowledgedAt: null, nagAt: { lte: now }, cascade: liveCascade },
    include: { cascade: true },
  });
  for (const instance of nagging) {
    await send("Saga: still open", `${instance.cascade.title} — snoozed earlier, not done yet`, { instanceId: instance.id });
    await prisma.reminderInstance.update({ where: { id: instance.id }, data: { nagAt: new Date(Date.now() + NAG_INTERVAL_MS) } });
  }

  return due.length + nagging.length;
}

// Snooze: come back at `until`, or in `minutes` (default an hour). Unlike a
// phone's "snooze this once", a snoozed instance is put on the nag list —
// processDueReminders keeps re-sending it until completeInstance is called.
export async function snoozeInstance(prisma: PrismaClient, id: string, opts: { minutes?: number; tomorrow?: boolean }) {
  const instance = await prisma.reminderInstance.findUniqueOrThrow({ where: { id } });
  if (instance.acknowledgedAt) throw new Error("Already marked done");
  const minutes = Math.min(Math.max(Math.round(opts.minutes ?? 60), 1), 7 * 24 * 60);
  const nagAt = opts.tomorrow ? tomorrowAtDefaultTime() : new Date(Date.now() + minutes * 60_000);
  return prisma.reminderInstance.update({ where: { id }, data: { nagAt } });
}

// 9:00 AM tomorrow, app timezone.
function tomorrowAtDefaultTime(): Date {
  const [y, m, d] = localDateKey(new Date()).split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const [hh, mm] = DEFAULT_FIRE_TIME.split(":").map(Number);
  return zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), hh, mm, APP_TZ);
}

export async function completeInstance(prisma: PrismaClient, id: string) {
  return prisma.reminderInstance.update({ where: { id }, data: { acknowledgedAt: new Date(), nagAt: null } });
}

// Reminders that need a decision: anything snoozed and not yet Done (always,
// however old), plus anything that fired in the last couple of days and was
// never touched — so the notification can be dealt with from the app too.
// Keyed off fireAt (not sentAt) so old ones silently marked "missed" while
// their person was in Trash don't show up as if they just fired.
export async function listOpenInstances(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  const since = new Date(Date.now() - OPEN_WINDOW_MS);
  const instances = await prisma.reminderInstance.findMany({
    where: {
      acknowledgedAt: null,
      sentAt: { not: null },
      OR: [{ nagAt: { not: null } }, { fireAt: { gte: since } }],
      cascade: { ...liveCascade, userId },
    },
    include: { cascade: { select: { title: true, anchorDate: true } } },
    orderBy: { fireAt: "asc" },
  });
  return instances.map((i) => ({
    id: i.id,
    title: i.cascade.title,
    anchorDate: i.cascade.anchorDate,
    fireAt: i.fireAt,
    nagAt: i.nagAt,
  }));
}
