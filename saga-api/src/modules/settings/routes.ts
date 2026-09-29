import type { FastifyInstance } from "fastify";
import type { AiProvider } from "@prisma/client";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";
import { listTargetTypeInstructions, setTargetTypeInstructions } from "../inbox/targetTypes.js";

export default async function settingsRoutes(server: FastifyInstance) {
  server.get("/settings/ai-tasks", async () => ok(await service.listAiTaskSettings(server.prisma)));

  server.patch<{ Params: { taskKey: string }; Body: { provider: AiProvider; ollamaModel?: string } }>(
    "/settings/ai-tasks/:taskKey",
    async (request, reply) => {
      if (!request.body?.provider) {
        reply.code(400);
        return err("provider is required", 400);
      }
      const setting = await service.updateAiTaskSetting(server.prisma, request.params.taskKey, request.body);
      return ok(setting, "Setting updated");
    },
  );

  server.get("/settings/ollama-models", async (_request, reply) => {
    try {
      return ok(await service.listOllamaModels());
    } catch (error) {
      reply.code(502);
      return err(`Couldn't reach Ollama: ${(error as Error).message}`, 502);
    }
  });

  server.get("/settings/claude-cli-token", async () => ok(service.getClaudeCliTokenStatus()));

  // Same data whether reached from Settings or from Brain Dump directly.
  server.get("/settings/target-type-instructions", async () => ok(await listTargetTypeInstructions(server.prisma)));

  server.patch<{ Params: { targetType: string }; Body: { notes: string } }>(
    "/settings/target-type-instructions/:targetType",
    async (request, reply) => {
      try {
        const updated = await setTargetTypeInstructions(server.prisma, request.params.targetType, request.body?.notes ?? "");
        return ok(updated, "Saved");
      } catch (error) {
        reply.code(400);
        return err((error as Error).message, 400);
      }
    },
  );
}
