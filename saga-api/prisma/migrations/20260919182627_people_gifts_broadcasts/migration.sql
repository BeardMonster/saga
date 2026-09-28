-- CreateEnum
CREATE TYPE "GiftIdeaStatus" AS ENUM ('idea', 'purchased', 'given');

-- CreateEnum
CREATE TYPE "BroadcastChannel" AS ENUM ('sms', 'discord');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('draft', 'sent', 'failed');

-- AlterEnum
ALTER TYPE "ReminderSubjectType" ADD VALUE 'person';

-- AlterTable
ALTER TABLE "reminder_cascades" ADD COLUMN     "personId" TEXT;

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "birthday" TIMESTAMP(3),
    "phone" TEXT,
    "discordUserId" TEXT,
    "notes" TEXT,
    "preferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_ideas" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "link" TEXT,
    "priceEstimate" DECIMAL(10,2),
    "status" "GiftIdeaStatus" NOT NULL DEFAULT 'idea',
    "notedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "messageBody" TEXT NOT NULL,
    "channels" "BroadcastChannel"[],
    "recipientIds" TEXT[],
    "status" "BroadcastStatus" NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "reminder_cascades" ADD CONSTRAINT "reminder_cascades_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_ideas" ADD CONSTRAINT "gift_ideas_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
