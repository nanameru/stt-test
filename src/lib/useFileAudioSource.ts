'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseFileAudioSourceOptions {
    onAudioChunk: (pcmData: ArrayBuffer) => void;
    onPlaybackEnd: () => void;
    onError: (error: string) => void;
    targetSampleRate?: number;
}

interface UseFileAudioSourceReturn {
    loadFile: (file: File) => Promise<void>;
    startPlayback: () => void;
    stopPlayback: () => void;
    pausePlayback: () => void;
    isPlaying: boolean;
    isLoaded: boolean;
    duration: number;
    currentTime: number;
    fileName: string | null;
    seekTo: (time: number) => void;
}

export function useFileAudioSource({
    onAudioChunk,
    onPlaybackEnd,
    onError,
    targetSampleRate = 16000,
}: UseFileAudioSourceOptions): UseFileAudioSourceReturn {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [fileName, setFileName] = useState<string | null>(null);

    const mediaElementRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Resample audio from source sample rate to target sample rate
    const resample = useCallback((
        inputData: Float32Array,
        inputSampleRate: number,
        outputSampleRate: number
    ): Float32Array => {
        if (inputSampleRate === outputSampleRate) {
            return inputData;
        }

        const ratio = inputSampleRate / outputSampleRate;
        const outputLength = Math.floor(inputData.length / ratio);
        const output = new Float32Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * ratio;
            const low = Math.floor(srcIndex);
            const high = Math.min(low + 1, inputData.length - 1);
            const t = srcIndex - low;
            output[i] = inputData[low] * (1 - t) + inputData[high] * t;
        }

        return output;
    }, []);

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

    // Load a file into the audio/video element
    const loadFile = useCallback(async (file: File): Promise<void> => {
        try {
            // Clean up previous resources
            if (mediaElementRef.current) {
                mediaElementRef.current.pause();
                URL.revokeObjectURL(mediaElementRef.current.src);
            }

            // Determine if it's video or audio
            const isVideo = file.type.startsWith('video/');

            // Create appropriate element
            const element = isVideo
                ? document.createElement('video')
                : document.createElement('audio');

            element.muted = true; // Mute to prevent audio output
            element.crossOrigin = 'anonymous';

            // Create object URL for the file
            const objectUrl = URL.createObjectURL(file);
            element.src = objectUrl;

            // Wait for metadata to load
            await new Promise<void>((resolve, reject) => {
                element.onloadedmetadata = () => {
                    setDuration(element.duration);
                    setCurrentTime(0);
                    setFileName(file.name);
                    setIsLoaded(true);
                    resolve();
                };
                element.onerror = () => {
                    reject(new Error('Failed to load media file'));
                };
            });

            mediaElementRef.current = element;

        } catch (error) {
            console.error('Failed to load file:', error);
            onError(error instanceof Error ? error.message : 'Failed to load file');
            throw error;
        }
    }, [onError]);

    // Start playback and audio processing
    const startPlayback = useCallback(() => {
        const element = mediaElementRef.current;
        if (!element) {
            onError('No file loaded');
            return;
        }

        try {
            // Clean up previous audio processing (but keep the source node if already connected)
            if (timeUpdateIntervalRef.current) {
                clearInterval(timeUpdateIntervalRef.current);
                timeUpdateIntervalRef.current = null;
            }

            if (processorRef.current) {
                processorRef.current.disconnect();
                processorRef.current = null;
            }

            // Reuse existing AudioContext if available, or create a new one
            let audioContext = audioContextRef.current;
            if (!audioContext || audioContext.state === 'closed') {
                audioContext = new AudioContext();
                audioContextRef.current = audioContext;
            }

            // Reuse existing source node if available (can't create multiple sources for same element)
            let sourceNode = sourceNodeRef.current;
            if (!sourceNode) {
                sourceNode = audioContext.createMediaElementSource(element);
                sourceNodeRef.current = sourceNode;
            }

            // Create ScriptProcessor for audio chunk processing
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);

                // Resample to target sample rate
                const resampledData = resample(
                    inputData,
                    audioContext!.sampleRate,
                    targetSampleRate
                );

                // Convert to 16-bit PCM
                const pcmData = floatTo16BitPCM(resampledData);

                // Send chunk
                onAudioChunk(pcmData);
            };

            // Connect: source -> processor -> destination (for processing)
            sourceNode.connect(processor);
            processor.connect(audioContext.destination);

            // Handle playback end
            element.onended = () => {
                setIsPlaying(false);
                onPlaybackEnd();
            };

            // Start time update interval
            timeUpdateIntervalRef.current = setInterval(() => {
                if (element && !element.paused) {
                    setCurrentTime(element.currentTime);
                }
            }, 100);

            // Start playback
            element.muted = false; // Unmute for Web Audio API to work
            // Note: Audio won't be heard since we're processing through ScriptProcessor
            element.play();
            setIsPlaying(true);

        } catch (error) {
            console.error('Failed to start playback:', error);
            onError(error instanceof Error ? error.message : 'Failed to start playback');
        }
    }, [resample, floatTo16BitPCM, onAudioChunk, onPlaybackEnd, onError, targetSampleRate]);

    // Stop playback
    const stopPlayback = useCallback(() => {
        if (timeUpdateIntervalRef.current) {
            clearInterval(timeUpdateIntervalRef.current);
            timeUpdateIntervalRef.current = null;
        }

        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }

        if (sourceNodeRef.current) {
            sourceNodeRef.current.disconnect();
            sourceNodeRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        if (mediaElementRef.current) {
            mediaElementRef.current.pause();
            mediaElementRef.current.currentTime = 0;
        }

        setIsPlaying(false);
        setCurrentTime(0);
    }, []);

    // Pause playback
    const pausePlayback = useCallback(() => {
        if (mediaElementRef.current) {
            mediaElementRef.current.pause();
            setIsPlaying(false);
        }
    }, []);

    // Seek to specific time
    const seekTo = useCallback((time: number) => {
        if (mediaElementRef.current) {
            mediaElementRef.current.currentTime = time;
            setCurrentTime(time);
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopPlayback();
            if (mediaElementRef.current) {
                URL.revokeObjectURL(mediaElementRef.current.src);
            }
        };
    }, [stopPlayback]);

    return {
        loadFile,
        startPlayback,
        stopPlayback,
        pausePlayback,
        isPlaying,
        isLoaded,
        duration,
        currentTime,
        fileName,
        seekTo,
    };
}
