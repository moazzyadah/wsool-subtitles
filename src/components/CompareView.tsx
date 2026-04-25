'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { TranscriptionResult } from '@/types/provider';
import { diffWords, similarity } from '@/lib/diff';

interface JobMeta {
  jobId: string;
  providerId: string;
  model: string;
  language: string;
}

interface JobState extends JobMeta {
  status: 'queued' | 'processing' | 'pending' | 'done' | 'failed';
  result?: TranscriptionResult;
  actualProvider?: string;
  error?: string;
}

interface JobStatusResponse {
  id: string;
  status: JobState['status'];
  result?: TranscriptionResult;
  actualProvider?: string;
  error?: string;
}

interface Props {
  jobs: JobMeta[];
  onAdopt: (result: TranscriptionResult) => void;
  onCancel: () => void;
}

export default function CompareView({ jobs, onAdopt, onCancel }: Props) {
  const [states, setStates] = useState<JobState[]>(() =>
    jobs.map(j => ({ ...j, status: 'queued' }))
  );

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const pollOne = async (idx: number, jobId: string): Promise<void> => {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as JobStatusResponse;
        if (cancelled) return;
        setStates(prev =>
          prev.map((s, i) =>
            i === idx
              ? { ...s, status: j.status, result: j.result, actualProvider: j.actualProvider, error: j.error }
              : s
          )
        );
        if (j.status !== 'done' && j.status !== 'failed') {
          timers[idx] = setTimeout(() => void pollOne(idx, jobId), 2000);
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setStates(prev =>
          prev.map((s, i) => (i === idx ? { ...s, status: 'failed', error: msg } : s))
        );
      }
    };

    jobs.forEach((j, i) => void pollOne(i, j.jobId));
    return () => {
      cancelled = true;
      timers.forEach(t => t && clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute a similarity matrix between completed pairs
  const sims = useMemo(() => {
    const m: number[][] = states.map(() => states.map(() => 1));
    for (let i = 0; i < states.length; i++) {
      for (let j = 0; j < states.length; j++) {
        if (i === j) continue;
        const a = states[i]!.result?.text;
        const b = states[j]!.result?.text;
        m[i]![j] = a && b ? similarity(a, b) : 0;
      }
    }
    return m;
  }, [states]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Comparing {states.length} providers</h2>
        <button
          onClick={onCancel}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>

      <div className={`grid gap-4 ${states.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
        {states.map((s, idx) => {
          const otherDone = states.find((x, i) => i !== idx && x.result);
          const diff = s.result && otherDone?.result
            ? diffWords(otherDone.result.text, s.result.text).right
            : null;
          return (
            <div key={s.jobId} className="rounded-lg border border-zinc-800 bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
                <div>
                  <div className="text-sm font-medium text-zinc-200">{s.providerId} · {s.model}</div>
                  <div className="text-xs text-zinc-500">
                    {s.status}
                    {s.result && ` · ${s.result.words.length} words`}
                    {sims[idx] && otherDone && (
                      <span className="ml-2">
                        sim:{' '}
                        {sims[idx]!.filter((_, i) => i !== idx && states[i]!.result).length > 0
                          ? Math.round(
                              (sims[idx]!.filter((_, i) => i !== idx && states[i]!.result).reduce((a, b) => a + b, 0) /
                                sims[idx]!.filter((_, i) => i !== idx && states[i]!.result).length) * 100
                            ) + '%'
                          : '—'}
                      </span>
                    )}
                  </div>
                </div>
                {s.result && (
                  <button
                    onClick={() => onAdopt(s.result!)}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                    title="Use this transcript"
                  >
                    <Check className="h-3 w-3" /> Adopt
                  </button>
                )}
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-4 text-sm leading-relaxed" dir="auto">
                {s.status === 'failed' && (
                  <div className="text-red-400">{s.error ?? 'failed'}</div>
                )}
                {(s.status === 'queued' || s.status === 'processing' || s.status === 'pending') && (
                  <div className="text-zinc-500">
                    <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                    {s.status}…
                  </div>
                )}
                {s.result && diff && (
                  <p className="subtitle-line whitespace-pre-wrap">
                    {diff.map((tok, i) => (
                      <span
                        key={i}
                        className={
                          tok.op === 'add'
                            ? 'rounded bg-emerald-900/60 px-0.5 text-emerald-200'
                            : 'text-zinc-200'
                        }
                      >
                        {tok.text}
                        {/[\p{L}\p{N}']/u.test(tok.text) ? ' ' : ''}
                      </span>
                    ))}
                  </p>
                )}
                {s.result && !diff && (
                  <p className="subtitle-line whitespace-pre-wrap text-zinc-200">{s.result.text}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-zinc-500">
        Highlighted words exist in this transcript but not in the others. Higher
        similarity % = transcripts agree more. Click <strong>Adopt</strong> to use
        a transcript as the canonical result.
      </p>
    </div>
  );
}
