import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { newJobId, validateJobId } from '@/lib/upload';
import { createJob } from '@/lib/jobs';
import { getUpload } from '@/lib/uploads';
import { isProviderEnabled, PROVIDERS } from '@/lib/providers/registry';
import { sanitizeError } from '@/lib/config';

export const runtime = 'nodejs';

const Schema = z.object({
  uploadId: z.string(),
  providerId: z.string(),
  model: z.string().min(1).max(200),
  language: z.string().min(2).max(10).default('auto'),
  task: z.enum(['transcribe', 'translate']).default('transcribe'),
  fallbackChain: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = Schema.parse(await req.json());
    validateJobId(body.uploadId);

    const upload = getUpload(body.uploadId);
    if (!upload) {
      return NextResponse.json({ error: 'Unknown uploadId' }, { status: 404 });
    }

    if (!isProviderEnabled(body.providerId)) {
      return NextResponse.json({ error: `Provider ${body.providerId} is not enabled` }, { status: 400 });
    }

    const meta = PROVIDERS.find(p => p.id === body.providerId);
    if (!meta) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
    if (!meta.models.find(m => m.id === body.model)) {
      return NextResponse.json({ error: `Model ${body.model} not in catalog for ${body.providerId}` }, { status: 400 });
    }

    const jobId = newJobId();
    const job = createJob({
      id: jobId,
      uploadId: body.uploadId,
      kind: 'transcribe',
      requestedProvider: body.providerId,
      model: body.model,
      language: body.language,
      task: body.task,
      fallbackChain: body.fallbackChain,
    });

    return NextResponse.json({ jobId: job.id, status: job.status });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', issues: e.issues }, { status: 400 });
    }
    const safe = sanitizeError(e, 'Failed to enqueue job');
    console.error('[transcribe]', e);
    return NextResponse.json({ error: safe.error }, { status: safe.code });
  }
}
