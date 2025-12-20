'use client';

import { useState, useCallback } from 'react';
import { useAudioRecorder } from '@/lib/useAudioRecorder';
import { TranscriptionPanel } from '@/components/TranscriptionPanel';
import { RecordingControls } from '@/components/RecordingControls';
import { EvaluationTable } from '@/components/EvaluationTable';
import { TranscriptionResult, STTProvider, STTConfig, EvaluationResult } from '@/lib/types';

const defaultConfigs: STTConfig[] = [
  { provider: 'openai-whisper', enabled: true },
  { provider: 'gemini-pro', enabled: true },
  { provider: 'gemini-live', enabled: true },
  { provider: 'groq-whisper', enabled: true },
];

const apiEndpoints: Record<STTProvider, string> = {
  'openai-whisper': '/api/stt/openai-whisper',
  'gemini-pro': '/api/stt/gemini-pro',
  'gemini-live': '/api/stt/gemini-live',
  'groq-whisper': '/api/stt/groq-whisper',
};

export default function Home() {
  const [configs, setConfigs] = useState<STTConfig[]>(defaultConfigs);
  const [results, setResults] = useState<Record<STTProvider, TranscriptionResult[]>>({
    'openai-whisper': [],
    'gemini-pro': [],
    'gemini-live': [],
    'groq-whisper': [],
  });
  const [evaluationResults, setEvaluationResults] = useState<EvaluationResult[]>([]);
  const [activeProviders, setActiveProviders] = useState<Set<STTProvider>>(new Set());

  const processAudioChunk = useCallback(async (blob: Blob, timestamp: number) => {
    const enabledProviders = configs.filter((c) => c.enabled).map((c) => c.provider);
    
    const promises = enabledProviders.map(async (provider) => {
      setActiveProviders((prev) => new Set([...prev, provider]));
      
      try {
        const formData = new FormData();
        formData.append('audio', blob, 'audio.webm');

        const response = await fetch(apiEndpoints[provider], {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result: TranscriptionResult = await response.json();
        
        if (result.text && result.text.trim()) {
          setResults((prev) => ({
            ...prev,
            [provider]: [...prev[provider], result],
          }));
        }
      } catch (error) {
        console.error(`Error with ${provider}:`, error);
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

  const { isRecording, error, startRecording, stopRecording } = useAudioRecorder({
    onAudioChunk: processAudioChunk,
    chunkInterval: 2000,
  });

  const handleToggleProvider = useCallback((provider: STTProvider, enabled: boolean) => {
    setConfigs((prev) =>
      prev.map((c) => (c.provider === provider ? { ...c, enabled } : c))
    );
  }, []);

  const handleClearResults = useCallback(() => {
    setResults({
      'openai-whisper': [],
      'gemini-pro': [],
      'gemini-live': [],
      'groq-whisper': [],
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
          diarization: c.provider === 'gemini-pro' || c.provider === 'gemini-live' 
            ? 'partial' as const 
            : 'not-supported' as const,
          speakerAssignment: c.provider === 'gemini-pro' || c.provider === 'gemini-live'
            ? 'partial' as const
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
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onClearResults={handleClearResults}
            error={error}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {configs.map((config) => (
              <TranscriptionPanel
                key={config.provider}
                provider={config.provider}
                results={results[config.provider]}
                isActive={activeProviders.has(config.provider)}
                enabled={config.enabled}
                onToggle={(enabled) => handleToggleProvider(config.provider, enabled)}
              />
            ))}
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
    'openai-whisper': '$0.006/min',
    'gemini-pro': '$0.00025/1K chars',
    'gemini-live': '$0.00025/1K chars',
    'groq-whisper': '$0.001/min',
  };
  return costs[provider];
}
