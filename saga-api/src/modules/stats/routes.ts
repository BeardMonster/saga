import type { FastifyInstance } from "fastify";
import { ok } from "../../lib/envelope.js";
import * as service from "./service.js";

export default async function statsRoutes(server: FastifyInstance) {
  server.get("/stats/home", async () => ok(await service.getHomeStats(server.prisma)));
}
