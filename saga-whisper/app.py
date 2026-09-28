import os
import tempfile

from fastapi import FastAPI, UploadFile
from faster_whisper import WhisperModel

# CPU-only for this first pass — transcription here is an occasional batch
# job (a recipe recording), not latency-critical, so it doesn't need to
# compete with Ollama for the box's 6GB VRAM. GPU acceleration (device="cuda")
# is a reasonable future optimization if transcription speed ever matters.
MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "small")
model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_SIZE}


@app.post("/transcribe")
async def transcribe(file: UploadFile):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        segments, _info = model.transcribe(tmp_path)
        text = " ".join(segment.text.strip() for segment in segments)
        return {"text": text.strip()}
    finally:
        os.unlink(tmp_path)
