-- Replace the single containsDairy boolean with a freeform allergens tag
-- array, so future allergens don't need a schema change to add.
ALTER TABLE "recipes" DROP COLUMN "containsDairy";
ALTER TABLE "recipes" ADD COLUMN "allergens" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
