import type { FastifyInstance } from "fastify";
import type { AccountPlatform, AccountType, BillingCycle, CategorizedBy, ImportMethod } from "@prisma/client";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";

export default async function financeRoutes(server: FastifyInstance) {
  // Accounts
  server.get("/finance/accounts", async () => ok(await service.listAccounts(server.prisma)));

  server.post<{
    Body: { name: string; institution?: string; platform: AccountPlatform; type: AccountType; last4?: string };
  }>("/finance/accounts", async (request, reply) => {
    const { name, platform, type } = request.body;
    if (!name?.trim() || !platform || !type) {
      reply.code(400);
      return err("name, platform, and type are required", 400);
    }
    const account = await service.createAccount(server.prisma, request.body);
    reply.code(201);
    return ok(account, "Account added", 201);
  });

  server.patch<{
    Params: { id: string };
    Body: Partial<{ name: string; institution: string; platform: AccountPlatform; type: AccountType; last4: string }>;
  }>("/finance/accounts/:id", async (request) => {
    const account = await service.updateAccount(server.prisma, request.params.id, request.body);
    return ok(account, "Account updated");
  });

  server.delete<{ Params: { id: string } }>("/finance/accounts/:id", async (request) => {
    await service.deleteAccount(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });

  // Statements
  server.get<{ Querystring: { accountId?: string } }>("/finance/statements", async (request) =>
    ok(await service.listStatements(server.prisma, request.query.accountId)),
  );

  server.post<{
    Body: { accountId: string; periodStart: string; periodEnd: string; importMethod: ImportMethod; sourceFileRef?: string };
  }>("/finance/statements", async (request, reply) => {
    const { accountId, periodStart, periodEnd, importMethod } = request.body;
    if (!accountId || !periodStart || !periodEnd || !importMethod) {
      reply.code(400);
      return err("accountId, periodStart, periodEnd, and importMethod are required", 400);
    }
    const statement = await service.createStatement(server.prisma, request.body);
    reply.code(201);
    return ok(statement, "Statement recorded", 201);
  });

  server.delete<{ Params: { id: string } }>("/finance/statements/:id", async (request) => {
    await service.deleteStatement(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });

  // Transactions
  server.get<{ Querystring: { accountId?: string } }>("/finance/transactions", async (request) =>
    ok(await service.listTransactions(server.prisma, request.query.accountId)),
  );

  server.post<{
    Body: {
      accountId: string;
      statementId?: string;
      occurredAt: string;
      merchantRaw: string;
      amount: number;
      categoryId?: string;
      categorizedBy?: CategorizedBy;
    };
  }>("/finance/transactions", async (request, reply) => {
    const { accountId, occurredAt, merchantRaw, amount } = request.body;
    if (!accountId || !occurredAt || !merchantRaw?.trim() || amount === undefined) {
      reply.code(400);
      return err("accountId, occurredAt, merchantRaw, and amount are required", 400);
    }
    const transaction = await service.createTransaction(server.prisma, request.body);
    reply.code(201);
    return ok(transaction, "Transaction added", 201);
  });

  server.patch<{
    Params: { id: string };
    Body: Partial<{ occurredAt: string; merchantRaw: string; amount: number; categoryId: string }>;
  }>("/finance/transactions/:id", async (request) => {
    // A category-only patch (from the inline select) is still "categorizing";
    // anything broader is a full edit — same endpoint, same service call.
    const transaction = await service.updateTransaction(server.prisma, request.params.id, request.body);
    return ok(transaction, "Transaction updated");
  });

  server.delete<{ Params: { id: string } }>("/finance/transactions/:id", async (request) => {
    await service.deleteTransaction(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });

  // Categories
  server.get("/finance/categories", async () => ok(await service.listCategories(server.prisma)));

  server.post<{ Body: { name: string; parentCategoryId?: string } }>("/finance/categories", async (request, reply) => {
    if (!request.body.name?.trim()) {
      reply.code(400);
      return err("name is required", 400);
    }
    const category = await service.createCategory(server.prisma, request.body);
    reply.code(201);
    return ok(category, "Category added", 201);
  });

  server.patch<{ Params: { id: string }; Body: Partial<{ name: string; parentCategoryId: string }> }>(
    "/finance/categories/:id",
    async (request) => {
      const category = await service.updateCategory(server.prisma, request.params.id, request.body);
      return ok(category, "Category updated");
    },
  );

  server.delete<{ Params: { id: string } }>("/finance/categories/:id", async (request) => {
    await service.deleteCategory(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });

  // Subscriptions
  server.get("/finance/subscriptions", async () => ok(await service.listSubscriptions(server.prisma)));

  server.post<{
    Body: { accountId: string; serviceName: string; amount: number; billingCycle: BillingCycle; nextChargeDate: string };
  }>("/finance/subscriptions", async (request, reply) => {
    const { accountId, serviceName, amount, billingCycle, nextChargeDate } = request.body;
    if (!accountId || !serviceName?.trim() || amount === undefined || !billingCycle || !nextChargeDate) {
      reply.code(400);
      return err("accountId, serviceName, amount, billingCycle, and nextChargeDate are required", 400);
    }
    const subscription = await service.createSubscription(server.prisma, request.body);
    reply.code(201);
    return ok(subscription, "Subscription added", 201);
  });

  server.patch<{
    Params: { id: string };
    Body: Partial<{ serviceName: string; amount: number; billingCycle: BillingCycle; nextChargeDate: string }>;
  }>("/finance/subscriptions/:id", async (request) => {
    const subscription = await service.updateSubscription(server.prisma, request.params.id, request.body);
    return ok(subscription, "Subscription updated");
  });

  server.delete<{ Params: { id: string } }>("/finance/subscriptions/:id", async (request) => {
    await service.deleteSubscription(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });
}
