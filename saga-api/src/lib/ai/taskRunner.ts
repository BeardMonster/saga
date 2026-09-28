import type { AiProvider, PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../currentUser.js";
import { runOllamaTask } from "./ollama.js";
import { runClaudeTask } from "./claude.js";
import { runTesseractOcr } from "./tesseract.js";
import { runClaudeCliTask } from "./claudeCli.js";

// Sensible defaults per task, used until the user picks something in
// Settings. Ollama/local tools are the default for EVERY task — the paid
// Claude API (a separate Anthropic API key + per-token billing, not
// covered by any claude.ai/Claude Code subscription) is never a default
// anywhere.
const TASK_DEFAULTS: Record<string, { provider: AiProvider; ollamaModel?: string }> = {
  inbox_text_triage: { provider: "ollama", ollamaModel: "llama3.1:8b" },
  // Escalation-only: fires when a pasted note clearly has multiple lines but
  // the local model collapsed them into a single item anyway (confirmed via
  // real testing — llama3.1:8b reliably fails to split even an unambiguous
  // 3-line list despite an explicit instruction + worked example).
  // qwen3-vl:4b pulled specifically for this — genuinely reads a real photo
  // correctly (confirmed against a live recipe card), so this now runs
  // fully local first. Cursive is still the one thing no local vision model
  // does reliably, which is what recipe_photo_vision_extract_escalated is
  // for below.
  recipe_photo_vision_extract: { provider: "ollama", ollamaModel: "qwen3-vl:4b" },
  // Escalation-only: fires when the local vision model comes back with
  // essentially nothing (empty ingredients) — the honest "I can't read
  // this" signature, same idea as inbox_text_triage_escalated.
  recipe_photo_vision_extract_escalated: { provider: "claude_cli" },
  recipe_photo_ocr: { provider: "tesseract" },
  recipe_photo_structure: { provider: "ollama", ollamaModel: "llama3.1:8b" },
  recipe_voice_structure: { provider: "ollama", ollamaModel: "llama3.1:8b" },
  recipe_allergen_scan: { provider: "ollama", ollamaModel: "llama3.1:8b" },
  insult_extraction: { provider: "ollama", ollamaModel: "llama3.1:8b" },
  // Same reasoning as recipe_photo_vision_extract — a real photo (lighting,
  // skew, receipt curl) needs a genuine vision model, not OCR-then-guess.
  grocery_receipt_vision_extract: { provider: "ollama", ollamaModel: "qwen3-vl:4b" },
  grocery_receipt_vision_extract_escalated: { provider: "claude_cli" },
};
const FALLBACK_DEFAULT = { provider: "ollama" as AiProvider, ollamaModel: "llama3.1:8b" };

export async function getTaskSetting(prisma: PrismaClient, taskKey: string) {
  const userId = await getCurrentUserId(prisma);
  const setting = await prisma.aiTaskSetting.findUnique({ where: { userId_taskKey: { userId, taskKey } } });
  if (setting) return { provider: setting.provider, ollamaModel: setting.ollamaModel ?? undefined };
  return TASK_DEFAULTS[taskKey] ?? FALLBACK_DEFAULT;
}

// The single call site every AI-assisted feature goes through — which
// model actually runs a task is a per-user Settings choice, not something
// hardcoded at each call site.
export async function runAiTask(prisma: PrismaClient, taskKey: string, prompt: string, imagesBase64?: string[]): Promise<unknown> {
  const { provider, ollamaModel } = await getTaskSetting(prisma, taskKey);

  if (provider === "claude") return runClaudeTask(prompt, imagesBase64);
  if (provider === "claude_cli") return runClaudeCliTask(prompt, imagesBase64);
  if (provider === "tesseract") {
    throw new Error(`Task "${taskKey}" is configured for tesseract, which takes an image path directly — call runTesseractOcr, not runAiTask.`);
  }
  return runOllamaTask(ollamaModel ?? "llama3.1:8b", prompt, imagesBase64);
}
