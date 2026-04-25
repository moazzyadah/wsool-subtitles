'use client';

import { useEffect, useState } from 'react';
import { GitCompare } from 'lucide-react';
import UploadDropzone from './UploadDropzone';
import ProviderPicker from './ProviderPicker';
import TranscriptionProgress from './TranscriptionProgress';
import SubtitleEditor from './SubtitleEditor';
import ExportPanel from './ExportPanel';
import CompareSetup, { type CompareSelection } from './CompareSetup';
import CompareView from './CompareView';
import type { TranscriptionResult, Segment, ProviderInfo as BaseProviderInfo } from '@/types/provider';

type ProviderInfo = BaseProviderInfo & { enabled: boolean };

interface UploadResult {
  uploadId: string;
  durationSec: number;
  sourceMime: string;
}

interface CompareJobMeta {
  jobId: string;
  providerId: string;
  model: string;
  language: string;
}

type AppState =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'uploaded'; upload: UploadResult }
  | { kind: 'compare-setup'; upload: UploadResult }
  | { kind: 'comparing'; upload: UploadResult; jobs: CompareJobMeta[] }
  | { kind: 'transcribing'; upload: UploadResult; jobId: string; providerId: string }
  | {
      kind: 'done';
      upload: UploadResult;
      result: TranscriptionResult;
      segments: Segment[];
      jobId: string;
      actualProvider: string;
      fellBack: boolean;
    }
  | { kind: 'error'; message: string };

interface ProvidersResponse {
  providers: ProviderInfo[];
}

interface CompareResponse {
  jobs: CompareJobMeta[];
}

export default function App() {
  const [state, setState] = useState<AppState>({ kind: 'idle' });
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerId, setProviderId] = useState<string>('local');
  const [model, setModel] = useState<string>('ggml-medium');
  const [language, setLanguage] = useState<string>('auto');
  const [task, setTask] = useState<'transcribe' | 'translate'>('transcribe');

  useEffect(() => {
    fetch('/api/providers')
      .then(r => r.json() as Promise<ProvidersResponse>)
      .then(d => {
        const enabled = d.providers.filter(p => p.enabled);
        setProviders(d.providers);
        if (enabled.length && !enabled.find(p => p.id === providerId)) {
          setProviderId(enabled[0]!.id);
          setModel(enabled[0]!.models[0]!.id);
        }
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setState({ kind: 'error', message: `Failed to load providers: ${msg}` });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(file: File): Promise<void> {
    setState({ kind: 'uploading' });
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: file });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({ error: 'Upload failed' }))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const upload = (await res.json()) as UploadResult;
      setState({ kind: 'uploaded', upload });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function startTranscription(upload: UploadResult): Promise<void> {
    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: upload.uploadId,
          providerId,
          model,
          language,
          task,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({ error: 'Transcribe failed' }))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { jobId: string };
      setState({ kind: 'transcribing', upload, jobId: j.jobId, providerId });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function startCompare(upload: UploadResult, selections: CompareSelection[]): Promise<void> {
    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: upload.uploadId,
          selections,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({ error: 'Compare failed' }))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as CompareResponse;
      setState({ kind: 'comparing', upload, jobs: j.jobs });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  function handleResult(
    jobId: string,
    result: TranscriptionResult,
    actualProvider: string,
    fellBack: boolean
  ): void {
    if (state.kind !== 'transcribing') return;
    setState({
      kind: 'done',
      upload: state.upload,
      result,
      segments: result.segments,
      jobId,
      actualProvider,
      fellBack,
    });
  }

  function adoptCompareResult(jobId: string, result: TranscriptionResult): void {
    if (state.kind !== 'comparing') return;
    // The compare-child jobId carries the persisted result that ExportPanel will
    // read for SRT/VTT/burn — using the upload id here would 404.
    setState({
      kind: 'done',
      upload: state.upload,
      result,
      segments: result.segments,
      jobId,
      actualProvider: result.actualProvider,
      fellBack: false,
    });
  }

  async function handleEditChange(segments: Segment[]): Promise<void> {
    if (state.kind !== 'done') return;
    setState({ ...state, segments });
    // Persist edits server-side so SRT/VTT/burn use the latest text.
    try {
      await fetch(`/api/jobs/${encodeURIComponent(state.jobId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: segments.map(s => ({ start: s.start, end: s.end, text: s.text })),
        }),
      });
    } catch { /* swallow — local state already updated, user will see disk version on next download if persist failed */ }
  }

  function reset(): void {
    setState({ kind: 'idle' });
  }

  const enabledCount = providers.filter(p => p.enabled).length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">wsool-subtitles</h1>
          <p className="mt-2 text-zinc-400">
            Universal video transcription · 14 STT providers · Egyptian Arabic dialect support
          </p>
        </div>
        <a
          href="/history"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          History
        </a>
      </header>

      {state.kind === 'idle' && <UploadDropzone onFile={handleUpload} />}

      {state.kind === 'uploading' && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-zinc-300">Uploading and extracting audio…</p>
        </div>
      )}

      {state.kind === 'uploaded' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            Uploaded · {Math.round(state.upload.durationSec)}s · {state.upload.sourceMime}
          </div>
          <ProviderPicker
            providers={providers.filter(p => p.enabled)}
            providerId={providerId}
            model={model}
            language={language}
            task={task}
            onProviderChange={(pid, mid) => {
              setProviderId(pid);
              setModel(mid);
            }}
            onModelChange={setModel}
            onLanguageChange={setLanguage}
            onTaskChange={setTask}
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void startTranscription(state.upload)}
              className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500"
            >
              Start transcription
            </button>
            <button
              onClick={() => setState({ kind: 'compare-setup', upload: state.upload })}
              disabled={enabledCount < 2}
              className="inline-flex items-center gap-2 rounded-md bg-zinc-800 px-4 py-2 font-medium hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              title={enabledCount < 2 ? 'Enable at least 2 providers to compare' : 'Run several providers in parallel'}
            >
              <GitCompare className="h-4 w-4" /> Compare providers
            </button>
          </div>
        </div>
      )}

      {state.kind === 'compare-setup' && (
        <CompareSetup
          providers={providers}
          onStart={sels => void startCompare(state.upload, sels)}
          onCancel={() => setState({ kind: 'uploaded', upload: state.upload })}
        />
      )}

      {state.kind === 'comparing' && (
        <CompareView
          jobs={state.jobs}
          onAdopt={adoptCompareResult}
          onCancel={() => setState({ kind: 'uploaded', upload: state.upload })}
        />
      )}

      {state.kind === 'transcribing' && (
        <TranscriptionProgress
          jobId={state.jobId}
          onComplete={handleResult}
          onError={msg => setState({ kind: 'error', message: msg })}
        />
      )}

      {state.kind === 'done' && (
        <div className="space-y-6">
          {state.fellBack && (
            <div className="rounded-md border border-amber-700 bg-amber-950 p-3 text-sm text-amber-300">
              Fell back to <strong>{state.actualProvider}</strong> after the requested provider failed.
            </div>
          )}
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-400">
            Done · {state.result.words.length} words · language: {state.result.language} · provider:{' '}
            {state.actualProvider}
          </div>
          <SubtitleEditor
            segments={state.segments}
            words={state.result.words}
            onChange={segments => void handleEditChange(segments)}
          />
          <ExportPanel jobId={state.jobId} uploadId={state.upload.uploadId} />
          <button onClick={reset} className="text-sm text-zinc-400 underline hover:text-zinc-200">
            Start over
          </button>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="space-y-4">
          <div className="rounded-md border border-red-800 bg-red-950 p-4 text-red-300">
            {state.message}
          </div>
          <button onClick={reset} className="rounded-md bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700">
            Try again
          </button>
        </div>
      )}
    </main>
  );
}
