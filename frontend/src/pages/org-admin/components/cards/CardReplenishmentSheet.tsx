import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import ModalShell from "../../../../components/ui/ModalShell";
import { useToast } from "../../../../components/ui/ToastProvider";
import {
  AuthError,
  CardReplenishmentError,
  createOrgAdminCardReplenishment,
  type CardReplenishmentCapability,
  type CardReplenishmentRequest,
} from "../../../../lib/api";
import { formatCents } from "../accounting/accountingUi";
import "./CardReplenishmentSheet.css";

type Props = {
  open: boolean;
  capability: CardReplenishmentCapability | null;
  loading: boolean;
  onClose: () => void;
  onCreated: (item: CardReplenishmentRequest, created: boolean) => void;
};

type PendingRequest = {
  key: string;
  payload: { requested_cards: number; requested_year: number; notes: string | null };
  unitPrice: number;
  currency: string;
};

function defaultQuantity(capability: CardReplenishmentCapability) {
  return String(Math.min(capability.max_quantity, Math.max(capability.min_quantity, 100)));
}

function validCapability(capability: CardReplenishmentCapability | null): capability is CardReplenishmentCapability {
  return Boolean(capability && Number.isSafeInteger(capability.min_quantity) && capability.min_quantity > 0
    && Number.isSafeInteger(capability.max_quantity) && capability.max_quantity >= capability.min_quantity
    && Number.isSafeInteger(capability.unit_price_cents) && capability.unit_price_cents >= 0
    && capability.allowed_years.length && capability.allowed_years.every(year => Number.isInteger(year) && year >= 2000 && year <= 9998)
    && capability.allowed_years.includes(capability.default_year));
}

function isDefinitiveFailure(error: unknown) {
  return error instanceof CardReplenishmentError && error.status >= 400 && error.status < 500
    && ![408, 409, 425, 429].includes(error.status);
}

export default function CardReplenishmentSheet({ open, capability, loading, onClose, onCreated }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const formId = useId();
  const [quantity, setQuantity] = useState("");
  const [year, setYear] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [frozenRequest, setFrozenRequest] = useState<PendingRequest | null>(null);
  const initialized = useRef(false);
  const pendingRequest = useRef<PendingRequest | null>(null);
  const busyRef = useRef(false);
  const callbacks = useRef({ onClose, onCreated });
  callbacks.current = { onClose, onCreated };
  const handleClose = useCallback(() => {
    if (!busyRef.current) callbacks.current.onClose();
  }, []);

  useEffect(() => {
    if (!validCapability(capability) || pendingRequest.current || busyRef.current) return;
    if (!initialized.current) {
      setQuantity(defaultQuantity(capability));
      setYear(String(capability.default_year));
      initialized.current = true;
    } else {
      setYear(current => capability.allowed_years.includes(Number(current)) ? current : String(capability.default_year));
    }
  }, [capability, frozenRequest]);

  const ready = validCapability(capability) && capability.can_auto_allocate;
  const frozen = Boolean(frozenRequest);
  const fieldsDisabled = busy || frozen || loading || !ready;
  const selectedQuantity = frozenRequest?.payload.requested_cards ?? Number(quantity);
  const unitPrice = frozenRequest?.unitPrice ?? capability?.unit_price_cents ?? 0;
  const currency = frozenRequest?.currency ?? capability?.currency ?? "EUR";
  const amountCents = selectedQuantity * unitPrice;
  const amountValid = Number.isSafeInteger(selectedQuantity) && selectedQuantity > 0 && Number.isSafeInteger(amountCents) && amountCents >= 0;
  const total = amountValid ? formatCents(amountCents, currency) : "—";
  const allowedYears = capability?.allowed_years ?? [];
  const requestYear = frozenRequest?.payload.requested_year;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyRef.current || loading || !ready) return;
    let pending = pendingRequest.current;
    if (!pending) {
      const cards = Number(quantity);
      const requestedYear = Number(year);
      if (!Number.isSafeInteger(cards) || cards < capability.min_quantity || cards > capability.max_quantity) {
        setError(`Inserisci un numero intero di tessere tra ${capability.min_quantity} e ${capability.max_quantity}.`);
        return;
      }
      if (!Number.isInteger(requestedYear) || !allowedYears.includes(requestedYear)) {
        setError("Seleziona un anno disponibile.");
        return;
      }
      if (!Number.isSafeInteger(cards * capability.unit_price_cents)) {
        setError("Importo non valido. Verifica la quantità.");
        return;
      }
      if (notes.trim().length > 1000) {
        setError("La nota può contenere al massimo 1000 caratteri.");
        return;
      }
      pending = {
        key: globalThis.crypto?.randomUUID?.() ?? `cards-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        payload: { requested_cards: cards, requested_year: requestedYear, notes: notes.trim() || null },
        unitPrice: capability.unit_price_cents,
        currency: capability.currency,
      };
      // Save both before awaiting: a lost response must only retry the exact same request.
      pendingRequest.current = pending;
      setFrozenRequest(pending);
    }

    busyRef.current = true;
    setBusy(true);
    setError("");
    let response: Awaited<ReturnType<typeof createOrgAdminCardReplenishment>>;
    try {
      response = await createOrgAdminCardReplenishment(pending.payload, pending.key);
    } catch (reason) {
      if (reason instanceof AuthError) {
        showToast({ tone: "error", title: "Sessione scaduta", message: "Accedi nuovamente e verifica gli ordini prima di riprovare." });
        navigate("/org-admin/login", { replace: true });
        return;
      }
      const definitive = isDefinitiveFailure(reason);
      if (definitive) {
        pendingRequest.current = null;
        setFrozenRequest(null);
      }
      setUncertain(!definitive);
      setError(reason instanceof Error ? reason.message : "Impossibile confermare l'esito della richiesta.");
      return;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }

    // The POST is confirmed. A later parent refresh cannot turn it into a failed submission.
    pendingRequest.current = null;
    setFrozenRequest(null);
    setUncertain(false);
    setError("");
    setNotes("");
    setQuantity(defaultQuantity(capability));
    setYear(String(capability.default_year));
    handleClose();
    const reportRefreshFailure = () => showToast({ tone: "info", title: `Richiesta #${response.item.id} registrata`, message: "Aggiorna l'elenco per vedere il lotto. Non inviare una nuova richiesta." });
    try {
      Promise.resolve(callbacks.current.onCreated(response.item, response.created)).catch(reportRefreshFailure);
    } catch {
      reportRefreshFailure();
    }
  };

  return <ModalShell open={open} title="Rifornimento tessere" placement="bottom" sizeClassName="max-w-lg card-replenishment-sheet" onClose={handleClose} closeDisabled={busy} closeOnEscape={!busy} closeOnOverlay={!busy} footer={<>
    <button type="button" className="btn-ghost" onClick={handleClose} disabled={busy}>{uncertain ? "Chiudi" : "Annulla"}</button>
    <button type="submit" form={formId} className="btn-primary" disabled={busy || loading || !ready}>
      {busy ? "Registrazione…" : uncertain ? "Riprova la stessa richiesta" : `Conferma rifornimento · ${total}`}
    </button>
  </>}>
    {loading && !capability ? <p role="status">Caricamento disponibilità…</p> : <form id={formId} aria-label="Richiesta rifornimento tessere" onSubmit={event => void handleSubmit(event)} className="card-replenishment-form">
      {!ready && <p role="alert" className="card-replenishment-form__error">{capability?.blocked_reason || "Il rifornimento non è disponibile. Riprova più tardi."}</p>}
      <fieldset disabled={fieldsDisabled}>
        <div className="card-replenishment-form__row">
          <label htmlFor={`${formId}-quantity`}>Quantità<input id={`${formId}-quantity`} type="number" inputMode="numeric" step="1" min={capability?.min_quantity ?? 1} max={capability?.max_quantity} required value={frozenRequest ? String(frozenRequest.payload.requested_cards) : quantity} onChange={event => { if (!pendingRequest.current && !busyRef.current) setQuantity(event.target.value); }} /></label>
          <label htmlFor={`${formId}-year`}>Anno<select id={`${formId}-year`} value={requestYear == null ? year : String(requestYear)} onChange={event => { if (!pendingRequest.current && !busyRef.current) setYear(event.target.value); }}>
            {requestYear != null && !allowedYears.includes(requestYear) && <option value={requestYear}>{requestYear}</option>}
            {allowedYears.map(allowedYear => <option key={allowedYear} value={allowedYear}>{allowedYear}</option>)}
          </select></label>
        </div>
        <label htmlFor={`${formId}-notes`}><span>Note <span className="font-normal">(facoltative)</span></span><textarea id={`${formId}-notes`} rows={2} maxLength={1000} value={frozenRequest ? frozenRequest.payload.notes ?? "" : notes} onChange={event => { if (!pendingRequest.current && !busyRef.current) setNotes(event.target.value); }} /></label>
      </fieldset>
      {ready && <div className="card-replenishment-form__amount"><span>{formatCents(unitPrice, currency)} per tessera</span><strong>Totale {total}</strong></div>}
      {ready && <p className="card-replenishment-form__impact">Confermando rendi subito disponibile il lotto e registri un debito di {total}. Il pagamento avviene separatamente.</p>}
      {error && <div role="alert" className="card-replenishment-form__error">{uncertain && <p className="font-semibold">Esito non confermato.</p>}<p>{error}</p>{uncertain && <p className="mt-2">Riprova la stessa richiesta per verificarne l'esito senza duplicarla. Quantità, anno e note restano bloccati anche chiudendo e riaprendo questo pannello.</p>}</div>}
    </form>}
  </ModalShell>;
}
