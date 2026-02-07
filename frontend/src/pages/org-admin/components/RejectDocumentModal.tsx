import { memo, useEffect, useState } from "react";

type RejectDocumentModalProps = {
  open: boolean;
  docLabel: string;
  initialNote?: string | null;
  isSubmitting: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (note: string) => void;
};

const RejectDocumentModal = memo(function RejectDocumentModal({
  open,
  docLabel,
  initialNote,
  isSubmitting,
  error,
  onClose,
  onConfirm,
}: RejectDocumentModalProps) {
  const [note, setNote] = useState(initialNote ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setNote(initialNote ?? "");
    setLocalError(null);
  }, [open, initialNote]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg surface-strong p-6 shadow-xl" data-component="orgadmin-reject-doc-modal">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">Rigetta documento</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Inserisci la motivazione del rigetto per {docLabel}.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100"
            onClick={onClose}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-neutral-600">
            Motivazione / Note *
          </label>
          <textarea
            className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            rows={4}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (localError) {
                setLocalError(null);
              }
            }}
            placeholder="Inserisci la motivazione del rigetto..."
          />
        </div>

        {(localError || error) && (
          <div className="mt-3 rounded-md border border-red-200/60 bg-red-50 px-4 py-3 text-sm text-red-700">
            {localError ?? error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Annulla
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              const trimmed = note.trim();
              if (!trimmed) {
                setLocalError("La motivazione e obbligatoria.");
                return;
              }
              onConfirm(trimmed);
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Salvataggio..." : "Conferma rigetto"}
          </button>
        </div>
      </div>
    </div>
  );
});

export default RejectDocumentModal;
