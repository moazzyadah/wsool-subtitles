import 'server-only';
import type { STTProvider, TranscribeInput, TranscribeOutcome } from '@/types/provider';
import { config } from '../config';
import { wrapOpenAiCompat } from './openai-compat';

const exec = wrapOpenAiCompat(() => ({
  providerId: 'together',
  providerName: 'Together AI',
  url: 'https://api.together.xyz/v1/audio/transcriptions',
  apiKey: config.keys.together,
}));

export const togetherProvider: STTProvider = {
  id: 'together',
  capabilities: {
    wordTimestamps: true,
    diarization: false,
    translate: true,
    asyncOnly: false,
    maxDurationSec: 999999,
    maxFileMB: 100,
    acceptedFormats: ['flac', 'mp3', 'wav', 'm4a', 'webm', 'mp4'],
  },
  start(input: TranscribeInput): Promise<TranscribeOutcome> {
    return exec(input);
  },
};
