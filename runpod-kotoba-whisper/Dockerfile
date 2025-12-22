# RunPod Custom Worker for Kotoba Whisper v2.2
# Optimized for Japanese speech recognition
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip3 install --no-cache-dir --upgrade pip

# Install PyTorch with CUDA support
RUN pip3 install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install Transformers and required dependencies
RUN pip3 install --no-cache-dir \
    transformers>=4.30.0 \
    accelerate>=0.20.0 \
    librosa>=0.10.0 \
    soundfile>=0.12.0 \
    runpod>=1.5.0

# Pre-download the Kotoba Whisper model (speeds up cold starts)
RUN python3 -c "from transformers import pipeline; pipeline('automatic-speech-recognition', model='kotoba-tech/kotoba-whisper-v2.2', device='cuda')"

# Copy handler code
COPY handler.py /app/handler.py

# Set the handler as the entrypoint
CMD ["python3", "-u", "handler.py"]
