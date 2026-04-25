import 'server-only';
import type { STTProvider, TranscribeInput, TranscribeOutcome, TranscriptionResult, Word, Segment, Speaker } from '@/types/provider';
import { config } from '../config';
import { ensureOk, failed } from './base';

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen';

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
}

interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words?: DeepgramWord[];
  paragraphs?: { paragraphs: Array<{ sentences: Array<{ text: string; start: number; end: number }> }> };
}

interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: {
    channels: Array<{
      detected_language?: string;
      alternatives: DeepgramAlternative[];
    }>;
  };
}

async function callDeepgram(input: TranscribeInput): Promise<TranscribeOutcome> {
  if (!config.keys.deepgram) return failed(401, 'Deepgram API key not set');

  const params = new URLSearchParams({
    model: input.model,
    smart_format: 'true',
    punctuate: 'true',
    paragraphs: 'true',
    diarize: 'true', // matches advertised capability; mapped into result.speakers below
  });
  if (input.language && input.language !== 'auto') {
    params.set('language', input.language);
  } else {
    params.set('detect_language', 'true');
  }

  const res = await fetch(`${DEEPGRAM_URL}?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${config.keys.deepgram}`,
      'Content-Type': `audio/${input.audioFormat}`,
    },
    body: new Uint8Array(input.audio),
    signal: input.signal,
  });
  await ensureOk(res, 'Deepgram');

  const json = (await res.json()) as DeepgramResponse;
  const channel = json.results?.channels?.[0];
  const alt = channel?.alternatives?.[0];
  if (!alt) return failed(undefined, 'Deepgram returned no transcript', false);

  const words: Word[] = (alt.words ?? []).map(w => ({
    text: w.punctuated_word ?? w.word,
    start: w.start,
    end: w.end,
    confidence: w.confidence,
  }));

  // Use Deepgram's own paragraph→sentence segmentation when available
  const segments: Segment[] = [];
  const sentences = alt.paragraphs?.paragraphs?.flatMap(p => p.sentences) ?? [];
  for (const s of sentences) segments.push({ text: s.text, start: s.start, end: s.end });

  // Aggregate words by speaker → Speaker[]
  const bySpeaker = new Map<number, number[]>();
  (alt.words ?? []).forEach((w, i) => {
    if (typeof w.speaker !== 'number') return;
    const list = bySpeaker.get(w.speaker) ?? [];
    list.push(i);
    bySpeaker.set(w.speaker, list);
  });
  const speakers: Speaker[] = [...bySpeaker.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, idx]) => ({ id: `S${id}`, segments: idx }));

  const result: TranscriptionResult = {
    text: alt.transcript,
    language: channel?.detected_language ?? input.language ?? 'auto',
    durationSec: json.metadata?.duration ?? 0,
    words,
    segments,
    speakers: speakers.length > 0 ? speakers : undefined,
    actualProvider: 'deepgram',
    raw: json,
  };
  return { kind: 'done', result };
}

export const deepgramProvider: STTProvider = {
  id: 'deepgram',
  capabilities: {
    wordTimestamps: true,
    diarization: true,
    translate: false,
    asyncOnly: false,
    maxDurationSec: 999999,
    maxFileMB: 2048,
    acceptedFormats: ['wav', 'flac', 'mp3', 'm4a', 'mp4', 'webm'],
  },
  async start(input: TranscribeInput): Promise<TranscribeOutcome> {
    try {
      return await callDeepgram(input);
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? 'Deepgram error';
      return failed(status, msg);
    }
  },
};
