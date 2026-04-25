import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { validateJobId, safeJoin, UploadError } from '@/lib/upload';
import { getJob } from '@/lib/jobs';
import { burnSubtitles, type BurnStyle } from '@/lib/ffmpeg';
import { groupWordsIntoSegments, segmentsToSrt } from '@/lib/srt';
import { config, sanitizeError } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 300;

const StyleSchema = z.object({
  font: z.enum(['Cairo', 'Tajawal', 'IBM Plex Sans Arabic', 'Arial']).optional(),
  fontSize: z.number().int().min(8).max(96).optional(),
  primaryColor: z.string().regex(/^&H[0-9A-Fa-f]{6,8}$/).optional(),
  outlineColor: z.string().regex(/^&H[0-9A-Fa-f]{6,8}$/).optional(),
  outline: z.number().int().min(0).max(4).optional(),
  position: z.enum(['top', 'middle', 'bottom']).optional(),
}).optional();

const Schema = z.object({
  jobId: z.string(),
  sourcePath: z.string(),
  style: StyleSchema,
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = Schema.parse(await req.json());
    const id = validateJobId(body.jobId);

    const job = getJob(id);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (job.status !== 'done' || !job.result) {
      return NextResponse.json({ error: 'Transcription not complete' }, { status: 409 });
    }

    if (!fs.existsSync(body.sourcePath)) {
      return NextResponse.json({ error: 'Source video not found' }, { status: 404 });
    }
    // sourcePath must live under uploads/{jobId}/
    const expectedRoot = safeJoin(config.paths.uploads, id);
    const resolvedSrc = path.resolve(body.sourcePath);
    if (!resolvedSrc.startsWith(expectedRoot + path.sep)) {
      return NextResponse.json({ error: 'sourcePath outside upload dir' }, { status: 400 });
    }

    const outputDir = safeJoin(config.paths.outputs, id);
    fs.mkdirSync(outputDir, { recursive: true });

    const segments = job.result.segments.length
      ? job.result.segments
      : groupWordsIntoSegments(job.result.words);
    const srtPath = path.join(outputDir, 'subtitle.srt');
    // BOM helps Windows-based players render UTF-8 correctly
    fs.writeFileSync(srtPath, '\uFEFF' + segmentsToSrt(segments), 'utf8');

    const outPath = path.join(outputDir, 'burned.mp4');
    await burnSubtitles(body.sourcePath, srtPath, outPath, (body.style ?? {}) as BurnStyle);

    return NextResponse.json({ outputPath: outPath, srtPath });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request', issues: e.issues }, { status: 400 });
    const safe = sanitizeError(e, 'Burn failed');
    console.error('[burn]', e);
    return NextResponse.json({ error: safe.error }, { status: safe.code });
  }
}
