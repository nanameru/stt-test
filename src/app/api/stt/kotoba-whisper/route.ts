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

    const runpodBase = `https://api.runpod.ai/v2/${RUNPOD_KOTOBA_ENDPOINT_ID}`;
    const payload = {
      input: {
        audio_base64: audioBase64,
        language: 'ja',
        task: 'transcribe',
        enable_denoise: true, // Enable DeepFilterNet3 noise suppression
        enable_dereverberation: true, // Enable WPE dereverberation
        enable_vad: true, // Enable Silero VAD for voice activity detection
      },
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RUNPOD_API_KEY}`,
    };

    // Try runsync first (fastest path). If not available, fall back to /run + polling.
    let data: any | null = null;
    const runsyncResponse = await fetch(`${runpodBase}/runsync`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (runsyncResponse.status === 404) {
      // Fallback: queue-based endpoint (run + status polling)
      const runResponse = await fetch(`${runpodBase}/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!runResponse.ok) {
        const errorText = await runResponse.text();
        console.error('RunPod Kotoba API error:', errorText);
        return NextResponse.json(
          {
            errorCode: 'RUNPOD_API_ERROR',
            message: `RunPod API returned ${runResponse.status}: ${errorText}`,
          },
          { status: runResponse.status }
        );
      }

      const runData = await runResponse.json();
      const jobId = runData.id;

      // If output is already present, use it directly.
      if (runData.output) {
        data = runData;
      } else {
        const pollStart = Date.now();
        const timeoutMs = 60000;
        const pollIntervalMs = 1000;

        while (Date.now() - pollStart < timeoutMs) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          const statusResponse = await fetch(`${runpodBase}/status/${jobId}`, {
            method: 'GET',
            headers,
          });

          if (!statusResponse.ok) {
            const errorText = await statusResponse.text();
            console.error('RunPod Kotoba API status error:', errorText);
            return NextResponse.json(
              {
                errorCode: 'RUNPOD_STATUS_ERROR',
                message: `RunPod status API returned ${statusResponse.status}: ${errorText}`,
              },
              { status: statusResponse.status }
            );
          }

          const statusData = await statusResponse.json();

          if (statusData.status === 'COMPLETED') {
            data = statusData;
            break;
          }

          if (statusData.status === 'FAILED') {
            return NextResponse.json(
              {
                errorCode: 'TRANSCRIPTION_FAILED',
                message: statusData.error || 'RunPod Kotoba transcription failed',
              },
              { status: 500 }
            );
          }
        }

        if (!data) {
          return NextResponse.json(
            {
              errorCode: 'RUNPOD_TIMEOUT',
              message: 'RunPod Kotoba transcription timed out',
            },
            { status: 504 }
          );
        }
      }
    } else if (!runsyncResponse.ok) {
      const errorText = await runsyncResponse.text();
      console.error('RunPod Kotoba API error:', errorText);
      return NextResponse.json(
        {
          errorCode: 'RUNPOD_API_ERROR',
          message: `RunPod API returned ${runsyncResponse.status}: ${errorText}`,
        },
        { status: runsyncResponse.status }
      );
    } else {
      data = await runsyncResponse.json();
    }

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
