import type { AccountPlatform, AccountType, BillingCycle, CategorizedBy, ImportMethod, PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";

// ── Accounts ────────────────────────────────────────────────────────────

export async function listAccounts(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.account.findMany({
    where: { userId, deletedAt: null },
    orderBy: { name: "asc" },
    include: { subscriptions: { where: { deletedAt: null } } },
  });
}

export async function createAccount(
  prisma: PrismaClient,
  input: { name: string; institution?: string; platform: AccountPlatform; type: AccountType; last4?: string },
) {
  const userId = await getCurrentUserId(prisma);
  return prisma.account.create({ data: { userId, ...input } });
}

export async function updateAccount(
  prisma: PrismaClient,
  id: string,
  input: Partial<{ name: string; institution: string; platform: AccountPlatform; type: AccountType; last4: string }>,
) {
  return prisma.account.update({ where: { id }, data: input });
}

// Soft delete — an account's transactions, statements and subscriptions are
// its own content, not standalone records, so they go to Trash with it.
export async function deleteAccount(prisma: PrismaClient, id: string) {
  const now = new Date();
  await prisma.transaction.updateMany({ where: { accountId: id }, data: { deletedAt: now } });
  await prisma.statement.updateMany({ where: { accountId: id }, data: { deletedAt: now } });
  await prisma.subscription.updateMany({ where: { accountId: id }, data: { deletedAt: now } });
  return prisma.account.update({ where: { id }, data: { deletedAt: now } });
}

export async function listDeletedAccounts(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.account.findMany({ where: { userId, deletedAt: { not: null } } });
}

export async function restoreAccount(prisma: PrismaClient, id: string) {
  await prisma.transaction.updateMany({ where: { accountId: id }, data: { deletedAt: null } });
  await prisma.statement.updateMany({ where: { accountId: id }, data: { deletedAt: null } });
  await prisma.subscription.updateMany({ where: { accountId: id }, data: { deletedAt: null } });
  return prisma.account.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteAccount(prisma: PrismaClient, id: string) {
  await prisma.transaction.deleteMany({ where: { accountId: id } });
  await prisma.statement.deleteMany({ where: { accountId: id } });
  await prisma.subscription.deleteMany({ where: { accountId: id } });
  return prisma.account.delete({ where: { id } });
}

// ── Statements ──────────────────────────────────────────────────────────

export async function listStatements(prisma: PrismaClient, accountId?: string) {
  return prisma.statement.findMany({
    where: { deletedAt: null, ...(accountId ? { accountId } : {}) },
    orderBy: { periodStart: "desc" },
    include: { transactions: { where: { deletedAt: null } } },
  });
}

export async function createStatement(
  prisma: PrismaClient,
  input: { accountId: string; periodStart: string; periodEnd: string; importMethod: ImportMethod; sourceFileRef?: string },
) {
  return prisma.statement.create({
    data: {
      accountId: input.accountId,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      importMethod: input.importMethod,
      sourceFileRef: input.sourceFileRef,
    },
  });
}

export async function deleteStatement(prisma: PrismaClient, id: string) {
  await prisma.transaction.updateMany({ where: { statementId: id }, data: { statementId: null } });
  return prisma.statement.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listDeletedStatements(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.statement.findMany({ where: { account: { userId }, deletedAt: { not: null } } });
}

export async function restoreStatement(prisma: PrismaClient, id: string) {
  return prisma.statement.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteStatement(prisma: PrismaClient, id: string) {
  await prisma.transaction.updateMany({ where: { statementId: id }, data: { statementId: null } });
  return prisma.statement.delete({ where: { id } });
}

// ── Transactions ────────────────────────────────────────────────────────
// Manual entry (paste/type it in) is the framework's only ingestion path
// for now — file/pasted-statement parsing via Ollama is the next layer to
// build on top of this, not part of the framework itself.

export async function listTransactions(prisma: PrismaClient, accountId?: string) {
  const userId = await getCurrentUserId(prisma);
  return prisma.transaction.findMany({
    where: { account: { userId }, deletedAt: null, ...(accountId ? { accountId } : {}) },
    orderBy: { occurredAt: "desc" },
    include: { category: true, account: true },
  });
}

export async function createTransaction(
  prisma: PrismaClient,
  input: {
    accountId: string;
    statementId?: string;
    occurredAt: string;
    merchantRaw: string;
    amount: number;
    categoryId?: string;
    categorizedBy?: CategorizedBy;
  },
) {
  return prisma.transaction.create({
    data: {
      accountId: input.accountId,
      statementId: input.statementId,
      occurredAt: new Date(input.occurredAt),
      merchantRaw: input.merchantRaw,
      amount: input.amount,
      categoryId: input.categoryId,
      // A manually-entered transaction with a category picked at creation
      // time was categorized by hand, not inferred.
      categorizedBy: input.categoryId ? (input.categorizedBy ?? "manual") : undefined,
    },
  });
}

export async function updateTransaction(
  prisma: PrismaClient,
  id: string,
  input: Partial<{ occurredAt: string; merchantRaw: string; amount: number; categoryId: string }>,
) {
  return prisma.transaction.update({
    where: { id },
    data: {
      merchantRaw: input.merchantRaw,
      amount: input.amount,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
      categoryId: input.categoryId,
      categorizedBy: input.categoryId ? "manual" : undefined,
    },
  });
}

export async function deleteTransaction(prisma: PrismaClient, id: string) {
  return prisma.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listDeletedTransactions(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.transaction.findMany({ where: { account: { userId }, deletedAt: { not: null } } });
}

export async function restoreTransaction(prisma: PrismaClient, id: string) {
  return prisma.transaction.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteTransaction(prisma: PrismaClient, id: string) {
  return prisma.transaction.delete({ where: { id } });
}

// ── Categories ──────────────────────────────────────────────────────────

export async function listCategories(prisma: PrismaClient) {
  return prisma.category.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, include: { parentCategory: true } });
}

export async function createCategory(prisma: PrismaClient, input: { name: string; parentCategoryId?: string }) {
  return prisma.category.create({ data: input });
}

export async function updateCategory(prisma: PrismaClient, id: string, input: Partial<{ name: string; parentCategoryId: string }>) {
  return prisma.category.update({ where: { id }, data: input });
}

export async function deleteCategory(prisma: PrismaClient, id: string) {
  await prisma.transaction.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
  await prisma.category.updateMany({ where: { parentCategoryId: id }, data: { parentCategoryId: null } });
  return prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listDeletedCategories(prisma: PrismaClient) {
  return prisma.category.findMany({ where: { deletedAt: { not: null } } });
}

export async function restoreCategory(prisma: PrismaClient, id: string) {
  return prisma.category.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteCategory(prisma: PrismaClient, id: string) {
  await prisma.transaction.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
  await prisma.category.updateMany({ where: { parentCategoryId: id }, data: { parentCategoryId: null } });
  return prisma.category.delete({ where: { id } });
}

// ── Subscriptions ───────────────────────────────────────────────────────
// Can start out manually entered (this framework) and later be inferred
// from recurring Transaction patterns — see DATA-MODEL.md.

export async function listSubscriptions(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.subscription.findMany({
    where: { account: { userId }, deletedAt: null },
    orderBy: { nextChargeDate: "asc" },
    include: { account: true },
  });
}

export async function createSubscription(
  prisma: PrismaClient,
  input: { accountId: string; serviceName: string; amount: number; billingCycle: BillingCycle; nextChargeDate: string },
) {
  return prisma.subscription.create({
    data: {
      accountId: input.accountId,
      serviceName: input.serviceName,
      amount: input.amount,
      billingCycle: input.billingCycle,
      nextChargeDate: new Date(input.nextChargeDate),
    },
  });
}

export async function updateSubscription(
  prisma: PrismaClient,
  id: string,
  input: Partial<{ serviceName: string; amount: number; billingCycle: BillingCycle; nextChargeDate: string }>,
) {
  return prisma.subscription.update({
    where: { id },
    data: { ...input, nextChargeDate: input.nextChargeDate ? new Date(input.nextChargeDate) : undefined },
  });
}

export async function deleteSubscription(prisma: PrismaClient, id: string) {
  return prisma.subscription.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listDeletedSubscriptions(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.subscription.findMany({ where: { account: { userId }, deletedAt: { not: null } } });
}

export async function restoreSubscription(prisma: PrismaClient, id: string) {
  return prisma.subscription.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteSubscription(prisma: PrismaClient, id: string) {
  return prisma.subscription.delete({ where: { id } });
}
