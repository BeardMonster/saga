import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Pulls the audio track out of a video file so it can be handed to the
// Whisper transcription service the same way a plain audio upload would be.
export async function extractAudioTrack(videoPath: string): Promise<string> {
  const audioPath = `${videoPath}.wav`;
  await execFileAsync("ffmpeg", ["-y", "-i", videoPath, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audioPath]);
  return audioPath;
}
