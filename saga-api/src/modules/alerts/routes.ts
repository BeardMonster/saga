import type { FastifyInstance } from "fastify";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";

export default async function alertRoutes(server: FastifyInstance) {
  server.get<{ Querystring: { all?: string } }>("/alerts", async (request) =>
    ok(await service.listAlerts(server.prisma, request.query.all === "true")),
  );

  // Called by background jobs (the grocery scanner today) when something
  // looks broken rather than just "no results this week" — not something
  // the web UI posts to directly.
  server.post<{ Body: { source: string; message: string; storeId?: string } }>("/alerts", async (request, reply) => {
    if (!request.body.source?.trim() || !request.body.message?.trim()) {
      reply.code(400);
      return err("source and message are required", 400);
    }
    const alert = await service.createAlert(server.prisma, request.body);
    reply.code(201);
    return ok(alert, "Alert recorded", 201);
  });

  server.patch<{ Params: { id: string } }>("/alerts/:id/resolve", async (request) =>
    ok(await service.resolveAlert(server.prisma, request.params.id), "Resolved"),
  );
}
