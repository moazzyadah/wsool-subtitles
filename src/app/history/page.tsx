import Link from 'next/link';
import { listRecentJobs } from '@/lib/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

function fmtDuration(sec?: number): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const statusClass: Record<string, string> = {
  done: 'bg-emerald-900/40 text-emerald-300',
  failed: 'bg-red-900/40 text-red-300',
  pending: 'bg-amber-900/40 text-amber-300',
  processing: 'bg-blue-900/40 text-blue-300',
  queued: 'bg-zinc-800 text-zinc-300',
};

export default function HistoryPage() {
  const jobs = listRecentJobs(100);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Job history</h1>
          <p className="mt-1 text-zinc-400">Last {jobs.length} transcription jobs.</p>
        </div>
        <Link href="/" className="text-sm text-zinc-400 underline hover:text-zinc-200">
          ← Back to upload
        </Link>
      </header>

      {jobs.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
          No jobs yet. Upload a video on the home page to get started.
        </div>
      )}

      {jobs.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 font-medium">Model</th>
                <th className="px-4 py-2 font-medium">Lang</th>
                <th className="px-4 py-2 font-medium">Task</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">Words</th>
                <th className="px-4 py-2 font-medium">Export</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.id} className="border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/40">
                  <td className="px-4 py-2 text-zinc-400">{fmtDate(j.createdAt)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${statusClass[j.status] ?? 'bg-zinc-800'}`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-zinc-200">
                    {j.actualProvider ?? j.requestedProvider}
                    {j.actualProvider && j.actualProvider !== j.requestedProvider && (
                      <span className="ml-1 text-xs text-amber-400" title={`Fell back from ${j.requestedProvider}`}>
                        ↳
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-zinc-400">{j.model}</td>
                  <td className="px-4 py-2 text-zinc-400">{j.language}</td>
                  <td className="px-4 py-2 text-zinc-400">{j.task}</td>
                  <td className="px-4 py-2 text-zinc-400">{fmtDuration(j.result?.durationSec)}</td>
                  <td className="px-4 py-2 text-zinc-400">{j.result?.words.length ?? '—'}</td>
                  <td className="px-4 py-2">
                    {j.status === 'done' ? (
                      <div className="flex gap-2">
                        <a
                          href={`/api/jobs/${j.id}?format=srt`}
                          className="text-xs text-emerald-400 underline hover:text-emerald-300"
                        >
                          SRT
                        </a>
                        <a
                          href={`/api/jobs/${j.id}?format=vtt`}
                          className="text-xs text-emerald-400 underline hover:text-emerald-300"
                        >
                          VTT
                        </a>
                      </div>
                    ) : j.error ? (
                      <span className="text-xs text-red-400" title={j.error}>error</span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
