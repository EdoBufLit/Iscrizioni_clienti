import { type ReactNode, useEffect } from "react";

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
}: ModalShellProps) => {
  useEffect(() => {
    if (!open || !closeOnEscape) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeOnEscape, onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={`modal-overlay fixed inset-0 ${zIndexClassName} flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200`}
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (closeOnOverlay && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={`modal-panel relative w-full ${sizeClassName} ${contentClassName}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="pr-10">
            <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
            {description ? (
              <p className="mt-1 text-sm leading-6 text-neutral-500">{description}</p>
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
