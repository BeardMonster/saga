import type { GroceryStoreSource, Prisma, PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";

// ── Weekly grocery-list rotation ───────────────────────────────────────
// Each week's grocery checklist is ARCHIVED, not reset in place: a still-
// unchecked item (probably a one-off you didn't get to) carries forward
// into the new week instead of silently disappearing, and every past week
// is kept indefinitely — a handful of KB per week, nothing worth deleting.
// GroceryCatalogItem (below) is a running-tally convenience on top of that
// full history, not a replacement for it.

const GROCERY_CHECKLIST_NAME = "Weekly Groceries";

async function getCurrentGroceryChecklist(prisma: PrismaClient, userId: string) {
  return prisma.checklist.findFirst({
    where: { userId, kind: "grocery", deletedAt: null, archivedAt: null },
    include: { items: { where: { deletedAt: null } } },
  });
}

async function recordInCatalog(prisma: PrismaClient, userId: string, items: { title: string; isComplete: boolean }[]) {
  const now = new Date();
  for (const item of items) {
    const name = item.title.trim();
    if (!name) continue;
    const nameKey = name.toLowerCase();
    await prisma.groceryCatalogItem.upsert({
      where: { userId_nameKey: { userId, nameKey } },
      create: {
        userId,
        nameKey,
        name,
        timesAppeared: 1,
        timesBought: item.isComplete ? 1 : 0,
        lastAddedAt: now,
        lastBoughtAt: item.isComplete ? now : null,
      },
      update: {
        name,
        timesAppeared: { increment: 1 },
        lastAddedAt: now,
        ...(item.isComplete ? { timesBought: { increment: 1 }, lastBoughtAt: now } : {}),
      },
    });
  }
}

// Archives whatever grocery checklist is currently active (if any), rolls
// its items into the durable catalog, then seeds a brand-new checklist from
// the current staples list plus anything left unchecked last week — merged
// by name (case-insensitive) so a staple that's also still-unbought only
// shows up once, not twice.
export async function startNewWeek(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  const current = await getCurrentGroceryChecklist(prisma, userId);

  if (current) {
    await recordInCatalog(prisma, userId, current.items);
    await prisma.checklist.update({ where: { id: current.id }, data: { archivedAt: new Date() } });
  }

  const staples = await prisma.shoppingListItem.findMany({ where: { userId, deletedAt: null }, orderBy: { position: "asc" } });
  const carried = current ? current.items.filter((i) => !i.isComplete) : [];

  const seen = new Set<string>();
  const seedTitles: string[] = [];
  for (const rawTitle of [...staples.map((s) => s.name), ...carried.map((i) => i.title)]) {
    const title = rawTitle.trim();
    const key = title.toLowerCase();
    if (title && !seen.has(key)) {
      seen.add(key);
      seedTitles.push(title);
    }
  }

  const checklist = await prisma.checklist.create({
    data: { userId, name: GROCERY_CHECKLIST_NAME, kind: "grocery", position: 0 },
  });
  if (seedTitles.length > 0) {
    await prisma.checklistItem.createMany({
      data: seedTitles.map((title, position) => ({ checklistId: checklist.id, title, position })),
    });
  }

  return prisma.checklist.findUnique({
    where: { id: checklist.id },
    include: { items: { orderBy: { position: "asc" } } },
  });
}

// The durable "how often do we actually buy this" list — covers staples
// and one-off items alike, since both just feed the same catalog.
export async function listCatalog(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.groceryCatalogItem.findMany({ where: { userId }, orderBy: [{ timesBought: "desc" }, { name: "asc" }] });
}

// ── Weekly price scan trigger ────────────────────────────────────────────
// The scanner service used to schedule itself (every 7 days from whenever
// its container last restarted) — that drifts away from an actual calendar
// day over time and could, on a restart, end up double-triggered against
// whatever this scheduler does. This is now the one place that decides
// "is a scan due": the scanner container itself no longer has a timer at
// all, it just does a scan when asked (a button click, or this).
const SCANNER_URL = process.env.GROCERY_SCANNER_URL ?? "http://host.docker.internal:8200";

export async function triggerScanIfDue(prisma: PrismaClient, boundary: Date): Promise<boolean> {
  const latestDeal = await prisma.groceryDeal.findFirst({ orderBy: { scannedAt: "desc" }, select: { scannedAt: true } });
  if (latestDeal && latestDeal.scannedAt >= boundary) return false;

  const res = await fetch(`${SCANNER_URL}/scan`, { method: "POST" });
  if (!res.ok && res.status !== 409) throw new Error(`Scanner returned ${res.status}`);
  return true;
}

// ── Stores ──────────────────────────────────────────────────────────────

export async function listStores(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.groceryStore.findMany({ where: { userId, deletedAt: null }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
}

export async function createStore(
  prisma: PrismaClient,
  input: { name: string; flippSlug?: string; source?: GroceryStoreSource; externalConfig?: Record<string, unknown> },
) {
  const userId = await getCurrentUserId(prisma);
  const last = await prisma.groceryStore.aggregate({ where: { userId }, _max: { position: true } });
  return prisma.groceryStore.create({
    data: {
      userId,
      name: input.name,
      flippSlug: input.flippSlug,
      source: input.source ?? "flipp",
      externalConfig: input.externalConfig as Prisma.InputJsonValue | undefined,
      position: (last._max.position ?? -1) + 1,
    },
  });
}

export async function updateStore(
  prisma: PrismaClient,
  id: string,
  input: Partial<{ name: string; flippSlug: string | null; source: GroceryStoreSource; externalConfig: Record<string, unknown> }>,
) {
  return prisma.groceryStore.update({
    where: { id },
    data: { ...input, externalConfig: input.externalConfig as Prisma.InputJsonValue | undefined },
  });
}

export async function deleteStore(prisma: PrismaClient, id: string) {
  return prisma.groceryStore.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listDeletedStores(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.groceryStore.findMany({ where: { userId, deletedAt: { not: null } } });
}

export async function restoreStore(prisma: PrismaClient, id: string) {
  return prisma.groceryStore.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteStore(prisma: PrismaClient, id: string) {
  await prisma.groceryDeal.deleteMany({ where: { storeId: id } });
  await prisma.systemAlert.deleteMany({ where: { storeId: id } });
  return prisma.groceryStore.delete({ where: { id } });
}

export async function reorderStores(prisma: PrismaClient, ids: string[]) {
  await prisma.$transaction(ids.map((id, position) => prisma.groceryStore.update({ where: { id }, data: { position } })));
  return listStores(prisma);
}

// ── Shopping list items ─────────────────────────────────────────────────

export async function listShoppingListItems(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.shoppingListItem.findMany({ where: { userId, deletedAt: null }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
}

export async function createShoppingListItem(prisma: PrismaClient, name: string) {
  const userId = await getCurrentUserId(prisma);
  const last = await prisma.shoppingListItem.aggregate({ where: { userId }, _max: { position: true } });
  return prisma.shoppingListItem.create({ data: { userId, name, position: (last._max.position ?? -1) + 1 } });
}

export async function updateShoppingListItem(prisma: PrismaClient, id: string, name: string) {
  return prisma.shoppingListItem.update({ where: { id }, data: { name } });
}

export async function deleteShoppingListItem(prisma: PrismaClient, id: string) {
  return prisma.shoppingListItem.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listDeletedShoppingListItems(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.shoppingListItem.findMany({ where: { userId, deletedAt: { not: null } } });
}

export async function restoreShoppingListItem(prisma: PrismaClient, id: string) {
  return prisma.shoppingListItem.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteShoppingListItem(prisma: PrismaClient, id: string) {
  await prisma.groceryDeal.deleteMany({ where: { shoppingListItemId: id } });
  return prisma.shoppingListItem.delete({ where: { id } });
}

export async function reorderShoppingListItems(prisma: PrismaClient, ids: string[]) {
  await prisma.$transaction(ids.map((id, position) => prisma.shoppingListItem.update({ where: { id }, data: { position } })));
  return listShoppingListItems(prisma);
}

// ── Deals (written by the saga-grocery-scanner service) ─────────────────

export async function recordDeal(
  prisma: PrismaClient,
  input: {
    shoppingListItemId: string;
    storeId: string;
    matchedProductName: string;
    price: number;
    unitPrice?: number;
    unit?: string;
    validFrom?: string;
    validTo?: string;
    sourceUrl?: string;
  },
) {
  return prisma.groceryDeal.create({
    data: {
      shoppingListItemId: input.shoppingListItemId,
      storeId: input.storeId,
      matchedProductName: input.matchedProductName,
      price: input.price,
      unitPrice: input.unitPrice,
      unit: input.unit,
      validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
      validTo: input.validTo ? new Date(input.validTo) : undefined,
      sourceUrl: input.sourceUrl,
    },
  });
}

// One comparison row per shopping-list item: every store's most recent
// scanned price for it (from the latest scan run, not stale history),
// sorted cheapest first so the best current deal is obvious at a glance.
export async function getComparison(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  const items = await prisma.shoppingListItem.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  const results = await Promise.all(
    items.map(async (item) => {
      const deals = await prisma.groceryDeal.findMany({
        where: { shoppingListItemId: item.id },
        include: { store: true },
        orderBy: { scannedAt: "desc" },
      });
      // Keep only each store's single most recent deal for this item.
      const latestPerStore = new Map<string, (typeof deals)[number]>();
      for (const deal of deals) {
        if (!latestPerStore.has(deal.storeId)) latestPerStore.set(deal.storeId, deal);
      }
      // Compare by the normalized per-unit rate when a deal has one (a
      // $/lb or $/oz figure is comparable across different package sizes);
      // only fall back to the raw container price when no unit rate was
      // captured for that specific deal. Sorting by raw price alone was
      // ranking a small, expensive-per-pound package above a larger,
      // genuinely cheaper-per-pound one just because its total happened
      // to be lower.
      const comparisonKey = (deal: (typeof deals)[number]) => Number(deal.unitPrice ?? deal.price);
      const sorted = Array.from(latestPerStore.values()).sort((a, b) => comparisonKey(a) - comparisonKey(b));
      return { shoppingListItem: item, deals: sorted };
    }),
  );

  return results;
}
