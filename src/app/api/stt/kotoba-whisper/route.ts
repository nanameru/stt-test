import { NextRequest, NextResponse } from 'next/server';

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_KOTOBA_ENDPOINT_ID = process.env.RUNPOD_KOTOBA_ENDPOINT_ID;

/**
 * RunPod Custom Worker - Kotoba Whisper v2.2
 * Japanese-optimized speech recognition model
 *
 * Model: kotoba-tech/kotoba-whisper-v2.2
 * Specialty: High-accuracy Japanese transcription
 * Expected latency: 2-4 seconds (Active Workers)
 *
 * Hugging Face: https://huggingface.co/kotoba-tech/kotoba-whisper-v2.2
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Check if API key is configured
    if (!RUNPOD_API_KEY || !RUNPOD_KOTOBA_ENDPOINT_ID) {
      return NextResponse.json(
        {
          errorCode: 'API_KEY_NOT_CONFIGURED',
          message: 'RunPod API key or Kotoba Endpoint ID not configured in .env.local',
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

    // Convert audio to base64 for RunPod API
    const audioBuffer = await audioFile.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    // RunPod Custom Worker endpoint URL
    const runpodUrl = `https://api.runpod.ai/v2/${RUNPOD_KOTOBA_ENDPOINT_ID}/runsync`;

    // Call RunPod Kotoba Whisper Worker
    const response = await fetch(runpodUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNPOD_API_KEY}`,
      },
      body: JSON.stringify({
        input: {
          audio_base64: audioBase64,
          language: 'ja', // Japanese
          task: 'transcribe',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('RunPod Kotoba API error:', errorText);
      return NextResponse.json(
        {
          errorCode: 'RUNPOD_API_ERROR',
          message: `RunPod API returned ${response.status}: ${errorText}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.status === 'FAILED') {
      return NextResponse.json(
        {
          errorCode: 'TRANSCRIPTION_FAILED',
          message: data.error || 'RunPod Kotoba transcription failed',
        },
        { status: 500 }
      );
    }

    const transcription = data.output?.transcription || '';
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
    console.error('Kotoba Whisper error:', error);
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
  const configured = !!(RUNPOD_API_KEY && RUNPOD_KOTOBA_ENDPOINT_ID);
  return NextResponse.json({
    provider: 'kotoba-whisper',
    configured,
    envVars: {
      RUNPOD_API_KEY: !!RUNPOD_API_KEY,
      RUNPOD_KOTOBA_ENDPOINT_ID: !!RUNPOD_KOTOBA_ENDPOINT_ID,
    },
  });
}
