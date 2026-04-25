import type { TranscriptionResult } from './provider';

export type JobStatus = 'queued' | 'processing' | 'pending' | 'done' | 'failed';

export type JobKind = 'transcribe' | 'burn' | 'compare';

export interface Job {
  id: string;
  kind: JobKind;
  status: JobStatus;
  /** Provider id requested by the user */
  requestedProvider: string;
  /** Provider id that actually produced output (set on completion) */
  actualProvider?: string;
  model: string;
  language: string;
  task: 'transcribe' | 'translate';
  /** Path to the source audio (FLAC, normalized) */
  audioPath: string;
  /** sha256 of the audio file — used as cache key */
  audioHash: string;
  /** Provider-specific token for async polling */
  pollToken?: string;
  /** When async, when to next poll (epoch ms) */
  nextPollAt?: number;
  /** Final result on completion */
  result?: TranscriptionResult;
  /** Error message on failure (sanitized) */
  error?: string;
  /** Optional fallback chain — list of provider IDs to try after primary */
  fallbackChain?: string[];
  /** Index into fallbackChain currently being attempted */
  fallbackIndex?: number;
  createdAt: number;
  updatedAt: number;
}
