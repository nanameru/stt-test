'use client';

import { TranscriptionResult, STTProvider } from '@/lib/types';

interface ProviderError {
  provider: STTProvider;
  errorCode: string;
  message: string;
}

interface TranscriptionPanelProps {
  provider: STTProvider;
  results: TranscriptionResult[];
  isActive: boolean;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  configured?: boolean;
  error?: ProviderError | null;
}

const providerNames: Record<STTProvider, string> = {
  'openai-whisper': 'OpenAI Whisper',
  'gemini-pro': 'Gemini 2.5 Pro',
  'gemini-live': 'Gemini Live API',
  'groq-whisper': 'Groq Whisper',
};

const providerColors: Record<STTProvider, string> = {
  'openai-whisper': 'border-green-500',
  'gemini-pro': 'border-blue-500',
  'gemini-live': 'border-purple-500',
  'groq-whisper': 'border-orange-500',
};

export function TranscriptionPanel({
  provider,
  results,
  isActive,
  enabled,
  onToggle,
  configured = true,
  error,
}: TranscriptionPanelProps) {
  const latestResult = results[results.length - 1];
  const averageLatency = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.latency, 0) / results.length)
    : 0;

  const getStatusDisplay = () => {
    if (!configured) {
      return { text: 'Not Configured', color: 'text-yellow-500' };
    }
    if (error) {
      return { text: 'Error', color: 'text-red-500' };
    }
    if (isActive) {
      return { text: 'Active', color: 'text-green-500' };
    }
    return { text: 'Idle', color: 'text-zinc-400' };
  };

  const status = getStatusDisplay();

  return (
    <div className={`rounded-lg border-2 ${providerColors[provider]} bg-white dark:bg-zinc-900 p-4 flex flex-col h-full`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-lg">{providerNames[provider]}</h3>
          {!configured && (
            <span className="text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded">
              API Key Missing
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {enabled ? 'ON' : 'OFF'}
          </span>
        </label>
      </div>

      <div className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-400 mb-3">
        <div>
          <span className="font-medium">Status:</span>{' '}
          <span className={status.color}>
            {status.text}
          </span>
        </div>
        <div>
          <span className="font-medium">Avg Latency:</span>{' '}
          <span>{averageLatency}ms</span>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm">
          <p className="text-red-700 dark:text-red-300 font-medium">
            {error.errorCode}
          </p>
          <p className="text-red-600 dark:text-red-400 text-xs mt-1">
            {error.message}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-800 rounded p-3 min-h-[200px] max-h-[300px]">
        {results.length === 0 ? (
          <p className="text-zinc-400 text-sm italic">
            {!configured 
              ? 'API key not configured. Check .env.local file.'
              : enabled 
                ? 'Waiting for audio...' 
                : 'Provider disabled'}
          </p>
        ) : (
          <div className="space-y-2">
            {results.map((result, index) => (
              <div key={index} className="text-sm">
                <div className="flex justify-between text-xs text-zinc-500 mb-1">
                  <span>{new Date(result.timestamp).toLocaleTimeString()}</span>
                  <span>{result.latency}ms</span>
                </div>
                <p className="text-zinc-800 dark:text-zinc-200">
                  {result.speaker && (
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      [{result.speaker}]{' '}
                    </span>
                  )}
                  {result.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {latestResult && (
        <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
          <p className="text-xs text-zinc-500">
            Latest: {latestResult.text.slice(0, 50)}
            {latestResult.text.length > 50 ? '...' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
