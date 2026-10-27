export const FIRST_QUOTE_REMINDER_YEAR = 2027;

export function romeYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Europe/Rome" }).format(now));
}

export function isQuoteReminderYearAvailable(year: number, now = new Date()): boolean {
  return year >= FIRST_QUOTE_REMINDER_YEAR && year <= romeYear(now);
}
