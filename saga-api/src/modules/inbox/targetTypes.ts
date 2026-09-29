import type { PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";
import * as checklists from "../checklists/service.js";
import * as goals from "../goals/service.js";
import * as calendar from "../calendar/service.js";
import * as reminders from "../reminders/service.js";
import * as people from "../people/service.js";
import * as projects from "../projects/service.js";
import * as recipes from "../recipes/service.js";
import * as grocery from "../grocery/service.js";
import * as groceryReceipts from "../grocery/receipts.js";
import * as personNotes from "../personNotes/service.js";

// Everywhere a dumped-in text/photo/recording can end up. Each entry
// reuses that module's existing create function — the inbox never
// duplicates create logic, it only decides which existing one to call.
// Finance is deliberately excluded: it has its own hard AI-exception
// nuance (never escalate to Claude) worth designing separately.
export const TARGET_TYPES = {
  checklist_item: {
    label: "Checklist item",
    promptHint: 'fields: { checklistName: string (an existing checklist), title: string (just the item, e.g. "Toilet paper") }',
    create: (prisma: PrismaClient, fields: Record<string, unknown>) =>
      checklists.addItem(prisma, fields.checklistId as string, fields.title as string),
  },
  shopping_list_item: {
    label: "Weekly grocery scan list item",
    promptHint:
      "fields: { name: string } — a staple the weekly grocery PRICE SCANNER should check (use only when the note mentions the grocery scan / price scan / deals)",
    create: (prisma: PrismaClient, fields: Record<string, unknown>) =>
      grocery.createShoppingListItem(prisma, fields.name as string),
  },
  goal: {
    label: "Goal",
    promptHint:
      'fields: { title: string, description?: string, horizon: "ten_year"|"five_year"|"three_year"|"one_year"|"six_month"|"three_month"|"one_month"|"two_week"|"one_week" }',
    create: (prisma: PrismaClient, fields: Record<string, unknown>) => goals.createGoal(prisma, fields as never),
  },
  calendar_event: {
    label: "Calendar event",
    promptHint: "fields: { title: string, startAt: ISO datetime string, location?: string, isAllDay?: boolean }",
    create: (prisma: PrismaClient, fields: Record<string, unknown>) => calendar.createEvent(prisma, fields as never),
  },
  reminder: {
    label: "Reminder",
    promptHint: "fields: { title: string, anchorDate: ISO date string, cadenceDays?: number[] }",
    create: (prisma: PrismaClient, fields: Record<string, unknown>) => reminders.createCascade(prisma, fields as never),
  },
  gift_idea: {
    label: "Gift idea",
    promptHint: "fields: { personName: string (best guess at an existing person), description: string, link?: string, priceEstimate?: number }",
    create: (prisma: PrismaClient, fields: Record<string, unknown>) =>
      personNotes.addGiftIdeaItem(prisma, fields.personId as string, {
        description: fields.description as string,
        link: fields.link as string | undefined,
      }),
  },
  project: {
    label: "Project (no sub-tasks mentioned)",
    promptHint: "fields: { name: string, description?: string } — use only when NO sub-tasks/items are named; if any are, use project_with_items instead",
    create: (prisma: PrismaClient, fields: Record<string, unknown>) => projects.createProject(prisma, fields as never),
  },
  project_with_items: {
    label: "New project with a checklist of sub-tasks",
    promptHint:
      'fields: { name: string (the new project\'s name), items: string[] (its named sub-tasks) } — use when the note asks to CREATE/START a new project AND names specific sub-tasks/items for it',
    create: async (prisma: PrismaClient, fields: Record<string, unknown>) => {
      const name = ((fields.name as string) ?? "").trim() || "Untitled";
      const items = ((fields.items as string[] | undefined) ?? []).map((t) => t.trim()).filter(Boolean);
      const project = await projects.createProject(prisma, { name, description: fields.description as string | undefined });
      const list = await checklists.createChecklist(prisma, { name, kind: "generic", projectId: project.id });
      for (const title of items) await checklists.addItem(prisma, list.id, title);
      return project;
    },
  },
  recipe: {
    label: "Recipe",
    promptHint:
      "fields: { title: string, ingredients: string[], instructions: string, tags?: string[], allergens?: string[], description?: string }",
    create: (prisma: PrismaClient, fields: Record<string, unknown>) => recipes.createRecipe(prisma, fields as never),
  },
  // Also reachable from the single-line triage prompt (see below) — this is
  // what fixes "create a checklist called X and add item Y" being wrongly
  // routed to checklist_item (which can only ADD to an EXISTING checklist,
  // and was silently guessing the closest existing name instead of making a
  // new one). Still reused as-is by the structured-paste path too, which
  // sets this targetType directly in code without going through the model.
  checklist_with_items: {
    label: "New checklist (or note)",
    promptHint:
      'fields: { title: string (a short name/summary), items?: string[] (starting items, if it\'s a real task list), body?: string (the full text, if it\'s a note), kind: "list"|"note" } — ' +
      'use "list" when the note asks to CREATE/START a new checklist or list of tasks, not to add to one that already exists. ' +
      'Use "note" as the CATCH-ALL: pure information to remember that is NOT a task and does not clearly fit gift_idea/calendar_event/reminder/recipe/a specific person — ' +
      'e.g. a fact, a reference, a thought, something to look up later. Prefer "note" over forcing a bad fit into another type.',
    create: async (prisma: PrismaClient, fields: Record<string, unknown>) => {
      const items = ((fields.items as string[] | undefined) ?? []).map((t) => t.trim()).filter(Boolean);
      const body = typeof fields.body === "string" ? fields.body.trim() : "";
      // The model doesn't always remember to set kind explicitly even when
      // it clearly meant "note" (confirmed live: real body text, zero
      // items, no kind field) — infer it rather than silently dropping the
      // text into an empty generic checklist when that happens.
      const isNote = fields.kind === "note" || (body.length > 0 && items.length === 0);
      const list = await checklists.createChecklist(prisma, {
        name: (fields.title as string)?.trim() || "Untitled",
        kind: isNote ? "note" : "generic",
        body: isNote ? body : undefined,
      });
      for (const title of items) await checklists.addItem(prisma, list.id, title);
      return list;
    },
  },
  person_note: {
    label: "Note on a person's page",
    structuredOnly: true,
    promptHint: "",
    create: (prisma: PrismaClient, fields: Record<string, unknown>) => {
      // Lines starting with spaces are sub-points of the line above.
      const items: { label?: string | null; text: string; children: { label?: string | null; text: string }[] }[] = [];
      for (const raw of (fields.items as string[] | undefined) ?? []) {
        if (!raw.trim()) continue;
        const m = raw.trim().match(/^([^:/]{1,40}?):\s+(.+)$/);
        const parsed = m ? { label: m[1].trim(), text: m[2].trim() } : { label: null, text: raw.trim() };
        if (/^\s/.test(raw) && items.length > 0) items[items.length - 1].children.push(parsed);
        else items.push({ ...parsed, children: [] });
      }
      return personNotes.importNotes(prisma, fields.personId as string, [
        {
          title: ((fields.title as string) ?? "").trim() || "Untitled",
          kind: items.length > 0 ? "list" : "text",
          body: (fields.body as string | undefined) || null,
          newSectionTitle: ((fields.sectionTitle as string) ?? "").trim() || "Imported notes",
          items,
        },
      ]);
    },
  },
  // Only produced by the receipt-photo capture flow (GroceryPage's "Add
  // receipt") — never suggested by free-text triage.
  grocery_receipt: {
    label: "Grocery receipt",
    structuredOnly: true,
    promptHint: "",
    create: (prisma: PrismaClient, fields: Record<string, unknown>) => groceryReceipts.confirmReceipt(prisma, fields as never),
  },
} as const;

export type TargetType = keyof typeof TARGET_TYPES;

// Every type the single-line triage model actually gets to choose between
// (the structuredOnly ones are assigned directly in code, never by this
// prompt, so editable guidance for them wouldn't do anything).
const EDITABLE_TYPES = Object.entries(TARGET_TYPES).filter(([, def]) => !("structuredOnly" in def));

// Brandon's own free-text guidance, layered on top of each type's fixed
// field-shape spec — never replacing it, since the create functions above
// depend on those exact field names. Edited from Settings or from Brain
// Dump itself; same rows either way.
export async function listTargetTypeInstructions(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  const rows = await prisma.aiTargetTypeInstruction.findMany({ where: { userId } });
  const byType = new Map(rows.map((r) => [r.targetType, r.notes]));
  return EDITABLE_TYPES.map(([key, def]) => ({
    targetType: key,
    label: def.label,
    defaultHint: def.promptHint,
    notes: byType.get(key) ?? "",
  }));
}

export async function setTargetTypeInstructions(prisma: PrismaClient, targetType: string, notes: string) {
  if (!EDITABLE_TYPES.some(([key]) => key === targetType)) {
    throw new Error(`Unknown or non-editable target type: ${targetType}`);
  }
  const userId = await getCurrentUserId(prisma);
  const trimmed = notes.trim();
  if (!trimmed) {
    await prisma.aiTargetTypeInstruction.deleteMany({ where: { userId, targetType } });
    return { targetType, notes: "" };
  }
  await prisma.aiTargetTypeInstruction.upsert({
    where: { userId_targetType: { userId, targetType } },
    create: { userId, targetType, notes: trimmed },
    update: { notes: trimmed },
  });
  return { targetType, notes: trimmed };
}

export async function describeTargetTypesForPrompt(prisma: PrismaClient): Promise<string> {
  const userId = await getCurrentUserId(prisma);
  const rows = await prisma.aiTargetTypeInstruction.findMany({ where: { userId } });
  const byType = new Map(rows.map((r) => [r.targetType, r.notes]));
  return EDITABLE_TYPES.map(([key, def]) => {
    const extra = byType.get(key);
    return `- "${key}" (${def.label}): ${def.promptHint}${extra ? `\n  Extra guidance from the user (follow this closely): ${extra}` : ""}`;
  }).join("\n");
}
