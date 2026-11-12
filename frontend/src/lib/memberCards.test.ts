import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, type MemberProfile } from "./api";
import { fetchMemberCards, linkMemberCard, selectMemberCard } from "./memberCards";
import { readMemberSnapshot, saveMemberSnapshot } from "./memberSnapshot";
import { invalidateSwrCache, readCachedApi, withSwrCache } from "./swrCache";

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  localStorage.clear(); sessionStorage.clear(); invalidateSwrCache();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); invalidateSwrCache(); });

describe("Cambio iscrizione", () => {
  it("invalida cache e tessera offline e avvisa le altre schede al cambio club", async () => {
    const profile = { id: 1, first_name: "Anna", last_name: "Rossi", status: "active", card_no: 123, card_year: 2026, card_status: "active", valid_until: "2027-01-01T22:59:59Z", card_verification_url: "https://example.test/v/card", organization: { id: 2, name: "Club", slug: "club" } } as MemberProfile;
    await withSwrCache("member:bookings", 30_000, async () => "old club");
    saveMemberSnapshot(profile);
    expect(readMemberSnapshot()).not.toBeNull();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok", member_id: 7 })));
    vi.stubGlobal("fetch", fetchMock);
    await selectMemberCard(7);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/member/cards/7/select", expect.objectContaining({ method: "POST", body: "{}" }));
    expect(readCachedApi("member:bookings")).toBeUndefined();
    expect(readMemberSnapshot()).toBeNull();
    expect(localStorage.getItem("assonam:auth-epoch:v1")).toMatch(/^\d+:/);
  });
  it("conserva dettaglio backend e non annuncia un cambio rifiutato", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Tessera non collegata." }), { status: 403 })));
    await expect(selectMemberCard(7)).rejects.toThrow("Tessera non collegata.");
    expect(localStorage.getItem("assonam:auth-epoch:v1")).toBeNull();
  });
  it("distingue una sessione scaduta da un elenco vuoto", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(fetchMemberCards()).rejects.toBeInstanceOf(AuthError);
  });
  it("trasmette numero e password nel corpo della richiesta di collegamento", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await linkMemberCard({ org_slug: "altro-club", card_number: "001234", password: "SyntheticOther123!" });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/member/cards/link", expect.objectContaining({ method: "POST", body: JSON.stringify({ org_slug: "altro-club", card_number: "001234", password: "SyntheticOther123!" }) }));
  });
});
