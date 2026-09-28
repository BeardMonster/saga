import type { GoalHorizon, GoalStatus, PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";

const HORIZON_ORDER: GoalHorizon[] = [
  "ten_year",
  "five_year",
  "three_year",
  "one_year",
  "six_month",
  "three_month",
  "one_month",
  "two_week",
  "one_week",
];

export async function listGoals(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  const goals = await prisma.goal.findMany({ where: { userId, deletedAt: null } });
  return goals.sort((a, b) => HORIZON_ORDER.indexOf(a.horizon) - HORIZON_ORDER.indexOf(b.horizon) || a.position - b.position);
}

// Goals are grouped by horizon first (see listGoals) — moving only makes
// sense relative to other goals sharing the same horizon.
export async function reorderGoals(prisma: PrismaClient, ids: string[]) {
  await prisma.$transaction(ids.map((id, position) => prisma.goal.update({ where: { id }, data: { position } })));
  return listGoals(prisma);
}

export async function createGoal(
  prisma: PrismaClient,
  input: { title: string; description?: string; horizon: GoalHorizon; horizonLabel?: string; targetDate?: string },
) {
  const userId = await getCurrentUserId(prisma);
  const last = await prisma.goal.aggregate({ where: { userId, horizon: input.horizon }, _max: { position: true } });
  return prisma.goal.create({
    data: {
      userId,
      title: input.title,
      description: input.description,
      horizon: input.horizon,
      horizonLabel: input.horizonLabel?.trim() || undefined,
      targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
      position: (last._max.position ?? -1) + 1,
    },
  });
}

export async function updateGoal(
  prisma: PrismaClient,
  id: string,
  input: { status?: GoalStatus; title?: string; description?: string; targetDate?: string | null },
) {
  const { targetDate, ...rest } = input;
  return prisma.goal.update({
    where: { id },
    data: { ...rest, targetDate: targetDate === undefined ? undefined : targetDate ? new Date(targetDate) : null },
  });
}

export async function deleteGoal(prisma: PrismaClient, id: string) {
  return prisma.goal.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listDeletedGoals(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.goal.findMany({ where: { userId, deletedAt: { not: null } } });
}

export async function restoreGoal(prisma: PrismaClient, id: string) {
  return prisma.goal.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteGoal(prisma: PrismaClient, id: string) {
  return prisma.goal.delete({ where: { id } });
}
