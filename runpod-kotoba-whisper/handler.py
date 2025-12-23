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
            "enable_vad": true,  # optional, defaults to True
            "enable_denoise": true  # optional, defaults to True
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
        vad_filtered_path = None
        
        try:
            # Get parameters
            language = job_input.get("language", "ja")
            task = job_input.get("task", "transcribe")
            enable_vad = job_input.get("enable_vad", True)
            enable_denoise = job_input.get("enable_denoise", True)
            
            # Start with original audio
            audio_to_transcribe = temp_audio_path
            denoise_applied = False
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

            return {
                "transcription": transcription,
                "language": language,
                "model": "kotoba-whisper-v2.2",
                "denoise_applied": denoise_applied,
                "vad_applied": vad_applied,
                "chunks": chunks,
            }

        finally:
            # Clean up temporary files
            if os.path.exists(temp_audio_path):
                os.remove(temp_audio_path)
            if denoised_path and os.path.exists(denoised_path) and denoised_path != temp_audio_path:
                os.remove(denoised_path)
            if vad_filtered_path and os.path.exists(vad_filtered_path) and vad_filtered_path != temp_audio_path and vad_filtered_path != denoised_path:
                os.remove(vad_filtered_path)

    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}


# Start the handler
runpod.serverless.start({"handler": handler})
