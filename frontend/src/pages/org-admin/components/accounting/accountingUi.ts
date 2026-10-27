export const accountingInput =
  "theme-input mt-1 w-full border border-[var(--theme-border-strong)] px-3 py-2.5 text-base";
export const accountingLabel =
  "block text-sm font-semibold text-[var(--theme-text)]";

export const receiptMethodLabels = {
  cash: "Contanti",
  bank_transfer: "Bonifico",
  other: "Altro",
  sumup: "SumUp",
} as const;
export const receiptStatusLabels = {
  unmatched: "Da abbinare",
  partial: "Parzialmente abbinato",
  matched: "Abbinato",
  voided: "Annullato",
} as const;
export const receiptSourceLabels = {
  manual: "Registrazione manuale",
  csv: "Importazione CSV",
  legacy_manual: "Pagamento precedente",
  provider: "Pagamento online",
} as const;

export function formatCents(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(
    cents / 100,
  );
}

export function centsInput(cents: number) {
  return `${Math.trunc(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}

export function parseCents(value: string, allowZero = false): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.replace(",", ".").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) &&
    cents <= 999_999_999 &&
    (allowZero ? cents >= 0 : cents > 0)
    ? cents
    : null;
}

export function formatReceiptDate(value: string) {
  const normalized =
    value.length === 10
      ? `${value}T12:00:00Z`
      : /[zZ]$|[+-]\d{2}:\d{2}$/.test(value)
        ? value
        : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeZone: "Europe/Rome",
    ...(value.length > 10 ? { timeStyle: "short" } : {}),
  }).format(date);
}

export function mutationKey() {
  return `accounting-${crypto.randomUUID()}`;
}
