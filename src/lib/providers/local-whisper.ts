import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { STTProvider, TranscribeInput, TranscribeOutcome, TranscriptionResult, Word, Segment } from '@/types/provider';
import { config } from '../config';
import { failed } from './base';

const execFileAsync = promisify(execFile);

/**
 * Local whisper.cpp provider — works fully offline, no API key.
 *
 * Strategy: shell out to a `whisper-cli` binary if present on PATH, or guide the
 * user to install it. Models are auto-downloaded from HuggingFace on first use
 * (typr pattern). Output is parsed from whisper.cpp's JSON format.
 */

const HF_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';
const VALID_MODELS = ['ggml-tiny', 'ggml-base', 'ggml-small', 'ggml-medium', 'ggml-large-v3'] as const;

function modelPath(modelId: string): string {
  return path.join(config.localModelsDir, `${modelId}.bin`);
}

async function ensureModel(modelId: string): Promise<string> {
  if (!VALID_MODELS.includes(modelId as (typeof VALID_MODELS)[number])) {
    throw new Error(`Invalid local model: ${modelId}`);
  }
  const dest = modelPath(modelId);
  if (fs.existsSync(dest)) return dest;

  fs.mkdirSync(config.localModelsDir, { recursive: true });
  const url = `${HF_BASE}/${modelId}.bin`;
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download model from ${url}`);

  const tmp = `${dest}.partial`;
  const out = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!out.write(value)) {
        await new Promise<void>(r => out.once('drain', () => r()));
      }
    }
  } finally {
    reader.releaseLock();
  }
  await new Promise<void>((resolve, reject) => {
    out.end((err: NodeJS.ErrnoException | null | undefined) => (err ? reject(err) : resolve()));
  });
  fs.renameSync(tmp, dest);
  return dest;
}

async function findWhisperBinary(): Promise<string> {
  const candidates = ['whisper-cli', 'whisper.cpp', 'main', 'whisper'];
  for (const name of candidates) {
    try {
      const { stdout } = await execFileAsync('which', [name]);
      const p = stdout.trim();
      if (p) return p;
    } catch { /* try next */ }
  }
  throw new Error(
    'whisper.cpp binary not found. Install via:\n' +
    '  macOS: brew install whisper-cpp\n' +
    '  Linux: see https://github.com/ggerganov/whisper.cpp\n' +
    '  Windows: download from https://github.com/ggerganov/whisper.cpp/releases\n' +
    'Then ensure `whisper-cli` is on your PATH.'
  );
}

interface WhisperJsonSegment {
  start: number;
  end: number;
  text: string;
  tokens?: Array<{ text: string; t0: number; t1: number; p?: number }>;
}

interface WhisperJsonOutput {
  systeminfo?: string;
  result?: { language?: string; duration?: number };
  transcription?: WhisperJsonSegment[];
}

async function runWhisperCpp(input: TranscribeInput, modelFile: string): Promise<TranscriptionResult> {
  const bin = await findWhisperBinary();

  // Write audio to a temp WAV file (whisper.cpp wants WAV, 16kHz mono)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsool-'));
  const wavPath = path.join(tmpDir, 'in.wav');
  fs.writeFileSync(wavPath, input.audio);

  const outBase = path.join(tmpDir, 'out');
  const args = [
    '-m', modelFile,
    '-f', wavPath,
    '-of', outBase,
    '-oj',                  // output JSON
    '--print-progress',
  ];
  if (input.language && input.language !== 'auto') args.push('-l', input.language);
  if (input.task === 'translate') args.push('--translate');

  try {
    await execFileAsync(bin, args, { maxBuffer: 50 * 1024 * 1024 });
    const jsonPath = `${outBase}.json`;
    const jsonRaw = fs.readFileSync(jsonPath, 'utf8');
    const json = JSON.parse(jsonRaw) as WhisperJsonOutput;

    const segments: Segment[] = [];
    const words: Word[] = [];

    for (const seg of json.transcription ?? []) {
      segments.push({
        text: String(seg.text).trim(),
        start: seg.start / 1000, // whisper.cpp gives ms when -oj
        end: seg.end / 1000,
      });
      for (const tok of seg.tokens ?? []) {
        if (!tok.text || tok.text.startsWith('[_')) continue;
        words.push({
          text: tok.text,
          start: tok.t0 / 1000,
          end: tok.t1 / 1000,
          confidence: tok.p,
        });
      }
    }

    const text = segments.map(s => s.text).join(' ').trim();
    return {
      text,
      language: json.result?.language ?? input.language ?? 'auto',
      durationSec: json.result?.duration ?? (segments.length ? segments[segments.length - 1]!.end : 0),
      words,
      segments,
      actualProvider: 'local',
      raw: json,
    };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

export const localWhisperProvider: STTProvider = {
  id: 'local',
  capabilities: {
    wordTimestamps: true,
    diarization: false,
    translate: true,
    asyncOnly: false,
    maxDurationSec: 999999,
    maxFileMB: 10000,
    acceptedFormats: ['wav', 'flac', 'mp3'],
  },
  async start(input: TranscribeInput): Promise<TranscribeOutcome> {
    try {
      const modelFile = await ensureModel(input.model);
      const result = await runWhisperCpp(input, modelFile);
      return { kind: 'done', result };
    } catch (e) {
      const msg = (e as Error).message ?? 'Local whisper error';
      return failed(undefined, msg);
    }
  },
};
