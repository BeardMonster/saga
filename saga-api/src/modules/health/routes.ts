import type { FastifyInstance } from "fastify";
import { ok, err } from "../../lib/envelope.js";

export default async function healthRoutes(server: FastifyInstance) {
  server.get("/health", async () => {
    return ok({ uptime: process.uptime() }, "Saga API is running");
  });

  server.get("/ready", async (_request, reply) => {
    try {
      await server.prisma.$queryRaw`SELECT 1`;
      return ok({ database: "connected" }, "Ready");
    } catch (error) {
      reply.code(503);
      return err("Database not reachable", 503);
    }
  });
}
