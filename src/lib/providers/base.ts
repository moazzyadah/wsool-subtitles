import 'server-only';
import type { ProviderError, TranscribeOutcome } from '@/types/provider';

export function classifyError(status: number | undefined, msg: string): ProviderError {
  // 429 / 5xx / network — retryable, may fall back to next provider
  // 4xx (except 429) — config/input error, fail loudly, do not fall back
  const retryable = status === 429 || status === undefined || (status >= 500 && status < 600);
  return { message: msg, status, retryable };
}

export function failed(status: number | undefined, msg: string): TranscribeOutcome {
  return { kind: 'failed', error: classifyError(status, msg) };
}

/** Throws ProviderError-shaped error if the response is not OK. */
export async function ensureOk(res: Response, providerName: string): Promise<void> {
  if (res.ok) return;
  let body = '';
  try { body = await res.text(); } catch { /* ignore */ }
  // Cap to avoid logging huge HTML error pages
  const snippet = body.length > 300 ? body.slice(0, 300) + '...' : body;
  const err = new Error(`${providerName} HTTP ${res.status}: ${snippet}`);
  (err as Error & { status?: number }).status = res.status;
  throw err;
}
