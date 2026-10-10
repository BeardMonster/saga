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
      fireTime?: string;
    };
  }>("/reminders", async (request, reply) => {
    const { title, anchorDate, goalId, personId, fireTime } = request.body;
    if (!title?.trim() || !anchorDate) {
      reply.code(400);
      return err("title and anchorDate are required", 400);
    }
    if (fireTime !== undefined && !service.isValidFireTime(fireTime)) {
      reply.code(400);
      return err('fireTime must look like "09:00" (24-hour HH:MM)', 400);
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
    Body: Partial<{ title: string; anchorDate: string; cadenceDays: number[]; isRecurringAnnually: boolean; fireTime: string }>;
  }>("/reminders/:id", async (request, reply) => {
    if (request.body.fireTime !== undefined && !service.isValidFireTime(request.body.fireTime)) {
      reply.code(400);
      return err('fireTime must look like "09:00" (24-hour HH:MM)', 400);
    }
    const cascade = await service.updateCascade(server.prisma, request.params.id, request.body);
    return ok(cascade, "Reminder cascade updated");
  });

  // Fired reminders that still need a decision — snoozed ones (always) plus
  // anything from the last couple of days nobody's touched.
  server.get("/reminders/open", async () => ok(await service.listOpenInstances(server.prisma)));

  // Snooze = keep coming back until Done (see processDueReminders). Takes
  // ?minutes=60 / ?tomorrow=1 as well as a JSON body, because ntfy's phone
  // "http" action buttons can only call a plain URL.
  server.post<{ Params: { id: string }; Querystring: { minutes?: string; tomorrow?: string }; Body: { minutes?: number; tomorrow?: boolean } | undefined }>(
    "/reminders/instances/:id/snooze",
    async (request, reply) => {
      const minutes = Number(request.body?.minutes ?? request.query.minutes ?? 60);
      const tomorrow = request.body?.tomorrow ?? request.query.tomorrow === "1";
      try {
        const instance = await service.snoozeInstance(server.prisma, request.params.id, { minutes: Number.isFinite(minutes) ? minutes : 60, tomorrow });
        return ok(instance, "Snoozed — it'll keep coming back until you mark it done");
      } catch (error) {
        // P2025 = that reminder doesn't exist; anything else is "already done".
        const status = (error as { code?: string }).code === "P2025" ? 404 : 409;
        reply.code(status);
        return err(status === 404 ? "Reminder not found" : (error as Error).message, status);
      }
    },
  );

  server.post<{ Params: { id: string } }>("/reminders/instances/:id/done", async (request, reply) => {
    try {
      return ok(await service.completeInstance(server.prisma, request.params.id), "Marked done");
    } catch (error) {
      reply.code(404);
      return err((error as Error).message, 404);
    }
  });

  server.delete<{ Params: { id: string } }>("/reminders/:id", async (request) => {
    await service.deleteCascade(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });

  server.get("/reminders/archived", async () => {
    const cascades = await service.listArchivedCascades(server.prisma);
    return ok(cascades);
  });

  server.post<{ Params: { id: string } }>("/reminders/:id/archive", async (request) => {
    const cascade = await service.archiveCascade(server.prisma, request.params.id);
    return ok(cascade, "Archived");
  });

  server.post<{ Params: { id: string } }>("/reminders/:id/unarchive", async (request) => {
    const cascade = await service.unarchiveCascade(server.prisma, request.params.id);
    return ok(cascade, "Restored");
  });

  // Manual trigger for testing — the scheduler calls the same service
  // function automatically every minute (see scheduler.ts).
  server.post("/reminders/process-due", async () => {
    const count = await service.processDueReminders(server.prisma);
    return ok({ sent: count });
  });
}
