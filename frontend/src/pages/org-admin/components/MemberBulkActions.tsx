import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ModalShell from "../../../components/ui/ModalShell";
import { AuthError } from "../../../lib/api";
import {
  bulkRequestKey, downloadMemberBulk, executeMemberBulk, fetchMemberBulk, fetchRecentMemberBulk, previewMemberBulk,
  retryMemberBulk, type BulkAction, type BulkItem, type BulkRun, type RecentBulkRun,
} from "../../../lib/memberBulk";
import type { MemberSelection } from "../../../hooks/useMemberSelection";

type Props = {
  selection: MemberSelection; count: number; total: number; pageCount: number; allPageChecked: boolean;
  disabled: boolean; storageKey: string; onTogglePage: () => void; onSelectAll: () => void; onClear: () => void;
  onCompleted?: () => void;
  actions?: BulkAction[]; membershipYear?: number; showSelectionControls?: boolean;
};

const currentYear = new Date().getFullYear();
const statusLabels = { preview: "Anteprima", running: "In elaborazione", completed: "Completata", expired: "Anteprima scaduta" };
const deliveryLabels: Record<string, string> = { queued: "In coda", pending: "In coda", sent: "Consegnata al servizio email", failed: "Consegna da riprovare dal sistema", sending: "Invio in corso" };
const amountLabel = (cents: number, currency = "EUR") => new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(cents / 100);
function savedRun(key: string) { try { return sessionStorage.getItem(key); } catch { return null; } }

function itemStatus(item: BulkItem, action: BulkAction) {
  if (item.status === "succeeded") return action === "export" ? "Incluso nel file" : "Accodato";
  return { pending: "Da elaborare", skipped: "Saltato", failed: "Fallito" }[item.status];
}

export default function MemberBulkActions({ selection, count, total, pageCount, allPageChecked, disabled, storageKey, onTogglePage, onSelectAll, onClear, onCompleted, actions = ["export", "send_access", "quote_reminder"], membershipYear, showSelectionControls = true }: Props) {
  const navigate = useNavigate();
  const [year, setYear] = useState(currentYear + 1);
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
    if (disabled || count === 0 || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    const seq = ++generation.current;
    const body = { action, selection, ...(action === "quote_reminder" ? { membership_year: membershipYear ?? year } : {}) };
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
    if (!run || busyRef.current) return;
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
    <section className="surface space-y-4 p-4 sm:p-5" aria-label="Selezione multipla soci">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex min-h-11 items-center gap-3 text-sm font-semibold text-[var(--theme-text)]">
          <input type="checkbox" checked={allPageChecked} disabled={disabled || pageCount === 0 || busy} onChange={onTogglePage} className="h-4 w-4 accent-[var(--theme-brand)]" />
          Seleziona questa pagina ({pageCount})
        </label>
        <p className="text-sm font-semibold text-[var(--theme-text)]" role="status">{count} soci selezionati</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {showSelectionControls &&
        <button className="btn-secondary px-3" type="button" disabled={disabled || total === 0 || busy} onClick={onSelectAll}>Seleziona tutti i {total} risultati filtrati</button>
        }
        <button className="btn-ghost px-3" type="button" disabled={count === 0 || busy} onClick={onClear}>Azzera selezione</button>
      </div>
      <p className="text-sm text-[var(--theme-text-muted)]">{selection.mode === "filtered" ? "Sono selezionati tutti i risultati filtrati, anche nelle altre pagine. Puoi escludere singoli soci." : "La selezione dei singoli soci resta disponibile passando da una pagina all'altra."} Cambiare i filtri azzera la selezione. Nessun invio parte dalla selezione.</p>
      <div className="flex flex-wrap items-end gap-3 border-t border-[var(--theme-border)] pt-4">
        {actions.includes("export") && <button className="btn-secondary px-4" type="button" disabled={disabled || count === 0 || busy} onClick={() => void preview("export")}>Esporta selezionati</button>}
        {actions.includes("send_access") && <button className="btn-secondary px-4" type="button" disabled={disabled || count === 0 || busy} onClick={() => void preview("send_access")}>Invia accesso ai selezionati</button>}
        {actions.includes("quote_reminder") && membershipYear == null && <label className="block text-sm font-semibold text-[var(--theme-text)]">Annualità da sollecitare
          <select aria-label="Annualità da sollecitare" className="premium-select mt-1 min-w-28" value={year} disabled={busy} onChange={(event) => setYear(Number(event.target.value))}>
            {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>}
        {actions.includes("quote_reminder") && <button className="btn-secondary px-4" type="button" disabled={disabled || count === 0 || busy} onClick={() => void preview("quote_reminder")}>Sollecita quote selezionate{membershipYear ? ` (${membershipYear})` : ""}</button>}
      </div>
      {lastId && <button className="btn-ghost px-3" type="button" disabled={busy} onClick={() => void read(lastId)}>Riprendi ultima operazione</button>}
      <button className="btn-ghost px-3" type="button" disabled={busy} onClick={() => void recentRuns()}>Operazioni recenti</button>
      {recent && <div className="space-y-2 border-t border-[var(--theme-border)] pt-3">
        <h3 className="font-semibold">Le tue operazioni precedenti</h3>
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
      {busy && !open && <p role="status" className="text-sm text-[var(--theme-text-muted)]">Preparazione dell'anteprima…</p>}
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
          {run.status === "preview" && !run.can_execute && <p className="mt-3 text-sm text-[var(--theme-warning)]">Nessun socio idoneo da elaborare.</p>}
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
            {run.can_execute && <button type="button" className="btn-primary px-4" disabled={busy} onClick={() => void execute()}>{run.started_at ? "Riprendi elaborazione" : run.action === "export" ? "Conferma esportazione" : `Conferma e accoda ${run.counts.pending} ${run.action === "send_access" ? run.counts.pending === 1 ? "accesso" : "accessi" : run.counts.pending === 1 ? "sollecito" : "solleciti"}`}</button>}
            {run.can_retry_failed && <button type="button" className="btn-secondary px-4" disabled={busy} onClick={() => void execute(true)}>Riprova solo i {run.counts.failed} falliti</button>}
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
