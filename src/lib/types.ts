export type STTProvider =
  | 'openai-realtime'           // OpenAI Realtime API
  | 'gemini-live'                // Gemini Live API
  | 'gpt-4o-transcribe-diarize'  // GPT-4o Transcribe with Diarization
  | 'faster-whisper-large-v3'    // Faster Whisper Large V3 (Local)
  | 'whisper-large-v3-turbo';    // Whisper Large V3 Turbo

export interface TranscriptionResult {
  provider: STTProvider;
  text: string;
  timestamp: number;
  latency: number;
  isFinal: boolean;
  speaker?: string;
}

export interface STTConfig {
  provider: STTProvider;
  enabled: boolean;
}

export interface EvaluationResult {
  provider: STTProvider;
  accuracy: string;
  latency: string;
  diarization: 'supported' | 'partial' | 'not-supported';
  speakerAssignment: 'supported' | 'partial' | 'not-supported';
  cost: string;
}

export interface AudioChunk {
  data: Blob;
  timestamp: number;
}
