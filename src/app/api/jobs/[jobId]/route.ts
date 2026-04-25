import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getJob, setEditedSegments } from '@/lib/jobs';
import { validateJobId, UploadError } from '@/lib/upload';
import { groupWordsIntoSegments, segmentsToSrt, segmentsToVtt } from '@/lib/srt';
import { sanitizeError } from '@/lib/config';
import type { TranscriptionResult } from '@/types/provider';

export const runtime = 'nodejs';

interface Ctx { params: Promise<{ jobId: string }> }

/** Strip raw debug payload before sending the result to the client. */
function safeResult(r: TranscriptionResult | undefined): Omit<TranscriptionResult, 'raw'> | undefined {
  if (!r) return undefined;
  const { raw: _omit, ...rest } = r;
  void _omit;
  return rest;
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { jobId } = await ctx.params;
    const id = validateJobId(jobId);
    const job = getJob(id);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const url = new URL(req.url);
    const format = url.searchParams.get('format');

    if (format && job.status !== 'done') {
      return NextResponse.json({ error: 'Job not finished yet' }, { status: 409 });
    }

    if (format === 'srt' || format === 'vtt') {
      const result = job.result!;
      // Prefer user-edited segments when present; fall back to provider segments,
      // and finally to grouping raw words.
      const segments = job.editedSegments?.length
        ? job.editedSegments
        : result.segments.length
          ? result.segments
          : groupWordsIntoSegments(result.words);
      const body = format === 'srt' ? segmentsToSrt(segments) : segmentsToVtt(segments);
      const mime = format === 'srt' ? 'application/x-subrip' : 'text/vtt';
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': `${mime}; charset=utf-8`,
          'Content-Disposition': `attachment; filename="${id}.${format}"`,
        },
      });
    }

    return NextResponse.json({
      id: job.id,
      uploadId: job.uploadId,
      status: job.status,
      requestedProvider: job.requestedProvider,
      actualProvider: job.actualProvider,
      model: job.model,
      language: job.language,
      task: job.task,
      result: safeResult(job.result),
      editedSegments: job.editedSegments,
      error: job.error,
      fellBack: Boolean(
        job.actualProvider && job.fallbackChain && job.actualProvider !== job.fallbackChain[0]
      ),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch (e) {
    if (e instanceof UploadError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

const PatchSchema = z.object({
  segments: z.array(
    z.object({
      start: z.number().min(0),
      end: z.number().min(0),
      text: z.string().max(2000),
    }).refine((s) => s.start <= s.end, {
      message: 'segment start must be <= end',
    })
  ).min(1).max(5000),
});

/** Persist user-edited segments. Export/burn read these on subsequent requests. */
export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { jobId } = await ctx.params;
    const id = validateJobId(jobId);
    const body = PatchSchema.parse(await req.json());
    const ok = setEditedSegments(id, body.segments);
    if (!ok) return NextResponse.json({ error: 'Job not editable' }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request', issues: e.issues }, { status: 400 });
    const safe = sanitizeError(e, 'Edit failed');
    return NextResponse.json({ error: safe.error }, { status: safe.code });
  }
}
