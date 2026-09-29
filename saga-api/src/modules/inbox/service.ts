import { readFile, unlink } from "node:fs/promises";
import type { PrismaClient, Prisma } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";
import { runAiTask } from "../../lib/ai/taskRunner.js";
import { runTesseractOcr, getTesseractConfidence } from "../../lib/ai/tesseract.js";
import { extractAudioTrack } from "../../lib/ai/ffmpeg.js";
import { transcribeAudio } from "../../lib/ai/whisper.js";
import { sendReminder } from "../../lib/ntfy.js";
import { parseKeepNotes, type ParsedNote, type ParsedItem } from "../personNotes/importParser.js";
import { resolveReceiptMatches, type RawReceiptExtraction } from "../grocery/receipts.js";
import { TARGET_TYPES, describeTargetTypesForPrompt, type TargetType } from "./targetTypes.js";

// Below this mean OCR confidence (0-100, Tesseract's own per-word score),
// the local OCR+text-model path is treated as unreliable — almost always
// means cursive/messy handwriting rather than a printed card — and the
// pipeline escalates straight to Claude instead of structuring garbage text.
const OCR_CONFIDENCE_THRESHOLD = 60;

async function appendProgress(prisma: PrismaClient, entryId: string, message: string) {
  const entry = await prisma.inboxEntry.findUniqueOrThrow({ where: { id: entryId } });
  const steps = [...(entry.progressSteps as { message: string; at: string }[]), { message, at: new Date().toISOString() }];
  await prisma.inboxEntry.update({ where: { id: entryId }, data: { progressSteps: steps as unknown as Prisma.InputJsonValue } });
}

export const UPLOAD_DIR = process.env.INBOX_UPLOAD_DIR ?? "/app/uploads";

async function toBase64(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return buffer.toString("base64");
}

interface Attempt {
  proposal: { targetType: string; fields: Record<string, unknown> };
  userFeedback: string;
}

function buildReevaluationSuffix(attempts: Attempt[]): string {
  if (attempts.length === 0) return "";
  const history = attempts
    .map(
      (a, i) =>
        `Attempt ${i + 1} proposed: ${JSON.stringify(a.proposal)}\nUser said this was wrong: "${a.userFeedback}"`,
    )
    .join("\n\n");
  return `\n\nThis has been tried before and rejected. Take the feedback into account and produce a better answer:\n\n${history}`;
}

// ── Text triage ─────────────────────────────────────────────────────────

interface Proposal {
  targetType: string;
  fields: Record<string, unknown>;
}

interface TriageContext {
  checklistNames: string[];
  personNames: string[];
}

// Real names from the database, so the model picks an existing checklist /
// person instead of guessing a name that then fails to match in the UI.
async function loadTriageContext(prisma: PrismaClient): Promise<TriageContext> {
  const userId = await getCurrentUserId(prisma);
  const [checklists, people] = await Promise.all([
    prisma.checklist.findMany({
      where: { userId, deletedAt: null, completedAt: null, kind: { not: "note" }, projectId: null },
      select: { name: true },
      orderBy: { position: "asc" },
      take: 40,
    }),
    prisma.person.findMany({ where: { userId, deletedAt: null }, select: { name: true }, take: 40 }),
  ]);
  return { checklistNames: checklists.map((c) => c.name), personNames: people.map((p) => p.name) };
}

// Splitting a note into separate items is done in code, not by asking the
// small local model to do it — confirmed repeatedly that llama3.1:8b
// collapses multi-item notes into one. Each line is its own item; a line
// holding several short sentences ("Add X. Add Y.") is split at the
// sentence breaks. A line with a long sentence is left whole, since that's
// prose describing one thing rather than a list of commands.
function splitNote(rawText: string): string[] {
  const segments: string[] = [];
  for (const rawLine of rawText.split("\n")) {
    const line = rawLine.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
    if (!line) continue;
    const sentences = line
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((s) => s.trim())
      .filter(Boolean);
    const allShort = sentences.every((s) => s.split(/\s+/).length <= 20);
    const pieces = sentences.length > 1 && allShort ? sentences : [line];
    // A short comma list ("Milk, eggs") is several items, not one — the
    // local model drops all but the first if left to handle it itself.
    // Only when every part is a few words, so a real sentence with a comma
    // in it stays whole.
    for (const piece of pieces) {
      const parts = piece
        .split(/\s*,\s*/)
        .map((p) => p.replace(/^and\s+/i, "").trim())
        .filter(Boolean);
      const isShortList = parts.length > 1 && parts.every((p) => p.split(/\s+/).length <= 3);
      segments.push(...(isShortList ? parts : [piece]));
    }
  }
  return segments.length > 0 ? segments : [rawText.trim()];
}

// Triages ONE short note (a single item — see splitNote).
async function buildTriagePrompt(prisma: PrismaClient, rawText: string, attempts: Attempt[], context: TriageContext): Promise<string> {
  return (
    `You are sorting ONE short note into the right place in a personal organizer app. ` +
    `Decide which type it belongs to and produce field values for it.\n\n` +
    `${await describeTargetTypesForPrompt(prisma)}\n\n` +
    `Existing checklists (for "checklist_item", set checklistName to the closest EXACT name from this list): ` +
    `${context.checklistNames.map((n) => `"${n}"`).join(", ") || "(none)"}\n` +
    `Existing people (for "gift_idea", set personName to the closest EXACT name): ` +
    `${context.personNames.map((n) => `"${n}"`).join(", ") || "(none)"}\n\n` +
    `Rules:\n` +
    `- Fields hold the THING itself, not the instruction. Drop command wording like "add", "put", "remember to", ` +
    `"to my ... list". Example: "Add toilet paper to my grocery list." → checklist_item with title "Toilet paper".\n` +
    `- A note about the weekly grocery scan / price scan / deal-checking list → "shopping_list_item" with the ` +
    `product as name. A note about a shopping list, errands or a to-do → "checklist_item".\n` +
    `- IMPORTANT — new vs existing: "checklist_item" can ONLY add to a checklist that's already in the list above. ` +
    `If the note explicitly asks to CREATE/START/MAKE a NEW checklist or list (e.g. "create a checklist called X", ` +
    `"start a list for Y", "make a to-do list named Z"), you MUST use "checklist_with_items" instead, even if a ` +
    `similar-sounding checklist already exists — never invent a match to an existing checklist just because none of ` +
    `the real ones fit. Same idea for projects: "project" only for a bare project with no items mentioned; if the ` +
    `note names specific sub-tasks for a NEW project, use "project_with_items".\n` +
    `- NOT EVERYTHING IS A TASK. If the note is just information to remember — a fact, a thought, something to look ` +
    `up later, a note that doesn't ask you to DO anything and doesn't clearly belong to a person/project/calendar/` +
    `recipe/gift — use "checklist_with_items" with kind "note" (title: a short summary, body: the full text, no ` +
    `items). This is a legitimate, safe catch-all — prefer it over guessing a structured type that doesn't really fit.\n` +
    `- Capitalize the first letter of titles and names.\n\n` +
    `Respond with ONLY valid JSON of the shape { "targetType": "...", "fields": { ... } }.\n\n` +
    `Note: "${rawText}"` +
    buildReevaluationSuffix(attempts)
  );
}

// The model should return a single object, but be defensive in case a
// smaller local model wraps it in an array or an object anyway.
function normalizeProposals(raw: unknown): Proposal[] {
  if (Array.isArray(raw)) return raw as Proposal[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items as Proposal[];
    if ("targetType" in obj) return [obj as unknown as Proposal];
  }
  throw new Error("Triage didn't return a recognizable proposal");
}

// Deterministic guard for the one routing call the small local model gets
// wrong in both directions (confirmed by testing): the weekly grocery scan
// list vs. a plain checklist. A note goes to the scan list only if it
// actually mentions the scan / deals; otherwise a shopping-list style note
// is a checklist item. This is a hard rule, not left to the model.
function correctRouting(proposal: Proposal, segment: string, context: TriageContext): Proposal {
  const mentionsScan = /\b(scan|scans|scanner|scanning|deals?|price[- ]?check(?:s|ing)?)\b/i.test(segment);
  const fields = proposal.fields ?? {};

  if (proposal.targetType === "shopping_list_item" && !mentionsScan) {
    const wantsGroceries = /grocer/i.test(segment);
    const named = context.checklistNames.find((n) => segment.toLowerCase().includes(n.toLowerCase()));
    const grocery = wantsGroceries ? context.checklistNames.find((n) => /grocer/i.test(n)) : undefined;
    return {
      targetType: "checklist_item",
      fields: { title: fields.name ?? fields.title ?? segment, checklistName: named ?? grocery ?? "" },
    };
  }
  if (proposal.targetType === "checklist_item" && mentionsScan) {
    return { targetType: "shopping_list_item", fields: { name: fields.title ?? fields.name ?? segment } };
  }
  return proposal;
}

// Returns right away with the entry in "processing"; the sorting itself runs
// in the background so a closed tab or a restart doesn't hang a web request,
// and any failure lands on the entry as "failed" instead of leaving it
// spinning forever.
export async function createTextEntry(prisma: PrismaClient, rawText: string, as?: "recipe") {
  const userId = await getCurrentUserId(prisma);
  const entry = await prisma.inboxEntry.create({
    data: { userId, kind: "text", rawText, status: "processing" },
  });

  const job = as === "recipe" ? processRecipeText(prisma, entry.id, rawText) : processTextEntry(prisma, entry.id, userId, rawText);
  void job.catch(async (error: Error) => {
    await appendProgress(prisma, entry.id, `Couldn't sort this: ${error.message}`).catch(() => undefined);
    await prisma.inboxEntry.update({ where: { id: entry.id }, data: { status: "failed" } }).catch(() => undefined);
  });

  return entry;
}

// Pasting a recipe from the Recipes page: no routing decision, just structure it.
async function processRecipeText(prisma: PrismaClient, entryId: string, rawText: string) {
  await appendProgress(prisma, entryId, "Reading the recipe with the local model…");
  const fields = await runAiTask(
    prisma,
    "recipe_photo_structure",
    buildRecipeExtractionPrompt(`Below is a recipe someone pasted as text.\n\nRecipe:\n${rawText}\n`, []),
  );
  await prisma.inboxEntry.update({
    where: { id: entryId },
    data: { proposal: { targetType: "recipe", fields } as unknown as Prisma.InputJsonValue, status: "pending" },
  });
}

// A long paste with its own structure (headings, bullets, blank-line blocks —
// e.g. a Google Keep note) is split by that structure, in code: one proposal
// per note, never one per line. If a person's first name appears in a note it
// is proposed as a note on that person; otherwise as a checklist (or a plain
// note when it has no list items).
function looksStructured(rawText: string): boolean {
  const lines = rawText.split("\n").filter((l) => l.trim());
  return lines.length >= 6 || rawText.length > 500;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const flattenItem = (i: ParsedItem): string[] => [
  i.label ? `${i.label}: ${i.text}` : i.text,
  ...i.children.map((c) => `  ${c.label ? `${c.label}: ${c.text}` : c.text}`),
];

function noteToProposal(n: ParsedNote, context: TriageContext): Proposal {
  const lines = n.items.flatMap(flattenItem);
  const haystack = `${n.title}\n${n.body ?? ""}\n${lines.join("\n")}`;
  const person = context.personNames.find((name) => {
    const first = name.trim().split(/\s+/)[0];
    return first.length >= 3 && new RegExp(`\\b${escapeRegExp(first)}\\b`, "i").test(haystack);
  });
  if (person) {
    return { targetType: "person_note", fields: { personName: person, sectionTitle: n.suggestedSection, title: n.title, items: lines, body: n.body ?? "" } };
  }
  const flat = lines.map((l) => l.trim());
  return { targetType: "checklist_with_items", fields: { title: n.title, kind: flat.length > 0 ? "list" : "note", items: flat, body: n.body ?? "" } };
}

async function processTextEntry(prisma: PrismaClient, entryId: string, userId: string, rawText: string) {
  const context = await loadTriageContext(prisma);

  if (looksStructured(rawText)) {
    const notes = parseKeepNotes(rawText);
    if (notes.length > 0) {
      await appendProgress(prisma, entryId, `Split into ${notes.length} note(s) by its structure — no AI needed.`);
      const [head, ...others] = notes.map((n) => ({ note: n, proposal: noteToProposal(n, context) }));
      await Promise.all(
        others.map((r) =>
          prisma.inboxEntry.create({
            data: { userId, kind: "text", rawText: r.note.title, status: "pending", proposal: r.proposal as unknown as Prisma.InputJsonValue },
          }),
        ),
      );
      await prisma.inboxEntry.update({
        where: { id: entryId },
        data: { rawText: head.note.title, proposal: head.proposal as unknown as Prisma.InputJsonValue, status: "pending" },
      });
      return;
    }
  }

  const segments = splitNote(rawText);
  await appendProgress(
    prisma,
    entryId,
    segments.length > 1 ? `Found ${segments.length} separate items — sorting each with the local model…` : "Sorting with the local model…",
  );

  const results: { segment: string; proposal: Proposal }[] = [];
  for (const segment of segments) {
    const [proposal] = normalizeProposals(await runAiTask(prisma, "inbox_text_triage", await buildTriagePrompt(prisma, segment, [], context)));
    results.push({ segment, proposal: correctRouting(proposal, segment, context) });
  }

  // The first item updates the entry that's already showing as "processing"
  // in the review queue; any additional items become their own entries,
  // each independently editable/confirmable/discardable. Each entry keeps
  // just its own line as rawText, so "Not quite" re-sorts that item alone.
  const [first, ...rest] = results;
  await Promise.all(
    rest.map((r) =>
      prisma.inboxEntry.create({
        data: { userId, kind: "text", rawText: r.segment, status: "pending", proposal: r.proposal as unknown as Prisma.InputJsonValue },
      }),
    ),
  );
  await prisma.inboxEntry.update({
    where: { id: entryId },
    data: { rawText: first.segment, proposal: first.proposal as unknown as Prisma.InputJsonValue, status: "pending" },
  });
}

// Run once at startup: an entry still "processing" after a restart will
// never finish (its background job died with the old process).
export async function failStuckEntries(prisma: PrismaClient): Promise<number> {
  const stuck = await prisma.inboxEntry.findMany({ where: { status: "processing" } });
  for (const entry of stuck) {
    await appendProgress(prisma, entry.id, "Interrupted (the server restarted while sorting). Discard this and paste it again.").catch(() => undefined);
    await prisma.inboxEntry.update({ where: { id: entry.id }, data: { status: "failed" } });
  }
  return stuck.length;
}

// ── Recipe photo capture ────────────────────────────────────────────────

function buildRecipeExtractionPrompt(context: string, attempts: Attempt[]): string {
  return (
    `${context} Extract the recipe. Respond with ONLY valid JSON of the shape ` +
    `{ "title": string, "description"?: string, "ingredients": string[], "instructions": string, "tags"?: string[], "allergens"?: string[] }.` +
    buildReevaluationSuffix(attempts)
  );
}

// Always tries local first: Tesseract OCR + a local text model to structure
// it. Only escalates to Claude (the claude_cli provider — Pro/Max plan, not
// a paid API key — unless the user has repointed that task setting) when
// Tesseract's own confidence says it couldn't actually read the image,
// which is the real-world signature of handwriting/cursive it can't parse.
// Every stage logs a progress step so the review UI can show what's
// happening rather than a plain "thinking..." spinner.
async function extractRecipeFromPhotosCascade(
  prisma: PrismaClient,
  entryId: string,
  filePaths: string[],
  attempts: Attempt[],
): Promise<unknown> {
  await appendProgress(prisma, entryId, `Reading ${filePaths.length} image(s) with local OCR (Tesseract)…`);
  const ocrResults = await Promise.all(
    filePaths.map(async (p) => ({ text: await runTesseractOcr(p), confidence: await getTesseractConfidence(p) })),
  );
  const meanConfidence = Math.round(ocrResults.reduce((sum, r) => sum + r.confidence, 0) / ocrResults.length);
  const combinedText = ocrResults.map((r) => r.text).join("\n\n---\n\n");
  const hasEnoughText = combinedText.trim().length > 20;
  const looksReadable = meanConfidence >= OCR_CONFIDENCE_THRESHOLD && hasEnoughText;

  if (looksReadable) {
    await appendProgress(prisma, entryId, `OCR confidence ${meanConfidence}% — looks readable, structuring it locally…`);
    const prompt = buildRecipeExtractionPrompt(
      `Below is raw OCR text extracted from a recipe card (may contain OCR noise/errors).\n\nOCR text:\n${combinedText}\n`,
      attempts,
    );
    const fields = await runAiTask(prisma, "recipe_photo_structure", prompt);
    await appendProgress(prisma, entryId, "Done — extracted locally, no need to reach out to Claude.");
    return fields;
  }

  const reason = !hasEnoughText
    ? "OCR couldn't extract any real text from the image"
    : `OCR confidence was only ${meanConfidence}%`;
  await appendProgress(
    prisma,
    entryId,
    `${reason} — likely cursive/handwritten. Trying a local vision model to read the image directly…`,
  );
  const imagesBase64 = await Promise.all(filePaths.map(toBase64));
  const visionPrompt = buildRecipeExtractionPrompt(
    "You are looking at photo(s) of a handwritten or printed recipe card (possibly front and back of the same card). " +
      "Local OCR was unable to reliably read this image, likely due to cursive or messy handwriting — read it directly yourself.",
    attempts,
  );
  const visionFields = (await runAiTask(prisma, "recipe_photo_vision_extract", visionPrompt, imagesBase64)) as {
    ingredients?: unknown[];
  };

  // A local vision model that genuinely can't read the card tends to come
  // back with an empty ingredients list (confirmed directly — it doesn't
  // reliably say "I can't read this" the way Claude does) — treat that as
  // the failure signal and escalate, same pattern as the OCR tier above.
  if (Array.isArray(visionFields.ingredients) && visionFields.ingredients.length > 0) {
    await appendProgress(prisma, entryId, "Done — local vision model read it, no need to reach out to Claude.");
    return visionFields;
  }

  await appendProgress(
    prisma,
    entryId,
    "Local vision model couldn't get a real answer either — escalating to Claude (your Pro/Max plan, not a paid API)…",
  );
  const claudeFields = await runAiTask(prisma, "recipe_photo_vision_extract_escalated", visionPrompt, imagesBase64);
  await appendProgress(prisma, entryId, "Done — Claude read the image directly.");
  return claudeFields;
}

// Fire-and-forget: the HTTP request returns as soon as the entry exists (so
// the client can start polling GET /inbox and watch progressSteps update
// live), rather than blocking on however long OCR + a possible Claude call
// takes.
function runPhotoCascadeInBackground(prisma: PrismaClient, entryId: string, filePaths: string[]) {
  extractRecipeFromPhotosCascade(prisma, entryId, filePaths, [])
    .then(async (fields) => {
      const proposal = { targetType: "recipe" as TargetType, fields };
      await prisma.inboxEntry.update({ where: { id: entryId }, data: { proposal: proposal as Prisma.InputJsonValue, status: "pending" } });
      await sendReminder("Recipe photo ready to review", "Saga finished reading your recipe card — check it in the Inbox or Recipes page.");
    })
    .catch(async (error) => {
      await appendProgress(prisma, entryId, `Failed: ${(error as Error).message}`).catch(() => undefined);
      await prisma.inboxEntry.update({ where: { id: entryId }, data: { status: "failed" } }).catch(() => undefined);
    });
}

export async function createPhotoEntry(prisma: PrismaClient, filePaths: string[]) {
  const userId = await getCurrentUserId(prisma);
  const entry = await prisma.inboxEntry.create({
    data: { userId, kind: "image", purpose: "recipe", mediaPaths: filePaths, status: "processing" },
  });

  runPhotoCascadeInBackground(prisma, entry.id, filePaths);
  return entry;
}

// ── Grocery receipt capture ──────────────────────────────────────────────

function buildReceiptExtractionPrompt(attempts: Attempt[]): string {
  return (
    `You are looking at a photo of a grocery store receipt. Extract:\n` +
    `- storeName: the store's name as printed (e.g. "ALDI", "Food Lion"), or null if not legible\n` +
    `- purchasedAt: the date on the receipt as an ISO date (YYYY-MM-DD), or null if not legible\n` +
    `- totalAmount: the receipt's printed total as a number, or null if not shown/legible\n` +
    `- items: one entry per purchased line item, { "rawText": string, "price": number } — EXACTLY as printed, ` +
    `abbreviations and all, don't clean anything up. Skip subtotal/tax/total/coupon/payment/loyalty lines — only ` +
    `real purchased items.\n\n` +
    `Respond with ONLY a JSON object of the shape ` +
    `{ "storeName": string|null, "purchasedAt": string|null, "totalAmount": number|null, ` +
    `"items": [{ "rawText": string, "price": number }] }.` +
    buildReevaluationSuffix(attempts)
  );
}

// One photo, direct vision read — a receipt's layout (which price lines up
// with which item) matters, which a flat OCR text dump loses; same
// local-first/Claude-escalation shape as the recipe-photo cascade.
async function extractReceiptFromPhotoCascade(
  prisma: PrismaClient,
  entryId: string,
  filePath: string,
  attempts: Attempt[],
): Promise<RawReceiptExtraction> {
  await appendProgress(prisma, entryId, "Reading the receipt with the local vision model…");
  const imageBase64 = await toBase64(filePath);
  const prompt = buildReceiptExtractionPrompt(attempts);
  const fields = (await runAiTask(prisma, "grocery_receipt_vision_extract", prompt, [imageBase64])) as RawReceiptExtraction;

  if (Array.isArray(fields.items) && fields.items.length > 0) {
    await appendProgress(prisma, entryId, "Done — local vision model read it, no need to reach out to Claude.");
    return fields;
  }

  await appendProgress(prisma, entryId, "Local vision model couldn't read it — escalating to Claude (your Pro/Max plan, not a paid API)…");
  const claudeFields = (await runAiTask(prisma, "grocery_receipt_vision_extract_escalated", prompt, [imageBase64])) as RawReceiptExtraction;
  await appendProgress(prisma, entryId, "Done — Claude read the receipt directly.");
  return claudeFields;
}

function runReceiptCascadeInBackground(prisma: PrismaClient, entryId: string, filePath: string) {
  extractReceiptFromPhotoCascade(prisma, entryId, filePath, [])
    .then(async (raw) => {
      const userId = await getCurrentUserId(prisma);
      const fields = await resolveReceiptMatches(prisma, userId, raw);
      const proposal = { targetType: "grocery_receipt" as TargetType, fields };
      await prisma.inboxEntry.update({ where: { id: entryId }, data: { proposal: proposal as unknown as Prisma.InputJsonValue, status: "pending" } });
    })
    .catch(async (error) => {
      await appendProgress(prisma, entryId, `Failed: ${(error as Error).message}`).catch(() => undefined);
      await prisma.inboxEntry.update({ where: { id: entryId }, data: { status: "failed" } }).catch(() => undefined);
    });
}

export async function createReceiptEntry(prisma: PrismaClient, filePath: string) {
  const userId = await getCurrentUserId(prisma);
  const entry = await prisma.inboxEntry.create({ data: { userId, kind: "image", purpose: "grocery_receipt", mediaPaths: [filePath], status: "processing" } });
  runReceiptCascadeInBackground(prisma, entry.id, filePath);
  return entry;
}

// ── Recipe voice/video capture ──────────────────────────────────────────

async function extractRecipeFromTranscript(prisma: PrismaClient, transcript: string, attempts: Attempt[]) {
  const prompt = buildRecipeExtractionPrompt(
    `Below is a transcript of someone verbally explaining a recipe. They likely didn't give exact measurements — ` +
      `preserve their actual phrasing (e.g. "a good glug of oil", "til it looks right") instead of inventing precise ` +
      `measurements that weren't stated, and note in the instructions where something is an estimate.\n\nTranscript:\n${transcript}\n`,
    attempts,
  );
  return runAiTask(prisma, "recipe_voice_structure", prompt);
}

export async function createMediaEntry(prisma: PrismaClient, filePath: string, kind: "audio" | "video") {
  const userId = await getCurrentUserId(prisma);
  const entry = await prisma.inboxEntry.create({
    data: { userId, kind, mediaPaths: [filePath], status: "processing" },
  });

  const audioPath = kind === "video" ? await extractAudioTrack(filePath) : filePath;
  const transcript = await transcribeAudio(audioPath);
  // The original video is the keepsake; the extracted .wav is just a
  // processing intermediate and isn't worth keeping alongside it.
  if (kind === "video") await unlink(audioPath).catch(() => undefined);
  // Save the transcript now, before the (possibly slower/more failure-prone,
  // e.g. missing API key) structuring call — transcription is the expensive
  // step, and a failure past this point shouldn't lose it.
  await prisma.inboxEntry.update({ where: { id: entry.id }, data: { transcript } });
  const fields = await extractRecipeFromTranscript(prisma, transcript, []);
  const proposal = { targetType: "recipe" as TargetType, fields };

  return prisma.inboxEntry.update({
    where: { id: entry.id },
    data: { transcript, proposal: proposal as Prisma.InputJsonValue, status: "pending" },
  });
}

// ── Shared: list / reevaluate / confirm / discard ──────────────────────

export async function listPending(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.inboxEntry.findMany({
    where: { userId, status: { in: ["processing", "pending", "failed"] } },
    orderBy: { createdAt: "asc" },
  });
}

export async function reevaluateEntry(prisma: PrismaClient, id: string, userFeedback: string) {
  const entry = await prisma.inboxEntry.findUniqueOrThrow({ where: { id } });
  const attempts = [...(entry.attempts as unknown as Attempt[]), { proposal: entry.proposal as never, userFeedback }];
  await prisma.inboxEntry.update({ where: { id }, data: { attempts: attempts as unknown as Prisma.InputJsonValue, status: "processing", progressSteps: [] } });

  let fields: unknown;
  if (entry.kind === "text" && (entry.proposal as { targetType?: string } | null)?.targetType === "recipe") {
    const retry = await runAiTask(
      prisma,
      "recipe_photo_structure",
      buildRecipeExtractionPrompt(`Below is a recipe someone pasted as text.\n\nRecipe:\n${entry.rawText}\n`, attempts),
    );
    return prisma.inboxEntry.update({
      where: { id },
      data: { proposal: { targetType: "recipe", fields: retry } as unknown as Prisma.InputJsonValue, status: "pending" },
    });
  }
  if (entry.kind === "text") {
    // Reevaluate is scoped to fixing this one already-split-out entry, not
    // re-splitting the original note again — take the first proposed item
    // even if the model returns more than one.
    const context = await loadTriageContext(prisma);
    const raw = await runAiTask(prisma, "inbox_text_triage", await buildTriagePrompt(prisma, entry.rawText!, attempts, context));
    const [rawProposal] = normalizeProposals(raw);
    const proposal = correctRouting(rawProposal, entry.rawText!, context);
    return prisma.inboxEntry.update({ where: { id }, data: { proposal: proposal as unknown as Prisma.InputJsonValue, status: "pending" } });
  }
  if (entry.kind === "image" && (entry.proposal as { targetType?: string } | null)?.targetType === "grocery_receipt") {
    const raw = await extractReceiptFromPhotoCascade(prisma, entry.id, entry.mediaPaths[0], attempts);
    const userId = await getCurrentUserId(prisma);
    const resolved = await resolveReceiptMatches(prisma, userId, raw);
    return prisma.inboxEntry.update({
      where: { id },
      data: { proposal: { targetType: "grocery_receipt", fields: resolved } as unknown as Prisma.InputJsonValue, status: "pending" },
    });
  }
  if (entry.kind === "image") {
    fields = await extractRecipeFromPhotosCascade(prisma, entry.id, entry.mediaPaths, attempts);
  } else {
    fields = await extractRecipeFromTranscript(prisma, entry.transcript!, attempts);
  }

  const proposal = { targetType: "recipe" as TargetType, fields };
  return prisma.inboxEntry.update({ where: { id }, data: { proposal: proposal as Prisma.InputJsonValue, status: "pending" } });
}

export async function confirmEntry(prisma: PrismaClient, id: string, fields: Record<string, unknown>) {
  const entry = await prisma.inboxEntry.findUniqueOrThrow({ where: { id } });
  const proposal = entry.proposal as unknown as { targetType: TargetType };
  const targetType = TARGET_TYPES[proposal.targetType];
  if (!targetType) throw new Error(`Unknown target type: ${proposal.targetType}`);

  // Recipes capture their originating media as keepsakes alongside the
  // extracted fields — not something the AI proposes, wired in directly.
  const enrichedFields =
    proposal.targetType === "recipe"
      ? {
          ...fields,
          sourceImagePaths: entry.kind === "image" ? entry.mediaPaths : undefined,
          sourceMediaPaths: entry.kind === "audio" || entry.kind === "video" ? entry.mediaPaths : undefined,
          sourceTranscript: entry.transcript ?? undefined,
        }
      : proposal.targetType === "grocery_receipt"
        ? { ...fields, imagePath: entry.mediaPaths[0] }
        : fields;

  const created = await targetType.create(prisma, enrichedFields);
  await prisma.inboxEntry.update({ where: { id }, data: { status: "confirmed" } });
  return created;
}

// Clears everything waiting for review (pending or failed). Entries still
// being processed are left alone.
export async function discardAllPending(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  const entries = await prisma.inboxEntry.findMany({ where: { userId, status: { in: ["pending", "failed"] } } });
  for (const e of entries) await discardEntry(prisma, e.id);
  return { count: entries.length };
}

export async function discardEntry(prisma: PrismaClient, id: string) {
  // mediaPaths are stored as full paths (see routes.ts) so they can be
  // unlinked directly, and served back by basename via GET /inbox/media/:filename.
  const entry = await prisma.inboxEntry.findUniqueOrThrow({ where: { id } });
  await Promise.all(entry.mediaPaths.map((p) => unlink(p).catch(() => undefined)));
  return prisma.inboxEntry.delete({ where: { id } });
}
