ALTER TYPE "ChecklistKind" ADD VALUE 'note';
CREATE TYPE "ProjectPage" AS ENUM ('projects', 'checklists');
ALTER TABLE "projects" ADD COLUMN "page" "ProjectPage" NOT NULL DEFAULT 'projects';
ALTER TABLE "checklists" ADD COLUMN "description" TEXT, ADD COLUMN "body" TEXT;
