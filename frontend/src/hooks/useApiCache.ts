import { useCallback, useSyncExternalStore } from "react";
import { readCachedApi, subscribeApiCache } from "../lib/swrCache";

/** Subscribe to the same snapshot used for an immediate warm-route render. */
export function useApiCache<T>(key: string): T | undefined {
  const subscribe = useCallback((changed: () => void) => subscribeApiCache(updatedKey => { if (updatedKey === key) changed(); }), [key]);
  const snapshot = useCallback(() => readCachedApi<T>(key), [key]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
