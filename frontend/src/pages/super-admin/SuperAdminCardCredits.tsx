import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import Skeleton from "../../components/ui/Skeleton";
import {
  AuthError,
  fetchSuperAdminRechargeCredits,
  patchSuperAdminRechargeCreditAccounting,
  retrySuperAdminRechargeCreditAllocation,
  stepUpSuperAdmin,
  type CardReplenishmentRequest,
  type CardReplenishmentSummary,
  type SuperAdminProfile,
} from "../../lib/api";
import {
  SuperAdminActionButton,
  SuperAdminEmptyState,
  SuperAdminIcon,
  SuperAdminKpiCard,
  SuperAdminPageHeader,
  SuperAdminStatusChip,
  SuperAdminTableShell,
  SuperAdminToolbar,
  type SuperAdminTone,
} from "./components/SuperAdminPrimitives";

const emptySummary: CardReplenishmentSummary = {
  total: 0,
  unpaid: 0,
  paid: 0,
  outstanding_cents: 0,
  paid_cents: 0,
};

const formatMoney = (cents: number, currency = "EUR") =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(cents / 100);

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const billingLabel = (status: CardReplenishmentRequest["billing_status"]) => {
  if (status === "paid") return "Pagato";
  if (status === "unpaid") return "Da pagare";
  return "Non applicabile";
};

const billingTone = (status: CardReplenishmentRequest["billing_status"]): SuperAdminTone => {
  if (status === "paid") return "success";
  if (status === "unpaid") return "warning";
  return "muted";
};

const allocationLabel = (item: CardReplenishmentRequest) => {
  if (item.card_batch_id) return `Lotto #${item.card_batch_id}`;
  if (item.allocation_status === "blocked_non_shared") return "Bloccata";
  return "In attesa";
};

const SuperAdminCardCredits = () => {
  const navigate = useNavigate();
  const { profile } = useOutletContext<{ profile: SuperAdminProfile | null }>();
  const [items, setItems] = useState<CardReplenishmentRequest[]>([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [summary, setSummary] = useState<CardReplenishmentSummary>(emptySummary);
  const [query, setQuery] = useState("");
  const [billingFilter, setBillingFilter] = useState<"all" | "unpaid" | "paid" | "not_applicable">("all");
  const [scopeFilter, setScopeFilter] = useState<"portal" | "historical" | "all">("portal");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [stepUpCode, setStepUpCode] = useState("");
  const [stepUpActive, setStepUpActive] = useState(false);
  const [editing, setEditing] = useState<CardReplenishmentRequest | null>(null);
  const [editStatus, setEditStatus] = useState<"unpaid" | "paid">("unpaid");
  const [editReference, setEditReference] = useState("");
  const [editNote, setEditNote] = useState("");

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetchSuperAdminRechargeCredits({
        q: query.trim() || undefined,
        billing_status: billingFilter,
        scope: scopeFilter,
        limit: 100,
      });
      setItems(response.items);
      setResultTotal(response.total);
      setSummary(response.summary);
    } catch (caught) {
      if (caught instanceof AuthError) {
        navigate("/super-admin/login", { replace: true });
        return;
      }
      setError(caught instanceof Error ? caught.message : "Caricamento non riuscito");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [profile, billingFilter, scopeFilter]);

  const visibleDebt = useMemo(
    () => items.reduce((total, item) => total + (item.billing_status === "unpaid" ? item.amount_due_cents : 0), 0),
    [items],
  );

  const verifyStepUp = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await stepUpSuperAdmin(stepUpCode);
      setStepUpCode("");
      setStepUpActive(true);
      setMessage("Verifica completata: le modifiche contabili sono abilitate per 10 minuti.");
      window.setTimeout(() => setStepUpActive(false), 10 * 60 * 1000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Codice MFA non valido");
    } finally {
      setBusy(false);
    }
  };

  const beginEdit = (item: CardReplenishmentRequest) => {
    if (item.billing_status === "not_applicable") return;
    setEditing(item);
    setEditStatus(item.billing_status);
    setEditReference(item.payment_reference || "");
    setEditNote(item.accounting_note || "");
    setError("");
    setMessage("");
  };

  const saveAccounting = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || !stepUpActive) return;
    setBusy(true);
    setError("");
    try {
      await patchSuperAdminRechargeCreditAccounting(editing.id, {
        billing_status: editStatus,
        payment_reference: editReference.trim() || null,
        accounting_note: editNote.trim() || null,
      });
      setMessage(`Richiesta #${editing.id} aggiornata con audit contabile.`);
      setEditing(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Aggiornamento non riuscito");
    } finally {
      setBusy(false);
    }
  };

  const retryAllocation = async (item: CardReplenishmentRequest) => {
    if (!stepUpActive) return;
    setBusy(true);
    setError("");
    try {
      const response = await retrySuperAdminRechargeCreditAllocation(item.id);
      setMessage(response.message);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nuovo tentativo non riuscito");
    } finally {
      setBusy(false);
    }
  };

  if (!profile) {
    return <div className="space-y-5"><Skeleton className="h-10 w-72" /><Skeleton className="h-72 w-full rounded-2xl" /></div>;
  }

  return (
    <div className="sa-page">
      <SuperAdminPageHeader
        icon="wallet"
        eyebrow="Contabilita tessere"
        title="Crediti tessere"
        subtitle="Richieste lotti, debiti da 1 euro per tessera e storico append-only delle modifiche."
        actions={
          <SuperAdminActionButton icon="refresh" onClick={() => void load()} disabled={loading}>
            Aggiorna
          </SuperAdminActionButton>
        }
      />

      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{error}</div> : null}
      {message ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">{message}</div> : null}

      <section className="sa-kpi-grid">
        <SuperAdminKpiCard label="Richieste portale" value={summary.total.toLocaleString("it-IT")} hint="Registro dedicato" icon="cards" tone="info" />
        <SuperAdminKpiCard label="Da pagare" value={summary.unpaid.toLocaleString("it-IT")} hint={formatMoney(summary.outstanding_cents)} icon="clock" tone="warning" />
        <SuperAdminKpiCard label="Pagate" value={summary.paid.toLocaleString("it-IT")} hint={formatMoney(summary.paid_cents)} icon="check" tone="success" />
        <SuperAdminKpiCard label="Debito nelle righe visibili" value={formatMoney(visibleDebt)} hint="Dopo i filtri applicati" icon="wallet" tone="accent" />
      </section>

      <section className="surface p-5" aria-labelledby="credit-step-up-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="credit-step-up-title" className="font-semibold text-neutral-950">Protezione delle modifiche</h2>
            <p className="mt-1 text-sm text-neutral-600">Conferma MFA prima di cambiare pagato/da pagare o ritentare un'allocazione.</p>
          </div>
          <form className="flex w-full max-w-md gap-2 sm:w-auto" onSubmit={verifyStepUp}>
            <label className="sr-only" htmlFor="credit-step-up-code">Codice MFA o di recupero</label>
            <input
              id="credit-step-up-code"
              className="theme-input min-w-0 flex-1 font-mono tracking-widest"
              value={stepUpCode}
              onChange={(event) => setStepUpCode(event.target.value)}
              placeholder="Codice MFA"
              autoComplete="one-time-code"
              inputMode="numeric"
            />
            <button className="sa-btn" type="submit" disabled={busy || !stepUpCode.trim()}>Verifica</button>
          </form>
        </div>
        <p className={`mt-3 text-xs font-semibold ${stepUpActive ? "text-emerald-700" : "text-amber-700"}`}>
          {stepUpActive ? "Modifiche abilitate per questa sessione." : "Modifiche bloccate finche non confermi MFA."}
        </p>
      </section>

      {editing ? (
        <section className="surface p-5" aria-labelledby="credit-edit-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="credit-edit-title" className="font-semibold text-neutral-950">Aggiorna richiesta #{editing.id}</h2>
              <p className="mt-1 text-sm text-neutral-600">{editing.organization_name} - {formatMoney(editing.amount_due_cents, editing.currency)}</p>
            </div>
            <button className="sa-btn" type="button" onClick={() => setEditing(null)}>Chiudi</button>
          </div>
          <form className="mt-5 grid gap-4 lg:grid-cols-[0.7fr_1fr_1.5fr_auto]" onSubmit={saveAccounting}>
            <label className="block">
              <span className="text-sm font-semibold text-neutral-700">Stato</span>
              <select className="premium-select mt-2 w-full" value={editStatus} onChange={(event) => setEditStatus(event.target.value as "unpaid" | "paid")}>
                <option value="unpaid">Da pagare</option>
                <option value="paid">Pagato</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-neutral-700">Riferimento</span>
              <input className="theme-input mt-2 w-full" maxLength={160} value={editReference} onChange={(event) => setEditReference(event.target.value)} placeholder="Es. bonifico / quietanza" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-neutral-700">Nota contabile</span>
              <input className="theme-input mt-2 w-full" maxLength={2000} value={editNote} onChange={(event) => setEditNote(event.target.value)} placeholder="Nota interna facoltativa" />
            </label>
            <button className="btn-primary self-end px-5 py-2.5" type="submit" disabled={busy || !stepUpActive}>Salva</button>
          </form>
        </section>
      ) : null}

      <SuperAdminToolbar>
        <form className="sa-toolbar__row" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <div className="relative min-w-0 flex-1">
            <label className="sr-only" htmlFor="card-credit-search">Cerca associazione o numero richiesta</label>
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--sa-soft)]"><SuperAdminIcon name="search" className="h-4 w-4" /></span>
            <input id="card-credit-search" className="theme-input w-full pl-11" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Associazione o numero richiesta" />
          </div>
          <div className="sa-toolbar__field">
            <label htmlFor="card-credit-billing">Contabilita</label>
            <select id="card-credit-billing" className="premium-select" value={billingFilter} onChange={(event) => setBillingFilter(event.target.value as typeof billingFilter)}>
              <option value="all">Tutti</option>
              <option value="unpaid">Da pagare</option>
              <option value="paid">Pagato</option>
              <option value="not_applicable">Non applicabile</option>
            </select>
          </div>
          <div className="sa-toolbar__field">
            <label htmlFor="card-credit-origin">Origine</label>
            <select id="card-credit-origin" className="premium-select" value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as typeof scopeFilter)}>
              <option value="portal">Portale</option>
              <option value="historical">Storico WhatsApp</option>
              <option value="all">Tutte</option>
            </select>
          </div>
          <SuperAdminActionButton icon="search" tone="primary" type="submit">Cerca</SuperAdminActionButton>
        </form>
      </SuperAdminToolbar>

      <SuperAdminTableShell title="Registro richieste e crediti" subtitle={`${items.length} righe visibili su ${resultTotal} risultati`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left">
            <caption className="sr-only">Richieste di rifornimento tessere e relativo stato contabile</caption>
            <thead>
              <tr>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Richiesta</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Associazione</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Tessere</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Importo</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Contabilita</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Allocazione</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Creata</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => <tr key={index}><td colSpan={8} className="px-5 py-4"><Skeleton className="h-5 w-full" /></td></tr>)
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10"><SuperAdminEmptyState title="Nessuna richiesta trovata" description="Modifica i filtri o attendi una nuova richiesta dal portale associazione." /></td></tr>
              ) : items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="px-5 py-4"><p className="font-semibold text-neutral-950">#{item.id}</p><p className="mt-1 text-xs text-neutral-500">{item.source === "org_admin_portal" ? "Portale" : "Storico"}</p></td>
                  <td className="px-5 py-4"><p className="max-w-[240px] font-semibold text-neutral-900">{item.organization_name}</p>{item.notes ? <p className="mt-1 max-w-[260px] text-xs text-neutral-500">{item.notes}</p> : null}</td>
                  <td className="px-5 py-4 tabular-nums text-neutral-800">
                    {item.requested_cards.toLocaleString("it-IT")}
                    <p className="mt-1 text-xs text-neutral-500">Anno {item.requested_year}</p>
                  </td>
                  <td className="px-5 py-4 font-semibold tabular-nums text-neutral-950">{formatMoney(item.amount_due_cents, item.currency)}</td>
                  <td className="px-5 py-4"><SuperAdminStatusChip tone={billingTone(item.billing_status)} dot>{billingLabel(item.billing_status)}</SuperAdminStatusChip>{item.payment_reference ? <p className="mt-2 text-xs text-neutral-500">Rif. {item.payment_reference}</p> : null}</td>
                  <td className="px-5 py-4"><SuperAdminStatusChip tone={item.card_batch_id ? "success" : "warning"}>{allocationLabel(item)}</SuperAdminStatusChip>{item.batch_range_start && item.batch_range_end ? <p className="mt-2 text-xs tabular-nums text-neutral-500">{item.batch_range_start} - {item.batch_range_end}</p> : null}</td>
                  <td className="px-5 py-4 text-sm text-neutral-700">{formatDateTime(item.created_at)}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button className="sa-btn" type="button" disabled={item.billing_status === "not_applicable"} onClick={() => beginEdit(item)}>Contabilita</button>
                      {!item.card_batch_id ? <button className="sa-btn" type="button" disabled={!stepUpActive || busy} onClick={() => void retryAllocation(item)}>Ritenta lotto</button> : null}
                    </div>
                    {(item.accounting_events?.length ?? 0) > 0 ? (
                      <details className="mt-3 text-xs text-neutral-600">
                        <summary className="cursor-pointer font-semibold">Audit ({item.accounting_events?.length})</summary>
                        <ul className="mt-2 space-y-1">
                          {item.accounting_events?.slice().reverse().map((event) => <li key={event.id}>{formatDateTime(event.created_at)}: {billingLabel(event.new_status as CardReplenishmentRequest["billing_status"])}</li>)}
                        </ul>
                      </details>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SuperAdminTableShell>
    </div>
  );
};

export default SuperAdminCardCredits;
