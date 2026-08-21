/**
 * Simple concurrency-limited task queue — used so captures stream in and
 * get analyzed as they arrive (not one big wait at the end) while capping
 * how many concurrent vision API calls are in flight at once.
 *
 * @template T
 * @param {{ concurrency: number, run: (item: T) => Promise<void> }} args
 */
export function createAnalysisQueue({ concurrency, run }) {
  const pending = [];
  let active = 0;

  function pump() {
    while (active < concurrency && pending.length > 0) {
      const item = pending.shift();
      active += 1;
      Promise.resolve(run(item))
        .catch((error) => {
          // Safety net only — `run` is expected to catch its own errors (e.g. captureUI.js
          // calls setCaptureFailed on the session). This just guarantees the queue itself
          // never leaves an unhandled rejection, which would otherwise crash the page/process.
          console.error('[analysisQueue] task failed:', error);
        })
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  function enqueue(item) {
    pending.push(item);
    pump();
  }

  return { enqueue, get activeCount() { return active; }, get pendingCount() { return pending.length; } };
}
