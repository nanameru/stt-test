# Real-time STT Evaluation App

A desktop application for evaluating and comparing multiple Speech-to-Text (STT) APIs in real-time. Built with Next.js and Electron.

## Features

- Real-time audio capture from microphone
- Parallel transcription using 4 STT providers:
  - **OpenAI Whisper** (whisper-1)
  - **Groq Whisper** (whisper-large-v3)
  - **Gemini Pro** (gemini-2.0-flash with audio input)
  - **Gemini Live** (gemini-2.0-flash with speaker diarization prompt)
- Latency measurement for each provider
- Evaluation report generation
- Speaker diarization support (Gemini providers)

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
# OpenAI API Key (for Whisper)
# Get your key at: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...

# Groq API Key (for Whisper Large V3)
# Get your key at: https://console.groq.com/keys
GROQ_API_KEY=gsk_...

# Google API Key (for Gemini)
# Get your key at: https://aistudio.google.com/apikey
GOOGLE_API_KEY=AIza...
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

### 4. Grant Microphone Permission

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
├── electron/           # Electron main process
│   └── main.js
├── src/
│   ├── app/
│   │   ├── api/stt/    # STT API routes
│   │   │   ├── openai-whisper/
│   │   │   ├── groq-whisper/
│   │   │   ├── gemini-pro/
│   │   │   └── gemini-live/
│   │   └── page.tsx    # Main UI
│   ├── components/     # React components
│   └── lib/            # Utilities and hooks
├── docs/
│   └── TASK_SPEC.md    # Original requirements (Japanese)
└── .env.example        # Environment template
```

## License

MIT
