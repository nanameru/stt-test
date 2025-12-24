# RunPod Custom Worker for NVIDIA Parakeet-TDT 0.6B (Japanese)
# Fast and accurate Japanese ASR model with full preprocessing
FROM pytorch/pytorch:2.2.2-cuda12.1-cudnn8-runtime

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip and install onnx/protobuf first (pre-built wheels to avoid source build issues)
RUN pip install --upgrade pip && \
    pip install --no-cache-dir \
    protobuf==3.20.3 \
    onnx==1.15.0

# Install NeMo and all preprocessing dependencies
RUN pip install --no-cache-dir \
    nemo_toolkit[asr]>=2.0.0 \
    huggingface_hub>=0.20.0 \
    runpod>=1.5.0 \
    soundfile>=0.12.0 \
    librosa>=0.10.0 \
    deepfilternet>=0.5.0 \
    nara_wpe>=0.0.9 \
    pyannote.audio>=3.1.0 \
    numpy>=1.24.0

# Copy handler code
COPY handler.py /app/handler.py

# Set the handler as the entrypoint
CMD ["python", "-u", "handler.py"]
