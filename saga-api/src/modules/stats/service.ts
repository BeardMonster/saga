import type { PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";

// Home-page numbers, chosen deliberately to never go DOWN just because more
// work got added to the backlog — every stat here is a count of things
// finished, not a ratio against however many are still open. Adding ten new
// checklists this afternoon shouldn't make today look worse.

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date): Date {
  // Weeks start Monday.
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

async function completionDates(prisma: PrismaClient, userId: string, since?: Date): Promise<Date[]> {
  const [items, checklists, projects] = await Promise.all([
    prisma.checklistItem.findMany({
      where: { completedAt: since ? { gte: since } : { not: null }, checklist: { userId } },
      select: { completedAt: true },
    }),
    prisma.checklist.findMany({ where: { userId, completedAt: since ? { gte: since } : { not: null } }, select: { completedAt: true } }),
    prisma.project.findMany({ where: { userId, completedAt: since ? { gte: since } : { not: null } }, select: { completedAt: true } }),
  ]);
  return [...items, ...checklists, ...projects].map((r) => r.completedAt as Date);
}

// Consecutive days with at least one completion, counting back from today.
// Forgiving: one missed day anywhere in the run doesn't end the streak (a
// bad day happens) — a second miss does. This only ever reads completion
// timestamps that already exist; it isn't its own stored counter.
function computeStreak(allDates: Date[]): number {
  const activeDays = new Set(allDates.map((d) => startOfDay(d).getTime()));
  const today = startOfDay(new Date()).getTime();
  const DAY = 24 * 60 * 60 * 1000;

  // Nothing done today yet doesn't zero out a streak built on prior days —
  // start counting from the most recent active day, today or yesterday.
  let cursor = today;
  if (!activeDays.has(cursor)) {
    if (activeDays.has(cursor - DAY)) cursor -= DAY;
    else return 0;
  }

  let streak = 0;
  let graceUsed = false;
  for (;;) {
    if (activeDays.has(cursor)) {
      streak++;
      cursor -= DAY;
    } else if (!graceUsed) {
      graceUsed = true;
      cursor -= DAY;
    } else {
      break;
    }
  }
  return streak;
}

export interface HomeStats {
  completedToday: number;
  completedThisWeek: number;
  completedAllTime: number;
  streakDays: number;
  openChecklists: number;
  openProjects: number;
  activeGoals: number;
}

export async function getHomeStats(prisma: PrismaClient): Promise<HomeStats> {
  const userId = await getCurrentUserId(prisma);
  const now = new Date();

  const [today, thisWeek, allTime, openChecklists, openProjects, activeGoals] = await Promise.all([
    completionDates(prisma, userId, startOfDay(now)),
    completionDates(prisma, userId, startOfWeek(now)),
    // Only pulled once, going back far enough for a realistic streak, so a
    // years-old install isn't scanning its entire history on every load.
    completionDates(prisma, userId, new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000)),
    prisma.checklist.count({ where: { userId, deletedAt: null, completedAt: null } }),
    prisma.project.count({ where: { userId, deletedAt: null, completedAt: null } }),
    prisma.goal.count({ where: { userId, deletedAt: null, status: "active" } }),
  ]);

  // "All-time" as shown is the true lifetime count; the streak is computed
  // from the 120-day window fetched above (plenty for any realistic streak
  // length) rather than a second unbounded query.
  const allTimeCount = await prisma.$transaction([
    prisma.checklistItem.count({ where: { completedAt: { not: null }, checklist: { userId } } }),
    prisma.checklist.count({ where: { userId, completedAt: { not: null } } }),
    prisma.project.count({ where: { userId, completedAt: { not: null } } }),
  ]);

  return {
    completedToday: today.length,
    completedThisWeek: thisWeek.length,
    completedAllTime: allTimeCount.reduce((a, b) => a + b, 0),
    streakDays: computeStreak(allTime),
    openChecklists,
    openProjects,
    activeGoals,
  };
}

export interface TodayRecap {
  items: { title: string; checklistName: string }[];
  checklists: { name: string }[];
  projects: { name: string }[];
}

// The actual titles behind "completedToday" above — a count alone isn't a
// recap. Goals aren't included: Goal has no achievedAt timestamp (only a
// status), so there's no way to tell it was achieved specifically TODAY
// without a schema change, and goal wins already get their own big
// celebration in the moment.
export async function getTodayRecap(prisma: PrismaClient): Promise<TodayRecap> {
  const userId = await getCurrentUserId(prisma);
  const since = startOfDay(new Date());

  const [items, checklists, projects] = await Promise.all([
    prisma.checklistItem.findMany({
      where: { completedAt: { gte: since }, checklist: { userId } },
      select: { title: true, checklist: { select: { name: true } } },
      orderBy: { completedAt: "asc" },
    }),
    prisma.checklist.findMany({
      where: { userId, completedAt: { gte: since } },
      select: { name: true },
      orderBy: { completedAt: "asc" },
    }),
    prisma.project.findMany({
      where: { userId, completedAt: { gte: since } },
      select: { name: true },
      orderBy: { completedAt: "asc" },
    }),
  ]);

  return {
    items: items.map((i) => ({ title: i.title, checklistName: i.checklist.name })),
    checklists: checklists.map((c) => ({ name: c.name })),
    projects: projects.map((p) => ({ name: p.name })),
  };
}
