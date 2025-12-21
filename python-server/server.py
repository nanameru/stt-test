"""
Faster Whisper Local Server
Provides REST API endpoints for local speech-to-text transcription using faster-whisper

Supports two models:
- large-v3: Higher accuracy, slower
- large-v3-turbo: Faster, slightly lower accuracy

Requirements:
    pip install fastapi uvicorn faster-whisper python-multipart
    System: ffmpeg must be installed

Usage:
    python server.py

The server will run on http://localhost:8000
Endpoints:
    POST /transcribe       - Use large-v3 model
    POST /transcribe-turbo - Use large-v3-turbo model
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import tempfile
import os
import subprocess
from typing import Optional


def convert_webm_to_wav(input_path: str, output_path: str) -> bool:
    """Convert WebM/Opus audio to WAV format using FFmpeg"""
    try:
        result = subprocess.run([
            '/opt/homebrew/bin/ffmpeg', '-y', '-i', input_path,
            '-ar', '16000',  # 16kHz sample rate
            '-ac', '1',      # Mono
            '-f', 'wav',
            output_path
        ], capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            print(f"FFmpeg error output: {result.stderr}")
        else:
            print(f"FFmpeg conversion successful: {output_path}")
        return result.returncode == 0
    except Exception as e:
        print(f"FFmpeg conversion error: {e}")
        return False

app = FastAPI(title="Faster Whisper Local Server")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize models (will download on first run)
# device: "cpu" or "cuda" for GPU
# compute_type: "int8" for CPU, "float16" for GPU
print("Loading Whisper Large V3 model...")
model_large_v3 = WhisperModel("large-v3", device="cpu", compute_type="int8")
print("Loading Whisper Large V3 Turbo model...")
model_large_v3_turbo = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
print("Models loaded successfully!")

@app.get("/")
async def root():
    return {
        "status": "running",
        "models": ["large-v3", "large-v3-turbo"],
        "device": "cpu",
        "endpoints": {
            "/transcribe": "large-v3",
            "/transcribe-turbo": "large-v3-turbo"
        }
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
    tmp_file_path = None
    wav_file_path = None
    try:
        # Save uploaded file to temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp_file:
            content = await audio.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name

        # Convert WebM to WAV using FFmpeg
        wav_file_path = tmp_file_path.replace('.webm', '.wav')
        if not convert_webm_to_wav(tmp_file_path, wav_file_path):
            raise HTTPException(status_code=500, detail="Failed to convert audio format")

        # Transcribe the audio using large-v3 model
        segments, info = model_large_v3.transcribe(
            wav_file_path,
            language="ja",  # Japanese
            beam_size=5,
            vad_filter=True,  # Voice activity detection
            vad_parameters=dict(min_silence_duration_ms=500),
        )

        # Collect all segments
        transcription_text = ""
        for segment in segments:
            transcription_text += segment.text + " "

        # Clean up temporary files
        if tmp_file_path and os.path.exists(tmp_file_path):
            os.unlink(tmp_file_path)
        if wav_file_path and os.path.exists(wav_file_path):
            os.unlink(wav_file_path)

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


@app.post("/transcribe-turbo")
async def transcribe_turbo(audio: UploadFile = File(...)):
    """
    Transcribe audio file using Faster Whisper Large V3 Turbo (faster, slightly lower accuracy)

    Args:
        audio: Audio file in supported format (webm, mp3, wav, m4a, etc.)

    Returns:
        JSON with transcription result
    """
    tmp_file_path = None
    wav_file_path = None
    try:
        # Save uploaded file to temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp_file:
            content = await audio.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name

        # Convert WebM to WAV using FFmpeg
        wav_file_path = tmp_file_path.replace('.webm', '.wav')
        if not convert_webm_to_wav(tmp_file_path, wav_file_path):
            raise HTTPException(status_code=500, detail="Failed to convert audio format")

        # Transcribe the audio using large-v3-turbo model
        segments, info = model_large_v3_turbo.transcribe(
            wav_file_path,
            language="ja",  # Japanese
            beam_size=5,
            vad_filter=True,  # Voice activity detection
            vad_parameters=dict(min_silence_duration_ms=500),
        )

        # Collect all segments
        transcription_text = ""
        for segment in segments:
            transcription_text += segment.text + " "

        # Clean up temporary files
        if tmp_file_path and os.path.exists(tmp_file_path):
            os.unlink(tmp_file_path)
        if wav_file_path and os.path.exists(wav_file_path):
            os.unlink(wav_file_path)

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
    print("Starting Faster Whisper Local Server...")
    print("Server will be available at: http://localhost:8000")
    print("API endpoints:")
    print("  POST http://localhost:8000/transcribe       (large-v3)")
    print("  POST http://localhost:8000/transcribe-turbo (large-v3-turbo)")
    uvicorn.run(app, host="0.0.0.0", port=8000)

