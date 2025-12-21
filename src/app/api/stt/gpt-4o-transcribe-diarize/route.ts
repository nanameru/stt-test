import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

interface DiarizedSegment {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

interface DiarizedTranscription {
  text: string;
  segments: DiarizedSegment[];
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Check for API key first
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error: 'API key not configured',
        errorCode: 'API_KEY_MISSING',
        message: 'OPENAI_API_KEY is not set. Please add it to your .env.local file.',
        provider: 'gpt-4o-transcribe-diarize',
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
          provider: 'gpt-4o-transcribe-diarize',
        },
        { status: 400 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Using GPT-4o transcription model with speaker diarization
    // Docs: https://platform.openai.com/docs/guides/speech-to-text
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'gpt-4o-transcribe-diarize',
      language: 'ja',
      response_format: 'diarized_json',  // Required for speaker segments
      // @ts-expect-error - chunking_strategy is required for audio > 30s
      chunking_strategy: 'auto',
    }) as unknown as DiarizedTranscription;

    const latency = Date.now() - startTime;

    // Format with speaker labels
    let text = transcription.text;
    const segments = transcription.segments;

    if (segments && Array.isArray(segments)) {
      // Format with speaker labels
      text = segments
        .map((seg) => {
          const speaker = seg.speaker ? `[${seg.speaker}] ` : '';
          return `${speaker}${seg.text}`;
        })
        .join(' ');
    }

    return NextResponse.json({
      provider: 'gpt-4o-transcribe-diarize',
      text,
      timestamp: startTime,
      latency,
      isFinal: true,
      segments: segments || [],
    });
  } catch (error) {
    console.error('GPT-4o Transcribe Diarize error:', error);

    // Handle specific error types
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        return NextResponse.json(
          {
            error: 'Authentication failed',
            errorCode: 'AUTH_FAILED',
            message: 'Invalid OPENAI_API_KEY. Please check your API key.',
            provider: 'gpt-4o-transcribe-diarize',
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
            provider: 'gpt-4o-transcribe-diarize',
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
            provider: 'gpt-4o-transcribe-diarize',
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
        provider: 'gpt-4o-transcribe-diarize',
      },
      { status: 500 }
    );
  }
}
