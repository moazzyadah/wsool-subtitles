import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/jobs';
import { validateJobId, UploadError } from '@/lib/upload';
import { groupWordsIntoSegments, segmentsToSrt, segmentsToVtt } from '@/lib/srt';

export const runtime = 'nodejs';

interface Ctx { params: { jobId: string } }

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const id = validateJobId(ctx.params.jobId);
    const job = getJob(id);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const url = new URL(req.url);
    const format = url.searchParams.get('format');

    if (format && job.status !== 'done') {
      return NextResponse.json({ error: 'Job not finished yet' }, { status: 409 });
    }

    if (format === 'srt' || format === 'vtt') {
      const result = job.result!;
      const segments = result.segments.length
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

    // JSON status
    return NextResponse.json({
      id: job.id,
      status: job.status,
      requestedProvider: job.requestedProvider,
      actualProvider: job.actualProvider,
      model: job.model,
      language: job.language,
      task: job.task,
      result: job.result,
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
