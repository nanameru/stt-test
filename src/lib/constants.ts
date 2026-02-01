import { STTProvider } from './types';

export const providerNames: Record<STTProvider, string> = {
    'openai-realtime': 'OpenAI Realtime API',
    'gemini-live': 'Gemini Live API',
    'elevenlabs-scribe': 'ElevenLabs Scribe v2',
    'gpt-4o-transcribe-diarize': 'GPT-4o Transcribe Diarize',
    'runpod-whisper': 'Whisper Turbo',
    'runpod-whisper-large-v3': 'Whisper Large V3',
    'runpod-whisper-distil-large-v3': 'Whisper Medium',
    'kotoba-whisper': 'Kotoba Whisper v2.2',
    'reazonspeech': 'ReazonSpeech NeMo v2',
    'parakeet': 'NVIDIA Parakeet-TDT',
    'kotoba-whisper-hf': 'Kotoba Whisper (HF)',
    'faster-whisper-large-v3': 'Faster Whisper Large V3',
    'whisper-large-v3-turbo': 'Whisper Large V3 Turbo',
};

export const providerColors: Record<STTProvider, string> = {
    'openai-realtime': 'border-green-500',
    'gemini-live': 'border-purple-500',
    'elevenlabs-scribe': 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950',
    'gpt-4o-transcribe-diarize': 'border-blue-500',
    'runpod-whisper': 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950',
    'runpod-whisper-large-v3': 'border-teal-500 bg-teal-50 dark:bg-teal-950',
    'runpod-whisper-distil-large-v3': 'border-sky-500 bg-sky-50 dark:bg-sky-950',
    'kotoba-whisper': 'border-orange-500 bg-orange-50 dark:bg-orange-950',
    'reazonspeech': 'border-rose-500 bg-rose-50 dark:bg-rose-950',
    'parakeet': 'border-lime-500 bg-lime-50 dark:bg-lime-950',
    'kotoba-whisper-hf': 'border-amber-500 bg-amber-50 dark:bg-amber-950',
    'faster-whisper-large-v3': 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950',
    'whisper-large-v3-turbo': 'border-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-950',
};

export const modelBadges: Record<STTProvider, string | null> = {
    'openai-realtime': null,
    'gemini-live': null,
    'elevenlabs-scribe': 'Scribe v2',
    'gpt-4o-transcribe-diarize': null,
    'runpod-whisper': 'Turbo',
    'runpod-whisper-large-v3': 'Large V3',
    'runpod-whisper-distil-large-v3': 'Medium',
    'kotoba-whisper': 'JP v2.2',
    'reazonspeech': 'NeMo v2',
    'parakeet': 'TDT-CTC',
    'kotoba-whisper-hf': 'HF API',
    'faster-whisper-large-v3': 'Large V3',
    'whisper-large-v3-turbo': 'V3 Turbo',
};
