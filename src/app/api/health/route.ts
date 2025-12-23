import { NextResponse } from 'next/server';

interface ProviderStatus {
  provider: string;
  configured: boolean;
  envVar: string;
}

export async function GET() {
  const providers: ProviderStatus[] = [
    {
      provider: 'openai-realtime',
      configured: !!process.env.OPENAI_API_KEY,
      envVar: 'OPENAI_API_KEY',
    },
    {
      provider: 'gemini-live',
      configured: !!process.env.GOOGLE_API_KEY,
      envVar: 'GOOGLE_API_KEY',
    },
    {
      provider: 'gpt-4o-transcribe-diarize',
      configured: !!process.env.OPENAI_API_KEY,
      envVar: 'OPENAI_API_KEY',
    },
    {
      provider: 'runpod-whisper',
      configured: !!(process.env.RUNPOD_API_KEY && process.env.RUNPOD_ENDPOINT_ID),
      envVar: 'RUNPOD_API_KEY, RUNPOD_ENDPOINT_ID',
    },
    {
      provider: 'runpod-whisper-large-v3',
      configured: !!(process.env.RUNPOD_API_KEY && process.env.RUNPOD_ENDPOINT_ID),
      envVar: 'RUNPOD_API_KEY, RUNPOD_ENDPOINT_ID',
    },
    {
      provider: 'runpod-whisper-distil-large-v3',
      configured: !!(process.env.RUNPOD_API_KEY && process.env.RUNPOD_ENDPOINT_ID),
      envVar: 'RUNPOD_API_KEY, RUNPOD_ENDPOINT_ID',
    },
    {
      provider: 'kotoba-whisper',
      configured: !!(process.env.RUNPOD_API_KEY && process.env.RUNPOD_KOTOBA_WHISPER_ENDPOINT_ID),
      envVar: 'RUNPOD_API_KEY, RUNPOD_KOTOBA_WHISPER_ENDPOINT_ID',
    },
    {
      provider: 'reazonspeech',
      configured: !!(process.env.RUNPOD_API_KEY && process.env.RUNPOD_REAZONSPEECH_ENDPOINT_ID),
      envVar: 'RUNPOD_API_KEY, RUNPOD_REAZONSPEECH_ENDPOINT_ID',
    },
    {
      provider: 'parakeet',
      configured: !!(process.env.RUNPOD_API_KEY && process.env.RUNPOD_PARAKEET_ENDPOINT_ID),
      envVar: 'RUNPOD_API_KEY, RUNPOD_PARAKEET_ENDPOINT_ID',
    },
    {
      provider: 'kotoba-whisper-hf',
      configured: !!process.env.HUGGINGFACE_API_KEY,
      envVar: 'HUGGINGFACE_API_KEY',
    },
    {
      provider: 'faster-whisper-large-v3',
      configured: true, // Local - always available if Python server is running
      envVar: 'FASTER_WHISPER_URL (optional)',
    },
    {
      provider: 'whisper-large-v3-turbo',
      configured: true, // Local - always available if Python server is running
      envVar: 'FASTER_WHISPER_URL (optional)',
    },
  ];

  const allConfigured = providers.every((p) => p.configured);
  const configuredCount = providers.filter((p) => p.configured).length;

  return NextResponse.json({
    status: allConfigured ? 'ready' : 'partial',
    message: allConfigured
      ? 'All STT providers are configured'
      : `${configuredCount}/${providers.length} providers configured`,
    providers,
    audioConfig: {
      format: 'audio/webm;codecs=opus',
      sampleRate: 16000,
      channels: 1,
      chunkInterval: 2000,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
}
