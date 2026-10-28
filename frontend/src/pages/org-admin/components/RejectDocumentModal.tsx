import { memo, useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
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
  const noteId = useId();
  const closeStateRef = useRef({ isSubmitting, onClose });
  closeStateRef.current = { isSubmitting, onClose };
  const handleClose = useCallback(() => {
    if (!closeStateRef.current.isSubmitting) closeStateRef.current.onClose();
  }, []);
  const [note, setNote] = useState(initialNote ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setNote(initialNote ?? "");
    setLocalError(null);
  }, [open, initialNote]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    const trimmed = note.trim();
    if (!trimmed) {
      setLocalError("La motivazione è obbligatoria.");
      return;
    }
    onConfirm(trimmed);
  };

  if (!open) {
    return null;
  }

  return (
    <ModalShell
      open={open}
      title="Rigetta documento"
      description={docLabel}
      onClose={handleClose}
      closeDisabled={isSubmitting}
      placement="bottom"
      sizeClassName="max-w-lg"
      contentClassName="member-detail-sheet rounded-t-[28px] border border-neutral-200 bg-white p-5 shadow-xl sm:p-6"
    >
      <form onSubmit={handleSubmit} noValidate aria-label="Motivazione del rigetto" data-component="orgadmin-reject-doc-modal">
        <div className="mt-4">
          <label htmlFor={noteId} className="block text-xs font-medium text-neutral-600">
            Motivazione / Note *
          </label>
          <textarea
            id={noteId}
            className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            rows={4}
            disabled={isSubmitting}
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
          <div role="alert" className="mt-3 rounded-md border border-red-200/60 bg-red-50 px-4 py-3 text-sm text-red-700">
            {localError ?? error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="btn-ghost"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Annulla
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Salvataggio..." : "Conferma rigetto"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
});

export default RejectDocumentModal;
