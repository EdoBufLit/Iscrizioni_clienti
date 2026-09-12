import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import Skeleton from "../../components/ui/Skeleton";
import "./card-credits.css";
import {
  AuthError,
  fetchSuperAdminOrganizations,
  fetchSuperAdminRechargeCredits,
  patchSuperAdminRechargeCreditAccounting,
  retrySuperAdminRechargeCreditAllocation,
  stepUpSuperAdmin,
  type CardReplenishmentRequest,
  type CardReplenishmentSummary,
  type SuperAdminProfile,
  type SuperAdminOrganization,
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
  requested_cards: 0,
  whatsapp_cards: 0,
  unpaid: 0,
  paid: 0,
  outstanding_cents: 0,
  paid_cents: 0,
};

const PAGE_SIZE = 100;
type CreditFilters = {
  q: string;
  billing_status: "all" | "unpaid" | "paid" | "not_applicable";
  scope: "portal" | "whatsapp" | "all";
  org_id?: number;
  offset: number;
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
  const [filters, setFilters] = useState<CreditFilters>({ q: "", billing_status: "all", scope: "all", offset: 0 });
  const [reload, setReload] = useState(0);
  const [organizations, setOrganizations] = useState<SuperAdminOrganization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(true);
  const [organizationsError, setOrganizationsError] = useState("");
  const [organizationsReload, setOrganizationsReload] = useState(0);
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
  const submitting = useRef(false);
  const stepUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!profile) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetchSuperAdminRechargeCredits({
      ...filters,
      q: filters.q || undefined,
      limit: PAGE_SIZE,
      signal: controller.signal,
    }).then((response) => {
      if (controller.signal.aborted) return;
      // A payment can remove the last row from a filtered page.
      if (filters.offset > 0 && filters.offset >= response.total) {
        const offset = Math.max(0, Math.ceil(response.total / PAGE_SIZE) - 1) * PAGE_SIZE;
        setFilters((current) => ({ ...current, offset }));
        return;
      }
      setItems(response.items);
      setResultTotal(response.total);
      setSummary(response.summary);
    }).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      setItems([]);
      setResultTotal(0);
      setSummary(emptySummary);
      if (caught instanceof AuthError) navigate("/super-admin/login", { replace: true });
      else setError(caught instanceof Error ? caught.message : "Caricamento non riuscito");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [profile, filters, reload, navigate]);

  useEffect(() => {
    if (!profile) return;
    const controller = new AbortController();
    setOrganizationsLoading(true);
    setOrganizationsError("");
    void (async () => {
      try {
        const first = await fetchSuperAdminOrganizations({ page: 1, pageSize: 100, status: "all", signal: controller.signal });
        const all = [...first.items];
        for (let page = 2; page <= first.total_pages; page += 1) {
          if (controller.signal.aborted) return;
          const next = await fetchSuperAdminOrganizations({ page, pageSize: 100, status: "all", signal: controller.signal });
          all.push(...next.items);
        }
        if (!controller.signal.aborted) {
          setOrganizations([...new Map(all.map((org) => [org.id, org])).values()].sort((a, b) => a.name.localeCompare(b.name, "it")));
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        if (caught instanceof AuthError) navigate("/super-admin/login", { replace: true });
        else setOrganizationsError(caught instanceof Error ? caught.message : "Impossibile caricare le associazioni");
      } finally {
        if (!controller.signal.aborted) setOrganizationsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [profile, organizationsReload, navigate]);

  useEffect(() => () => { if (stepUpTimer.current) window.clearTimeout(stepUpTimer.current); }, []);

  const updateFilters = (changes: Partial<CreditFilters>) => {
    setFilters((current) => ({ ...current, ...changes, offset: 0 }));
  };

  const refresh = () => setReload((current) => current + 1);
  const firstVisible = resultTotal ? filters.offset + 1 : 0;
  const lastVisible = filters.offset + items.length;
  const pageCount = Math.max(1, Math.ceil(resultTotal / PAGE_SIZE));

  const verifyStepUp = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await stepUpSuperAdmin(stepUpCode);
      setStepUpCode("");
      setStepUpActive(true);
      setMessage("Verifica completata: le modifiche contabili sono abilitate per 10 minuti.");
      if (stepUpTimer.current) window.clearTimeout(stepUpTimer.current);
      stepUpTimer.current = window.setTimeout(() => setStepUpActive(false), 10 * 60 * 1000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Codice MFA non valido");
    } finally {
      submitting.current = false;
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
    if (!editing || !stepUpActive || submitting.current) return;
    submitting.current = true;
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
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Aggiornamento non riuscito");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const retryAllocation = async (item: CardReplenishmentRequest) => {
    if (!stepUpActive || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await retrySuperAdminRechargeCreditAllocation(item.id);
      setMessage(response.message);
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nuovo tentativo non riuscito");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  if (!profile) {
    return <div className="space-y-5"><Skeleton className="h-10 w-72" /><Skeleton className="h-72 w-full rounded-2xl" /></div>;
  }

  return (
    <div className="sa-page sa-card-credits">
      <SuperAdminPageHeader
        icon="wallet"
        eyebrow="Contabilità tessere"
        title="Crediti tessere"
        subtitle="Richieste online e WhatsApp, importi da 1 € per tessera e storico dei pagamenti."
        actions={
          <SuperAdminActionButton icon="refresh" onClick={refresh} disabled={loading || busy}>
            Aggiorna
          </SuperAdminActionButton>
        }
      />

      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{error}</div> : null}
      {message ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">{message}</div> : null}

      <section className="sa-kpi-grid" aria-label="Riepilogo crediti filtrati" aria-busy={loading}>
        <SuperAdminKpiCard label="Richieste" value={loading ? "…" : summary.total.toLocaleString("it-IT")} hint="Tutti i risultati dei filtri" icon="cards" tone="info" />
        <SuperAdminKpiCard label="Tessere richieste" value={loading ? "…" : (summary.requested_cards ?? 0).toLocaleString("it-IT")} hint={loading ? "Caricamento…" : `${(summary.whatsapp_cards ?? 0).toLocaleString("it-IT")} da WhatsApp`} icon="wallet" tone="accent" />
        <SuperAdminKpiCard label="Da pagare" value={loading ? "…" : summary.unpaid.toLocaleString("it-IT")} hint={loading ? "Caricamento…" : formatMoney(summary.outstanding_cents)} icon="clock" tone="warning" />
        <SuperAdminKpiCard label="Pagate" value={loading ? "…" : summary.paid.toLocaleString("it-IT")} hint={loading ? "Caricamento…" : formatMoney(summary.paid_cents)} icon="check" tone="success" />
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
          {stepUpActive ? "Modifiche abilitate per questa sessione." : "Modifiche bloccate finché non confermi MFA."}
        </p>
      </section>

      {editing ? (
        <section className="surface p-5" aria-labelledby="credit-edit-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="credit-edit-title" className="font-semibold text-neutral-950">Aggiorna richiesta #{editing.id}</h2>
              <p className="mt-1 text-sm text-neutral-600">{editing.organization_name} - {formatMoney(editing.amount_due_cents, editing.currency)}</p>
            </div>
            <button className="sa-btn" type="button" disabled={busy} onClick={() => setEditing(null)}>Chiudi</button>
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
        <form className="grid min-w-0 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1.25fr)_minmax(180px,1fr)_minmax(140px,0.7fr)_minmax(140px,0.7fr)_auto]" onSubmit={(event) => { event.preventDefault(); updateFilters({ q: query.trim() }); }}>
          <div className="relative min-w-0 flex-1">
            <label className="sr-only" htmlFor="card-credit-search">Cerca associazione o numero richiesta</label>
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--sa-soft)]"><SuperAdminIcon name="search" className="h-4 w-4" /></span>
            <input id="card-credit-search" className="theme-input w-full pl-11" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Associazione o numero richiesta" />
          </div>
          <div className="sa-toolbar__field">
            <label htmlFor="card-credit-organization">Associazione</label>
            <select id="card-credit-organization" className="premium-select w-full min-w-0" value={filters.org_id ?? ""} disabled={organizationsLoading || Boolean(organizationsError)} onChange={(event) => updateFilters({ org_id: event.target.value ? Number(event.target.value) : undefined })}>
              <option value="">{organizationsLoading ? "Caricamento associazioni…" : "Tutte le associazioni"}</option>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}{org.deleted_at || org.is_archived ? " (archiviata)" : ""}</option>)}
            </select>
          </div>
          <div className="sa-toolbar__field">
            <label htmlFor="card-credit-billing">Contabilità</label>
            <select id="card-credit-billing" className="premium-select" value={filters.billing_status} onChange={(event) => updateFilters({ billing_status: event.target.value as CreditFilters["billing_status"] })}>
              <option value="all">Tutti</option>
              <option value="unpaid">Da pagare</option>
              <option value="paid">Pagato</option>
              <option value="not_applicable">Non applicabile</option>
            </select>
          </div>
          <div className="sa-toolbar__field">
            <label htmlFor="card-credit-origin">Origine</label>
            <select id="card-credit-origin" className="premium-select" value={filters.scope} onChange={(event) => updateFilters({ scope: event.target.value as CreditFilters["scope"] })}>
              <option value="all">Tutte</option>
              <option value="portal">Online</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
          <SuperAdminActionButton icon="search" tone="primary" type="submit">Cerca</SuperAdminActionButton>
        </form>
        {organizationsError ? <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-sm text-red-700"><span>{organizationsError}</span><button className="sa-btn" type="button" onClick={() => setOrganizationsReload((current) => current + 1)}>Riprova associazioni</button></div> : null}
      </SuperAdminToolbar>

      <SuperAdminTableShell title="Registro richieste e crediti" subtitle={loading ? "Caricamento richieste…" : `${firstVisible}–${lastVisible} di ${resultTotal} richieste · Totali calcolati su tutti i risultati filtrati`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left">
            <caption className="sr-only">Richieste di rifornimento tessere e relativo stato contabile</caption>
            <thead>
              <tr>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Richiesta</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Associazione</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Tessere</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Importo</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Contabilità</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Allocazione</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Creata</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => <tr key={index}><td colSpan={8} className="px-5 py-4"><Skeleton className="h-5 w-full" /></td></tr>)
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10"><SuperAdminEmptyState title="Nessuna richiesta trovata" description="Modifica i filtri o attendi una nuova richiesta online o via WhatsApp." /></td></tr>
              ) : items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="px-5 py-4"><p className="font-semibold text-neutral-950">#{item.id}</p><p className="mt-1 text-xs text-neutral-500">{item.source === "org_admin_portal" ? "Online" : item.source === "whatsapp" ? "WhatsApp" : item.source}</p></td>
                  <td className="px-5 py-4"><p className="max-w-[240px] font-semibold text-neutral-900">{item.organization_name}</p>{item.notes ? <p className="mt-1 max-w-[260px] text-xs text-neutral-500">{item.notes}</p> : null}</td>
                  <td className="px-5 py-4 tabular-nums text-neutral-800">
                    {item.requested_cards.toLocaleString("it-IT")}
                    <p className="mt-1 text-xs text-neutral-500">Anno {item.requested_year}</p>
                  </td>
                  <td className="px-5 py-4 font-semibold tabular-nums text-neutral-950">{formatMoney(item.amount_due_cents, item.currency)}</td>
                  <td className="px-5 py-4"><SuperAdminStatusChip tone={billingTone(item.billing_status)} dot>{billingLabel(item.billing_status)}</SuperAdminStatusChip>{item.paid_at ? <p className="mt-2 text-xs text-neutral-500">Pagata il {formatDateTime(item.paid_at)}</p> : null}{item.payment_reference ? <p className="mt-2 text-xs text-neutral-500">Rif. {item.payment_reference}</p> : null}</td>
                  <td className="px-5 py-4"><SuperAdminStatusChip tone={item.card_batch_id ? "success" : "warning"}>{allocationLabel(item)}</SuperAdminStatusChip>{item.batch_range_start && item.batch_range_end ? <p className="mt-2 text-xs tabular-nums text-neutral-500">{item.batch_range_start} - {item.batch_range_end}</p> : null}</td>
                  <td className="px-5 py-4 text-sm text-neutral-700">{formatDateTime(item.created_at)}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button className="sa-btn" type="button" disabled={busy || item.billing_status === "not_applicable"} onClick={() => beginEdit(item)}>Contabilità</button>
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
        <nav aria-label="Paginazione crediti tessere" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sa-line)] px-5 py-4 text-sm text-[var(--sa-muted)]">
          <span>Pagina {Math.floor(filters.offset / PAGE_SIZE) + 1} di {pageCount}</span>
          <div className="flex gap-2">
            <button className="sa-btn" type="button" disabled={loading || filters.offset === 0} onClick={() => setFilters((current) => ({ ...current, offset: Math.max(0, current.offset - PAGE_SIZE) }))}>Precedente</button>
            <button className="sa-btn" type="button" disabled={loading || filters.offset + PAGE_SIZE >= resultTotal} onClick={() => setFilters((current) => ({ ...current, offset: current.offset + PAGE_SIZE }))}>Successiva</button>
          </div>
        </nav>
      </SuperAdminTableShell>
    </div>
  );
};

export default SuperAdminCardCredits;
