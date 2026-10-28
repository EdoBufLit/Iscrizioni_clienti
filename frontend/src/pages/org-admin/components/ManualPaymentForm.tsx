import { memo, useId, useRef, useState, type FormEvent } from "react";
import { localPaymentDate } from "../../../lib/temporaryMemberships";

export type ManualPaymentPayload = {
  amount: number;
  method: string;
  paid_at: string;
  notes?: string;
};

type Payment = {
  id: number;
  amount: number;
  method: string;
  paid_at: string | null;
  notes?: string | null;
};

type ManualPaymentFormProps = {
  payments?: Payment[];
  paymentMethodLabel: string;
  onSubmit: (payload: ManualPaymentPayload) => Promise<void>;
  embedded?: boolean;
};

const ManualPaymentForm = memo(function ManualPaymentForm({
  payments,
  paymentMethodLabel,
  onSubmit,
  embedded = false,
}: ManualPaymentFormProps) {
  const formId = useId();
  const submitLock = useRef(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("contanti");
  const [paidAt, setPaidAt] = useState(localPaymentDate);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;
    setError(null);
    setMessage(null);

    const parsedAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Inserisci un importo valido.");
      return;
    }
    if (!paidAt) {
      setError("Seleziona la data di pagamento.");
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    try {
      await onSubmit({
        amount: parsedAmount,
        method,
        paid_at: paidAt,
        notes: notes.trim() || undefined,
      });
      setAmount("");
      setNotes("");
      setMessage("Pagamento registrato con successo.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Pagamento manuale"
      aria-busy={submitting}
      className={embedded ? "space-y-4" : "bg-white rounded-xl shadow-sm border border-neutral-200 p-6"}
    >
      {!embedded && (
        <>
          <h2 className="text-lg font-semibold mb-2">Pagamento manuale</h2>
          <div className="mt-4 rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Modalità iscrizione selezionata
            </p>
            <p className="text-sm font-medium text-neutral-800">{paymentMethodLabel}</p>
          </div>
        </>
      )}

      {!embedded && payments && payments.length > 0 && (
        <div className="mt-4 rounded-lg border border-emerald-200/70 bg-emerald-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Ultimo pagamento
          </p>
          <div className="mt-1 text-sm text-emerald-900">
            <p className="font-medium">
              {payments[0].amount.toFixed(2)} EUR · {payments[0].method}
            </p>
            {payments[0].paid_at && (
              <p className="text-xs text-neutral-500">
                {new Date(payments[0].paid_at).toLocaleDateString("it-IT")}
              </p>
            )}
          </div>
        </div>
      )}

      <fieldset disabled={submitting} className={`${embedded ? "" : "mt-6 "}grid gap-4 md:grid-cols-2`} data-component="orgadmin-member-payment-form">
        <div>
          <label htmlFor={`${formId}-amount`} className="block text-xs font-medium text-neutral-600">Importo (EUR)</label>
          <input
            id={`${formId}-amount`}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
          />
        </div>
        <div>
          <label htmlFor={`${formId}-method`} className="block text-xs font-medium text-neutral-600">Metodo</label>
          <select
            id={`${formId}-method`}
            className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="contanti">Contanti</option>
            <option value="bonifico">Bonifico</option>
            <option value="altro">Altro</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${formId}-date`} className="block text-xs font-medium text-neutral-600">Data pagamento</label>
          <input
            id={`${formId}-date`}
            type="date"
            className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor={`${formId}-notes`} className="block text-xs font-medium text-neutral-600">Note</label>
          <textarea
            id={`${formId}-notes`}
            rows={3}
            className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Eventuali note sul pagamento..."
          />
        </div>
      </fieldset>

      <div className="mt-4 min-h-[24px]">
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-600">{message}</p>}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary w-full justify-center"
      >
        {submitting ? "Salvataggio..." : "Registra pagamento"}
      </button>

      {!embedded && payments && payments.length > 0 && (
        <div className="mt-6 rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Storico pagamenti
          </p>
          <ul className="mt-2 space-y-2 text-sm text-neutral-700">
            {payments.slice(0, 3).map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {payment.amount.toFixed(2)} EUR · {payment.method}
                  </p>
                  {payment.paid_at && (
                    <p className="text-xs text-neutral-500">
                      {new Date(payment.paid_at).toLocaleDateString("it-IT")}
                    </p>
                  )}
                  {payment.notes && (
                    <p className="text-xs text-neutral-500">Note: {payment.notes}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
});

export default ManualPaymentForm;
