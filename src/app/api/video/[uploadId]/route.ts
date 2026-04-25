import { NextRequest } from 'next/server';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { validateJobId, UploadError } from '@/lib/upload';
import { getUpload } from '@/lib/uploads';
import { config, sanitizeError } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ uploadId: string }>;
}

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
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

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  try {
    const { uploadId } = await ctx.params;
    validateJobId(uploadId);

    const rec = getUpload(uploadId);
    if (!rec || !rec.sourcePath) {
      return new Response('Not found', { status: 404 });
    }

    const root = await fsp.realpath(path.resolve(config.paths.uploads));
    const lstat = await fsp.lstat(rec.sourcePath);
    if (lstat.isSymbolicLink()) {
      return new Response('Forbidden', { status: 403 });
    }
    const src = await fsp.realpath(path.resolve(rec.sourcePath));
    if (!src.startsWith(root + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }

    const stat = await fsp.stat(src);
    if (!stat.isFile()) {
      return new Response('Forbidden', { status: 403 });
    }
    const size = stat.size;
    const ext = path.extname(src).toLowerCase();
    const mime =
      rec.sourceMime ||
      (ext === '.mp4' ? 'video/mp4' : ext === '.webm' ? 'video/webm' : ext === '.mov' ? 'video/quicktime' : 'video/mp4');

    const range = parseRange(req.headers.get('range'), size);

    if (range) {
      const { start, end } = range;
      const stream = fs.createReadStream(src, { start, end });
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    const stream = fs.createReadStream(src);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    if (e instanceof UploadError) return new Response(e.message, { status: e.status });
    const safe = sanitizeError(e, 'Video stream failed');
    console.error('[video]', e);
    return new Response(safe.error, { status: safe.code });
  }
}
