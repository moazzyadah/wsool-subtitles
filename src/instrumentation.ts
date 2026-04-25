/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Boots the background worker and runs a one-shot retention sweep.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const [{ startWorker }, { runCleanup }] = await Promise.all([
      import('./lib/worker'),
      import('./lib/cleanup'),
    ]);
    try {
      runCleanup();
    } catch (e) {
      console.error('[instrumentation] cleanup failed', e);
    }
    startWorker();
  }
}
