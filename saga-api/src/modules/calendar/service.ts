import type { PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";

export async function listEvents(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.calendarEvent.findMany({
    where: { userId, deletedAt: null },
    orderBy: { startAt: "asc" },
    include: { reminderCascades: { where: { deletedAt: null }, include: { instances: { orderBy: { fireAt: "asc" } } } } },
  });
}

export async function createEvent(
  prisma: PrismaClient,
  input: {
    title: string;
    startAt: string;
    endAt?: string;
    location?: string;
    recurrenceRule?: string;
    isAllDay?: boolean;
    isShared?: boolean;
  },
) {
  const userId = await getCurrentUserId(prisma);
  return prisma.calendarEvent.create({
    data: {
      userId,
      title: input.title,
      startAt: new Date(input.startAt),
      endAt: input.endAt ? new Date(input.endAt) : undefined,
      location: input.location,
      recurrenceRule: input.recurrenceRule,
      isAllDay: input.isAllDay ?? false,
      isShared: input.isShared ?? false,
    },
  });
}

export async function updateEvent(
  prisma: PrismaClient,
  id: string,
  input: Partial<{
    title: string;
    startAt: string;
    endAt: string;
    location: string;
    recurrenceRule: string;
    isAllDay: boolean;
    isShared: boolean;
  }>,
) {
  return prisma.calendarEvent.update({
    where: { id },
    data: {
      ...input,
      startAt: input.startAt ? new Date(input.startAt) : undefined,
      endAt: input.endAt ? new Date(input.endAt) : undefined,
    },
  });
}

// Soft delete — an event that owns a reminder cascade (see schema.prisma's
// note on CalendarEvent.reminderCascades) takes that cascade to Trash with
// it, so restoring the event brings its reminders back too.
export async function deleteEvent(prisma: PrismaClient, id: string) {
  const now = new Date();
  await prisma.reminderCascade.updateMany({ where: { calendarEventId: id }, data: { deletedAt: now } });
  return prisma.calendarEvent.update({ where: { id }, data: { deletedAt: now } });
}

export async function listDeletedEvents(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.calendarEvent.findMany({ where: { userId, deletedAt: { not: null } } });
}

export async function restoreEvent(prisma: PrismaClient, id: string) {
  await prisma.reminderCascade.updateMany({ where: { calendarEventId: id }, data: { deletedAt: null } });
  return prisma.calendarEvent.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteEvent(prisma: PrismaClient, id: string) {
  const cascades = await prisma.reminderCascade.findMany({ where: { calendarEventId: id }, select: { id: true } });
  for (const c of cascades) await prisma.reminderInstance.deleteMany({ where: { cascadeId: c.id } });
  await prisma.reminderCascade.deleteMany({ where: { calendarEventId: id } });
  return prisma.calendarEvent.delete({ where: { id } });
}
