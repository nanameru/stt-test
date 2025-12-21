# Faster Whisper Large V3 - Local Python Server

This directory contains a local Python server for running Faster Whisper Large V3 model for real-time speech-to-text transcription.

## Setup

### 1. Install Python Dependencies

```bash
cd python-server
pip install -r requirements.txt
```

### 2. Run the Server

```bash
python server.py
```

The server will start on `http://localhost:8000`

## Configuration

### Environment Variable

In your main `.env.local` file, you can optionally set:

```env
FASTER_WHISPER_URL=http://localhost:8000
```

If not set, it defaults to `http://localhost:8000`

## Usage

The server provides a `/transcribe` endpoint that accepts audio files and returns transcription results.

### Test the Server

```bash
curl http://localhost:8000
```

Expected response:
```json
{
  "status": "running",
  "model": "faster-whisper-large-v3",
  "device": "cpu"
}
```

## Model Information

- **Model**: Faster Whisper Large V3
- **Device**: CPU (can be changed to CUDA in server.py)
- **Compute Type**: int8 (for CPU efficiency)
- **Language**: Japanese (ja)
- **Features**:
  - Voice Activity Detection (VAD)
  - Beam search decoding

## Notes

- The model will be downloaded automatically on first run (~3GB)
- For GPU acceleration, change `device="cpu"` to `device="cuda"` in server.py
- For GPU, use `compute_type="float16"` instead of `"int8"`
