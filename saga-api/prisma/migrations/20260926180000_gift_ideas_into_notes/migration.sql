-- AlterTable
ALTER TABLE "person_note_items" ADD COLUMN     "giftStatus" "GiftIdeaStatus";


-- ── Fold the separate Gift Ideas list into normal note items ──────────────

-- 1) Anyone whose sections were never created gets the three defaults now, so
--    every person has a Gift Ideas section to receive their existing ideas.
INSERT INTO "person_sections" ("id", "personId", "title", "isPrivate", "position", "kind")
  SELECT gen_random_uuid()::text, "id", 'Favorites', false, 0, 'notes' FROM "people" WHERE "notesSetUp" = false;
INSERT INTO "person_sections" ("id", "personId", "title", "isPrivate", "position", "kind")
  SELECT gen_random_uuid()::text, "id", 'Gift Ideas', false, 1, 'gift_ideas' FROM "people" WHERE "notesSetUp" = false;
INSERT INTO "person_sections" ("id", "personId", "title", "isPrivate", "position", "kind")
  SELECT gen_random_uuid()::text, "id", 'Private', true, 2, 'notes' FROM "people" WHERE "notesSetUp" = false;
UPDATE "people" SET "notesSetUp" = true WHERE "notesSetUp" = false;

-- 2) One "Ideas" note per person who has gift ideas, placed first in their
--    Gift Ideas section (anything already there shifts down one).
UPDATE "person_notes" SET "position" = "position" + 1
  WHERE "sectionId" IN (
    SELECT s."id" FROM "person_sections" s
    WHERE s."kind" = 'gift_ideas' AND EXISTS (SELECT 1 FROM "gift_ideas" g WHERE g."personId" = s."personId")
  );
INSERT INTO "person_notes" ("id", "sectionId", "title", "kind", "position")
  SELECT gen_random_uuid()::text, s."id", 'Ideas', 'list', 0
  FROM "person_sections" s
  WHERE s."kind" = 'gift_ideas' AND EXISTS (SELECT 1 FROM "gift_ideas" g WHERE g."personId" = s."personId");

-- 3) Copy each gift idea in as an item (keeping its status, date and any
--    Trash state; a link or price estimate is appended to the text).
INSERT INTO "person_note_items" ("id", "noteId", "text", "position", "createdAt", "deletedAt", "giftStatus")
  SELECT
    gen_random_uuid()::text,
    n."id",
    g."description"
      || COALESCE(' ' || g."link", '')
      || CASE WHEN g."priceEstimate" IS NOT NULL THEN ' (~$' || g."priceEstimate"::text || ')' ELSE '' END,
    (row_number() OVER (PARTITION BY g."personId" ORDER BY g."notedAt") - 1)::int,
    g."notedAt",
    g."deletedAt",
    g."status"
  FROM "gift_ideas" g
  JOIN "person_sections" s ON s."personId" = g."personId" AND s."kind" = 'gift_ideas'
  JOIN "person_notes" n ON n."sectionId" = s."id" AND n."title" = 'Ideas' AND n."position" = 0;

-- 4) Items already sitting in a Gift Ideas section (e.g. a note moved there)
--    start as plain ideas.
UPDATE "person_note_items" SET "giftStatus" = 'idea'
  WHERE "giftStatus" IS NULL AND "noteId" IN (
    SELECT n."id" FROM "person_notes" n JOIN "person_sections" s ON s."id" = n."sectionId" WHERE s."kind" = 'gift_ideas'
  );
