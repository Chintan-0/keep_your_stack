/**
 * Runs `worker` over every item with at most `concurrency` in flight at
 * once — used for metadata enrichment after a bookmark import so we never
 * fire hundreds of requests simultaneously. `onProgress` fires after each
 * item settles (success or failure) with the number completed so far.
 */
export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  let cursor = 0;
  let done = 0;
  const total = items.length;

  async function runNext(): Promise<void> {
    while (cursor < total) {
      const index = cursor++;
      try {
        await worker(items[index], index);
      } finally {
        done++;
        onProgress?.(done, total);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => runNext());
  await Promise.all(workers);
}
