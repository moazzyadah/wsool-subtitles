import 'server-only';
import { getDb } from './db';
import type { Job, JobKind, JobStatus } from '@/types/job';
import type { TranscriptionResult } from '@/types/provider';

interface CreateJobInput {
  id: string;
  kind: JobKind;
  requestedProvider: string;
  model: string;
  language: string;
  task: 'transcribe' | 'translate';
  audioPath: string;
  audioHash: string;
  fallbackChain?: string[];
}

function rowToJob(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    kind: row.kind as JobKind,
    status: row.status as JobStatus,
    requestedProvider: row.requested_provider as string,
    actualProvider: (row.actual_provider as string | null) ?? undefined,
    model: row.model as string,
    language: row.language as string,
    task: row.task as 'transcribe' | 'translate',
    audioPath: row.audio_path as string,
    audioHash: row.audio_hash as string,
    pollToken: (row.poll_token as string | null) ?? undefined,
    nextPollAt: (row.next_poll_at as number | null) ?? undefined,
    result: row.result_json
      ? (JSON.parse(row.result_json as string) as TranscriptionResult)
      : undefined,
    error: (row.error as string | null) ?? undefined,
    fallbackChain: row.fallback_chain
      ? (JSON.parse(row.fallback_chain as string) as string[])
      : undefined,
    fallbackIndex: (row.fallback_index as number | null) ?? undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

export function createJob(input: CreateJobInput): Job {
  const now = Date.now();
  const db = getDb();
  db.prepare(
    `INSERT INTO jobs (
      id, kind, status, requested_provider, model, language, task,
      audio_path, audio_hash, fallback_chain, fallback_index,
      created_at, updated_at
    ) VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.kind,
    input.requestedProvider,
    input.model,
    input.language,
    input.task,
    input.audioPath,
    input.audioHash,
    input.fallbackChain ? JSON.stringify(input.fallbackChain) : null,
    input.fallbackChain ? 0 : null,
    now,
    now
  );
  return getJob(input.id)!;
}

export function getJob(id: string): Job | null {
  const row = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToJob(row) : null;
}

export function updateJobStatus(id: string, status: JobStatus): void {
  getDb()
    .prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, Date.now(), id);
}

export function setJobPending(id: string, pollToken: string, nextPollAt: number): void {
  getDb()
    .prepare(
      `UPDATE jobs SET status = 'pending', poll_token = ?, next_poll_at = ?, updated_at = ? WHERE id = ?`
    )
    .run(pollToken, nextPollAt, Date.now(), id);
}

export function setJobDone(id: string, actualProvider: string, result: TranscriptionResult): void {
  getDb()
    .prepare(
      `UPDATE jobs SET status = 'done', actual_provider = ?, result_json = ?, poll_token = NULL, next_poll_at = NULL, updated_at = ? WHERE id = ?`
    )
    .run(actualProvider, JSON.stringify(result), Date.now(), id);
}

export function setJobFailed(id: string, error: string): void {
  getDb()
    .prepare(
      `UPDATE jobs SET status = 'failed', error = ?, poll_token = NULL, next_poll_at = NULL, updated_at = ? WHERE id = ?`
    )
    .run(error, Date.now(), id);
}

export function advanceFallback(id: string): boolean {
  const job = getJob(id);
  if (!job?.fallbackChain) return false;
  const next = (job.fallbackIndex ?? 0) + 1;
  if (next >= job.fallbackChain.length) return false;
  const nextProvider = job.fallbackChain[next]!;
  getDb()
    .prepare(
      `UPDATE jobs SET requested_provider = ?, fallback_index = ?, status = 'queued', poll_token = NULL, next_poll_at = NULL, updated_at = ? WHERE id = ?`
    )
    .run(nextProvider, next, Date.now(), id);
  return true;
}

export function pickNextJob(): Job | null {
  const now = Date.now();
  const row = getDb()
    .prepare(
      `SELECT * FROM jobs
       WHERE status = 'queued'
          OR (status = 'pending' AND next_poll_at IS NOT NULL AND next_poll_at <= ?)
       ORDER BY created_at ASC
       LIMIT 1`
    )
    .get(now) as Record<string, unknown> | undefined;
  return row ? rowToJob(row) : null;
}

export function listRecentJobs(limit = 50): Job[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM jobs WHERE kind = 'transcribe' ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map(rowToJob);
}

export function deleteOldJobs(olderThanMs: number): number {
  const cutoff = Date.now() - olderThanMs;
  const result = getDb().prepare('DELETE FROM jobs WHERE created_at < ?').run(cutoff);
  return result.changes;
}
