# RunPod Custom Worker for ReazonSpeech NeMo v2
# Highest accuracy Japanese ASR model
FROM pytorch/pytorch:2.2.2-cuda12.1-cudnn8-runtime

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Install NeMo and dependencies
RUN pip install --no-cache-dir \
    nemo_toolkit[asr]>=2.0.0 \
    huggingface_hub>=0.20.0 \
    runpod>=1.5.0 \
    soundfile>=0.12.0 \
    librosa>=0.10.0

# Copy handler code
COPY handler.py /app/handler.py

# Set the handler as the entrypoint
CMD ["python", "-u", "handler.py"]
