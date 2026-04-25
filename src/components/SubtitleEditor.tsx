'use client';

import { useMemo, useState } from 'react';
import type { Segment, Word } from '@/types/provider';

interface Props {
  segments: Segment[];
  words?: Word[];
  onChange: (segments: Segment[]) => void;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function confidenceClass(c: number | undefined): string {
  if (c === undefined) return '';
  if (c < 0.4) return 'bg-red-900/40 text-red-200';
  if (c < 0.7) return 'bg-amber-900/30 text-amber-100';
  return '';
}

/**
 * For each segment, look up the words that fall inside its time window.
 * Used to render per-word confidence highlighting underneath the segment text.
 */
function wordsForSegment(seg: Segment, allWords: Word[]): Word[] {
  return allWords.filter(w => w.start >= seg.start - 0.05 && w.end <= seg.end + 0.05);
}

export default function SubtitleEditor({ segments, words = [], onChange }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [showConfidence, setShowConfidence] = useState<boolean>(true);

  const hasWordConfidence = useMemo(
    () => words.some(w => typeof w.confidence === 'number'),
    [words]
  );

  function update(idx: number, patch: Partial<Segment>): void {
    const next = segments.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange(next);
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2 text-sm text-zinc-400">
        <span>{segments.length} segments · click to edit</span>
        {hasWordConfidence && (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={showConfidence}
              onChange={e => setShowConfidence(e.target.checked)}
              className="accent-emerald-500"
            />
            Highlight low-confidence words
          </label>
        )}
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {segments.map((s, i) => {
          const isEditing = editing === i;
          const segWords = hasWordConfidence && showConfidence ? wordsForSegment(s, words) : [];
          return (
            <div
              key={i}
              className={`flex items-start gap-3 border-b border-zinc-800 px-4 py-3 last:border-b-0 ${
                isEditing ? 'bg-zinc-800/50' : 'hover:bg-zinc-800/30'
              }`}
            >
              <div className="w-32 shrink-0 font-mono text-xs text-zinc-500">
                <div>{fmt(s.start)}</div>
                <div>{fmt(s.end)}</div>
              </div>
              {isEditing ? (
                <textarea
                  autoFocus
                  defaultValue={s.text}
                  onBlur={e => { update(i, { text: e.target.value }); setEditing(null); }}
                  className="subtitle-line min-h-[3rem] flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100"
                  dir="auto"
                />
              ) : (
                <div
                  className="subtitle-line flex-1 cursor-text text-zinc-200"
                  onClick={() => setEditing(i)}
                  dir="auto"
                >
                  {segWords.length > 0 ? (
                    <span>
                      {segWords.map((w, wi) => {
                        const cls = confidenceClass(w.confidence);
                        return (
                          <span key={wi} className={cls ? `rounded px-0.5 ${cls}` : ''}>
                            {w.text}
                            {/[\p{L}\p{N}']/u.test(w.text) ? ' ' : ''}
                          </span>
                        );
                      })}
                    </span>
                  ) : (
                    s.text
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
