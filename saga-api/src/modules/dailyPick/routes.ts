import type { FastifyInstance } from "fastify";
import { ok } from "../../lib/envelope.js";
import * as service from "./service.js";

export default async function dailyPickRoutes(server: FastifyInstance) {
  server.get("/daily-pick", async () => ok(await service.getTodayPick(server.prisma)));
  server.post("/daily-pick/shuffle", async () => ok(await service.shufflePick(server.prisma), "Picked another"));
}
