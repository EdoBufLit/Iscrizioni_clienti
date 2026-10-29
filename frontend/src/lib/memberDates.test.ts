import { describe, expect, it } from "vitest";
import { formatMemberDate } from "./memberDates";

describe("formatMemberDate", () => {
  it("preserves date-only calendar values, including summer dates", () => {
    expect(formatMemberDate("2026-07-23")).toBe("23/07/2026");
    expect(formatMemberDate("2028-02-29")).toBe("29/02/2028");
  });

  it("interprets offset-free API timestamps as UTC and displays the Rome date", () => {
    expect(formatMemberDate("2026-07-23T23:30:00")).toBe("24/07/2026");
    expect(formatMemberDate("2026-10-29T23:30:00")).toBe("30/10/2026");
  });

  it("respects explicit offsets at calendar and daylight-saving boundaries", () => {
    expect(formatMemberDate("2026-10-29T00:30:00+02:00")).toBe("28/10/2026");
    expect(formatMemberDate("2026-03-28T23:30:00Z")).toBe("29/03/2026");
  });

  it("keeps missing and invalid values readable without inventing a date", () => {
    for (const value of [null, undefined, "", "not-a-date", "2026-02-29", "2026-02-31T10:00:00", "2026-13-01", "2026-07-23T25:00:00"]) {
      expect(formatMemberDate(value)).toBe("-");
    }
  });
});
