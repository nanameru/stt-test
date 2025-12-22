import { NextRequest, NextResponse } from 'next/server';

const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;

/**
 * Kotoba Whisper v2.2 via Hugging Face Inference API
 * Japanese-optimized speech recognition model
 *
 * No RunPod setup required - just add HUGGINGFACE_API_KEY to .env.local
 *
 * Get your API key at: https://huggingface.co/settings/tokens
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Check if API key is configured
    if (!HF_API_KEY) {
      return NextResponse.json(
        {
          errorCode: 'API_KEY_NOT_CONFIGURED',
          message: 'Hugging Face API key not configured in .env.local',
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json(
        { errorCode: 'NO_AUDIO_FILE', message: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Convert audio to array buffer for Hugging Face API
    const audioBuffer = await audioFile.arrayBuffer();

    // Call Hugging Face Inference API
    const response = await fetch(
      'https://api-inference.huggingface.co/models/kotoba-tech/kotoba-whisper-v2.2',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': 'audio/webm',
        },
        body: audioBuffer,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hugging Face API error:', errorText);
      return NextResponse.json(
        {
          errorCode: 'HF_API_ERROR',
          message: `Hugging Face API returned ${response.status}: ${errorText}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    const transcription = data.text || '';
    const endTime = Date.now();
    const latency = endTime - startTime;

    return NextResponse.json({
      provider: 'kotoba-whisper',
      text: transcription,
      timestamp: startTime,
      latency,
      isFinal: true,
    });
  } catch (error) {
    console.error('Kotoba Whisper HF error:', error);
    return NextResponse.json(
      {
        errorCode: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  const configured = !!HF_API_KEY;
  return NextResponse.json({
    provider: 'kotoba-whisper',
    configured,
    envVars: {
      HUGGINGFACE_API_KEY: !!HF_API_KEY,
    },
  });
}
