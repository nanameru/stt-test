import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  // Check for API key first
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { 
        error: 'API key not configured',
        errorCode: 'API_KEY_MISSING',
        message: 'GROQ_API_KEY is not set. Please add it to your .env.local file.',
        provider: 'groq-whisper',
      },
      { status: 400 }
    );
  }

  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    
    if (!audioFile) {
      return NextResponse.json(
        { 
          error: 'No audio file provided',
          errorCode: 'NO_AUDIO',
          provider: 'groq-whisper',
        },
        { status: 400 }
      );
    }

    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3',
      language: 'ja',
      response_format: 'verbose_json',
    });

    const latency = Date.now() - startTime;

    return NextResponse.json({
      provider: 'groq-whisper',
      text: transcription.text,
      timestamp: startTime,
      latency,
      isFinal: true,
    });
  } catch (error) {
    console.error('Groq Whisper error:', error);
    
    // Handle specific error types
    const errorObj = error as { status?: number; message?: string };
    
    if (errorObj.status === 401) {
      return NextResponse.json(
        { 
          error: 'Authentication failed',
          errorCode: 'AUTH_FAILED',
          message: 'Invalid GROQ_API_KEY. Please check your API key.',
          provider: 'groq-whisper',
        },
        { status: 401 }
      );
    }
    if (errorObj.status === 429) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          errorCode: 'RATE_LIMIT',
          message: 'Groq API rate limit exceeded. Please try again later.',
          provider: 'groq-whisper',
        },
        { status: 429 }
      );
    }
    if (errorObj.status === 400) {
      return NextResponse.json(
        { 
          error: 'Invalid request',
          errorCode: 'INVALID_REQUEST',
          message: errorObj.message || 'Invalid audio format or request.',
          provider: 'groq-whisper',
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to transcribe audio',
        errorCode: 'TRANSCRIPTION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        provider: 'groq-whisper',
      },
      { status: 500 }
    );
  }
}
