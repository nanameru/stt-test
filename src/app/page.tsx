'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAudioRecorder } from '@/lib/useAudioRecorder';
import { useRealtimeAPI } from '@/lib/useRealtimeAPI';
import { useGeminiLive } from '@/lib/useGeminiLive';
import { TranscriptionPanel } from '@/components/TranscriptionPanel';
import { RecordingControls } from '@/components/RecordingControls';
import { EvaluationTable } from '@/components/EvaluationTable';
import { TranscriptionResult, STTProvider, STTConfig, EvaluationResult } from '@/lib/types';

interface ProviderStatus {
  provider: string;
  configured: boolean;
  envVar: string;
}

interface HealthResponse {
  status: string;
  message: string;
  providers: ProviderStatus[];
}

interface ProviderError {
  provider: STTProvider;
  errorCode: string;
  message: string;
}

const defaultConfigs: STTConfig[] = [
  { provider: 'openai-realtime', enabled: true },
  { provider: 'gemini-live', enabled: true },
  { provider: 'gpt-4o-transcribe-diarize', enabled: true },
  { provider: 'faster-whisper-large-v3', enabled: true },
  { provider: 'whisper-large-v3-turbo', enabled: true },
];

const apiEndpoints: Record<STTProvider, string> = {
  'openai-realtime': '/api/stt/openai-realtime',
  'gemini-live': '/api/stt/gemini-live',
  'gpt-4o-transcribe-diarize': '/api/stt/gpt-4o-transcribe-diarize',
  'faster-whisper-large-v3': '/api/stt/faster-whisper-large-v3',
  'whisper-large-v3-turbo': '/api/stt/whisper-large-v3-turbo',
};

export default function Home() {
  const [configs, setConfigs] = useState<STTConfig[]>(defaultConfigs);
  const [results, setResults] = useState<Record<STTProvider, TranscriptionResult[]>>({
    'openai-realtime': [],
    'gemini-live': [],
    'gpt-4o-transcribe-diarize': [],
    'faster-whisper-large-v3': [],
    'whisper-large-v3-turbo': [],
  });
  const [evaluationResults, setEvaluationResults] = useState<EvaluationResult[]>([]);
  const [activeProviders, setActiveProviders] = useState<Set<STTProvider>>(new Set());
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [providerErrors, setProviderErrors] = useState<Record<STTProvider, ProviderError | null>>({
    'openai-realtime': null,
    'gemini-live': null,
    'gpt-4o-transcribe-diarize': null,
    'faster-whisper-large-v3': null,
    'whisper-large-v3-turbo': null,
  });
  const [healthLoading, setHealthLoading] = useState(true);
  const [geminiApiKey, setGeminiApiKey] = useState<string | null>(null);

  // Initialize Realtime API WebSocket hook
  const realtimeAPI = useRealtimeAPI({
    onTranscription: useCallback((result: TranscriptionResult) => {
      setResults((prev) => ({
        ...prev,
        'openai-realtime': [...prev['openai-realtime'], result],
      }));
    }, []),
    onError: useCallback((error) => {
      setProviderErrors((prev) => ({
        ...prev,
        'openai-realtime': {
          provider: 'openai-realtime',
          errorCode: error.errorCode,
          message: error.message,
        },
      }));
    }, []),
  });

  // Initialize Gemini Live WebSocket hook
  const geminiLive = useGeminiLive({
    apiKey: geminiApiKey || '',
    onTranscription: useCallback((text: string, timestamp: number, latency: number) => {
      const result: TranscriptionResult = {
        provider: 'gemini-live',
        text,
        timestamp,
        latency,
        isFinal: true,
      };
      setResults((prev) => ({
        ...prev,
        'gemini-live': [...prev['gemini-live'], result],
      }));
    }, []),
    onError: useCallback((error: string) => {
      setProviderErrors((prev) => ({
        ...prev,
        'gemini-live': {
          provider: 'gemini-live',
          errorCode: 'WEBSOCKET_ERROR',
          message: error,
        },
      }));
    }, []),
    onStatusChange: useCallback((status: 'connecting' | 'connected' | 'disconnected' | 'error') => {
      if (status === 'connected') {
        setActiveProviders((prev) => new Set([...prev, 'gemini-live']));
      } else if (status === 'disconnected' || status === 'error') {
        setActiveProviders((prev) => {
          const next = new Set(prev);
          next.delete('gemini-live');
          return next;
        });
      }
    }, []),
  });

  useEffect(() => {
    async function checkHealth() {
      try {
        const response = await fetch('/api/health');
        const data: HealthResponse = await response.json();
        setProviderStatuses(data.providers);
      } catch (error) {
        console.error('Failed to check health:', error);
      } finally {
        setHealthLoading(false);
      }
    }
    checkHealth();
  }, []);

  // Fetch Gemini API key on mount
  useEffect(() => {
    async function fetchGeminiApiKey() {
      try {
        const response = await fetch('/api/stt/gemini-live');
        const data = await response.json();
        if (data.apiKey) {
          setGeminiApiKey(data.apiKey);
        }
      } catch (error) {
        console.error('Failed to fetch Gemini API key:', error);
      }
    }
    fetchGeminiApiKey();
  }, []);

  const processAudioChunk = useCallback(async (blob: Blob) => {
    // Filter out openai-realtime and gemini-live as they use WebSocket, not HTTP chunks
    const enabledProviders = configs
      .filter((c) => c.enabled && c.provider !== 'openai-realtime' && c.provider !== 'gemini-live')
      .map((c) => c.provider);

    const promises = enabledProviders.map(async (provider) => {
      setActiveProviders((prev) => new Set([...prev, provider]));

      try {
        const formData = new FormData();
        formData.append('audio', blob, 'audio.webm');

        const response = await fetch(apiEndpoints[provider], {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          setProviderErrors((prev) => ({
            ...prev,
            [provider]: {
              provider,
              errorCode: data.errorCode || 'UNKNOWN_ERROR',
              message: data.message || `HTTP error! status: ${response.status}`,
            },
          }));
          return;
        }

        setProviderErrors((prev) => ({
          ...prev,
          [provider]: null,
        }));

        const result: TranscriptionResult = data;

        if (result.text && result.text.trim()) {
          setResults((prev) => ({
            ...prev,
            [provider]: [...prev[provider], result],
          }));
        }
      } catch (error) {
        console.error(`Error with ${provider}:`, error);
        setProviderErrors((prev) => ({
          ...prev,
          [provider]: {
            provider,
            errorCode: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Network error occurred',
          },
        }));
      } finally {
        setActiveProviders((prev) => {
          const next = new Set(prev);
          next.delete(provider);
          return next;
        });
      }
    });

    await Promise.all(promises);
  }, [configs]);

  const { isRecording, error, startRecording: startAudioRecorder, stopRecording: stopAudioRecorder } = useAudioRecorder({
    onAudioChunk: processAudioChunk,
    chunkInterval: 2000,
  });

  // Custom handlers to manage both audio recorder and WebSocket APIs
  const handleStartRecording = useCallback(async () => {
    // Start OpenAI Realtime API if enabled
    const realtimeConfig = configs.find(c => c.provider === 'openai-realtime');
    if (realtimeConfig?.enabled) {
      await realtimeAPI.connect();
      setActiveProviders((prev) => new Set([...prev, 'openai-realtime']));
    }

    // Start Gemini Live API if enabled
    const geminiConfig = configs.find(c => c.provider === 'gemini-live');
    if (geminiConfig?.enabled && geminiApiKey) {
      await geminiLive.startStreaming();
    }

    // Start audio recorder for other providers
    startAudioRecorder();
  }, [configs, realtimeAPI, geminiLive, geminiApiKey, startAudioRecorder]);

  const handleStopRecording = useCallback(() => {
    // Stop Realtime API
    realtimeAPI.disconnect();
    setActiveProviders((prev) => {
      const next = new Set(prev);
      next.delete('openai-realtime');
      return next;
    });

    // Stop Gemini Live API
    geminiLive.stopStreaming();
    setActiveProviders((prev) => {
      const next = new Set(prev);
      next.delete('gemini-live');
      return next;
    });

    // Stop audio recorder
    stopAudioRecorder();
  }, [realtimeAPI, geminiLive, stopAudioRecorder]);

  const handleToggleProvider = useCallback((provider: STTProvider, enabled: boolean) => {
    setConfigs((prev) =>
      prev.map((c) => (c.provider === provider ? { ...c, enabled } : c))
    );
  }, []);

  const handleClearResults = useCallback(() => {
    setResults({
      'openai-realtime': [],
      'gemini-live': [],
      'gpt-4o-transcribe-diarize': [],
      'faster-whisper-large-v3': [],
      'whisper-large-v3-turbo': [],
    });
    setEvaluationResults([]);
  }, []);

  const generateEvaluation = useCallback(() => {
    const newEvaluations: EvaluationResult[] = configs
      .filter((c) => c.enabled && results[c.provider].length > 0)
      .map((c) => {
        const providerResults = results[c.provider];
        const avgLatency = Math.round(
          providerResults.reduce((sum, r) => sum + r.latency, 0) / providerResults.length
        );

        return {
          provider: c.provider,
          accuracy: providerResults.length > 0 ? 'Good' : '-',
          latency: `${avgLatency}ms`,
          diarization: c.provider === 'gpt-4o-transcribe-diarize' || c.provider === 'gemini-live'
            ? 'supported' as const
            : c.provider === 'faster-whisper-large-v3'
              ? 'partial' as const
              : 'not-supported' as const,
          speakerAssignment: c.provider === 'gpt-4o-transcribe-diarize' || c.provider === 'gemini-live'
            ? 'supported' as const
            : 'not-supported' as const,
          cost: getCostEstimate(c.provider),
        };
      });

    setEvaluationResults(newEvaluations);
  }, [configs, results]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            Real-time STT Evaluation
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Compare multiple Speech-to-Text APIs in real-time
          </p>
        </header>

        <div className="space-y-6">
          <RecordingControls
            isRecording={isRecording}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onClearResults={handleClearResults}
            error={error}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {configs.map((config) => {
              const status = providerStatuses.find((s) => s.provider === config.provider);
              let isActiveForProvider = activeProviders.has(config.provider);

              // Check WebSocket-based providers
              if (config.provider === 'openai-realtime') {
                isActiveForProvider = realtimeAPI.isConnected;
              } else if (config.provider === 'gemini-live') {
                isActiveForProvider = geminiLive.isStreaming;
              }

              return (
                <TranscriptionPanel
                  key={config.provider}
                  provider={config.provider}
                  results={results[config.provider]}
                  isActive={isActiveForProvider}
                  enabled={config.enabled}
                  onToggle={(enabled) => handleToggleProvider(config.provider, enabled)}
                  configured={healthLoading ? true : status?.configured ?? true}
                  error={providerErrors[config.provider]}
                />
              );
            })}
          </div>

          <div className="flex justify-center">
            <button
              onClick={generateEvaluation}
              className="px-6 py-3 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-lg font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
            >
              Generate Evaluation Report
            </button>
          </div>

          <EvaluationTable results={evaluationResults} />
        </div>
      </div>
    </div>
  );
}

function getCostEstimate(provider: STTProvider): string {
  const costs: Record<STTProvider, string> = {
    'openai-realtime': '$0.006/min',
    'gemini-live': '$0.00025/1K chars',
    'gpt-4o-transcribe-diarize': '$0.012/min',
    'faster-whisper-large-v3': 'Free (Local)',
    'whisper-large-v3-turbo': 'Free (Local)',
  };
  return costs[provider];
}
