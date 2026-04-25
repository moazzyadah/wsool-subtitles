'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ProviderInfo } from '@/types/provider';

export interface CompareSelection {
  providerId: string;
  model: string;
  language: string;
}

interface Props {
  providers: Array<ProviderInfo & { enabled: boolean }>;
  onStart: (selections: CompareSelection[]) => void;
  onCancel: () => void;
}

const LANGUAGES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'ar', label: 'Arabic' },
  { value: 'en', label: 'English' },
];

export default function CompareSetup({ providers, onStart, onCancel }: Props) {
  const enabled = providers.filter(p => p.enabled);
  const initialSel: CompareSelection = {
    providerId: enabled[0]?.id ?? 'local',
    model: enabled[0]?.models[0]?.id ?? 'ggml-medium',
    language: 'auto',
  };
  const [selections, setSelections] = useState<CompareSelection[]>([
    initialSel,
    enabled[1]
      ? { providerId: enabled[1].id, model: enabled[1].models[0]!.id, language: 'auto' }
      : initialSel,
  ]);

  function update(i: number, patch: Partial<CompareSelection>): void {
    setSelections(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function add(): void {
    if (selections.length >= 5) return;
    setSelections(prev => [...prev, initialSel]);
  }
  function remove(i: number): void {
    if (selections.length <= 2) return;
    setSelections(prev => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
      <div>
        <h3 className="text-lg font-semibold">Side-by-side comparison</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Pick 2–5 provider/model combinations. They'll all run on the same audio so you can see which one transcribes your voice best.
        </p>
      </div>

      <div className="space-y-3">
        {selections.map((sel, i) => {
          const current = enabled.find(p => p.id === sel.providerId);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-3">
              <span className="w-6 text-center text-sm text-zinc-500">#{i + 1}</span>
              <select
                value={sel.providerId}
                onChange={e => {
                  const p = enabled.find(p => p.id === e.target.value);
                  if (p) update(i, { providerId: p.id, model: p.models[0]!.id });
                }}
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm"
              >
                {enabled.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                value={sel.model}
                onChange={e => update(i, { model: e.target.value })}
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm"
              >
                {current?.models.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <select
                value={sel.language}
                onChange={e => update(i, { language: e.target.value })}
                className="w-32 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm"
              >
                {LANGUAGES.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
              <button
                onClick={() => remove(i)}
                disabled={selections.length <= 2}
                className="rounded-md p-1 text-zinc-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={add}
          disabled={selections.length >= 5}
          className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add provider
        </button>
        <button
          onClick={() => onStart(selections)}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Start comparison
        </button>
        <button
          onClick={onCancel}
          className="rounded-md bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
