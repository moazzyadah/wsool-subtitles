#!/usr/bin/env node
/**
 * Download Arabic-friendly fonts for libass burn-in.
 * Sources: Google Fonts (Open Font License).
 *
 * Usage: npm run fonts:download
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FONTS_DIR = path.join(ROOT, 'public', 'fonts');

const FONTS = [
  {
    file: 'Cairo-Regular.ttf',
    url: 'https://github.com/google/fonts/raw/main/ofl/cairo/Cairo%5Bslnt%2Cwght%5D.ttf',
  },
  {
    file: 'Tajawal-Regular.ttf',
    url: 'https://github.com/google/fonts/raw/main/ofl/tajawal/Tajawal-Regular.ttf',
  },
  {
    file: 'IBMPlexSansArabic-Regular.ttf',
    url: 'https://github.com/google/fonts/raw/main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Regular.ttf',
  },
];

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
}

async function main() {
  fs.mkdirSync(FONTS_DIR, { recursive: true });
  for (const font of FONTS) {
    const dest = path.join(FONTS_DIR, font.file);
    if (fs.existsSync(dest)) {
      console.log(`✓ ${font.file} already present`);
      continue;
    }
    console.log(`↓ Downloading ${font.file}…`);
    await download(font.url, dest);
    console.log(`  saved to ${dest}`);
  }
  console.log('Done.');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
