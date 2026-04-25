import 'server-only';
import 'dotenv/config';
import path from 'node:path';

/**
 * Server-only config reader. The `import 'server-only'` at the top makes
 * Next.js throw a build error if any client component imports this module —
 * preventing accidental key leakage via NEXT_PUBLIC_* mistakes.
 */

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(key: string, fallback = false): boolean {
  const v = process.env[key]?.toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return fallback;
}

const ROOT = path.resolve(process.cwd());

export const config = {
  // Provider keys — empty string means "disabled"
  keys: {
    groq: process.env.GROQ_API_KEY ?? '',
    openai: process.env.OPENAI_API_KEY ?? '',
    together: process.env.TOGETHER_API_KEY ?? '',
    fireworks: process.env.FIREWORKS_API_KEY ?? '',
    fal: process.env.FAL_KEY ?? '',
    replicate: process.env.REPLICATE_API_TOKEN ?? '',
    huggingface: process.env.HF_TOKEN ?? '',
    deepgram: process.env.DEEPGRAM_API_KEY ?? '',
    speechmatics: process.env.SPEECHMATICS_API_KEY ?? '',
    soniox: process.env.SONIOX_API_KEY ?? '',
    assemblyai: process.env.ASSEMBLYAI_API_KEY ?? '',
    elevenlabs: process.env.ELEVENLABS_API_KEY ?? '',
    gemini: process.env.GEMINI_API_KEY ?? '',
  },

  // Safety limits
  maxUploadBytes: num('MAX_UPLOAD_MB', 2048) * 1024 * 1024,
  maxDurationSec: num('MAX_DURATION_SEC', 10800),
  jobsRetentionDays: num('JOBS_RETENTION_DAYS', 7),
  allowLan: bool('ALLOW_LAN', false),

  // FFmpeg
  ffmpegPath: process.env.FFMPEG_PATH ?? '',

  // Local Whisper
  localModelsDir: process.env.LOCAL_WHISPER_MODELS_DIR
    ? path.resolve(process.env.LOCAL_WHISPER_MODELS_DIR)
    : path.join(ROOT, 'models'),

  // Filesystem roots — all derived once, never trust client paths
  paths: {
    root: ROOT,
    uploads: path.join(ROOT, 'uploads'),
    outputs: path.join(ROOT, 'outputs'),
    data: path.join(ROOT, 'data'),
    fonts: path.join(ROOT, 'public', 'fonts'),
  },
} as const;

/**
 * Returns the set of provider IDs that have a non-empty API key.
 * `local` is always available (no key needed).
 */
export function enabledProviderIds(): string[] {
  const enabled: string[] = ['local'];
  for (const [id, key] of Object.entries(config.keys)) {
    if (key) enabled.push(id);
  }
  return enabled;
}

/**
 * Sanitize an arbitrary error into a safe shape for the client.
 * Strips stack traces, request bodies, headers (which often contain keys),
 * and any string that looks like an API key.
 */
export function sanitizeError(e: unknown, defaultMessage = 'Internal error'): {
  error: string;
  code: number;
} {
  let message = defaultMessage;
  let code = 500;

  if (e instanceof Error) {
    message = e.message;
    const status = (e as { status?: number; statusCode?: number }).status
      ?? (e as { status?: number; statusCode?: number }).statusCode;
    if (typeof status === 'number') code = status;
  } else if (typeof e === 'string') {
    message = e;
  }

  // Redact anything that looks like a key (long opaque tokens)
  const KEY_PATTERN = /\b(sk-[a-zA-Z0-9_-]{20,}|gsk_[a-zA-Z0-9_-]{20,}|r8_[a-zA-Z0-9_-]{20,}|hf_[a-zA-Z0-9_-]{20,}|[a-f0-9]{32,})\b/g;
  message = message.replace(KEY_PATTERN, '[REDACTED]');

  // Redact URLs (often include query-string tokens)
  message = message.replace(/https?:\/\/\S+/g, '[URL]');

  // Cap length so a giant provider response doesn't pollute the client
  if (message.length > 500) message = message.slice(0, 497) + '...';

  return { error: message, code };
}
