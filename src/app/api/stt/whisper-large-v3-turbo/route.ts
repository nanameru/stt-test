import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Check for API key first
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error: 'API key not configured',
        errorCode: 'API_KEY_MISSING',
        message: 'OPENAI_API_KEY is not set. Please add it to your .env.local file.',
        provider: 'whisper-large-v3-turbo',
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
          provider: 'whisper-large-v3-turbo',
        },
        { status: 400 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Using Whisper Large V3 Turbo model
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3-turbo',
      language: 'ja',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    const latency = Date.now() - startTime;

    return NextResponse.json({
      provider: 'whisper-large-v3-turbo',
      text: transcription.text,
      timestamp: startTime,
      latency,
      isFinal: true,
    });
  } catch (error) {
    console.error('Whisper Large V3 Turbo error:', error);

    // Handle specific error types
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        return NextResponse.json(
          {
            error: 'Authentication failed',
            errorCode: 'AUTH_FAILED',
            message: 'Invalid OPENAI_API_KEY. Please check your API key.',
            provider: 'whisper-large-v3-turbo',
          },
          { status: 401 }
        );
      }
      if (error.status === 429) {
        return NextResponse.json(
          {
            error: 'Rate limit exceeded',
            errorCode: 'RATE_LIMIT',
            message: 'OpenAI API rate limit exceeded. Please try again later.',
            provider: 'whisper-large-v3-turbo',
          },
          { status: 429 }
        );
      }
      if (error.status === 400) {
        return NextResponse.json(
          {
            error: 'Invalid request',
            errorCode: 'INVALID_REQUEST',
            message: error.message || 'Invalid audio format or request.',
            provider: 'whisper-large-v3-turbo',
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Failed to transcribe audio',
        errorCode: 'TRANSCRIPTION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        provider: 'whisper-large-v3-turbo',
      },
      { status: 500 }
    );
  }
}
