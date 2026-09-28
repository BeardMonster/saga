import type { FastifyInstance } from "fastify";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";

export default async function projectRoutes(server: FastifyInstance) {
  server.get("/projects", async () => {
    const projects = await service.listProjects(server.prisma);
    return ok(projects);
  });

  server.post<{ Body: { name: string; description?: string; includeChecklist?: boolean; page?: "projects" | "checklists" } }>("/projects", async (request, reply) => {
    const { name, description, includeChecklist, page } = request.body;
    if (!name?.trim()) {
      reply.code(400);
      return err("name is required", 400);
    }
    const project = await service.createProject(server.prisma, { name, description, includeChecklist, page });
    reply.code(201);
    return ok(project, "Project created", 201);
  });

  server.patch<{ Params: { id: string }; Body: { name?: string; description?: string | null; status?: "active" | "done" | "archived"; page?: "projects" | "checklists" } }>(
    "/projects/:id",
    async (request) => {
      const project = await service.updateProject(server.prisma, request.params.id, request.body);
      return ok(project, "Project updated");
    },
  );

  server.delete<{ Params: { id: string } }>("/projects/:id", async (request) => {
    await service.deleteProject(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });

  server.patch<{ Body: { ids: string[] } }>("/projects/reorder", async (request, reply) => {
    if (!Array.isArray(request.body.ids) || request.body.ids.length === 0) {
      reply.code(400);
      return err("ids is required", 400);
    }
    return ok(await service.reorderProjects(server.prisma, request.body.ids), "Reordered");
  });
}
