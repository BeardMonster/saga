import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { err, ok } from "../../lib/envelope.js";
import { runOllamaChat } from "../../lib/ai/ollama.js";

// A quick, ephemeral chat surface for talking directly to a local Ollama
// model. No conversation history is kept server-side — the frontend
// persists that itself (per-device, in localStorage) and resends the full
// message array each turn. What IS kept server-side, briefly, is the
// in-flight job: local models can take 30-60+ seconds, and Brandon
// explicitly wants to be able to tab away (especially on mobile) and come
// back to a finished answer rather than needing the page to stay open and
// watching the whole time. So the actual Ollama call runs detached from
// the request/response cycle — the client fires it, gets a job id back
// immediately, and polls for the result whenever it happens to be looking.
// A plain in-memory Map is enough: jobs are short-lived (done in well
// under an hour) and losing them on an API restart is an acceptable
// tradeoff for not needing a DB table for something this disposable.
interface ChatJob {
  status: "pending" | "done" | "error";
  reply?: string;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, ChatJob>();

const JOB_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
setInterval(
  () => {
    const cutoff = Date.now() - JOB_MAX_AGE_MS;
    for (const [id, job] of jobs) {
      if (job.createdAt < cutoff) jobs.delete(id);
    }
  },
  10 * 60 * 1000,
);

export default async function chatRoutes(server: FastifyInstance) {
  server.post<{ Body: { model: string; messages: { role: string; content: string }[] } }>("/chat/send", async (request, reply) => {
    const { model, messages } = request.body;
    if (!model || !Array.isArray(messages) || messages.length === 0) {
      reply.code(400);
      return err("model and a non-empty messages array are required", 400);
    }

    const jobId = randomUUID();
    jobs.set(jobId, { status: "pending", createdAt: Date.now() });

    // Deliberately not awaited — the response goes back immediately with
    // just the job id, and this keeps running in the background.
    runOllamaChat(model, messages)
      .then((text) => jobs.set(jobId, { status: "done", reply: text, createdAt: Date.now() }))
      .catch((error: Error) => jobs.set(jobId, { status: "error", error: error.message, createdAt: Date.now() }));

    reply.code(202);
    return ok({ jobId }, "Started", 202);
  });

  server.get<{ Params: { jobId: string } }>("/chat/status/:jobId", async (request, reply) => {
    const job = jobs.get(request.params.jobId);
    if (!job) {
      reply.code(404);
      return err("No job with that id — it may have finished a while ago and been cleaned up, or the API restarted.", 404);
    }
    return ok(job);
  });
}
