import { FormEvent, useEffect, useState } from "react";

import {
  downloadAuditEventsCsv,
  fetchAuditEvents,
  type AuditEvent,
  type AuditEventFilters,
} from "../../lib/api";

const OUTCOME_LABELS: Record<AuditEvent["outcome"], string> = {
  success: "Riuscita",
  failure: "Fallita",
  blocked: "Bloccata",
  warning: "Attenzione",
};

const OUTCOME_STYLES: Record<AuditEvent["outcome"], string> = {
  success: "bg-emerald-50 text-emerald-800",
  failure: "bg-red-50 text-red-800",
  blocked: "bg-amber-50 text-amber-800",
  warning: "bg-orange-50 text-orange-800",
};

const humanize = (value: string | null | undefined) =>
  (value || "-")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const formatDate = (value: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString("it-IT", {
        dateStyle: "short",
        timeStyle: "medium",
      });
};

type Props = {
  scope: "super-admin" | "org-admin";
  showOrganization?: boolean;
};

const AuditRegistry = ({ scope, showOrganization = false }: Props) => {
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [filters, setFilters] = useState<AuditEventFilters>({ limit: 50 });
  const [draftSearch, setDraftSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = async (append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const page = await fetchAuditEvents(scope, {
        ...filters,
        cursor: append && nextCursor ? nextCursor : undefined,
      });
      setItems((current) => (append ? [...current, ...page.items] : page.items));
      setNextCursor(page.next_cursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Registro non disponibile");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void load(false);
    // Each filter update restarts cursor pagination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, filters.category, filters.outcome, filters.dateFrom, filters.dateTo, filters.q]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: draftSearch.trim() || undefined }));
  };

  const exportCsv = async () => {
    setError("");
    try {
      await downloadAuditEventsCsv(scope, filters);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Esportazione non riuscita");
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Tracciabilità operativa</p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Registro attività</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-600">
            Operazioni amministrative consultabili senza mostrare password, token o dati personali in chiaro.
          </p>
        </div>
        <button className="btn-secondary px-4 py-2" type="button" onClick={exportCsv}>
          Esporta CSV
        </button>
      </header>

      <section className="surface p-4" aria-label="Filtri registro attività">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" onSubmit={submitSearch}>
          <div className="xl:col-span-2">
            <label className="text-sm font-medium text-neutral-800" htmlFor={`${scope}-audit-search`}>Cerca azione o entità</label>
            <div className="mt-1 flex gap-2">
              <input id={`${scope}-audit-search`} className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} />
              <button className="btn-primary px-4" type="submit">Cerca</button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-800" htmlFor={`${scope}-audit-category`}>Categoria</label>
            <select id={`${scope}-audit-category`} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2" value={filters.category || ""} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value || undefined }))}>
              <option value="">Tutte</option>
              <option value="auth">Accessi</option>
              <option value="member">Soci</option>
              <option value="card">Tessere</option>
              <option value="document">Documenti</option>
              <option value="payment">Pagamenti</option>
              <option value="organization">Associazioni</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-800" htmlFor={`${scope}-audit-outcome`}>Esito</label>
            <select id={`${scope}-audit-outcome`} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2" value={filters.outcome || ""} onChange={(event) => setFilters((current) => ({ ...current, outcome: (event.target.value || undefined) as AuditEventFilters["outcome"] }))}>
              <option value="">Tutti</option>
              <option value="success">Riuscita</option>
              <option value="failure">Fallita</option>
              <option value="blocked">Bloccata</option>
              <option value="warning">Attenzione</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-sm font-medium text-neutral-800" htmlFor={`${scope}-audit-from`}>Dal</label><input id={`${scope}-audit-from`} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2 py-2" type="date" value={filters.dateFrom || ""} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value || undefined }))} /></div>
            <div><label className="text-sm font-medium text-neutral-800" htmlFor={`${scope}-audit-to`}>Al</label><input id={`${scope}-audit-to`} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2 py-2" type="date" value={filters.dateTo || ""} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value || undefined }))} /></div>
          </div>
        </form>
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div> : null}

      <section className="surface overflow-hidden" aria-busy={loading}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <caption className="sr-only">Elenco cronologico delle attività amministrative</caption>
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600">
              <tr><th scope="col" className="px-4 py-3">Data</th><th scope="col" className="px-4 py-3">Operazione</th><th scope="col" className="px-4 py-3">Esito</th><th scope="col" className="px-4 py-3">Attore</th>{showOrganization ? <th scope="col" className="px-4 py-3">Associazione</th> : null}<th scope="col" className="px-4 py-3">Entità</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {!loading && items.length === 0 ? <tr><td className="px-4 py-10 text-center text-neutral-500" colSpan={showOrganization ? 6 : 5}>Nessuna attività per i filtri selezionati.</td></tr> : null}
              {items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-600"><time dateTime={item.created_at || undefined}>{formatDate(item.created_at)}</time></td>
                  <td className="px-4 py-3"><p className="font-medium text-neutral-950">{humanize(item.action)}</p><p className="mt-0.5 text-xs text-neutral-500">{humanize(item.category)}</p></td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${OUTCOME_STYLES[item.outcome]}`}>{OUTCOME_LABELS[item.outcome]}</span></td>
                  <td className="px-4 py-3 text-neutral-700">{humanize(item.actor.role)}{item.actor.admin_id ? <span className="block text-xs text-neutral-500">ID {item.actor.admin_id}</span> : null}</td>
                  {showOrganization ? <td className="px-4 py-3 text-neutral-700">{item.organization?.name || (item.organization ? `ID ${item.organization.id}` : "-")}</td> : null}
                  <td className="px-4 py-3 text-neutral-700">{humanize(item.entity.type)}{item.entity.id ? <span className="block text-xs text-neutral-500">ID {item.entity.id}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? <p className="px-4 py-10 text-center text-sm text-neutral-500" role="status">Caricamento attività…</p> : null}
        {nextCursor ? <div className="border-t border-neutral-200 p-4 text-center"><button className="btn-secondary px-4 py-2" type="button" disabled={loadingMore} onClick={() => void load(true)}>{loadingMore ? "Caricamento…" : "Carica altre attività"}</button></div> : null}
      </section>
    </div>
  );
};

export default AuditRegistry;
