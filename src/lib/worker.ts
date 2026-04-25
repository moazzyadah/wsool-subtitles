import 'server-only';
import fs from 'node:fs';
import { pickNextJob, updateJobStatus, setJobPending, setJobDone, setJobFailed, advanceFallback } from './jobs';
import { getCachedResult, putCachedResult } from './cache';
import { getProvider } from './providers/registry';
import { sanitizeError } from './config';
import type { Job } from '@/types/job';
import type { TranscribeInput, TranscribeOutcome } from '@/types/provider';

let _running = false;
let _stopRequested = false;

function detectFormat(audioPath: string): 'flac' | 'mp3' | 'wav' {
  const ext = audioPath.toLowerCase().split('.').pop();
  if (ext === 'mp3') return 'mp3';
  if (ext === 'wav') return 'wav';
  return 'flac';
}

async function processJob(job: Job): Promise<void> {
  // Cache check first — only relevant for fresh starts, not pending polls.
  if (job.status === 'queued' && !job.pollToken) {
    const cached = getCachedResult({
      audioHash: job.audioHash,
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

  if (job.status === 'pending' && job.pollToken && provider.poll) {
    outcome = await provider.poll(job.pollToken);
  } else {
    updateJobStatus(job.id, 'processing');
    let audio: Buffer;
    try {
      audio = fs.readFileSync(job.audioPath);
    } catch (e) {
      setJobFailed(job.id, sanitizeError(e, 'Audio file missing').error);
      return;
    }
    const input: TranscribeInput = {
      audio,
      audioFormat: detectFormat(job.audioPath),
      model: job.model,
      language: job.language,
      task: job.task,
      wordTimestamps: true,
    };
    outcome = await provider.start(input);
  }

  if (outcome.kind === 'done') {
    putCachedResult(
      {
        audioHash: job.audioHash,
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

  // Failed
  if (outcome.error.retryable && advanceFallback(job.id)) {
    return; // next iteration will pick the new requestedProvider
  }
  setJobFailed(job.id, outcome.error.message);
}

async function loop(): Promise<void> {
  while (!_stopRequested) {
    const job = pickNextJob();
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
  void loop();
  console.log('[wsool-subtitles] worker started');
}

export function stopWorker(): void {
  _stopRequested = true;
}
