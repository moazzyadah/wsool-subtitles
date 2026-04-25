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
 * Recursively redact known-sensitive keys in JSON-shaped values.
 * Handles arbitrary nesting so a stringified provider error body that
 * embeds `{ headers: { authorization: '...' } }` is scrubbed before any
 * stringification.
 */
const SENSITIVE_KEY_PATTERN = /(authorization|api[_-]?key|access[_-]?token|secret|bearer|password|x-api-key)/i;

function redactValue(v: unknown, depth = 0): unknown {
  if (depth > 6) return '[…]';
  if (Array.isArray(v)) return v.map(item => redactValue(item, depth + 1));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '[REDACTED]' : redactValue(val, depth + 1);
    }
    return out;
  }
  if (typeof v === 'string') return redactString(v);
  return v;
}

function redactString(s: string): string {
  let out = s;
  // Long opaque tokens — covers common provider key prefixes plus a generic
  // long-base64/hex catch-all.
  out = out.replace(
    /\b(sk-[a-zA-Z0-9_-]{20,}|gsk_[a-zA-Z0-9_-]{20,}|r8_[a-zA-Z0-9_-]{20,}|hf_[a-zA-Z0-9_-]{20,}|xi-[a-zA-Z0-9_-]{20,}|[A-Za-z0-9+/]{40,}|[a-f0-9]{32,})\b/g,
    '[REDACTED]'
  );
  // Bearer X.Y.Z JWT-style
  out = out.replace(/Bearer\s+[A-Za-z0-9\-._~+/=]+/gi, 'Bearer [REDACTED]');
  // URLs (often include query-string tokens)
  out = out.replace(/https?:\/\/\S+/g, '[URL]');
  return out;
}

/**
 * Sanitize an arbitrary error into a safe shape for the client.
 * Stack traces are dropped, body snippets are recursively redacted, and the
 * final string is length-capped so a giant provider response can't pollute
 * either the client or our logs.
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

  // If the message embeds JSON, parse + recursively redact before re-stringifying.
  const trimmed = message.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      message = JSON.stringify(redactValue(JSON.parse(trimmed)));
    } catch {
      message = redactString(message);
    }
  } else {
    message = redactString(message);
  }

  if (message.length > 500) message = message.slice(0, 497) + '...';

  return { error: message, code };
}
