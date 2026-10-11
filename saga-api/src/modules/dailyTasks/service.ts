import type { PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";
import { sendReminder } from "../../lib/ntfy.js";
import { dayDate, isValidHHMM, localDateKey, localMinutesOfDay, weekdayOfKey } from "../../lib/localDay.js";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// A reminder is only worth sending close to its time — if the server was
// down all morning, a "feed Pixel (morning)" nudge at 4 PM is noise, not help.
const REMINDER_GRACE_MINUTES = 180;

// Keeps only real weekday numbers (0-6), de-duplicated and sorted. An empty
// result falls back to every day rather than creating a task that's never due.
function cleanDays(days: unknown): number[] {
  if (!Array.isArray(days)) return ALL_DAYS;
  const valid = Array.from(new Set(days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))).sort((a, b) => a - b);
  return valid.length > 0 ? valid : ALL_DAYS;
}

// `now` is a parameter (defaulting to the real clock) so day/weekday logic can
// be tested against fixed dates instead of whatever today happens to be.
export async function listDailyTasks(prisma: PrismaClient, now: Date = new Date()) {
  const userId = await getCurrentUserId(prisma);
  const today = localDateKey(now);
  const weekday = weekdayOfKey(today);
  const tasks = await prisma.dailyTask.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { completions: { where: { day: dayDate(today) } } },
  });
  return {
    today,
    weekday,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      daysOfWeek: t.daysOfWeek,
      reminderTime: t.reminderTime,
      dueToday: t.daysOfWeek.includes(weekday),
      doneToday: t.completions.length > 0,
    })),
  };
}

// New tasks go to the END: a daily routine reads in the order it's done
// (morning feed, mail, …), and drag-reorder fixes it if that's not right.
export async function createDailyTask(prisma: PrismaClient, input: { title: string; daysOfWeek?: number[]; reminderTime?: string | null }) {
  const userId = await getCurrentUserId(prisma);
  const last = await prisma.dailyTask.aggregate({ where: { userId }, _max: { position: true } });
  return prisma.dailyTask.create({
    data: {
      userId,
      title: input.title.trim(),
      daysOfWeek: cleanDays(input.daysOfWeek),
      reminderTime: isValidHHMM(input.reminderTime) ? input.reminderTime : null,
      position: (last._max.position ?? -1) + 1,
    },
  });
}

export async function updateDailyTask(
  prisma: PrismaClient,
  id: string,
  input: { title?: string; daysOfWeek?: number[]; reminderTime?: string | null },
  now: Date = new Date(),
) {
  const data: { title?: string; daysOfWeek?: number[]; reminderTime?: string | null; lastRemindedOn?: null } = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.daysOfWeek !== undefined) data.daysOfWeek = cleanDays(input.daysOfWeek);
  if (input.reminderTime !== undefined) {
    data.reminderTime = isValidHHMM(input.reminderTime) ? input.reminderTime : null;
    // Moving the time to LATER today means today's reminder should still go
    // out at the new time. Moving it earlier (or clearing it) must not
    // re-send one that already went out — it'd fire immediately.
    if (data.reminderTime) {
      const [h, m] = data.reminderTime.split(":").map(Number);
      if (h * 60 + m > localMinutesOfDay(now)) data.lastRemindedOn = null;
    }
  }
  return prisma.dailyTask.update({ where: { id }, data });
}

// Checking off = a completion row for today's local day. Idempotent, so a
// double-tap (or the phone notification's Done button after already ticking
// it in the app) is harmless.
export async function completeDailyTask(prisma: PrismaClient, id: string, now: Date = new Date()) {
  const day = dayDate(localDateKey(now));
  return prisma.dailyTaskCompletion.upsert({
    where: { taskId_day: { taskId: id, day } },
    create: { taskId: id, day },
    update: {},
  });
}

export async function uncompleteDailyTask(prisma: PrismaClient, id: string, now: Date = new Date()) {
  const day = dayDate(localDateKey(now));
  await prisma.dailyTaskCompletion.deleteMany({ where: { taskId: id, day } });
  return { id };
}

export async function reorderDailyTasks(prisma: PrismaClient, ids: string[]) {
  await prisma.$transaction(ids.map((id, position) => prisma.dailyTask.update({ where: { id }, data: { position } })));
  return listDailyTasks(prisma);
}

export async function deleteDailyTask(prisma: PrismaClient, id: string) {
  return prisma.dailyTask.update({ where: { id }, data: { deletedAt: new Date() } });
}
export async function listDeletedDailyTasks(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.dailyTask.findMany({ where: { userId, deletedAt: { not: null } } });
}
export async function restoreDailyTask(prisma: PrismaClient, id: string) {
  return prisma.dailyTask.update({ where: { id }, data: { deletedAt: null } });
}
export async function hardDeleteDailyTask(prisma: PrismaClient, id: string) {
  await prisma.dailyTaskCompletion.deleteMany({ where: { taskId: id } });
  return prisma.dailyTask.delete({ where: { id } });
}

// Called by the same once-a-minute scheduler as the dated reminders. A task
// with a reminderTime sends ONE notification per due day, once that time has
// passed, as long as it isn't already checked off — and not at all if the
// time passed more than REMINDER_GRACE_MINUTES ago. Opt-in per task: no
// reminderTime, no notification. The notification's Done button checks the
// task off for today.
export async function processDailyTaskReminders(prisma: PrismaClient, send: typeof sendReminder = sendReminder, now: Date = new Date()) {
  const today = localDateKey(now);
  const todayDate = dayDate(today);
  const minutesNow = localMinutesOfDay(now);

  const candidates = await prisma.dailyTask.findMany({
    where: {
      deletedAt: null,
      reminderTime: { not: null },
      daysOfWeek: { has: weekdayOfKey(today) },
      // `not: X` alone skips NULLs in SQL, so the never-reminded case is explicit.
      OR: [{ lastRemindedOn: null }, { lastRemindedOn: { not: todayDate } }],
      completions: { none: { day: todayDate } },
    },
  });

  let sent = 0;
  for (const task of candidates) {
    const [h, m] = task.reminderTime!.split(":").map(Number);
    const minutesLate = minutesNow - (h * 60 + m);
    if (minutesLate < 0 || minutesLate > REMINDER_GRACE_MINUTES) continue;
    await send("Saga: daily task", task.title, { dailyTaskId: task.id });
    await prisma.dailyTask.update({ where: { id: task.id }, data: { lastRemindedOn: todayDate } });
    sent++;
  }
  return sent;
}
