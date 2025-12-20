'use client';

import { EvaluationResult, STTProvider } from '@/lib/types';

interface EvaluationTableProps {
  results: EvaluationResult[];
}

const providerNames: Record<STTProvider, string> = {
  'openai-whisper': 'OpenAI Whisper',
  'gemini-pro': 'Gemini 2.5 Pro',
  'gemini-live': 'Gemini Live API',
  'groq-whisper': 'Groq Whisper',
};

const statusIcons: Record<string, string> = {
  'supported': 'O',
  'partial': 'Triangle',
  'not-supported': 'X',
};

const statusColors: Record<string, string> = {
  'supported': 'text-green-500',
  'partial': 'text-yellow-500',
  'not-supported': 'text-red-500',
};

export function EvaluationTable({ results }: EvaluationTableProps) {
  if (results.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 shadow-sm border border-zinc-200 dark:border-zinc-800">
        <h2 className="text-xl font-semibold mb-4">Evaluation Results</h2>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">
          No evaluation results yet. Start recording to generate results.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 shadow-sm border border-zinc-200 dark:border-zinc-800">
      <h2 className="text-xl font-semibold mb-4">Evaluation Results</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="text-left py-3 px-4 font-medium">API</th>
              <th className="text-left py-3 px-4 font-medium">Accuracy</th>
              <th className="text-left py-3 px-4 font-medium">Latency</th>
              <th className="text-center py-3 px-4 font-medium">Diarization</th>
              <th className="text-center py-3 px-4 font-medium">Speaker Assignment</th>
              <th className="text-left py-3 px-4 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr
                key={result.provider}
                className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <td className="py-3 px-4 font-medium">
                  {providerNames[result.provider]}
                </td>
                <td className="py-3 px-4">{result.accuracy}</td>
                <td className="py-3 px-4">{result.latency}</td>
                <td className={`py-3 px-4 text-center ${statusColors[result.diarization]}`}>
                  {statusIcons[result.diarization]}
                </td>
                <td className={`py-3 px-4 text-center ${statusColors[result.speakerAssignment]}`}>
                  {statusIcons[result.speakerAssignment]}
                </td>
                <td className="py-3 px-4">{result.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex gap-6 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-1">
          <span className="text-green-500">O</span> = Supported
        </div>
        <div className="flex items-center gap-1">
          <span className="text-yellow-500">Triangle</span> = Partial
        </div>
        <div className="flex items-center gap-1">
          <span className="text-red-500">X</span> = Not Supported
        </div>
      </div>
    </div>
  );
}
