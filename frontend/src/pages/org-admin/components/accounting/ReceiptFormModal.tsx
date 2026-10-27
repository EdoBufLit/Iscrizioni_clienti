import { type FormEvent, useRef, useState } from "react";
import ModalShell from "../../../../components/ui/ModalShell";
import {
  AccountingError,
  adjustReceipt,
  createReceipt,
  type AccountingReceipt,
  type ReceiptDetail,
  type ReceiptInput,
} from "../../../../lib/accounting";
import { localPaymentDate } from "../../../../lib/temporaryMemberships";
import {
  accountingInput,
  accountingLabel,
  centsInput,
  formatCents,
  mutationKey,
  parseCents,
} from "./accountingUi";

type Props = {
  receipt?: AccountingReceipt;
  onClose: () => void;
  onSaved: (detail: ReceiptDetail) => void;
  onAuthError: (error: unknown) => void;
  onReload?: () => Promise<void>;
};

export default function ReceiptFormModal({
  receipt,
  onClose,
  onSaved,
  onAuthError,
  onReload,
}: Props) {
  const [amount, setAmount] = useState(
    receipt ? centsInput(receipt.amount_cents) : "",
  );
  const [method, setMethod] = useState<ReceiptInput["method"]>(
    receipt?.method === "sumup"
      ? "other"
      : (receipt?.method ?? "bank_transfer"),
  );
  const [paidOn, setPaidOn] = useState(receipt?.paid_on ?? localPaymentDate());
  const [payer, setPayer] = useState(receipt?.payer ?? "");
  const [reference, setReference] = useState(receipt?.reference ?? "");
  const [description, setDescription] = useState(receipt?.description ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const request = useRef<{ signature: string; key: string } | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const amountCents = parseCents(amount);
    if (amountCents === null) {
      setError(
        "Inserisci un importo positivo con al massimo due decimali, senza separatore delle migliaia.",
      );
      return;
    }
    if (receipt && amountCents < receipt.allocated_cents) {
      setError(
        `L'importo non può essere inferiore ai ${formatCents(receipt.allocated_cents)} già abbinati. Storna prima gli abbinamenti interessati.`,
      );
      return;
    }
    if (receipt && reason.trim().length < 3) {
      setError("Indica il motivo della rettifica (almeno 3 caratteri).");
      return;
    }
    const payload: ReceiptInput = {
      amount_cents: amountCents,
      currency: "EUR",
      method,
      paid_on: paidOn,
      payer: payer.trim() || null,
      reference: reference.trim() || null,
      description: description.trim() || null,
    };
    const editable = {
      amount_cents: payload.amount_cents,
      method: payload.method,
      paid_on: payload.paid_on,
      payer: payload.payer,
      reference: payload.reference,
      description: payload.description,
    };
    const body = receipt
      ? {
          ...editable,
          expected_version: receipt.version,
          reason: reason.trim(),
        }
      : payload;
    const signature = JSON.stringify(body);
    if (request.current?.signature !== signature)
      request.current = { signature, key: mutationKey() };
    setSaving(true);
    setError("");
    setConflict(false);
    try {
      const next = receipt
        ? await adjustReceipt(receipt.id, {
            ...editable,
            expected_version: receipt.version,
            reason: reason.trim(),
            request_key: request.current.key,
          })
        : await createReceipt({ ...payload, request_key: request.current.key });
      onSaved(next);
    } catch (failure) {
      onAuthError(failure);
      setConflict(failure instanceof AccountingError && failure.status === 409);
      setError(
        failure instanceof Error
          ? failure.message
          : "Impossibile salvare l'incasso.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open
      title={receipt ? `Rettifica incasso #${receipt.id}` : "Registra incasso"}
      description={
        receipt
          ? "Il movimento originale resta nello storico. La rettifica contabile non modifica i diritti della tessera."
          : "Registra un importo già ricevuto. L'abbinamento alle quote avviene in un passaggio successivo."
      }
      onClose={onClose}
      closeDisabled={saving}
      closeOnEscape={!saving}
      closeOnOverlay={!saving}
      sizeClassName="max-w-2xl"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={accountingLabel}>
            Importo ricevuto (EUR)
            <input
              className={accountingInput}
              inputMode="decimal"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="30,00"
              disabled={saving}
            />
          </label>
          <label className={accountingLabel}>
            Data incasso
            <input
              className={accountingInput}
              type="date"
              required
              max={localPaymentDate()}
              value={paidOn}
              onChange={(event) => setPaidOn(event.target.value)}
              disabled={saving}
            />
          </label>
        </div>
        <label className={accountingLabel}>
          Metodo
          <select
            className={accountingInput}
            value={method}
            onChange={(event) =>
              setMethod(event.target.value as ReceiptInput["method"])
            }
            disabled={saving}
          >
            <option value="bank_transfer">Bonifico</option>
            <option value="cash">Contanti</option>
            <option value="other">Altro</option>
          </select>
        </label>
        <label className={accountingLabel}>
          Ordinante o pagante
          <input
            className={accountingInput}
            value={payer}
            maxLength={200}
            onChange={(event) => setPayer(event.target.value)}
            disabled={saving}
          />
        </label>
        <label className={accountingLabel}>
          Riferimento del movimento
          <input
            className={accountingInput}
            value={reference}
            maxLength={200}
            onChange={(event) => setReference(event.target.value)}
            disabled={saving}
            placeholder="Es. riferimento del bonifico"
          />
        </label>
        <label className={accountingLabel}>
          Descrizione
          <textarea
            className={`${accountingInput} min-h-24`}
            value={description}
            maxLength={1000}
            onChange={(event) => setDescription(event.target.value)}
            disabled={saving}
          />
        </label>
        {receipt ? (
          <label className={accountingLabel}>
            Motivo della rettifica
            <textarea
              className={`${accountingInput} min-h-24`}
              value={reason}
              minLength={3}
              maxLength={1000}
              required
              onChange={(event) => setReason(event.target.value)}
              disabled={saving}
            />
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-[var(--theme-danger)]">
            {error}
          </p>
        ) : null}
        {conflict && onReload ? (
          <div className="rounded-lg border border-[var(--theme-border)] p-3 text-sm">
            <p>
              La ricevuta potrebbe essere cambiata. I dati inseriti restano qui
              finché non scegli di ricaricarla.
            </p>
            <button
              className="btn-secondary mt-3"
              type="button"
              disabled={saving}
              onClick={() => {
                void onReload().catch((failure) => {
                  onAuthError(failure);
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "Ricaricamento non riuscito.",
                  );
                });
              }}
            >
              Ricarica incasso
            </button>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <button
            className="btn-secondary"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Annulla
          </button>
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving
              ? "Salvataggio…"
              : receipt
                ? "Registra rettifica"
                : "Registra incasso"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
