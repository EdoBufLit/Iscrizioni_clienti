type PerfConfig = {
  enabled: boolean;
  sampleRate: number;
  inpThrottleMs: number;
  longTaskThrottleMs: number;
  maxLogsPerRoute: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const parseNumber = (value: unknown, fallback: number) => {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseSampleRate = (value: unknown, fallback: number) =>
  clamp(parseNumber(value, fallback), 0, 1);

export const getPerfConfig = (): PerfConfig => {
  const env = import.meta.env;
  const forceEnabled = env.VITE_PERF_LOG === "1";
  const enabled = env.DEV || forceEnabled;
  const sampleRate = forceEnabled
    ? 1
    : parseSampleRate(env.VITE_PERF_SAMPLE_RATE, 0.1);
  const inpThrottleMs = Math.max(
    500,
    parseNumber(env.VITE_PERF_INP_THROTTLE_MS, 2000)
  );
  const longTaskThrottleMs = Math.max(
    500,
    parseNumber(env.VITE_PERF_LONGTASK_THROTTLE_MS, 2000)
  );
  const maxLogsPerRoute = Math.max(
    1,
    parseNumber(env.VITE_PERF_MAX_LOGS_PER_ROUTE, 12)
  );

  return {
    enabled,
    sampleRate,
    inpThrottleMs,
    longTaskThrottleMs,
    maxLogsPerRoute,
  };
};

export const isPerfEnabled = () => getPerfConfig().enabled;
