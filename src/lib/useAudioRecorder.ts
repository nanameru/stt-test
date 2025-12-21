'use client';

import { useState, useRef, useCallback } from 'react';

interface UseAudioRecorderOptions {
  onAudioChunk: (blob: Blob, timestamp: number) => void;
  chunkInterval?: number;
}

export function useAudioRecorder({ onAudioChunk, chunkInterval = 2000 }: UseAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);

  const createAndStartRecorder = useCallback((stream: MediaStream) => {
    const chunks: Blob[] = [];

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      if (chunks.length > 0 && isRecordingRef.current) {
        // Create a complete WebM blob from this recording segment
        const completeBlob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
        onAudioChunk(completeBlob, Date.now());

        // Start a new recorder for the next segment
        if (streamRef.current && isRecordingRef.current) {
          const newRecorder = createAndStartRecorder(streamRef.current);
          mediaRecorderRef.current = newRecorder;
        }
      }
    };

    mediaRecorder.start();

    // Stop this recorder after the chunk interval to trigger onstop
    setTimeout(() => {
      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    }, chunkInterval);

    return mediaRecorder;
  }, [onAudioChunk, chunkInterval]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      isRecordingRef.current = true;

      // Create and start the first recorder
      mediaRecorderRef.current = createAndStartRecorder(stream);

      setIsRecording(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start recording';
      setError(message);
      console.error('Error starting recording:', err);
    }
  }, [createAndStartRecorder]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, []);

  return {
    isRecording,
    error,
    startRecording,
    stopRecording,
  };
}
