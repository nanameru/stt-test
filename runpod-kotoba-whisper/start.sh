#!/bin/bash
# RunPod startup script for Kotoba Whisper v2.2

# Install dependencies
pip install transformers accelerate librosa soundfile runpod

# Pre-download model (optional, for faster cold starts)
python3 -c "from transformers import pipeline; pipeline('automatic-speech-recognition', model='kotoba-tech/kotoba-whisper-v2.2', device='cuda')"

# Start handler
python3 /workspace/runpod-kotoba-whisper/handler.py
