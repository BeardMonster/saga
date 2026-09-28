import type { FastifyInstance } from "fastify";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";

export default async function calendarRoutes(server: FastifyInstance) {
  server.get("/calendar/events", async () => {
    const events = await service.listEvents(server.prisma);
    return ok(events);
  });

  server.post<{
    Body: {
      title: string;
      startAt: string;
      endAt?: string;
      location?: string;
      recurrenceRule?: string;
      isAllDay?: boolean;
      isShared?: boolean;
    };
  }>("/calendar/events", async (request, reply) => {
    const { title, startAt } = request.body;
    if (!title?.trim() || !startAt) {
      reply.code(400);
      return err("title and startAt are required", 400);
    }
    const event = await service.createEvent(server.prisma, request.body);
    reply.code(201);
    return ok(event, "Event created", 201);
  });

  server.patch<{
    Params: { id: string };
    Body: Partial<{
      title: string;
      startAt: string;
      endAt: string;
      location: string;
      recurrenceRule: string;
      isAllDay: boolean;
      isShared: boolean;
    }>;
  }>("/calendar/events/:id", async (request) => {
    const event = await service.updateEvent(server.prisma, request.params.id, request.body);
    return ok(event, "Event updated");
  });

  server.delete<{ Params: { id: string } }>("/calendar/events/:id", async (request) => {
    await service.deleteEvent(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });
}
