const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://host.docker.internal:11434";

// Strips a ```json ... ``` fence if the model wrapped its JSON in one —
// same defensive parsing as claudeCli.ts.
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1] : text);
}

// Calls a local Ollama model with a text prompt and, optionally, one or
// more images (for a vision-capable model). Uses format:"json" so the
// caller can rely on getting parsed JSON back rather than free text.
export async function runOllamaTask(model: string, prompt: string, imagesBase64?: string[]): Promise<unknown> {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      images: imagesBase64,
      format: "json",
      stream: false,
      think: false,
      // Ollama's default context window (often 4096) is easily consumed
      // almost entirely by a single image's vision tokens, leaving too
      // little room to finish the response — confirmed directly against
      // qwen3-vl:4b, which silently truncated to a `done_reason: "length"`
      // empty response before this was raised. 8192 leaves real headroom.
      options: { num_ctx: 8192 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status}): ${await response.text()}`);
  }

  const body = (await response.json()) as { response: string; thinking?: string };
  // Some "thinking"-capable models (confirmed with qwen3-vl:4b) still put
  // the actual answer in `thinking` instead of `response` even with
  // think:false — fall back to it rather than failing to parse "".
  return extractJson(body.response || body.thinking || "");
}

// Free-form multi-turn chat against a local model — unlike runOllamaTask,
// this does NOT force format:"json"; it's for the interactive chat page,
// not a structured-extraction task, so plain conversational text is the
// whole point.
export async function runOllamaChat(model: string, messages: { role: string; content: string }[]): Promise<string> {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, think: false, options: { num_ctx: 8192 } }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status}): ${await response.text()}`);
  }

  const body = (await response.json()) as { message?: { content?: string; thinking?: string } };
  // Same fallback reasoning as runOllamaTask — some models still put their
  // real answer in `thinking` instead of `content` even with think:false.
  return body.message?.content || body.message?.thinking || "";
}

// Lists models actually pulled on the Ollama instance — used by the
// Settings page so the model picker never shows a model that isn't there.
export async function listOllamaModels(): Promise<string[]> {
  const response = await fetch(`${OLLAMA_URL}/api/tags`);
  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status}): ${await response.text()}`);
  }
  const body = (await response.json()) as { models: { name: string }[] };
  return body.models.map((m) => m.name);
}
