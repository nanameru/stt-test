export type STTProvider =
  | 'openai-realtime'                 // OpenAI Realtime API
  | 'gemini-live'                      // Gemini Live API
  | 'gpt-4o-transcribe-diarize'        // GPT-4o Transcribe with Diarization
  | 'whisper-large-v3-turbo'           // Whisper Large V3 Turbo (Local)
  | 'runpod-whisper'                   // RunPod Cloud GPU Whisper (Turbo)
  | 'runpod-whisper-large-v3'          // RunPod Cloud GPU Whisper (Large V3)
  | 'runpod-whisper-distil-large-v3';  // RunPod Cloud GPU Whisper (Distil Large V3)

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
  // Evaluation metrics
  similarity?: number;
  cer?: number;
  wer?: number;
  grade?: string;
  gradeColor?: string;
  gradeLabel?: string;
  // AI evaluation fields
  comment?: string;
  strengths?: string[];
  weaknesses?: string[];
  accuracyScore?: number;
  completenessScore?: number;
  naturalnessScore?: number;
}

export interface AudioChunk {
  data: Blob;
  timestamp: number;
}
