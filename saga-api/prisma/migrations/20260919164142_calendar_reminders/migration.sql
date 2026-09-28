-- CreateEnum
CREATE TYPE "ReminderSubjectType" AS ENUM ('goal', 'freeform');

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "location" TEXT,
    "recurrenceRule" TEXT,
    "externalRef" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_cascades" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "cadenceDays" INTEGER[],
    "subjectType" "ReminderSubjectType" NOT NULL DEFAULT 'freeform',
    "goalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_cascades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_instances" (
    "id" TEXT NOT NULL,
    "cascadeId" TEXT NOT NULL,
    "fireAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "reminder_instances_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_cascades" ADD CONSTRAINT "reminder_cascades_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_cascades" ADD CONSTRAINT "reminder_cascades_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_instances" ADD CONSTRAINT "reminder_instances_cascadeId_fkey" FOREIGN KEY ("cascadeId") REFERENCES "reminder_cascades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
