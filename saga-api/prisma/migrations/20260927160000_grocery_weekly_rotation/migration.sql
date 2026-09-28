-- AlterTable
ALTER TABLE "checklists" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "grocery_catalog_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "timesAppeared" INTEGER NOT NULL DEFAULT 0,
    "timesBought" INTEGER NOT NULL DEFAULT 0,
    "lastAddedAt" TIMESTAMP(3),
    "lastBoughtAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grocery_catalog_items_userId_nameKey_key" ON "grocery_catalog_items"("userId", "nameKey");

-- AddForeignKey
ALTER TABLE "grocery_catalog_items" ADD CONSTRAINT "grocery_catalog_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

