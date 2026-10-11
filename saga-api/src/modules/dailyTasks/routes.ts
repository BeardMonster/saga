import type { FastifyInstance } from "fastify";
import { ok, err } from "../../lib/envelope.js";
import { isValidHHMM } from "../../lib/localDay.js";
import * as service from "./service.js";

export default async function dailyTaskRoutes(server: FastifyInstance) {
  server.get("/daily-tasks", async () => ok(await service.listDailyTasks(server.prisma)));

  server.post<{ Body: { title: string; daysOfWeek?: number[]; reminderTime?: string | null } }>("/daily-tasks", async (request, reply) => {
    const { title, reminderTime } = request.body ?? {};
    if (!title?.trim()) {
      reply.code(400);
      return err("title is required", 400);
    }
    if (reminderTime && !isValidHHMM(reminderTime)) {
      reply.code(400);
      return err('reminderTime must look like "08:00" (24-hour HH:MM)', 400);
    }
    reply.code(201);
    return ok(await service.createDailyTask(server.prisma, request.body), "Daily task added", 201);
  });

  server.patch<{ Body: { ids: string[] } }>("/daily-tasks/reorder", async (request, reply) => {
    if (!Array.isArray(request.body?.ids) || request.body.ids.length === 0) {
      reply.code(400);
      return err("ids is required", 400);
    }
    return ok(await service.reorderDailyTasks(server.prisma, request.body.ids), "Reordered");
  });

  server.patch<{ Params: { id: string }; Body: { title?: string; daysOfWeek?: number[]; reminderTime?: string | null } }>(
    "/daily-tasks/:id",
    async (request, reply) => {
      const { title, reminderTime } = request.body ?? {};
      if (title !== undefined && !title.trim()) {
        reply.code(400);
        return err("title cannot be empty", 400);
      }
      if (reminderTime && !isValidHHMM(reminderTime)) {
        reply.code(400);
        return err('reminderTime must look like "08:00" (24-hour HH:MM)', 400);
      }
      return ok(await service.updateDailyTask(server.prisma, request.params.id, request.body), "Saved");
    },
  );

  // POST (not PATCH) so the notification's Done button — which can only fire
  // a plain URL — can call it too.
  server.post<{ Params: { id: string } }>("/daily-tasks/:id/complete", async (request, reply) => {
    try {
      return ok(await service.completeDailyTask(server.prisma, request.params.id), "Done for today");
    } catch {
      reply.code(404);
      return err("Daily task not found", 404);
    }
  });

  server.post<{ Params: { id: string } }>("/daily-tasks/:id/uncomplete", async (request) =>
    ok(await service.uncompleteDailyTask(server.prisma, request.params.id), "Unchecked"),
  );

  server.delete<{ Params: { id: string } }>("/daily-tasks/:id", async (request) => {
    await service.deleteDailyTask(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });
}
