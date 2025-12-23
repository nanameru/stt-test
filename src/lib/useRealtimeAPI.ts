import { useCallback, useRef, useState } from 'react';
import { TranscriptionResult } from './types';

interface UseRealtimeAPIProps {
  onTranscription: (result: TranscriptionResult) => void;
  onError: (error: { errorCode: string; message: string }) => void;
}

export function useRealtimeAPI({ onTranscription, onError }: UseRealtimeAPIProps) {
  const [isConnected, setIsConnected] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const lastTranscriptRef = useRef<string>(''); // For deduplication

  const connect = useCallback(async () => {
    try {
      // Get ephemeral token from our API
      const tokenResponse = await fetch('/api/stt/openai-realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-token' }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        onError({
          errorCode: errorData.errorCode || 'TOKEN_FAILED',
          message: errorData.message || 'Failed to get session token',
        });
        return;
      }

      const { token } = await tokenResponse.json();

      // Create RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      // Add audio track to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Create data channel for receiving events
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.onopen = () => {
        console.log('WebRTC data channel opened');

        // Configure session
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: `You are a transcription assistant with speaker identification capabilities.

CRITICAL RULES:
- Transcribe all audio input into Japanese text
- When you detect different voices speaking, identify them by voice characteristics (pitch, tone, speaking style)
- Label different speakers as [話者1], [話者2], etc.
- Output format: [話者X] transcribed text
- If only one speaker is detected, still use [話者1] prefix
- Focus on accurate transcription with speaker attribution

Example output:
[話者1] こんにちは、今日の会議を始めましょう
[話者2] はい、よろしくお願いします`,
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1',
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
          },
        }));
      };

      dc.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('WebRTC message:', message.type);

          // Handle transcription results
          if (message.type === 'conversation.item.input_audio_transcription.completed') {
            const transcript = message.transcript?.trim();

            // Skip empty or duplicate transcripts
            if (!transcript || transcript === lastTranscriptRef.current) {
              return;
            }
            lastTranscriptRef.current = transcript;

            const result: TranscriptionResult = {
              provider: 'openai-realtime',
              text: transcript,
              timestamp: Date.now(),
              latency: 0, // WebRTC latency is near real-time
              isFinal: true,
            };
            onTranscription(result);
          }

          // Handle errors
          if (message.type === 'error') {
            onError({
              errorCode: message.error?.code || 'REALTIME_ERROR',
              message: message.error?.message || 'Unknown error occurred',
            });
          }
        } catch (e) {
          console.error('Failed to parse WebRTC message:', e);
        }
      };

      dc.onerror = (error) => {
        console.error('Data channel error:', error);
        onError({
          errorCode: 'DATA_CHANNEL_ERROR',
          message: 'WebRTC data channel error',
        });
      };

      // Handle incoming audio (optional, for voice responses)
      pc.ontrack = (event) => {
        console.log('Received audio track from OpenAI');
        // You could play this audio if needed for voice responses
      };

      // Create SDP offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          const checkState = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', checkState);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', checkState);
          // Timeout after 5 seconds
          setTimeout(resolve, 5000);
        }
      });

      // Send SDP offer to OpenAI and get answer
      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/sdp',
          },
          body: pc.localDescription?.sdp,
        }
      );

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        console.error('SDP exchange failed:', errorText);
        onError({
          errorCode: 'SDP_EXCHANGE_FAILED',
          message: `SDP exchange failed: ${sdpResponse.status}`,
        });
        return;
      }

      const answerSdp = await sdpResponse.text();

      // Set remote description
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      setIsConnected(true);
      console.log('WebRTC connection established');

    } catch (error) {
      console.error('Failed to connect via WebRTC:', error);
      onError({
        errorCode: 'CONNECTION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to connect',
      });
    }
  }, [onTranscription, onError]);

  const disconnect = useCallback(() => {
    // Close data channel
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }

    // Stop media tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Close peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    setIsConnected(false);
  }, []);

  return {
    connect,
    disconnect,
    isConnected,
  };
}
