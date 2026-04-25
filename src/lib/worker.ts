import 'server-only';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  claimNextJob,
  renewLease,
  reclaimExpiredLeases,
  setJobPending,
  setJobDone,
  setJobFailed,
  advanceFallback,
} from './jobs';
import { resolveUploadAudio } from './uploads';
import { getCachedResult, putCachedResult } from './cache';
import { getProvider } from './providers/registry';
import { sanitizeError } from './config';
import type { Job } from '@/types/job';
import type { TranscribeInput, TranscribeOutcome } from '@/types/provider';

let _running = false;
let _stopRequested = false;

/** Per-worker identity. Used as the lease owner so we never reclaim our own work. */
const WORKER_ID = `worker-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

/** Job lease — long enough for any single provider call, short enough to recover quickly on crash. */
const LEASE_MS = 15 * 60 * 1000; // 15 min
/** Hard timeout per provider start/poll call. */
const CALL_TIMEOUT_MS = 10 * 60 * 1000; // 10 min
/** Heartbeat interval to renew the lease while a long call is in flight. */
const HEARTBEAT_MS = 60 * 1000;

function detectFormat(audioPath: string): 'flac' | 'mp3' | 'wav' {
  const ext = audioPath.toLowerCase().split('.').pop();
  if (ext === 'mp3') return 'mp3';
  if (ext === 'wav') return 'wav';
  return 'flac';
}

async function withTimeoutAndHeartbeat<T>(
  jobId: string,
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(new Error('Provider call timed out')), CALL_TIMEOUT_MS);
  const heartbeat = setInterval(() => {
    // Lease lost (reclaimed) → abort to surrender quickly.
    if (!renewLease(jobId, WORKER_ID, LEASE_MS)) ctrl.abort(new Error('Lost job lease'));
  }, HEARTBEAT_MS);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timeout);
    clearInterval(heartbeat);
  }
}

async function processJob(job: Job): Promise<void> {
  let audioPath: string;
  let audioHash: string;
  try {
    ({ audioPath, audioHash } = resolveUploadAudio(job.uploadId));
  } catch (e) {
    setJobFailed(job.id, sanitizeError(e, 'Upload no longer available').error);
    return;
  }

  // Cache check on first attempt only.
  if (!job.pollToken) {
    const cached = getCachedResult({
      audioHash,
      providerId: job.requestedProvider,
      model: job.model,
      language: job.language,
      task: job.task,
    });
    if (cached) {
      setJobDone(job.id, job.requestedProvider, { ...cached, actualProvider: job.requestedProvider });
      return;
    }
  }

  let provider;
  try {
    provider = getProvider(job.requestedProvider);
  } catch (e) {
    setJobFailed(job.id, sanitizeError(e).error);
    return;
  }

  let outcome: TranscribeOutcome;

  if (job.pollToken && provider.poll) {
    outcome = await withTimeoutAndHeartbeat(job.id, sig => provider.poll!(job.pollToken!, sig));
  } else {
    let audio: Buffer;
    try {
      audio = fs.readFileSync(audioPath);
    } catch (e) {
      setJobFailed(job.id, sanitizeError(e, 'Audio file missing').error);
      return;
    }
    outcome = await withTimeoutAndHeartbeat(job.id, async signal => {
      const input: TranscribeInput = {
        audio,
        audioPath,
        audioFormat: detectFormat(audioPath),
        model: job.model,
        language: job.language,
        task: job.task,
        wordTimestamps: true,
        signal,
      };
      return provider.start(input);
    });
  }

  if (outcome.kind === 'done') {
    putCachedResult(
      {
        audioHash,
        providerId: job.requestedProvider,
        model: job.model,
        language: job.language,
        task: job.task,
      },
      outcome.result
    );
    setJobDone(job.id, job.requestedProvider, outcome.result);
    return;
  }

  if (outcome.kind === 'pending') {
    const eta = Math.max(2, outcome.etaSec ?? 5);
    setJobPending(job.id, outcome.pollToken, Date.now() + eta * 1000);
    return;
  }

  if (outcome.error.retryable && advanceFallback(job.id)) return;
  setJobFailed(job.id, outcome.error.message);
}

async function loop(): Promise<void> {
  while (!_stopRequested) {
    const job = claimNextJob(WORKER_ID, LEASE_MS);
    if (!job) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }
    try {
      await processJob(job);
    } catch (e) {
      console.error('[worker] unexpected', e);
      setJobFailed(job.id, sanitizeError(e).error);
    }
  }
  _running = false;
}

export function startWorker(): void {
  if (_running) return;
  _running = true;
  _stopRequested = false;

  // Reclaim leases from crashed predecessors before starting the loop.
  const requeued = reclaimExpiredLeases();
  if (requeued > 0) console.log(`[worker] reclaimed ${requeued} stale jobs on boot`);

  void loop();
  console.log(`[wsool-subtitles] worker started (${WORKER_ID})`);
}

export function stopWorker(): void {
  _stopRequested = true;
}
