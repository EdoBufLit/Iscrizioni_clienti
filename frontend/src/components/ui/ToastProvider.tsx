import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: number;
  title?: string;
  message: string;
  tone: ToastTone;
};

type ShowToastInput = {
  title?: string;
  message: string;
  tone?: ToastTone;
};

type ToastContextValue = {
  showToast: (input: ShowToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneClassName: Record<ToastTone, string> = {
  success: "border-emerald-200 bg-emerald-50/95 text-emerald-900",
  error: "border-red-200 bg-red-50/95 text-red-900",
  info: "border-neutral-200 bg-white/95 text-neutral-900",
};

let toastId = 1;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    ({ title, message, tone = "info" }: ShowToastInput) => {
      const id = toastId++;
      setItems((prev) => [...prev, { id, title, message, tone }]);
      window.setTimeout(() => removeToast(id), 3200);
    },
    [removeToast],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[140] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur animate-in slide-in-from-right-4 duration-200 ${toneClassName[item.tone]}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                {item.title ? (
                  <p className="text-xs font-bold uppercase tracking-widest opacity-70">{item.title}</p>
                ) : null}
                <p className="mt-1 text-sm font-semibold leading-5">{item.message}</p>
              </div>
              <button
                type="button"
                className="rounded-full p-1 text-current/50 transition hover:bg-black/5 hover:text-current"
                onClick={() => removeToast(item.id)}
                aria-label="Chiudi notifica"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
};
