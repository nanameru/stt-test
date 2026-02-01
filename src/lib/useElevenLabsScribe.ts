'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface ElevenLabsScribeOptions {
    apiKey: string;
    onTranscription: (text: string, timestamp: number, latency: number) => void;
    onPartialTranscription?: (text: string) => void;
    onError: (error: string) => void;
    onStatusChange: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
}

interface ScribeMessage {
    message_type?: string;
    type?: string;
    text?: string;
    speaker_id?: string;
    start?: number;
    end?: number;
    session_id?: string;
    config?: Record<string, unknown>;
    error?: {
        code?: string;
        message?: string;
    };
}

export function useElevenLabsScribe({
    apiKey,
    onTranscription,
    onPartialTranscription,
    onError,
    onStatusChange
}: ElevenLabsScribeOptions) {
    const [isConnected, setIsConnected] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const startTimeRef = useRef<number>(0);
    const isStreamingRef = useRef<boolean>(false);
    const currentPartialTextRef = useRef<string>('');
    const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Convert Float32 audio samples to 16-bit PCM
    const floatTo16BitPCM = useCallback((float32Array: Float32Array): ArrayBuffer => {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        return buffer;
    }, []);

    // Connect to ElevenLabs Scribe v2 Realtime API
    const connect = useCallback(async () => {
        console.log('[ElevenLabs DEBUG] connect() called');

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.log('[ElevenLabs DEBUG] WebSocket already open, returning');
            return;
        }

        if (!apiKey) {
            console.log('[ElevenLabs DEBUG] No API key, returning error');
            onError('ElevenLabs API key is not configured');
            onStatusChange('error');
            return;
        }

        console.log('[ElevenLabs DEBUG] API key found, starting connection...');
        onStatusChange('connecting');

        try {
            // ElevenLabs Scribe v2 Realtime WebSocket endpoint
            // Based on deep research: 
            // - Endpoint is /v1/speech-to-text (no /realtime)
            // - Use 'token' parameter (not 'single_use_token') for auth
            // - Add inactivity_timeout=180 to extend connection lifetime
            const isToken = apiKey.startsWith('sutkn_');
            const authParam = isToken
                ? `token=${encodeURIComponent(apiKey)}`
                : `xi-api-key=${encodeURIComponent(apiKey)}`;

            // Corrected URL based on latest research
            // Endpoint is: /v1/speech-to-text/realtime (with /realtime!)
            // Added commit_strategy=vad for automatic voice activity detection
            const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&language_code=ja&audio_format=pcm_16000&commit_strategy=vad&inactivity_timeout=180&${authParam}`;

            console.log('[ElevenLabs DEBUG] Connecting to:', wsUrl.replace(apiKey, 'API_KEY_HIDDEN'));
            console.log('[ElevenLabs DEBUG] Using auth type:', isToken ? 'token' : 'api_key');

            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('[ElevenLabs DEBUG] WebSocket connected successfully');
                setIsConnected(true);
                onStatusChange('connected');

                // Create silence buffer once for reuse
                const silenceBuffer = new ArrayBuffer(3200); // 100ms of silence at 16kHz
                const silenceView = new DataView(silenceBuffer);
                for (let i = 0; i < 1600; i++) {
                    silenceView.setInt16(i * 2, 0, true);
                }

                // Helper function to send silence
                const sendSilence = () => {
                    if (ws.readyState === WebSocket.OPEN) {
                        const base64Audio = btoa(
                            String.fromCharCode(...new Uint8Array(silenceBuffer))
                        );
                        ws.send(JSON.stringify({
                            audio_base_64: base64Audio
                        }));
                        console.log('[ElevenLabs DEBUG] Sent keep-alive silence chunk');
                    }
                };

                // Send initial silence immediately
                sendSilence();

                // Start keep-alive interval (every 15 seconds)
                // This prevents the connection from timing out
                if (keepAliveIntervalRef.current) {
                    clearInterval(keepAliveIntervalRef.current);
                }
                keepAliveIntervalRef.current = setInterval(sendSilence, 15000);
                console.log('[ElevenLabs DEBUG] Started keep-alive interval (15s)');
            };

            ws.onmessage = async (event) => {
                try {
                    let messageText: string;
                    if (event.data instanceof Blob) {
                        messageText = await event.data.text();
                    } else {
                        messageText = event.data;
                    }

                    const data: ScribeMessage = JSON.parse(messageText);

                    // Determine message type (could be 'message_type' or 'type')
                    const msgType = data.message_type || data.type;
                    console.log('[ElevenLabs DEBUG] Received message:', msgType, data);

                    // Handle different message types based on Scribe v2 API
                    if (msgType === 'session_started') {
                        // Session started confirmation
                        console.log('[ElevenLabs DEBUG] Session started:', data.session_id);
                    } else if (msgType === 'partial_transcript') {
                        // Partial transcript - interim results
                        const text = data.text || '';
                        if (text) {
                            currentPartialTextRef.current = text;
                            if (onPartialTranscription) {
                                onPartialTranscription(text);
                            }
                        }
                    } else if (msgType === 'committed_transcript' || msgType === 'committed_transcript_with_timestamps') {
                        // Committed transcript - final results
                        const text = data.text || currentPartialTextRef.current;
                        if (text) {
                            const latency = Date.now() - startTimeRef.current;
                            onTranscription(text.trim(), Date.now(), latency);
                            currentPartialTextRef.current = '';
                            startTimeRef.current = Date.now();

                            // Clear partial display
                            if (onPartialTranscription) {
                                onPartialTranscription('');
                            }
                        }
                    } else if (msgType === 'transcript' || msgType === 'transcript_final' || msgType === 'final') {
                        // Legacy/fallback message types
                        const text = data.text || '';
                        if (msgType === 'transcript') {
                            currentPartialTextRef.current = text;
                            if (onPartialTranscription && text) {
                                onPartialTranscription(text);
                            }
                        } else {
                            const finalText = text || currentPartialTextRef.current;
                            if (finalText) {
                                const latency = Date.now() - startTimeRef.current;
                                onTranscription(finalText.trim(), Date.now(), latency);
                                currentPartialTextRef.current = '';
                                startTimeRef.current = Date.now();
                                if (onPartialTranscription) {
                                    onPartialTranscription('');
                                }
                            }
                        }
                    } else if (msgType && msgType.includes('error')) {
                        console.error('[ElevenLabs DEBUG] Scribe error:', msgType, data);
                        onError(data.error?.message || data.text || 'Unknown error from ElevenLabs');
                    }
                } catch (e) {
                    console.error('Error parsing ElevenLabs message:', e);
                }
            };

            ws.onerror = (error) => {
                console.error('ElevenLabs Scribe WebSocket error:', error);
                onError('WebSocket connection error');
                onStatusChange('error');
            };

            ws.onclose = (event) => {
                console.log('ElevenLabs Scribe WebSocket closed:', event.code, event.reason);
                setIsConnected(false);
                setIsStreaming(false);
                onStatusChange('disconnected');
            };

        } catch (error) {
            console.error('Failed to connect to ElevenLabs Scribe:', error);
            onError(error instanceof Error ? error.message : 'Connection failed');
            onStatusChange('error');
        }
    }, [apiKey, onTranscription, onPartialTranscription, onError, onStatusChange]);

    // Start streaming audio
    const startStreaming = useCallback(async () => {
        console.log('[ElevenLabs DEBUG] startStreaming called');
        console.log('[ElevenLabs DEBUG] apiKey exists:', !!apiKey);
        console.log('[ElevenLabs DEBUG] wsRef.current exists:', !!wsRef.current);
        console.log('[ElevenLabs DEBUG] wsRef.current.readyState:', wsRef.current?.readyState, '(OPEN=1, CLOSED=3)');

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.log('[ElevenLabs DEBUG] WebSocket not open, calling connect()...');
            await connect();
            console.log('[ElevenLabs DEBUG] connect() returned, waiting 1 second...');
            // Wait for connection
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('[ElevenLabs DEBUG] 1 second wait completed');
            console.log('[ElevenLabs DEBUG] wsRef.current exists after wait:', !!wsRef.current);
            console.log('[ElevenLabs DEBUG] wsRef.current.readyState after wait:', wsRef.current?.readyState);
        }

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.log('[ElevenLabs DEBUG] WebSocket STILL not connected after wait, returning error');
            onError('WebSocket not connected');
            return;
        }

        try {
            // Get microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });
            streamRef.current = stream;

            // Create audio context for processing
            const audioContext = new AudioContext({ sampleRate: 16000 });
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);

            // Use ScriptProcessorNode for audio processing
            // Buffer size 2048 = 128ms at 16kHz (recommended: 100ms-1s)
            const processor = audioContext.createScriptProcessor(2048, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                if (wsRef.current?.readyState === WebSocket.OPEN && isStreamingRef.current) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    const pcmData = floatTo16BitPCM(inputData);
                    const base64Audio = btoa(
                        String.fromCharCode(...new Uint8Array(pcmData))
                    );

                    // Send audio data to ElevenLabs with correct format
                    const audioMessage = {
                        audio_base_64: base64Audio,
                    };

                    wsRef.current.send(JSON.stringify(audioMessage));
                }
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

            startTimeRef.current = Date.now();
            isStreamingRef.current = true;
            setIsStreaming(true);

        } catch (error) {
            console.error('Failed to start audio streaming:', error);
            onError(error instanceof Error ? error.message : 'Failed to start streaming');
        }
    }, [connect, floatTo16BitPCM, onError]);

    // Stop streaming audio
    const stopStreaming = useCallback(() => {
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        // Send end of stream message
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            try {
                wsRef.current.send(JSON.stringify({ type: 'end_of_stream' }));
            } catch (e) {
                console.error('Error sending end of stream:', e);
            }
        }

        isStreamingRef.current = false;
        setIsStreaming(false);
        currentPartialTextRef.current = '';
    }, []);

    // Send external audio chunk (for file input mode)
    const sendAudioChunk = useCallback((pcmData: ArrayBuffer) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            try {
                const base64Audio = btoa(
                    String.fromCharCode(...new Uint8Array(pcmData))
                );

                // ElevenLabs expects audio_base_64 key
                const audioMessage = {
                    audio_base_64: base64Audio,
                };

                wsRef.current.send(JSON.stringify(audioMessage));
            } catch (e) {
                console.error('Error sending audio chunk:', e);
            }
        }
    }, []);

    // Start streaming without microphone (for file input mode)
    const startStreamingWithoutMic = useCallback(async () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            await connect();
            // Wait a bit for connection to establish
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            onError('WebSocket not connected');
            return;
        }

        // Send initial silence to keep connection alive
        // ElevenLabs closes connections after ~20s of inactivity
        const silenceBuffer = new ArrayBuffer(1600); // 50ms of silence at 16kHz
        const silenceView = new DataView(silenceBuffer);
        for (let i = 0; i < 800; i++) {
            silenceView.setInt16(i * 2, 0, true);
        }

        // Send initial silence chunk
        try {
            const base64Audio = btoa(
                String.fromCharCode(...new Uint8Array(silenceBuffer))
            );
            wsRef.current.send(JSON.stringify({
                audio_base_64: base64Audio
            }));
            console.log('Sent initial silence chunk to keep connection alive');
        } catch (e) {
            console.error('Failed to send initial silence:', e);
        }

        startTimeRef.current = Date.now();
        isStreamingRef.current = true;
        setIsStreaming(true);
    }, [connect, onError]);

    // Disconnect from ElevenLabs
    const disconnect = useCallback(() => {
        // Clear keep-alive interval
        if (keepAliveIntervalRef.current) {
            clearInterval(keepAliveIntervalRef.current);
            keepAliveIntervalRef.current = null;
            console.log('[ElevenLabs DEBUG] Cleared keep-alive interval');
        }

        stopStreaming();

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        setIsConnected(false);
    }, [stopStreaming]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    return {
        isConnected,
        isStreaming,
        connect,
        startStreaming,
        startStreamingWithoutMic,
        stopStreaming,
        sendAudioChunk,
        disconnect,
    };
}
