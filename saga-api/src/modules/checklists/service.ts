import type { ChecklistKind, PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";

export async function listChecklists(prisma: PrismaClient, projectId?: string | null) {
  const userId = await getCurrentUserId(prisma);
  return prisma.checklist.findMany({
    // archivedAt: null — a past week's grocery list (see grocery/service.ts
    // startNewWeek) is a read-only history snapshot, never shown as a live
    // checklist anywhere.
    where: { userId, projectId: projectId === undefined ? undefined : projectId, deletedAt: null, archivedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { items: { where: { deletedAt: null }, orderBy: [{ isComplete: "asc" }, { position: "asc" }] } },
  });
}

// Drag-and-drop reordering: the client sends the checklist's new full
// order within its own context (standalone list or one project's list —
// same scoping the old swap-based moveChecklist used), and every checklist
// in that list gets re-indexed 0..n-1 in one transaction. `projectId` is
// passed through just to know which list to return afterward, not to
// re-scope the checklists themselves (the client already only sends ids
// from the one list it's showing).
export async function reorderChecklists(prisma: PrismaClient, projectId: string | null, checklistIds: string[]) {
  await prisma.$transaction(checklistIds.map((id, position) => prisma.checklist.update({ where: { id }, data: { position } })));
  return listChecklists(prisma, projectId);
}

export async function getChecklist(prisma: PrismaClient, id: string) {
  return prisma.checklist.findUnique({
    where: { id },
    include: { items: { where: { deletedAt: null }, orderBy: [{ isComplete: "asc" }, { position: "asc" }] } },
  });
}

export async function createChecklist(
  prisma: PrismaClient,
  input: { name: string; kind?: ChecklistKind; projectId?: string; description?: string; body?: string },
) {
  const userId = await getCurrentUserId(prisma);
  const last = await prisma.checklist.aggregate({
    where: { userId, projectId: input.projectId ?? null },
    _max: { position: true },
  });
  return prisma.checklist.create({
    data: {
      userId,
      name: input.name,
      kind: input.kind ?? "generic",
      projectId: input.projectId,
      description: input.description || undefined,
      body: input.body || undefined,
      position: (last._max.position ?? -1) + 1,
    },
  });
}

// "Make its own project": wraps a checklist in a brand-new project on the
// Projects page (the checklist becomes that project's first section).
export async function makeChecklistOwnProject(prisma: PrismaClient, id: string) {
  const userId = await getCurrentUserId(prisma);
  const checklist = await prisma.checklist.findUniqueOrThrow({ where: { id } });
  const last = await prisma.project.aggregate({ where: { userId }, _max: { position: true } });
  const project = await prisma.project.create({
    data: { userId, name: checklist.name, description: checklist.description, position: (last._max.position ?? -1) + 1 },
  });
  await prisma.checklist.update({ where: { id }, data: { projectId: project.id, position: 0, description: null } });
  return project;
}

export async function updateChecklist(
  prisma: PrismaClient,
  id: string,
  input: {
    name?: string;
    kind?: ChecklistKind;
    completed?: boolean;
    projectId?: string | null;
    description?: string | null;
    body?: string | null;
  },
) {
  const { completed, projectId, description, body, ...rest } = input;
  // An empty string means "erase it" — stored as null.
  const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v === "" ? null : v);
  const completedAt = completed === undefined ? undefined : completed ? new Date() : null;
  // Moving between the Checklists page (projectId null) and a project (or
  // between projects) lands the checklist at the end of its new list.
  let position: number | undefined;
  if (projectId !== undefined) {
    const userId = await getCurrentUserId(prisma);
    const last = await prisma.checklist.aggregate({ where: { userId, projectId }, _max: { position: true } });
    position = (last._max.position ?? -1) + 1;
  }
  return prisma.checklist.update({ where: { id }, data: { ...rest, completedAt, projectId, position, description: blankToNull(description), body: blankToNull(body) } });
}

export async function deleteChecklist(prisma: PrismaClient, id: string) {
  const now = new Date();
  await prisma.checklistItem.updateMany({ where: { checklistId: id }, data: { deletedAt: now } });
  return prisma.checklist.update({ where: { id }, data: { deletedAt: now } });
}

export async function listDeletedChecklists(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.checklist.findMany({ where: { userId, deletedAt: { not: null } } });
}

export async function restoreChecklist(prisma: PrismaClient, id: string) {
  await prisma.checklistItem.updateMany({ where: { checklistId: id }, data: { deletedAt: null } });
  return prisma.checklist.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteChecklist(prisma: PrismaClient, id: string) {
  await prisma.checklistItem.deleteMany({ where: { checklistId: id } });
  return prisma.checklist.delete({ where: { id } });
}

export async function addItem(prisma: PrismaClient, checklistId: string, title: string) {
  // max+1 rather than a count — a count would reuse an already-taken
  // position once any item in the checklist has ever been soft-deleted,
  // colliding with a still-live item's position.
  const last = await prisma.checklistItem.aggregate({ where: { checklistId }, _max: { position: true } });
  return prisma.checklistItem.create({
    data: { checklistId, title, position: (last._max.position ?? -1) + 1 },
  });
}

export async function updateItem(prisma: PrismaClient, itemId: string, input: { title?: string; checklistId?: string; isQuickWin?: boolean }) {
  return prisma.checklistItem.update({ where: { id: itemId }, data: input });
}

// Every open, hand-flagged "short and easy" item across real to-do
// checklists — the weekly grocery scan list and free-form notes aren't
// included, same reasoning as the daily pick. For a low-energy day: a
// filtered list, not a whole separate feature to learn.
export async function listQuickWins(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.checklistItem.findMany({
    where: {
      isQuickWin: true,
      isComplete: false,
      deletedAt: null,
      checklist: { userId, kind: "generic", completedAt: null, deletedAt: null },
    },
    include: { checklist: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

// For drag-and-drop reordering: the client sends the item's new full order
// within its own completion-status group — items are displayed incomplete-
// first (see listChecklists' orderBy), and reordering only makes visible
// sense within the same isComplete group — and every item in that list
// gets re-indexed 0..n-1 in one transaction.
export async function reorderItems(prisma: PrismaClient, checklistId: string, itemIds: string[]) {
  await prisma.$transaction(itemIds.map((id, position) => prisma.checklistItem.update({ where: { id }, data: { position } })));
  return getChecklist(prisma, checklistId);
}

// Unchecks every completed item on a checklist without deleting anything —
// for a checklist that gets reused as-is on a schedule (the weekly grocery
// list, a recurring chore list), rather than rebuilt from scratch each time.
export async function resetItems(prisma: PrismaClient, checklistId: string) {
  await prisma.checklistItem.updateMany({
    where: { checklistId, deletedAt: null, isComplete: true },
    data: { isComplete: false, completedAt: null },
  });
  return getChecklist(prisma, checklistId);
}

export async function toggleItem(prisma: PrismaClient, itemId: string) {
  const item = await prisma.checklistItem.findUniqueOrThrow({ where: { id: itemId } });
  return prisma.checklistItem.update({
    where: { id: itemId },
    data: {
      isComplete: !item.isComplete,
      completedAt: item.isComplete ? null : new Date(),
    },
  });
}

export async function deleteItem(prisma: PrismaClient, itemId: string) {
  return prisma.checklistItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });
}

export async function listDeletedChecklistItems(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.checklistItem.findMany({ where: { checklist: { userId }, deletedAt: { not: null } } });
}

export async function restoreChecklistItem(prisma: PrismaClient, itemId: string) {
  return prisma.checklistItem.update({ where: { id: itemId }, data: { deletedAt: null } });
}

export async function hardDeleteChecklistItem(prisma: PrismaClient, itemId: string) {
  return prisma.checklistItem.delete({ where: { id: itemId } });
}
