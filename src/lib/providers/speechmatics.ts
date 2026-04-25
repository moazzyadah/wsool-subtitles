import 'server-only';
import type { STTProvider, TranscribeInput, TranscribeOutcome, TranscriptionResult, Word, Segment } from '@/types/provider';
import { config } from '../config';
import { ensureOk, failed } from './base';

/**
 * Speechmatics async transport. Submit job (multipart with audio + config),
 * poll status, fetch transcript.
 *
 * Docs: https://docs.speechmatics.com/api-ref
 */

const BASE = 'https://asr.api.speechmatics.com/v2';

interface SpeechmaticsJob {
  id: string;
  status: 'running' | 'done' | 'rejected';
  errors?: Array<{ message: string }>;
}

interface SpeechmaticsAlternative {
  content: string;
  confidence: number;
  speaker?: string;
}

interface SpeechmaticsResultItem {
  type: 'word' | 'punctuation';
  start_time: number;
  end_time: number;
  alternatives: SpeechmaticsAlternative[];
}

interface SpeechmaticsTranscriptJson {
  metadata?: { language_pack_info?: { language_description?: string } };
  results: SpeechmaticsResultItem[];
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${config.keys.speechmatics}` };
}

async function submitJob(input: TranscribeInput): Promise<string> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(input.audio)], { type: `audio/${input.audioFormat}` });
  form.append('data_file', blob, `audio.${input.audioFormat}`);

  const lang = input.language && input.language !== 'auto' ? input.language : 'auto';
  const transcriptionConfig: Record<string, unknown> = {
    language: lang,
    operating_point: input.model || 'enhanced',
    enable_partials: false,
  };
  // Egyptian Arabic dialect hint when explicitly Arabic
  if (lang === 'ar') (transcriptionConfig as Record<string, unknown>).additional_vocab = [];

  const cfg = {
    type: input.task === 'translate' ? 'translate' : 'transcription',
    transcription_config: transcriptionConfig,
    ...(input.task === 'translate'
      ? { translation_config: { target_languages: ['en'] } }
      : {}),
  };
  form.append('config', JSON.stringify(cfg));

  const res = await fetch(`${BASE}/jobs`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  await ensureOk(res, 'Speechmatics (submit)');
  const json = (await res.json()) as { id: string };
  return json.id;
}

async function getJob(id: string): Promise<SpeechmaticsJob> {
  const res = await fetch(`${BASE}/jobs/${id}`, { headers: authHeaders() });
  await ensureOk(res, 'Speechmatics (status)');
  const json = (await res.json()) as { job: SpeechmaticsJob };
  return json.job;
}

async function getTranscript(id: string): Promise<SpeechmaticsTranscriptJson> {
  const res = await fetch(`${BASE}/jobs/${id}/transcript?format=json-v2`, { headers: authHeaders() });
  await ensureOk(res, 'Speechmatics (transcript)');
  return (await res.json()) as SpeechmaticsTranscriptJson;
}

function mapTranscript(json: SpeechmaticsTranscriptJson): TranscriptionResult {
  const words: Word[] = [];
  const segments: Segment[] = [];
  let curSegStart = 0;
  let curSegWords: string[] = [];

  for (const item of json.results) {
    const alt = item.alternatives[0];
    if (!alt) continue;
    if (item.type === 'word') {
      words.push({
        text: alt.content,
        start: item.start_time,
        end: item.end_time,
        confidence: alt.confidence,
      });
      if (curSegWords.length === 0) curSegStart = item.start_time;
      curSegWords.push(alt.content);
    } else if (item.type === 'punctuation') {
      // Append punctuation to last word
      if (words.length) words[words.length - 1]!.text += alt.content;
      if (curSegWords.length) curSegWords[curSegWords.length - 1] += alt.content;
      // End-of-sentence punctuation closes a segment
      if (/[.!?؟]/.test(alt.content) && curSegWords.length) {
        segments.push({
          text: curSegWords.join(' '),
          start: curSegStart,
          end: item.end_time,
        });
        curSegWords = [];
      }
    }
  }
  if (curSegWords.length) {
    const lastWord = words[words.length - 1];
    segments.push({
      text: curSegWords.join(' '),
      start: curSegStart,
      end: lastWord?.end ?? curSegStart,
    });
  }

  const text = words.map(w => w.text).join(' ').replace(/\s+([.,!?؟])/g, '$1');

  return {
    text,
    language: json.metadata?.language_pack_info?.language_description ?? 'auto',
    durationSec: words.length ? words[words.length - 1]!.end : 0,
    words,
    segments,
    actualProvider: 'speechmatics',
    raw: json,
  };
}

export const speechmaticsProvider: STTProvider = {
  id: 'speechmatics',
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
    if (!config.keys.speechmatics) return failed(401, 'Speechmatics API key not set');
    try {
      const id = await submitJob(input);
      return { kind: 'pending', pollToken: id, etaSec: 30 };
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? 'Speechmatics error';
      return failed(status, msg);
    }
  },
  async poll(token: string): Promise<TranscribeOutcome> {
    if (!config.keys.speechmatics) return failed(401, 'Speechmatics API key not set');
    try {
      const job = await getJob(token);
      if (job.status === 'done') {
        const tr = await getTranscript(token);
        return { kind: 'done', result: mapTranscript(tr) };
      }
      if (job.status === 'rejected') {
        const msg = job.errors?.[0]?.message ?? 'Speechmatics job rejected';
        return failed(undefined, msg);
      }
      return { kind: 'pending', pollToken: token, etaSec: 10 };
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? 'Speechmatics poll error';
      return failed(status, msg);
    }
  },
};
