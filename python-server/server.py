"""
Faster Whisper Large V3 Local Server
Provides a REST API endpoint for local speech-to-text transcription using faster-whisper

Requirements:
    pip install fastapi uvicorn faster-whisper python-multipart

Usage:
    python server.py

The server will run on http://localhost:8000
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import tempfile
import os
from typing import Optional

app = FastAPI(title="Faster Whisper Large V3 Server")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the model (will download on first run)
# Options: tiny, base, small, medium, large-v1, large-v2, large-v3
# device: "cpu" or "cuda" for GPU
# compute_type: "int8" for CPU, "float16" for GPU
model = WhisperModel("large-v3", device="cpu", compute_type="int8")

@app.get("/")
async def root():
    return {
        "status": "running",
        "model": "faster-whisper-large-v3",
        "device": "cpu"
    }

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    """
    Transcribe audio file using Faster Whisper Large V3

    Args:
        audio: Audio file in supported format (webm, mp3, wav, m4a, etc.)

    Returns:
        JSON with transcription result
    """
    try:
        # Save uploaded file to temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp_file:
            content = await audio.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name

        # Transcribe the audio
        segments, info = model.transcribe(
            tmp_file_path,
            language="ja",  # Japanese
            beam_size=5,
            vad_filter=True,  # Voice activity detection
            vad_parameters=dict(min_silence_duration_ms=500),
        )

        # Collect all segments
        transcription_text = ""
        for segment in segments:
            transcription_text += segment.text + " "

        # Clean up temporary file
        os.unlink(tmp_file_path)

        return {
            "text": transcription_text.strip(),
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
        }

    except Exception as e:
        # Clean up temporary file if it exists
        if 'tmp_file_path' in locals():
            try:
                os.unlink(tmp_file_path)
            except:
                pass

        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    print("Starting Faster Whisper Large V3 server...")
    print("Server will be available at: http://localhost:8000")
    print("API endpoint: POST http://localhost:8000/transcribe")
    uvicorn.run(app, host="0.0.0.0", port=8000)
