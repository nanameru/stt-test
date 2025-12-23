"""
RunPod Handler for ReazonSpeech NeMo v2
Highest accuracy Japanese ASR model (WER 6.36%)
"""
import runpod
import base64
import tempfile
import os
import torch

# Initialize ReazonSpeech NeMo v2 model
print("Loading ReazonSpeech NeMo v2 model...")
import nemo.collections.asr as nemo_asr

device = "cuda" if torch.cuda.is_available() else "cpu"
model = nemo_asr.models.EncDecRNNTBPEModel.from_pretrained(
    "reazon-research/reazonspeech-nemo-v2"
)
model = model.to(device)
model.eval()
print(f"ReazonSpeech NeMo v2 loaded on {device}")


def handler(job):
    """
    Handler function for RunPod serverless

    Expected input format:
    {
        "input": {
            "audio_base64": "base64-encoded audio data",
            "language": "ja"  # optional, always Japanese
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
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
            temp_audio.write(audio_bytes)
            temp_audio_path = temp_audio.name

        try:
            # Transcribe using ReazonSpeech NeMo v2
            transcriptions = model.transcribe([temp_audio_path])
            
            # Get transcription text
            if isinstance(transcriptions, list) and len(transcriptions) > 0:
                transcription = transcriptions[0]
            else:
                transcription = str(transcriptions)

            return {
                "transcription": transcription,
                "language": "ja",
                "model": "reazonspeech-nemo-v2",
            }

        finally:
            # Clean up temporary file
            if os.path.exists(temp_audio_path):
                os.remove(temp_audio_path)

    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}


# Start the handler
runpod.serverless.start({"handler": handler})
