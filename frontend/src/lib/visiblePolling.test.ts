import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startVisiblePolling } from "./visiblePolling";

describe("visible polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });
  afterEach(() => vi.useRealTimers());

  it("waits for completion, aborts when hidden and refreshes on return", async () => {
    let finish!: () => void;
    let currentSignal!: AbortSignal;
    const tick = vi.fn((signal: AbortSignal) => {
      currentSignal = signal;
      return new Promise<void>((resolve) => { finish = resolve; });
    });
    const stop = startVisiblePolling(tick, 4000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(16000);
    expect(tick).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(currentSignal.aborted).toBe(true);
    finish();
    await vi.advanceTimersByTimeAsync(30000);
    expect(tick).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(1);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
    expect(currentSignal.aborted).toBe(true);
    finish();
    await vi.advanceTimersByTimeAsync(30000);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("backs off on errors and stays quiet while offline", async () => {
    const tick = vi.fn().mockRejectedValue(new Error("offline"));
    const stop = startVisiblePolling(tick, 4000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(7999);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(tick).toHaveBeenCalledTimes(2);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
    await vi.advanceTimersByTimeAsync(60000);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
  });
});
