import 'server-only';
import type { STTProvider, TranscribeInput, TranscribeOutcome, TranscriptionResult, Word, Segment } from '@/types/provider';
import { config } from '../config';
import { ensureOk, failed } from './base';

/**
 * ElevenLabs Speech-to-Text — multipart upload, returns word-level
 * timestamps and per-word logprobs.
 *
 * Docs: https://elevenlabs.io/docs/api-reference/speech-to-text
 */

interface ElevenWord {
  text: string;
  start: number;
  end: number;
  type: 'word' | 'spacing' | 'audio_event';
  speaker_id?: string;
  logprob?: number;
}

interface ElevenResponse {
  language_code?: string;
  language_probability?: number;
  text: string;
  words?: ElevenWord[];
}

function logprobToConfidence(lp?: number): number | undefined {
  if (lp === undefined) return undefined;
  return Math.max(0, Math.min(1, Math.exp(lp)));
}

async function callElevenLabs(input: TranscribeInput): Promise<TranscribeOutcome> {
  if (!config.keys.elevenlabs) return failed(401, 'ElevenLabs API key not set');

  const form = new FormData();
  const blob = new Blob([new Uint8Array(input.audio)], { type: `audio/${input.audioFormat}` });
  form.append('file', blob, `audio.${input.audioFormat}`);
  form.append('model_id', input.model);
  form.append('timestamps_granularity', 'word');
  if (input.language && input.language !== 'auto') form.append('language_code', input.language);
  if (input.task === 'translate') form.append('translate', 'true');

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': config.keys.elevenlabs },
    body: form,
  });
  await ensureOk(res, 'ElevenLabs');

  const json = (await res.json()) as ElevenResponse;

  const words: Word[] = (json.words ?? [])
    .filter(w => w.type === 'word')
    .map(w => ({
      text: w.text,
      start: w.start,
      end: w.end,
      confidence: logprobToConfidence(w.logprob),
    }));

  // ElevenLabs doesn't return segments — group words into rough segments by gap.
  const segments: Segment[] = [];
  let cur: Word[] = [];
  for (const w of words) {
    if (cur.length && w.start - cur[cur.length - 1]!.end > 0.6) {
      segments.push({
        text: cur.map(x => x.text).join(' ').trim(),
        start: cur[0]!.start,
        end: cur[cur.length - 1]!.end,
      });
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) {
    segments.push({
      text: cur.map(x => x.text).join(' ').trim(),
      start: cur[0]!.start,
      end: cur[cur.length - 1]!.end,
    });
  }

  const result: TranscriptionResult = {
    text: json.text,
    language: json.language_code ?? input.language ?? 'auto',
    durationSec: words.length ? words[words.length - 1]!.end : 0,
    words,
    segments,
    actualProvider: 'elevenlabs',
    raw: json,
  };
  return { kind: 'done', result };
}

export const elevenlabsProvider: STTProvider = {
  id: 'elevenlabs',
  capabilities: {
    wordTimestamps: true,
    diarization: true,
    translate: true,
    asyncOnly: false,
    maxDurationSec: 999999,
    maxFileMB: 1024,
    acceptedFormats: ['flac', 'mp3', 'wav', 'm4a', 'mp4', 'webm'],
  },
  async start(input: TranscribeInput): Promise<TranscribeOutcome> {
    try {
      return await callElevenLabs(input);
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? 'ElevenLabs error';
      return failed(status, msg);
    }
  },
};
