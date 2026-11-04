import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateSwrCache, readCachedApi, subscribeApiCache, withSwrCache } from "./swrCache";
import { fetchOrgAdminMetrics, markOrgAdminNotificationRead, orgAdminLogout } from "./api";

afterEach(() => { invalidateSwrCache(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

describe("session read cache", () => {
  it("deduplicates concurrent reads, serves warm values, and publishes a background refresh", async () => {
    vi.useFakeTimers();
    const first = deferred<number>();
    const fetcher = vi.fn(() => first.promise);
    const one = withSwrCache("metrics", 30_000, fetcher);
    const two = withSwrCache("metrics", 30_000, fetcher);
    first.resolve(1);
    expect(await one).toBe(1); expect(await two).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readCachedApi("metrics")).toBe(1);
    await withSwrCache("metrics", 30_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_001);
    const fresh = deferred<number>(); fetcher.mockReturnValue(fresh.promise);
    const listener = vi.fn(); const stop = subscribeApiCache(listener);
    expect(await withSwrCache("metrics", 30_000, fetcher)).toBe(1);
    expect(await withSwrCache("metrics", 30_000, fetcher)).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    fresh.resolve(2); await fresh.promise; await Promise.resolve();
    expect(readCachedApi("metrics")).toBe(2); expect(listener).toHaveBeenCalledWith("metrics"); stop();
  });

  it("retries failed refreshes and does not swallow initial failures", async () => {
    vi.useFakeTimers();
    await withSwrCache("key", 10, async () => 1);
    vi.advanceTimersByTime(11);
    expect(await withSwrCache("key", 10, async () => { throw Error("offline"); })).toBe(1);
    await vi.runAllTimersAsync();
    expect(await withSwrCache("key", 10, async () => 2)).toBe(1);
    await vi.runAllTimersAsync();
    expect(readCachedApi("key")).toBe(2);
    await expect(withSwrCache("new", 10, async () => { throw Error("offline"); })).rejects.toThrow("offline");
  });

  it("cannot restore invalidated data after a session change or mutation", async () => {
    const old = deferred<number>();
    const request = withSwrCache("org:metrics", 30_000, () => old.promise);
    invalidateSwrCache("org:");
    await withSwrCache("org:metrics", 30_000, async () => 2);
    old.resolve(1); await request;
    expect(readCachedApi("org:metrics")).toBe(2);
  });

  it("invalidates reads after an API mutation and logout", async () => {
    let total = 1;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(
      String(input).includes("metrics") ? { active_members_count: total } : { ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchOrgAdminMetrics()).active_members_count).toBe(1);
    total = 2;
    expect((await fetchOrgAdminMetrics()).active_members_count).toBe(1);
    await markOrgAdminNotificationRead(4);
    expect((await fetchOrgAdminMetrics()).active_members_count).toBe(2);
    await orgAdminLogout();
    expect(readCachedApi("org-admin:metrics")).toBeUndefined();
  });
});
