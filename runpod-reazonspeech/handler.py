"""
RunPod Load Balancer Handler for ReazonSpeech NeMo v2
Highest accuracy Japanese ASR model (WER 6.36%)
With full preprocessing pipeline: DeepFilterNet, nara_wpe, Silero VAD, pyannote

This version uses FastAPI for Load Balancer endpoints
"""
import os
import base64
import tempfile
import torch
import numpy as np
import torchaudio
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# Initialize device
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")

# Initialize Silero VAD
print("Loading Silero VAD model...")
vad_model, vad_utils = torch.hub.load(
    repo_or_dir='snakers4/silero-vad',
    model='silero_vad',
    force_reload=False,
    onnx=False
)
(get_speech_timestamps, save_audio, read_audio, VADIterator, collect_chunks) = vad_utils
print("Silero VAD model loaded")

# Initialize DeepFilterNet3
print("Loading DeepFilterNet3 model...")
from df import enhance, init_df
df_model, df_state, _ = init_df()
print("DeepFilterNet3 model loaded successfully!")

# Initialize nara_wpe
print("Loading nara_wpe for dereverberation...")
from nara_wpe.wpe import wpe
from nara_wpe.utils import stft, istft
import soundfile as sf
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
        if device == "cuda":
            diarization_pipeline.to(torch.device("cuda"))
        print("pyannote speaker diarization loaded successfully!")
    else:
        diarization_pipeline = None
        print("Warning: HF_TOKEN not set, speaker diarization disabled")
except Exception as e:
    diarization_pipeline = None
    print(f"Warning: pyannote loading failed: {e}")

# Initialize ReazonSpeech NeMo v2 model
print("Loading ReazonSpeech NeMo v2 model...")
import nemo.collections.asr as nemo_asr
model = nemo_asr.models.EncDecRNNTBPEModel.from_pretrained(
    "reazon-research/reazonspeech-nemo-v2"
)
model = model.to(device)
model.eval()
print(f"ReazonSpeech NeMo v2 loaded on {device}")

# FastAPI App
app = FastAPI(title="ReazonSpeech NeMo v2 API")


class TranscribeRequest(BaseModel):
    audio_base64: str
    enable_denoise: bool = True
    enable_dereverberation: bool = True
    enable_vad: bool = True
    enable_diarization: bool = False


class TranscribeResponse(BaseModel):
    transcription: str
    language: str = "ja"
    model: str = "reazonspeech-nemo-v2"
    denoise_applied: bool = False
    dereverb_applied: bool = False
    vad_applied: bool = False
    diarization: list = []


def apply_deepfilter(audio_path: str) -> str:
    """Apply DeepFilterNet3 noise suppression"""
    try:
        audio, sr = torchaudio.load(audio_path)
        if sr != 48000:
            resampler = torchaudio.transforms.Resample(orig_freq=sr, new_freq=48000)
            audio = resampler(audio)
            sr = 48000
        if audio.shape[0] > 1:
            audio = torch.mean(audio, dim=0, keepdim=True)
        enhanced = enhance(df_model, df_state, audio.squeeze().numpy())
        enhanced_tensor = torch.from_numpy(enhanced).unsqueeze(0)
        resampler_down = torchaudio.transforms.Resample(orig_freq=48000, new_freq=16000)
        enhanced_16k = resampler_down(enhanced_tensor)
        denoised_path = audio_path.replace('.wav', '_denoised.wav')
        torchaudio.save(denoised_path, enhanced_16k, 16000)
        return denoised_path
    except Exception as e:
        print(f"DeepFilterNet processing failed: {e}")
        return audio_path


def apply_wpe(audio_path: str) -> str:
    """Apply nara_wpe dereverberation"""
    try:
        audio, sr = sf.read(audio_path)
        if len(audio.shape) > 1:
            audio = np.mean(audio, axis=1)
        stft_options = dict(size=512, shift=128)
        Y = stft(audio, **stft_options).T
        Y = Y[np.newaxis, ...]
        Z = wpe(Y, taps=10, delay=3, iterations=3, statistics_mode='full')
        z = istft(Z[0].T, size=stft_options['size'], shift=stft_options['shift'])
        z = z / np.max(np.abs(z)) * 0.9
        dereverb_path = audio_path.replace('.wav', '_dereverb.wav')
        sf.write(dereverb_path, z, sr)
        return dereverb_path
    except Exception as e:
        print(f"WPE dereverberation failed: {e}")
        return audio_path


def apply_vad(audio_path: str) -> str:
    """Apply Silero VAD to remove silence"""
    try:
        wav = read_audio(audio_path, sampling_rate=16000)
        speech_timestamps = get_speech_timestamps(wav, vad_model, sampling_rate=16000)
        if not speech_timestamps:
            return audio_path
        speech_wav = collect_chunks(speech_timestamps, wav)
        vad_path = audio_path.replace('.wav', '_vad.wav')
        torchaudio.save(vad_path, speech_wav.unsqueeze(0), 16000)
        return vad_path
    except Exception as e:
        print(f"VAD processing failed: {e}")
        return audio_path


def apply_diarization(audio_path: str) -> list:
    """Apply pyannote speaker diarization"""
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


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(request: TranscribeRequest):
    """Transcribe audio using ReazonSpeech NeMo v2"""
    try:
        # Decode and save audio
        audio_bytes = base64.b64decode(request.audio_base64)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
            temp_audio.write(audio_bytes)
            temp_audio_path = temp_audio.name

        files_to_cleanup = [temp_audio_path]
        current_path = temp_audio_path

        try:
            # Apply preprocessing pipeline
            if request.enable_denoise:
                denoised_path = apply_deepfilter(current_path)
                if denoised_path != current_path:
                    files_to_cleanup.append(denoised_path)
                    current_path = denoised_path

            if request.enable_dereverberation:
                dereverb_path = apply_wpe(current_path)
                if dereverb_path != current_path:
                    files_to_cleanup.append(dereverb_path)
                    current_path = dereverb_path

            if request.enable_vad:
                vad_path = apply_vad(current_path)
                if vad_path != current_path:
                    files_to_cleanup.append(vad_path)
                    current_path = vad_path

            # Transcribe using ReazonSpeech NeMo v2
            transcriptions = model.transcribe([current_path])
            if isinstance(transcriptions, list) and len(transcriptions) > 0:
                transcription = transcriptions[0]
            else:
                transcription = str(transcriptions)

            # Speaker diarization
            diarization_result = []
            if request.enable_diarization:
                diarization_result = apply_diarization(temp_audio_path)

            return TranscribeResponse(
                transcription=transcription,
                denoise_applied=request.enable_denoise,
                dereverb_applied=request.enable_dereverberation,
                vad_applied=request.enable_vad,
                diarization=diarization_result,
            )

        finally:
            for f in files_to_cleanup:
                if os.path.exists(f):
                    os.remove(f)

    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}\n{traceback.format_exc()}")


@app.get("/ping")
async def ping():
    """Health check endpoint for RunPod Load Balancer"""
    return {"status": "ok"}


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy", "model": "reazonspeech-nemo-v2"}


if __name__ == "__main__":
    # RunPod sets PORT env var for Load Balancer
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting ReazonSpeech API on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
