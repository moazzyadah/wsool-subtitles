import type { Word, Segment } from '@/types/provider';

const SENTENCE_END = /[.!?؟。！？]\s*$/;

/** Strip libass override blocks from any user-edited or provider-returned text. */
export function sanitizeSubtitleText(s: string): string {
  return s.replace(/\{[^}]*\}/g, '').trim();
}

function fmtTime(sec: number, sep: ',' | '.'): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms, 3)}`;
}

interface GroupOpts {
  maxWords?: number;
  maxDurationSec?: number;
}

/**
 * Group word-level timestamps into subtitle blocks.
 * Breaks at sentence endings when possible. Falls back to maxWords/maxDuration.
 */
export function groupWordsIntoSegments(
  words: Word[],
  opts: GroupOpts = {}
): Segment[] {
  const maxWords = opts.maxWords ?? 10;
  const maxDur = opts.maxDurationSec ?? 4;
  const segments: Segment[] = [];

  let buf: Word[] = [];
  for (const w of words) {
    buf.push(w);
    const first = buf[0]!;
    const dur = w.end - first.start;
    const text = buf.map(x => x.text).join(' ').trim();
    const breakNow = SENTENCE_END.test(text) || buf.length >= maxWords || dur >= maxDur;
    if (breakNow) {
      segments.push({ text: sanitizeSubtitleText(text), start: first.start, end: w.end });
      buf = [];
    }
  }
  if (buf.length) {
    const first = buf[0]!;
    const last = buf[buf.length - 1]!;
    segments.push({
      text: sanitizeSubtitleText(buf.map(x => x.text).join(' ')),
      start: first.start,
      end: last.end,
    });
  }
  return segments;
}

export function segmentsToSrt(segments: Segment[]): string {
  return segments
    .map((s, i) => {
      const idx = i + 1;
      const start = fmtTime(s.start, ',');
      const end = fmtTime(s.end, ',');
      return `${idx}\n${start} --> ${end}\n${sanitizeSubtitleText(s.text)}\n`;
    })
    .join('\n');
}

export function segmentsToVtt(segments: Segment[]): string {
  const body = segments
    .map(s => {
      const start = fmtTime(s.start, '.');
      const end = fmtTime(s.end, '.');
      return `${start} --> ${end}\n${sanitizeSubtitleText(s.text)}\n`;
    })
    .join('\n');
  return `WEBVTT\n\n${body}`;
}
