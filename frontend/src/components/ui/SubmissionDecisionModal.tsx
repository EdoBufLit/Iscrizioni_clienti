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
  defaultMessage?: string;
  onClose: () => void;
  onConfirm: (values: { reason?: string; whatsappMessage?: string }) => void;
};

const SubmissionDecisionModal = ({
  open,
  mode,
  title,
  description,
  confirmLabel,
  confirmState = "idle",
  error,
  defaultMessage = "",
  onClose,
  onConfirm,
}: SubmissionDecisionModalProps) => {
  const [reason, setReason] = useState("");
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setReason("");
    setWhatsappMessage("");
    setLocalError(null);
  }, [open]);

  return (
    <ModalShell open={open} title={title} description={description} onClose={onClose} sizeClassName="max-w-2xl">
      <div className="space-y-5">
        {mode === "rejected" ? (
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-neutral-500">Motivo del rigetto</label>
            <textarea
              className="mt-2 min-h-[120px] w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
              value={reason}
              placeholder="Es. posti esauriti, disponibilità terminata, dati non sufficienti."
              onChange={(event) => {
                setReason(event.target.value);
                if (localError) {
                  setLocalError(null);
                }
              }}
            />
          </div>
        ) : null}

        <div>
          <label className="block text-xs font-medium uppercase tracking-widest text-neutral-500">
            Messaggio WhatsApp personalizzato (opzionale)
          </label>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            Se lo lasci vuoto verrà usato il template configurato del form. Puoi inserire testo libero oppure placeholder come
            {" "}
            <code>{"{{nome_contatto}}"}</code>, <code>{"{{nome_associazione}}"}</code>, <code>{"{{slot_prenotazione}}"}</code>,
            {" "}
            <code>{"{{persone_prenotazione}}"}</code>.
          </p>
          <textarea
            className="mt-3 min-h-[150px] w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
            value={whatsappMessage}
            placeholder={defaultMessage || "Scrivi un messaggio personalizzato oppure lascia vuoto per usare il template base."}
            onChange={(event) => setWhatsappMessage(event.target.value)}
          />
        </div>
      </div>

      {(localError || error) ? (
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
          loadingLabel="Invio in corso..."
          successLabel="Salvato"
          errorLabel="Errore"
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          onClick={() => {
            const trimmedReason = reason.trim();
            const trimmedMessage = whatsappMessage.trim();
            if (mode === "rejected" && !trimmedReason) {
              setLocalError("Il motivo del rigetto ? obbligatorio.");
              return;
            }
            onConfirm({
              reason: trimmedReason || undefined,
              whatsappMessage: trimmedMessage || undefined,
            });
          }}
        />
      </div>
    </ModalShell>
  );
};

export default SubmissionDecisionModal;
