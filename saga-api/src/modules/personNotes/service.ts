import type { GiftIdeaStatus, PersonNoteKind, PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";

// Created the first time a person's page opens (see getPersonNotes). The
// user can rename, delete or add to them freely afterward.
const DEFAULT_SECTIONS: { title: string; isPrivate?: boolean; kind?: "notes" | "gift_ideas" }[] = [
  { title: "Favorites" },
  { title: "Gift Ideas", kind: "gift_ideas" },
  { title: "Private", isPrivate: true },
];

export async function getPersonNotes(prisma: PrismaClient, personId: string) {
  const person = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
  if (!person.notesSetUp) {
    await prisma.$transaction([
      prisma.personSection.createMany({
        data: DEFAULT_SECTIONS.map((s, position) => ({ personId, title: s.title, isPrivate: s.isPrivate ?? false, kind: s.kind ?? "notes", position })),
      }),
      prisma.person.update({ where: { id: personId }, data: { notesSetUp: true } }),
    ]);
  }
  return prisma.personSection.findMany({
    where: { personId, deletedAt: null },
    orderBy: { position: "asc" },
    include: {
      notes: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        include: {
          items: {
            where: { deletedAt: null, parentId: null },
            orderBy: { position: "asc" },
            include: { children: { where: { deletedAt: null }, orderBy: { position: "asc" } } },
          },
        },
      },
    },
  });
}

// "Flower: Lilies" -> label "Flower", text "Lilies". Lines with no short
// label before a colon (including bare links) are kept whole as text.
function parseLine(raw: string): { label: string | null; text: string } | null {
  const line = raw.trim().replace(/^[-*•]\s+/, "");
  if (!line) return null;
  const m = line.match(/^([^:/]{1,40}?):\s+(.+)$/);
  return m ? { label: m[1].trim(), text: m[2].trim() } : { label: null, text: line };
}

const nextPosition = (max: number | null | undefined) => (max ?? -1) + 1;

// ── Sections ────────────────────────────────────────────────────────────

export async function createSection(prisma: PrismaClient, personId: string, input: { title: string; isPrivate?: boolean }) {
  const last = await prisma.personSection.aggregate({ where: { personId }, _max: { position: true } });
  return prisma.personSection.create({
    data: { personId, title: input.title, isPrivate: input.isPrivate ?? false, position: nextPosition(last._max.position) },
  });
}

export async function updateSection(prisma: PrismaClient, id: string, input: { title?: string; isPrivate?: boolean }) {
  return prisma.personSection.update({ where: { id }, data: input });
}

export async function reorderSections(prisma: PrismaClient, ids: string[]) {
  await prisma.$transaction(ids.map((id, position) => prisma.personSection.update({ where: { id }, data: { position } })));
}

// Deleting a parent stamps its live children with the same time, so a
// restore brings back exactly what was deleted with it — not anything that
// was already in Trash on its own beforehand.
export async function deleteSection(prisma: PrismaClient, id: string) {
  const section = await prisma.personSection.findUniqueOrThrow({ where: { id } });
  if (section.kind === "gift_ideas") throw new Error("The Gift Ideas section can't be deleted");
  const now = new Date();
  await prisma.personNoteItem.updateMany({ where: { note: { sectionId: id }, deletedAt: null }, data: { deletedAt: now } });
  await prisma.personNote.updateMany({ where: { sectionId: id, deletedAt: null }, data: { deletedAt: now } });
  return prisma.personSection.update({ where: { id }, data: { deletedAt: now } });
}

export async function restoreSection(prisma: PrismaClient, id: string) {
  const section = await prisma.personSection.findUniqueOrThrow({ where: { id } });
  if (section.deletedAt) {
    await prisma.personNoteItem.updateMany({ where: { note: { sectionId: id }, deletedAt: section.deletedAt }, data: { deletedAt: null } });
    await prisma.personNote.updateMany({ where: { sectionId: id, deletedAt: section.deletedAt }, data: { deletedAt: null } });
  }
  return prisma.personSection.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteSection(prisma: PrismaClient, id: string) {
  await prisma.personNoteItem.deleteMany({ where: { note: { sectionId: id }, parentId: { not: null } } });
  await prisma.personNoteItem.deleteMany({ where: { note: { sectionId: id } } });
  await prisma.personNote.deleteMany({ where: { sectionId: id } });
  return prisma.personSection.delete({ where: { id } });
}

export async function listDeletedSections(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.personSection.findMany({ where: { deletedAt: { not: null }, person: { userId, deletedAt: null } } });
}

// ── Notes ───────────────────────────────────────────────────────────────

export async function createNote(
  prisma: PrismaClient,
  sectionId: string,
  input: { title: string; kind?: PersonNoteKind; body?: string },
) {
  const last = await prisma.personNote.aggregate({ where: { sectionId }, _max: { position: true } });
  return prisma.personNote.create({
    data: { sectionId, title: input.title, kind: input.kind ?? "list", body: input.body || undefined, position: nextPosition(last._max.position) },
  });
}

export async function updateNote(prisma: PrismaClient, id: string, input: { title?: string; body?: string | null; sectionId?: string }) {
  let position: number | undefined;
  if (input.sectionId) {
    const last = await prisma.personNote.aggregate({ where: { sectionId: input.sectionId }, _max: { position: true } });
    position = nextPosition(last._max.position);
  }
  return prisma.personNote.update({
    where: { id },
    data: { title: input.title, sectionId: input.sectionId, position, body: input.body === "" ? null : input.body },
  });
}

export async function reorderNotes(prisma: PrismaClient, ids: string[]) {
  await prisma.$transaction(ids.map((id, position) => prisma.personNote.update({ where: { id }, data: { position } })));
}

export async function deleteNote(prisma: PrismaClient, id: string) {
  const now = new Date();
  await prisma.personNoteItem.updateMany({ where: { noteId: id, deletedAt: null }, data: { deletedAt: now } });
  return prisma.personNote.update({ where: { id }, data: { deletedAt: now } });
}

export async function restoreNote(prisma: PrismaClient, id: string) {
  const note = await prisma.personNote.findUniqueOrThrow({ where: { id } });
  if (note.deletedAt) {
    await prisma.personNoteItem.updateMany({ where: { noteId: id, deletedAt: note.deletedAt }, data: { deletedAt: null } });
  }
  return prisma.personNote.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteNote(prisma: PrismaClient, id: string) {
  await prisma.personNoteItem.deleteMany({ where: { noteId: id, parentId: { not: null } } });
  await prisma.personNoteItem.deleteMany({ where: { noteId: id } });
  return prisma.personNote.delete({ where: { id } });
}

// Only notes deleted on their own — ones that went with a deleted section
// come back with that section, so they aren't listed separately.
export async function listDeletedNotes(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.personNote.findMany({ where: { deletedAt: { not: null }, section: { deletedAt: null, person: { userId, deletedAt: null } } } });
}

// ── Items ───────────────────────────────────────────────────────────────

// One item per non-empty line, so several can be pasted or typed at once.
export async function createItems(prisma: PrismaClient, noteId: string, lines: string[]) {
  const note = await prisma.personNote.findUniqueOrThrow({ where: { id: noteId }, include: { section: { select: { kind: true } } } });
  const giftStatus = note.section.kind === "gift_ideas" ? ("idea" as const) : undefined;
  const parsed = lines.map(parseLine).filter((p): p is { label: string | null; text: string } => p !== null);
  const last = await prisma.personNoteItem.aggregate({ where: { noteId, parentId: null }, _max: { position: true } });
  const start = nextPosition(last._max.position);
  await prisma.personNoteItem.createMany({ data: parsed.map((p, i) => ({ noteId, label: p.label, text: p.text, giftStatus, position: start + i })) });
  return parsed.length;
}

export async function updateItem(
  prisma: PrismaClient,
  id: string,
  input: { text?: string; label?: string | null; isPinned?: boolean; giftStatus?: GiftIdeaStatus; noteId?: string },
) {
  // Moving to another note: goes to the end of it. Items moved into the Gift
  // Ideas section start as plain ideas; moved out, they drop the status.
  let move: { noteId: string; parentId: null; position: number; giftStatus: GiftIdeaStatus | null } | undefined;
  if (input.noteId) {
    const [item, target] = await Promise.all([
      prisma.personNoteItem.findUniqueOrThrow({ where: { id } }),
      prisma.personNote.findUniqueOrThrow({ where: { id: input.noteId }, include: { section: { select: { kind: true } } } }),
    ]);
    const last = await prisma.personNoteItem.aggregate({ where: { noteId: input.noteId, parentId: null }, _max: { position: true } });
    move = {
      noteId: input.noteId,
      parentId: null,
      position: nextPosition(last._max.position),
      giftStatus: target.section.kind === "gift_ideas" ? (item.giftStatus ?? "idea") : null,
    };
  }
  return prisma.personNoteItem.update({
    where: { id },
    data: {
      text: input.text,
      label: input.label === "" ? null : input.label,
      isPinned: input.isPinned,
      ...(move ?? { giftStatus: input.giftStatus }),
    },
  });
}

// Used by Brain Dump: files a gift idea under the person's Gift Ideas section
// (creating the section and an "Ideas" note if they don't exist yet).
export async function addGiftIdeaItem(prisma: PrismaClient, personId: string, input: { description: string; link?: string }) {
  const sections = await getPersonNotes(prisma, personId);
  const gift = sections.find((s) => s.kind === "gift_ideas");
  if (!gift) throw new Error("This person has no Gift Ideas section");
  const noteId = gift.notes[0]?.id ?? (await createNote(prisma, gift.id, { title: "Ideas" })).id;
  const last = await prisma.personNoteItem.aggregate({ where: { noteId, parentId: null }, _max: { position: true } });
  return prisma.personNoteItem.create({
    data: { noteId, text: input.link ? `${input.description} ${input.link}` : input.description, giftStatus: "idea", position: nextPosition(last._max.position) },
  });
}

export async function reorderItems(prisma: PrismaClient, ids: string[]) {
  await prisma.$transaction(ids.map((id, position) => prisma.personNoteItem.update({ where: { id }, data: { position } })));
}

export async function deleteItem(prisma: PrismaClient, id: string) {
  const now = new Date();
  await prisma.personNoteItem.updateMany({ where: { parentId: id, deletedAt: null }, data: { deletedAt: now } });
  return prisma.personNoteItem.update({ where: { id }, data: { deletedAt: now } });
}

export async function restoreItem(prisma: PrismaClient, id: string) {
  const item = await prisma.personNoteItem.findUniqueOrThrow({ where: { id } });
  if (item.deletedAt) {
    await prisma.personNoteItem.updateMany({ where: { parentId: id, deletedAt: item.deletedAt }, data: { deletedAt: null } });
  }
  return prisma.personNoteItem.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeleteItem(prisma: PrismaClient, id: string) {
  await prisma.personNoteItem.deleteMany({ where: { parentId: id } });
  return prisma.personNoteItem.delete({ where: { id } });
}

export async function listDeletedItems(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.personNoteItem.findMany({
    where: { deletedAt: { not: null }, note: { deletedAt: null, section: { deletedAt: null, person: { userId, deletedAt: null } } }, OR: [{ parentId: null }, { parent: { deletedAt: null } }] },
  });
}

// ── Search ──────────────────────────────────────────────────────────────

// Searches every person's notes. Private sections are left out unless asked
// for explicitly.
export async function searchNotes(prisma: PrismaClient, query: string, includePrivate: boolean) {
  const term = query.trim();
  if (term.length < 2) return [];
  const userId = await getCurrentUserId(prisma);
  const contains = { contains: term, mode: "insensitive" as const };
  const sectionFilter = { deletedAt: null, ...(includePrivate ? {} : { isPrivate: false }), person: { userId, deletedAt: null } };
  const include = { section: { include: { person: { select: { id: true, name: true } } } } };

  const [items, notes] = await Promise.all([
    prisma.personNoteItem.findMany({
      where: { deletedAt: null, OR: [{ text: contains }, { label: contains }], note: { deletedAt: null, section: sectionFilter } },
      include: { note: { include } },
      take: 50,
    }),
    prisma.personNote.findMany({
      where: { deletedAt: null, OR: [{ title: contains }, { body: contains }], section: sectionFilter },
      include,
      take: 25,
    }),
  ]);

  return [
    ...items.map((i) => ({
      personId: i.note.section.person.id,
      personName: i.note.section.person.name,
      sectionId: i.note.section.id,
      sectionTitle: i.note.section.title,
      isPrivate: i.note.section.isPrivate,
      noteId: i.note.id,
      noteTitle: i.note.title,
      anchor: `item-${i.id}` as string | null,
      itemId: i.id as string | null,
      label: i.label,
      text: i.text,
    })),
    ...notes.map((n) => ({
      personId: n.section.person.id,
      personName: n.section.person.name,
      sectionId: n.section.id,
      sectionTitle: n.section.title,
      isPrivate: n.section.isPrivate,
      noteId: n.id,
      noteTitle: n.title,
      anchor: `note-${n.id}` as string | null,
      itemId: null,
      label: null,
      text: n.body ?? n.title,
    })),
  ];
}

// ── Import from pasted Keep text ────────────────────────────────────────

export interface ImportNoteInput {
  title: string;
  kind: "list" | "text";
  body?: string | null;
  // Either an existing section of this person, or a title to use/create.
  sectionId?: string;
  newSectionTitle?: string;
  items: { label?: string | null; text: string; children?: { label?: string | null; text: string }[] }[];
}

// Saves the reviewed notes. Every section id must belong to this person; new
// sections are matched by title (case-insensitive) before being created.
export async function importNotes(prisma: PrismaClient, personId: string, notes: ImportNoteInput[]) {
  await getPersonNotes(prisma, personId); // makes sure the default sections exist
  const sections = await prisma.personSection.findMany({ where: { personId, deletedAt: null } });
  const byId = new Map(sections.map((s) => [s.id, s]));
  const byTitle = new Map(sections.map((s) => [s.title.toLowerCase(), s]));

  const noteIds: string[] = [];
  let itemCount = 0;

  for (const n of notes) {
    let section = n.sectionId ? byId.get(n.sectionId) : undefined;
    if (n.sectionId && !section) throw new Error("Section not found for this person");
    if (!section) {
      const title = (n.newSectionTitle ?? "").trim() || "Unsorted";
      section = byTitle.get(title.toLowerCase());
      if (!section) {
        section = await createSection(prisma, personId, { title, isPrivate: title.toLowerCase() === "private" });
        byId.set(section.id, section);
        byTitle.set(title.toLowerCase(), section);
      }
    }

    const note = await createNote(prisma, section.id, { title: n.title.trim() || "Untitled", kind: n.kind, body: n.body ?? undefined });
    noteIds.push(note.id);
    if (n.kind === "text") continue;

    const giftStatus = section.kind === "gift_ideas" ? ("idea" as const) : undefined;
    for (const [position, item] of n.items.entries()) {
      const text = item.text.trim();
      if (!text) continue;
      const created = await prisma.personNoteItem.create({
        data: { noteId: note.id, label: item.label?.trim() || null, text, giftStatus, position },
      });
      itemCount++;
      for (const [childPosition, child] of (item.children ?? []).entries()) {
        if (!child.text.trim()) continue;
        await prisma.personNoteItem.create({
          data: { noteId: note.id, parentId: created.id, label: child.label?.trim() || null, text: child.text.trim(), position: childPosition },
        });
        itemCount++;
      }
    }
  }
  return { noteIds, itemCount };
}

// Undo for an import: sends the notes it created (and their items) to Trash.
export async function undoImport(prisma: PrismaClient, personId: string, noteIds: string[]) {
  let removed = 0;
  for (const id of noteIds) {
    const note = await prisma.personNote.findFirst({ where: { id, deletedAt: null, section: { personId } } });
    if (!note) continue;
    await deleteNote(prisma, id);
    removed++;
  }
  return removed;
}
