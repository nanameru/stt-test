"""
RunPod Handler for Kotoba Whisper v2.2 with Silero VAD and DeepFilterNet3
Handles audio transcription requests using Kotoba Whisper Japanese model
with Voice Activity Detection and Noise Suppression for improved accuracy
"""
import runpod
import base64
import tempfile
import os
import numpy as np
from transformers import pipeline
import torch
import librosa
import torchaudio

# Initialize Silero VAD model
print("Loading Silero VAD model...")
vad_model, vad_utils = torch.hub.load(
    repo_or_dir='snakers4/silero-vad',
    model='silero_vad',
    force_reload=False,
    onnx=False
)
(get_speech_timestamps, save_audio, read_audio, VADIterator, collect_chunks) = vad_utils
print("Silero VAD model loaded")

# Initialize DeepFilterNet3 for noise suppression
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
        if device == "cuda":
            diarization_pipeline.to(torch.device("cuda"))
        print("pyannote speaker diarization loaded successfully!")
    else:
        diarization_pipeline = None
        print("Warning: HF_TOKEN not set, speaker diarization disabled")
except Exception as e:
    diarization_pipeline = None
    print(f"Warning: pyannote loading failed: {e}")

# Initialize the Kotoba Whisper model
print("Loading Kotoba Whisper v2.2 model...")
device = "cuda" if torch.cuda.is_available() else "cpu"
pipe = pipeline(
    "automatic-speech-recognition",
    model="kotoba-tech/kotoba-whisper-v2.2",
    device=device,
    torch_dtype=torch.float16 if device == "cuda" else torch.float32,
)
print(f"Kotoba Whisper model loaded on {device}")


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
        denoised_path = audio_path.replace('.webm', '_denoised.wav')
        if denoised_path == audio_path:
            denoised_path = audio_path + '_denoised.wav'
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
        import soundfile as sf
        
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
        dereverb_path = audio_path.replace('.webm', '_dereverb.wav')
        if dereverb_path == audio_path:
            dereverb_path = audio_path + '_dereverb.wav'
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


def apply_vad(audio_path: str, sample_rate: int = 16000) -> str:
    """
    Apply Silero VAD to filter out non-speech segments.
    Returns path to a new audio file with only speech segments.
    """
    # Read audio file
    wav = read_audio(audio_path, sampling_rate=sample_rate)
    
    # Get speech timestamps
    speech_timestamps = get_speech_timestamps(
        wav, 
        vad_model,
        threshold=0.5,  # Speech probability threshold
        min_speech_duration_ms=250,  # Minimum speech duration
        min_silence_duration_ms=100,  # Minimum silence duration to split
        speech_pad_ms=30,  # Padding around speech segments
        sampling_rate=sample_rate
    )
    
    if not speech_timestamps:
        # No speech detected, return original
        return audio_path
    
    # Collect speech chunks
    speech_wav = collect_chunks(speech_timestamps, wav)
    
    # Save filtered audio to temporary file
    filtered_path = audio_path.replace('.webm', '_vad.wav').replace('.wav', '_vad.wav')
    if filtered_path == audio_path:
        filtered_path = audio_path + '_vad.wav'
    
    # Convert tensor to numpy and save
    speech_np = speech_wav.numpy()
    import soundfile as sf
    sf.write(filtered_path, speech_np, sample_rate)
    
    return filtered_path


def handler(job):
    """
    Handler function for RunPod serverless

    Expected input format:
    {
        "input": {
            "audio_base64": "base64-encoded audio data",
            "language": "ja",  # optional, defaults to Japanese
            "task": "transcribe",  # or "translate"
            "enable_denoise": true,  # optional, defaults to True
            "enable_dereverberation": true,  # optional, defaults to True
            "enable_vad": true,  # optional, defaults to True
            "enable_diarization": false  # optional, defaults to False
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

        denoised_path = None
        dereverb_path = None
        vad_filtered_path = None
        
        try:
            # Get parameters
            language = job_input.get("language", "ja")
            task = job_input.get("task", "transcribe")
            enable_denoise = job_input.get("enable_denoise", True)
            enable_dereverberation = job_input.get("enable_dereverberation", True)
            enable_vad = job_input.get("enable_vad", True)
            enable_diarization = job_input.get("enable_diarization", False)
            
            # Start with original audio
            audio_to_transcribe = temp_audio_path
            denoise_applied = False
            dereverb_applied = False
            vad_applied = False
            
            # Apply DeepFilterNet3 noise suppression if enabled
            if enable_denoise:
                try:
                    denoised_path = apply_deepfilter(temp_audio_path)
                    if denoised_path != temp_audio_path:
                        audio_to_transcribe = denoised_path
                        denoise_applied = True
                except Exception as denoise_error:
                    print(f"DeepFilterNet processing failed, continuing: {denoise_error}")
            
            # Apply WPE dereverberation if enabled
            if enable_dereverberation:
                try:
                    dereverb_path = apply_wpe(audio_to_transcribe)
                    if dereverb_path != audio_to_transcribe:
                        audio_to_transcribe = dereverb_path
                        dereverb_applied = True
                except Exception as dereverb_error:
                    print(f"WPE dereverberation failed, continuing: {dereverb_error}")
            
            # Apply VAD if enabled
            if enable_vad:
                try:
                    vad_filtered_path = apply_vad(audio_to_transcribe)
                    if vad_filtered_path != audio_to_transcribe:
                        audio_to_transcribe = vad_filtered_path
                        vad_applied = True
                except Exception as vad_error:
                    print(f"VAD processing failed, using original audio: {vad_error}")
                    # Continue with original audio if VAD fails

            # Run inference with optimized parameters
            result = pipe(
                audio_to_transcribe,
                generate_kwargs={
                    "language": language,
                    "task": task,
                    "num_beams": 5,  # Beam search for better accuracy
                    "do_sample": False,  # Deterministic output
                },
                return_timestamps=True,  # Enable timestamps
            )

            # Extract transcription text
            transcription = result["text"]
            
            # Extract chunks/timestamps if available
            chunks = []
            if "chunks" in result:
                chunks = [
                    {
                        "text": chunk["text"],
                        "start": chunk["timestamp"][0] if chunk["timestamp"][0] else 0,
                        "end": chunk["timestamp"][1] if chunk["timestamp"][1] else 0,
                    }
                    for chunk in result["chunks"]
                ]
            
            # Apply speaker diarization if enabled
            diarization = []
            if enable_diarization:
                diarization = apply_diarization(temp_audio_path)

            return {
                "transcription": transcription,
                "language": language,
                "model": "kotoba-whisper-v2.2",
                "denoise_applied": denoise_applied,
                "dereverb_applied": dereverb_applied,
                "vad_applied": vad_applied,
                "chunks": chunks,
                "diarization": diarization,
            }

        finally:
            # Clean up temporary files
            if os.path.exists(temp_audio_path):
                os.remove(temp_audio_path)
            if denoised_path and os.path.exists(denoised_path) and denoised_path != temp_audio_path:
                os.remove(denoised_path)
            if dereverb_path and os.path.exists(dereverb_path) and dereverb_path != denoised_path:
                os.remove(dereverb_path)
            if vad_filtered_path and os.path.exists(vad_filtered_path) and vad_filtered_path != dereverb_path:
                os.remove(vad_filtered_path)

    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}


# Start the handler
runpod.serverless.start({"handler": handler})
