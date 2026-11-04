type Entry<T = unknown> = { value?: T; expiresAt: number; promise?: Promise<T> };
const entries = new Map<string, Entry>();
const listeners = new Set<(key: string) => void>();

export function readCachedApi<T>(key: string): T | undefined {
  return entries.get(key)?.value as T | undefined;
}

export function subscribeApiCache(listener: (key: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function invalidateSwrCache(prefix = ""): void {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}

/** Deduplicated reads; stale values stay visible while a single refresh runs. */
export async function withSwrCache<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  let entry = entries.get(key) as Entry<T> | undefined;
  if (entry?.value !== undefined && entry.expiresAt > Date.now()) return entry.value;
  if (!entry) {
    entry = { expiresAt: 0 };
    if (entries.size >= 128) entries.delete(entries.keys().next().value!);
    entries.set(key, entry);
  }
  const current = entry;
  if (!current.promise) {
    current.promise = Promise.resolve().then(fetcher).then(value => {
      // Invalidated requests cannot repopulate the cache of a newer session/mutation.
      if (entries.get(key) === current) {
        current.value = value;
        current.expiresAt = Date.now() + ttlMs;
        current.promise = undefined;
        listeners.forEach(listener => listener(key));
      }
      return value;
    }, error => {
      if (entries.get(key) === current) {
        current.promise = undefined;
        if (current.value === undefined) entries.delete(key);
      }
      throw error;
    });
  }
  if (current.value !== undefined) {
    // A transient refresh failure retains the last value and permits the next retry.
    void current.promise.catch(() => undefined);
    return current.value;
  }
  return current.promise;
}
