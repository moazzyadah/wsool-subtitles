import 'server-only';
import type { ProviderInfo, STTProvider } from '@/types/provider';
import { config } from '../config';
import { groqProvider } from './groq';
import { deepgramProvider } from './deepgram';
import { replicateProvider } from './replicate';
import { localWhisperProvider } from './local-whisper';
import { openaiProvider } from './openai';
import { togetherProvider } from './together';
import { fireworksProvider } from './fireworks';
import { falProvider } from './fal';
import { huggingfaceProvider } from './huggingface';
import { geminiProvider } from './gemini';
import { elevenlabsProvider } from './elevenlabs';
import { assemblyaiProvider } from './assemblyai';
import { speechmaticsProvider } from './speechmatics';
import { sonioxProvider } from './soniox';

/** Catalog metadata for the UI. Independent of runtime impl. */
export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'local',
    name: 'Local (whisper.cpp)',
    docsUrl: 'https://github.com/ggerganov/whisper.cpp',
    envKey: '',
    description: 'Runs offline on your machine. No API key needed. First use downloads the model.',
    capabilities: {
      wordTimestamps: true,
      diarization: false,
      translate: true,
      asyncOnly: false,
      maxDurationSec: 999999,
      maxFileMB: 10000,
      acceptedFormats: ['wav', 'flac', 'mp3'],
    },
    models: [
      { id: 'ggml-tiny', label: 'Tiny (75MB, fastest, lower quality)', pricingUsdPerMin: null },
      { id: 'ggml-base', label: 'Base (142MB)', pricingUsdPerMin: null },
      { id: 'ggml-small', label: 'Small (466MB)', pricingUsdPerMin: null },
      { id: 'ggml-medium', label: 'Medium (1.5GB, recommended)', pricingUsdPerMin: null },
      { id: 'ggml-large-v3', label: 'Large v3 (3.1GB, best quality)', pricingUsdPerMin: null },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    docsUrl: 'https://console.groq.com/docs/speech-text',
    envKey: 'GROQ_API_KEY',
    description: 'Cheapest hosted Whisper. Free tier 7,200 sec/day.',
    capabilities: {
      wordTimestamps: true,
      diarization: false,
      translate: true,
      asyncOnly: false,
      maxDurationSec: 14400,
      maxFileMB: 100,
      acceptedFormats: ['flac', 'mp3', 'wav', 'm4a', 'webm', 'mp4'],
    },
    models: [
      { id: 'whisper-large-v3', label: 'Whisper Large v3', pricingUsdPerMin: 0.00185 },
      { id: 'whisper-large-v3-turbo', label: 'Whisper Large v3 Turbo (fastest)', pricingUsdPerMin: 0.00067 },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    docsUrl: 'https://platform.openai.com/docs/guides/speech-to-text',
    envKey: 'OPENAI_API_KEY',
    description: 'Whisper-1 + gpt-4o-transcribe. 25 MB cap per request.',
    capabilities: {
      wordTimestamps: true,
      diarization: false,
      translate: true,
      asyncOnly: false,
      maxDurationSec: 999999,
      maxFileMB: 25,
      acceptedFormats: ['flac', 'mp3', 'wav', 'm4a', 'webm', 'mp4'],
    },
    models: [
      { id: 'whisper-1', label: 'Whisper-1 (segments + words)', pricingUsdPerMin: 0.006 },
      { id: 'gpt-4o-transcribe', label: 'GPT-4o Transcribe (text only)', pricingUsdPerMin: 0.006 },
      { id: 'gpt-4o-mini-transcribe', label: 'GPT-4o Mini Transcribe (text only, cheap)', pricingUsdPerMin: 0.003 },
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    docsUrl: 'https://docs.together.ai/docs/audio-models',
    envKey: 'TOGETHER_API_KEY',
    description: 'Open-source Whisper hosted cheaply. $1 free credit.',
    capabilities: {
      wordTimestamps: true,
      diarization: false,
      translate: true,
      asyncOnly: false,
      maxDurationSec: 999999,
      maxFileMB: 100,
      acceptedFormats: ['flac', 'mp3', 'wav', 'm4a', 'webm', 'mp4'],
    },
    models: [
      { id: 'openai/whisper-large-v3', label: 'Whisper Large v3', pricingUsdPerMin: 0.0015 },
    ],
  },
  {
    id: 'fireworks',
    name: 'Fireworks',
    docsUrl: 'https://docs.fireworks.ai/api-reference/audio-transcriptions',
    envKey: 'FIREWORKS_API_KEY',
    description: 'Cheapest batch Whisper. OpenAI-compatible API.',
    capabilities: {
      wordTimestamps: true,
      diarization: false,
      translate: true,
      asyncOnly: false,
      maxDurationSec: 999999,
      maxFileMB: 1024,
      acceptedFormats: ['flac', 'mp3', 'wav', 'm4a', 'webm', 'mp4'],
    },
    models: [
      { id: 'whisper-v3', label: 'Whisper v3 Large', pricingUsdPerMin: 0.0015 },
      { id: 'whisper-v3-turbo', label: 'Whisper v3 Large Turbo (fastest)', pricingUsdPerMin: 0.0009 },
    ],
  },
  {
    id: 'fal',
    name: 'Fal.ai',
    docsUrl: 'https://fal.ai/models/fal-ai/whisper/api',
    envKey: 'FAL_KEY',
    description: 'Cheapest hosted Whisper variant. Pay-per-second.',
    capabilities: {
      wordTimestamps: false,
      diarization: false,
      translate: true,
      asyncOnly: false,
      maxDurationSec: 999999,
      maxFileMB: 50,
      acceptedFormats: ['flac', 'mp3', 'wav', 'm4a', 'mp4', 'webm'],
    },
    models: [
      { id: 'fal-ai/whisper', label: 'Whisper (turbo)', pricingUsdPerMin: 0.0005 },
      { id: 'fal-ai/wizper', label: 'Wizper (large v3)', pricingUsdPerMin: 0.001 },
    ],
  },
  {
    id: 'huggingface',
    name: 'HuggingFace',
    docsUrl: 'https://huggingface.co/docs/api-inference',
    envKey: 'HF_TOKEN',
    description: 'Direct access to Egyptian Arabic fine-tunes. ≤30s clips only — use Replicate for longer.',
    capabilities: {
      wordTimestamps: false,
      diarization: false,
      translate: true,
      asyncOnly: false,
      maxDurationSec: 30,
      maxFileMB: 25,
      acceptedFormats: ['flac', 'mp3', 'wav', 'm4a'],
    },
    models: [
      { id: 'MAdel121/whisper-medium-egy', label: 'Whisper Medium Egyptian (MAdel121)', pricingUsdPerMin: null },
      { id: 'AbdelrahmanHassan/whisper-large-v3-egyptian-arabic', label: 'Whisper Large v3 Egyptian (AbdelrahmanHassan)', pricingUsdPerMin: null },
      { id: 'IbrahimAmin/code-switched-egyptian-arabic-whisper-small', label: 'Code-switched Egyptian Whisper Small', pricingUsdPerMin: null },
      { id: 'tarteel-ai/whisper-base-ar-quran', label: 'Tarteel Quranic Arabic', pricingUsdPerMin: null },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/audio',
    envKey: 'GEMINI_API_KEY',
    description: 'Long-form audio (up to 9.5 hours). Free tier available.',
    capabilities: {
      wordTimestamps: false,
      diarization: false,
      translate: true,
      asyncOnly: false,
      maxDurationSec: 9.5 * 3600,
      maxFileMB: 20,
      acceptedFormats: ['flac', 'mp3', 'wav'],
    },
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', pricingUsdPerMin: 0.001 },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', pricingUsdPerMin: 0.003 },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', pricingUsdPerMin: 0.001 },
    ],
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    docsUrl: 'https://elevenlabs.io/docs/api-reference/speech-to-text',
    envKey: 'ELEVENLABS_API_KEY',
    description: 'Strong MSA quality with word-level timestamps.',
    capabilities: {
      wordTimestamps: true,
      diarization: true,
      translate: true,
      asyncOnly: false,
      maxDurationSec: 999999,
      maxFileMB: 1024,
      acceptedFormats: ['flac', 'mp3', 'wav', 'm4a', 'mp4', 'webm'],
    },
    models: [
      { id: 'scribe_v1', label: 'Scribe v1', pricingUsdPerMin: 0.0067 },
    ],
  },
  {
    id: 'assemblyai',
    name: 'AssemblyAI',
    docsUrl: 'https://www.assemblyai.com/docs',
    envKey: 'ASSEMBLYAI_API_KEY',
    description: 'Quality + code-switching. Async (1-2 min for typical files).',
    capabilities: {
      wordTimestamps: true,
      diarization: true,
      translate: false,
      asyncOnly: true,
      maxDurationSec: 999999,
      maxFileMB: 5000,
      acceptedFormats: ['mp3', 'wav', 'flac', 'm4a', 'mp4', 'webm'],
    },
    models: [
      { id: 'universal', label: 'Universal-2 (best quality)', pricingUsdPerMin: 0.0045 },
      { id: 'slam-1', label: 'Slam-1 (fastest)', pricingUsdPerMin: 0.0025 },
    ],
  },
  {
    id: 'speechmatics',
    name: 'Speechmatics',
    docsUrl: 'https://docs.speechmatics.com/',
    envKey: 'SPEECHMATICS_API_KEY',
    description: 'Explicit Egyptian Arabic + AR/EN code-switching. 8h/mo free tier.',
    capabilities: {
      wordTimestamps: true,
      diarization: true,
      translate: true,
      asyncOnly: true,
      maxDurationSec: 999999,
      maxFileMB: 2048,
      acceptedFormats: ['mp3', 'wav', 'flac', 'm4a', 'mp4', 'webm'],
    },
    models: [
      { id: 'enhanced', label: 'Ursa-2 Enhanced', pricingUsdPerMin: 0.005 },
      { id: 'standard', label: 'Standard', pricingUsdPerMin: 0.0027 },
    ],
  },
  {
    id: 'soniox',
    name: 'Soniox',
    docsUrl: 'https://soniox.com/docs/speech_to_text/api_reference/',
    envKey: 'SONIOX_API_KEY',
    description: 'Best Arabic WER (16.2%, includes Egyptian). $200 free credit.',
    capabilities: {
      wordTimestamps: true,
      diarization: true,
      translate: true,
      asyncOnly: true,
      maxDurationSec: 999999,
      maxFileMB: 2048,
      acceptedFormats: ['mp3', 'wav', 'flac', 'm4a', 'mp4', 'webm'],
    },
    models: [
      { id: 'stt-async-preview', label: 'STT Async Preview (multilingual incl. Arabic)', pricingUsdPerMin: 0.0017 },
    ],
  },
  {
    id: 'deepgram',
    name: 'Deepgram',
    docsUrl: 'https://developers.deepgram.com/docs',
    envKey: 'DEEPGRAM_API_KEY',
    description: 'Production Arabic incl. Egyptian dialect. $200 free credit.',
    capabilities: {
      wordTimestamps: true,
      diarization: true,
      translate: false,
      asyncOnly: false,
      maxDurationSec: 999999,
      maxFileMB: 2048,
      acceptedFormats: ['wav', 'flac', 'mp3', 'm4a', 'mp4', 'webm'],
    },
    models: [
      { id: 'nova-3', label: 'Nova-3 (Arabic incl. Egyptian)', pricingUsdPerMin: 0.0077 },
      { id: 'nova-2', label: 'Nova-2', pricingUsdPerMin: 0.0043 },
    ],
  },
  {
    id: 'replicate',
    name: 'Replicate',
    docsUrl: 'https://replicate.com/docs',
    envKey: 'REPLICATE_API_TOKEN',
    description: 'Run any HuggingFace Whisper checkpoint, including Egyptian dialect fine-tunes.',
    capabilities: {
      wordTimestamps: true,
      diarization: true,
      translate: true,
      asyncOnly: true,
      maxDurationSec: 999999,
      maxFileMB: 2048,
      acceptedFormats: ['mp3', 'wav', 'flac', 'm4a', 'mp4', 'webm'],
    },
    models: [
      { id: 'victor-upmeet/whisperx', label: 'WhisperX (word alignment + diarization)', pricingUsdPerMin: 0.0023 },
      { id: 'openai/whisper', label: 'Whisper Large v3', pricingUsdPerMin: 0.0023 },
    ],
  },
];

/** Filter catalog to providers whose key is set (or that need no key). */
export function enabledProviders(): ProviderInfo[] {
  return PROVIDERS.filter(p => {
    if (p.id === 'local') return true;
    return Boolean(config.keys[p.id as keyof typeof config.keys]);
  });
}

const _runtimeRegistry: Record<string, STTProvider> = {
  local: localWhisperProvider,
  groq: groqProvider,
  openai: openaiProvider,
  together: togetherProvider,
  fireworks: fireworksProvider,
  fal: falProvider,
  huggingface: huggingfaceProvider,
  gemini: geminiProvider,
  elevenlabs: elevenlabsProvider,
  assemblyai: assemblyaiProvider,
  speechmatics: speechmaticsProvider,
  soniox: sonioxProvider,
  deepgram: deepgramProvider,
  replicate: replicateProvider,
};

export function getProvider(id: string): STTProvider {
  const p = _runtimeRegistry[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export function isProviderEnabled(id: string): boolean {
  const meta = PROVIDERS.find(p => p.id === id);
  if (!meta) return false;
  if (meta.id === 'local') return true;
  return Boolean(config.keys[meta.id as keyof typeof config.keys]);
}
