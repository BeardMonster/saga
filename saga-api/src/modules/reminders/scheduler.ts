import type { FastifyInstance } from "fastify";
import { processDueReminders } from "./service.js";

const POLL_INTERVAL_MS = 60_000;

export function startReminderScheduler(server: FastifyInstance) {
  const timer = setInterval(async () => {
    try {
      const count = await processDueReminders(server.prisma);
      if (count > 0) {
        server.log.info(`Sent ${count} due reminder(s)`);
      }
    } catch (error) {
      server.log.error(error, "Reminder scheduler tick failed");
    }
  }, POLL_INTERVAL_MS);

  server.addHook("onClose", () => clearInterval(timer));
}
