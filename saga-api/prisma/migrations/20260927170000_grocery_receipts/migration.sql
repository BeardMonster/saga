-- CreateTable
CREATE TABLE "grocery_receipts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT,
    "storeNameRaw" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "totalAmount" DECIMAL(10,2),
    "imagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "grocery_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_receipt_items" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "matchedName" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_receipt_item_aliases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "rawTextKey" TEXT NOT NULL,
    "matchedName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_receipt_item_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grocery_receipt_item_aliases_userId_storeId_rawTextKey_key" ON "grocery_receipt_item_aliases"("userId", "storeId", "rawTextKey");

-- AddForeignKey
ALTER TABLE "grocery_receipts" ADD CONSTRAINT "grocery_receipts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_receipts" ADD CONSTRAINT "grocery_receipts_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "grocery_stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_receipt_items" ADD CONSTRAINT "grocery_receipt_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "grocery_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_receipt_item_aliases" ADD CONSTRAINT "grocery_receipt_item_aliases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_receipt_item_aliases" ADD CONSTRAINT "grocery_receipt_item_aliases_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "grocery_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

