import { describe, expect, it } from "vitest";
import { isQuoteReminderYearAvailable, romeYear } from "./quoteReminders";

describe("quote reminder calendar", () => {
  it("does not allow reminders before launch or before the target year starts", () => {
    expect(isQuoteReminderYearAvailable(2027, new Date("2026-10-27T12:00:00Z"))).toBe(false);
    expect(isQuoteReminderYearAvailable(2026, new Date("2027-06-01T12:00:00Z"))).toBe(false);
    expect(isQuoteReminderYearAvailable(2028, new Date("2027-06-01T12:00:00Z"))).toBe(false);
    expect(isQuoteReminderYearAvailable(2027, new Date("2027-06-01T12:00:00Z"))).toBe(true);
  });

  it("uses the Rome new-year boundary rather than the browser or UTC year", () => {
    expect(romeYear(new Date("2026-12-31T22:59:59Z"))).toBe(2026);
    expect(isQuoteReminderYearAvailable(2027, new Date("2026-12-31T22:59:59Z"))).toBe(false);
    expect(romeYear(new Date("2026-12-31T23:00:00Z"))).toBe(2027);
    expect(isQuoteReminderYearAvailable(2027, new Date("2026-12-31T23:00:00Z"))).toBe(true);
  });
});
