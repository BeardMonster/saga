import type { PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  return x;
}

// Candidates: open items on real to-do checklists — not the weekly grocery
// scan list (that's config, not a task) and not a free-form note. Items due
// today or overdue get first priority, since "the one thing" is most useful
// when it also catches what's actually due; if nothing's due, any open item
// is fair game.
async function pickRandomItem(prisma: PrismaClient, userId: string, excludeId?: string) {
  const baseWhere = {
    isComplete: false,
    deletedAt: null,
    checklist: { userId, kind: "generic" as const, completedAt: null, deletedAt: null },
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };

  const dueSoon = await prisma.checklistItem.findMany({
    where: { ...baseWhere, dueDate: { lte: endOfDay(new Date()) } },
    include: { checklist: { select: { id: true, name: true } } },
  });
  const pool =
    dueSoon.length > 0
      ? dueSoon
      : await prisma.checklistItem.findMany({ where: baseWhere, include: { checklist: { select: { id: true, name: true } } } });

  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function formatPick(pick: {
  id: string;
  checklistItem: { id: string; title: string; isComplete: boolean; checklist: { id: string; name: string } };
}) {
  return {
    id: pick.id,
    item: {
      id: pick.checklistItem.id,
      title: pick.checklistItem.title,
      isComplete: pick.checklistItem.isComplete,
      checklistId: pick.checklistItem.checklist.id,
      checklistName: pick.checklistItem.checklist.name,
    },
  };
}

const PICK_INCLUDE = { checklistItem: { include: { checklist: { select: { id: true, name: true } } } } } as const;

async function createPick(prisma: PrismaClient, userId: string, checklistItemId: string, pickedDate: Date) {
  const created = await prisma.dailyPick.create({ data: { userId, checklistItemId, pickedDate }, include: PICK_INCLUDE });
  return formatPick(created);
}

export async function getTodayPick(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  const today = startOfDay(new Date());

  const existing = await prisma.dailyPick.findFirst({
    where: { userId, pickedDate: today },
    orderBy: { createdAt: "desc" },
    include: PICK_INCLUDE,
  });
  // The referenced item can vanish out from under a stale pick (deleted
  // directly from its checklist) — treat that the same as never having
  // picked one today, rather than surfacing a broken row.
  if (existing && !existing.checklistItem.deletedAt) return formatPick(existing);

  const item = await pickRandomItem(prisma, userId);
  if (!item) return { id: null, item: null };
  return createPick(prisma, userId, item.id, today);
}

// Always makes a fresh pick for today, excluding whatever's currently
// showing — used by "give me a different one" and by "pick another" after
// finishing the first.
export async function shufflePick(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  const today = startOfDay(new Date());

  const current = await prisma.dailyPick.findFirst({ where: { userId, pickedDate: today }, orderBy: { createdAt: "desc" } });
  const item = await pickRandomItem(prisma, userId, current?.checklistItemId);
  if (!item) return { id: null, item: null };
  return createPick(prisma, userId, item.id, today);
}
