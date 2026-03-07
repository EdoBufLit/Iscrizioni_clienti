import { memo, useEffect, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";

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
    <ModalShell
      open={open}
      title="Rigetta documento"
      description={`Inserisci la motivazione del rigetto per ${docLabel}.`}
      onClose={onClose}
      sizeClassName="max-w-lg"
    >
      <div data-component="orgadmin-reject-doc-modal">
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
    </ModalShell>
  );
});

export default RejectDocumentModal;
