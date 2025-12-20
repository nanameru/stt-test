export type STTProvider = 'openai-whisper' | 'gemini-pro' | 'gemini-live' | 'groq-whisper';

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
