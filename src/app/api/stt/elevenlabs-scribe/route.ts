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
                provider: 'elevenlabs-scribe',
            },
            {
                status: 429,
                headers: createRateLimitHeaders(rateLimitResult),
            }
        );
    }

    if (!process.env.ELEVENLABS_API_KEY) {
        return NextResponse.json(
            {
                error: 'API key not configured',
                errorCode: 'API_KEY_MISSING',
                message: 'ELEVENLABS_API_KEY is not set. Please add it to your .env.local file.',
                provider: 'elevenlabs-scribe',
            },
            { status: 400 }
        );
    }

    // Return the API key for WebSocket connection
    // WARNING: In production, use ephemeral tokens for security
    return NextResponse.json({
        apiKey: process.env.ELEVENLABS_API_KEY,
        provider: 'elevenlabs-scribe',
    });
}

// Keep the POST endpoint for fallback/legacy support
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    if (!process.env.ELEVENLABS_API_KEY) {
        return NextResponse.json(
            {
                error: 'API key not configured',
                errorCode: 'API_KEY_MISSING',
                message: 'ELEVENLABS_API_KEY is not set. Please add it to your .env.local file.',
                provider: 'elevenlabs-scribe',
            },
            { status: 400 }
        );
    }

    // Return info about WebSocket connection
    return NextResponse.json({
        provider: 'elevenlabs-scribe',
        message: 'ElevenLabs Scribe v2 API uses WebSocket connections. Use GET /api/stt/elevenlabs-scribe to get the API key for WebSocket connection.',
        websocketUrl: 'wss://api.elevenlabs.io/v1/speech-to-text/realtime',
        timestamp: startTime,
    });
}
