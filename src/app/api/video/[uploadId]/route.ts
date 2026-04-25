import { NextRequest } from 'next/server';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { validateJobId, UploadError } from '@/lib/upload';
import { getUpload } from '@/lib/uploads';
import { config, sanitizeError } from '@/lib/config';
import { buildRangeResponse } from '@/lib/range-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ uploadId: string }>;
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
    const ext = path.extname(src).toLowerCase();
    const EXT_MIME: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.m4v': 'video/x-m4v',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.mkv': 'video/x-matroska',
      '.avi': 'video/x-msvideo',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
    };
    const mime = rec.sourceMime || EXT_MIME[ext] || 'application/octet-stream';

    return buildRangeResponse(src, stat.size, req.headers.get('range'), {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=3600',
    });
  } catch (e) {
    if (e instanceof UploadError) return new Response(e.message, { status: e.status });
    const safe = sanitizeError(e, 'Video stream failed');
    console.error('[video]', e);
    return new Response(safe.error, { status: safe.code });
  }
}
