import { describe, expect, it, vi, afterEach } from "vitest";
import { memberAccountStatus, memberNotificationHref } from "./memberAccount";
import type { MemberProfile } from "./api";
afterEach(() => vi.useRealTimers());
describe("Stato effettivo tessera", () => {
  it("distingue workflow attivo da tessera scaduta con timestamp UTC implicito", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
    expect(memberAccountStatus({ status: "active", valid_until: "2026-10-29T11:59:59", card_status: "non_attiva" } as MemberProfile)).toBe("expired");
    expect(memberAccountStatus({ status: "active", valid_until: "2027-01-01", card_status: "attiva" } as MemberProfile)).toBe("active");
  });
  it("non presenta come attiva una tessera non attiva anche senza scadenza", () => {
    expect(memberAccountStatus({ status: "active", card_status: "non_attiva" } as MemberProfile)).toBe("inactive");
  });
  it.each(["https://example.test", "//example.test", "/dashboard-evil", "javascript:alert(1)"])("rifiuta destinazione notifica %s", href => {
    expect(memberNotificationHref(href)).toBe("/dashboard");
  });
  it("conserva l'identificativo del documento da correggere", () => {
    expect(memberNotificationHref("/dashboard/documenti?document_id=5")).toBe("/dashboard/documenti?document_id=5");
  });
});
