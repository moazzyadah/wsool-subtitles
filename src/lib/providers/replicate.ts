import 'server-only';
import type { STTProvider, TranscribeInput, TranscribeOutcome, TranscriptionResult, Word, Segment } from '@/types/provider';
import { config } from '../config';
import { ensureOk, failed } from './base';

const REPLICATE_BASE = 'https://api.replicate.com/v1';

/**
 * Replicate uses async predictions: POST creates one, GET polls until complete.
 * The model param can be a versioned ref like "victor-upmeet/whisperx" or a
 * specific version hash. We submit and return a poll token (the prediction ID).
 */

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
  error?: string;
  metrics?: { predict_time?: number };
}

async function authedFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${REPLICATE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${config.keys.replicate}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Resolve "owner/name" to its latest version hash. Required when submitting
 * predictions for community models.
 */
async function getLatestVersion(modelRef: string): Promise<string> {
  const res = await authedFetch(`/models/${modelRef}`, { method: 'GET' });
  await ensureOk(res, 'Replicate (model lookup)');
  const json = (await res.json()) as { latest_version?: { id: string } };
  if (!json.latest_version?.id) throw new Error(`No version found for ${modelRef}`);
  return json.latest_version.id;
}

async function uploadAudioToReplicate(audio: Buffer, format: string): Promise<string> {
  // Replicate accepts data URIs directly for inputs — simpler than their files API.
  const b64 = Buffer.from(audio).toString('base64');
  return `data:audio/${format};base64,${b64}`;
}

function pickInputName(modelRef: string): string {
  // Most whisper variants on Replicate use "audio" or "audio_file"
  if (modelRef.includes('whisperx')) return 'audio_file';
  return 'audio';
}

export const replicateProvider: STTProvider = {
  id: 'replicate',
  capabilities: {
    wordTimestamps: true,
    diarization: true,
    translate: true,
    asyncOnly: true,
    maxDurationSec: 999999,
    maxFileMB: 2048,
    acceptedFormats: ['mp3', 'wav', 'flac', 'm4a', 'mp4', 'webm'],
  },
  async start(input: TranscribeInput): Promise<TranscribeOutcome> {
    if (!config.keys.replicate) return failed(401, 'Replicate API token not set');
    try {
      const version = await getLatestVersion(input.model);
      const audioUri = await uploadAudioToReplicate(input.audio, input.audioFormat);

      const inputPayload: Record<string, unknown> = {
        [pickInputName(input.model)]: audioUri,
      };
      if (input.language && input.language !== 'auto') inputPayload.language = input.language;
      if (input.task === 'translate') inputPayload.task = 'translate';
      if (input.prompt) inputPayload.initial_prompt = input.prompt;

      const res = await authedFetch('/predictions', {
        method: 'POST',
        body: JSON.stringify({ version, input: inputPayload }),
      });
      await ensureOk(res, 'Replicate (predict)');

      const pred = (await res.json()) as ReplicatePrediction;
      return { kind: 'pending', pollToken: pred.id, etaSec: 30 };
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? 'Replicate error';
      return failed(status, msg);
    }
  },
  async poll(token: string): Promise<TranscribeOutcome> {
    if (!config.keys.replicate) return failed(401, 'Replicate API token not set');
    try {
      const res = await authedFetch(`/predictions/${token}`, { method: 'GET' });
      await ensureOk(res, 'Replicate (poll)');
      const pred = (await res.json()) as ReplicatePrediction;

      if (pred.status === 'succeeded') {
        const result = mapReplicateOutput(pred.output);
        return { kind: 'done', result };
      }
      if (pred.status === 'failed' || pred.status === 'canceled') {
        return failed(undefined, pred.error || `Replicate prediction ${pred.status}`, false);
      }
      // Still running
      return { kind: 'pending', pollToken: token, etaSec: 10 };
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? 'Replicate poll error';
      return failed(status, msg);
    }
  },
};

/**
 * Map Replicate's varied output shapes (whisperx vs openai/whisper vs custom)
 * into our canonical TranscriptionResult.
 */
function mapReplicateOutput(output: unknown): TranscriptionResult {
  // WhisperX shape: { segments: [{ start, end, text, words: [{word, start, end, score}] }], language }
  // openai/whisper shape: { transcription, segments: [{start, end, text}], detected_language }
  if (!output || typeof output !== 'object') {
    throw new Error('Replicate returned empty output');
  }
  const o = output as Record<string, unknown>;

  const language = (o.language as string) ?? (o.detected_language as string) ?? 'auto';

  const segs = (o.segments as unknown[]) ?? [];
  const segments: Segment[] = [];
  const words: Word[] = [];

  for (const raw of segs) {
    const s = raw as Record<string, unknown>;
    const segment: Segment = {
      text: String(s.text ?? '').trim(),
      start: Number(s.start ?? 0),
      end: Number(s.end ?? 0),
    };
    segments.push(segment);
    const ws = (s.words as unknown[]) ?? [];
    for (const wraw of ws) {
      const w = wraw as Record<string, unknown>;
      words.push({
        text: String(w.word ?? w.text ?? ''),
        start: Number(w.start ?? 0),
        end: Number(w.end ?? 0),
        confidence: typeof w.score === 'number' ? (w.score as number) : undefined,
      });
    }
  }

  const text =
    (typeof o.transcription === 'string' && o.transcription) ||
    segments.map(s => s.text).join(' ').trim();

  return {
    text,
    language,
    durationSec: segments.length ? segments[segments.length - 1]!.end : 0,
    words,
    segments,
    actualProvider: 'replicate',
    raw: output,
  };
}
