import type { FastifyInstance } from "fastify";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";

export default async function peopleRoutes(server: FastifyInstance) {
  server.get("/people", async () => {
    const people = await service.listPeople(server.prisma);
    return ok(people);
  });

  server.post<{
    Body: {
      name: string;
      relationship?: string;
      birthday?: string;
      birthdayYearKnown?: boolean;
      phone?: string;
      discordUserId?: string;
      notes?: string;
      preferences?: Record<string, unknown>;
    };
  }>("/people", async (request, reply) => {
    if (!request.body.name?.trim()) {
      reply.code(400);
      return err("name is required", 400);
    }
    const person = await service.createPerson(server.prisma, request.body);
    reply.code(201);
    return ok(person, "Person added", 201);
  });

  server.patch<{
    Params: { id: string };
    Body: Partial<{ name: string; relationship: string; notes: string; birthday: string | null; birthdayYearKnown: boolean; preferences: Record<string, unknown> }>;
  }>("/people/:id", async (request) => {
    const person = await service.updatePerson(server.prisma, request.params.id, request.body);
    return ok(person, "Person updated");
  });

  server.delete<{ Params: { id: string } }>("/people/:id", async (request) => {
    await service.deletePerson(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });

  server.patch<{ Body: { ids: string[] } }>("/people/reorder", async (request, reply) => {
    if (!Array.isArray(request.body.ids) || request.body.ids.length === 0) {
      reply.code(400);
      return err("ids is required", 400);
    }
    return ok(await service.reorderPeople(server.prisma, request.body.ids), "Reordered");
  });

}
