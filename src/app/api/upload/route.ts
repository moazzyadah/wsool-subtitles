import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import {
  newJobId,
  ensureJobDirs,
  streamToFile,
  sniffAndRename,
  hashPathStreaming,
  UploadError,
} from '@/lib/upload';
import { extractAudioToFlac, getDurationSec } from '@/lib/ffmpeg';
import { createUpload } from '@/lib/uploads';
import { config, sanitizeError } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    if (!req.body) {
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }

    const uploadId = newJobId();
    const { uploadDir } = ensureJobDirs(uploadId);
    const rawPath = path.join(uploadDir, 'source.bin');

    await streamToFile(req.body, rawPath, config.maxUploadBytes);
    const sniffed = await sniffAndRename(rawPath);

    let durationSec: number;
    try {
      durationSec = await getDurationSec(sniffed.finalPath);
    } catch {
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

    const audioPath = path.join(uploadDir, 'audio.flac');
    await extractAudioToFlac(sniffed.finalPath, audioPath);

    const audioHash = await hashPathStreaming(audioPath);

    createUpload({
      id: uploadId,
      audioPath,
      audioHash,
      sourcePath: sniffed.finalPath,
      sourceMime: sniffed.mime,
      durationSec,
    });

    // Only safe, opaque identifiers leave the server.
    return NextResponse.json({
      uploadId,
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
