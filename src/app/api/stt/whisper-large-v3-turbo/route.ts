import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Check for local Python server URL (default: http://localhost:8000)
  const WHISPER_SERVER_URL = process.env.FASTER_WHISPER_URL || 'http://localhost:8000';

  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json(
        {
          error: 'No audio file provided',
          errorCode: 'NO_AUDIO',
          provider: 'whisper-large-v3-turbo',
        },
        { status: 400 }
      );
    }

    // Forward the audio to the local Python server's turbo endpoint
    const pythonFormData = new FormData();
    pythonFormData.append('audio', audioFile);

    const response = await fetch(`${WHISPER_SERVER_URL}/transcribe-turbo`, {
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
          provider: 'whisper-large-v3-turbo',
        },
        { status: response.status }
      );
    }

    const result = await response.json();
    const latency = Date.now() - startTime;

    return NextResponse.json({
      provider: 'whisper-large-v3-turbo',
      text: result.text,
      timestamp: startTime,
      latency,
      isFinal: true,
    });
  } catch (error) {
    console.error('Whisper Large V3 Turbo error:', error);

    // Check if the error is a connection error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
      return NextResponse.json(
        {
          error: 'Local server not available',
          errorCode: 'SERVER_UNAVAILABLE',
          message: `Cannot connect to local Whisper server at ${WHISPER_SERVER_URL}. Please ensure the Python server is running.`,
          provider: 'whisper-large-v3-turbo',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to transcribe audio',
        errorCode: 'TRANSCRIPTION_FAILED',
        message: errorMessage,
        provider: 'whisper-large-v3-turbo',
      },
      { status: 500 }
    );
  }
}

