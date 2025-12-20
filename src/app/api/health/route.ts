import { NextResponse } from 'next/server';

interface ProviderStatus {
  provider: string;
  configured: boolean;
  envVar: string;
}

export async function GET() {
  const providers: ProviderStatus[] = [
    {
      provider: 'openai-whisper',
      configured: !!process.env.OPENAI_API_KEY,
      envVar: 'OPENAI_API_KEY',
    },
    {
      provider: 'groq-whisper',
      configured: !!process.env.GROQ_API_KEY,
      envVar: 'GROQ_API_KEY',
    },
    {
      provider: 'gemini-pro',
      configured: !!process.env.GOOGLE_API_KEY,
      envVar: 'GOOGLE_API_KEY',
    },
    {
      provider: 'gemini-live',
      configured: !!process.env.GOOGLE_API_KEY,
      envVar: 'GOOGLE_API_KEY',
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
