import 'server-only';
import fs from 'node:fs';
import { Readable } from 'node:stream';

/**
 * Parse an HTTP Range header against a known file size.
 * Returns null for malformed, unsatisfiable, or absent headers — caller
 * should fall back to a 200 response in that case.
 */
export function parseRange(
  header: string | null,
  size: number
): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const startStr = m[1];
  const endStr = m[2];
  let start: number;
  let end: number;
  if (startStr === '' && endStr === '') return null;
  if (startStr === '') {
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startStr);
    end = endStr === '' ? size - 1 : Number(endStr);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end >= size || start > end) return null;
  return { start, end };
}

/**
 * Build a Range-aware streaming Response from a file path that the caller
 * has ALREADY validated (containment + symlink check + isFile()). This
 * helper does no validation of its own — it only handles the streaming
 * contract.
 */
export function buildRangeResponse(
  src: string,
  size: number,
  rangeHeader: string | null,
  baseHeaders: Record<string, string>
): Response {
  const range = parseRange(rangeHeader, size);
  if (range) {
    const { start, end } = range;
    const stream = fs.createReadStream(src, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }
  const stream = fs.createReadStream(src);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      ...baseHeaders,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
    },
  });
}
