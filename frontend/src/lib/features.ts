const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function asEnabled(rawValue: unknown, fallback = false): boolean {
  if (rawValue == null) return fallback;
  const normalized = String(rawValue).trim().toLowerCase();
  if (!normalized) return fallback;
  return TRUE_VALUES.has(normalized);
}

export const AFFILIAZIONE_ENABLED = asEnabled(
  import.meta.env.VITE_AFFILIAZIONE_ENABLED,
  false,
);

