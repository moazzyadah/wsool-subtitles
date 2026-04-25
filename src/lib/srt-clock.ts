/**
 * Pure client-safe time helpers for the editor.
 *
 * `src/lib/srt.ts` is `server-only` because it pulls in segment grouping
 * logic that depends on regex tables we don't want shipped to the browser.
 * The editor only needs format/parse/shift on individual values, so they
 * live here.
 */

/** seconds (float) → "HH:MM:SS,mmm" SRT clock format. */
export function secondsToSrtClock(sec: number): string {
  const safe = Math.max(0, sec);
  const hh = String(Math.floor(safe / 3600)).padStart(2, '0');
  const mm = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const ss = String(Math.floor(safe % 60)).padStart(2, '0');
  const ms = String(Math.floor((safe - Math.floor(safe)) * 1000)).padStart(3, '0');
  return `${hh}:${mm}:${ss},${ms}`;
}

/** seconds (float) → "MM:SS" — for compact UI display. */
export function secondsToShortClock(sec: number): string {
  const safe = Math.max(0, sec);
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(Math.floor(safe % 60)).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Shift a value by a millisecond delta, clamped to >= 0. */
export function shiftSeconds(value: number, deltaMs: number): number {
  return Math.max(0, value + deltaMs / 1000);
}
