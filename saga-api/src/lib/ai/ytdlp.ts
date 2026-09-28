import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

// Downloads just the audio track of whatever a link points to (YouTube,
// Instagram, TikTok, X, etc. — anything yt-dlp's extractor list covers) into
// a scratch directory, for handing to the same transcribeAudio() pipeline a
// direct upload uses. The video itself is never kept — only its transcript.
export async function downloadAudioFromUrl(url: string): Promise<{ audioPath: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "saga-ytdlp-"));
  const cleanup = () => rm(dir, { recursive: true, force: true });

  try {
    await execFileAsync(
      "yt-dlp",
      [
        "-x", // audio only
        "--audio-format",
        "wav",
        "--audio-quality",
        "0",
        "--max-filesize",
        "500M",
        "-o",
        join(dir, "audio.%(ext)s"),
        url,
      ],
      { timeout: 5 * 60 * 1000 },
    );
  } catch (error) {
    await cleanup();
    throw new Error(`Couldn't download that link: ${error instanceof Error ? error.message : String(error)}`);
  }

  const files = await readdir(dir);
  const audioFile = files.find((f) => f.endsWith(".wav"));
  if (!audioFile) {
    await cleanup();
    throw new Error("yt-dlp finished but produced no audio file");
  }
  return { audioPath: join(dir, audioFile), cleanup };
}
