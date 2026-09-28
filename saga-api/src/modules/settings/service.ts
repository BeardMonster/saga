import type { AiProvider, PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";
import { getTaskSetting } from "../../lib/ai/taskRunner.js";
import { listOllamaModels } from "../../lib/ai/ollama.js";

// The task keys Settings shows. recipe_photo_vision_extract only runs when
// the recipe-photo cascade (inbox/service.ts) auto-escalates after local
// OCR reports low confidence — not a manually-picked strategy anymore.
const KNOWN_TASK_KEYS = [
  "inbox_text_triage",
  "recipe_photo_vision_extract",
  "recipe_photo_vision_extract_escalated",
  "recipe_photo_ocr",
  "recipe_photo_structure",
  "recipe_voice_structure",
  "recipe_allergen_scan",
  "insult_extraction",
  "grocery_receipt_vision_extract",
  "grocery_receipt_vision_extract_escalated",
] as const;

export async function listAiTaskSettings(prisma: PrismaClient) {
  const entries = await Promise.all(
    KNOWN_TASK_KEYS.map(async (taskKey) => ({ taskKey, ...(await getTaskSetting(prisma, taskKey)) })),
  );
  return entries;
}

export async function updateAiTaskSetting(
  prisma: PrismaClient,
  taskKey: string,
  input: { provider: AiProvider; ollamaModel?: string },
) {
  const userId = await getCurrentUserId(prisma);
  return prisma.aiTaskSetting.upsert({
    where: { userId_taskKey: { userId, taskKey } },
    create: { userId, taskKey, provider: input.provider, ollamaModel: input.ollamaModel },
    update: { provider: input.provider, ollamaModel: input.ollamaModel },
  });
}

const TOKEN_LIFETIME_DAYS = 365;

export function getClaudeCliTokenStatus() {
  const configured = Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN);
  const issuedAtRaw = process.env.CLAUDE_CODE_OAUTH_TOKEN_ISSUED_AT;
  if (!configured || !issuedAtRaw) {
    return { configured, issuedAt: null, expiresAt: null, daysRemaining: null };
  }

  const issuedAt = new Date(issuedAtRaw);
  const expiresAt = new Date(issuedAt);
  expiresAt.setDate(expiresAt.getDate() + TOKEN_LIFETIME_DAYS);

  const msRemaining = expiresAt.getTime() - Date.now();
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

  return {
    configured,
    issuedAt: issuedAtRaw,
    expiresAt: expiresAt.toISOString().slice(0, 10),
    daysRemaining,
  };
}

export { listOllamaModels };
