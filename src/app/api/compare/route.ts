import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { z } from 'zod';
import { newJobId, validateJobId, UploadError } from '@/lib/upload';
import { createJob } from '@/lib/jobs';
import { isProviderEnabled, PROVIDERS } from '@/lib/providers/registry';
import { sanitizeError } from '@/lib/config';

export const runtime = 'nodejs';

const SelectionSchema = z.object({
  providerId: z.string(),
  model: z.string().min(1).max(200),
  language: z.string().min(2).max(10).default('auto'),
  task: z.enum(['transcribe', 'translate']).default('transcribe'),
});

const Schema = z.object({
  uploadId: z.string(),
  audioPath: z.string(),
  audioHash: z.string().regex(/^[a-f0-9]{64}$/),
  selections: z.array(SelectionSchema).min(2).max(5),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = Schema.parse(await req.json());
    validateJobId(body.uploadId);

    if (!fs.existsSync(body.audioPath)) {
      return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
    }

    const jobs: Array<{ jobId: string; providerId: string; model: string; language: string }> = [];

    for (const sel of body.selections) {
      if (!isProviderEnabled(sel.providerId)) {
        return NextResponse.json(
          { error: `Provider ${sel.providerId} not enabled` },
          { status: 400 }
        );
      }
      const meta = PROVIDERS.find(p => p.id === sel.providerId);
      if (!meta || !meta.models.find(m => m.id === sel.model)) {
        return NextResponse.json(
          { error: `Model ${sel.model} not in catalog for ${sel.providerId}` },
          { status: 400 }
        );
      }

      const childId = newJobId();
      createJob({
        id: childId,
        kind: 'compare',
        requestedProvider: sel.providerId,
        model: sel.model,
        language: sel.language,
        task: sel.task,
        audioPath: body.audioPath,
        audioHash: body.audioHash,
      });
      jobs.push({
        jobId: childId,
        providerId: sel.providerId,
        model: sel.model,
        language: sel.language,
      });
    }

    return NextResponse.json({ jobs });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request', issues: e.issues }, { status: 400 });
    const safe = sanitizeError(e, 'Compare failed');
    console.error('[compare]', e);
    return NextResponse.json({ error: safe.error }, { status: safe.code });
  }
}
