import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmModal from "../../components/ui/ConfirmModal";
import {
  cancelTemporaryPurchase, createTemporaryPurchase, fetchTemporaryOffer, fetchTemporaryPurchase, formatTemporaryAmount,
  formatTemporaryDate, temporaryMethodLabels, temporaryStatusLabels,
  type TemporaryOffer, type TemporaryPaymentMethod, type TemporaryPurchase,
} from "../../lib/temporaryMemberships";

const pending = (purchase: TemporaryPurchase | null) => !!purchase && ["payment_pending", "manual_pending", "paid_waiting_card"].includes(purchase.status);

export default function TemporaryMembershipPanel({ onIssued }: { onIssued: () => Promise<void> }) {
  const [offer, setOffer] = useState<TemporaryOffer | null>(null);
  const [purchase, setPurchase] = useState<TemporaryPurchase | null>(null);
  const [method, setMethod] = useState<TemporaryPaymentMethod>("contanti");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [cancelOpen, setCancelOpen] = useState(false);
  const issuedCallback = useRef(onIssued);
  issuedCallback.current = onIssued;

  useEffect(() => {
    const controller = new AbortController();
    fetchTemporaryOffer(controller.signal).then(data => {
      setOffer(data);
      setPurchase(data.current_purchase);
      const currentMethod = data.current_purchase?.method;
      setMethod(currentMethod && currentMethod !== "legacy" ? currentMethod : data.offer?.methods[0] ?? "contanti");
      setError(null);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Impossibile caricare le tessere temporanee.");
    });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!pending(purchase)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (stopped || document.hidden || inFlight) return;
      inFlight = true;
      try {
        const result = await fetchTemporaryPurchase(purchase!.id, controller.signal);
        if (stopped) return;
        setPurchase(result.purchase);
        setError(null);
        if (result.purchase.status === "active") await issuedCallback.current();
      } catch (reason) {
        if (!stopped) setError(reason instanceof Error ? reason.message : "Verifica dello stato non riuscita.");
      } finally {
        inFlight = false;
        if (!stopped) timer = setTimeout(() => void refresh(), 10000);
      }
    };
    const onVisibility = () => { if (!document.hidden) { clearTimeout(timer); void refresh(); } };
    timer = setTimeout(() => void refresh(), 10000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stopped = true; clearTimeout(timer); controller.abort(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [purchase?.id, purchase?.status]);

  const openCheckout = useCallback((url: string) => {
    if (new URL(url).protocol !== "https:") throw new Error("Collegamento di pagamento non valido.");
    window.location.assign(url);
  }, []);

  const buy = async () => {
    if (busy || (!offer?.eligible && purchase?.status !== "payment_pending")) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createTemporaryPurchase(purchase?.method && purchase.method !== "legacy" ? purchase.method : method);
      setPurchase(result.purchase);
      setOffer(current => current ? { ...current, eligible: false } : current);
      const checkout = result.hosted_checkout_url ?? result.purchase.hosted_checkout_url;
      if (checkout) openCheckout(checkout);
      else if (result.purchase.status === "active") await issuedCallback.current();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossibile completare la richiesta.");
      // A response can be lost after the order was committed: discover the order before another POST.
      try {
        const updated = await fetchTemporaryOffer();
        setOffer(updated); setPurchase(updated.current_purchase);
      } catch { /* The visible error and retry action remain available. */ }
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!purchase || busy) return;
    setBusy(true); setError(null);
    try {
      await cancelTemporaryPurchase(purchase.id);
      setCancelOpen(false);
      const updated = await fetchTemporaryOffer();
      setOffer(updated); setPurchase(updated.current_purchase);
      setMethod(updated.offer?.methods[0] ?? "contanti");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Impossibile annullare la richiesta."); }
    finally { setBusy(false); }
  };

  if (!offer && !error) return null;
  if (offer && !offer.enabled && !purchase) return null;
  return (
    <section className="surface p-5 sm:p-6" aria-labelledby="temporary-membership-heading">
      <h2 id="temporary-membership-heading" className="text-xl font-bold text-neutral-900">Tessera temporanea</h2>
      {error && <div className="mt-3 text-sm text-rose-700" role="alert">{error} <button type="button" className="underline" disabled={busy} onClick={() => setRetry(value => value + 1)}>Riprova</button></div>}
      {purchase ? (
        <div className="mt-3 space-y-3 text-sm text-neutral-600" aria-live="polite">
          <p className="font-semibold text-neutral-900">{temporaryStatusLabels[purchase.status]}</p>
          <p>{formatTemporaryAmount(purchase.amount, purchase.currency)} · {temporaryMethodLabels[purchase.method]}</p>
          {purchase.status === "manual_pending" && <p>{purchase.method === "bonifico" ? "Segui le indicazioni dell'associazione per effettuare il bonifico." : "Puoi pagare presso l'associazione."} La tessera verrà emessa dopo la conferma dell'incasso.</p>}
          {purchase.status === "paid_waiting_card" && <p>La durata inizierà quando l'associazione avrà completato il rilascio. Il pagamento è conservato.</p>}
          {purchase.valid_until && <p>Valida dal {formatTemporaryDate(purchase.valid_from)} al {formatTemporaryDate(purchase.valid_until)}.</p>}
          {purchase.hosted_checkout_url && <button type="button" className="btn-primary px-5 py-3" onClick={() => { try { openCheckout(purchase.hosted_checkout_url!); } catch (reason) { setError((reason as Error).message); } }}>Riprendi pagamento</button>}
          {purchase.status === "payment_pending" && !purchase.hosted_checkout_url && <button type="button" className="btn-primary px-5 py-3" disabled={busy} onClick={() => void buy()}>Riprendi acquisto</button>}
          {["payment_pending", "manual_pending"].includes(purchase.status) && <button type="button" className="btn-ghost ml-2 px-4 py-3" disabled={busy} onClick={() => setCancelOpen(true)}>Annulla richiesta</button>}
        </div>
      ) : offer?.eligible && offer.offer ? (
        <div className="mt-3 space-y-4">
          <p className="text-sm text-neutral-600">{offer.offer.duration_label} · {formatTemporaryAmount(offer.offer.amount, offer.offer.currency)}. La validità inizia dal rilascio della tessera.</p>
          <label className="block text-sm font-semibold text-neutral-800">Metodo di pagamento
            <select className="premium-select mt-2 w-full sm:max-w-xs" value={method} onChange={event => setMethod(event.target.value as TemporaryPaymentMethod)} disabled={busy}>
              {offer.offer.methods.map(value => <option key={value} value={value}>{temporaryMethodLabels[value]}</option>)}
            </select>
          </label>
          <button type="button" className="btn-primary px-5 py-3" disabled={busy} onClick={() => void buy()}>{busy ? "Operazione in corso…" : method === "sumup" ? "Acquista temporanea" : "Richiedi temporanea"}</button>
        </div>
      ) : <p className="mt-3 text-sm text-neutral-600">{offer?.reason}</p>}
      <ConfirmModal open={cancelOpen} title="Annulla richiesta temporanea" description="L'acquisto verrà annullato solo se non risulta pagato e non può più essere addebitato. Potrai poi scegliere un altro metodo o rinnovare l'annuale." impact="La tessera non ancora emessa e la richiesta di pagamento verranno chiuse." confirmLabel="Annulla richiesta" confirmState={busy ? "loading" : "idle"} errorMessage={error ?? undefined} onConfirm={() => void cancel()} onClose={() => { if (!busy) setCancelOpen(false); }} />
    </section>
  );
}
