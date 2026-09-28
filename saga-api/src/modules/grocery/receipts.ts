import type { PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";

// ── Matching ──────────────────────────────────────────────────────────────
// Two layers, tried in order, same idea Brandon described: a per-store
// learned dictionary for the cryptic stuff ("CHKN BRST FP" always means the
// same thing at Aldi once you've confirmed it once), falling back to a
// plain text match that already gets generic items right on the first try
// ("STRAWBERRIES 1LB" obviously contains "Strawberries") without needing
// anything learned at all.

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Whichever known name overlaps the raw text most specifically wins — a
// longer, more specific match beats a short coincidental one.
function bestFuzzyMatch(rawText: string, candidates: string[]): string | null {
  const norm = normalize(rawText);
  if (!norm) return null;
  let best: { name: string; score: number } | null = null;
  for (const candidate of candidates) {
    const candNorm = normalize(candidate);
    if (!candNorm || candNorm.length < 4) continue; // too short to mean anything on its own
    if (norm === candNorm || norm.includes(candNorm) || candNorm.includes(norm)) {
      if (!best || candNorm.length > best.score) best = { name: candidate, score: candNorm.length };
    }
  }
  return best?.name ?? null;
}

export async function matchStore(prisma: PrismaClient, userId: string, storeNameRaw: string | null): Promise<string | null> {
  if (!storeNameRaw) return null;
  const stores = await prisma.groceryStore.findMany({ where: { userId, deletedAt: null } });
  const match = bestFuzzyMatch(storeNameRaw, stores.map((s) => s.name));
  return match ? (stores.find((s) => s.name === match)?.id ?? null) : null;
}

// Everything worth suggesting as a match: this week's actual checklist
// (open items, most likely to be what a fresh receipt is for) plus the
// full historical catalog (staples and one-off items alike). Deliberately
// NOT limited to just staples or just this week — see the design
// discussion this was built from.
export async function buildCandidatePool(prisma: PrismaClient, userId: string): Promise<string[]> {
  const [checklist, catalog] = await Promise.all([
    prisma.checklist.findFirst({
      where: { userId, kind: "grocery", deletedAt: null, archivedAt: null },
      include: { items: { where: { deletedAt: null } } },
    }),
    prisma.groceryCatalogItem.findMany({ where: { userId }, select: { name: true } }),
  ]);
  const names = new Set<string>();
  for (const item of checklist?.items ?? []) names.add(item.title);
  for (const c of catalog) names.add(c.name);
  return Array.from(names);
}

export async function matchItemName(prisma: PrismaClient, userId: string, storeId: string | null, rawText: string): Promise<string | null> {
  const rawTextKey = normalize(rawText);
  if (storeId && rawTextKey) {
    const alias = await prisma.groceryReceiptItemAlias.findUnique({ where: { userId_storeId_rawTextKey: { userId, storeId, rawTextKey } } });
    if (alias) return alias.matchedName;
  }
  const pool = await buildCandidatePool(prisma, userId);
  return bestFuzzyMatch(rawText, pool);
}

// ── Turning a raw AI extraction into a reviewable proposal ─────────────────

export interface RawReceiptExtraction {
  storeName: string | null;
  purchasedAt: string | null;
  totalAmount: number | null;
  items: { rawText: string; price: number }[];
}

export async function resolveReceiptMatches(prisma: PrismaClient, userId: string, raw: RawReceiptExtraction) {
  const storeId = await matchStore(prisma, userId, raw.storeName);
  const items = await Promise.all(
    (raw.items ?? []).map(async (item) => ({
      rawText: item.rawText,
      price: item.price,
      matchedName: await matchItemName(prisma, userId, storeId, item.rawText),
    })),
  );
  return { storeId, storeNameRaw: raw.storeName, purchasedAt: raw.purchasedAt, totalAmount: raw.totalAmount, items };
}

// ── Confirming a reviewed receipt ───────────────────────────────────────

interface ConfirmReceiptInput {
  storeId?: string | null;
  storeNameRaw?: string | null;
  purchasedAt?: string | null;
  totalAmount?: number | null;
  imagePath: string;
  items: { rawText: string; price: number; matchedName?: string | null }[];
}

// Saves the receipt + its items, teaches the per-store alias table whatever
// was confirmed (including an obvious fuzzy-matched generic item — it's
// just as valid a confirmation as one that needed a manual pick), and closes
// the loop on the current grocery checklist: a matched item that's still
// open gets checked off; a matched item not on the list at all gets added
// already-checked, so it still shows up as bought and still reaches the
// catalog when this week archives. Unmatched items are just recorded on the
// receipt — no guess is invented for them.
export async function confirmReceipt(prisma: PrismaClient, input: ConfirmReceiptInput) {
  const userId = await getCurrentUserId(prisma);

  const receipt = await prisma.groceryReceipt.create({
    data: {
      userId,
      storeId: input.storeId || undefined,
      storeNameRaw: input.storeNameRaw || undefined,
      purchasedAt: input.purchasedAt ? new Date(input.purchasedAt) : undefined,
      totalAmount: input.totalAmount ?? undefined,
      imagePath: input.imagePath,
    },
  });

  await prisma.groceryReceiptItem.createMany({
    data: input.items.map((item, position) => ({
      receiptId: receipt.id,
      rawText: item.rawText,
      matchedName: item.matchedName || undefined,
      price: item.price,
      position,
    })),
  });

  const checklist = await prisma.checklist.findFirst({
    where: { userId, kind: "grocery", deletedAt: null, archivedAt: null },
    include: { items: { where: { deletedAt: null } } },
  });

  for (const item of input.items) {
    const matchedName = item.matchedName?.trim();
    if (!matchedName) continue;

    if (input.storeId) {
      await prisma.groceryReceiptItemAlias.upsert({
        where: { userId_storeId_rawTextKey: { userId, storeId: input.storeId, rawTextKey: normalize(item.rawText) } },
        create: { userId, storeId: input.storeId, rawTextKey: normalize(item.rawText), matchedName },
        update: { matchedName },
      });
    }

    if (checklist) {
      const existing = checklist.items.find((i) => i.title.trim().toLowerCase() === matchedName.toLowerCase());
      if (existing) {
        if (!existing.isComplete) {
          await prisma.checklistItem.update({ where: { id: existing.id }, data: { isComplete: true, completedAt: new Date() } });
        }
      } else {
        const last = await prisma.checklistItem.aggregate({ where: { checklistId: checklist.id }, _max: { position: true } });
        const created = await prisma.checklistItem.create({
          data: {
            checklistId: checklist.id,
            title: matchedName,
            isComplete: true,
            completedAt: new Date(),
            position: (last._max.position ?? -1) + 1,
          },
        });
        // Keep this pass consistent if the same item appears twice on one receipt.
        checklist.items.push(created);
      }
    }
  }

  return prisma.groceryReceipt.findUnique({ where: { id: receipt.id }, include: { items: true, store: true } });
}

export async function listReceipts(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.groceryReceipt.findMany({
    where: { userId, deletedAt: null },
    include: { items: true, store: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}
