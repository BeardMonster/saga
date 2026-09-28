import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { ok, err } from "../../lib/envelope.js";
import * as service from "./service.js";

const UPLOAD_DIR = service.UPLOAD_DIR;

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
};

async function saveUploadedFiles(request: import("fastify").FastifyRequest): Promise<string[]> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const paths: string[] = [];
  for await (const part of request.files()) {
    const destPath = join(UPLOAD_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}${extname(part.filename)}`);
    await pipeline(part.file, createWriteStream(destPath));
    paths.push(destPath);
  }
  return paths;
}

export default async function inboxRoutes(server: FastifyInstance) {
  server.get("/inbox", async () => ok(await service.listPending(server.prisma)));

  server.post("/inbox/discard-all", async () => ok(await service.discardAllPending(server.prisma), "Cleared"));

  server.post<{ Body: { text: string; as?: "recipe" } }>("/inbox/text", async (request, reply) => {
    if (!request.body?.text?.trim()) {
      reply.code(400);
      return err("text is required", 400);
    }
    const entry = await service.createTextEntry(server.prisma, request.body.text, request.body.as);
    reply.code(201);
    return ok(entry, "Sorting...", 201);
  });

  server.post("/inbox/photo", async (request, reply) => {
    const paths = await saveUploadedFiles(request);
    if (paths.length === 0) {
      reply.code(400);
      return err("at least one photo is required", 400);
    }
    const entry = await service.createPhotoEntry(server.prisma, paths);
    reply.code(201);
    return ok(entry, "Reading recipe card...", 201);
  });

  server.post("/inbox/receipt-photo", async (request, reply) => {
    const paths = await saveUploadedFiles(request);
    if (paths.length !== 1) {
      reply.code(400);
      return err("exactly one receipt photo is required", 400);
    }
    const entry = await service.createReceiptEntry(server.prisma, paths[0]);
    reply.code(201);
    return ok(entry, "Reading receipt...", 201);
  });

  server.post("/inbox/media", async (request, reply) => {
    const paths = await saveUploadedFiles(request);
    if (paths.length !== 1) {
      reply.code(400);
      return err("exactly one audio or video file is required", 400);
    }
    const ext = extname(paths[0]).toLowerCase();
    const kind = [".mp4", ".mov", ".webm", ".mkv", ".avi"].includes(ext) ? "video" : "audio";
    const entry = await service.createMediaEntry(server.prisma, paths[0], kind);
    reply.code(201);
    return ok(entry, "Transcribing...", 201);
  });

  server.post<{ Params: { id: string }; Body: { feedback: string } }>("/inbox/:id/reevaluate", async (request, reply) => {
    if (!request.body?.feedback?.trim()) {
      reply.code(400);
      return err("feedback is required", 400);
    }
    const entry = await service.reevaluateEntry(server.prisma, request.params.id, request.body.feedback);
    return ok(entry, "Trying again...");
  });

  server.post<{ Params: { id: string }; Body: { fields: Record<string, unknown> } }>("/inbox/:id/confirm", async (request) => {
    const created = await service.confirmEntry(server.prisma, request.params.id, request.body.fields);
    return ok(created, "Added");
  });

  server.delete<{ Params: { id: string } }>("/inbox/:id", async (request) => {
    await service.discardEntry(server.prisma, request.params.id);
    return ok(null, "Discarded");
  });

  server.get<{ Params: { filename: string } }>("/inbox/media/:filename", async (request, reply) => {
    const filePath = join(UPLOAD_DIR, request.params.filename);
    const contentType = MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
    reply.header("Content-Type", contentType);
    return reply.send(createReadStream(filePath));
  });
}
