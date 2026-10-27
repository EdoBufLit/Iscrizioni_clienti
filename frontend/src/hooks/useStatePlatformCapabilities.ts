import { useCallback, useEffect, useSyncExternalStore } from "react";
import { fetchPlatformCapabilities, type PlatformCapabilities } from "../lib/api";

type Snapshot = { capabilities: PlatformCapabilities | null; loading: boolean; error: boolean };
let snapshot: Snapshot = { capabilities: null, loading: true, error: false };
let inflight: Promise<PlatformCapabilities | null> | null = null;
const listeners = new Set<() => void>();
const publish = (next: Snapshot) => { snapshot = next; listeners.forEach((listener) => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
const getSnapshot = () => snapshot;

async function loadCapabilities(force = false): Promise<PlatformCapabilities | null> {
  if (inflight) return inflight;
  if (snapshot.capabilities && !force) return snapshot.capabilities;
  publish({ ...snapshot, loading: true, error: false });
  inflight = (async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const payload = await fetchPlatformCapabilities();
        const capabilities = {
          affiliazioneEnabled: payload.affiliazioneEnabled === true,
          stripeEnabled: payload.stripeEnabled === true,
          stripeConnectDemoEnabled: payload.stripeConnectDemoEnabled === true,
          affiliationVideoEnabled: payload.affiliationVideoEnabled === true,
          videoWorkerEnabled: payload.videoWorkerEnabled === true,
        };
        publish({ capabilities, loading: false, error: false });
        return capabilities;
      } catch {
        if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
    // A network error is not evidence that a feature is disabled.
    publish({ ...snapshot, loading: false, error: true });
    return null;
  })().finally(() => { inflight = null; });
  return inflight;
}

export function useStatePlatformCapabilities() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const refresh = useCallback(() => loadCapabilities(true), []);
  useEffect(() => {
    void loadCapabilities();
    const retry = () => { if (snapshot.error) void loadCapabilities(true); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);
  return { ...state, refresh };
}
