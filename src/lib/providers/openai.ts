import 'server-only';
import type { STTProvider, TranscribeInput, TranscribeOutcome } from '@/types/provider';
import { config } from '../config';
import { wrapOpenAiCompat } from './openai-compat';

const URL_TRANSCRIBE = 'https://api.openai.com/v1/audio/transcriptions';
const URL_TRANSLATE = 'https://api.openai.com/v1/audio/translations';

const exec = wrapOpenAiCompat((input: TranscribeInput) => ({
  providerId: 'openai',
  providerName: 'OpenAI',
  url: input.task === 'translate' ? URL_TRANSLATE : URL_TRANSCRIBE,
  apiKey: config.keys.openai,
  // gpt-4o-transcribe / gpt-4o-mini-transcribe only support response_format=json (no segments).
  supportsVerboseJson: input.model === 'whisper-1',
  // Only whisper-1 returns word timestamps via timestamp_granularities.
  supportsWordTimestamps: input.model === 'whisper-1',
}));

export const openaiProvider: STTProvider = {
  id: 'openai',
  capabilities: {
    wordTimestamps: true,
    diarization: false,
    translate: true,
    asyncOnly: false,
    maxDurationSec: 999999,
    maxFileMB: 25,
    acceptedFormats: ['flac', 'mp3', 'wav', 'm4a', 'webm', 'mp4'],
  },
  start(input: TranscribeInput): Promise<TranscribeOutcome> {
    return exec(input);
  },
};
