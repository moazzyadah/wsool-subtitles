import 'server-only';
import type { STTProvider, TranscribeInput, TranscribeOutcome, TranscriptionResult, Word, Segment } from '@/types/provider';
import { config } from '../config';
import { ensureOk, failed } from './base';

/**
 * HuggingFace Inference API — direct access to any Whisper-style model.
 *
 * Limitation: serverless inference has a 30s wall-clock limit per request.
 * Anything longer should go through Replicate (Cog wrapper) instead — the
 * UI surfaces that recommendation.
 *
 * Docs: https://huggingface.co/docs/api-inference/detailed_parameters#automatic-speech-recognition-task
 */

interface HfChunk {
  text: string;
  timestamp: [number, number | null];
}

interface HfResponse {
  text: string;
  chunks?: HfChunk[];
}

async function callHuggingFace(input: TranscribeInput): Promise<TranscribeOutcome> {
  if (!config.keys.huggingface) return failed(401, 'HuggingFace token not set');

  const params: Record<string, unknown> = {
    return_timestamps: true,
  };
  if (input.language && input.language !== 'auto') {
    params.generate_kwargs = { language: input.language, task: input.task ?? 'transcribe' };
  } else if (input.task === 'translate') {
    params.generate_kwargs = { task: 'translate' };
  }

  const res = await fetch(`https://api-inference.huggingface.co/models/${input.model}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.keys.huggingface}`,
      'Content-Type': `audio/${input.audioFormat}`,
      'X-Wait-For-Model': 'true',
    },
    body: new Uint8Array(input.audio),
  });
  await ensureOk(res, 'HuggingFace');

  const json = (await res.json()) as HfResponse;
  const segments: Segment[] = (json.chunks ?? []).map(c => ({
    text: c.text.trim(),
    start: c.timestamp[0],
    end: c.timestamp[1] ?? c.timestamp[0],
  }));
  const words: Word[] = []; // HF chunk timestamps are sentence/segment level, not word-level

  const result: TranscriptionResult = {
    text: json.text,
    language: input.language ?? 'auto',
    durationSec: segments.length ? segments[segments.length - 1]!.end : 0,
    words,
    segments,
    actualProvider: 'huggingface',
    raw: json,
  };
  return { kind: 'done', result };
}

export const huggingfaceProvider: STTProvider = {
  id: 'huggingface',
  capabilities: {
    wordTimestamps: false,
    diarization: false,
    translate: true,
    asyncOnly: false,
    maxDurationSec: 30, // serverless wall-clock limit
    maxFileMB: 25,
    acceptedFormats: ['flac', 'mp3', 'wav', 'm4a'],
  },
  async start(input: TranscribeInput): Promise<TranscribeOutcome> {
    try {
      return await callHuggingFace(input);
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? 'HuggingFace error';
      return failed(status, msg);
    }
  },
};
