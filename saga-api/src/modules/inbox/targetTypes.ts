import type { PrismaClient } from "@prisma/client";
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
    label: "Project",
    promptHint: "fields: { name: string, description?: string }",
    create: (prisma: PrismaClient, fields: Record<string, unknown>) => projects.createProject(prisma, fields as never),
  },
  recipe: {
    label: "Recipe",
    promptHint:
      "fields: { title: string, ingredients: string[], instructions: string, tags?: string[], allergens?: string[], description?: string }",
    create: (prisma: PrismaClient, fields: Record<string, unknown>) => recipes.createRecipe(prisma, fields as never),
  },
  // The two below are only produced by the structured-paste path (a long
  // note split by its own headings/bullets, no AI) — kept out of the
  // single-line triage prompt so the model never routes a one-liner to them.
  checklist_with_items: {
    label: "Checklist or note",
    structuredOnly: true,
    promptHint: "",
    create: async (prisma: PrismaClient, fields: Record<string, unknown>) => {
      const items = ((fields.items as string[] | undefined) ?? []).map((t) => t.trim()).filter(Boolean);
      const isNote = fields.kind === "note";
      const list = await checklists.createChecklist(prisma, {
        name: (fields.title as string)?.trim() || "Untitled",
        kind: isNote ? "note" : "generic",
        body: isNote ? ((fields.body as string | undefined) ?? "") : undefined,
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

export function describeTargetTypesForPrompt(): string {
  return Object.entries(TARGET_TYPES)
    .filter(([, def]) => !("structuredOnly" in def))
    .map(([key, def]) => `- "${key}" (${def.label}): ${def.promptHint}`)
    .join("\n");
}
