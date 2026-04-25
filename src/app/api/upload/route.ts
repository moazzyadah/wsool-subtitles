import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { newJobId, ensureJobDirs, streamToFile, sniffAndRename, UploadError } from '@/lib/upload';
import { extractAudioToFlac, getDurationSec } from '@/lib/ffmpeg';
import { hashFile } from '@/lib/cache';
import { config, sanitizeError } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    if (!req.body) {
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }

    const jobId = newJobId();
    const { uploadDir } = ensureJobDirs(jobId);
    const rawPath = path.join(uploadDir, 'source.bin');

    await streamToFile(req.body, rawPath, config.maxUploadBytes);
    const sniffed = await sniffAndRename(rawPath);

    // Confirm ffprobe can read it; reject if not (pure binary garbage will fail here)
    let durationSec: number;
    try {
      durationSec = await getDurationSec(sniffed.finalPath);
    } catch (e) {
      try { fs.unlinkSync(sniffed.finalPath); } catch { /* ignore */ }
      return NextResponse.json({ error: 'Could not parse media file' }, { status: 415 });
    }

    if (durationSec > config.maxDurationSec) {
      try { fs.unlinkSync(sniffed.finalPath); } catch { /* ignore */ }
      return NextResponse.json(
        { error: `File too long: ${Math.round(durationSec)}s exceeds limit of ${config.maxDurationSec}s` },
        { status: 413 }
      );
    }

    // Extract canonical 16kHz mono FLAC for any provider
    const audioPath = path.join(uploadDir, 'audio.flac');
    await extractAudioToFlac(sniffed.finalPath, audioPath);

    const audio = fs.readFileSync(audioPath);
    const audioHash = hashFile(audio);

    return NextResponse.json({
      jobId,
      sourcePath: sniffed.finalPath,
      audioPath,
      audioHash,
      durationSec,
      sourceMime: sniffed.mime,
    });
  } catch (e) {
    if (e instanceof UploadError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const safe = sanitizeError(e, 'Upload failed');
    console.error('[upload]', e);
    return NextResponse.json({ error: safe.error }, { status: safe.code });
  }
}
