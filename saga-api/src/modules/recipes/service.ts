import { unlink } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";
import { runAiTask } from "../../lib/ai/taskRunner.js";
import { COMMON_ALLERGENS } from "./allergens.js";

// A suggestion, not an auto-apply — returned to the edit form for the user
// to review/uncheck before saving, matching the app's propose-then-confirm
// pattern everywhere else. Re-running this on an existing recipe is exactly
// how a newly-added allergen category gets backfilled onto old recipes
// later, without needing a schema change or a separate batch job.
// The object-with-one-array-field shape and worked example both matter in
// practice — confirmed directly that llama3.1:8b, asked for a bare JSON
// array under format:"json", instead returned a template object mapping
// every allergen name to null without actually reasoning about the
// ingredients at all. This shape reliably gets a real, filtered answer.
export async function scanAllergens(prisma: PrismaClient, ingredients: string[]): Promise<string[]> {
  const prompt =
    `Read the ingredient list below and decide which allergens from this list are actually present: ` +
    `${COMMON_ALLERGENS.join(", ")}. Also include any other clear allergen not on that list (e.g. mustard, sulfites, corn). ` +
    `Only include an allergen if an ingredient actually contains it — most recipes only trigger a few of these, not all of them.\n\n` +
    `Example — ingredients "2 cups flour, 1 cup milk, 1/4 cup peanut butter" contain Wheat (flour), Milk, and Peanuts, ` +
    `so the correct response is: {"presentAllergens": ["Wheat", "Milk", "Peanuts"]}\n\n` +
    `Respond with ONLY valid JSON of the shape {"presentAllergens": string[]} — an empty array if genuinely none apply.\n\n` +
    `Ingredients:\n${ingredients.map((i) => `- ${i}`).join("\n")}`;

  const result = (await runAiTask(prisma, "recipe_allergen_scan", prompt)) as { presentAllergens?: unknown };
  return Array.isArray(result.presentAllergens) ? (result.presentAllergens as string[]) : [];
}

export async function listRecipes(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.recipe.findMany({ where: { userId, deletedAt: null }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
}

export async function reorderRecipes(prisma: PrismaClient, ids: string[]) {
  await prisma.$transaction(ids.map((id, position) => prisma.recipe.update({ where: { id }, data: { position } })));
  return listRecipes(prisma);
}

export async function createRecipe(
  prisma: PrismaClient,
  input: {
    title: string;
    description?: string;
    ingredients: string[];
    instructions: string;
    tags?: string[];
    prepMinutes?: number;
    cookMinutes?: number;
    servings?: number;
    sourceUrl?: string;
    allergens?: string[];
    // Keepsake media a recipe was captured from — a recipe card photo
    // (front/back) or a voice/video recording and its transcript.
    sourceImagePaths?: string[];
    sourceMediaPaths?: string[];
    sourceTranscript?: string;
  },
) {
  const userId = await getCurrentUserId(prisma);
  const last = await prisma.recipe.aggregate({ where: { userId }, _max: { position: true } });
  return prisma.recipe.create({
    data: {
      userId,
      title: input.title,
      description: input.description,
      ingredients: input.ingredients,
      instructions: input.instructions,
      tags: input.tags ?? [],
      prepMinutes: input.prepMinutes,
      cookMinutes: input.cookMinutes,
      servings: input.servings,
      sourceUrl: input.sourceUrl,
      allergens: input.allergens ?? [],
      sourceImagePaths: input.sourceImagePaths ?? [],
      sourceMediaPaths: input.sourceMediaPaths ?? [],
      sourceTranscript: input.sourceTranscript,
      position: (last._max.position ?? -1) + 1,
    },
  });
}

export async function updateRecipe(
  prisma: PrismaClient,
  id: string,
  input: Partial<{
    title: string;
    description: string;
    ingredients: string[];
    instructions: string;
    tags: string[];
    prepMinutes: number;
    cookMinutes: number;
    servings: number;
    sourceUrl: string;
    allergens: string[];
  }>,
) {
  return prisma.recipe.update({ where: { id }, data: input });
}

export async function deleteRecipe(prisma: PrismaClient, id: string) {
  return prisma.recipe.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listDeletedRecipes(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.recipe.findMany({ where: { userId, deletedAt: { not: null } } });
}

export async function restoreRecipe(prisma: PrismaClient, id: string) {
  return prisma.recipe.update({ where: { id }, data: { deletedAt: null } });
}

// The only trash type with real files to clean up — the original card
// photo(s) and/or voice/video recording a recipe was captured from. Only
// ever called once a recipe is actually gone for good (an explicit "delete
// forever" or the 30-day auto-purge), never on the soft delete itself,
// since the files still need to exist for a restore to make sense.
export async function hardDeleteRecipe(prisma: PrismaClient, id: string) {
  const recipe = await prisma.recipe.findUniqueOrThrow({ where: { id } });
  await Promise.all([...recipe.sourceImagePaths, ...recipe.sourceMediaPaths].map((p) => unlink(p).catch(() => undefined)));
  return prisma.recipe.delete({ where: { id } });
}
