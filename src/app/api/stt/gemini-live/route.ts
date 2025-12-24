import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, RATE_LIMITS, createRateLimitHeaders } from '@/lib/rate-limit';

// This endpoint provides the API key for client-side WebSocket connection
// In production, you should use ephemeral tokens instead
export async function GET(request: NextRequest) {
  // Rate limiting check
  const clientIP = getClientIP(request);
  const rateLimitResult = checkRateLimit(`stt:${clientIP}`, RATE_LIMITS.stt);

  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        error: 'Too many requests. Please try again later.',
        errorCode: 'RATE_LIMIT_EXCEEDED',
      },
      {
        status: 429,
        headers: createRateLimitHeaders(rateLimitResult),
      }
    );
  }

  if (!process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY) {
    return NextResponse.json(
      {
        error: 'API key not configured',
        errorCode: 'API_KEY_MISSING',
        message: 'NEXT_PUBLIC_GOOGLE_AI_API_KEY is not set. Please add it to your .env.local file.',
      },
      { status: 400 }
    );
  }

  // Return the API key for WebSocket connection
  // WARNING: In production, use ephemeral tokens for security
  return NextResponse.json({
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY,
  });
}

// Keep the POST endpoint for fallback/legacy support
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  if (!process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY) {
    return NextResponse.json(
      {
        error: 'API key not configured',
        errorCode: 'API_KEY_MISSING',
        message: 'NEXT_PUBLIC_GOOGLE_AI_API_KEY is not set. Please add it to your .env.local file.',
        provider: 'gemini-live',
      },
      { status: 400 }
    );
  }

  // Return info about WebSocket connection
  return NextResponse.json({
    provider: 'gemini-live',
    message: 'Gemini Live API now uses WebSocket connections. Use GET /api/stt/gemini-live to get the API key for WebSocket connection.',
    websocketUrl: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
    timestamp: startTime,
  });
}
