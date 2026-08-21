import { describe, expect, it } from 'vitest';
import { createAnalysisQueue } from './analysisQueue.js';

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createAnalysisQueue', () => {
  it('never runs more than `concurrency` tasks at once, even when many are enqueued at once', async () => {
    const gates = [1, 2, 3, 4, 5].map(() => deferred());
    let maxObservedActive = 0;
    const queue = createAnalysisQueue({
      concurrency: 2,
      run: async (i) => {
        maxObservedActive = Math.max(maxObservedActive, queue.activeCount);
        await gates[i].promise;
      },
    });

    [0, 1, 2, 3, 4].forEach((i) => queue.enqueue(i));
    expect(queue.activeCount).toBe(2); // only 2 started immediately, rest pending

    gates[0].resolve();
    await Promise.resolve().then(() => Promise.resolve()); // let microtasks settle
    expect(queue.activeCount).toBeLessThanOrEqual(2);

    gates.forEach((g) => g.resolve());
    await new Promise((r) => setTimeout(r, 10));

    expect(maxObservedActive).toBeLessThanOrEqual(2);
  });

  it('processes every enqueued item exactly once, streaming results as each finishes', async () => {
    const results = [];
    const queue = createAnalysisQueue({
      concurrency: 2,
      run: async (item) => {
        await new Promise((r) => setTimeout(r, item.delay));
        results.push(item.id);
      },
    });

    queue.enqueue({ id: 'a', delay: 5 });
    queue.enqueue({ id: 'b', delay: 1 });
    queue.enqueue({ id: 'c', delay: 1 });

    await new Promise((r) => setTimeout(r, 30));
    expect(results.sort()).toEqual(['a', 'b', 'c']);
  });

  it('continues processing later items even if an earlier one throws', async () => {
    const results = [];
    const queue = createAnalysisQueue({
      concurrency: 1,
      run: async (item) => {
        if (item === 'bad') throw new Error('boom');
        results.push(item);
      },
    });

    queue.enqueue('bad');
    queue.enqueue('good');

    await new Promise((r) => setTimeout(r, 10));
    expect(results).toEqual(['good']);
  });
});
