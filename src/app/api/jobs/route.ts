import { NextResponse } from 'next/server';
import { listRecentJobs } from '@/lib/jobs';
import { sanitizeError } from '@/lib/config';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const jobs = listRecentJobs(50).map(j => ({
      id: j.id,
      status: j.status,
      requestedProvider: j.requestedProvider,
      actualProvider: j.actualProvider,
      model: j.model,
      language: j.language,
      task: j.task,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
      durationSec: j.result?.durationSec,
      wordCount: j.result?.words.length,
      error: j.error,
    }));
    return NextResponse.json({ jobs });
  } catch (e) {
    const safe = sanitizeError(e, 'Failed to list jobs');
    return NextResponse.json({ error: safe.error }, { status: safe.code });
  }
}
