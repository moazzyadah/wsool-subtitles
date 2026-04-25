import 'server-only';
import type { STTProvider, TranscribeInput, TranscribeOutcome, TranscriptionResult, Word, Segment } from '@/types/provider';
import { config } from '../config';
import { ensureOk, failed } from './base';

/**
 * Soniox async transport.
 *   1. POST /v1/files (multipart) → file_id
 *   2. POST /v1/transcriptions { file_id, model, language_hints } → transcription id
 *   3. GET /v1/transcriptions/{id} until status=completed | error
 *   4. GET /v1/transcriptions/{id}/transcript → full transcript json
 *
 * Docs: https://soniox.com/docs/speech_to_text/api_reference/
 */

const BASE = 'https://api.soniox.com';

interface SonioxToken {
  text: string;
  start_ms: number;
  end_ms: number;
  confidence?: number;
  speaker?: string;
  language?: string;
  is_final?: boolean;
}

interface SonioxTranscript {
  text: string;
  tokens?: SonioxToken[];
}

interface SonioxJob {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  error_message?: string;
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${config.keys.soniox}` };
}

async function uploadFile(audio: Buffer, format: string): Promise<string> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(audio)], { type: `audio/${format}` });
  form.append('file', blob, `audio.${format}`);

  const res = await fetch(`${BASE}/v1/files`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  await ensureOk(res, 'Soniox (upload)');
  const json = (await res.json()) as { id: string };
  return json.id;
}

async function createTranscription(input: TranscribeInput, fileId: string): Promise<string> {
  const body: Record<string, unknown> = {
    file_id: fileId,
    model: input.model,
  };
  if (input.language && input.language !== 'auto') body.language_hints = [input.language];
  if (input.task === 'translate') body.translation = { type: 'one_way', target_language: 'en' };

  const res = await fetch(`${BASE}/v1/transcriptions`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await ensureOk(res, 'Soniox (create)');
  const json = (await res.json()) as { id: string };
  return json.id;
}

async function getTranscriptionStatus(id: string): Promise<SonioxJob> {
  const res = await fetch(`${BASE}/v1/transcriptions/${id}`, { headers: authHeaders() });
  await ensureOk(res, 'Soniox (status)');
  return (await res.json()) as SonioxJob;
}

async function getTranscript(id: string): Promise<SonioxTranscript> {
  const res = await fetch(`${BASE}/v1/transcriptions/${id}/transcript`, { headers: authHeaders() });
  await ensureOk(res, 'Soniox (transcript)');
  return (await res.json()) as SonioxTranscript;
}

function mapTranscript(t: SonioxTranscript): TranscriptionResult {
  const words: Word[] = [];
  const segments: Segment[] = [];
  let curStart = 0;
  let curWords: string[] = [];
  let curEnd = 0;

  for (const tok of t.tokens ?? []) {
    if (tok.is_final === false) continue;
    const text = tok.text;
    const start = tok.start_ms / 1000;
    const end = tok.end_ms / 1000;
    if (text === '<end>' || text === '<fin>') {
      if (curWords.length) {
        segments.push({ text: curWords.join('').trim(), start: curStart, end: curEnd });
        curWords = [];
      }
      continue;
    }
    words.push({ text: text.trim(), start, end, confidence: tok.confidence });
    if (curWords.length === 0) curStart = start;
    curWords.push(text);
    curEnd = end;

    if (/[.!?؟]\s*$/.test(text) && curWords.length) {
      segments.push({ text: curWords.join('').trim(), start: curStart, end });
      curWords = [];
    }
  }
  if (curWords.length) {
    segments.push({ text: curWords.join('').trim(), start: curStart, end: curEnd });
  }

  return {
    text: t.text,
    language: 'auto',
    durationSec: words.length ? words[words.length - 1]!.end : 0,
    words,
    segments,
    actualProvider: 'soniox',
    raw: t,
  };
}

/**
 * Combined token format: "fileId:transcriptionId" so poll() can fetch the
 * transcript without keeping extra state.
 */
function packToken(fileId: string, transcriptionId: string): string {
  return `${fileId}:${transcriptionId}`;
}
function unpackToken(token: string): { fileId: string; transcriptionId: string } {
  const [fileId, transcriptionId] = token.split(':');
  return { fileId: fileId ?? '', transcriptionId: transcriptionId ?? '' };
}

export const sonioxProvider: STTProvider = {
  id: 'soniox',
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
    if (!config.keys.soniox) return failed(401, 'Soniox API key not set');
    try {
      const fileId = await uploadFile(input.audio, input.audioFormat);
      const trId = await createTranscription(input, fileId);
      return { kind: 'pending', pollToken: packToken(fileId, trId), etaSec: 20 };
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? 'Soniox error';
      return failed(status, msg);
    }
  },
  async poll(token: string): Promise<TranscribeOutcome> {
    if (!config.keys.soniox) return failed(401, 'Soniox API key not set');
    try {
      const { transcriptionId } = unpackToken(token);
      const job = await getTranscriptionStatus(transcriptionId);
      if (job.status === 'completed') {
        const t = await getTranscript(transcriptionId);
        return { kind: 'done', result: mapTranscript(t) };
      }
      if (job.status === 'error') return failed(undefined, job.error_message || 'Soniox transcription failed');
      return { kind: 'pending', pollToken: token, etaSec: 10 };
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? 'Soniox poll error';
      return failed(status, msg);
    }
  },
};
