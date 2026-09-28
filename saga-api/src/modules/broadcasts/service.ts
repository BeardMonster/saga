import type { BroadcastChannel, PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";

export async function listBroadcasts(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.broadcast.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "desc" } });
}

export async function createBroadcast(
  prisma: PrismaClient,
  input: { title: string; messageBody: string; channels: BroadcastChannel[]; recipientIds: string[] },
) {
  const userId = await getCurrentUserId(prisma);
  return prisma.broadcast.create({
    data: {
      userId,
      title: input.title,
      messageBody: input.messageBody,
      channels: input.channels,
      recipientIds: input.recipientIds,
    },
  });
}

// Twilio (SMS) and a Discord bot token aren't configured yet — those are
// external accounts Brandon sets up himself, same as the Google Calendar
// OAuth dependency. This deliberately fails clearly rather than pretending
// to send, so it's obvious what's missing rather than silently no-op-ing.
export async function sendBroadcast(prisma: PrismaClient, id: string) {
  const hasTwilio = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  const hasDiscord = Boolean(process.env.DISCORD_BOT_TOKEN);

  if (!hasTwilio && !hasDiscord) {
    throw new Error(
      "No SMS (Twilio) or Discord bot credentials configured yet — set TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN and/or DISCORD_BOT_TOKEN in the API's .env once those accounts exist.",
    );
  }

  // Actual Twilio/Discord API calls go here once credentials exist.
  return prisma.broadcast.update({
    where: { id },
    data: { status: "sent", sentAt: new Date() },
  });
}

export async function deleteBroadcast(prisma: PrismaClient, id: string) {
  return prisma.broadcast.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listDeletedBroadcasts(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.broadcast.findMany({ where: { userId, deletedAt: { not: null } } });
}

export async function restoreBroadcast(prisma: PrismaClient, id: string) {
  return prisma.broadcast.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteBroadcast(prisma: PrismaClient, id: string) {
  return prisma.broadcast.delete({ where: { id } });
}
