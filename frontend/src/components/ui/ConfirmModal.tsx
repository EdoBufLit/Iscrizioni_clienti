import AsyncActionButton, { type AsyncActionState } from "./AsyncActionButton";
import ModalShell from "./ModalShell";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "brand" | "danger";
  confirmState?: AsyncActionState;
  onClose: () => void;
  onConfirm: () => void;
};

const ConfirmModal = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Annulla",
  tone = "brand",
  confirmState = "idle",
  onClose,
  onConfirm,
}: ConfirmModalProps) => {
  const confirmClassName =
    tone === "danger"
      ? "rounded-xl border border-red-300/60 bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
      : "rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark";

  return (
    <ModalShell
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      sizeClassName="max-w-md"
    >
      <div className="theme-card-muted rounded-xl p-4 text-sm text-neutral-600">
        Conferma l'azione solo se vuoi proseguire subito.
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          className="btn-ghost"
          onClick={onClose}
          disabled={confirmState === "loading"}
        >
          {cancelLabel}
        </button>
        <AsyncActionButton
          state={confirmState}
          idleLabel={confirmLabel}
          loadingLabel="Operazione in corso..."
          successLabel="Completato"
          errorLabel="Errore"
          className={confirmClassName}
          onClick={onConfirm}
        />
      </div>
    </ModalShell>
  );
};

export default ConfirmModal;
