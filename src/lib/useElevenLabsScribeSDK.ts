'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
    Scribe,
    AudioFormat,
    CommitStrategy,
    RealtimeEvents,
    type RealtimeConnection,
    type PartialTranscriptMessage,
    type CommittedTranscriptMessage,
    type ScribeErrorMessage,
    type ScribeAuthErrorMessage
} from '@elevenlabs/client';


interface ElevenLabsScribeOptions {
    apiKey: string;
    onTranscription: (text: string, timestamp: number, latency: number) => void;
    onPartialTranscription?: (text: string) => void;
    onError: (error: string) => void;
    onStatusChange: (status: 'idle' | 'connecting' | 'connected' | 'transcribing' | 'error') => void;
}

/**
 * Simple ElevenLabs Scribe v2 Realtime hook using official SDK
 * Based on @elevenlabs/client package
 */
export function useElevenLabsScribe({
    apiKey,
    onTranscription,
    onPartialTranscription,
    onError,
    onStatusChange
}: ElevenLabsScribeOptions) {
    const [isConnected, setIsConnected] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const connectionRef = useRef<RealtimeConnection | null>(null);
    const startTimeRef = useRef<number>(0);

    // Start streaming with microphone (automatic via SDK)
    const startStreaming = useCallback(async () => {
        if (!apiKey) {
            onError('ElevenLabs API key is not configured');
            onStatusChange('error');
            return;
        }

        console.log('[ElevenLabs SDK] Starting microphone streaming...');
        console.log('[ElevenLabs SDK] API Key type:', apiKey.startsWith('sutkn_') ? 'single-use token' : 'API key');
        console.log('[ElevenLabs SDK] API Key prefix:', apiKey.substring(0, 10) + '...');
        onStatusChange('connecting');

        try {
            // Check microphone permission first
            console.log('[ElevenLabs SDK] Checking microphone permission...');
            const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            console.log('[ElevenLabs SDK] Microphone permission:', permissionStatus.state);

            if (permissionStatus.state === 'denied') {
                onError('Microphone permission denied');
                onStatusChange('error');
                return;
            }

            // Test microphone access before SDK
            console.log('[ElevenLabs SDK] Testing microphone access...');
            try {
                const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                console.log('[ElevenLabs SDK] Microphone access OK, tracks:', testStream.getAudioTracks().length);
                testStream.getTracks().forEach(track => track.stop());
            } catch (micError) {
                console.error('[ElevenLabs SDK] Microphone access failed:', micError);
                onError('Microphone access failed: ' + (micError instanceof Error ? micError.message : 'Unknown error'));
                onStatusChange('error');
                return;
            }

            console.log('[ElevenLabs SDK] Creating Scribe connection...');

            // Use official SDK with automatic microphone streaming
            const connection = Scribe.connect({
                token: apiKey,
                modelId: 'scribe_v2_realtime',
                languageCode: 'ja',
                commitStrategy: CommitStrategy.VAD, // Automatic voice activity detection
                microphone: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1
                }
            });

            console.log('[ElevenLabs SDK] Connection object created');
            connectionRef.current = connection;
            startTimeRef.current = Date.now();

            // Event handlers
            connection.on(RealtimeEvents.OPEN, () => {
                console.log('[ElevenLabs SDK] WebSocket OPEN event received');
                setIsConnected(true);
                onStatusChange('connected');
            });

            connection.on(RealtimeEvents.SESSION_STARTED, (data) => {
                console.log('[ElevenLabs SDK] Session started:', data);
                setIsStreaming(true);
                onStatusChange('transcribing');
            });

            connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (data) => {
                console.log('[ElevenLabs SDK] Partial transcript:', data.transcript);
                if (onPartialTranscription && data.transcript) {
                    onPartialTranscription(data.transcript);
                }
            });

            connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
                console.log('[ElevenLabs SDK] Committed transcript:', data.transcript);
                const now = Date.now();
                const latency = now - startTimeRef.current;
                if (data.transcript) {
                    onTranscription(data.transcript, now, latency);
                }
                // Reset start time for next segment
                startTimeRef.current = Date.now();
            });

            connection.on(RealtimeEvents.ERROR, (data) => {
                console.error('[ElevenLabs SDK] Error:', data);
                onError(data.message || 'Unknown error occurred');
                onStatusChange('error');
            });

            connection.on(RealtimeEvents.AUTH_ERROR, (data) => {
                console.error('[ElevenLabs SDK] Auth error:', data);
                onError('Authentication failed: ' + (data.message || 'Invalid token'));
                onStatusChange('error');
            });

            connection.on(RealtimeEvents.CLOSE, (event) => {
                console.log('[ElevenLabs SDK] Connection closed');
                console.log('[ElevenLabs SDK] Close event details:', {
                    code: event?.code,
                    reason: event?.reason,
                    wasClean: event?.wasClean
                });
                setIsConnected(false);
                setIsStreaming(false);
                onStatusChange('idle');
            });

        } catch (error) {
            console.error('[ElevenLabs SDK] Failed to start streaming:', error);
            onError(error instanceof Error ? error.message : 'Failed to start streaming');
            onStatusChange('error');
        }
    }, [apiKey, onTranscription, onPartialTranscription, onError, onStatusChange]);

    // Stop streaming
    const stopStreaming = useCallback(() => {
        if (connectionRef.current) {
            console.log('[ElevenLabs SDK] Stopping streaming...');
            connectionRef.current.close();
            connectionRef.current = null;
        }
        setIsConnected(false);
        setIsStreaming(false);
        onStatusChange('idle');
    }, [onStatusChange]);

    // Disconnect (alias for stopStreaming)
    const disconnect = useCallback(() => {
        stopStreaming();
    }, [stopStreaming]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (connectionRef.current) {
                connectionRef.current.close();
            }
        };
    }, []);

    return {
        isConnected,
        isStreaming,
        startStreaming,
        stopStreaming,
        disconnect,
        // Legacy compatibility - these are no-ops with SDK
        connect: startStreaming,
        startStreamingWithoutMic: startStreaming,
        sendAudioChunk: () => { }, // SDK handles this automatically
    };
}
