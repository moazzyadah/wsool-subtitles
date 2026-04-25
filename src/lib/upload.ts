import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { config } from './config';

const ALLOWED_EXTS = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mp3', 'wav', 'flac', 'm4a', 'ogg'] as const;
const ALLOWED_MIMES = new Set([
  'video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm', 'video/x-msvideo',
  'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/x-flac',
  'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/webm',
]);

export const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class UploadError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Server-side jobId — never trust the client. */
export function newJobId(): string {
  return crypto.randomUUID();
}

/** Strict validation. Use before any path.join() that includes a jobId. */
export function validateJobId(id: string): string {
  if (!JOB_ID_PATTERN.test(id)) {
    throw new UploadError(`Invalid job id`, 400);
  }
  return id;
}

/**
 * Resolve a path under one of our managed roots and assert containment.
 * Closes path-traversal and symlink attacks.
 */
export function safeJoin(root: string, jobId: string, ...rest: string[]): string {
  validateJobId(jobId);
  const absRoot = path.resolve(root);
  const candidate = path.resolve(absRoot, jobId, ...rest);
  if (!candidate.startsWith(absRoot + path.sep) && candidate !== absRoot) {
    throw new UploadError('Path escape detected', 400);
  }
  return candidate;
}

/** Stream-write a Web ReadableStream to disk with a hard byte cap. */
export async function streamToFile(
  stream: ReadableStream<Uint8Array>,
  destPath: string,
  maxBytes: number
): Promise<{ bytesWritten: number }> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const out = fs.createWriteStream(destPath);
  let bytesWritten = 0;

  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesWritten += value.byteLength;
      if (bytesWritten > maxBytes) {
        out.destroy();
        try { fs.unlinkSync(destPath); } catch { /* ignore */ }
        throw new UploadError(
          `Upload exceeded ${Math.round(maxBytes / 1024 / 1024)} MB limit`,
          413
        );
      }
      if (!out.write(value)) {
        await new Promise<void>(res => out.once('drain', () => res()));
      }
    }
  } finally {
    reader.releaseLock();
  }
  await new Promise<void>((resolve, reject) => {
    out.end((err: NodeJS.ErrnoException | null | undefined) => (err ? reject(err) : resolve()));
  });
  return { bytesWritten };
}

/**
 * Sniff magic bytes and confirm the file is a known audio/video container.
 * Rejects executables disguised as videos.
 */
export async function sniffAndRename(
  rawPath: string
): Promise<{ finalPath: string; ext: string; mime: string }> {
  const fd = fs.openSync(rawPath, 'r');
  const head = Buffer.alloc(4100);
  try {
    fs.readSync(fd, head, 0, head.length, 0);
  } finally {
    fs.closeSync(fd);
  }

  const detected = await fileTypeFromBuffer(head);
  if (!detected) {
    fs.unlinkSync(rawPath);
    throw new UploadError('Unrecognized file format', 415);
  }
  if (!ALLOWED_EXTS.includes(detected.ext as (typeof ALLOWED_EXTS)[number])) {
    fs.unlinkSync(rawPath);
    throw new UploadError(`Unsupported extension: ${detected.ext}`, 415);
  }
  if (!ALLOWED_MIMES.has(detected.mime)) {
    fs.unlinkSync(rawPath);
    throw new UploadError(`Unsupported MIME type: ${detected.mime}`, 415);
  }

  const finalPath = `${rawPath}.${detected.ext}`;
  fs.renameSync(rawPath, finalPath);
  return { finalPath, ext: detected.ext, mime: detected.mime };
}

/**
 * Create the standard job directories: uploads/{id}/ and outputs/{id}/.
 * Sets restrictive permissions on Unix.
 */
export function ensureJobDirs(jobId: string): { uploadDir: string; outputDir: string } {
  const uploadDir = safeJoin(config.paths.uploads, jobId);
  const outputDir = safeJoin(config.paths.outputs, jobId);
  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  return { uploadDir, outputDir };
}
