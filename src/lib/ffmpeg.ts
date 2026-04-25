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

/** Read ffmpeg -version and check for libass + freetype. Throws with helpful guidance. */
export async function verifyFfmpegCapabilities(): Promise<void> {
  const { stdout } = await execFileAsync(FFMPEG_BIN, ['-version']);
  const required = ['enable-libass', 'enable-libfreetype'];
  const missing = required.filter(flag => !stdout.includes(flag));
  if (missing.length > 0) {
    throw new Error(
      `FFmpeg at ${FFMPEG_BIN} is missing required features: ${missing.join(', ')}. ` +
      `Arabic subtitle rendering will not work. ` +
      `Install a full FFmpeg (brew install ffmpeg / choco install ffmpeg / apt-get install ffmpeg) ` +
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
const ALLOWED_FONTS = ['Cairo', 'Tajawal', 'IBM Plex Sans Arabic', 'Arial'] as const;
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

function escapeForLibass(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildForceStyle(style: BurnStyle): string {
  const parts: string[] = [];

  if (style.font) {
    if (!ALLOWED_FONTS.includes(style.font)) throw new Error(`Font not allowed: ${style.font}`);
    parts.push(`FontName=${style.font}`);
  }
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
