import type { FastifyInstance } from "fastify";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";

export default async function broadcastRoutes(server: FastifyInstance) {
  server.get("/broadcasts", async () => {
    const broadcasts = await service.listBroadcasts(server.prisma);
    return ok(broadcasts);
  });

  server.post<{
    Body: { title: string; messageBody: string; channels: ("sms" | "discord")[]; recipientIds: string[] };
  }>("/broadcasts", async (request, reply) => {
    const { title, messageBody, channels, recipientIds } = request.body;
    if (!title?.trim() || !messageBody?.trim() || !channels?.length) {
      reply.code(400);
      return err("title, messageBody, and at least one channel are required", 400);
    }
    const broadcast = await service.createBroadcast(server.prisma, { title, messageBody, channels, recipientIds });
    reply.code(201);
    return ok(broadcast, "Broadcast drafted", 201);
  });

  server.post<{ Params: { id: string } }>("/broadcasts/:id/send", async (request, reply) => {
    try {
      const broadcast = await service.sendBroadcast(server.prisma, request.params.id);
      return ok(broadcast, "Broadcast sent");
    } catch (error) {
      reply.code(503);
      return err((error as Error).message, 503);
    }
  });

  server.delete<{ Params: { id: string } }>("/broadcasts/:id", async (request) => {
    await service.deleteBroadcast(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });
}
