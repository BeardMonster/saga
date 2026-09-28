import type { FastifyInstance } from "fastify";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";

export default async function insultRoutes(server: FastifyInstance) {
  server.get("/insults", async () => ok(await service.listInsults(server.prisma)));

  server.post<{ Body: { text: string } }>("/insults", async (request, reply) => {
    if (!request.body?.text?.trim()) {
      reply.code(400);
      return err("text is required", 400);
    }
    const created = await service.addLines(server.prisma, request.body.text);
    return ok(created, `Added ${created.length}`, 201);
  });

  server.patch<{ Params: { id: string }; Body: { text: string } }>("/insults/:id", async (request, reply) => {
    if (!request.body?.text?.trim()) {
      reply.code(400);
      return err("text is required", 400);
    }
    const updated = await service.editInsult(server.prisma, request.params.id, request.body.text);
    return ok(updated, "Saved");
  });

  server.delete<{ Params: { id: string } }>("/insults/:id", async (request) => {
    await service.deleteInsult(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });

  server.post<{ Body: { url: string } }>("/insults/from-video", async (request, reply) => {
    if (!request.body?.url?.trim()) {
      reply.code(400);
      return err("url is required", 400);
    }
    const result = await service.importFromVideo(server.prisma, request.body.url.trim());
    return ok(result, `Added ${result.addedCount}`);
  });
}
