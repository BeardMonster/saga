import type { FastifyInstance } from "fastify";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";

export default async function checklistRoutes(server: FastifyInstance) {
  server.get<{ Querystring: { projectId?: string; standalone?: string } }>("/checklists", async (request) => {
    const checklists = await service.listChecklists(server.prisma, request.query.standalone === "true" ? null : request.query.projectId);
    return ok(checklists);
  });

  server.get<{ Params: { id: string } }>("/checklists/:id", async (request, reply) => {
    const checklist = await service.getChecklist(server.prisma, request.params.id);
    if (!checklist) {
      reply.code(404);
      return err("Checklist not found", 404);
    }
    return ok(checklist);
  });

  server.post<{ Body: { name: string; kind?: "generic" | "grocery" | "note"; projectId?: string; description?: string; body?: string } }>(
    "/checklists",
    async (request, reply) => {
      const { name, kind, projectId, description, body } = request.body;
      if (!name?.trim()) {
        reply.code(400);
        return err("name is required", 400);
      }
      const checklist = await service.createChecklist(server.prisma, { name, kind, projectId, description, body });
      reply.code(201);
      return ok(checklist, "Checklist created", 201);
    },
  );

  server.post<{ Params: { id: string } }>("/checklists/:id/make-project", async (request) => {
    const project = await service.makeChecklistOwnProject(server.prisma, request.params.id);
    return ok(project, "Moved to its own project");
  });

  server.post<{ Params: { id: string } }>("/checklists/:id/reset", async (request) => {
    const checklist = await service.resetItems(server.prisma, request.params.id);
    return ok(checklist, "Reset for next time");
  });

  server.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      kind?: "generic" | "grocery" | "note";
      completed?: boolean;
      projectId?: string | null;
      description?: string | null;
      body?: string | null;
      includeOnHome?: boolean;
      isPinned?: boolean;
    };
  }>(
    "/checklists/:id",
    async (request) => {
      const checklist = await service.updateChecklist(server.prisma, request.params.id, request.body);
      return ok(checklist, "Checklist updated");
    },
  );

  server.delete<{ Params: { id: string } }>("/checklists/:id", async (request) => {
    await service.deleteChecklist(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });

  server.patch<{ Body: { projectId: string | null; checklistIds: string[] } }>(
    "/checklists/reorder",
    async (request, reply) => {
      if (!Array.isArray(request.body.checklistIds) || request.body.checklistIds.length === 0) {
        reply.code(400);
        return err("checklistIds is required", 400);
      }
      const checklists = await service.reorderChecklists(server.prisma, request.body.projectId ?? null, request.body.checklistIds);
      return ok(checklists, "Reordered");
    },
  );

  server.post<{ Params: { id: string }; Body: { title: string } }>(
    "/checklists/:id/items",
    async (request, reply) => {
      if (!request.body.title?.trim()) {
        reply.code(400);
        return err("title is required", 400);
      }
      const item = await service.addItem(server.prisma, request.params.id, request.body.title);
      reply.code(201);
      return ok(item, "Item added", 201);
    },
  );

  server.patch<{ Params: { id: string; itemId: string } }>(
    "/checklists/:id/items/:itemId/toggle",
    async (request) => {
      const item = await service.toggleItem(server.prisma, request.params.itemId);
      return ok(item, "Item updated");
    },
  );

  server.get("/checklists/quick-wins", async () => ok(await service.listQuickWins(server.prisma)));

  server.patch<{ Params: { id: string; itemId: string }; Body: { title?: string; checklistId?: string; isQuickWin?: boolean } }>(
    "/checklists/:id/items/:itemId",
    async (request, reply) => {
      if (request.body.title !== undefined && !request.body.title.trim()) {
        reply.code(400);
        return err("title cannot be empty", 400);
      }
      const item = await service.updateItem(server.prisma, request.params.itemId, request.body);
      return ok(item, "Item updated");
    },
  );

  server.delete<{ Params: { id: string; itemId: string } }>(
    "/checklists/:id/items/:itemId",
    async (request) => {
      await service.deleteItem(server.prisma, request.params.itemId);
      return ok(null, "Moved to Trash");
    },
  );

  server.patch<{ Params: { id: string }; Body: { itemIds: string[] } }>(
    "/checklists/:id/items/reorder",
    async (request, reply) => {
      if (!Array.isArray(request.body.itemIds) || request.body.itemIds.length === 0) {
        reply.code(400);
        return err("itemIds is required", 400);
      }
      const checklist = await service.reorderItems(server.prisma, request.params.id, request.body.itemIds);
      return ok(checklist, "Reordered");
    },
  );
}
