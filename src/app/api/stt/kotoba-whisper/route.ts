import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, RATE_LIMITS, createRateLimitHeaders } from '@/lib/rate-limit';

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_KOTOBA_ENDPOINT_ID = process.env.RUNPOD_KOTOBA_ENDPOINT_ID;

// Maximum audio file size (25MB)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Speaker diarization segment type
interface DiarizationSegment {
  speaker: string;
  start: number;
  end: number;
}

// Transcription chunk type
interface TranscriptionChunk {
  text: string;
  start: number;
  end: number;
}

/**
 * Merge transcription chunks with speaker diarization data
 * Maps each chunk to the most likely speaker based on timestamp overlap
 */
function formatWithSpeakers(
  chunks: TranscriptionChunk[],
  diarization: DiarizationSegment[]
): string {
  if (chunks.length === 0) return '';
  if (diarization.length === 0) {
    // No diarization data, return plain text
    return chunks.map(c => c.text).join(' ');
  }

  // Map speaker IDs to sequential numbers (話者1, 話者2, etc.)
  const speakerMap = new Map<string, number>();
  let speakerCount = 0;

  const result: string[] = [];
  let currentSpeaker: string | null = null;
  let currentText: string[] = [];

  for (const chunk of chunks) {
    // Find the speaker segment that best overlaps with this chunk
    let bestSpeaker = 'SPEAKER_00';
    let bestOverlap = 0;

    for (const segment of diarization) {
      const overlapStart = Math.max(chunk.start, segment.start);
      const overlapEnd = Math.min(chunk.end, segment.end);
      const overlap = Math.max(0, overlapEnd - overlapStart);

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestSpeaker = segment.speaker;
      }
    }

    // Assign sequential speaker number if not seen before
    if (!speakerMap.has(bestSpeaker)) {
      speakerCount++;
      speakerMap.set(bestSpeaker, speakerCount);
    }

    const speakerNum = speakerMap.get(bestSpeaker)!;
    const speakerLabel = `話者${speakerNum}`;

    if (currentSpeaker !== speakerLabel) {
      // Flush previous speaker's text
      if (currentSpeaker && currentText.length > 0) {
        result.push(`[${currentSpeaker}] ${currentText.join('')}`);
      }
      currentSpeaker = speakerLabel;
      currentText = [chunk.text];
    } else {
      currentText.push(chunk.text);
    }
  }

  // Flush remaining text
  if (currentSpeaker && currentText.length > 0) {
    result.push(`[${currentSpeaker}] ${currentText.join('')}`);
  }

  return result.join('\n');
}

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
    // Rate limiting check
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(`stt:${clientIP}`, RATE_LIMITS.stt);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          errorCode: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
        },
        {
          status: 429,
          headers: createRateLimitHeaders(rateLimitResult),
        }
      );
    }

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

    // File size validation
    if (audioFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          errorCode: 'FILE_TOO_LARGE',
          message: `Audio file exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`
        },
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
        enable_diarization: true, // Enable pyannote speaker diarization
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
    const diarization = data.output?.diarization || [];
    const chunks = data.output?.chunks || [];
    const endTime = Date.now();
    const latency = endTime - startTime;

    // Format transcription with speaker labels if diarization is available
    let formattedText = transcription;
    if (diarization.length > 0 && chunks.length > 0) {
      // Merge transcription chunks with speaker information
      formattedText = formatWithSpeakers(chunks, diarization);
    }

    return NextResponse.json({
      provider: 'kotoba-whisper',
      text: formattedText,
      timestamp: startTime,
      latency,
      isFinal: true,
      diarization: diarization, // Include raw diarization data
      chunks: chunks, // Include timestamped chunks
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
