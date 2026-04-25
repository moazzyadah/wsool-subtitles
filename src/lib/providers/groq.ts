import 'server-only';
import type { STTProvider, TranscribeInput, TranscribeOutcome, TranscriptionResult, Word } from '@/types/provider';
import { config } from '../config';
import { ensureOk, failed } from './base';

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

interface GroqVerboseResponse {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string; avg_logprob?: number }>;
  words?: Array<{ word: string; start: number; end: number }>;
}

function logprobToConfidence(lp?: number): number | undefined {
  if (lp === undefined) return undefined;
  return Math.max(0, Math.min(1, Math.exp(lp)));
}

async function callGroq(input: TranscribeInput): Promise<TranscribeOutcome> {
  if (!config.keys.groq) return failed(401, 'Groq API key not set');

  const form = new FormData();
  const blob = new Blob([new Uint8Array(input.audio)], { type: `audio/${input.audioFormat}` });
  form.append('file', blob, `audio.${input.audioFormat}`);
  form.append('model', input.model);
  form.append('response_format', 'verbose_json');
  if (input.wordTimestamps) form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');
  if (input.language && input.language !== 'auto') form.append('language', input.language);
  if (input.prompt) form.append('prompt', input.prompt);
  if (input.task === 'translate') {
    // Groq exposes a separate /translations endpoint, but the transcription endpoint
    // accepts a `task` param too in newer revisions. Simplest: post to transcriptions
    // with task=translate where supported, otherwise the user picks a translation-capable model.
    form.append('task', 'translate');
  }

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.keys.groq}` },
    body: form,
  });
  await ensureOk(res, 'Groq');

  const json = (await res.json()) as GroqVerboseResponse;

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
    actualProvider: 'groq',
    raw: json,
  };
  return { kind: 'done', result };
}

export const groqProvider: STTProvider = {
  id: 'groq',
  capabilities: {
    wordTimestamps: true,
    diarization: false,
    translate: true,
    asyncOnly: false,
    maxDurationSec: 14400,
    maxFileMB: 100,
    acceptedFormats: ['flac', 'mp3', 'wav', 'm4a', 'webm', 'mp4'],
  },
  async start(input: TranscribeInput): Promise<TranscribeOutcome> {
    try {
      return await callGroq(input);
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? 'Groq error';
      return failed(status, msg);
    }
  },
};
