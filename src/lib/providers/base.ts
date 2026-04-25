import 'server-only';
import type { ProviderError, TranscribeOutcome } from '@/types/provider';

/**
 * Default classification:
 *   - 429 / explicit 5xx → retryable (let fallback chain pick the next provider)
 *   - undefined → NOT retryable; callers that know the failure is transient
 *     (e.g. fetch network error) should pass `retryable: true` explicitly
 *   - everything else (4xx auth/input errors, terminal provider job states) →
 *     non-retryable; fail loudly so misconfiguration surfaces
 */
export function classifyError(status: number | undefined, msg: string): ProviderError {
  const retryable = status === 429 || (typeof status === 'number' && status >= 500 && status < 600);
  return { message: msg, status, retryable };
}

/** Build a failed outcome. `retryable` overrides the default classification. */
export function failed(status: number | undefined, msg: string, retryable?: boolean): TranscribeOutcome {
  const err = classifyError(status, msg);
  if (typeof retryable === 'boolean') err.retryable = retryable;
  return { kind: 'failed', error: err };
}

/**
 * Throws a status-tagged error if the response is not OK.
 * Body snippets are NEVER attached to the thrown message — they routinely
 * contain echoed request data, internal IDs, or auth metadata. The full body
 * is logged server-side for debugging via console.warn instead.
 */
export async function ensureOk(res: Response, providerName: string): Promise<void> {
  if (res.ok) return;
  let body = '';
  try { body = await res.text(); } catch { /* ignore */ }
  if (body) console.warn(`[${providerName}] HTTP ${res.status} body:`, body.slice(0, 1000));
  const err = new Error(`${providerName} HTTP ${res.status}`);
  (err as Error & { status?: number }).status = res.status;
  throw err;
}
