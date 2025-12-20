import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  // Check for API key first
  if (!process.env.GOOGLE_API_KEY) {
    return NextResponse.json(
      { 
        error: 'API key not configured',
        errorCode: 'API_KEY_MISSING',
        message: 'GOOGLE_API_KEY is not set. Please add it to your .env.local file.',
        provider: 'gemini-pro',
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
          provider: 'gemini-pro',
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: audioFile.type || 'audio/webm',
          data: base64Audio,
        },
      },
      {
        text: 'この音声を日本語で文字起こししてください。話者が複数いる場合は、話者を区別して表示してください。文字起こしのテキストのみを出力し、説明は不要です。',
      },
    ]);

    const response = await result.response;
    const text = response.text();
    const latency = Date.now() - startTime;

    return NextResponse.json({
      provider: 'gemini-pro',
      text,
      timestamp: startTime,
      latency,
      isFinal: true,
    });
  } catch (error) {
    console.error('Gemini Pro error:', error);
    
    // Handle specific error types
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('401')) {
      return NextResponse.json(
        { 
          error: 'Authentication failed',
          errorCode: 'AUTH_FAILED',
          message: 'Invalid GOOGLE_API_KEY. Please check your API key.',
          provider: 'gemini-pro',
        },
        { status: 401 }
      );
    }
    if (errorMessage.includes('RATE_LIMIT') || errorMessage.includes('429')) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          errorCode: 'RATE_LIMIT',
          message: 'Google API rate limit exceeded. Please try again later.',
          provider: 'gemini-pro',
        },
        { status: 429 }
      );
    }
    if (errorMessage.includes('INVALID_ARGUMENT') || errorMessage.includes('400')) {
      return NextResponse.json(
        { 
          error: 'Invalid request',
          errorCode: 'INVALID_REQUEST',
          message: errorMessage || 'Invalid audio format or request.',
          provider: 'gemini-pro',
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to transcribe audio',
        errorCode: 'TRANSCRIPTION_FAILED',
        message: errorMessage,
        provider: 'gemini-pro',
      },
      { status: 500 }
    );
  }
}
