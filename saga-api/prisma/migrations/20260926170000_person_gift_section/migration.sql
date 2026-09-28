-- CreateEnum
CREATE TYPE "PersonSectionKind" AS ENUM ('notes', 'gift_ideas');

-- AlterTable
ALTER TABLE "person_sections" ADD COLUMN     "kind" "PersonSectionKind" NOT NULL DEFAULT 'notes';


-- Existing people whose sections were already created get a Gift Ideas
-- section in second place (after Favorites); everything after it shifts down.
UPDATE "person_sections" SET "position" = "position" + 1
  WHERE "position" >= 1 AND "personId" IN (SELECT "id" FROM "people" WHERE "notesSetUp" = true);
INSERT INTO "person_sections" ("id", "personId", "title", "isPrivate", "position", "kind")
  SELECT gen_random_uuid()::text, "id", 'Gift Ideas', false, 1, 'gift_ideas' FROM "people" WHERE "notesSetUp" = true;
