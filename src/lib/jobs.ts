import 'server-only';
import { getDb } from './db';
import type { Job, JobKind, JobStatus } from '@/types/job';
import type { TranscriptionResult } from '@/types/provider';

interface CreateJobInput {
  id: string;
  uploadId: string;
  kind: JobKind;
  requestedProvider: string;
  model: string;
  language: string;
  task: 'transcribe' | 'translate';
  fallbackChain?: string[];
}

function rowToJob(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    uploadId: row.upload_id as string,
    kind: row.kind as JobKind,
    status: row.status as JobStatus,
    requestedProvider: row.requested_provider as string,
    actualProvider: (row.actual_provider as string | null) ?? undefined,
    model: row.model as string,
    language: row.language as string,
    task: row.task as 'transcribe' | 'translate',
    pollToken: (row.poll_token as string | null) ?? undefined,
    nextPollAt: (row.next_poll_at as number | null) ?? undefined,
    leaseOwner: (row.lease_owner as string | null) ?? undefined,
    leaseExpiresAt: (row.lease_expires_at as number | null) ?? undefined,
    result: row.result_json
      ? (JSON.parse(row.result_json as string) as TranscriptionResult)
      : undefined,
    editedSegments: row.edited_segments_json
      ? (JSON.parse(row.edited_segments_json as string) as Job['editedSegments'])
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
  getDb()
    .prepare(
      `INSERT INTO jobs (
        id, upload_id, kind, status, requested_provider, model, language, task,
        fallback_chain, fallback_index, created_at, updated_at
      ) VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.id,
      input.uploadId,
      input.kind,
      input.requestedProvider,
      input.model,
      input.language,
      input.task,
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

export function setJobPending(id: string, pollToken: string, nextPollAt: number): void {
  getDb()
    .prepare(
      `UPDATE jobs
       SET status = 'pending', poll_token = ?, next_poll_at = ?,
           lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
       WHERE id = ?`
    )
    .run(pollToken, nextPollAt, Date.now(), id);
}

export function setJobDone(id: string, actualProvider: string, result: TranscriptionResult): void {
  getDb()
    .prepare(
      `UPDATE jobs
       SET status = 'done', actual_provider = ?, result_json = ?,
           poll_token = NULL, next_poll_at = NULL,
           lease_owner = NULL, lease_expires_at = NULL,
           updated_at = ?
       WHERE id = ?`
    )
    .run(actualProvider, JSON.stringify(result), Date.now(), id);
}

export function setJobFailed(id: string, error: string): void {
  getDb()
    .prepare(
      `UPDATE jobs
       SET status = 'failed', error = ?,
           poll_token = NULL, next_poll_at = NULL,
           lease_owner = NULL, lease_expires_at = NULL,
           updated_at = ?
       WHERE id = ?`
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
      `UPDATE jobs
       SET requested_provider = ?, fallback_index = ?, status = 'queued',
           poll_token = NULL, next_poll_at = NULL,
           lease_owner = NULL, lease_expires_at = NULL,
           updated_at = ?
       WHERE id = ?`
    )
    .run(nextProvider, next, Date.now(), id);
  return true;
}

/**
 * Atomically claim the next available job and lease it to the caller.
 * Single statement — safe under concurrent workers / processes.
 * Returns null when there is nothing eligible.
 */
export function claimNextJob(owner: string, leaseMs: number): Job | null {
  const now = Date.now();
  const leaseUntil = now + leaseMs;
  const row = getDb()
    .prepare(
      `UPDATE jobs
       SET status = 'processing', lease_owner = ?, lease_expires_at = ?, updated_at = ?
       WHERE id = (
         SELECT id FROM jobs
         WHERE status = 'queued'
            OR (status = 'pending' AND next_poll_at IS NOT NULL AND next_poll_at <= ?)
         ORDER BY created_at ASC
         LIMIT 1
       )
       RETURNING *`
    )
    .get(owner, leaseUntil, now, now) as Record<string, unknown> | undefined;
  return row ? rowToJob(row) : null;
}

/**
 * Refresh the lease on a job currently held by `owner`.
 * No-op if the lease was lost (e.g. reclaimed by another worker after timeout).
 */
export function renewLease(id: string, owner: string, leaseMs: number): boolean {
  const result = getDb()
    .prepare(
      `UPDATE jobs SET lease_expires_at = ?, updated_at = ?
       WHERE id = ? AND lease_owner = ?`
    )
    .run(Date.now() + leaseMs, Date.now(), id, owner);
  return result.changes > 0;
}

/**
 * Reclaim jobs whose lease has expired. Run on worker boot and periodically.
 * Returns the number of jobs requeued.
 */
export function reclaimExpiredLeases(): number {
  const now = Date.now();
  const result = getDb()
    .prepare(
      `UPDATE jobs
       SET status = 'queued', lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
       WHERE status = 'processing'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at < ?`
    )
    .run(now, now);
  return result.changes;
}

export function setEditedSegments(
  id: string,
  segments: NonNullable<Job['editedSegments']>
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE jobs SET edited_segments_json = ?, updated_at = ?
       WHERE id = ? AND status = 'done'`
    )
    .run(JSON.stringify(segments), Date.now(), id);
  return result.changes > 0;
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
