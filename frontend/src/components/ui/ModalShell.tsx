import { type ReactNode, type RefObject, useEffect, useId, useRef } from "react";

type ModalShellProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  sizeClassName?: string;
  zIndexClassName?: string;
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
  contentClassName?: string;
  initialFocusRef?: RefObject<HTMLElement>;
};

const ModalShell = ({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  sizeClassName = "max-w-lg",
  zIndexClassName = "z-[90]",
  closeOnOverlay = true,
  closeOnEscape = true,
  contentClassName = "p-6",
  initialFocusRef,
}: ModalShellProps) => {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
    window.requestAnimationFrame(() => {
      const focusable = Array.from(panel?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
        .filter((node) => !node.hasAttribute("disabled") && node.tabIndex !== -1);
      (initialFocusRef?.current ?? focusable[0] ?? panel)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnEscape) {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panel) {
        return;
      }

      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (node) => !node.hasAttribute("disabled") && node.tabIndex !== -1,
      );
      if (nodes.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocusRef.current && document.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
    };
  }, [closeOnEscape, initialFocusRef, onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={`modal-overlay fixed inset-0 ${zIndexClassName} flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={(event) => {
        if (closeOnOverlay && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className={`modal-panel relative w-full ${sizeClassName} ${contentClassName}`}
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="pr-10">
            <h3 id={titleId} className="text-lg font-semibold text-neutral-900">{title}</h3>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm leading-6 text-neutral-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="modal-close absolute right-4 top-4 rounded-full p-2 transition"
            onClick={onClose}
            aria-label="Chiudi finestra"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-5">{children}</div>

        {footer ? <div className="mt-6 flex flex-wrap justify-end gap-3">{footer}</div> : null}
      </div>
    </div>
  );
};

export default ModalShell;
