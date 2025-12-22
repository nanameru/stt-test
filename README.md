# Real-time STT Evaluation App

A desktop application for evaluating and comparing multiple Speech-to-Text (STT) APIs in real-time. Built with Next.js and Electron.

## Features

- Real-time audio capture from microphone
- Parallel transcription using 6 STT providers:
  - **OpenAI Realtime API** (gpt-4o-realtime via WebSocket with ephemeral tokens)
  - **Gemini Live API** (gemini-2.0-flash with speaker diarization)
  - **GPT-4o Transcribe Diarize** (Advanced speaker diarization)
  - **Faster Whisper Large V3** (Local/Self-hosted)
  - **Whisper Large V3 Turbo** (Fast OpenAI model)
  - **RunPod Whisper** (Cloud GPU-accelerated via RunPod Serverless)
- Latency measurement for each provider
- Evaluation report generation
- Speaker diarization support (GPT-4o Transcribe, Gemini Live)
- Local processing option (Faster Whisper)
- WebSocket streaming for true real-time transcription (OpenAI Realtime API)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Keys

Copy the example environment file and add your API keys:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your API keys:

```env
# OpenAI API Key (for Whisper API, GPT-4o Transcribe, Whisper Large V3 Turbo)
# Get your key at: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...

# Google API Key (for Gemini Live API)
# Get your key at: https://aistudio.google.com/apikey
GOOGLE_API_KEY=AIza...

# RunPod API Configuration (for cloud GPU-accelerated Whisper)
# Get your API key at: https://www.runpod.io/console/user/settings
# Deploy Faster-Whisper template: https://console.runpod.io/hub/runpod-workers/worker-faster_whisper
RUNPOD_API_KEY=your-runpod-api-key
RUNPOD_ENDPOINT_ID=your-endpoint-id

# Optional: Local Faster Whisper server URL (default: http://localhost:8000)
FASTER_WHISPER_URL=http://localhost:8000
```

### 3. Run the Application

**As Electron Desktop App (Recommended):**

```bash
npm run electron:dev
```

**As Web App:**

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. (Optional) Set Up Local Faster Whisper Server

To use the Faster Whisper Large V3 local provider:

```bash
cd python-server
pip install -r requirements.txt
python server.py
```

The server will run on http://localhost:8000. See [python-server/README.md](python-server/README.md) for details.

### 5. (Optional) Set Up RunPod Cloud GPU Whisper

To use the RunPod Whisper provider with cloud GPU acceleration:

1. **Sign up for RunPod**: Visit [https://www.runpod.io](https://www.runpod.io)
2. **Deploy Faster-Whisper template**: Go to [https://console.runpod.io/hub/runpod-workers/worker-faster_whisper](https://console.runpod.io/hub/runpod-workers/worker-faster_whisper) and click "Deploy"
3. **Configure for Low Latency (Active Workers)**:
   - Set **Workers**: Min 1, Max 1 (keeps GPU always ready)
   - Set **GPU Type**: RTX 4090 or higher
   - Set **Idle Timeout**: 5 seconds
   - This eliminates cold start delays for ~2-3 second total latency
4. **Get your Endpoint ID**: After deployment, copy the Endpoint ID
5. **Get your API Key**: Visit [https://www.runpod.io/console/user/settings](https://www.runpod.io/console/user/settings) and create an API key
6. **Add to `.env.local`**: Update the `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` variables

**Pricing Options**:
- **Flex Workers** (default): $0.00025/second (~$0.015/min) - 4-8 second latency with cold starts
- **Active Workers** (recommended for low latency): $0.34/hour (~$8/day if running 24/7) - 2-3 second latency, no cold starts

### 6. Grant Microphone Permission

When prompted, allow the application to access your microphone.

## Usage

1. Click **"Start Recording"** to begin capturing audio
2. Speak into your microphone
3. Watch real-time transcriptions appear in each provider panel
4. Click **"Stop Recording"** when finished
5. Click **"Generate Evaluation Report"** to see comparison metrics

## API Configuration Status

The app will show which providers are configured. Visit `/api/health` to check the status of all providers programmatically.

## Audio Configuration

The app uses the following audio settings for consistent evaluation:

| Setting | Value |
|---------|-------|
| Format | WebM/Opus |
| Sample Rate | 16kHz |
| Channels | Mono |
| Chunk Interval | 2 seconds |
| Echo Cancellation | Enabled |
| Noise Suppression | Enabled |

## Supported Audio Formats

All providers support the following input formats:
- WebM (used by this app)
- MP3
- WAV
- M4A
- FLAC

Maximum file size: 25MB per chunk (well within limits with 2-second chunks)

## Building for Production

### Build Electron App

```bash
npm run electron:build
```

This will create distributable packages in the `dist-electron` directory:
- **Windows**: `.exe` installer (NSIS)
- **macOS**: `.dmg` disk image
- **Linux**: `.AppImage`

## Troubleshooting

### "API key not configured" Error

Make sure you have:
1. Created `.env.local` file in the project root
2. Added the correct API key for the provider
3. Restarted the development server after adding keys

### Microphone Not Working

1. Check browser/app permissions for microphone access
2. Ensure no other application is using the microphone
3. Try refreshing the page or restarting the app

### Rate Limit Errors

If you see rate limit errors, wait a few minutes before trying again. Consider:
- Reducing the number of enabled providers
- Increasing the chunk interval

## Project Structure

```
stt-test/
├── electron/                    # Electron main process
│   └── main.js
├── python-server/               # Local Faster Whisper server
│   ├── server.py
│   ├── requirements.txt
│   └── README.md
├── src/
│   ├── app/
│   │   ├── api/stt/             # STT API routes
│   │   │   ├── openai-realtime/
│   │   │   ├── gemini-live/
│   │   │   ├── gpt-4o-transcribe-diarize/
│   │   │   ├── faster-whisper-large-v3/
│   │   │   ├── whisper-large-v3-turbo/
│   │   │   └── runpod-whisper/
│   │   └── page.tsx             # Main UI
│   ├── components/              # React components
│   └── lib/                     # Utilities and hooks
├── docs/
│   ├── TASK_SPEC.md             # Original requirements (Japanese)
│   └── OPENAI_API_COMPARISON.md # OpenAI API comparison
└── .env.example                 # Environment template
```

## License

MIT
