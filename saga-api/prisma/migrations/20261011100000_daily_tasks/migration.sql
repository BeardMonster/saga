-- CreateTable
CREATE TABLE "daily_tasks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "daysOfWeek" INTEGER[],
    "reminderTime" TEXT,
    "lastRemindedOn" DATE,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "daily_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_task_completions" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_task_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_task_completions_taskId_day_key" ON "daily_task_completions"("taskId", "day");

-- AddForeignKey
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_task_completions" ADD CONSTRAINT "daily_task_completions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "daily_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

