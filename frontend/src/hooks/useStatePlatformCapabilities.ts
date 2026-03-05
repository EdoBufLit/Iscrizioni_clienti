import { useCallback, useEffect, useState } from "react";
import {
  fetchPlatformCapabilities,
  type PlatformCapabilities,
} from "../lib/api";

const DEFAULT_CAPABILITIES: PlatformCapabilities = {
  affiliazioneEnabled: false,
  stripeEnabled: false,
};

let cachedCapabilities: PlatformCapabilities | null = null;
let inflightCapabilitiesRequest: Promise<PlatformCapabilities> | null = null;

const normalizeCapabilities = (payload: PlatformCapabilities): PlatformCapabilities => ({
  affiliazioneEnabled: payload.affiliazioneEnabled === true,
  stripeEnabled: payload.stripeEnabled === true,
});

const loadCapabilities = async (): Promise<PlatformCapabilities> => {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }
  if (inflightCapabilitiesRequest) {
    return inflightCapabilitiesRequest;
  }

  inflightCapabilitiesRequest = fetchPlatformCapabilities()
    .then((payload) => {
      cachedCapabilities = normalizeCapabilities(payload);
      return cachedCapabilities;
    })
    .catch(() => {
      cachedCapabilities = DEFAULT_CAPABILITIES;
      return cachedCapabilities;
    })
    .finally(() => {
      inflightCapabilitiesRequest = null;
    });

  return inflightCapabilitiesRequest;
};

export function useStatePlatformCapabilities() {
  const [capabilities, setCapabilities] = useState<PlatformCapabilities | null>(cachedCapabilities);
  const [loading, setLoading] = useState<boolean>(!cachedCapabilities);

  const refresh = useCallback(async () => {
    setLoading(true);
    cachedCapabilities = null;
    const nextCapabilities = await loadCapabilities();
    setCapabilities(nextCapabilities);
    setLoading(false);
    return nextCapabilities;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolveCapabilities = async () => {
      const nextCapabilities = await loadCapabilities();
      if (cancelled) return;
      setCapabilities(nextCapabilities);
      setLoading(false);
    };

    void resolveCapabilities();
    return () => {
      cancelled = true;
    };
  }, []);

  return { capabilities, loading, refresh };
}

