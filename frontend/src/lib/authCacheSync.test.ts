import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, fetchMe, fetchOrgAdminMe, type MemberProfile } from "./api";
import { observeAuthIdentity, publishAuthChange } from "./authCacheSync";
import { readMemberSnapshot, saveMemberSnapshot } from "./memberSnapshot";
import { invalidateSwrCache, readCachedApi, withSwrCache } from "./swrCache";

const EPOCH = "assonam:auth-epoch:v1";
const member = { id: 1, first_name: "Anna", last_name: "Rossi", status: "active", card_no: 123,
  card_year: 2026, card_status: "active", valid_until: "2027-01-01T00:00:00Z",
  card_verification_url: "https://example.test/v/card", organization: { id: 2, name: "Club", slug: "club" },
} as MemberProfile;

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  localStorage.clear(); sessionStorage.clear(); invalidateSwrCache();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
});
afterEach(() => {
  invalidateSwrCache(); localStorage.clear(); sessionStorage.clear();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("Private cache across authentication tabs", () => {
  it("records the first identity and preserves a stable session without publishing an epoch", async () => {
    await withSwrCache("member:bookings", 30_000, async () => "current member"); saveMemberSnapshot(member);
    observeAuthIdentity("member", 1, 2);
    observeAuthIdentity("member", 1, 2);
    expect(localStorage.getItem(EPOCH)).toBeNull();
    expect(readCachedApi("member:bookings")).toBe("current member");
    expect(readMemberSnapshot()).not.toBeNull();
  });

  it.each([[7, 2], [1, 9]])("invalidates and publishes when a server-established identity changes to %s in tenant %s", async (id, orgId) => {
    observeAuthIdentity("member", 1, 2);
    await withSwrCache("member:bookings", 30_000, async () => "old member"); saveMemberSnapshot(member);
    observeAuthIdentity("member", id, orgId);
    expect(localStorage.getItem(EPOCH)).toMatch(/^\d+:/);
    expect(readCachedApi("member:bookings")).toBeUndefined();
    expect(readMemberSnapshot()).toBeNull();
    const epoch = localStorage.getItem(EPOCH);
    await withSwrCache("member:bookings", 30_000, async () => "new member");
    observeAuthIdentity("member", id, orgId);
    expect(localStorage.getItem(EPOCH)).toBe(epoch);
    expect(readCachedApi("member:bookings")).toBe("new member");
  });

  it("separates role identities so concurrently open member and admin pages do not reload each other", async () => {
    observeAuthIdentity("member", 1, 2);
    observeAuthIdentity("org-admin", 8, 9);
    observeAuthIdentity("super-admin", 15);
    await withSwrCache("member:bookings", 30_000, async () => "member");
    for (let index = 0; index < 3; index += 1) {
      observeAuthIdentity("member", 1, 2);
      observeAuthIdentity("org-admin", 8, 9);
      observeAuthIdentity("super-admin", 15);
    }
    expect(localStorage.getItem(EPOCH)).toBeNull();
    expect(readCachedApi("member:bookings")).toBe("member");
  });

  it("observes the identity returned by the member profile endpoint after a magic-link login", async () => {
    observeAuthIdentity("member", 9, 2);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(member), { status: 200 })));
    expect((await fetchMe()).id).toBe(member.id);
    expect(localStorage.getItem(EPOCH)).toMatch(/^\d+:/);
  });

  it("observes the identity returned by the organization administrator profile endpoint", async () => {
    observeAuthIdentity("org-admin", 9, 2);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: 8, org_id: 2 }), { status: 200 })));
    expect((await fetchOrgAdminMe()).id).toBe(8);
    expect(localStorage.getItem(EPOCH)).toMatch(/^\d+:/);
  });

  it("clears private caches and offline identity after another tab changes account", async () => {
    await withSwrCache("member:bookings", 30_000, async () => ({ memberId: 1 }));
    await withSwrCache("org-admin:members", 30_000, async () => ({ associationId: 2 }));
    saveMemberSnapshot(member);
    expect(readMemberSnapshot()).not.toBeNull();
    window.dispatchEvent(new StorageEvent("storage", { key: EPOCH, oldValue: "old-account", newValue: "new-account", storageArea: localStorage }));
    expect(readCachedApi("member:bookings")).toBeUndefined();
    expect(readCachedApi("org-admin:members")).toBeUndefined();
    expect(readMemberSnapshot()).toBeNull();
    expect(sessionStorage.getItem("assonam:member-card-identity:v2")).toBeNull();
  });

  it("does not clear a private session for unrelated storage changes", async () => {
    await withSwrCache("member:bookings", 30_000, async () => ({ memberId: 1 })); saveMemberSnapshot(member);
    window.dispatchEvent(new StorageEvent("storage", { key: "theme", newValue: "dark", storageArea: localStorage }));
    expect(readCachedApi("member:bookings")).toEqual({ memberId: 1 });
    expect(readMemberSnapshot()).not.toBeNull();
  });

  it("prevents an in-flight old-account request from repopulating the cache after a storage event", async () => {
    let finish!: (value: string) => void;
    const request = withSwrCache("member:bookings", 30_000, () => new Promise<string>(resolve => { finish = resolve; }));
    await Promise.resolve();
    window.dispatchEvent(new StorageEvent("storage", { key: EPOCH, newValue: "new-account", storageArea: localStorage }));
    await withSwrCache("member:bookings", 30_000, async () => "new account");
    finish("old account"); await request;
    expect(readCachedApi("member:bookings")).toBe("new account");
  });

  it.each([
    ["/api/auth/login", "POST"], ["/api/auth/logout", "POST"],
    ["/api/org-admin/auth/login", "POST"], ["/api/org-admin/auth/logout", "POST"],
    ["/api/super-admin/auth/logout", "POST"], ["/api/org-admin/auth/verify?token=synthetic", "GET"],
  ])("publishes an auth epoch only after successful %s", async (path, method) => {
    let respond!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
    const response = apiFetch(path, { method });
    expect(localStorage.getItem(EPOCH)).toBeNull();
    respond(new Response("{}", { status: 200 })); await response;
    expect(localStorage.getItem(EPOCH)).toMatch(/^\d+:/);
  });

  it.each([401, 403, 500])("does not broadcast a failed login (%s) as an account change", async status => {
    localStorage.setItem(EPOCH, "existing-session");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));
    await apiFetch("/api/auth/login", { method: "POST" });
    expect(localStorage.getItem(EPOCH)).toBe("existing-session");
  });

  it("keeps successful authentication usable when localStorage is disabled", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Storage denied", "SecurityError"); });
    expect(() => publishAuthChange()).not.toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect((await apiFetch("/api/auth/login", { method: "POST" })).ok).toBe(true);
  });
});
