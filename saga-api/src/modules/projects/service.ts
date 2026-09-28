import type { PrismaClient, ProjectPage, ProjectStatus } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";

export async function listProjects(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.project.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { checklists: true } } },
  });
}

// Swaps this project's manual-order position with its immediate neighbor —
// simple and correct as long as positions are unique per user, which the
// backfill migration guarantees and every creation/move keeps true.
export async function reorderProjects(prisma: PrismaClient, ids: string[]) {
  await prisma.$transaction(ids.map((id, position) => prisma.project.update({ where: { id }, data: { position } })));
  return listProjects(prisma);
}

export async function createProject(
  prisma: PrismaClient,
  input: { name: string; description?: string; includeChecklist?: boolean; page?: ProjectPage },
) {
  const userId = await getCurrentUserId(prisma);
  const last = await prisma.project.aggregate({ where: { userId }, _max: { position: true } });
  const project = await prisma.project.create({
    data: {
      userId,
      name: input.name,
      description: input.description || undefined,
      page: input.page,
      position: (last._max.position ?? -1) + 1,
    },
  });
  if (input.includeChecklist) {
    await prisma.checklist.create({ data: { userId, projectId: project.id, name: "Checklist", position: 0 } });
  }
  return project;
}

export async function updateProject(
  prisma: PrismaClient,
  id: string,
  input: { name?: string; description?: string | null; status?: ProjectStatus; page?: ProjectPage },
) {
  if (input.page === "checklists") {
    const unwrapped = await unwrapSingleChecklistProject(prisma, id);
    if (unwrapped) return unwrapped;
  }
  const completedAt = input.status === undefined ? undefined : input.status === "done" ? new Date() : null;
  // An empty string means "erase it" — stored as null.
  const description = input.description === "" ? null : input.description;
  return prisma.project.update({ where: { id }, data: { ...input, description, completedAt } });
}

// Moving a project to the Checklists page when it's just a wrapper around ONE
// checklist (what "Make its own project" creates) turns it back into that
// plain checklist — the exact inverse — instead of leaving a project
// container that looks like a checklist but can't take items. The wrapper's
// name/description carry over to the checklist, and the emptied wrapper is
// removed. A project with several sections (or a text section) still moves
// as-is. Returns null when it doesn't apply.
async function unwrapSingleChecklistProject(prisma: PrismaClient, id: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id }, include: { checklists: true } });
  // Sections sitting in Trash still point at the project, so leave those alone.
  if (project.checklists.length !== 1 || project.checklists[0].deletedAt || project.checklists[0].kind === "note") return null;
  const checklist = project.checklists[0];
  const last = await prisma.checklist.aggregate({ where: { userId: project.userId, projectId: null }, _max: { position: true } });

  await prisma.$transaction([
    prisma.checklist.update({
      where: { id: checklist.id },
      data: {
        projectId: null,
        name: project.name,
        // Keep both if both exist, so nothing typed on either level is lost.
        description:
          project.description && checklist.description && project.description !== checklist.description
            ? `${project.description}

${checklist.description}`
            : (project.description ?? checklist.description),
        position: (last._max.position ?? -1) + 1,
      },
    }),
    prisma.project.delete({ where: { id } }),
  ]);
  return { ...project, checklists: undefined, unwrappedChecklistId: checklist.id };
}

// Soft delete — moves the project and everything it owns (checklists, their
// items) to Trash together, so restoring the project brings the whole
// subtree back rather than leaving orphaned children behind.
export async function deleteProject(prisma: PrismaClient, id: string) {
  const now = new Date();
  await prisma.checklistItem.updateMany({ where: { checklist: { projectId: id } }, data: { deletedAt: now } });
  await prisma.checklist.updateMany({ where: { projectId: id }, data: { deletedAt: now } });
  return prisma.project.update({ where: { id }, data: { deletedAt: now } });
}

export async function listDeletedProjects(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.project.findMany({ where: { userId, deletedAt: { not: null } } });
}

export async function restoreProject(prisma: PrismaClient, id: string) {
  await prisma.checklistItem.updateMany({ where: { checklist: { projectId: id } }, data: { deletedAt: null } });
  await prisma.checklist.updateMany({ where: { projectId: id }, data: { deletedAt: null } });
  return prisma.project.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteProject(prisma: PrismaClient, id: string) {
  await prisma.checklistItem.deleteMany({ where: { checklist: { projectId: id } } });
  await prisma.checklist.deleteMany({ where: { projectId: id } });
  return prisma.project.delete({ where: { id } });
}
