-- AlterTable
ALTER TABLE "reminder_cascades" ADD COLUMN     "fireTime" TEXT NOT NULL DEFAULT '09:00';

-- AlterTable
ALTER TABLE "reminder_instances" ADD COLUMN     "nagAt" TIMESTAMP(3);

-- Data: instances not yet sent were stored at midnight UTC of their date, which
-- fires around 8 PM the evening before. Move each one to 09:00 America/New_York
-- on that same date. The column is a timestamp WITHOUT time zone holding UTC
-- wall-clock, so: take the UTC date, add 09:00 as a New York local time, convert
-- that instant back to UTC wall-clock. Already-sent instances are history; leave them.
UPDATE "reminder_instances"
SET "fireAt" = ((("fireAt"::date + TIME '09:00') AT TIME ZONE 'America/New_York') AT TIME ZONE 'UTC')
WHERE "sentAt" IS NULL;
