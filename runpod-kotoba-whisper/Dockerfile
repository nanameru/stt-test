# RunPod Custom Worker for Kotoba Whisper v2.2
# Optimized for Japanese speech recognition
# Use a PyTorch CUDA runtime image to avoid installing torch during build.
FROM pytorch/pytorch:2.2.2-cuda12.1-cudnn8-runtime

# Set working directory
WORKDIR /app

# Install ffmpeg via conda to avoid apt signature issues during build.
RUN conda install -y -c conda-forge ffmpeg && conda clean -afy

# Install Transformers and required dependencies
RUN pip install --no-cache-dir \
    transformers>=4.30.0 \
    accelerate>=0.20.0 \
    librosa>=0.10.0 \
    soundfile>=0.12.0 \
    runpod>=1.5.0

# NOTE: Skip pre-download during image build to avoid GPU requirement on build hosts.
# The model will be downloaded on first run inside RunPod (GPU environment).

# Copy handler code
COPY handler.py /app/handler.py

# Set the handler as the entrypoint
CMD ["python", "-u", "handler.py"]
