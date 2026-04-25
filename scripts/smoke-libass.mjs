#!/usr/bin/env node
/**
 * Phase 1 gate: verify FFmpeg has libass + freetype + can render Arabic glyphs
 * with the bundled Cairo font.
 *
 * Usage: npm run smoke:libass
 *
 * Exits 0 on success, 1 on any failure (with helpful diagnostics).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const FFMPEG = process.env.FFMPEG_PATH || (await findBundled());

async function findBundled() {
  try {
    const m = await import('@ffmpeg-installer/ffmpeg');
    return m.default?.path ?? m.path;
  } catch {
    return 'ffmpeg';
  }
}

async function main() {
  console.log(`[smoke] FFmpeg binary: ${FFMPEG}`);

  const { stdout: version } = await exec(FFMPEG, ['-version']);
  const required = ['enable-libass', 'enable-libfreetype'];
  const missing = required.filter(f => !version.includes(f));
  if (missing.length) {
    console.error(`[smoke] ❌ FFmpeg missing: ${missing.join(', ')}`);
    console.error('[smoke]    Install full FFmpeg and set FFMPEG_PATH in .env');
    console.error('[smoke]    macOS:  brew install ffmpeg');
    console.error('[smoke]    Ubuntu: apt-get install ffmpeg');
    console.error('[smoke]    Win:    choco install ffmpeg');
    process.exit(1);
  }
  console.log('[smoke] ✓ libass + freetype enabled');

  const fontsDir = path.join(ROOT, 'public', 'fonts');
  const cairo = path.join(fontsDir, 'Cairo-Regular.ttf');
  if (!fs.existsSync(cairo)) {
    console.error(`[smoke] ❌ Cairo font not found at ${cairo}`);
    console.error('[smoke]    Run: npm run fonts:download');
    process.exit(1);
  }
  console.log('[smoke] ✓ Cairo font present');

  // Build a tiny test SRT with Arabic + English
  const tmp = fs.mkdtempSync(path.join(ROOT, '.smoke-'));
  try {
    const srt = '1\n00:00:00,000 --> 00:00:02,000\nمرحبا يا عالم — Hello World\n';
    const srtPath = path.join(tmp, 'test.srt');
    fs.writeFileSync(srtPath, '\uFEFF' + srt, 'utf8');

    // Generate a 2-second black background test video with Arabic burned in
    const outPath = path.join(tmp, 'out.mp4');
    const filter = `subtitles='${srtPath.replace(/'/g, "\\'")}':fontsdir='${fontsDir.replace(/'/g, "\\'")}':force_style='FontName=Cairo,FontSize=32,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2'`;
    await exec(FFMPEG, [
      '-f', 'lavfi', '-i', 'color=c=black:s=640x480:d=2',
      '-vf', filter,
      '-y', outPath,
    ]);

    const stats = fs.statSync(outPath);
    if (stats.size < 1000) {
      console.error(`[smoke] ❌ Output too small (${stats.size} bytes) — Arabic glyphs may not have rendered`);
      process.exit(1);
    }
    console.log(`[smoke] ✓ Burned 2-second test video (${stats.size} bytes)`);
    console.log(`[smoke] ✓ All checks passed. Inspect ${outPath} to eyeball Arabic glyph rendering.`);
  } finally {
    // Keep the output file for visual inspection
    console.log(`[smoke]   Test artifacts kept in ${tmp}`);
  }
}

main().catch(err => {
  console.error('[smoke] ❌ Failed:', err.message);
  process.exit(1);
});
