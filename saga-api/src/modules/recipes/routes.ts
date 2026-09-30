import type { FastifyInstance } from "fastify";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";

interface RecipeBody {
  title: string;
  description?: string;
  ingredients: string[];
  instructions?: string;
  tags?: string[];
  prepMinutes?: number;
  cookMinutes?: number;
  servings?: number;
  sourceUrl?: string;
  allergens?: string[];
  sourceImagePaths?: string[];
  sourceMediaPaths?: string[];
  sourceTranscript?: string;
}

export default async function recipeRoutes(server: FastifyInstance) {
  server.get("/recipes", async () => ok(await service.listRecipes(server.prisma)));

  server.post<{ Body: RecipeBody }>("/recipes", async (request, reply) => {
    const { title, ingredients } = request.body;
    if (!title?.trim() || !ingredients?.length) {
      reply.code(400);
      return err("title and ingredients are required", 400);
    }
    const recipe = await service.createRecipe(server.prisma, { ...request.body, instructions: request.body.instructions ?? "" });
    reply.code(201);
    return ok(recipe, "Recipe added", 201);
  });

  server.patch<{ Params: { id: string }; Body: Partial<RecipeBody> }>("/recipes/:id", async (request) => {
    const recipe = await service.updateRecipe(server.prisma, request.params.id, request.body);
    return ok(recipe, "Recipe updated");
  });

  server.delete<{ Params: { id: string } }>("/recipes/:id", async (request) => {
    await service.deleteRecipe(server.prisma, request.params.id);
    return ok(null, "Moved to Trash");
  });

  server.patch<{ Body: { ids: string[] } }>("/recipes/reorder", async (request, reply) => {
    if (!Array.isArray(request.body.ids) || request.body.ids.length === 0) {
      reply.code(400);
      return err("ids is required", 400);
    }
    return ok(await service.reorderRecipes(server.prisma, request.body.ids), "Reordered");
  });

  // Takes ingredients directly (not a recipe id) so it works the same way
  // for a brand-new recipe that hasn't been saved yet and for re-scanning
  // an existing one — just a suggestion, the form still has to be saved.
  server.post<{ Body: { ingredients: string[] } }>("/recipes/scan-allergens", async (request, reply) => {
    if (!request.body.ingredients?.length) {
      reply.code(400);
      return err("ingredients is required", 400);
    }
    const suggested = await service.scanAllergens(server.prisma, request.body.ingredients);
    return ok(suggested);
  });
}
