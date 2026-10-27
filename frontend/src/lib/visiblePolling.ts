/** One polling cycle at a time, with cancellation and no hidden/offline traffic. */
export function startVisiblePolling(tick: (signal: AbortSignal) => Promise<void>, delay: number) {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | null = null;
  let running = false;
  let resumeImmediately = false;
  let failures = 0;
  const visible = () => !document.hidden && navigator.onLine !== false;
  const schedule = (wait: number) => {
    clearTimeout(timer);
    if (!disposed && visible()) timer = setTimeout(run, wait);
  };
  async function run() {
    if (disposed || !visible() || running) return;
    running = true;
    controller = new AbortController();
    const current = controller;
    try { await tick(current.signal); failures = 0; }
    catch { if (!current.signal.aborted) failures += 1; }
    finally {
      running = false;
      if (controller === current) controller = null;
      schedule(resumeImmediately ? 0 : Math.min(30000, delay * 2 ** failures));
      resumeImmediately = false;
    }
  }
  const onVisibility = () => {
    clearTimeout(timer);
    if (!visible()) controller?.abort();
    else if (running) resumeImmediately = true;
    else schedule(0);
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", onVisibility);
  window.addEventListener("offline", onVisibility);
  schedule(delay);
  return () => {
    disposed = true;
    controller?.abort();
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", onVisibility);
    window.removeEventListener("offline", onVisibility);
  };
}
