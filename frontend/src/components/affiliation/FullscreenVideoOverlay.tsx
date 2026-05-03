import { useEffect, useState } from "react";

type FullscreenVideoOverlayProps = {
  open: boolean;
  onClose: () => void;
  associationName: string;
  videoUrl: string | null;
  preparing: boolean;
  errorText?: string | null;
  statusLabel: string;
  onRetry?: () => void;
};

const FullscreenVideoOverlay = ({
  open,
  onClose,
  associationName,
  videoUrl,
  preparing,
  errorText,
  statusLabel,
  onRetry,
}: FullscreenVideoOverlayProps) => {
  const [showPlayer, setShowPlayer] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowPlayer(false);
      return;
    }
    const revealTimer = window.setTimeout(() => setShowPlayer(true), 850);
    return () => window.clearTimeout(revealTimer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fullscreen-video-overlay fixed inset-0 z-[95] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Video post iscrizione"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="fullscreen-video-overlay__shadows" aria-hidden="true">
        <span className="fullscreen-video-shadow fullscreen-video-shadow--a" />
        <span className="fullscreen-video-shadow fullscreen-video-shadow--b" />
        <span className="fullscreen-video-shadow fullscreen-video-shadow--c" />
      </div>

      <button
        type="button"
        className="absolute right-4 top-4 z-[2] inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/35 bg-black/50 text-sm font-semibold text-white transition hover:bg-black/75"
        onClick={onClose}
        aria-label="Chiudi video"
      >
        X
      </button>

      <div className={`fullscreen-video-overlay__content ${showPlayer ? "is-visible" : ""}`}>
        <div className="mb-3 text-center">
          <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-200/90">ASSONAM</p>
          <p className="mt-1 text-sm font-semibold text-white/95">{associationName}</p>
        </div>

        {videoUrl ? (
          <div className="overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl">
            <div className="aspect-video w-[min(100%,1100px)]">
              <video
                key={videoUrl}
                src={videoUrl}
                controls
                autoPlay
                muted
                playsInline
                className="h-full w-full object-contain"
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-[42vh] w-[min(100%,980px)] items-center justify-center rounded-2xl border border-white/20 bg-black/65 px-5 py-8 text-center">
            <div className="max-w-xl space-y-3">
              {preparing ? (
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/35 border-t-cyan-300" />
              ) : null}
              <h3 className="text-2xl font-semibold text-white">
                {preparing ? "Sto preparando il video..." : "Video non ancora disponibile"}
              </h3>
              <p className="text-sm text-neutral-200">
                La pratica è stata registrata. Appena il rendering termina, il player viene mostrato qui.
              </p>
              {errorText ? (
                <p className="text-sm text-amber-300">{errorText}</p>
              ) : null}
              {onRetry && errorText ? (
                <button
                  type="button"
                  className="btn-ghost mt-2 inline-flex"
                  onClick={onRetry}
                >
                  Riprova
                </button>
              ) : null}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-md border border-white/15 bg-black/35 px-3 py-2 text-center text-xs text-neutral-100">
          {statusLabel}
        </div>
      </div>
    </div>
  );
};

export default FullscreenVideoOverlay;
