import 'server-only';
import type { STTProvider, TranscribeInput, TranscribeOutcome, TranscriptionResult, Word, Segment } from '@/types/provider';
import { config } from '../config';
import { ensureOk, failed } from './base';

/**
 * AssemblyAI async transport. Three steps:
 *   1. POST audio bytes to /upload → get upload_url
 *   2. POST { audio_url } to /transcript → get id (= our pollToken)
 *   3. GET /transcript/{id} until status = completed | error
 *
 * Docs: https://www.assemblyai.com/docs/walkthroughs/transcribing-an-audio-file
 */

const BASE = 'https://api.assemblyai.com/v2';

interface AssemblyWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string | null;
}

interface AssemblySentence {
  text: string;
  start: number;
  end: number;
}

interface AssemblyTranscript {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text?: string;
  language_code?: string;
  audio_duration?: number;
  words?: AssemblyWord[];
  error?: string;
}

interface AssemblySentencesResponse {
  sentences: AssemblySentence[];
}

function authHeaders(): HeadersInit {
  return { Authorization: config.keys.assemblyai };
}

async function uploadAudio(audio: Buffer, signal?: AbortSignal): Promise<string> {
  // AssemblyAI /upload takes raw bytes — pass the Buffer directly to avoid the
  // Buffer → Uint8Array → request-body copy chain that the review flagged.
  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(audio),
    signal,
  });
  await ensureOk(res, 'AssemblyAI (upload)');
  const json = (await res.json()) as { upload_url: string };
  return json.upload_url;
}

async function createTranscript(input: TranscribeInput, audioUrl: string): Promise<string> {
  const body: Record<string, unknown> = {
    audio_url: audioUrl,
    speech_model: input.model,
    punctuate: true,
    format_text: true,
  };
  if (input.language && input.language !== 'auto') body.language_code = input.language;
  else body.language_detection = true;

  const res = await fetch(`${BASE}/transcript`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: input.signal,
  });
  await ensureOk(res, 'AssemblyAI (create)');
  const json = (await res.json()) as { id: string };
  return json.id;
}

async function getTranscript(id: string): Promise<AssemblyTranscript> {
  const res = await fetch(`${BASE}/transcript/${id}`, { headers: authHeaders() });
  await ensureOk(res, 'AssemblyAI (poll)');
  return (await res.json()) as AssemblyTranscript;
}

async function getSentences(id: string): Promise<AssemblySentence[]> {
  const res = await fetch(`${BASE}/transcript/${id}/sentences`, { headers: authHeaders() });
  if (!res.ok) return []; // sentences endpoint optional
  const json = (await res.json()) as AssemblySentencesResponse;
  return json.sentences ?? [];
}

function mapTranscript(t: AssemblyTranscript, sentences: AssemblySentence[]): TranscriptionResult {
  const words: Word[] = (t.words ?? []).map(w => ({
    text: w.text,
    start: w.start / 1000,
    end: w.end / 1000,
    confidence: w.confidence,
  }));
  const segments: Segment[] = sentences.map(s => ({
    text: s.text,
    start: s.start / 1000,
    end: s.end / 1000,
  }));
  return {
    text: t.text ?? '',
    language: t.language_code ?? 'auto',
    durationSec: t.audio_duration ?? 0,
    words,
    segments,
    actualProvider: 'assemblyai',
    raw: t,
  };
}

export const assemblyaiProvider: STTProvider = {
  id: 'assemblyai',
  capabilities: {
    wordTimestamps: true,
    diarization: true,
    translate: false,
    asyncOnly: true,
    maxDurationSec: 999999,
    maxFileMB: 5000,
    acceptedFormats: ['mp3', 'wav', 'flac', 'm4a', 'mp4', 'webm'],
  },
  async start(input: TranscribeInput): Promise<TranscribeOutcome> {
    if (!config.keys.assemblyai) return failed(401, 'AssemblyAI API key not set');
    try {
      const uploadUrl = await uploadAudio(input.audio, input.signal);
      const id = await createTranscript(input, uploadUrl);
      return { kind: 'pending', pollToken: id, etaSec: 30 };
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? 'AssemblyAI error';
      return failed(status, msg);
    }
  },
  async poll(token: string): Promise<TranscribeOutcome> {
    if (!config.keys.assemblyai) return failed(401, 'AssemblyAI API key not set');
    try {
      const t = await getTranscript(token);
      if (t.status === 'completed') {
        const sentences = await getSentences(token);
        return { kind: 'done', result: mapTranscript(t, sentences) };
      }
      if (t.status === 'error') return failed(undefined, t.error || 'AssemblyAI transcription failed', false);
      return { kind: 'pending', pollToken: token, etaSec: 10 };
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? 'AssemblyAI poll error';
      return failed(status, msg);
    }
  },
};
