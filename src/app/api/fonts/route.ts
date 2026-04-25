import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { listAvailableFonts, validateFontFilename, userFontsRoot } from '@/lib/fonts';
import { sanitizeError } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_FONT_BYTES = 5 * 1024 * 1024; // 5 MB

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ fonts: listAvailableFonts() });
  } catch (e) {
    const safe = sanitizeError(e, 'Failed to list fonts');
    console.error('[fonts:list]', e);
    return NextResponse.json({ error: safe.error }, { status: safe.code });
  }
}

/**
 * Upload a TTF/OTF. Body shape:
 *   multipart/form-data with field `file`
 * Saves under `public/fonts/user/`. Localhost-only by virtue of the existing
 * dev-server bind address; the listed fonts only become usable for libass
 * burn after the server picks them up on next request.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file field' }, { status: 400 });
    }

    if (file.size > MAX_FONT_BYTES) {
      return NextResponse.json(
        { error: `Font exceeds ${MAX_FONT_BYTES / 1024 / 1024}MB limit` },
        { status: 413 }
      );
    }

    const filename = validateFontFilename(file.name);

    const buf = Buffer.from(await file.arrayBuffer());
    const detected = await fileTypeFromBuffer(buf);
    const ok =
      detected?.mime === 'font/ttf' ||
      detected?.mime === 'font/otf' ||
      detected?.mime === 'application/font-sfnt' ||
      detected?.ext === 'ttf' ||
      detected?.ext === 'otf';
    if (!ok) {
      return NextResponse.json(
        { error: `Not a valid TTF/OTF (detected ${detected?.mime ?? 'unknown'})` },
        { status: 415 }
      );
    }

    const dir = userFontsRoot();
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    const dest = path.join(dir, filename);
    fs.writeFileSync(dest, buf, { mode: 0o644 });

    const family = filename.replace(/\.(ttf|otf)$/i, '').replace(/[-_]+/g, ' ');
    return NextResponse.json({ ok: true, family, file: `user/${filename}` });
  } catch (e) {
    const safe = sanitizeError(e, 'Failed to upload font');
    console.error('[fonts:upload]', e);
    return NextResponse.json({ error: safe.error }, { status: safe.code });
  }
}
