-- CreateEnum
CREATE TYPE "PersonNoteKind" AS ENUM ('list', 'text');

-- AlterTable
ALTER TABLE "people" ADD COLUMN     "notesSetUp" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "person_sections" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "person_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_notes" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "PersonNoteKind" NOT NULL DEFAULT 'list',
    "body" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "person_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_note_items" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "parentId" TEXT,
    "label" TEXT,
    "text" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "person_note_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "person_sections" ADD CONSTRAINT "person_sections_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "person_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_note_items" ADD CONSTRAINT "person_note_items_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "person_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_note_items" ADD CONSTRAINT "person_note_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "person_note_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

