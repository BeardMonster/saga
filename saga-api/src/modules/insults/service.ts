import type { PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";
import { runAiTask } from "../../lib/ai/taskRunner.js";
import { downloadAudioFromUrl } from "../../lib/ai/ytdlp.js";
import { transcribeAudio } from "../../lib/ai/whisper.js";

export async function listInsults(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.insult.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "desc" } });
}

// One line = one insult. Blank lines are dropped; exact duplicates of what's
// already saved are skipped rather than piling up (easy to end up with the
// same line twice when re-pasting from a video transcript you've half-added
// before).
export async function addLines(prisma: PrismaClient, rawText: string, sourceUrl?: string) {
  const userId = await getCurrentUserId(prisma);
  const lines = Array.from(new Set(rawText.split("\n").map((l) => l.trim()).filter(Boolean)));
  if (lines.length === 0) return [];

  const existing = await prisma.insult.findMany({ where: { userId, deletedAt: null, text: { in: lines } }, select: { text: true } });
  const existingSet = new Set(existing.map((e) => e.text));
  const toCreate = lines.filter((l) => !existingSet.has(l));
  if (toCreate.length === 0) return [];

  await prisma.insult.createMany({ data: toCreate.map((text) => ({ userId, text, sourceUrl })) });
  return prisma.insult.findMany({ where: { userId, text: { in: toCreate } }, orderBy: { createdAt: "desc" } });
}

export async function editInsult(prisma: PrismaClient, id: string, text: string) {
  return prisma.insult.update({ where: { id }, data: { text: text.trim() } });
}

export async function deleteInsult(prisma: PrismaClient, id: string) {
  return prisma.insult.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listDeletedInsults(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.insult.findMany({ where: { userId, deletedAt: { not: null } } });
}
export async function restoreInsult(prisma: PrismaClient, id: string) {
  return prisma.insult.update({ where: { id }, data: { deletedAt: null } });
}
export async function hardDeleteInsult(prisma: PrismaClient, id: string) {
  return prisma.insult.delete({ where: { id } });
}

function buildExtractionPrompt(transcript: string): string {
  return (
    `Below is a transcript of a video. Pull out every clever, witty put-down or insult line from it — the kind of ` +
    `sharp, creative wordplay someone would want to reuse later, said in fun rather than genuinely cruel. Skip plain ` +
    `swearing with no wit to it, and skip anything that isn't actually an insult (small talk, unrelated narration).\n\n` +
    `Return each one exactly as phrased in the transcript (light cleanup of filler words like "um" is fine).\n\n` +
    `Transcript:\n${transcript}\n\n` +
    // Ollama's structured-output mode (format: "json", used by runOllamaTask)
    // can only produce a top-level JSON OBJECT, never a bare array — asking
    // for "just a JSON array" here silently forced the model to invent its
    // own wrapper key (confirmed live: it came back as {"data": [...]})
    // which the old, narrower key list below didn't recognize, so every
    // real insult it found was thrown away. Asking for the exact shape we
    // actually parse fixes that at the source.
    `Respond with ONLY a JSON object of the shape { "insults": string[] }. If there's nothing worth pulling out, ` +
    `respond with { "insults": [] }.`
  );
}

// Accepts the exact shape asked for above, but stays defensive: if the model
// used a different key anyway, fall back to the first array-of-strings
// value anywhere in the object rather than silently discarding real results.
function normalizeInsultList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["insults", "items", "lines", "data", "result", "results"]) {
      if (Array.isArray(obj[key])) return (obj[key] as unknown[]).filter((x): x is string => typeof x === "string");
    }
    for (const value of Object.values(obj)) {
      if (Array.isArray(value) && value.every((x) => typeof x === "string")) return value as string[];
    }
  }
  return [];
}

// Downloads a link's audio, transcribes it locally, and asks the model to
// pick out the actual insults — added straight away rather than staged for
// review, same as the user asked. Nothing beyond the transcript's own text
// is invented, and any misfire is just as easy to delete from the list as
// anything typed in by hand.
export async function importFromVideo(prisma: PrismaClient, url: string) {
  const { audioPath, cleanup } = await downloadAudioFromUrl(url);
  try {
    const transcript = await transcribeAudio(audioPath);
    if (!transcript.trim()) return { addedCount: 0, insults: [] as unknown[], transcript };

    const raw = await runAiTask(prisma, "insult_extraction", buildExtractionPrompt(transcript));
    const lines = normalizeInsultList(raw);
    const created = await addLines(prisma, lines.join("\n"), url);
    return { addedCount: created.length, insults: created, transcript };
  } finally {
    await cleanup();
  }
}
