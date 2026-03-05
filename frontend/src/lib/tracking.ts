export const trackUiEvent = (
  eventName: string,
  metadata?: Record<string, string | number | boolean | null>,
) => {
  if (typeof window === "undefined") return;

  const detail = {
    event: eventName,
    metadata: metadata ?? {},
    timestamp: Date.now(),
  };

  window.dispatchEvent(new CustomEvent("assonam:ui-event", { detail }));

  if (import.meta.env.DEV) {
    // Keep tracking lightweight until analytics provider hookup.
    console.info(`[tracking] ${eventName}`, metadata ?? {});
  }
};
