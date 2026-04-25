import 'server-only';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

const execFileAsync = promisify(execFile);

/** Resolved ffmpeg binary path. Prefer FFMPEG_PATH override, fall back to bundled. */
export const FFMPEG_BIN = config.ffmpegPath || ffmpegInstaller.path;
ffmpeg.setFfmpegPath(FFMPEG_BIN);

/** Hard cap to prevent runaway transcoding. 2 hours of input. */
const MAX_INPUT_SECONDS = 7200;

/** Read ffmpeg -version and check for libass + freetype + fribidi + harfbuzz. */
export async function verifyFfmpegCapabilities(): Promise<void> {
  const { stdout } = await execFileAsync(FFMPEG_BIN, ['-version']);
  const required = ['enable-libass', 'enable-libfreetype', 'enable-libfribidi', 'enable-libharfbuzz'];
  const missing = required.filter(flag => !stdout.includes(flag));
  if (missing.length > 0) {
    throw new Error(
      `FFmpeg at ${FFMPEG_BIN} is missing required features: ${missing.join(', ')}. ` +
      `Arabic subtitle shaping will not work without libharfbuzz (letters won't join). ` +
      `Install a harfbuzz-enabled build: download from https://github.com/BtbN/FFmpeg-Builds/releases/latest ` +
      `and set FFMPEG_PATH in .env to its absolute path.`
    );
  }
}

/**
 * Extract audio from any input file as 16kHz mono FLAC.
 * Uses fluent-ffmpeg's safe arg array — never a shell string.
 */
export async function extractAudioToFlac(inputPath: string, outputPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .inputOption('-t', String(MAX_INPUT_SECONDS))
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('flac')
      .format('flac')
      .output(outputPath);

    const killer = setTimeout(() => {
      cmd.kill('SIGKILL');
      reject(new Error('FFmpeg extraction timed out (>30 minutes)'));
    }, 30 * 60 * 1000);

    cmd
      .on('end', () => { clearTimeout(killer); resolve(); })
      .on('error', err => { clearTimeout(killer); reject(err); })
      .run();
  });
}

/** Get duration in seconds via ffprobe. */
export async function getDurationSec(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, data) => {
      if (err) return reject(err);
      const dur = data?.format?.duration;
      if (typeof dur !== 'number' || !Number.isFinite(dur)) {
        return reject(new Error('Could not determine duration'));
      }
      resolve(dur);
    });
  });
}

/** Whitelist of fonts available in public/fonts (kept in sync with download script). */
const ALLOWED_FONTS = ['Amiri', 'IBM Plex Sans Arabic', 'Cairo', 'Tajawal', 'Arial'] as const;
type AllowedFont = (typeof ALLOWED_FONTS)[number];

export interface BurnStyle {
  font?: AllowedFont;
  fontSize?: number;        // 8..96
  primaryColor?: string;    // libass &HBBGGRR or &HAABBGGRR
  outlineColor?: string;
  outline?: number;         // 0..4
  position?: 'top' | 'bottom' | 'middle';
}

const COLOR_PATTERN = /^&H[0-9A-Fa-f]{6,8}$/;

/**
 * Escape a value for use inside the FFmpeg filtergraph `subtitles=` argument.
 *
 * Two layers of escaping happen because FFmpeg parses the filter string twice:
 *   1. Filter-graph level: `\` escapes special chars `: , [ ] ; \ '`.
 *   2. The libass `subtitles` filter additionally treats `:` as the option
 *      separator, so a Windows path like `C:\videos\in.srt` would otherwise
 *      be parsed as filter options. We escape `:` as `\:` here to keep the
 *      whole path together as one option value.
 */
function escapeForLibass(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/]/g, '\\]')
    .replace(/;/g, '\\;');
}

function buildForceStyle(style: BurnStyle): string {
  const parts: string[] = [];

  // Default to Amiri — best Arabic shaping with libass+harfbuzz on the bundled set.
  const font: AllowedFont = style.font ?? 'Amiri';
  if (!ALLOWED_FONTS.includes(font)) throw new Error(`Font not allowed: ${font}`);
  parts.push(`FontName=${font}`);
  if (style.fontSize !== undefined) {
    if (!Number.isInteger(style.fontSize) || style.fontSize < 8 || style.fontSize > 96) {
      throw new Error('fontSize must be integer 8..96');
    }
    parts.push(`FontSize=${style.fontSize}`);
  }
  if (style.primaryColor) {
    if (!COLOR_PATTERN.test(style.primaryColor)) throw new Error('Invalid primaryColor');
    parts.push(`PrimaryColour=${style.primaryColor}`);
  }
  if (style.outlineColor) {
    if (!COLOR_PATTERN.test(style.outlineColor)) throw new Error('Invalid outlineColor');
    parts.push(`OutlineColour=${style.outlineColor}`);
  }
  if (style.outline !== undefined) {
    if (!Number.isInteger(style.outline) || style.outline < 0 || style.outline > 4) {
      throw new Error('outline must be integer 0..4');
    }
    parts.push(`Outline=${style.outline}`);
  }
  if (style.position) {
    const al = { top: 8, middle: 5, bottom: 2 }[style.position];
    parts.push(`Alignment=${al}`);
  }

  return parts.join(',');
}

/**
 * Burn subtitles into video. All inputs are validated/whitelisted before being
 * composed into the libass `subtitles` filter argument.
 */
export async function burnSubtitles(
  videoPath: string,
  srtPath: string,
  outputPath: string,
  style: BurnStyle = {}
): Promise<void> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const forceStyle = buildForceStyle(style);
  const fontsDir = config.paths.fonts;
  const subPathEsc = escapeForLibass(srtPath);
  const fontsDirEsc = escapeForLibass(fontsDir);

  let filter = `subtitles='${subPathEsc}':fontsdir='${fontsDirEsc}'`;
  if (forceStyle) filter += `:force_style='${forceStyle}'`;

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg(videoPath)
      .inputOption('-t', String(MAX_INPUT_SECONDS))
      .videoFilters(filter)
      .outputOption('-c:a', 'copy')
      .output(outputPath);

    const killer = setTimeout(() => {
      cmd.kill('SIGKILL');
      reject(new Error('FFmpeg burn timed out (>30 minutes)'));
    }, 30 * 60 * 1000);

    cmd
      .on('end', () => { clearTimeout(killer); resolve(); })
      .on('error', err => { clearTimeout(killer); reject(err); })
      .run();
  });
}
