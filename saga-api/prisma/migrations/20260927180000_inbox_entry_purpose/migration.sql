-- AlterTable
ALTER TABLE "inbox_entries" ADD COLUMN     "purpose" TEXT;

-- Backfill: every existing image-kind entry predates receipts, so it must
-- be a recipe photo.
UPDATE "inbox_entries" SET "purpose" = 'recipe' WHERE "kind" = 'image' AND "purpose" IS NULL;
