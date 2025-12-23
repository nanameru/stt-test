import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, RATE_LIMITS, createRateLimitHeaders } from '@/lib/rate-limit';

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_PARAKEET_ENDPOINT_ID = process.env.RUNPOD_PARAKEET_ENDPOINT_ID;

// Maximum audio file size (25MB)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * RunPod Serverless NVIDIA Parakeet-TDT (Japanese) API endpoint
 * Fast and accurate Japanese ASR with automatic punctuation
 *
 * Features:
 * - FastConformer TDT-CTC architecture
 * - Automatic punctuation
 * - 0.6B parameters - lightweight and efficient
 *
 * Model: nvidia/parakeet-tdt_ctc-0.6b-ja
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        // Rate limiting check
        const clientIP = getClientIP(request);
        const rateLimitResult = checkRateLimit(`stt:${clientIP}`, RATE_LIMITS.stt);

        if (!rateLimitResult.success) {
            return NextResponse.json(
                {
                    errorCode: 'RATE_LIMIT_EXCEEDED',
                    message: 'Too many requests. Please try again later.',
                },
                {
                    status: 429,
                    headers: createRateLimitHeaders(rateLimitResult),
                }
            );
        }

        // Check if API key is configured
        if (!RUNPOD_API_KEY || !RUNPOD_PARAKEET_ENDPOINT_ID) {
            return NextResponse.json(
                {
                    errorCode: 'API_KEY_NOT_CONFIGURED',
                    message: 'RunPod API key or Parakeet Endpoint ID not configured',
                },
                { status: 500 }
            );
        }

        const formData = await request.formData();
        const audioFile = formData.get('audio') as File;

        if (!audioFile) {
            return NextResponse.json(
                { errorCode: 'NO_AUDIO_FILE', message: 'No audio file provided' },
                { status: 400 }
            );
        }

        // File size validation
        if (audioFile.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                {
                    errorCode: 'FILE_TOO_LARGE',
                    message: `Audio file exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`
                },
                { status: 400 }
            );
        }

        // Convert audio to base64 for RunPod API
        const audioBuffer = await audioFile.arrayBuffer();
        const audioBase64 = Buffer.from(audioBuffer).toString('base64');

        // RunPod Serverless API endpoint URL
        const runpodUrl = `https://api.runpod.ai/v2/${RUNPOD_PARAKEET_ENDPOINT_ID}/runsync`;

        // Call RunPod Parakeet API
        const response = await fetch(runpodUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RUNPOD_API_KEY}`,
            },
            body: JSON.stringify({
                input: {
                    audio_base64: audioBase64,
                },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('RunPod API error:', errorText);
            return NextResponse.json(
                {
                    errorCode: 'RUNPOD_API_ERROR',
                    message: `RunPod API returned ${response.status}: ${errorText}`,
                },
                { status: response.status }
            );
        }

        const data = await response.json();

        if (data.status === 'FAILED') {
            return NextResponse.json(
                {
                    errorCode: 'TRANSCRIPTION_FAILED',
                    message: data.error || 'Parakeet transcription failed',
                },
                { status: 500 }
            );
        }

        const transcription = data.output?.transcription || '';
        const endTime = Date.now();
        const latency = endTime - startTime;

        return NextResponse.json({
            provider: 'parakeet-tdt-ja',
            text: transcription,
            timestamp: startTime,
            latency,
            isFinal: true,
        });
    } catch (error) {
        console.error('Parakeet error:', error);
        return NextResponse.json(
            {
                errorCode: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// Health check endpoint
export async function GET() {
    const configured = !!(RUNPOD_API_KEY && RUNPOD_PARAKEET_ENDPOINT_ID);
    return NextResponse.json({
        provider: 'parakeet-tdt-ja',
        configured,
        envVars: {
            RUNPOD_API_KEY: !!RUNPOD_API_KEY,
            RUNPOD_PARAKEET_ENDPOINT_ID: !!RUNPOD_PARAKEET_ENDPOINT_ID,
        },
    });
}
