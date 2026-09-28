const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const CLAUDE_MODEL = "claude-sonnet-5";

// Strips a ```json ... ``` fence if the model wrapped its JSON in one,
// since Claude (unlike Ollama's format:"json") has no hard-JSON-only mode.
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1] : text);
}

// Calls the Claude API with a text prompt and, optionally, one or more
// images. Used for tasks a small local model isn't reliable at yet
// (cursive handwriting, a rambling voice-transcript-to-recipe pass) —
// the fallback tier of the local-first AI strategy, not the default.
export async function runClaudeTask(prompt: string, imagesBase64?: string[]): Promise<unknown> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      "No Claude API key configured — set ANTHROPIC_API_KEY in saga-api/.env, or switch this task to a local Ollama model in Settings.",
    );
  }

  const content: Array<Record<string, unknown>> = [];
  for (const image of imagesBase64 ?? []) {
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } });
  }
  content.push({ type: "text", text: prompt });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude request failed (${response.status}): ${await response.text()}`);
  }

  const body = (await response.json()) as { content: { type: string; text?: string }[] };
  const text = body.content.find((block) => block.type === "text")?.text ?? "";
  return extractJson(text);
}
