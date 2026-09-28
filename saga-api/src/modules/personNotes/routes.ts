import type { FastifyInstance } from "fastify";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";
import { parseKeepNotes } from "./importParser.js";

export default async function personNotesRoutes(server: FastifyInstance) {
  const prisma = server.prisma;

  // Search across every person's notes.
  server.get<{ Querystring: { q?: string; includePrivate?: string } }>("/people/notes/search", async (request) =>
    ok(await service.searchNotes(prisma, request.query.q ?? "", request.query.includePrivate === "true")),
  );

  server.get<{ Params: { id: string } }>("/people/:id/notes", async (request) => ok(await service.getPersonNotes(prisma, request.params.id)));

  // ── Sections ──
  server.post<{ Params: { id: string }; Body: { title: string; isPrivate?: boolean } }>("/people/:id/sections", async (request, reply) => {
    if (!request.body.title?.trim()) {
      reply.code(400);
      return err("title is required", 400);
    }
    reply.code(201);
    return ok(await service.createSection(prisma, request.params.id, request.body), "Section added", 201);
  });

  server.patch<{ Body: { ids: string[] } }>("/person-sections/reorder", async (request, reply) => {
    if (!Array.isArray(request.body.ids) || request.body.ids.length === 0) {
      reply.code(400);
      return err("ids is required", 400);
    }
    await service.reorderSections(prisma, request.body.ids);
    return ok(null, "Reordered");
  });

  server.patch<{ Params: { sectionId: string }; Body: { title?: string; isPrivate?: boolean } }>("/person-sections/:sectionId", async (request) =>
    ok(await service.updateSection(prisma, request.params.sectionId, request.body), "Section updated"),
  );

  server.delete<{ Params: { sectionId: string } }>("/person-sections/:sectionId", async (request) => {
    await service.deleteSection(prisma, request.params.sectionId);
    return ok(null, "Moved to Trash");
  });

  // ── Notes ──
  server.post<{ Params: { sectionId: string }; Body: { title: string; kind?: "list" | "text"; body?: string } }>(
    "/person-sections/:sectionId/notes",
    async (request, reply) => {
      if (!request.body.title?.trim()) {
        reply.code(400);
        return err("title is required", 400);
      }
      reply.code(201);
      return ok(await service.createNote(prisma, request.params.sectionId, request.body), "Note added", 201);
    },
  );

  server.patch<{ Body: { ids: string[] } }>("/person-notes/reorder", async (request, reply) => {
    if (!Array.isArray(request.body.ids) || request.body.ids.length === 0) {
      reply.code(400);
      return err("ids is required", 400);
    }
    await service.reorderNotes(prisma, request.body.ids);
    return ok(null, "Reordered");
  });

  server.patch<{ Params: { noteId: string }; Body: { title?: string; body?: string | null; sectionId?: string } }>("/person-notes/:noteId", async (request) =>
    ok(await service.updateNote(prisma, request.params.noteId, request.body), "Note updated"),
  );

  server.delete<{ Params: { noteId: string } }>("/person-notes/:noteId", async (request) => {
    await service.deleteNote(prisma, request.params.noteId);
    return ok(null, "Moved to Trash");
  });

  // ── Items ──
  // `lines` creates one item per non-empty line ("Label: value" is split).
  server.post<{ Params: { noteId: string }; Body: { lines?: string[]; text?: string } }>("/person-notes/:noteId/items", async (request, reply) => {
    const lines = request.body.lines ?? (request.body.text ? request.body.text.split("\n") : []);
    if (!lines.some((l) => l.trim())) {
      reply.code(400);
      return err("at least one line of text is required", 400);
    }
    reply.code(201);
    return ok({ created: await service.createItems(prisma, request.params.noteId, lines) }, "Items added", 201);
  });

  server.patch<{ Body: { ids: string[] } }>("/person-note-items/reorder", async (request, reply) => {
    if (!Array.isArray(request.body.ids) || request.body.ids.length === 0) {
      reply.code(400);
      return err("ids is required", 400);
    }
    await service.reorderItems(prisma, request.body.ids);
    return ok(null, "Reordered");
  });

  server.patch<{ Params: { itemId: string }; Body: { text?: string; label?: string | null; isPinned?: boolean; giftStatus?: "idea" | "purchased" | "given"; noteId?: string } }>("/person-note-items/:itemId", async (request, reply) => {
    if (request.body.text !== undefined && !request.body.text.trim()) {
      reply.code(400);
      return err("text cannot be empty", 400);
    }
    return ok(await service.updateItem(prisma, request.params.itemId, request.body), "Item updated");
  });

  server.delete<{ Params: { itemId: string } }>("/person-note-items/:itemId", async (request) => {
    await service.deleteItem(prisma, request.params.itemId);
    return ok(null, "Moved to Trash");
  });

  // ── Import from pasted Keep text ──
  // Preview only parses (nothing is saved); import saves what the user reviewed.
  server.post<{ Params: { id: string }; Body: { text: string } }>("/people/:id/import/preview", async (request, reply) => {
    if (!request.body.text?.trim()) {
      reply.code(400);
      return err("text is required", 400);
    }
    return ok({ notes: parseKeepNotes(request.body.text) });
  });

  server.post<{ Params: { id: string }; Body: { notes: service.ImportNoteInput[] } }>("/people/:id/import", async (request, reply) => {
    if (!Array.isArray(request.body.notes) || request.body.notes.length === 0) {
      reply.code(400);
      return err("notes is required", 400);
    }
    reply.code(201);
    return ok(await service.importNotes(prisma, request.params.id, request.body.notes), "Imported", 201);
  });

  server.post<{ Params: { id: string }; Body: { noteIds: string[] } }>("/people/:id/import/undo", async (request) =>
    ok({ removed: await service.undoImport(prisma, request.params.id, request.body.noteIds ?? []) }, "Import undone"),
  );
}
