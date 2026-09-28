import type { PrismaClient, Prisma } from "@prisma/client";
import { getCurrentUserId } from "../../lib/currentUser.js";

export async function listPeople(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  const people = await prisma.person.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  // Gift ideas live in each person's Gift Ideas section like any other item;
  // the card just shows how many there are.
  const giftCounts = await prisma.personNoteItem.groupBy({
    by: ["noteId"],
    where: { deletedAt: null, note: { deletedAt: null, section: { deletedAt: null, kind: "gift_ideas", personId: { in: people.map((p) => p.id) } } } },
    _count: { _all: true },
  });
  const giftNotes = await prisma.personNote.findMany({
    where: { id: { in: giftCounts.map((g) => g.noteId) } },
    select: { id: true, section: { select: { personId: true } } },
  });
  const giftCountByPerson = new Map<string, number>();
  for (const g of giftCounts) {
    const personId = giftNotes.find((n) => n.id === g.noteId)?.section.personId;
    if (personId) giftCountByPerson.set(personId, (giftCountByPerson.get(personId) ?? 0) + g._count._all);
  }

  // Up to three pinned facts per person for their card. Anything in a
  // private section is never pinned to the card.
  const pinned = await prisma.personNoteItem.findMany({
    where: {
      isPinned: true,
      deletedAt: null,
      note: { deletedAt: null, section: { deletedAt: null, isPrivate: false, personId: { in: people.map((p) => p.id) } } },
    },
    orderBy: { createdAt: "asc" },
    include: { note: { select: { section: { select: { personId: true } } } } },
  });
  return people.map((person) => ({
    ...person,
    giftIdeaCount: giftCountByPerson.get(person.id) ?? 0,
    pinnedFacts: pinned
      .filter((i) => i.note.section.personId === person.id)
      .slice(0, 3)
      .map((i) => ({ id: i.id, label: i.label, text: i.text })),
  }));
}

export async function reorderPeople(prisma: PrismaClient, ids: string[]) {
  await prisma.$transaction(ids.map((id, position) => prisma.person.update({ where: { id }, data: { position } })));
  return listPeople(prisma);
}

export async function createPerson(
  prisma: PrismaClient,
  input: {
    name: string;
    relationship?: string;
    birthday?: string;
    birthdayYearKnown?: boolean;
    phone?: string;
    discordUserId?: string;
    notes?: string;
    preferences?: Record<string, unknown>;
  },
) {
  const userId = await getCurrentUserId(prisma);
  const last = await prisma.person.aggregate({ where: { userId }, _max: { position: true } });
  return prisma.person.create({
    data: {
      userId,
      name: input.name,
      relationship: input.relationship,
      birthday: input.birthday ? new Date(input.birthday) : undefined,
      birthdayYearKnown: input.birthdayYearKnown,
      phone: input.phone,
      discordUserId: input.discordUserId,
      notes: input.notes,
      preferences: input.preferences as Prisma.InputJsonValue | undefined,
      position: (last._max.position ?? -1) + 1,
    },
  });
}

export async function updatePerson(
  prisma: PrismaClient,
  id: string,
  input: Partial<{ name: string; relationship: string; notes: string; birthday: string | null; birthdayYearKnown: boolean; preferences: Record<string, unknown> }>,
) {
  return prisma.person.update({
    where: { id },
    data: {
      ...input,
      // Birthday is date-only; null clears it.
      birthday: input.birthday === undefined ? undefined : input.birthday ? new Date(input.birthday) : null,
      preferences: input.preferences as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function deletePerson(prisma: PrismaClient, id: string) {
  // Reminder cascades stay linked to the person while they sit in Trash, so
  // restoring the person brings the link back (they're only unlinked on a
  // permanent delete — see hardDeletePerson). Their notes (gift ideas
  // included) simply stay attached and come back with them.
  return prisma.person.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listDeletedPeople(prisma: PrismaClient) {
  const userId = await getCurrentUserId(prisma);
  return prisma.person.findMany({ where: { userId, deletedAt: { not: null } } });
}

export async function restorePerson(prisma: PrismaClient, id: string) {
  return prisma.person.update({ where: { id }, data: { deletedAt: null } });
}

export async function hardDeletePerson(prisma: PrismaClient, id: string) {
  await prisma.reminderCascade.updateMany({ where: { personId: id }, data: { personId: null } });
  // Their notes go too (children first, since items can nest).
  const sections = await prisma.personSection.findMany({ where: { personId: id }, select: { id: true } });
  const sectionIds = sections.map((s) => s.id);
  await prisma.personNoteItem.deleteMany({ where: { note: { sectionId: { in: sectionIds } }, parentId: { not: null } } });
  await prisma.personNoteItem.deleteMany({ where: { note: { sectionId: { in: sectionIds } } } });
  await prisma.personNote.deleteMany({ where: { sectionId: { in: sectionIds } } });
  await prisma.personSection.deleteMany({ where: { personId: id } });
  return prisma.person.delete({ where: { id } });
}
