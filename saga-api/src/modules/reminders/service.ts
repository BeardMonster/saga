import type { PrismaClient, ReminderSubjectType } from "@prisma/client";
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

// anchor is always a date-only value (UTC midnight — see schema.prisma's
// @db.Date), so offsets must be applied with UTC setters. Local setters
// would reinterpret that UTC midnight in the server's own timezone and
// silently shift every generated instance by a day.
function computeFireDates(anchor: Date, cadenceDays: number[]): Date[] {
  return cadenceDays.map((offsetDays) => {
    const fireAt = new Date(anchor);
    fireAt.setUTCDate(fireAt.getUTCDate() + offsetDays);
    return fireAt;
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
  },
) {
  const userId = await getCurrentUserId(prisma);
  const cadence = input.cadenceDays ?? [-30, -7, -1, 0];
  const anchor = new Date(input.anchorDate);

  const cascade = await prisma.reminderCascade.create({
    data: {
      userId,
      title: input.title,
      anchorDate: anchor,
      cadenceDays: cadence,
      subjectType: input.subjectType ?? "freeform",
      goalId: input.goalId,
      personId: input.personId,
      calendarEventId: input.calendarEventId,
      isRecurringAnnually: input.isRecurringAnnually ?? false,
    },
  });

  const instances = computeFireDates(anchor, cadence).map((fireAt) => ({ cascadeId: cascade.id, fireAt }));
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
  input: Partial<{ title: string; anchorDate: string; cadenceDays: number[]; isRecurringAnnually: boolean }>,
) {
  const scheduleChanged = input.anchorDate !== undefined || input.cadenceDays !== undefined;

  const cascade = await prisma.reminderCascade.update({
    where: { id },
    data: {
      title: input.title,
      anchorDate: input.anchorDate ? new Date(input.anchorDate) : undefined,
      cadenceDays: input.cadenceDays,
      isRecurringAnnually: input.isRecurringAnnually,
    },
  });

  if (scheduleChanged) {
    await prisma.reminderInstance.deleteMany({ where: { cascadeId: id, sentAt: null } });
    const instances = computeFireDates(cascade.anchorDate, cascade.cadenceDays).map((fireAt) => ({ cascadeId: id, fireAt }));
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

  const instances = computeFireDates(nextAnchor, cascade.cadenceDays).map((fireAt) => ({ cascadeId, fireAt }));
  await prisma.reminderInstance.createMany({ data: instances });
}

const STALE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

// Polled by the scheduler (see scheduler.ts) — finds instances whose fireAt
// has passed and haven't been sent yet, sends them via ntfy, marks them sent.
// After sending, checks whether that was the last instance of a recurring
// cascade's cycle and, if so, queues up next year's instances automatically.
export async function processDueReminders(prisma: PrismaClient) {
  const due = await prisma.reminderInstance.findMany({
    // A reminder stays silent while what it belongs to (the person, goal or
    // calendar event) is sitting in Trash, or while the cascade itself is
    // archived; it resumes if that is restored/unarchived.
    where: {
      sentAt: null,
      fireAt: { lte: new Date() },
      cascade: {
        deletedAt: null,
        archivedAt: null,
        OR: [{ personId: null }, { person: { deletedAt: null } }],
        AND: [
          { OR: [{ goalId: null }, { goal: { deletedAt: null } }] },
          { OR: [{ calendarEventId: null }, { calendarEvent: { deletedAt: null } }] },
        ],
      },
    },
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
    if (!stale) await sendReminder("Saga Reminder", `${instance.cascade.title} — ${anchorLabel}`);
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

  return due.length;
}
