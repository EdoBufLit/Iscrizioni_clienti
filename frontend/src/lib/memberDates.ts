const memberDateFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** API timestamps without an offset are UTC; date-only values stay calendar dates. */
export function formatMemberDate(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return "-";
  const calendarPart = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(raw);
  if (!calendarPart) return "-";
  const calendar = new Date(`${raw.slice(0, 10)}T12:00:00Z`);
  if (
    Number.isNaN(calendar.getTime()) ||
    calendar.getUTCFullYear() !== Number(calendarPart[1]) ||
    calendar.getUTCMonth() + 1 !== Number(calendarPart[2]) ||
    calendar.getUTCDate() !== Number(calendarPart[3])
  ) return "-";
  const normalized = raw.length === 10
    ? `${raw}T12:00:00Z`
    : /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? "-" : memberDateFormatter.format(parsed);
}
