-- CreateTable
CREATE TABLE "ai_target_type_instructions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_target_type_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_target_type_instructions_userId_targetType_key" ON "ai_target_type_instructions"("userId", "targetType");

-- AddForeignKey
ALTER TABLE "ai_target_type_instructions" ADD CONSTRAINT "ai_target_type_instructions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

