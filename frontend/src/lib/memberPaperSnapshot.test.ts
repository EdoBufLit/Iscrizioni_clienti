import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberProfile } from "./api";
import { clearMemberSnapshot, readMemberSnapshot, saveMemberSnapshot } from "./memberSnapshot";

afterEach(() => { clearMemberSnapshot(); vi.useRealTimers(); });

describe("Tessera cartacea offline", () => {
  it("conserva l’asterisco e la numerazione distinta nello snapshot", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
    const profile = { id: 4, status: "active", first_name: "Anna", last_name: "Collaudo", email: "", phone: null, fiscal_code: null, joined_at: null, card_no: 28696, card_year: 2026, card_namespace: "paper_exception", card_number_label: "28696*", card_status: "active", valid_until: "2027-01-01T22:59:59Z", card_verification_url: "https://example.test/v/paper-card", organization: { id: 2, name: "Club", slug: "club" } } satisfies MemberProfile;
    saveMemberSnapshot(profile);
    expect(readMemberSnapshot()?.profile.card_number_label).toBe("28696*");
    expect(readMemberSnapshot()?.profile.card_namespace).toBe("paper_exception");
  });
});
