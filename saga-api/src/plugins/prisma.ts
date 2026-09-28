import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export default fp(async (server: FastifyInstance) => {
  const prisma = new PrismaClient();
  await prisma.$connect();

  server.decorate("prisma", prisma);

  server.addHook("onClose", async (instance) => {
    await instance.prisma.$disconnect();
  });
});
