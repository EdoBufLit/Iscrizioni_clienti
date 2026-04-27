import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import Skeleton from "../../components/ui/Skeleton";
import {
  AuthError,
  downloadCardLotRegistryExcel,
  fetchCardLotRegistry,
  type CardLotRegistryItem,
  type SuperAdminProfile,
} from "../../lib/api";
import {
  SuperAdminActionButton,
  SuperAdminEmptyState,
  SuperAdminIcon,
  SuperAdminKpiCard,
  SuperAdminPageHeader,
  SuperAdminProgressMeter,
  SuperAdminStatusChip,
  SuperAdminTableShell,
  SuperAdminToolbar,
  type SuperAdminTone,
} from "./components/SuperAdminPrimitives";

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusTone = (statusLabel: string): SuperAdminTone => {
  if (statusLabel === "Attivo") return "success";
  if (statusLabel === "Esaurito") return "warning";
  if (statusLabel === "Rilasciato") return "muted";
  if (statusLabel === "Disattivo") return "danger";
  return "default";
};

const lotUsage = (item: CardLotRegistryItem) => {
  const assigned = item.next_no == null ? 0 : Math.max(0, item.next_no - item.range_start);
  const clampedAssigned = Math.min(item.quantity, assigned);
  const remaining = Math.max(0, item.quantity - clampedAssigned);
  const percent = item.quantity > 0 ? Math.round((clampedAssigned / item.quantity) * 100) : 0;
  return { assigned: clampedAssigned, remaining, percent };
};

const SuperAdminCardLots = () => {
  const navigate = useNavigate();
  const { profile } = useOutletContext<{ profile: SuperAdminProfile | null }>();

  const [items, setItems] = useState<CardLotRegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");

  const loadRegistry = async () => {
    if (!profile) return;
    setLoading(true);
    setError("");
    try {
      const payload = await fetchCardLotRegistry();
      setItems(payload.items);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/super-admin/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Errore nel caricamento del registro lotti");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRegistry();
  }, [navigate, profile]);

  const years = useMemo(
    () => Array.from(new Set(items.map((item) => item.year))).sort((a, b) => b - a),
    [items],
  );

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const usage = lotUsage(item);
        acc.totalLots += 1;
        acc.totalCards += item.quantity;
        acc.remaining += usage.remaining;
        if (item.status_label === "Attivo") acc.activeLots += 1;
        if (item.status_label === "Esaurito") acc.exhaustedLots += 1;
        if (item.released_at) acc.releasedLots += 1;
        if ((item.numbering_scope_name || "").toLowerCase().includes("central")) acc.shared += 1;
        else acc.dedicated += 1;
        return acc;
      },
      { totalLots: 0, totalCards: 0, activeLots: 0, exhaustedLots: 0, releasedLots: 0, remaining: 0, shared: 0, dedicated: 0 },
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      if (normalizedQuery) {
        const haystack = `${item.organization_name ?? ""} ${item.numbering_scope_name ?? ""} ${item.batch_id}`.toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      if (statusFilter !== "all" && item.status_label !== statusFilter) return false;
      if (scopeFilter === "shared" && !(item.numbering_scope_name || "").toLowerCase().includes("central")) return false;
      if (scopeFilter === "dedicated" && (item.numbering_scope_name || "").toLowerCase().includes("central")) return false;
      if (yearFilter !== "all" && String(item.year) !== yearFilter) return false;
      return true;
    });
  }, [items, query, scopeFilter, statusFilter, yearFilter]);

  const handleDownload = async () => {
    setExporting(true);
    setError("");
    try {
      await downloadCardLotRegistryExcel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile scaricare l'Excel");
    } finally {
      setExporting(false);
    }
  };

  const resetFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setScopeFilter("all");
    setYearFilter("all");
  };

  if (!profile) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="sa-page">
      <SuperAdminPageHeader
        icon="cards"
        eyebrow="Governance"
        title="Registro lotti"
        subtitle="Registro centrale dei lotti tessere ASSONAM generato direttamente dal database."
        actions={
          <>
            <SuperAdminActionButton icon="refresh" onClick={() => void loadRegistry()} disabled={loading}>
              Aggiorna
            </SuperAdminActionButton>
            <SuperAdminActionButton icon="download" tone="primary" onClick={handleDownload} disabled={exporting || loading}>
              {exporting ? "Download..." : "Scarica Excel"}
            </SuperAdminActionButton>
          </>
        }
      />

      {error ? <div className="rounded-xl border border-red-200/60 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div> : null}

      <section className="sa-kpi-grid sa-kpi-grid--six">
        <SuperAdminKpiCard label="Lotti totali" value={totals.totalLots.toLocaleString("it-IT")} hint="Tutti i lotti registrati" icon="cards" tone="success" />
        <SuperAdminKpiCard label="Tessere totali" value={totals.totalCards.toLocaleString("it-IT")} hint="Totale tessere nei lotti" icon="card" tone="success" />
        <SuperAdminKpiCard label="Lotti attivi" value={totals.activeLots.toLocaleString("it-IT")} hint={`${Math.round((totals.activeLots / Math.max(1, totals.totalLots)) * 100)}% del totale`} icon="check" tone="success" />
        <SuperAdminKpiCard label="Lotti esauriti" value={totals.exhaustedLots.toLocaleString("it-IT")} hint="Disponibilita zero" icon="clock" tone="warning" />
        <SuperAdminKpiCard label="Lotti storici" value={totals.releasedLots.toLocaleString("it-IT")} hint="Rilasciati o chiusi" icon="documents" tone="muted" />
        <SuperAdminKpiCard label="Scope" value={`${totals.shared} / ${totals.dedicated}`} hint="Condivisi / dedicati" icon="shield" tone="purple" />
      </section>

      <SuperAdminToolbar>
        <div className="sa-toolbar__row">
          <div className="flex-1 min-w-0 relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--sa-soft)]">
              <SuperAdminIcon name="search" className="h-4 w-4" />
            </span>
            <input
              className="theme-input w-full pl-11"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca per organizzazione, numero lotto o scope..."
            />
          </div>
          <div className="sa-toolbar__field">
            <label>Stato</label>
            <select className="premium-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Tutti</option>
              <option value="Attivo">Attivi</option>
              <option value="Esaurito">Esauriti</option>
              <option value="Rilasciato">Storici</option>
              <option value="Disattivo">Disattivi</option>
            </select>
          </div>
          <div className="sa-toolbar__field">
            <label>Scope</label>
            <select className="premium-select" value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)}>
              <option value="all">Tutti</option>
              <option value="shared">Condivisi</option>
              <option value="dedicated">Dedicati</option>
            </select>
          </div>
          <div className="sa-toolbar__field">
            <label>Anno</label>
            <select className="premium-select" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
              <option value="all">Tutti</option>
              {years.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <SuperAdminActionButton icon="refresh" onClick={resetFilters}>Reset</SuperAdminActionButton>
        </div>
      </SuperAdminToolbar>

      <SuperAdminTableShell
        title="Registro centrale"
        subtitle={`${filteredItems.length.toLocaleString("it-IT")} lotti visibili su ${items.length.toLocaleString("it-IT")}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Organizzazione</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Lotto</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Range</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Quantita</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Stato</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Disponibilita</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Scope</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Richiesta</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Creazione</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Rilascio</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index}>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-44 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-16 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-28 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-20 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-6 w-20 rounded-full" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-8 w-36 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-24 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-14 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-28 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-28 rounded" /></td>
                  </tr>
                ))
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-10">
                    <SuperAdminEmptyState
                      title="Nessun lotto trovato"
                      description="Modifica i filtri o apri la gestione lotti dalla riga associazione."
                    />
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const usage = lotUsage(item);
                  return (
                    <tr key={item.id} className="align-top">
                      <td className="px-5 py-4">
                        <div className="min-w-[220px]">
                          <p className="text-sm font-semibold text-neutral-900">{item.organization_name || "-"}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-neutral-400">Anno {item.year}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-neutral-900">#{item.batch_id}</td>
                      <td className="px-5 py-4 text-sm text-neutral-700">
                        {item.range_start_label} - {item.range_end_label}
                      </td>
                      <td className="px-5 py-4 text-sm text-neutral-700">{item.quantity.toLocaleString("it-IT")}</td>
                      <td className="px-5 py-4">
                        <SuperAdminStatusChip tone={statusTone(item.status_label)} dot>
                          {item.status_label}
                        </SuperAdminStatusChip>
                      </td>
                      <td className="px-5 py-4">
                        <SuperAdminProgressMeter
                          value={usage.percent}
                          tone={usage.remaining === 0 ? "warning" : "success"}
                          label={`${usage.remaining.toLocaleString("it-IT")} disponibili`}
                        />
                      </td>
                      <td className="px-5 py-4 text-sm text-neutral-700">{item.numbering_scope_name || "Legacy"}</td>
                      <td className="px-5 py-4 text-sm text-neutral-700">
                        {item.recharge_request_id ? `#${item.recharge_request_id}` : "-"}
                      </td>
                      <td className="px-5 py-4 text-sm text-neutral-700">{formatDateTime(item.created_at)}</td>
                      <td className="px-5 py-4 text-sm text-neutral-700">{formatDateTime(item.released_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SuperAdminTableShell>
    </div>
  );
};

export default SuperAdminCardLots;
