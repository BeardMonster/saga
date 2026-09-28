import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";

const execFileAsync = promisify(execFile);

// Strips a ```json ... ``` fence if the model wrapped its JSON in one.
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1] : text);
}

// Runs the Claude Code CLI headlessly (`claude -p`) as a last-resort
// provider — authenticated via CLAUDE_CODE_OAUTH_TOKEN, a token tied to a
// Pro/Max subscription's own usage limits, not a separate paid API key.
// Only offered for tasks a local model genuinely struggles with (cursive
// handwriting, a rambling voice transcript) — never a default.
//
// There's no CLI flag to attach an image directly (confirmed against the
// CLI's own --help and official docs) — the actual mechanism is to write
// the image to disk, reference its path in the prompt text, and let
// Claude's own Read tool (which supports images) load it. That means a
// text-only prompt can stay fully tool-locked (--disallowedTools "*", no
// tool call ever attempted), but an image prompt needs exactly Read
// allowed and nothing else — still no Bash/Write/network access.
export async function runClaudeCliTask(prompt: string, imagesBase64?: string[]): Promise<unknown> {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    throw new Error(
      "No CLAUDE_CODE_OAUTH_TOKEN configured — run `claude setup-token` on a device logged into your Pro/Max account and set the result in saga-api/.env.",
    );
  }

  const tmpImagePaths: string[] = [];
  for (const [i, base64] of (imagesBase64 ?? []).entries()) {
    const path = `/tmp/claude-cli-image-${Date.now()}-${i}.jpg`;
    await writeFile(path, Buffer.from(base64, "base64"));
    tmpImagePaths.push(path);
  }

  const fullPrompt =
    tmpImagePaths.length > 0
      ? `${prompt}\n\nUse the Read tool to view the following image file(s) before answering:\n${tmpImagePaths.map((p) => `- ${p}`).join("\n")}`
      : prompt;

  const args =
    tmpImagePaths.length > 0
      ? ["-p", fullPrompt, "--output-format", "json", "--allowedTools", "Read"]
      : ["-p", fullPrompt, "--output-format", "json", "--disallowedTools", "*"];

  try {
    const { stdout } = await execFileAsync("claude", args, { maxBuffer: 1024 * 1024 * 20 });
    const parsed = JSON.parse(stdout) as { result: string; is_error?: boolean };
    if (parsed.is_error) throw new Error(`Claude CLI returned an error: ${parsed.result}`);
    return extractJson(parsed.result);
  } finally {
    await Promise.all(tmpImagePaths.map((p) => unlink(p).catch(() => undefined)));
  }
}
