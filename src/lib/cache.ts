import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './db';
import type { TranscriptionResult } from '@/types/provider';

interface CacheKey {
  audioHash: string;
  providerId: string;
  model: string;
  language: string;
  task: 'transcribe' | 'translate';
  prompt?: string;
}

function keyParts(k: CacheKey): [string, string, string, string, string, string] {
  const promptHash = k.prompt
    ? crypto.createHash('sha256').update(k.prompt).digest('hex')
    : '';
  return [k.audioHash, k.providerId, k.model, k.language, k.task, promptHash];
}

export function getCachedResult(k: CacheKey): TranscriptionResult | null {
  const row = getDb()
    .prepare(
      `SELECT result_json FROM transcription_cache
       WHERE audio_hash = ? AND provider_id = ? AND model = ?
         AND language = ? AND task = ? AND prompt_hash = ?`
    )
    .get(...keyParts(k)) as { result_json: string } | undefined;
  return row ? (JSON.parse(row.result_json) as TranscriptionResult) : null;
}

export function putCachedResult(k: CacheKey, result: TranscriptionResult): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO transcription_cache
       (audio_hash, provider_id, model, language, task, prompt_hash, result_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(...keyParts(k), JSON.stringify(result), Date.now());
}

export function hashFile(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
