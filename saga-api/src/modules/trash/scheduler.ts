import type { FastifyInstance } from "fastify";
import { purgeExpired } from "./service.js";

// Once an hour is plenty for a 30-day retention window — this doesn't need
// reminder-polling's minute-level precision.
const POLL_INTERVAL_MS = 60 * 60 * 1000;

export function startTrashScheduler(server: FastifyInstance) {
  const timer = setInterval(async () => {
    try {
      const count = await purgeExpired(server.prisma);
      if (count > 0) {
        server.log.info(`Permanently purged ${count} trash item(s) past their 30-day retention`);
      }
    } catch (error) {
      server.log.error(error, "Trash purge scheduler tick failed");
    }
  }, POLL_INTERVAL_MS);

  server.addHook("onClose", () => clearInterval(timer));
}
