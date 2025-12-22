'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useAudioRecorder } from '@/lib/useAudioRecorder';
import { useRealtimeAPI } from '@/lib/useRealtimeAPI';
import { useGeminiLive } from '@/lib/useGeminiLive';
import { TranscriptionPanel } from '@/components/TranscriptionPanel';
import { RecordingControls } from '@/components/RecordingControls';
import { EvaluationTable } from '@/components/EvaluationTable';
import { TranscriptionResult, STTProvider, STTConfig, EvaluationResult } from '@/lib/types';
import { evaluateTranscription, getGrade, GroundTruth } from '@/lib/evaluation';
import groundTruthData from '@/data/ground-truth.json';
import Link from 'next/link';

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
  { provider: 'runpod-whisper', enabled: true },
  { provider: 'runpod-whisper-large-v3', enabled: true },
  { provider: 'runpod-whisper-distil-large-v3', enabled: true },
];

const apiEndpoints: Record<STTProvider, string> = {
  'openai-realtime': '/api/stt/openai-realtime',
  'gemini-live': '/api/stt/gemini-live',
  'gpt-4o-transcribe-diarize': '/api/stt/gpt-4o-transcribe-diarize',
  'runpod-whisper': '/api/stt/runpod-whisper',
  'runpod-whisper-large-v3': '/api/stt/runpod-whisper-large-v3',
  'runpod-whisper-distil-large-v3': '/api/stt/runpod-whisper-distil-large-v3',
};

function HomeContent() {
  // URL parameter for viewing saved sessions
  const searchParams = useSearchParams();
  const sessionIdParam = searchParams.get('session');
  const viewingSessionId = sessionIdParam ? sessionIdParam as Id<'sessions'> : null;

  // Load session data from Convex if viewing a saved session
  const loadedSession = useQuery(
    api.sessions.get,
    viewingSessionId ? { sessionId: viewingSessionId } : 'skip'
  );

  const [configs, setConfigs] = useState<STTConfig[]>(defaultConfigs);
  const [results, setResults] = useState<Record<STTProvider, TranscriptionResult[]>>({
    'openai-realtime': [],
    'gemini-live': [],
    'gpt-4o-transcribe-diarize': [],
    'runpod-whisper': [],
    'runpod-whisper-large-v3': [],
    'runpod-whisper-distil-large-v3': [],
  });
  const [evaluationResults, setEvaluationResults] = useState<EvaluationResult[]>([]);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [aiEvaluationSummary, setAiEvaluationSummary] = useState<{
    summary: string;
    bestProvider: string;
    groundTruthEstimate: string;
  } | null>(null);
  const [activeProviders, setActiveProviders] = useState<Set<STTProvider>>(new Set());
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [providerErrors, setProviderErrors] = useState<Record<STTProvider, ProviderError | null>>({
    'openai-realtime': null,
    'gemini-live': null,
    'gpt-4o-transcribe-diarize': null,
    'runpod-whisper': null,
    'runpod-whisper-large-v3': null,
    'runpod-whisper-distil-large-v3': null,
  });
  const [healthLoading, setHealthLoading] = useState(true);
  const [geminiApiKey, setGeminiApiKey] = useState<string | null>(null);
  const [geminiPartialText, setGeminiPartialText] = useState<string>(''); // Real-time transcription display

  // Convex mutations for data persistence
  const createSession = useMutation(api.sessions.create);
  const endSession = useMutation(api.sessions.end);
  const saveTranscription = useMutation(api.transcriptions.save);
  const saveEvaluation = useMutation(api.evaluations.save);
  const currentSessionIdRef = useRef<Id<'sessions'> | null>(null);

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
    onPartialTranscription: useCallback((text: string) => {
      setGeminiPartialText(text);
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

  // Load session data when viewing a saved session
  useEffect(() => {
    if (loadedSession && viewingSessionId) {
      // Set the session ID reference so evaluation can be saved for this session
      currentSessionIdRef.current = viewingSessionId;

      // Group transcriptions by provider
      const newResults: Record<STTProvider, TranscriptionResult[]> = {
        'openai-realtime': [],
        'gemini-live': [],
        'gpt-4o-transcribe-diarize': [],
        'runpod-whisper': [],
        'runpod-whisper-large-v3': [],
        'runpod-whisper-distil-large-v3': [],
      };

      for (const t of loadedSession.transcriptions || []) {
        const provider = t.provider as STTProvider;
        if (newResults[provider]) {
          newResults[provider].push({
            text: t.text,
            latency: t.latency,
            timestamp: t.timestamp,
            provider: provider,
            isFinal: t.isFinal,
          });
        }
      }
      setResults(newResults);

      // Load evaluation if exists
      if (loadedSession.evaluation) {
        const gradeColors: Record<string, string> = {
          'S': '#FFD700', 'A': '#22c55e', 'B': '#3b82f6',
          'C': '#f97316', 'D': '#ef4444', 'F': '#dc2626',
        };

        const newEvaluations: EvaluationResult[] = loadedSession.evaluation.results.map((r) => {
          const providerTranscriptions = newResults[r.provider as STTProvider] || [];
          const avgLatency = providerTranscriptions.length > 0
            ? Math.round(providerTranscriptions.reduce((sum, t) => sum + t.latency, 0) / providerTranscriptions.length)
            : 0;

          return {
            provider: r.provider as STTProvider,
            accuracy: `${r.similarity.toFixed(1)}%`,
            latency: `${avgLatency}ms`,
            diarization: r.provider === 'gpt-4o-transcribe-diarize' || r.provider === 'gemini-live'
              ? 'supported' as const
              : 'not-supported' as const,
            speakerAssignment: r.provider === 'gpt-4o-transcribe-diarize' || r.provider === 'gemini-live'
              ? 'supported' as const
              : 'not-supported' as const,
            cost: '-',
            similarity: r.similarity,
            cer: r.cer,
            wer: r.wer,
            grade: r.grade,
            gradeColor: gradeColors[r.grade] || '#888',
            comment: r.comment,
            strengths: r.strengths,
            weaknesses: r.weaknesses,
          };
        });
        setEvaluationResults(newEvaluations);

        setAiEvaluationSummary({
          summary: loadedSession.evaluation.summary,
          bestProvider: loadedSession.evaluation.bestProvider || '',
          groundTruthEstimate: '',
        });
      }
    }
  }, [loadedSession, viewingSessionId]);

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
    chunkInterval: 2000, // 2 seconds for lower latency
  });

  // Custom handlers to manage both audio recorder and WebSocket APIs
  const handleStartRecording = useCallback(async () => {
    // Create Convex session for data persistence
    const enabledProviders = configs.filter(c => c.enabled).map(c => c.provider);
    try {
      const sessionId = await createSession({ providersUsed: enabledProviders });
      currentSessionIdRef.current = sessionId;
    } catch (error) {
      console.error('Failed to create Convex session:', error);
      // Continue recording even if Convex fails
    }

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
  }, [configs, realtimeAPI, geminiLive, geminiApiKey, startAudioRecorder, createSession]);

  const handleStopRecording = useCallback(async () => {
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

    // End Convex session and save transcriptions
    if (currentSessionIdRef.current) {
      try {
        await endSession({ sessionId: currentSessionIdRef.current });

        // Save all transcriptions to Convex
        for (const [provider, transcriptions] of Object.entries(results)) {
          for (const t of transcriptions) {
            await saveTranscription({
              sessionId: currentSessionIdRef.current,
              provider,
              text: t.text,
              latency: t.latency,
              timestamp: t.timestamp,
              isFinal: t.isFinal ?? true,
            });
          }
        }
      } catch (error) {
        console.error('Failed to save to Convex:', error);
      }
    }
  }, [realtimeAPI, geminiLive, stopAudioRecorder, results, endSession, saveTranscription]);

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
      'runpod-whisper': [],
      'runpod-whisper-large-v3': [],
      'runpod-whisper-distil-large-v3': [],
    });
    setEvaluationResults([]);
  }, []);

  const generateEvaluation = useCallback(async () => {
    // Prepare transcription data for AI evaluation
    const transcriptionData = configs
      .filter((c) => c.enabled && results[c.provider].length > 0)
      .map((c) => {
        const providerResults = results[c.provider];
        const avgLatency = Math.round(
          providerResults.reduce((sum, r) => sum + r.latency, 0) / providerResults.length
        );
        return {
          provider: c.provider,
          texts: providerResults.map((r) => r.text),
          averageLatency: avgLatency,
        };
      });

    if (transcriptionData.length === 0) {
      alert('評価するデータがありません。まず録音してください。');
      return;
    }

    setEvaluationLoading(true);
    setAiEvaluationSummary(null);

    try {
      // Call AI evaluation API
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcriptions: transcriptionData }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Evaluation failed');
      }

      const aiResult = await response.json();

      // Set summary
      setAiEvaluationSummary({
        summary: aiResult.summary,
        bestProvider: aiResult.bestProvider,
        groundTruthEstimate: aiResult.groundTruthEstimate,
      });

      // Convert AI evaluations to EvaluationResult format
      const newEvaluations: EvaluationResult[] = aiResult.evaluations.map((eval_: {
        provider: STTProvider;
        grade: string;
        similarity: number;
        cer: number;
        wer: number;
        accuracyScore: number;
        completenessScore: number;
        naturalnessScore: number;
        strengths: string[];
        weaknesses: string[];
        comment: string;
      }) => {
        const config = configs.find(c => c.provider === eval_.provider);
        const providerResults = results[eval_.provider] || [];
        const avgLatency = providerResults.length > 0
          ? Math.round(providerResults.reduce((sum, r) => sum + r.latency, 0) / providerResults.length)
          : 0;

        const gradeColors: Record<string, string> = {
          'S': '#FFD700',
          'A': '#00C853',
          'B': '#2196F3',
          'C': '#FF9800',
          'D': '#FF5722',
          'F': '#F44336',
        };

        return {
          provider: eval_.provider,
          accuracy: `${eval_.similarity.toFixed(1)}%`,
          latency: `${avgLatency}ms`,
          diarization: eval_.provider === 'gpt-4o-transcribe-diarize' || eval_.provider === 'gemini-live'
            ? 'supported' as const
            : 'not-supported' as const,
          speakerAssignment: eval_.provider === 'gpt-4o-transcribe-diarize' || eval_.provider === 'gemini-live'
            ? 'supported' as const
            : 'not-supported' as const,
          cost: getCostEstimate(eval_.provider),
          similarity: eval_.similarity,
          cer: eval_.cer,
          wer: eval_.wer,
          grade: eval_.grade,
          gradeColor: gradeColors[eval_.grade] || '#888',
          comment: eval_.comment,
          strengths: eval_.strengths,
          weaknesses: eval_.weaknesses,
          accuracyScore: eval_.accuracyScore,
          completenessScore: eval_.completenessScore,
          naturalnessScore: eval_.naturalnessScore,
        };
      });

      setEvaluationResults(newEvaluations);

      // Save evaluation to Convex
      if (currentSessionIdRef.current) {
        try {
          await saveEvaluation({
            sessionId: currentSessionIdRef.current,
            summary: aiResult.summary || '',
            bestProvider: aiResult.bestProvider,
            groundTruthUsed: true,
            results: aiResult.evaluations.map((e: {
              provider: string;
              grade: string;
              similarity: number;
              cer?: number;
              wer?: number;
              comment: string;
              strengths: string[];
              weaknesses: string[];
            }) => ({
              provider: e.provider,
              grade: e.grade,
              similarity: e.similarity,
              cer: e.cer,
              wer: e.wer,
              comment: e.comment || '',
              strengths: e.strengths || [],
              weaknesses: e.weaknesses || [],
            })),
          });
        } catch (error) {
          console.error('Failed to save evaluation to Convex:', error);
        }
      }
    } catch (error) {
      console.error('AI evaluation failed:', error);
      alert(`AI評価に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setEvaluationLoading(false);
    }
  }, [configs, results, saveEvaluation]);

  // CSV export for current session
  const downloadSessionCSV = useCallback(() => {
    const providerLabels: Record<string, string> = {
      'openai-realtime': 'OpenAI Realtime',
      'gemini-live': 'Gemini Live',
      'gpt-4o-transcribe-diarize': 'GPT-4o Diarize',
      'runpod-whisper': 'Whisper Turbo',
      'runpod-whisper-large-v3': 'Whisper Large V3',
      'runpod-whisper-distil-large-v3': 'Whisper Medium',
    };

    const rows: string[][] = [];
    // Header with Japanese explanations
    rows.push([
      'プロバイダー',
      '文字起こし',
      '平均レイテンシー(ms)',
      '評価グレード',
      '類似度(%)',
      'CER(文字誤り率)(%)',
      'WER(単語誤り率)(%)',
      'AIコメント',
      '強み',
      '弱み',
    ]);

    // Get all providers with data
    const providers = Object.keys(results).filter(p => results[p as STTProvider].length > 0);

    for (const provider of providers) {
      const transcripts = results[provider as STTProvider];
      const fullText = transcripts.map(t => t.text).join(' ');
      const avgLatency = transcripts.length > 0
        ? Math.round(transcripts.reduce((sum, t) => sum + t.latency, 0) / transcripts.length)
        : 0;
      const evalResult = evaluationResults.find(e => e.provider === provider);

      rows.push([
        providerLabels[provider] || provider,
        `"${fullText.replace(/"/g, '""')}"`,
        avgLatency.toString(),
        evalResult?.grade || '-',
        evalResult?.similarity?.toFixed(1) || '-',
        evalResult?.cer?.toFixed(1) || '-',
        evalResult?.wer?.toFixed(1) || '-',
        `"${(evalResult?.comment || '').replace(/"/g, '""')}"`,
        `"${(evalResult?.strengths?.join('、') || '').replace(/"/g, '""')}"`,
        `"${(evalResult?.weaknesses?.join('、') || '').replace(/"/g, '""')}"`,
      ]);
    }

    const csv = rows.map(row => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = loadedSession
      ? new Date(loadedSession.startTime).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    a.download = `stt-session-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, evaluationResults, loadedSession]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {viewingSessionId ? '📂 セッション詳細' : 'Real-time STT Evaluation'}
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-2">
              {viewingSessionId && loadedSession
                ? `${new Date(loadedSession.startTime).toLocaleString('ja-JP')} の録音データ`
                : 'Compare multiple Speech-to-Text APIs in real-time'}
            </p>
            {viewingSessionId && (
              <Link
                href="/"
                className="inline-block mt-3 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                ← 新規録音に戻る
              </Link>
            )}
          </div>
          <div className="flex gap-3">
            {Object.values(results).some(r => r.length > 0) && (
              <button
                onClick={downloadSessionCSV}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                📥 CSV出力
              </button>
            )}
            <Link
              href="/history"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              📋 履歴を見る
            </Link>
          </div>
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
                  partialText={config.provider === 'gemini-live' ? geminiPartialText : undefined}
                />
              );
            })}
          </div>

          <div className="flex flex-col items-center gap-3">
            {/* Show message if viewing a saved session without evaluation */}
            {viewingSessionId && loadedSession && !loadedSession.evaluation && evaluationResults.length === 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-center">
                <p className="text-amber-800 dark:text-amber-200 text-sm">
                  ⚠️ このセッションにはまだAI評価レポートがありません。下のボタンで生成してください。
                </p>
              </div>
            )}
            <button
              onClick={generateEvaluation}
              disabled={evaluationLoading}
              className="px-6 py-3 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-lg font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {evaluationLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  🤖 Gemini 3 Proで評価中...
                </>
              ) : (
                <>🤖 AI評価レポートを生成</>
              )}
            </button>
          </div>

          {/* AI Evaluation Summary */}
          {aiEvaluationSummary && (
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-6 border border-purple-200 dark:border-purple-800">
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                🤖 AI評価サマリー
                <span className="text-xs bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
                  Gemini 3 Pro
                </span>
              </h3>

              <p className="text-zinc-700 dark:text-zinc-300 mb-4">{aiEvaluationSummary.summary}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-zinc-800 p-3 rounded-lg">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">🏆 最優秀プロバイダー</p>
                  <p className="font-medium text-zinc-800 dark:text-zinc-200">{aiEvaluationSummary.bestProvider}</p>
                </div>
                <div className="bg-white dark:bg-zinc-800 p-3 rounded-lg">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">📝 推定正解文</p>
                  <p className="font-medium text-zinc-800 dark:text-zinc-200 text-sm">{aiEvaluationSummary.groundTruthEstimate}</p>
                </div>
              </div>
            </div>
          )}

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
    'runpod-whisper': '$0.00025/sec (~$0.015/min)',
    'runpod-whisper-large-v3': '$0.00025/sec (~$0.015/min)',
    'runpod-whisper-distil-large-v3': '$0.00025/sec (~$0.015/min)',
  };
  return costs[provider];
}

// Wrap with Suspense for useSearchParams
export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-50 dark:bg-black p-6 flex items-center justify-center">
        <div className="text-zinc-600 dark:text-zinc-400">読み込み中...</div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
