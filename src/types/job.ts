import type { TranscriptionResult } from './provider';

export type JobStatus = 'queued' | 'processing' | 'pending' | 'done' | 'failed';

export type JobKind = 'transcribe' | 'burn' | 'compare';

export interface Job {
  id: string;
  /** Server-side upload record id; audio path/hash resolved via uploads.ts */
  uploadId: string;
  kind: JobKind;
  status: JobStatus;
  requestedProvider: string;
  actualProvider?: string;
  model: string;
  language: string;
  task: 'transcribe' | 'translate';
  pollToken?: string;
  nextPollAt?: number;
  /** Worker that holds the processing lease (null if free) */
  leaseOwner?: string;
  /** Lease deadline epoch ms; expired leases are reclaimed on boot */
  leaseExpiresAt?: number;
  result?: TranscriptionResult;
  /** User-edited segments persisted server-side; export/burn read these when present */
  editedSegments?: Array<{ start: number; end: number; text: string }>;
  error?: string;
  fallbackChain?: string[];
  fallbackIndex?: number;
  createdAt: number;
  updatedAt: number;
}
