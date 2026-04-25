'use client';

import { useState } from 'react';
import { Download, Film } from 'lucide-react';

interface Props {
  jobId: string;
  sourcePath: string;
}

export default function ExportPanel({ jobId, sourcePath }: Props) {
  const [burning, setBurning] = useState(false);
  const [burnedPath, setBurnedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function burn(): Promise<void> {
    setBurning(true);
    setError(null);
    try {
      const res = await fetch('/api/burn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          sourcePath,
          style: { font: 'Cairo', fontSize: 28, primaryColor: '&HFFFFFF', outlineColor: '&H000000', outline: 2, position: 'bottom' },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: 'Burn failed' })) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { outputPath: string };
      setBurnedPath(j.outputPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBurning(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/jobs/${encodeURIComponent(jobId)}?format=srt`}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
        >
          <Download className="h-4 w-4" /> Download SRT
        </a>
        <a
          href={`/api/jobs/${encodeURIComponent(jobId)}?format=vtt`}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
        >
          <Download className="h-4 w-4" /> Download VTT
        </a>
        <button
          onClick={() => void burn()}
          disabled={burning}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          <Film className="h-4 w-4" />
          {burning ? 'Burning…' : 'Burn into MP4'}
        </button>
      </div>
      {burnedPath && (
        <div className="rounded-md border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-300">
          Burned video saved to: <code>{burnedPath}</code>
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-800 bg-red-950 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
