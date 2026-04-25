export interface Word {
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface Segment {
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface Speaker {
  id: string;
  segments: number[];
}

export interface TranscriptionResult {
  text: string;
  language: string;
  durationSec: number;
  words: Word[];
  segments: Segment[];
  speakers?: Speaker[];
  translation?: string;
  /** Provider that actually produced this result (may differ from requested if fallback fired) */
  actualProvider: string;
  /** Raw provider response — debug only, never sent to the client */
  raw?: unknown;
}

export interface ProviderError {
  message: string;
  status?: number;
  retryable: boolean;
}

export type TranscribeOutcome =
  | { kind: 'done'; result: TranscriptionResult }
  | { kind: 'pending'; pollToken: string; etaSec?: number }
  | { kind: 'failed'; error: ProviderError };

export interface ProviderCapabilities {
  wordTimestamps: boolean;
  diarization: boolean;
  translate: boolean;
  asyncOnly: boolean;
  maxDurationSec: number;
  maxFileMB: number;
  /** Audio formats this provider accepts directly (we transcode if needed) */
  acceptedFormats: ReadonlyArray<'mp3' | 'wav' | 'flac' | 'm4a' | 'webm' | 'mp4'>;
}

export interface ProviderModel {
  id: string;
  label: string;
  /** Cost per minute of audio in USD, null if free/local */
  pricingUsdPerMin: number | null;
  /** Optional override of provider-level capabilities for this specific model */
  capabilities?: Partial<ProviderCapabilities>;
}

export interface ProviderInfo {
  id: string;
  name: string;
  docsUrl: string;
  envKey: string;
  description: string;
  models: ProviderModel[];
  capabilities: ProviderCapabilities;
}

export interface TranscribeInput {
  /** Audio bytes — may be loaded lazily from `audioPath` for memory-conscious providers */
  audio: Buffer;
  /** Absolute path to the canonical audio file on disk (FLAC after upload pipeline) */
  audioPath: string;
  audioFormat: 'flac' | 'mp3' | 'wav';
  model: string;
  language?: string;
  prompt?: string;
  task?: 'transcribe' | 'translate';
  wordTimestamps: boolean;
  /** Optional AbortSignal — providers must wire it into fetch/child_process for timeouts */
  signal?: AbortSignal;
}

export interface STTProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  start(input: TranscribeInput): Promise<TranscribeOutcome>;
  /** Only async providers implement this. Signal is wired into fetch for timeouts. */
  poll?(token: string, signal?: AbortSignal): Promise<TranscribeOutcome>;
}
