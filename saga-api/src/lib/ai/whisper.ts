import { readFile } from "node:fs/promises";

// Each service here is its own independent docker-compose project reached
// via host.docker.internal (see ntfy.ts/ollama.ts) — not Docker network
// service-name resolution, since they aren't on a shared compose network.
const WHISPER_URL = process.env.WHISPER_URL ?? "http://host.docker.internal:8100";

// Calls the local saga-whisper service (faster-whisper under the hood) to
// transcribe an audio file. Not dispatched through taskRunner — this is a
// deterministic pre-processing step, not a provider choice.
export async function transcribeAudio(audioPath: string): Promise<string> {
  const buffer = await readFile(audioPath);
  const form = new FormData();
  form.append("file", new Blob([buffer]), "audio.wav");

  const response = await fetch(`${WHISPER_URL}/transcribe`, { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(`Whisper transcription failed (${response.status}): ${await response.text()}`);
  }

  const body = (await response.json()) as { text: string };
  return body.text;
}
