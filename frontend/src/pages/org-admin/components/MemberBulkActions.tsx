import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ModalShell from "../../../components/ui/ModalShell";
import { AuthError } from "../../../lib/api";
import {
  bulkRequestKey, downloadMemberBulk, executeMemberBulk, fetchMemberBulk, fetchRecentMemberBulk, previewMemberBulk,
  retryMemberBulk, type BulkAction, type BulkItem, type BulkRun, type RecentBulkRun,
} from "../../../lib/memberBulk";
import type { MemberSelection } from "../../../hooks/useMemberSelection";
import { isQuoteReminderYearAvailable } from "../../../lib/quoteReminders";

type Props = {
  selection: MemberSelection; count: number; total: number; pageCount: number; allPageChecked: boolean;
  disabled: boolean; storageKey: string; onTogglePage: () => void; onSelectAll: () => void; onClear: () => void;
  onCompleted?: () => void;
  actions?: BulkAction[]; membershipYear?: number; showSelectionControls?: boolean;
};

const statusLabels = { preview: "Anteprima", running: "In elaborazione", completed: "Completata", expired: "Anteprima scaduta" };
const deliveryLabels: Record<string, string> = { queued: "In coda", pending: "In coda", sent: "Consegnata al servizio email", failed: "Consegna da riprovare dal sistema", sending: "Invio in corso" };
const amountLabel = (cents: number, currency = "EUR") => new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(cents / 100);
function savedRun(key: string) { try { return sessionStorage.getItem(key); } catch { return null; } }

function itemStatus(item: BulkItem, action: BulkAction) {
  if (item.status === "succeeded") return action === "export" ? "Incluso nel file" : "Accodato";
  return { pending: "Da elaborare", skipped: "Saltato", failed: "Fallito" }[item.status];
}

export default function MemberBulkActions({ selection, count, total, pageCount, allPageChecked, disabled, storageKey, onTogglePage, onSelectAll, onClear, onCompleted, actions = ["export", "send_access"], membershipYear, showSelectionControls = true }: Props) {
  const navigate = useNavigate();
  const historyId = useId();
  const canRemind = membershipYear != null && isQuoteReminderYearAvailable(membershipYear);
  const availableActions = actions.filter((action) => action !== "quote_reminder" || canRemind);
  const [run, setRun] = useState<BulkRun | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastId, setLastId] = useState(() => savedRun(storageKey));
  const [recent, setRecent] = useState<{ items: RecentBulkRun[]; total: number } | null>(null);
  const [recentOffset, setRecentOffset] = useState(0);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const pause = useRef(false);
  const generation = useRef(0);
  // Keep a key across lost responses; a retry must never process a second batch.
  const pendingExecute = useRef<string | null>(null);
  const pendingRetry = useRef<string | null>(null);
  const pendingPreview = useRef<{ fingerprint: string; key: string } | null>(null);
  const runUnavailableReason = run?.unavailable_reason || (run?.action === "quote_reminder" && !isQuoteReminderYearAvailable(run.membership_year ?? 0)
    ? "I solleciti sono disponibili dal 2027 e soltanto per annualità già iniziate."
    : run && !actions.includes(run.action) ? "Questa operazione è consultabile qui. I solleciti si gestiscono da Quote e rinnovi." : null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pause.current = true; generation.current += 1; };
  }, []);

  const remember = (next: BulkRun) => {
    setRun(next); setLastId(next.id);
    try { sessionStorage.setItem(storageKey, next.id); } catch { /* Session storage may be disabled. */ }
  };
  const fail = (reason: unknown) => {
    if (reason instanceof AuthError) { navigate("/org-admin/login", { replace: true }); return; }
    setError(reason instanceof Error ? reason.message : "Operazione non riuscita. Riprova.");
  };

  const preview = async (action: BulkAction) => {
    if (disabled || count === 0 || busyRef.current || !availableActions.includes(action)) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    const seq = ++generation.current;
    const body = { action, selection, ...(action === "quote_reminder" ? { membership_year: membershipYear } : {}) };
    const fingerprint = JSON.stringify(body);
    if (pendingPreview.current?.fingerprint !== fingerprint) pendingPreview.current = { fingerprint, key: bulkRequestKey() };
    try {
      const next = await previewMemberBulk({ ...body, request_key: pendingPreview.current.key });
      if (!mounted.current || generation.current !== seq) return;
      pendingPreview.current = null; pendingExecute.current = null; pendingRetry.current = null;
      remember(next); setOpen(true);
    } catch (reason) { if (mounted.current && generation.current === seq) fail(reason); }
    finally { if (mounted.current && generation.current === seq) { busyRef.current = false; setBusy(false); } }
  };

  const read = async (id: string, offset = 0) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setOpen(true);
    setNotice("");
    if (run?.id !== id) {
      setRun(null);
      pendingExecute.current = null;
      pendingRetry.current = null;
    }
    const seq = ++generation.current;
    try {
      const next = await fetchMemberBulk(id, offset);
      if (mounted.current && generation.current === seq) remember(next);
    } catch (reason) { if (mounted.current && generation.current === seq) fail(reason); }
    finally { if (mounted.current && generation.current === seq) { busyRef.current = false; setBusy(false); } }
  };

  const execute = async (retryFailed = false) => {
    if (!run || busyRef.current || runUnavailableReason) return;
    busyRef.current = true; pause.current = false;
    setBusy(true); setProcessing(true); setPauseRequested(false); setError(""); setNotice("");
    const seq = ++generation.current;
    let next = run;
    try {
      if (retryFailed) {
        pendingRetry.current ??= bulkRequestKey();
        next = await retryMemberBulk(next.id, pendingRetry.current);
        pendingRetry.current = null;
        if (!mounted.current || generation.current !== seq) return;
        remember(next);
      }
      while (next.can_execute && !pause.current) {
        pendingExecute.current ??= bulkRequestKey();
        next = await executeMemberBulk(next.id, pendingExecute.current);
        pendingExecute.current = null;
        if (!mounted.current || generation.current !== seq) return;
        remember(next);
        if (next.counts.pending === 0) break;
      }
      if (mounted.current && generation.current === seq) {
        setNotice(pause.current && next.counts.pending > 0 ? "Elaborazione in pausa. Puoi riprenderla senza ripetere le righe completate." : next.action === "export" ? "Elaborazione completata. Il file è disponibile per il download." : "Esiti aggiornati. Le email sono accodate; la consegna è gestita dal sistema.");
        onCompleted?.();
      }
    } catch (reason) { if (mounted.current && generation.current === seq) fail(reason); }
    finally { if (mounted.current && generation.current === seq) { busyRef.current = false; setBusy(false); setProcessing(false); } }
  };

  const download = async () => {
    if (!run || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const result = await downloadMemberBulk(run.id);
      if (!mounted.current) return;
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a"); link.href = url; link.download = "Soci_selezionati.xlsx";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(result.count == null ? "File preparato." : `File preparato con ${result.count} soci ancora disponibili.`);
    } catch (reason) { if (mounted.current) fail(reason); }
    finally { if (mounted.current) { busyRef.current = false; setBusy(false); } }
  };

  const recentRuns = async (offset = 0) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const next = await fetchRecentMemberBulk(offset);
      if (mounted.current) { setRecent(next); setRecentOffset(offset); }
    } catch (reason) { if (mounted.current) fail(reason); }
    finally { if (mounted.current) { busyRef.current = false; setBusy(false); } }
  };

  const close = () => { if (!busyRef.current) { setOpen(false); setError(""); setNotice(""); } };

  return (
    <section className="surface member-bulk-toolbar" aria-label="Selezione multipla soci">
      <div className="member-bulk-toolbar__row">
        <div className="member-bulk-toolbar__selection">
          <label className="member-bulk-toolbar__page">
            <input type="checkbox" checked={allPageChecked} disabled={disabled || pageCount === 0 || busy} onChange={onTogglePage} className="h-4 w-4 accent-[var(--theme-brand)]" />
            Seleziona pagina <span className="text-[var(--theme-text-muted)]">({pageCount})</span>
          </label>
          <p className="member-bulk-toolbar__count" role="status">{count === 0 ? "Nessun selezionato" : `${count} ${count === 1 ? "selezionato" : "selezionati"}`}</p>
        </div>
        {count > 0 && <div className="member-bulk-toolbar__actions" role="group" aria-label="Azioni sui soci selezionati">
          {availableActions.includes("export") && <button className="btn-secondary" type="button" aria-label="Esporta selezionati" disabled={disabled || busy} onClick={() => void preview("export")}>Esporta</button>}
          {availableActions.includes("send_access") && <button className="btn-primary" type="button" aria-label="Invia accesso ai selezionati" disabled={disabled || busy} onClick={() => void preview("send_access")}>Invia accesso</button>}
          {availableActions.includes("quote_reminder") && <button className="btn-primary" type="button" disabled={disabled || busy} onClick={() => void preview("quote_reminder")}>Sollecita quote {membershipYear}</button>}
          <button className="btn-ghost" type="button" aria-label="Azzera selezione" disabled={busy} onClick={onClear}>Azzera</button>
        </div>}
        <button className="btn-ghost member-bulk-toolbar__history" type="button" aria-label="Cronologia operazioni" aria-expanded={recent !== null} aria-controls={historyId} disabled={busy} onClick={() => recent ? setRecent(null) : void recentRuns()}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.8 7M3 4v7h7M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="hidden sm:inline">Cronologia</span>
        </button>
      </div>
      {count === 0 ? <p className="member-bulk-toolbar__hint">{availableActions.includes("quote_reminder") ? "Seleziona i soci dall'elenco per preparare un sollecito." : "Seleziona i soci dall'elenco per esportarli o inviare l'accesso."}</p> : <div className="member-bulk-toolbar__scope">
        <p>{selection.mode === "filtered" ? "Selezione estesa a tutte le pagine. Puoi escludere singoli soci." : "La selezione si conserva tra le pagine."} Cambiare i filtri la azzera.</p>
        {showSelectionControls && total > pageCount && (selection.mode !== "filtered" || count < total) && <button className="member-bulk-toolbar__all" type="button" disabled={disabled || busy} onClick={onSelectAll}>Seleziona tutti i {total} risultati</button>}
      </div>}
      {recent && <div id={historyId} className="member-bulk-toolbar__recent">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Operazioni recenti</h3>
          {lastId && <button className="btn-ghost px-3" type="button" disabled={busy} onClick={() => void read(lastId)}>Riprendi ultima operazione</button>}
        </div>
        {recent.items.length === 0 && <p className="text-sm text-[var(--theme-text-muted)]">Nessuna operazione precedente.</p>}
        {recent.items.map((item) => <button type="button" className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--theme-border)] p-3 text-left text-sm" key={item.id} disabled={busy} onClick={() => void read(item.id)}>
          <span>{item.action_label} · {new Date(item.created_at).toLocaleString("it-IT")}</span>
          <span>{statusLabels[item.status]} · {item.selected_count} soci · {item.counts.failed} falliti</span>
        </button>)}
        <div className="flex justify-between gap-3">
          <button type="button" className="btn-ghost px-3" disabled={busy || recentOffset === 0} onClick={() => void recentRuns(Math.max(0, recentOffset - 10))}>Operazioni precedenti</button>
          <button type="button" className="btn-ghost px-3" disabled={busy || recentOffset + 10 >= recent.total} onClick={() => void recentRuns(recentOffset + 10)}>Operazioni successive</button>
        </div>
      </div>}
      {busy && !open && <p role="status" className="text-sm text-[var(--theme-text-muted)]">Caricamento…</p>}
      {error && !open && <p role="alert" className="text-sm text-[var(--theme-danger)]">{error}</p>}
      <ModalShell open={open} title={run ? `${run.action_label} · ${statusLabels[run.status]}` : "Operazione sui soci"} description="La selezione è congelata all'anteprima. Ogni riga viene verificata di nuovo prima dell'operazione." onClose={close} closeDisabled={busy} closeOnOverlay={!busy} closeOnEscape={!busy} sizeClassName="max-w-3xl">
        {error && <p role="alert" className="mb-4 rounded-lg border border-[var(--theme-danger)] p-3 text-sm text-[var(--theme-danger)]">{error}</p>}
        {notice && <p role="status" className="mb-4 text-sm text-[var(--theme-text)]">{notice}</p>}
        {run && <>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" aria-live="polite">
            <p>Selezionati <strong className="block text-lg">{run.selected_count}</strong></p>
            <p>Da elaborare <strong className="block text-lg">{run.counts.pending}</strong></p>
            <p>{run.action === "export" ? "Inclusi" : "Accodati"} <strong className="block text-lg">{run.counts.succeeded}</strong></p>
            <p>Saltati / falliti <strong className="block text-lg">{run.counts.skipped} / {run.counts.failed}</strong></p>
          </div>
          <p className="mt-4 text-sm text-[var(--theme-text-muted)]">{run.eligible_count} {run.eligible_count === 1 ? "socio idoneo" : "soci idonei"} all'anteprima.{run.membership_year ? ` Annualità ${run.membership_year}.` : ""} {run.action === "export" ? "Il file conterrà soltanto i soci confermati e ancora accessibili." : "Le righe saltate non ricevono email. Accodato non significa consegnato."}</p>
          {run.action === "quote_reminder" && run.outstanding_total_cents != null && <p className="mt-2 text-sm font-semibold">Importo complessivo da sollecitare: {amountLabel(run.outstanding_total_cents, run.currency)}</p>}
          {run.status === "expired" && <p className="mt-3 text-sm text-[var(--theme-warning)]">L'anteprima è scaduta. Chiudi e preparane una nuova.</p>}
          {runUnavailableReason && <p className="mt-3 text-sm text-[var(--theme-warning)]" role="status">{runUnavailableReason}</p>}
          {run.action === "quote_reminder" && !actions.includes("quote_reminder") && <Link className="mt-2 inline-block text-sm font-semibold text-[var(--theme-brand)] underline underline-offset-4" to="/org-admin/quote">Apri Quote e rinnovi</Link>}
          {run.status === "preview" && !run.can_execute && !runUnavailableReason && <p className="mt-3 text-sm text-[var(--theme-warning)]">Nessun socio idoneo da elaborare.</p>}
          <div className="mt-5 max-w-full overflow-x-auto rounded-lg border border-[var(--theme-border)]">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-[var(--theme-border)]"><th className="p-3">Socio</th><th className="p-3">Esito</th><th className="p-3">Dettaglio</th></tr></thead>
              <tbody>{run.items.map((item, index) => <tr key={`${item.member_id}-${index}`} className="border-b border-[var(--theme-border)] last:border-0">
                <td className="p-3">{item.name || "Socio non più disponibile"}</td>
                <td className="p-3">{itemStatus(item, run.action)}</td>
                <td className="p-3">
                  <p>{item.detail || "—"}</p>
                  {run.action === "quote_reminder" && item.amount_cents != null && <p>{amountLabel(item.amount_cents, item.currency)}</p>}
                  {item.delivery_status && <p className="mt-1 text-xs text-[var(--theme-text-muted)]">{deliveryLabels[item.delivery_status] || item.delivery_status}</p>}
                </td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <button type="button" className="btn-ghost px-3" disabled={busy || run.offset === 0} onClick={() => void read(run.id, Math.max(0, run.offset - run.limit))}>Esiti precedenti</button>
            <span>{run.total ? `${run.offset + 1}–${Math.min(run.offset + run.limit, run.total)} di ${run.total}` : "Nessuna riga"}</span>
            <button type="button" className="btn-ghost px-3" disabled={busy || !run.has_more} onClick={() => void read(run.id, run.offset + run.limit)}>Esiti successivi</button>
          </div>
          <div className="mt-5 flex flex-wrap gap-3 border-t border-[var(--theme-border)] pt-4">
            {run.can_execute && !runUnavailableReason && <button type="button" className="btn-primary px-4" disabled={busy} onClick={() => void execute()}>{run.started_at ? "Riprendi elaborazione" : run.action === "export" ? "Conferma esportazione" : `Conferma e accoda ${run.counts.pending} ${run.action === "send_access" ? run.counts.pending === 1 ? "accesso" : "accessi" : run.counts.pending === 1 ? "sollecito" : "solleciti"}`}</button>}
            {run.can_retry_failed && !runUnavailableReason && <button type="button" className="btn-secondary px-4" disabled={busy} onClick={() => void execute(true)}>Riprova solo i {run.counts.failed} falliti</button>}
            {run.can_download && <button type="button" className="btn-primary px-4" disabled={busy} onClick={() => void download()}>Scarica Excel selezionati</button>}
            {processing && <button type="button" className="btn-secondary px-4" disabled={pauseRequested} onClick={() => { pause.current = true; setPauseRequested(true); }}>Pausa dopo il blocco corrente</button>}
            <button type="button" className="btn-ghost px-3" disabled={busy} onClick={() => void read(run.id, run.offset)}>Aggiorna esiti</button>
            <button type="button" className="btn-ghost px-3" disabled={busy} onClick={close}>Chiudi</button>
          </div>
        </>}
        {busy && <p className="mt-4 text-sm text-[var(--theme-text-muted)]" role="status">{processing ? "Elaborazione a blocchi di massimo 25 soci…" : "Caricamento…"}</p>}
      </ModalShell>
    </section>
  );
}
