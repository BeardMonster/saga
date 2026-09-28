ALTER TABLE "projects" ADD COLUMN "completedAt" TIMESTAMP(3);
-- Backfill any project already marked done so it has a date to show.
UPDATE "projects" SET "completedAt" = NOW() WHERE "status" = 'done' AND "completedAt" IS NULL;
