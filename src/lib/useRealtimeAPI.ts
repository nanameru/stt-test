import { useCallback, useRef, useState } from 'react';
import { TranscriptionResult } from './types';

interface UseRealtimeAPIProps {
  onTranscription: (result: TranscriptionResult) => void;
  onError: (error: { errorCode: string; message: string }) => void;
}

export function useRealtimeAPI({ onTranscription, onError }: UseRealtimeAPIProps) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

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

      // Connect to OpenAI Realtime API WebSocket
      // Using ephemeral token authentication protocol for browser-safe connections
      // Docs: https://platform.openai.com/docs/guides/realtime-websocket
      const ws = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`,
        [`openai-insecure-api-key.${token}`, 'realtime=v1']
      );

      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Realtime API connected');
        setIsConnected(true);

        // Configure session
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: 'You are a transcription assistant. Transcribe all audio input into text in Japanese.',
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

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('Realtime API message:', message.type);

        // Handle transcription results
        if (message.type === 'conversation.item.input_audio_transcription.completed') {
          const result: TranscriptionResult = {
            provider: 'openai-realtime',
            text: message.transcript,
            timestamp: Date.now(),
            latency: 0, // WebSocket latency is near real-time
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
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        onError({
          errorCode: 'WEBSOCKET_ERROR',
          message: 'WebSocket connection error',
        });
      };

      ws.onclose = () => {
        console.log('Realtime API disconnected');
        setIsConnected(false);
        cleanup();
      };

      // Start audio capture
      await startAudioCapture();
    } catch (error) {
      console.error('Failed to connect to Realtime API:', error);
      onError({
        errorCode: 'CONNECTION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to connect',
      });
    }
  }, [onTranscription, onError]);

  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      mediaStreamRef.current = stream;

      // Create audio context
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);

        // Convert Float32Array to Int16Array (PCM16)
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Send audio to Realtime API
        const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
        wsRef.current.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64Audio,
        }));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      onError({
        errorCode: 'AUDIO_CAPTURE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to capture audio',
      });
    }
  };

  const disconnect = useCallback(() => {
    cleanup();
  }, []);

  const cleanup = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
  };

  return {
    connect,
    disconnect,
    isConnected,
  };
}
