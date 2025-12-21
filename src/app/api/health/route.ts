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
      provider: 'faster-whisper-large-v3',
      configured: true, // Local - always available if Python server is running
      envVar: 'FASTER_WHISPER_URL (optional)',
    },
    {
      provider: 'whisper-large-v3-turbo',
      configured: !!process.env.OPENAI_API_KEY,
      envVar: 'OPENAI_API_KEY',
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
