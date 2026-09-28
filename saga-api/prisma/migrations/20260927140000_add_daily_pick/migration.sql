-- CreateTable
CREATE TABLE "daily_picks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "pickedDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_picks_pkey" PRIMARY KEY ("id")
);
-- AddForeignKey
ALTER TABLE "daily_picks" ADD CONSTRAINT "daily_picks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "daily_picks" ADD CONSTRAINT "daily_picks_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "checklist_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
