import { useCallback, useEffect, useState, type FormEvent } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import { confirmTemporaryPayment, fetchAdminTemporaryPurchases, formatTemporaryAmount, formatTemporaryDate, localPaymentDate, temporaryMethodLabels, temporaryStatusLabels, type TemporaryPurchase } from "../../../lib/temporaryMemberships";

export default function TemporaryPurchasesPanel({ memberId, onChanged }: { memberId: number; onChanged: () => Promise<void> }) {
  const [items, setItems] = useState<TemporaryPurchase[]>([]);
  const [selected, setSelected] = useState<TemporaryPurchase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await fetchAdminTemporaryPurchases(memberId, signal);
    if (!signal?.aborted) { setItems(result.items); setError(null); }
  }, [memberId]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Impossibile caricare gli acquisti temporanei."); });
    return () => controller.abort();
  }, [load]);
  const confirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || saving) return;
    const data = new FormData(event.currentTarget);
    setSaving(true); setError(null);
    try {
      await confirmTemporaryPayment(selected.id, String(data.get("paid_at") ?? ""), String(data.get("notes") ?? ""));
      setSelected(null); await load(); await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Impossibile confermare l'incasso."); }
    finally { setSaving(false); }
  };
  if (!items.length && !error) return null;
  return (
    <section className="surface p-5 sm:p-6" aria-labelledby="temporary-purchases-title">
      <h2 id="temporary-purchases-title" className="text-lg font-semibold text-neutral-900">Acquisti tessere temporanee</h2>
      {error && <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p>}
      <ul className="mt-4 divide-y divide-neutral-200">
        {items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="text-sm"><p className="font-semibold text-neutral-900">{formatTemporaryAmount(item.amount, item.currency)} · {temporaryMethodLabels[item.method]}</p><p className="mt-1 text-neutral-600">{temporaryStatusLabels[item.status]}</p>{item.valid_until && <p className="mt-1 text-neutral-600">{formatTemporaryDate(item.valid_from)} – {formatTemporaryDate(item.valid_until)}</p>}</div>
          {item.status === "manual_pending" && <button className="btn-primary px-4 py-3" type="button" onClick={() => { setError(null); setSelected(item); }}>Conferma incasso</button>}
        </li>)}
      </ul>
      <ModalShell open={!!selected} title="Conferma incasso temporanea" description={selected ? `${formatTemporaryAmount(selected.amount, selected.currency)} · ${temporaryMethodLabels[selected.method]}. La durata inizia al rilascio effettivo.` : undefined} onClose={() => { if (!saving) setSelected(null); }} closeDisabled={saving} closeOnOverlay={!saving}>
        <form onSubmit={event => void confirm(event)} className="space-y-4">
          <label className="block text-sm font-semibold text-neutral-800">Data dell'incasso<input name="paid_at" type="date" required defaultValue={localPaymentDate()} className="premium-select mt-2 w-full" disabled={saving} /></label>
          <label className="block text-sm font-semibold text-neutral-800">Nota<textarea name="notes" maxLength={1000} className="premium-select mt-2 w-full" rows={3} disabled={saving} /></label>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <button type="submit" disabled={saving} className="btn-primary px-5 py-3">{saving ? "Registrazione in corso…" : "Registra incasso e rilascia"}</button>
        </form>
      </ModalShell>
    </section>
  );
}
