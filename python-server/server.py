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
import torch
import torchaudio
import numpy as np
import soundfile as sf

# Initialize DeepFilterNet for noise suppression
print("Loading DeepFilterNet3 model...")
from df import enhance, init_df
df_model, df_state, _ = init_df()
print("DeepFilterNet3 model loaded successfully!")

# Initialize nara_wpe for dereverberation
print("Loading nara_wpe for dereverberation...")
from nara_wpe.wpe import wpe
from nara_wpe.utils import stft, istft
print("nara_wpe loaded successfully!")

# Initialize pyannote for speaker diarization
print("Loading pyannote speaker diarization model...")
try:
    from pyannote.audio import Pipeline
    HF_TOKEN = os.environ.get("HF_TOKEN", "")
    if HF_TOKEN:
        diarization_pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=HF_TOKEN
        )
        print("pyannote speaker diarization loaded successfully!")
    else:
        diarization_pipeline = None
        print("Warning: HF_TOKEN not set, speaker diarization disabled")
except Exception as e:
    diarization_pipeline = None
    print(f"Warning: pyannote loading failed: {e}")



def apply_deepfilter(audio_path: str) -> str:
    """
    Apply DeepFilterNet3 noise suppression to audio file.
    Returns path to denoised audio file.
    """
    try:
        # Load audio
        audio, sr = torchaudio.load(audio_path)
        
        # DeepFilterNet expects 48kHz, resample if needed
        if sr != 48000:
            resampler = torchaudio.transforms.Resample(orig_freq=sr, new_freq=48000)
            audio = resampler(audio)
            sr = 48000
        
        # Convert to mono if stereo
        if audio.shape[0] > 1:
            audio = torch.mean(audio, dim=0, keepdim=True)
        
        # Apply DeepFilterNet enhancement
        enhanced = enhance(df_model, df_state, audio.squeeze().numpy())
        
        # Convert back to tensor
        enhanced_tensor = torch.from_numpy(enhanced).unsqueeze(0)
        
        # Resample back to 16kHz for Whisper
        resampler_down = torchaudio.transforms.Resample(orig_freq=48000, new_freq=16000)
        enhanced_16k = resampler_down(enhanced_tensor)
        
        # Save to temporary file
        denoised_path = audio_path.replace('.wav', '_denoised.wav')
        torchaudio.save(denoised_path, enhanced_16k, 16000)
        
        return denoised_path
    except Exception as e:
        print(f"DeepFilterNet processing failed: {e}")
        return audio_path  # Return original if denoising fails


def apply_wpe(audio_path: str) -> str:
    """
    Apply nara_wpe dereverberation to audio file.
    Returns path to dereverberated audio file.
    """
    try:
        # Load audio
        audio, sr = sf.read(audio_path)
        
        # Ensure mono
        if len(audio.shape) > 1:
            audio = np.mean(audio, axis=1)
        
        # WPE parameters
        stft_options = dict(size=512, shift=128)
        
        # Apply STFT
        Y = stft(audio, **stft_options).T  # Shape: (F, T)
        Y = Y[np.newaxis, ...]  # Add channel dimension: (1, F, T)
        
        # Apply WPE dereverberation
        Z = wpe(
            Y,
            taps=10,
            delay=3,
            iterations=3,
            statistics_mode='full'
        )
        
        # Apply inverse STFT
        z = istft(Z[0].T, size=stft_options['size'], shift=stft_options['shift'])
        
        # Normalize
        z = z / np.max(np.abs(z)) * 0.9
        
        # Save to temporary file
        dereverb_path = audio_path.replace('.wav', '_dereverb.wav')
        sf.write(dereverb_path, z, sr)
        
        return dereverb_path
    except Exception as e:
        print(f"WPE dereverberation failed: {e}")
        return audio_path  # Return original if dereverberation fails


def apply_diarization(audio_path: str) -> list:
    """
    Apply pyannote speaker diarization to audio file.
    Returns list of speaker segments.
    """
    if diarization_pipeline is None:
        return []
    
    try:
        diarization = diarization_pipeline(audio_path)
        
        segments = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append({
                "speaker": speaker,
                "start": round(turn.start, 2),
                "end": round(turn.end, 2)
            })
        
        return segments
    except Exception as e:
        print(f"Diarization failed: {e}")
        return []



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
    denoised_path = None
    dereverb_path = None
    denoise_applied = False
    dereverb_applied = False
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

        # Apply DeepFilterNet3 noise suppression
        audio_to_transcribe = wav_file_path
        denoised_path = apply_deepfilter(wav_file_path)
        if denoised_path != wav_file_path:
            audio_to_transcribe = denoised_path
            denoise_applied = True

        # Apply WPE dereverberation
        dereverb_path = apply_wpe(audio_to_transcribe)
        if dereverb_path != audio_to_transcribe:
            audio_to_transcribe = dereverb_path
            dereverb_applied = True

        # Transcribe the audio using large-v3 model
        segments, info = model_large_v3.transcribe(
            audio_to_transcribe,
            language="ja",  # Japanese
            beam_size=5,
            vad_filter=True,  # Voice activity detection
            vad_parameters=dict(
                min_silence_duration_ms=200,  # Shorter silence detection for chunked audio
                speech_pad_ms=100,
            ),
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
        if denoised_path and os.path.exists(denoised_path) and denoised_path != wav_file_path:
            os.unlink(denoised_path)
        if dereverb_path and os.path.exists(dereverb_path) and dereverb_path != denoised_path:
            os.unlink(dereverb_path)

        return {
            "text": transcription_text.strip(),
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "denoise_applied": denoise_applied,
            "dereverb_applied": dereverb_applied,
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
    denoised_path = None
    dereverb_path = None
    denoise_applied = False
    dereverb_applied = False
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

        # Apply DeepFilterNet3 noise suppression
        audio_to_transcribe = wav_file_path
        denoised_path = apply_deepfilter(wav_file_path)
        if denoised_path != wav_file_path:
            audio_to_transcribe = denoised_path
            denoise_applied = True

        # Apply WPE dereverberation
        dereverb_path = apply_wpe(audio_to_transcribe)
        if dereverb_path != audio_to_transcribe:
            audio_to_transcribe = dereverb_path
            dereverb_applied = True

        # Transcribe the audio using large-v3-turbo model
        segments, info = model_large_v3_turbo.transcribe(
            audio_to_transcribe,
            language="ja",  # Japanese
            beam_size=5,
            vad_filter=True,  # Voice activity detection
            vad_parameters=dict(
                min_silence_duration_ms=200,  # Shorter silence detection for chunked audio
                speech_pad_ms=100,
            ),
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
        if denoised_path and os.path.exists(denoised_path) and denoised_path != wav_file_path:
            os.unlink(denoised_path)
        if dereverb_path and os.path.exists(dereverb_path) and dereverb_path != denoised_path:
            os.unlink(dereverb_path)

        return {
            "text": transcription_text.strip(),
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "denoise_applied": denoise_applied,
            "dereverb_applied": dereverb_applied,
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

