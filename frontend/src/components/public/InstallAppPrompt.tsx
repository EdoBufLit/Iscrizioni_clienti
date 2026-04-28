import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const DISMISS_STORAGE_KEY = "assonam:pwa-install-dismissed-at";

const isStandaloneMode = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIosSafari = () => {
  const userAgent = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(userAgent) && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
};

const hasRecentDismiss = () => {
  const stored = window.localStorage.getItem(DISMISS_STORAGE_KEY);
  if (!stored) return false;

  const dismissedAt = Number(stored);
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_TTL_MS;
};

const persistDismiss = () => {
  window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
};

const clearDismiss = () => {
  window.localStorage.removeItem(DISMISS_STORAGE_KEY);
};

type Props = {
  hidden?: boolean;
};

const InstallAppPrompt = ({ hidden = false }: Props) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [interactionReady, setInteractionReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setInstalled(isStandaloneMode());
    setDismissed(hasRecentDismiss());

    const media = window.matchMedia("(display-mode: standalone)");

    const handleStandaloneChange = () => {
      if (!isStandaloneMode()) return;
      setInstalled(true);
      setDeferredPrompt(null);
      clearDismiss();
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredPrompt(installEvent);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      clearDismiss();
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", handleAppInstalled);
    media.addEventListener?.("change", handleStandaloneChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", handleAppInstalled);
      media.removeEventListener?.("change", handleStandaloneChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const activate = () => setInteractionReady(true);
    const timeout = window.setTimeout(activate, 3500);
    window.addEventListener("pointerdown", activate, { once: true, passive: true });
    window.addEventListener("keydown", activate, { once: true });
    window.addEventListener("scroll", activate, { once: true, passive: true });
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("pointerdown", activate);
      window.removeEventListener("keydown", activate);
      window.removeEventListener("scroll", activate);
    };
  }, []);

  const variant = useMemo(() => {
    if (installed || dismissed) return null;
    if (deferredPrompt) return "install";
    if (typeof window !== "undefined" && isIosSafari() && !isStandaloneMode()) return "ios";
    return null;
  }, [deferredPrompt, dismissed, installed]);

  if (!variant || !interactionReady) return null;

  const dismiss = () => {
    persistDismiss();
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        clearDismiss();
        setInstalled(true);
      } else {
        persistDismiss();
        setDismissed(true);
      }
      setDeferredPrompt(null);
    } finally {
      setInstalling(false);
    }
  };

  const title =
    variant === "install" ? "Installa ASSONAM" : "Aggiungi ASSONAM alla Home";
  const copy =
    variant === "install"
      ? "Apri il portale come app, con accesso rapido da home e desktop."
      : "Su iPhone puoi aggiungerla dalla condivisione di Safari, senza cambiare nulla nel browser.";

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 transition-all duration-200 sm:justify-end${
        hidden ? " translate-y-2 opacity-0" : " opacity-100"
      }`}
      aria-hidden={hidden}
    >
      <div className="pointer-events-auto flex w-full max-w-[28rem] items-start gap-3 rounded-[1.15rem] border border-white/70 bg-[rgba(246,250,250,0.92)] px-3 py-3 text-left shadow-[0_18px_44px_rgba(15,35,38,0.14)] backdrop-blur-xl">
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(15,61,58,0.12)] text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-brand">
          App
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm">{copy}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {variant === "install" ? (
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center rounded-full bg-slate-900 px-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70"
                onClick={handleInstall}
                disabled={installing}
              >
                {installing ? "Installazione..." : "Installa app"}
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              onClick={dismiss}
            >
              Non ora
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Chiudi suggerimento installazione app"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/70 hover:text-slate-700"
          onClick={dismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default InstallAppPrompt;
