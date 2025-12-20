import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    
    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');

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
    return NextResponse.json(
      { error: 'Failed to transcribe audio' },
      { status: 500 }
    );
  }
}
