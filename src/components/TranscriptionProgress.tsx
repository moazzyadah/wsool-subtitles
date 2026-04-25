'use client';

import { useEffect, useState } from 'react';
import type { TranscriptionResult } from '@/types/provider';

interface JobStatusResponse {
  id: string;
  status: 'queued' | 'processing' | 'pending' | 'done' | 'failed';
  requestedProvider: string;
  actualProvider?: string;
  result?: TranscriptionResult;
  error?: string;
  fellBack?: boolean;
}

interface Props {
  jobId: string;
  onComplete: (jobId: string, result: TranscriptionResult, actualProvider: string, fellBack: boolean) => void;
  onError: (msg: string) => void;
}

export default function TranscriptionProgress({ jobId, onComplete, onError }: Props) {
  const [status, setStatus] = useState<string>('queued');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as JobStatusResponse;
        if (cancelled) return;
        setStatus(j.status);
        if (j.status === 'done' && j.result) {
          onComplete(j.id, j.result, j.actualProvider ?? j.requestedProvider, Boolean(j.fellBack));
          return;
        }
        if (j.status === 'failed') {
          onError(j.error ?? 'Job failed');
          return;
        }
        timer = setTimeout(() => void poll(), 2000);
      } catch (e) {
        if (!cancelled) onError(e instanceof Error ? e.message : String(e));
      }
    };
    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, onComplete, onError]);

  const labels: Record<string, string> = {
    queued: 'Queued, waiting for worker…',
    processing: 'Sending audio to provider…',
    pending: 'Provider working (long-running model)…',
    done: 'Done',
    failed: 'Failed',
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
      <div className="mb-4 inline-block h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
      <p className="text-zinc-300">{labels[status] ?? status}</p>
      <p className="mt-2 text-xs text-zinc-500">Job: {jobId}</p>
    </div>
  );
}
