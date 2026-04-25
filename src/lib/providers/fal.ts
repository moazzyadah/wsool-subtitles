import 'server-only';
import type { STTProvider, TranscribeInput, TranscribeOutcome, TranscriptionResult, Word, Segment } from '@/types/provider';
import { config } from '../config';
import { ensureOk, failed } from './base';

/**
 * Fal.ai sync transport. Models like fal-ai/whisper accept JSON with an
 * `audio_url` (data URI works) and return a chunked transcript.
 *
 * Docs: https://fal.ai/models/fal-ai/whisper/api
 */

interface FalChunk {
  text: string;
  timestamp?: [number, number];
  speaker?: string;
}

interface FalResponse {
  text: string;
  chunks?: FalChunk[];
  inferred_languages?: string[];
}

async function callFal(input: TranscribeInput): Promise<TranscribeOutcome> {
  if (!config.keys.fal) return failed(401, 'Fal API key not set');

  const audioDataUri = `data:audio/${input.audioFormat};base64,${Buffer.from(input.audio).toString('base64')}`;
  const body: Record<string, unknown> = {
    audio_url: audioDataUri,
    task: input.task === 'translate' ? 'translate' : 'transcribe',
    chunk_level: 'segment',
    version: '3',
  };
  if (input.language && input.language !== 'auto') body.language = input.language;
  if (input.prompt) body.prompt = input.prompt;

  const res = await fetch(`https://fal.run/${input.model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${config.keys.fal}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  await ensureOk(res, 'Fal');

  const json = (await res.json()) as FalResponse;
  const segments: Segment[] = (json.chunks ?? []).map(c => ({
    text: c.text.trim(),
    start: c.timestamp?.[0] ?? 0,
    end: c.timestamp?.[1] ?? 0,
  }));

  // Fal returns chunk-level timestamps only; we don't have per-word.
  const words: Word[] = [];

  const result: TranscriptionResult = {
    text: json.text,
    language: json.inferred_languages?.[0] ?? input.language ?? 'auto',
    durationSec: segments.length ? segments[segments.length - 1]!.end : 0,
    words,
    segments,
    actualProvider: 'fal',
    raw: json,
  };
  return { kind: 'done', result };
}

export const falProvider: STTProvider = {
  id: 'fal',
  capabilities: {
    wordTimestamps: false,
    diarization: false,
    translate: true,
    asyncOnly: false,
    maxDurationSec: 999999,
    maxFileMB: 50,
    acceptedFormats: ['flac', 'mp3', 'wav', 'm4a', 'mp4', 'webm'],
  },
  async start(input: TranscribeInput): Promise<TranscribeOutcome> {
    try {
      return await callFal(input);
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? 'Fal error';
      return failed(status, msg);
    }
  },
};
