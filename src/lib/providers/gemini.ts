import 'server-only';
import type { STTProvider, TranscribeInput, TranscribeOutcome, TranscriptionResult, Segment, Word } from '@/types/provider';
import { config } from '../config';
import { ensureOk, failed } from './base';

/**
 * Google Gemini multimodal — accepts inline audio (base64) and returns
 * transcription as text. Word-level timestamps are not exposed; we ask the
 * model for line-by-line output with [HH:MM:SS] markers and parse.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/audio
 */

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
}

const PROMPT_TRANSCRIBE = `Transcribe the audio verbatim. Output ONLY the transcript, one line per natural sentence, prefixed with the start timestamp in the format [MM:SS] or [HH:MM:SS]. No commentary, no markdown, no speaker labels. Preserve original language.`;
const PROMPT_TRANSLATE = `Transcribe the audio and translate it to English. Output ONLY the English translation, one line per natural sentence, prefixed with the start timestamp in the format [MM:SS] or [HH:MM:SS]. No commentary, no markdown.`;

const TS_RE = /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.*)$/;

function parseTimestamp(line: string): { start: number; text: string } | null {
  const m = TS_RE.exec(line);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = m[3] !== undefined ? Number(m[3]) : null;
  const start = c === null ? a * 60 + b : a * 3600 + b * 60 + c;
  return { start, text: (m[4] ?? '').trim() };
}

function parseGeminiTranscript(raw: string): { text: string; segments: Segment[] } {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const segments: Segment[] = [];
  for (const line of lines) {
    const parsed = parseTimestamp(line);
    if (parsed && parsed.text) segments.push({ text: parsed.text, start: parsed.start, end: parsed.start });
  }
  // Backfill end times: end of segment N = start of segment N+1 (or +3s for last)
  for (let i = 0; i < segments.length - 1; i++) {
    segments[i]!.end = segments[i + 1]!.start;
  }
  if (segments.length) segments[segments.length - 1]!.end = segments[segments.length - 1]!.start + 3;

  const text = segments.length
    ? segments.map(s => s.text).join(' ')
    : raw.trim();
  return { text, segments };
}

async function callGemini(input: TranscribeInput): Promise<TranscribeOutcome> {
  if (!config.keys.gemini) return failed(401, 'Gemini API key not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${encodeURIComponent(config.keys.gemini)}`;
  const promptText = input.task === 'translate' ? PROMPT_TRANSLATE : PROMPT_TRANSCRIBE;
  const userPrompt = input.prompt ? `${promptText}\nContext hint: ${input.prompt}` : promptText;

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: userPrompt },
        {
          inlineData: {
            mimeType: `audio/${input.audioFormat === 'wav' ? 'wav' : input.audioFormat === 'mp3' ? 'mp3' : 'flac'}`,
            data: Buffer.from(input.audio).toString('base64'),
          },
        },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 8192 },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: input.signal,
  });
  await ensureOk(res, 'Gemini');

  const json = (await res.json()) as GeminiResponse;
  const blockReason = json.promptFeedback?.blockReason;
  if (blockReason) return failed(400, `Gemini blocked: ${blockReason}`, false);

  const raw = json.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
  if (!raw) return failed(undefined, 'Gemini returned empty transcript', false);

  const { text, segments } = parseGeminiTranscript(raw);

  // Coverage check — if the model ignored our timestamp instruction we end up
  // with zero parsed segments and a `durationSec=0` result. Surface that as
  // an explicit failure rather than emitting a silently-broken transcript.
  const totalLines = raw.split(/\r?\n/).filter(l => l.trim()).length;
  if (segments.length === 0 || segments.length < Math.ceil(totalLines * 0.5)) {
    return failed(undefined, 'Gemini timestamp coverage too low — model ignored format instruction', false);
  }

  const result: TranscriptionResult = {
    text,
    language: input.language ?? 'auto',
    durationSec: segments[segments.length - 1]!.end,
    words: [] as Word[],
    segments,
    actualProvider: 'gemini',
    raw: json,
  };
  return { kind: 'done', result };
}

export const geminiProvider: STTProvider = {
  id: 'gemini',
  capabilities: {
    wordTimestamps: false,
    diarization: false,
    translate: true,
    asyncOnly: false,
    maxDurationSec: 9.5 * 3600,
    maxFileMB: 20,
    acceptedFormats: ['flac', 'mp3', 'wav'],
  },
  async start(input: TranscribeInput): Promise<TranscribeOutcome> {
    try {
      return await callGemini(input);
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? 'Gemini error';
      return failed(status, msg);
    }
  },
};
