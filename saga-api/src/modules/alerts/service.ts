import type { PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";
import { sendReminder } from "../../lib/ntfy.js";

export async function listAlerts(prisma: PrismaClient, includeResolved: boolean) {
  const userId = await getCurrentUserId(prisma);
  return prisma.systemAlert.findMany({
    where: { userId, ...(includeResolved ? {} : { resolvedAt: null }) },
    include: { store: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createAlert(prisma: PrismaClient, input: { source: string; message: string; storeId?: string }) {
  const userId = await getCurrentUserId(prisma);
  const alert = await prisma.systemAlert.create({
    data: { userId, source: input.source, message: input.message, storeId: input.storeId },
  });
  // Push notifications are the actual "reach Brandon" channel here — he's
  // explicit that he isn't watching the site live, only checking in
  // periodically, so the in-app banner alone wouldn't do much. A push
  // failure (ntfy down, etc.) shouldn't make the alert itself fail to
  // record — the banner/API is the fallback if the push doesn't land.
  try {
    await sendReminder("Saga needs attention", input.message);
  } catch (error) {
    console.error("Couldn't send alert push notification:", (error as Error).message);
  }
  return alert;
}

export async function resolveAlert(prisma: PrismaClient, id: string) {
  return prisma.systemAlert.update({ where: { id }, data: { resolvedAt: new Date() } });
}
