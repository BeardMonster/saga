import type { InvestmentAccountType, PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";

export async function listInvestmentAccounts(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.investmentAccount.findMany({
    where: { userId, deletedAt: null },
    orderBy: { institution: "asc" },
    include: { balanceSnapshots: { where: { deletedAt: null }, orderBy: { asOfDate: "desc" } } },
  });
}

export async function createInvestmentAccount(
  prisma: PrismaClient,
  input: { institution: string; accountType: InvestmentAccountType; last4?: string },
) {
  const userId = await getCurrentUserId(prisma);
  return prisma.investmentAccount.create({ data: { userId, ...input } });
}

export async function updateInvestmentAccount(
  prisma: PrismaClient,
  id: string,
  input: Partial<{ institution: string; accountType: InvestmentAccountType; last4: string }>,
) {
  return prisma.investmentAccount.update({ where: { id }, data: input });
}

export async function deleteInvestmentAccount(prisma: PrismaClient, id: string) {
  const now = new Date();
  await prisma.balanceSnapshot.updateMany({ where: { investmentAccountId: id }, data: { deletedAt: now } });
  return prisma.investmentAccount.update({ where: { id }, data: { deletedAt: now } });
}

export async function listDeletedInvestmentAccounts(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.investmentAccount.findMany({ where: { userId, deletedAt: { not: null } } });
}

export async function restoreInvestmentAccount(prisma: PrismaClient, id: string) {
  await prisma.balanceSnapshot.updateMany({ where: { investmentAccountId: id }, data: { deletedAt: null } });
  return prisma.investmentAccount.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteInvestmentAccount(prisma: PrismaClient, id: string) {
  await prisma.balanceSnapshot.deleteMany({ where: { investmentAccountId: id } });
  return prisma.investmentAccount.delete({ where: { id } });
}

// Periodic point-in-time balances, not itemized transactions — this is
// what actually tracks progress toward the early-retirement goal.
export async function addBalanceSnapshot(
  prisma: PrismaClient,
  input: {
    investmentAccountId: string;
    asOfDate: string;
    totalValue: number;
    contributionsThisPeriod?: number;
    sourceStatementRef?: string;
  },
) {
  return prisma.balanceSnapshot.create({
    data: {
      investmentAccountId: input.investmentAccountId,
      asOfDate: new Date(input.asOfDate),
      totalValue: input.totalValue,
      contributionsThisPeriod: input.contributionsThisPeriod,
      sourceStatementRef: input.sourceStatementRef,
    },
  });
}

export async function deleteBalanceSnapshot(prisma: PrismaClient, id: string) {
  return prisma.balanceSnapshot.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listDeletedBalanceSnapshots(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.balanceSnapshot.findMany({ where: { investmentAccount: { userId }, deletedAt: { not: null } } });
}

export async function restoreBalanceSnapshot(prisma: PrismaClient, id: string) {
  return prisma.balanceSnapshot.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteBalanceSnapshot(prisma: PrismaClient, id: string) {
  return prisma.balanceSnapshot.delete({ where: { id } });
}
