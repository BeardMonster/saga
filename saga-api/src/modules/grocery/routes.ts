import type { FastifyInstance } from "fastify";
import type { GroceryStoreSource } from "@prisma/client";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";
import { buildCandidatePool, listReceipts } from "./receipts.js";
import { getCurrentUserId } from "../../lib/currentUser.js";

const SCANNER_URL = process.env.GROCERY_SCANNER_URL ?? "http://host.docker.internal:8200";

export default async function groceryRoutes(server: FastifyInstance) {
  // ── Stores ──────────────────────────────────────────────────────────
  server.get("/grocery/stores", async () => ok(await service.listStores(server.prisma)));

  server.post<{ Body: { name: string; flippSlug?: string; source?: GroceryStoreSource; externalConfig?: Record<string, unknown> } }>(
    "/grocery/stores",
    async (request, reply) => {
      if (!request.body.name?.trim()) {
        reply.code(400);
        return err("name is required", 400);
      }
      const store = await service.createStore(server.prisma, request.body);
      reply.code(201);
      return ok(store, "Store added", 201);
    },
  );

  server.patch<{
    Params: { id: string };
    Body: Partial<{ name: string; flippSlug: string | null; source: GroceryStoreSource; externalConfig: Record<string, unknown> }>;
  }>("/grocery/stores/:id", async (request) => ok(await service.updateStore(server.prisma, request.params.id, request.body), "Store updated"));

  server.delete<{ Params: { id: string } }>("/grocery/stores/:id", async (request) => {
    await service.deleteStore(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });

  server.patch<{ Body: { ids: string[] } }>("/grocery/stores/reorder", async (request, reply) => {
    if (!Array.isArray(request.body.ids) || request.body.ids.length === 0) {
      reply.code(400);
      return err("ids is required", 400);
    }
    return ok(await service.reorderStores(server.prisma, request.body.ids), "Reordered");
  });

  // ── Shopping list items ─────────────────────────────────────────────
  server.get("/grocery/shopping-list", async () => ok(await service.listShoppingListItems(server.prisma)));

  server.post<{ Body: { name: string } }>("/grocery/shopping-list", async (request, reply) => {
    if (!request.body.name?.trim()) {
      reply.code(400);
      return err("name is required", 400);
    }
    const item = await service.createShoppingListItem(server.prisma, request.body.name);
    reply.code(201);
    return ok(item, "Added to shopping list", 201);
  });

  server.patch<{ Params: { id: string }; Body: { name: string } }>(
    "/grocery/shopping-list/:id",
    async (request, reply) => {
      if (!request.body.name?.trim()) {
        reply.code(400);
        return err("name is required", 400);
      }
      return ok(await service.updateShoppingListItem(server.prisma, request.params.id, request.body.name), "Updated");
    },
  );

  server.delete<{ Params: { id: string } }>("/grocery/shopping-list/:id", async (request) => {
    await service.deleteShoppingListItem(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });

  server.patch<{ Body: { ids: string[] } }>("/grocery/shopping-list/reorder", async (request, reply) => {
    if (!Array.isArray(request.body.ids) || request.body.ids.length === 0) {
      reply.code(400);
      return err("ids is required", 400);
    }
    return ok(await service.reorderShoppingListItems(server.prisma, request.body.ids), "Reordered");
  });

  // ── Deals + comparison ───────────────────────────────────────────────
  server.get("/grocery/comparison", async () => ok(await service.getComparison(server.prisma)));

  // Manual override for the automatic weekly rotation (see scheduler.ts) —
  // not currently exposed in the UI, but available if a "do it now" button
  // ever makes sense.
  server.post("/grocery/start-new-week", async () => ok(await service.startNewWeek(server.prisma), "Started a new week"));

  server.get("/grocery/catalog", async () => ok(await service.listCatalog(server.prisma)));

  // This week's checklist items + the full historical catalog, merged —
  // used to populate the "what is this" dropdown when reviewing a scanned
  // receipt (see inbox/targetTypes.ts's grocery_receipt entry).
  server.get("/grocery/item-suggestions", async () => {
    const userId = await getCurrentUserId(server.prisma);
    return ok(await buildCandidatePool(server.prisma, userId));
  });

  server.get("/grocery/receipts", async () => ok(await listReceipts(server.prisma)));

  // Called by the saga-grocery-scanner service to record what it found —
  // not something the web UI posts to directly.
  server.post<{
    Body: {
      shoppingListItemId: string;
      storeId: string;
      matchedProductName: string;
      price: number;
      unitPrice?: number;
      unit?: string;
      validFrom?: string;
      validTo?: string;
      sourceUrl?: string;
    };
  }>("/grocery/deals", async (request, reply) => {
    const { shoppingListItemId, storeId, matchedProductName, price } = request.body;
    if (!shoppingListItemId || !storeId || !matchedProductName?.trim() || price == null) {
      reply.code(400);
      return err("shoppingListItemId, storeId, matchedProductName, and price are required", 400);
    }
    const deal = await service.recordDeal(server.prisma, request.body);
    reply.code(201);
    return ok(deal, "Deal recorded", 201);
  });

  // Proxied so the browser never has to reach the scanner service
  // directly — same reasoning as every other cross-service call in this
  // app going through saga-api rather than straight from the frontend.
  server.post("/grocery/scan", async (_request, reply) => {
    try {
      const res = await fetch(`${SCANNER_URL}/scan`, { method: "POST" });
      const body = await res.json();
      return ok(body);
    } catch (error) {
      reply.code(502);
      return err(`Couldn't reach the grocery scanner service: ${(error as Error).message}`, 502);
    }
  });

  server.get("/grocery/scan-status", async (_request, reply) => {
    try {
      const res = await fetch(`${SCANNER_URL}/status`);
      const body = await res.json();
      return ok(body);
    } catch (error) {
      reply.code(502);
      return err(`Couldn't reach the grocery scanner service: ${(error as Error).message}`, 502);
    }
  });
}
