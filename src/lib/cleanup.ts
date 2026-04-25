import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { deleteOldJobs } from './jobs';
import { deleteOldUploads } from './uploads';

/**
 * On boot, delete jobs older than `JOBS_RETENTION_DAYS` and prune any orphan
 * files in uploads/ + outputs/. Idempotent — safe to call repeatedly.
 *
 * We never recurse beyond the first level of the configured directories,
 * so a misconfigured paths.uploads cannot wipe an unrelated tree.
 */
export function runCleanup(): void {
  const retentionMs = config.jobsRetentionDays * 24 * 60 * 60 * 1000;
  if (retentionMs <= 0) return;

  let removedJobs = 0;
  let removedUploads = 0;
  try {
    removedJobs = deleteOldJobs(retentionMs);
    removedUploads = deleteOldUploads(retentionMs);
  } catch (e) {
    console.error('[cleanup] failed to delete old records:', (e as Error).message);
  }

  const cutoff = Date.now() - retentionMs;
  let removedFiles = 0;

  for (const dir of [config.paths.uploads, config.paths.outputs]) {
    if (!fs.existsSync(dir)) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      console.error(`[cleanup] failed to read ${dir}:`, (e as Error).message);
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      try {
        const stat = fs.statSync(full);
        if (stat.mtimeMs < cutoff) {
          fs.rmSync(full, { recursive: true, force: true });
          removedFiles++;
        }
      } catch {
        // ignore — file may have been removed concurrently
      }
    }
  }

  if (removedJobs > 0 || removedUploads > 0 || removedFiles > 0) {
    console.log(
      `[cleanup] removed ${removedJobs} jobs, ${removedUploads} uploads, ${removedFiles} files ` +
      `older than ${config.jobsRetentionDays}d`
    );
  }
}
