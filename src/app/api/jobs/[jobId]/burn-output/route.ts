import { NextRequest } from 'next/server';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { validateJobId, safeJoin, UploadError } from '@/lib/upload';
import { getJob } from '@/lib/jobs';
import { getUpload } from '@/lib/uploads';
import { config, sanitizeError } from '@/lib/config';
import { buildRangeResponse } from '@/lib/range-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ jobId: string }>;
}

/** Build a safe Content-Disposition filename from the upload's original basename. */
function deriveDownloadName(jobId: string, sourcePath: string | undefined): string {
  let stem = sourcePath ? path.basename(sourcePath).replace(/\.[^.]+$/, '') : '';
  // Strip non-printable + filesystem/HTTP-hostile chars; collapse whitespace.
  stem = stem.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_').trim();
  if (!stem) stem = `subtitles_${jobId.slice(0, 8)}`;
  if (stem.length > 100) stem = stem.slice(0, 100);
  return `${stem}-with-subs.mp4`;
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  try {
    const { jobId } = await ctx.params;
    const id = validateJobId(jobId);

    const job = getJob(id);
    if (!job) return new Response('Job not found', { status: 404 });
    if (job.status !== 'done') return new Response('Job not finished', { status: 409 });

    // Path is built via safeJoin (asserts containment + jobId regex) BEFORE any fs op.
    const candidate = safeJoin(config.paths.outputs, id, 'burned.mp4');

    let lstat;
    try {
      lstat = await fsp.lstat(candidate);
    } catch {
      return new Response('Burn output missing', { status: 404 });
    }
    if (lstat.isSymbolicLink()) return new Response('Forbidden', { status: 403 });

    // Defense in depth: realpath both sides and re-assert containment in case
    // the outputs directory itself is a symlink under our control but the
    // job dir was tampered with.
    const root = await fsp.realpath(path.resolve(config.paths.outputs));
    const src = await fsp.realpath(candidate);
    if (!src.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });

    const stat = await fsp.stat(src);
    if (!stat.isFile()) return new Response('Forbidden', { status: 403 });

    const upload = getUpload(job.uploadId);
    const filename = deriveDownloadName(id, upload?.sourcePath);

    return buildRangeResponse(src, stat.size, req.headers.get('range'), {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=3600',
    });
  } catch (e) {
    if (e instanceof UploadError) return new Response(e.message, { status: e.status });
    const safe = sanitizeError(e, 'Burn output stream failed');
    console.error('[burn-output]', e);
    return new Response(safe.error, { status: safe.code });
  }
}
