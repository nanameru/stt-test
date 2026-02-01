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
    type?: string;
    text?: string;
    speaker_id?: string;
    start?: number;
    end?: number;
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
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        if (!apiKey) {
            onError('ElevenLabs API key is not configured');
            onStatusChange('error');
            return;
        }

        onStatusChange('connecting');

        try {
            // ElevenLabs Scribe v2 Realtime WebSocket endpoint
            const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&language_code=ja`;

            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('ElevenLabs Scribe WebSocket connected');

                // Send authentication and configuration
                const authMessage = {
                    type: 'authenticate',
                    api_key: apiKey,
                };
                ws.send(JSON.stringify(authMessage));

                // Send configuration
                const configMessage = {
                    type: 'configure',
                    audio_format: 'pcm_16000',
                    sample_rate: 16000,
                    encoding: 'pcm_s16le',
                    language_code: 'ja',
                    endpointing: 300,
                };
                ws.send(JSON.stringify(configMessage));

                setIsConnected(true);
                onStatusChange('connected');
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

                    // Handle different message types
                    if (data.type === 'transcript') {
                        // Partial transcript
                        const text = data.text || '';
                        if (text) {
                            currentPartialTextRef.current = text;
                            if (onPartialTranscription) {
                                onPartialTranscription(text);
                            }
                        }
                    } else if (data.type === 'transcript_final' || data.type === 'final') {
                        // Final transcript
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
                    } else if (data.type === 'error') {
                        console.error('ElevenLabs Scribe error:', data.error);
                        onError(data.error?.message || 'Unknown error from ElevenLabs');
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
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            await connect();
            // Wait for connection
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
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
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                if (wsRef.current?.readyState === WebSocket.OPEN && isStreamingRef.current) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    const pcmData = floatTo16BitPCM(inputData);
                    const base64Audio = btoa(
                        String.fromCharCode(...new Uint8Array(pcmData))
                    );

                    // Send audio data to ElevenLabs
                    const audioMessage = {
                        type: 'audio',
                        audio: base64Audio,
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

                const audioMessage = {
                    type: 'audio',
                    audio: base64Audio,
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
            // Wait for connection
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            onError('WebSocket not connected');
            return;
        }

        startTimeRef.current = Date.now();
        isStreamingRef.current = true;
        setIsStreaming(true);
    }, [connect, onError]);

    // Disconnect from ElevenLabs
    const disconnect = useCallback(() => {
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
