import type { FastifyInstance } from "fastify";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";

export default async function reminderRoutes(server: FastifyInstance) {
  server.get("/reminders", async () => {
    const cascades = await service.listCascades(server.prisma);
    return ok(cascades);
  });

  server.post<{
    Body: {
      title: string;
      anchorDate: string;
      cadenceDays?: number[];
      goalId?: string;
      personId?: string;
      calendarEventId?: string;
      isRecurringAnnually?: boolean;
    };
  }>("/reminders", async (request, reply) => {
    const { title, anchorDate, goalId, personId } = request.body;
    if (!title?.trim() || !anchorDate) {
      reply.code(400);
      return err("title and anchorDate are required", 400);
    }
    const cascade = await service.createCascade(server.prisma, {
      ...request.body,
      subjectType: personId ? "person" : goalId ? "goal" : "freeform",
    });
    reply.code(201);
    return ok(cascade, "Reminder cascade created", 201);
  });

  server.patch<{
    Params: { id: string };
    Body: Partial<{ title: string; anchorDate: string; cadenceDays: number[]; isRecurringAnnually: boolean }>;
  }>("/reminders/:id", async (request) => {
    const cascade = await service.updateCascade(server.prisma, request.params.id, request.body);
    return ok(cascade, "Reminder cascade updated");
  });

  server.delete<{ Params: { id: string } }>("/reminders/:id", async (request) => {
    await service.deleteCascade(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });

  // Manual trigger for testing — the scheduler calls the same service
  // function automatically every minute (see scheduler.ts).
  server.post("/reminders/process-due", async () => {
    const count = await service.processDueReminders(server.prisma);
    return ok({ sent: count });
  });
}
