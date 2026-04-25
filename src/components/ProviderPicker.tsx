'use client';

import type { ProviderInfo } from '@/types/provider';

interface Props {
  providers: ProviderInfo[];
  providerId: string;
  model: string;
  language: string;
  task: 'transcribe' | 'translate';
  onProviderChange: (providerId: string, modelId: string) => void;
  onModelChange: (modelId: string) => void;
  onLanguageChange: (lang: string) => void;
  onTaskChange: (task: 'transcribe' | 'translate') => void;
}

const LANGUAGES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'ar', label: 'Arabic (any dialect)' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
  { value: 'tr', label: 'Turkish' },
  { value: 'ur', label: 'Urdu' },
];

function formatPrice(p: number | null): string {
  if (p === null) return 'free';
  if (p === 0) return 'free';
  return `$${(p * 60).toFixed(3)}/hr`;
}

export default function ProviderPicker({
  providers,
  providerId,
  model,
  language,
  task,
  onProviderChange,
  onModelChange,
  onLanguageChange,
  onTaskChange,
}: Props) {
  const current = providers.find(p => p.id === providerId);
  const selectedModel = current?.models.find(m => m.id === model);
  const supportsTranslate = current?.capabilities.translate ?? false;

  return (
    <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Provider</label>
        <select
          value={providerId}
          onChange={e => {
            const p = providers.find(p => p.id === e.target.value);
            if (p) onProviderChange(p.id, p.models[0]!.id);
          }}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100"
        >
          {providers.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {current?.description && (
          <p className="mt-1 text-xs text-zinc-500">{current.description}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Model</label>
        <select
          value={model}
          onChange={e => onModelChange(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100"
        >
          {current?.models.map(m => (
            <option key={m.id} value={m.id}>
              {m.label} · {formatPrice(m.pricingUsdPerMin)}
            </option>
          ))}
        </select>
        {selectedModel && (
          <p className="mt-1 text-xs text-zinc-500">
            {formatPrice(selectedModel.pricingUsdPerMin)}
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Language</label>
        <select
          value={language}
          onChange={e => onLanguageChange(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100"
        >
          {LANGUAGES.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      {supportsTranslate && (
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-300">Task</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onTaskChange('transcribe')}
              className={`flex-1 rounded-md px-3 py-2 text-sm ${
                task === 'transcribe'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              Transcribe (original language)
            </button>
            <button
              type="button"
              onClick={() => onTaskChange('translate')}
              className={`flex-1 rounded-md px-3 py-2 text-sm ${
                task === 'translate'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              Translate to English
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Whisper-family providers translate any language to English at no extra cost.
          </p>
        </div>
      )}
    </div>
  );
}
