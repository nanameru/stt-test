import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, RATE_LIMITS, createRateLimitHeaders } from '@/lib/rate-limit';

// This endpoint generates a single-use token for client-side WebSocket connection
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

    try {
        // Generate a single-use token using the correct endpoint
        // Path format: /v1/single-use-token/:token_type
        const response = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
            method: 'POST',
            headers: {
                'xi-api-key': process.env.ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('ElevenLabs token generation failed:', response.status, errorText);

            // Fallback to API key if token generation fails
            return NextResponse.json({
                apiKey: process.env.ELEVENLABS_API_KEY,
                provider: 'elevenlabs-scribe',
                tokenType: 'api_key',
            });
        }

        const data = await response.json();
        console.log('ElevenLabs single-use token generated successfully');

        return NextResponse.json({
            token: data.token,
            provider: 'elevenlabs-scribe',
            tokenType: 'single_use',
        });
    } catch (error) {
        console.error('Error generating ElevenLabs token:', error);

        // Fallback to API key
        return NextResponse.json({
            apiKey: process.env.ELEVENLABS_API_KEY,
            provider: 'elevenlabs-scribe',
            tokenType: 'api_key',
        });
    }
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
        message: 'ElevenLabs Scribe v2 API uses WebSocket connections. Use GET /api/stt/elevenlabs-scribe to get the token for WebSocket connection.',
        websocketUrl: 'wss://api.elevenlabs.io/v1/speech-to-text/realtime',
        timestamp: startTime,
    });
}
