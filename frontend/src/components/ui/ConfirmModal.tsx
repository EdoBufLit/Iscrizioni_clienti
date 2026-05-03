import { useEffect, useState } from "react";
import AsyncActionButton, { type AsyncActionState } from "./AsyncActionButton";
import ModalShell from "./ModalShell";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "brand" | "danger";
  objectName?: string;
  impact?: string;
  errorMessage?: string;
  requireCheckbox?: boolean;
  checkboxLabel?: string;
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
  objectName,
  impact,
  errorMessage,
  requireCheckbox = false,
  checkboxLabel = "Confermo di voler procedere",
  confirmState = "idle",
  onClose,
  onConfirm,
}: ConfirmModalProps) => {
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!open) setConfirmed(false);
  }, [open]);

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
        {objectName ? (
          <p>
            Elemento: <span className="font-semibold text-neutral-800">{objectName}</span>
          </p>
        ) : null}
        <p className={objectName ? "mt-2" : ""}>
          {impact || "Questa operazione modifica i dati selezionati e non va eseguita per errore."}
        </p>
      </div>
      {requireCheckbox ? (
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-brand focus:ring-brand"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>{checkboxLabel}</span>
        </label>
      ) : null}
      {errorMessage ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </p>
      ) : null}
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
          disabled={requireCheckbox && !confirmed}
          onClick={onConfirm}
        />
      </div>
    </ModalShell>
  );
};

export default ConfirmModal;
