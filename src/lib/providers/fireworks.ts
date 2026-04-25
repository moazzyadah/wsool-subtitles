import 'server-only';
import type { STTProvider, TranscribeInput, TranscribeOutcome } from '@/types/provider';
import { config } from '../config';
import { wrapOpenAiCompat } from './openai-compat';

const exec = wrapOpenAiCompat(() => ({
  providerId: 'fireworks',
  providerName: 'Fireworks',
  url: 'https://audio-prod.us-virginia-1.direct.fireworks.ai/v1/audio/transcriptions',
  apiKey: config.keys.fireworks,
}));

export const fireworksProvider: STTProvider = {
  id: 'fireworks',
  capabilities: {
    wordTimestamps: true,
    diarization: false,
    translate: true,
    asyncOnly: false,
    maxDurationSec: 999999,
    maxFileMB: 1024,
    acceptedFormats: ['flac', 'mp3', 'wav', 'm4a', 'webm', 'mp4'],
  },
  start(input: TranscribeInput): Promise<TranscribeOutcome> {
    return exec(input);
  },
};
