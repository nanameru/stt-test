import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Check for local Python server URL (default: http://localhost:8000)
  const FASTER_WHISPER_URL = process.env.FASTER_WHISPER_URL || 'http://localhost:8000';

  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json(
        {
          error: 'No audio file provided',
          errorCode: 'NO_AUDIO',
          provider: 'faster-whisper-large-v3',
        },
        { status: 400 }
      );
    }

    // Forward the audio to the local Python server
    const pythonFormData = new FormData();
    pythonFormData.append('audio', audioFile);

    const response = await fetch(`${FASTER_WHISPER_URL}/transcribe`, {
      method: 'POST',
      body: pythonFormData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: 'Local transcription failed',
          errorCode: 'LOCAL_SERVER_ERROR',
          message: errorData.detail || `Local server returned status: ${response.status}`,
          provider: 'faster-whisper-large-v3',
        },
        { status: response.status }
      );
    }

    const result = await response.json();
    const latency = Date.now() - startTime;

    return NextResponse.json({
      provider: 'faster-whisper-large-v3',
      text: result.text,
      timestamp: startTime,
      latency,
      isFinal: true,
      speaker: result.speaker,
    });
  } catch (error) {
    console.error('Faster Whisper Large V3 error:', error);

    // Check if the error is a connection error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
      return NextResponse.json(
        {
          error: 'Local server not available',
          errorCode: 'SERVER_UNAVAILABLE',
          message: `Cannot connect to local Faster Whisper server at ${FASTER_WHISPER_URL}. Please ensure the Python server is running.`,
          provider: 'faster-whisper-large-v3',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to transcribe audio',
        errorCode: 'TRANSCRIPTION_FAILED',
        message: errorMessage,
        provider: 'faster-whisper-large-v3',
      },
      { status: 500 }
    );
  }
}
