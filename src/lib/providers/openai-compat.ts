import 'server-only';
import type { TranscribeInput, TranscribeOutcome, TranscriptionResult, Word } from '@/types/provider';
import { ensureOk, failed } from './base';

/**
 * Shared transport for OpenAI-compatible audio transcription endpoints.
 * Used by openai, together, fireworks. Groq has its own file because it
 * was the first one wired and its quirks are slightly different.
 *
 * Endpoint contract: POST multipart/form-data with file + model, returns
 * verbose_json with segments (and optionally words).
 */

interface OpenAiVerboseResponse {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string; avg_logprob?: number }>;
  words?: Array<{ word: string; start: number; end: number }>;
}

export interface OpenAiCompatOptions {
  providerId: string;
  providerName: string;
  url: string;
  apiKey: string;
  /** Some providers (OpenAI itself) don't support timestamp_granularities for non-whisper models. */
  supportsWordTimestamps?: boolean;
  /** Some providers (OpenAI's gpt-4o models) only return text, not segments. */
  supportsVerboseJson?: boolean;
}

function logprobToConfidence(lp?: number): number | undefined {
  if (lp === undefined) return undefined;
  return Math.max(0, Math.min(1, Math.exp(lp)));
}

export async function callOpenAiCompat(
  input: TranscribeInput,
  opts: OpenAiCompatOptions
): Promise<TranscribeOutcome> {
  if (!opts.apiKey) return failed(401, `${opts.providerName} API key not set`);

  const form = new FormData();
  const blob = new Blob([new Uint8Array(input.audio)], { type: `audio/${input.audioFormat}` });
  form.append('file', blob, `audio.${input.audioFormat}`);
  form.append('model', input.model);

  const verbose = opts.supportsVerboseJson !== false;
  form.append('response_format', verbose ? 'verbose_json' : 'json');

  if (verbose && opts.supportsWordTimestamps !== false && input.wordTimestamps) {
    form.append('timestamp_granularities[]', 'word');
    form.append('timestamp_granularities[]', 'segment');
  }
  if (input.language && input.language !== 'auto') form.append('language', input.language);
  if (input.prompt) form.append('prompt', input.prompt);

  // OpenAI exposes a separate /translations endpoint; here we treat task=translate
  // as caller's responsibility (they switch the URL). For Together/Fireworks the
  // transcription endpoint accepts task=translate.
  if (input.task === 'translate') form.append('task', 'translate');

  const res = await fetch(opts.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}` },
    body: form,
  });
  await ensureOk(res, opts.providerName);

  const json = (await res.json()) as OpenAiVerboseResponse;

  const words: Word[] = (json.words ?? []).map(w => ({
    text: w.word,
    start: w.start,
    end: w.end,
  }));
  const segments = (json.segments ?? []).map(s => ({
    text: s.text.trim(),
    start: s.start,
    end: s.end,
    confidence: logprobToConfidence(s.avg_logprob),
  }));

  const result: TranscriptionResult = {
    text: json.text,
    language: json.language ?? input.language ?? 'auto',
    durationSec: json.duration ?? 0,
    words,
    segments,
    actualProvider: opts.providerId,
    raw: json,
  };
  return { kind: 'done', result };
}

export function wrapOpenAiCompat(
  optsFn: (input: TranscribeInput) => OpenAiCompatOptions
): (input: TranscribeInput) => Promise<TranscribeOutcome> {
  return async (input: TranscribeInput) => {
    try {
      return await callOpenAiCompat(input, optsFn(input));
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? 'Provider error';
      return failed(status, msg);
    }
  };
}
