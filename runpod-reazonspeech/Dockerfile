# RunPod Load Balancer Worker for ReazonSpeech NeMo v2
# Highest accuracy Japanese ASR model with full preprocessing
# Uses FastAPI for Load Balancer endpoints
FROM pytorch/pytorch:2.2.2-cuda12.1-cudnn8-runtime

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip and install onnx/protobuf with fixed versions (pre-built wheels to avoid source build issues)
RUN pip install --upgrade pip && \
    pip install --no-cache-dir \
    protobuf==3.20.3 \
    onnx==1.15.0

# Install NeMo, FastAPI and all preprocessing dependencies
RUN pip install --no-cache-dir \
    nemo_toolkit[asr]>=2.0.0 \
    huggingface_hub>=0.20.0 \
    runpod>=1.5.0 \
    soundfile>=0.12.0 \
    librosa>=0.10.0 \
    deepfilternet>=0.5.0 \
    nara_wpe>=0.0.9 \
    pyannote.audio>=3.1.0 \
    numpy>=1.24.0 \
    fastapi>=0.109.0 \
    uvicorn>=0.27.0 \
    pydantic>=2.5.0

# Copy handler code
COPY handler.py /app/handler.py

# Expose port for Load Balancer (RunPod sets PORT env var)
EXPOSE 8000

# Set the handler as the entrypoint
CMD ["python", "-u", "handler.py"]
