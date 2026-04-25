import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

export interface BundledFont {
  /** PostScript-ish family name as referenced by libass force_style FontName= */
  family: string;
  /** Web font-family value; usually `"Family"` plus generic fallback. */
  webFamily: string;
  /** Filename inside `public/fonts/`. */
  file: string;
  /** True if this font is known to render Arabic well via libass+harfbuzz. */
  arabicReady: boolean;
  /** True if this font is also exposed to the live web overlay via @font-face. */
  exposeToWeb: boolean;
  /** Whether the user uploaded it (vs. shipped with the repo). */
  userUploaded: boolean;
}

const BUILTIN_FONTS: BundledFont[] = [
  { family: 'Amiri',                file: 'Amiri-Regular.ttf',             webFamily: '"Amiri", serif',                       arabicReady: true,  exposeToWeb: true, userUploaded: false },
  { family: 'Amiri Bold',           file: 'Amiri-Bold.ttf',                webFamily: '"Amiri", serif',                       arabicReady: true,  exposeToWeb: false, userUploaded: false },
  { family: 'IBM Plex Sans Arabic', file: 'IBMPlexSansArabic-Regular.ttf', webFamily: '"IBM Plex Sans Arabic", sans-serif',  arabicReady: true,  exposeToWeb: true, userUploaded: false },
  { family: 'Tajawal',              file: 'Tajawal-Regular.ttf',           webFamily: '"Tajawal", sans-serif',                arabicReady: false, exposeToWeb: true, userUploaded: false },
  { family: 'Cairo',                file: 'Cairo-Regular.ttf',             webFamily: '"Cairo", sans-serif',                  arabicReady: false, exposeToWeb: true, userUploaded: false },
];

function userFontsDir(): string {
  return path.join(config.paths.fonts, 'user');
}

/** List user-uploaded fonts under public/fonts/user/. */
function listUserFonts(): BundledFont[] {
  const dir = userFontsDir();
  if (!fs.existsSync(dir)) return [];
  const out: BundledFont[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!/\.(ttf|otf)$/i.test(name)) continue;
    const family = name.replace(/\.(ttf|otf)$/i, '').replace(/[-_]+/g, ' ');
    out.push({
      family,
      webFamily: `"${family}", sans-serif`,
      file: `user/${name}`,
      arabicReady: false,           // unverified; UI should show a warning badge
      exposeToWeb: true,
      userUploaded: true,
    });
  }
  return out;
}

export function listAvailableFonts(): BundledFont[] {
  const builtin = BUILTIN_FONTS.filter(f => fs.existsSync(path.join(config.paths.fonts, f.file)));
  return [...builtin, ...listUserFonts()];
}

/** Filename basename validation for user uploads. Rejects path traversal. */
const FONT_FILENAME = /^[A-Za-z0-9 _.\-()]+\.(ttf|otf)$/i;

export function validateFontFilename(name: string): string {
  if (!FONT_FILENAME.test(name)) throw new Error('Invalid font filename');
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new Error('Invalid font filename');
  }
  return name;
}

export function userFontsRoot(): string {
  return userFontsDir();
}
