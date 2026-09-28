import type { FastifyInstance } from "fastify";
import type { InvestmentAccountType } from "@prisma/client";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";

export default async function investmentRoutes(server: FastifyInstance) {
  server.get("/investments/accounts", async () => ok(await service.listInvestmentAccounts(server.prisma)));

  server.post<{ Body: { institution: string; accountType: InvestmentAccountType; last4?: string } }>(
    "/investments/accounts",
    async (request, reply) => {
      const { institution, accountType } = request.body;
      if (!institution?.trim() || !accountType) {
        reply.code(400);
        return err("institution and accountType are required", 400);
      }
      const account = await service.createInvestmentAccount(server.prisma, request.body);
      reply.code(201);
      return ok(account, "Investment account added", 201);
    },
  );

  server.patch<{ Params: { id: string }; Body: Partial<{ institution: string; accountType: InvestmentAccountType; last4: string }> }>(
    "/investments/accounts/:id",
    async (request) => {
      const account = await service.updateInvestmentAccount(server.prisma, request.params.id, request.body);
      return ok(account, "Investment account updated");
    },
  );

  server.delete<{ Params: { id: string } }>("/investments/accounts/:id", async (request) => {
    await service.deleteInvestmentAccount(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });

  server.post<{
    Params: { id: string };
    Body: { asOfDate: string; totalValue: number; contributionsThisPeriod?: number; sourceStatementRef?: string };
  }>("/investments/accounts/:id/snapshots", async (request, reply) => {
    const { asOfDate, totalValue } = request.body;
    if (!asOfDate || totalValue === undefined) {
      reply.code(400);
      return err("asOfDate and totalValue are required", 400);
    }
    const snapshot = await service.addBalanceSnapshot(server.prisma, {
      investmentAccountId: request.params.id,
      ...request.body,
    });
    reply.code(201);
    return ok(snapshot, "Balance snapshot recorded", 201);
  });

  server.delete<{ Params: { id: string; snapshotId: string } }>(
    "/investments/accounts/:id/snapshots/:snapshotId",
    async (request) => {
      await service.deleteBalanceSnapshot(server.prisma, request.params.snapshotId);
      return ok(null, "Moved to Trash");
    },
  );
}
