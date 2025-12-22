"""
RunPod Handler for Kotoba Whisper v2.2
Handles audio transcription requests using Kotoba Whisper Japanese model
"""
import runpod
import base64
import tempfile
import os
from transformers import pipeline
import torch

# Initialize the Kotoba Whisper model
print("Loading Kotoba Whisper v2.2 model...")
device = "cuda" if torch.cuda.is_available() else "cpu"
pipe = pipeline(
    "automatic-speech-recognition",
    model="kotoba-tech/kotoba-whisper-v2.2",
    device=device,
    torch_dtype=torch.float16 if device == "cuda" else torch.float32,
)
print(f"Model loaded on {device}")


def handler(job):
    """
    Handler function for RunPod serverless

    Expected input format:
    {
        "input": {
            "audio_base64": "base64-encoded audio data",
            "language": "ja",  # optional, defaults to Japanese
            "task": "transcribe"  # or "translate"
        }
    }
    """
    try:
        job_input = job["input"]

        # Get audio data
        audio_base64 = job_input.get("audio_base64")
        if not audio_base64:
            return {"error": "No audio_base64 provided"}

        # Decode base64 audio
        audio_bytes = base64.b64decode(audio_base64)

        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
            temp_audio.write(audio_bytes)
            temp_audio_path = temp_audio.name

        try:
            # Get parameters
            language = job_input.get("language", "ja")
            task = job_input.get("task", "transcribe")

            # Run inference
            result = pipe(
                temp_audio_path,
                generate_kwargs={
                    "language": language,
                    "task": task,
                },
                return_timestamps=False,
            )

            # Extract transcription text
            transcription = result["text"]

            return {
                "transcription": transcription,
                "language": language,
                "model": "kotoba-whisper-v2.2",
            }

        finally:
            # Clean up temporary file
            if os.path.exists(temp_audio_path):
                os.remove(temp_audio_path)

    except Exception as e:
        return {"error": str(e)}


# Start the handler
runpod.serverless.start({"handler": handler})
