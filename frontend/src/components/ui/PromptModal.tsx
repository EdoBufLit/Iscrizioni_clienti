import { useEffect, useState } from "react";
import AsyncActionButton, { type AsyncActionState } from "./AsyncActionButton";
import ModalShell from "./ModalShell";

type PromptModalProps = {
  open: boolean;
  title: string;
  description: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel: string;
  confirmState?: AsyncActionState;
  error?: string | null;
  onClose: () => void;
  onConfirm: (value: string) => void;
};

const PromptModal = ({
  open,
  title,
  description,
  label,
  placeholder,
  initialValue = "",
  confirmLabel,
  confirmState = "idle",
  error,
  onClose,
  onConfirm,
}: PromptModalProps) => {
  const [value, setValue] = useState(initialValue);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setValue(initialValue);
    setLocalError(null);
  }, [initialValue, open]);

  return (
    <ModalShell open={open} title={title} description={description} onClose={onClose} sizeClassName="max-w-xl">
      <div>
        <label className="block text-xs font-medium uppercase tracking-widest text-neutral-500">{label}</label>
        <textarea
          className="mt-2 min-h-[140px] w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            setValue(event.target.value);
            if (localError) {
              setLocalError(null);
            }
          }}
        />
      </div>

      {(localError || error) && (
        <div className="mt-4 rounded-xl border border-red-200/70 bg-red-50 px-4 py-3 text-sm text-red-700">
          {localError ?? error}
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          className="btn-ghost"
          onClick={onClose}
          disabled={confirmState === "loading"}
        >
          Annulla
        </button>
        <AsyncActionButton
          state={confirmState}
          idleLabel={confirmLabel}
          loadingLabel="Invio in corso..."
          successLabel="Salvato"
          errorLabel="Errore"
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          onClick={() => {
            const trimmed = value.trim();
            if (!trimmed) {
              setLocalError("Questo campo è obbligatorio.");
              return;
            }
            onConfirm(trimmed);
          }}
        />
      </div>
    </ModalShell>
  );
};

export default PromptModal;
