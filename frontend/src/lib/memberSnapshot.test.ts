import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberProfile } from "./api";
import { clearMemberSnapshot, readMemberSnapshot, saveMemberSnapshot } from "./memberSnapshot";

const profile = { id: 4, status: "active", first_name: "Anna", last_name: "Rossi", email: "private@example.test", phone: "private", fiscal_code: "private", card_no: 123, card_year: 2026, card_status: "active", valid_until: "2030-01-01T00:00:00Z", card_verification_url: "https://example.test/v/card", organization: { id: 2, name: "Club", slug: "club" } } as MemberProfile;
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-04T12:00:00Z")); });
afterEach(() => vi.useRealTimers());
describe("Offline member card", () => {
  it("conserva tessera e sincronizzazione senza contatti o codice fiscale", () => {
    saveMemberSnapshot(profile);
    expect(readMemberSnapshot()?.profile.card_no).toBe(123);
    expect(localStorage.getItem("assonam:member-card-snapshot:v2")).not.toContain("private");
    expect(readMemberSnapshot()?.savedAt).toBeGreaterThan(0);
  });
  it("non espone lo snapshot senza identitÃ  della sessione", () => {
    saveMemberSnapshot(profile); sessionStorage.clear();
    expect(readMemberSnapshot()).toBeNull();
  });
  it("invalida lo snapshot dopo sette giorni, alla scadenza e al logout", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-04T12:00:00Z")); saveMemberSnapshot(profile);
    vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000); expect(readMemberSnapshot()).toBeNull();
    saveMemberSnapshot({ ...profile, valid_until: "2020-01-01" }); expect(readMemberSnapshot()).toBeNull();
    saveMemberSnapshot(profile); clearMemberSnapshot(); expect(readMemberSnapshot()).toBeNull();
  });
  it("applica la fine annualità italiana anche senza valid_until nello snapshot", () => {
    vi.setSystemTime(new Date("2027-01-01T12:00:00Z"));
    saveMemberSnapshot({ ...profile, valid_until: null });
    expect(readMemberSnapshot()).not.toBeNull();
    vi.setSystemTime(new Date("2027-01-01T23:00:00Z"));
    expect(readMemberSnapshot()).toBeNull();
  });
  it("richiede una scadenza esplicita alle tessere temporanee", () => {
    saveMemberSnapshot({ ...profile, membership_type: "temporary", valid_until: null });
    expect(readMemberSnapshot()).toBeNull();
  });
  it("scarta dati corrotti e non conserva workflow inattivi", () => {
    localStorage.setItem("assonam:member-card-snapshot:v2", "bad json"); expect(readMemberSnapshot()).toBeNull();
    saveMemberSnapshot({ ...profile, status: "pending_verification" }); expect(readMemberSnapshot()).toBeNull();
  });
});
