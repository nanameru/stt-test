import { NextRequest, NextResponse } from 'next/server';

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID;

/**
 * RunPod Serverless Faster-Whisper API endpoint (Large V3)
 * Uses RunPod's cloud GPU infrastructure for high-accuracy transcription
 *
 * Model: large-v3 (highest accuracy, slower than turbo)
 * Use case: When accuracy is more important than speed
 * Expected latency: 3-5 seconds total (2s recording + 1-3s processing)
 *
 * Docs: https://github.com/runpod-workers/worker-faster_whisper
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Check if API key is configured
    if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
      return NextResponse.json(
        {
          errorCode: 'API_KEY_NOT_CONFIGURED',
          message: 'RunPod API key or Endpoint ID not configured in .env.local',
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

    // RunPod Serverless API endpoint URL
    const runpodUrl = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/runsync`;

    // Call RunPod Faster-Whisper API with large-v3 model
    const response = await fetch(runpodUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNPOD_API_KEY}`,
      },
      body: JSON.stringify({
        input: {
          audio_base64: audioBase64,
          model: 'large-v3', // Highest accuracy model
          transcription: 'plain_text',
          translate: false,
          language: 'ja', // Japanese
          temperature: 0.0,
          best_of: 5, // Higher for better accuracy
          beam_size: 5, // Higher for better accuracy
          enable_vad: true, // Voice Activity Detection to filter silence
          initial_prompt: 'これは日本語の音声です。', // Japanese context for better recognition
          condition_on_previous_text: false, // Disable for short clips to prevent repetition
          word_timestamps: true, // Enable word-level timestamps
          no_speech_threshold: 0.6, // Threshold for detecting non-speech
          compression_ratio_threshold: 2.4, // Threshold for compression ratio
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('RunPod API error:', errorText);
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
          message: data.error || 'RunPod transcription failed',
        },
        { status: 500 }
      );
    }

    const transcription = data.output?.transcription || '';
    const endTime = Date.now();
    const latency = endTime - startTime;

    return NextResponse.json({
      provider: 'runpod-whisper-large-v3',
      text: transcription,
      timestamp: startTime,
      latency,
      isFinal: true,
    });
  } catch (error) {
    console.error('RunPod Whisper Large V3 error:', error);
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
  const configured = !!(RUNPOD_API_KEY && RUNPOD_ENDPOINT_ID);
  return NextResponse.json({
    provider: 'runpod-whisper-large-v3',
    configured,
    envVars: {
      RUNPOD_API_KEY: !!RUNPOD_API_KEY,
      RUNPOD_ENDPOINT_ID: !!RUNPOD_ENDPOINT_ID,
    },
  });
}
