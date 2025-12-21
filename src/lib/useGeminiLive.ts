'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface GeminiLiveOptions {
    apiKey: string;
    onTranscription: (text: string, timestamp: number, latency: number) => void;
    onError: (error: string) => void;
    onStatusChange: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
}

interface GeminiMessage {
    serverContent?: {
        modelTurn?: {
            parts?: Array<{
                text?: string;
            }>;
        };
        turnComplete?: boolean;
    };
    setupComplete?: boolean;
}

export function useGeminiLive({ apiKey, onTranscription, onError, onStatusChange }: GeminiLiveOptions) {
    const [isConnected, setIsConnected] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const startTimeRef = useRef<number>(0);
    const isStreamingRef = useRef<boolean>(false);

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

    // Connect to Gemini Live API
    const connect = useCallback(async () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        onStatusChange('connecting');

        try {
            // Gemini Live API WebSocket endpoint
            const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('Gemini Live WebSocket connected');

                // Send setup message
                const setupMessage = {
                    setup: {
                        model: 'models/gemini-2.0-flash-exp',
                        generationConfig: {
                            responseModalities: ['TEXT'],
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: {
                                        voiceName: 'Aoede'
                                    }
                                }
                            }
                        },
                        systemInstruction: {
                            parts: [{
                                text: 'You are a real-time transcription assistant. Your job is to transcribe the audio you hear accurately in Japanese. Output only the transcribed text, nothing else. If there are multiple speakers, label them as Speaker A, Speaker B, etc.'
                            }]
                        }
                    }
                };

                ws.send(JSON.stringify(setupMessage));
            };

            ws.onmessage = async (event) => {
                try {
                    // Handle both text and Blob data
                    let messageText: string;
                    if (event.data instanceof Blob) {
                        messageText = await event.data.text();
                    } else {
                        messageText = event.data;
                    }

                    const data: GeminiMessage = JSON.parse(messageText);

                    if (data.setupComplete) {
                        console.log('Gemini Live setup complete');
                        setIsConnected(true);
                        onStatusChange('connected');
                    }

                    if (data.serverContent?.modelTurn?.parts) {
                        const text = data.serverContent.modelTurn.parts
                            .filter(part => part.text)
                            .map(part => part.text)
                            .join('');

                        if (text) {
                            const latency = Date.now() - startTimeRef.current;
                            onTranscription(text, Date.now(), latency);
                        }
                    }
                } catch (e) {
                    console.error('Error parsing Gemini message:', e);
                }
            };

            ws.onerror = (error) => {
                console.error('Gemini Live WebSocket error:', error);
                onError('WebSocket connection error');
                onStatusChange('error');
            };

            ws.onclose = () => {
                console.log('Gemini Live WebSocket closed');
                setIsConnected(false);
                setIsStreaming(false);
                onStatusChange('disconnected');
            };

        } catch (error) {
            console.error('Failed to connect to Gemini Live:', error);
            onError(error instanceof Error ? error.message : 'Connection failed');
            onStatusChange('error');
        }
    }, [apiKey, onTranscription, onError, onStatusChange]);

    // Start streaming audio
    const startStreaming = useCallback(async () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            await connect();
            // Wait for connection to be established
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

            // Use ScriptProcessorNode for audio processing (deprecated but widely supported)
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                if (wsRef.current?.readyState === WebSocket.OPEN && isStreamingRef.current) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    const pcmData = floatTo16BitPCM(inputData);
                    const base64Audio = btoa(
                        String.fromCharCode(...new Uint8Array(pcmData))
                    );

                    // Send audio data to Gemini
                    const audioMessage = {
                        realtimeInput: {
                            mediaChunks: [{
                                mimeType: 'audio/pcm;rate=16000',
                                data: base64Audio
                            }]
                        }
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

        isStreamingRef.current = false;
        setIsStreaming(false);
    }, []);

    // Disconnect from Gemini Live
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
        stopStreaming,
        disconnect,
    };
}
