import 'server-only';
import path from 'node:path';
import { getDb } from './db';
import { config } from './config';

export interface UploadRecord {
  id: string;
  audioPath: string;
  audioHash: string;
  sourcePath?: string;
  sourceMime?: string;
  durationSec?: number;
  createdAt: number;
}

interface CreateInput {
  id: string;
  audioPath: string;
  audioHash: string;
  sourcePath?: string;
  sourceMime?: string;
  durationSec?: number;
}

function rowToUpload(row: Record<string, unknown>): UploadRecord {
  return {
    id: row.id as string,
    audioPath: row.audio_path as string,
    audioHash: row.audio_hash as string,
    sourcePath: (row.source_path as string | null) ?? undefined,
    sourceMime: (row.source_mime as string | null) ?? undefined,
    durationSec: (row.duration_sec as number | null) ?? undefined,
    createdAt: row.created_at as number,
  };
}

export function createUpload(input: CreateInput): UploadRecord {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO uploads (id, audio_path, audio_hash, source_path, source_mime, duration_sec, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.id,
      input.audioPath,
      input.audioHash,
      input.sourcePath ?? null,
      input.sourceMime ?? null,
      input.durationSec ?? null,
      now
    );
  return getUpload(input.id)!;
}

export function getUpload(id: string): UploadRecord | null {
  const row = getDb().prepare('SELECT * FROM uploads WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToUpload(row) : null;
}

/**
 * Resolve the audio path for an upload AFTER asserting it lies under the
 * configured uploads root. Throws if the upload is unknown or escapes the root.
 * This is the only sanctioned way for downstream code (worker, providers) to
 * obtain a filesystem path tied to a user upload.
 */
export function resolveUploadAudio(id: string): { audioPath: string; audioHash: string } {
  const rec = getUpload(id);
  if (!rec) throw new Error(`Unknown upload ${id}`);
  const root = path.resolve(config.paths.uploads);
  const abs = path.resolve(rec.audioPath);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error('Upload path escapes uploads root');
  }
  return { audioPath: abs, audioHash: rec.audioHash };
}

export function deleteOldUploads(olderThanMs: number): number {
  const cutoff = Date.now() - olderThanMs;
  const result = getDb().prepare('DELETE FROM uploads WHERE created_at < ?').run(cutoff);
  return result.changes;
}
