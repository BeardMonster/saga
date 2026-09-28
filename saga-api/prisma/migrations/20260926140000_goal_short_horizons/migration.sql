ALTER TYPE "GoalHorizon" ADD VALUE 'two_week';
ALTER TYPE "GoalHorizon" ADD VALUE 'one_week';
ALTER TABLE "goals" ADD COLUMN "horizonLabel" TEXT;
