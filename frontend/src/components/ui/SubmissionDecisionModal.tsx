import { useEffect, useState } from "react";
import AsyncActionButton, { type AsyncActionState } from "./AsyncActionButton";
import ModalShell from "./ModalShell";

type SubmissionDecisionModalProps = {
  open: boolean;
  mode: "confirmed" | "rejected";
  title: string;
  description: string;
  confirmLabel: string;
  confirmState?: AsyncActionState;
  error?: string | null;
  onClose: () => void;
  onConfirm: (values: { reason?: string }) => void;
};

const SubmissionDecisionModal = ({
  open,
  mode,
  title,
  description,
  confirmLabel,
  confirmState = "idle",
  error,
  onClose,
  onConfirm,
}: SubmissionDecisionModalProps) => {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const modalDescription =
    mode === "confirmed"
      ? "La richiesta passa a confermata. Gli eventuali WhatsApp al socio partono solo dalle regole configurate in WhatsApp > Automazioni."
      : description.includes("WhatsApp")
        ? "Il motivo viene salvato nell'audit. Gli eventuali WhatsApp di rigetto partono solo dalle regole configurate in WhatsApp > Automazioni."
        : description;

  useEffect(() => {
    if (!open) return;
    setReason("");
    setLocalError(null);
  }, [open]);

  return (
    <ModalShell open={open} title={title} description={modalDescription} onClose={onClose} sizeClassName="submission-decision-modal max-w-lg">
      <div className="space-y-5">
        {mode === "rejected" ? (
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-neutral-500">Motivo del rigetto</label>
            <textarea
              className="mt-2 min-h-[120px] w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
              value={reason}
              placeholder="Es. posti esauriti, disponibilita terminata, dati non sufficienti."
              onChange={(event) => {
                setReason(event.target.value);
                if (localError) setLocalError(null);
              }}
            />
          </div>
        ) : null}

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
          Il messaggio WhatsApp al socio viene inviato dalle regole configurate in Comunicazioni &gt; WhatsApp &gt; Automazioni.
          Questa azione aggiorna lo stato operativo della richiesta.
        </div>
      </div>

      {localError || error ? (
        <div className="mt-4 rounded-xl border border-red-200/70 bg-red-50 px-4 py-3 text-sm text-red-700">
          {localError ?? error}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" className="btn-ghost" onClick={onClose} disabled={confirmState === "loading"}>
          Annulla
        </button>
        <AsyncActionButton
          state={confirmState}
          idleLabel={confirmLabel}
          loadingLabel="Salvataggio..."
          successLabel="Salvato"
          errorLabel="Errore"
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          onClick={() => {
            const trimmedReason = reason.trim();
            if (mode === "rejected" && !trimmedReason) {
              setLocalError("Il motivo del rigetto e obbligatorio.");
              return;
            }
            onConfirm({ reason: trimmedReason || undefined });
          }}
        />
      </div>
    </ModalShell>
  );
};

export default SubmissionDecisionModal;
