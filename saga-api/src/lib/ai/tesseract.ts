import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Dedicated OCR (not an LLM) — the fully-local, no-model-pull-needed first
// attempt in the recipe-photo cascade. Genuinely good at printed/typed
// text; handwriting (especially cursive) is where its own confidence score
// drops, which is exactly the signal used to decide whether to escalate.
export async function runTesseractOcr(imagePath: string): Promise<string> {
  // "stdout" as the output base tells tesseract to print to stdout
  // instead of writing a .txt file next to the image.
  const { stdout } = await execFileAsync("tesseract", [imagePath, "stdout"]);
  return stdout.trim();
}

// Tesseract's own per-word confidence (0-100, -1 for non-word structural
// rows) from its TSV output — a real signal from the OCR engine itself for
// "did it actually recognize this," rather than asking a downstream LLM to
// judge OCR text it can't compare against the original image.
export async function getTesseractConfidence(imagePath: string): Promise<number> {
  const { stdout } = await execFileAsync("tesseract", [imagePath, "stdout", "tsv"]);
  const lines = stdout.trim().split("\n").slice(1); // drop the header row
  const confidences = lines
    .map((line) => Number(line.split("\t")[10]))
    .filter((conf) => Number.isFinite(conf) && conf >= 0);
  if (confidences.length === 0) return 0;
  return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
}
