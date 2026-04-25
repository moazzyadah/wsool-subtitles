import 'server-only';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  fs.mkdirSync(config.paths.data, { recursive: true });
  const dbPath = path.join(config.paths.data, 'jobs.db');

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_provider TEXT NOT NULL,
      actual_provider TEXT,
      model TEXT NOT NULL,
      language TEXT NOT NULL,
      task TEXT NOT NULL,
      audio_path TEXT NOT NULL,
      audio_hash TEXT NOT NULL,
      poll_token TEXT,
      next_poll_at INTEGER,
      result_json TEXT,
      error TEXT,
      fallback_chain TEXT,
      fallback_index INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_next_poll ON jobs(next_poll_at);

    CREATE TABLE IF NOT EXISTS transcription_cache (
      audio_hash TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model TEXT NOT NULL,
      language TEXT NOT NULL,
      task TEXT NOT NULL,
      prompt_hash TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (audio_hash, provider_id, model, language, task, prompt_hash)
    );
  `);

  return _db;
}
