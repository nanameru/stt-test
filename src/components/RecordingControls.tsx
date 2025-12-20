'use client';

interface RecordingControlsProps {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onClearResults: () => void;
  error: string | null;
}

export function RecordingControls({
  isRecording,
  onStartRecording,
  onStopRecording,
  onClearResults,
  error,
}: RecordingControlsProps) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 shadow-sm border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={isRecording ? onStopRecording : onStartRecording}
            className={`px-6 py-3 rounded-full font-medium text-white transition-all ${
              isRecording
                ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
          
          <button
            onClick={onClearResults}
            className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Clear Results
          </button>
        </div>

        <div className="flex items-center gap-2">
          {isRecording && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm text-red-500 font-medium">Recording...</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
        <p>
          Click &quot;Start Recording&quot; to begin capturing audio from your microphone.
          The audio will be sent to all enabled STT providers for transcription.
        </p>
      </div>
    </div>
  );
}
