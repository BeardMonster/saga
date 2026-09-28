import type { PrismaClient } from "@prisma/client";
import { TRASH_TYPES } from "./registry.js";

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function listTrash(prisma: PrismaClient) {
  const results = await Promise.all(
    Object.entries(TRASH_TYPES).map(async ([type, config]) => {
      const rows = await config.listDeleted(prisma);
      return rows.map((row) => ({
        type,
        id: row.id,
        label: config.label,
        title: config.getTitle(row),
        deletedAt: row.deletedAt,
        purgeAt: row.deletedAt ? new Date(row.deletedAt.getTime() + TRASH_RETENTION_MS) : null,
      }));
    }),
  );
  return results.flat().sort((a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0));
}

function getConfig(type: string) {
  const config = TRASH_TYPES[type];
  if (!config) throw new Error(`Unknown trash type: ${type}`);
  return config;
}

export async function restoreFromTrash(prisma: PrismaClient, type: string, id: string) {
  return getConfig(type).restore(prisma, id);
}

// Permanent, immediate delete — used both by "delete forever" in the UI and
// by the 30-day auto-purge below. Cleans up any associated files (recipes'
// source photos/recordings) as part of actually removing the row.
export async function purgeOne(prisma: PrismaClient, type: string, id: string) {
  return getConfig(type).hardDelete(prisma, id);
}

// Polled by the scheduler (see scheduler.ts) — hard-deletes anything that's
// been sitting in Trash longer than the retention window.
export async function purgeExpired(prisma: PrismaClient): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);
  let purged = 0;
  for (const [type, config] of Object.entries(TRASH_TYPES)) {
    const rows = await config.listDeleted(prisma);
    for (const row of rows) {
      if (row.deletedAt && row.deletedAt.getTime() <= cutoff.getTime()) {
        await config.hardDelete(prisma, row.id);
        purged++;
      }
    }
  }
  return purged;
}
