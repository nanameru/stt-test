import { NextRequest, NextResponse } from 'next/server';

// OpenAI Realtime API endpoint for creating ephemeral client tokens
// This endpoint creates an ephemeral token for browser-based WebSocket connection
// Docs: https://platform.openai.com/docs/guides/realtime
export async function POST(request: NextRequest) {
  // Check for API key first
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error: 'API key not configured',
        errorCode: 'API_KEY_MISSING',
        message: 'OPENAI_API_KEY is not set. Please add it to your .env.local file.',
        provider: 'openai-realtime',
      },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'get-token') {
      // Create ephemeral client API key for browser-safe usage
      // This key is short-lived and can be safely used in the browser
      const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-realtime-preview-2024-12-17',
          voice: 'alloy',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to create Realtime API ephemeral token:', errorData);
        return NextResponse.json(
          {
            error: 'Failed to create ephemeral token',
            errorCode: 'TOKEN_CREATE_FAILED',
            message: errorData.error?.message || 'Failed to create ephemeral API token',
            provider: 'openai-realtime',
          },
          { status: response.status }
        );
      }

      const data = await response.json();

      return NextResponse.json({
        token: data.client_secret.value,
        expiresAt: data.client_secret.expires_at,
      });
    }

    return NextResponse.json(
      {
        error: 'Invalid action',
        errorCode: 'INVALID_ACTION',
        message: 'Action must be "get-token"',
        provider: 'openai-realtime',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('OpenAI Realtime error:', error);

    return NextResponse.json(
      {
        error: 'Failed to process request',
        errorCode: 'REQUEST_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        provider: 'openai-realtime',
      },
      { status: 500 }
    );
  }
}
