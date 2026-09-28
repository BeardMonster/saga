import type { PrismaClient } from "@prisma/client";
import * as projects from "../projects/service.js";
import * as checklists from "../checklists/service.js";
import * as goals from "../goals/service.js";
import * as calendar from "../calendar/service.js";
import * as reminders from "../reminders/service.js";
import * as people from "../people/service.js";
import * as broadcasts from "../broadcasts/service.js";
import * as finance from "../finance/service.js";
import * as investments from "../investments/service.js";
import * as recipes from "../recipes/service.js";
import * as grocery from "../grocery/service.js";
import * as personNotes from "../personNotes/service.js";
import * as insults from "../insults/service.js";

interface DeletedRow {
  id: string;
  deletedAt: Date | null;
  [key: string]: unknown;
}

export interface TrashTypeConfig {
  label: string;
  getTitle: (row: DeletedRow) => string;
  listDeleted: (prisma: PrismaClient) => Promise<DeletedRow[]>;
  restore: (prisma: PrismaClient, id: string) => Promise<unknown>;
  hardDelete: (prisma: PrismaClient, id: string) => Promise<unknown>;
}

const dateOnly = (d: Date) => new Date(d).toISOString().slice(0, 10);
const money = (n: unknown) => `$${Number(n).toFixed(2)}`;

// Every deletable "content" type in the app, in one place — the source of
// truth for what Trash shows, restores, and eventually purges. InboxEntry
// is deliberately not here: discarding an AI proposal is a hard delete by
// design (it's a rejected draft, not saved content), unchanged from before.
export const TRASH_TYPES: Record<string, TrashTypeConfig> = {
  project: {
    label: "Project",
    getTitle: (r) => String(r.name),
    listDeleted: projects.listDeletedProjects,
    restore: projects.restoreProject,
    hardDelete: projects.hardDeleteProject,
  },
  checklist: {
    label: "Checklist",
    getTitle: (r) => String(r.name),
    listDeleted: checklists.listDeletedChecklists,
    restore: checklists.restoreChecklist,
    hardDelete: checklists.hardDeleteChecklist,
  },
  checklist_item: {
    label: "Checklist item",
    getTitle: (r) => String(r.title),
    listDeleted: checklists.listDeletedChecklistItems,
    restore: checklists.restoreChecklistItem,
    hardDelete: checklists.hardDeleteChecklistItem,
  },
  goal: {
    label: "Goal",
    getTitle: (r) => String(r.title),
    listDeleted: goals.listDeletedGoals,
    restore: goals.restoreGoal,
    hardDelete: goals.hardDeleteGoal,
  },
  calendar_event: {
    label: "Calendar event",
    getTitle: (r) => String(r.title),
    listDeleted: calendar.listDeletedEvents,
    restore: calendar.restoreEvent,
    hardDelete: calendar.hardDeleteEvent,
  },
  reminder_cascade: {
    label: "Reminder",
    getTitle: (r) => String(r.title),
    listDeleted: reminders.listDeletedCascades,
    restore: reminders.restoreCascade,
    hardDelete: reminders.hardDeleteCascade,
  },
  person: {
    label: "Person",
    getTitle: (r) => String(r.name),
    listDeleted: people.listDeletedPeople,
    restore: people.restorePerson,
    hardDelete: people.hardDeletePerson,
  },
  person_section: {
    label: "Person notes section",
    getTitle: (r) => String(r.title),
    listDeleted: personNotes.listDeletedSections,
    restore: personNotes.restoreSection,
    hardDelete: personNotes.hardDeleteSection,
  },
  person_note: {
    label: "Person note",
    getTitle: (r) => String(r.title),
    listDeleted: personNotes.listDeletedNotes,
    restore: personNotes.restoreNote,
    hardDelete: personNotes.hardDeleteNote,
  },
  person_note_item: {
    label: "Person note item",
    getTitle: (r) => String(r.text),
    listDeleted: personNotes.listDeletedItems,
    restore: personNotes.restoreItem,
    hardDelete: personNotes.hardDeleteItem,
  },
  broadcast: {
    label: "Broadcast",
    getTitle: (r) => String(r.title),
    listDeleted: broadcasts.listDeletedBroadcasts,
    restore: broadcasts.restoreBroadcast,
    hardDelete: broadcasts.hardDeleteBroadcast,
  },
  finance_account: {
    label: "Finance account",
    getTitle: (r) => String(r.name),
    listDeleted: finance.listDeletedAccounts,
    restore: finance.restoreAccount,
    hardDelete: finance.hardDeleteAccount,
  },
  finance_statement: {
    label: "Statement",
    getTitle: (r) => `Statement ${dateOnly(r.periodStart as Date)} – ${dateOnly(r.periodEnd as Date)}`,
    listDeleted: finance.listDeletedStatements,
    restore: finance.restoreStatement,
    hardDelete: finance.hardDeleteStatement,
  },
  finance_transaction: {
    label: "Transaction",
    getTitle: (r) => `${r.merchantRaw} (${money(r.amount)})`,
    listDeleted: finance.listDeletedTransactions,
    restore: finance.restoreTransaction,
    hardDelete: finance.hardDeleteTransaction,
  },
  finance_category: {
    label: "Category",
    getTitle: (r) => String(r.name),
    listDeleted: finance.listDeletedCategories,
    restore: finance.restoreCategory,
    hardDelete: finance.hardDeleteCategory,
  },
  finance_subscription: {
    label: "Subscription",
    getTitle: (r) => String(r.serviceName),
    listDeleted: finance.listDeletedSubscriptions,
    restore: finance.restoreSubscription,
    hardDelete: finance.hardDeleteSubscription,
  },
  investment_account: {
    label: "Investment account",
    getTitle: (r) => String(r.institution),
    listDeleted: investments.listDeletedInvestmentAccounts,
    restore: investments.restoreInvestmentAccount,
    hardDelete: investments.hardDeleteInvestmentAccount,
  },
  balance_snapshot: {
    label: "Balance snapshot",
    getTitle: (r) => `${dateOnly(r.asOfDate as Date)} balance (${money(r.totalValue)})`,
    listDeleted: investments.listDeletedBalanceSnapshots,
    restore: investments.restoreBalanceSnapshot,
    hardDelete: investments.hardDeleteBalanceSnapshot,
  },
  recipe: {
    label: "Recipe",
    getTitle: (r) => String(r.title),
    listDeleted: recipes.listDeletedRecipes,
    restore: recipes.restoreRecipe,
    hardDelete: recipes.hardDeleteRecipe,
  },
  grocery_store: {
    label: "Grocery store",
    getTitle: (r) => String(r.name),
    listDeleted: grocery.listDeletedStores,
    restore: grocery.restoreStore,
    hardDelete: grocery.hardDeleteStore,
  },
  shopping_list_item: {
    label: "Shopping list item",
    getTitle: (r) => String(r.name),
    listDeleted: grocery.listDeletedShoppingListItems,
    restore: grocery.restoreShoppingListItem,
    hardDelete: grocery.hardDeleteShoppingListItem,
  },
  insult: {
    label: "Insult",
    getTitle: (r) => String(r.text),
    listDeleted: insults.listDeletedInsults,
    restore: insults.restoreInsult,
    hardDelete: insults.hardDeleteInsult,
  },
};
