import type { FastifyInstance } from "fastify";
import { ok } from "../../lib/envelope.js";
import * as service from "./service.js";

export default async function trashRoutes(server: FastifyInstance) {
  server.get("/trash", async () => ok(await service.listTrash(server.prisma)));

  server.post<{ Params: { type: string; id: string } }>("/trash/:type/:id/restore", async (request) => {
    const restored = await service.restoreFromTrash(server.prisma, request.params.type, request.params.id);
    return ok(restored, "Restored");
  });

  server.delete<{ Params: { type: string; id: string } }>("/trash/:type/:id", async (request) => {
    await service.purgeOne(server.prisma, request.params.type, request.params.id);
    return ok(null, "Deleted forever");
  });
}
