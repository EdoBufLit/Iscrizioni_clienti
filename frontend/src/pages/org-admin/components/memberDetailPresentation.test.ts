import { describe, expect, it } from "vitest";
import type { OrgAdminMemberDetail } from "../../../lib/api";
import { displayMemberName, formatMemberDate, paymentMeta } from "./memberDetailPresentation";

describe("Member detail display semantics", () => {
  it("formats imported names while preserving intentional case", () => {
    expect(displayMemberName("mario", "d'angelo-rossi")).toBe("Mario D'Angelo-Rossi");
    expect(displayMemberName("ANNA", "McDonald")).toBe("Anna McDonald");
  });

  it("treats offset-free API datetimes as UTC and dates as calendar dates", () => {
    expect(formatMemberDate("2026-10-28T23:30:00", true)).toBe(formatMemberDate("2026-10-28T23:30:00Z", true));
    expect(formatMemberDate("2026-10-28T23:30:00", true)).toContain("29/10/2026");
    expect(formatMemberDate("1990-04-12")).toBe("12/04/1990");
  });

  it("does not infer free membership from disabled online payment, or hide a reversal", () => {
    const member = { payment_required: false, membership_fee_snapshot: 30 } as OrgAdminMemberDetail;
    expect(paymentMeta(member).label).toBe("In attesa");
    expect(paymentMeta({ ...member, membership_fee_snapshot: null }).label).toBe("Da verificare");
    expect(paymentMeta({ ...member, card_is_paid: true, payment_status: "manual_reversed" }).label).toBe("Incasso stornato");
  });
});
