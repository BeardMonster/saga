import type { FastifyInstance } from "fastify";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";

const VALID_HORIZONS = ["ten_year", "five_year", "three_year", "one_year", "six_month", "three_month", "one_month", "two_week", "one_week"];

export default async function goalRoutes(server: FastifyInstance) {
  server.get("/goals", async () => {
    const goals = await service.listGoals(server.prisma);
    return ok(goals);
  });

  server.post<{ Body: { title: string; description?: string; horizon: string; horizonLabel?: string; targetDate?: string } }>(
    "/goals",
    async (request, reply) => {
      const { title, description, horizon, horizonLabel, targetDate } = request.body;
      if (!title?.trim()) {
        reply.code(400);
        return err("title is required", 400);
      }
      if (!VALID_HORIZONS.includes(horizon)) {
        reply.code(400);
        return err(`horizon must be one of: ${VALID_HORIZONS.join(", ")}`, 400);
      }
      const goal = await service.createGoal(server.prisma, {
        title,
        description,
        horizon: horizon as any,
        horizonLabel,
        targetDate,
      });
      reply.code(201);
      return ok(goal, "Goal created", 201);
    },
  );

  server.patch<{ Params: { id: string }; Body: { status?: "active" | "achieved" | "abandoned"; title?: string; description?: string; targetDate?: string | null } }>(
    "/goals/:id",
    async (request) => {
      const goal = await service.updateGoal(server.prisma, request.params.id, request.body);
      return ok(goal, "Goal updated");
    },
  );

  server.delete<{ Params: { id: string } }>("/goals/:id", async (request) => {
    await service.deleteGoal(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });

  server.patch<{ Body: { ids: string[] } }>("/goals/reorder", async (request, reply) => {
    if (!Array.isArray(request.body.ids) || request.body.ids.length === 0) {
      reply.code(400);
      return err("ids is required", 400);
    }
    return ok(await service.reorderGoals(server.prisma, request.body.ids), "Reordered");
  });
}
