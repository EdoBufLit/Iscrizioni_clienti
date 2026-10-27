import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../lib/api", () => ({ fetchPlatformCapabilities: () => mocks.fetch() }));
const enabled = { affiliazioneEnabled: true, stripeEnabled: false, stripeConnectDemoEnabled: false,
  affiliationVideoEnabled: false, videoWorkerEnabled: false };

describe("platform capability recovery", () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); mocks.fetch.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it("shares an inflight request and recovers from a transient error", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("network")).mockResolvedValue(enabled);
    const { useStatePlatformCapabilities } = await import("./useStatePlatformCapabilities");
    const first = renderHook(useStatePlatformCapabilities);
    const second = renderHook(useStatePlatformCapabilities);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(first.result.current.capabilities?.affiliazioneEnabled).toBe(true);
    expect(second.result.current.capabilities?.affiliazioneEnabled).toBe(true);
  });

  it("never caches failure as disabled and updates every consumer after retry", async () => {
    mocks.fetch.mockRejectedValue(new Error("network"));
    const { useStatePlatformCapabilities } = await import("./useStatePlatformCapabilities");
    const first = renderHook(useStatePlatformCapabilities);
    const second = renderHook(useStatePlatformCapabilities);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(first.result.current.error).toBe(true);
    expect(first.result.current.capabilities).toBeNull();
    mocks.fetch.mockResolvedValue(enabled);
    await act(async () => { await first.result.current.refresh(); });
    expect(first.result.current.error).toBe(false);
    expect(second.result.current.capabilities?.affiliazioneEnabled).toBe(true);
  });
});
