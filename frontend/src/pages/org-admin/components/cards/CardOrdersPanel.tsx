import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import ModalShell from "../../../../components/ui/ModalShell";
import {
  AuthError,
  fetchCardMovements,
  fetchOrgAdminCardReplenishments,
  type CardLotOption,
  type CardMovementsResponse,
  type CardReplenishmentRequest,
  type OrgAdminCardReplenishmentsResponse,
} from "../../../../lib/api";
import "./CardOrdersPanel.css";

type Props = {
  currentYear: number;
  revision: number;
  focusRequest?: CardReplenishmentRequest | null;
};
type View = "requests" | "lots";
type FilterValues = { status: string; lot: string; year: string };
type FilterMetadata = { years: number[]; lots: CardLotOption[] };
const PAGE_SIZE = 20;
const billingLabels = { unpaid: "Da pagare", paid: "Pagato", not_applicable: "Storico" };
const billingFilterLabels = { unpaid: "Da pagare", paid: "Pagate", not_applicable: "Storico" };

function FilterFields({ view, values, onChange, years, lots, sheet = false, lotsLoading = false }: {
  view: View; values: FilterValues; onChange: (values: FilterValues) => void;
  years: number[]; lots: CardLotOption[]; sheet?: boolean; lotsLoading?: boolean;
}) {
  return <>
    <label className="cards-orders__filter"><span className={sheet ? undefined : "sr-only"}>{view === "requests" ? "Stato richieste" : "Stato lotti"}</span>
      <select value={values.status} onChange={event => onChange({ ...values, status: event.target.value })}>
        <option value="">Tutti gli stati</option>
        {view === "requests" ? <><option value="unpaid">Da pagare</option><option value="paid">Pagate</option><option value="not_applicable">Storico</option></> : <><option value="Attivo">Attivi</option><option value="Disattivo">Disattivi</option><option value="Esaurito">Esauriti</option></>}
      </select>
    </label>
    <label className="cards-orders__filter"><span className={sheet ? undefined : "sr-only"}>Lotto</span>
      <select value={values.lot} disabled={lotsLoading} onChange={event => onChange({ ...values, lot: event.target.value })}>
        <option value="">Tutti i lotti</option>
        {values.lot && !lots.some(item => String(item.id) === values.lot) && <option value={values.lot}>Lotto #{values.lot}</option>}
        {lots.map(item => <option key={item.id} value={item.id}>{lotLabel(item)} · {item.year}</option>)}
      </select>
    </label>
    <label className="cards-orders__filter"><span className={sheet ? undefined : "sr-only"}>Anno tessere</span>
      <select value={values.year} onChange={event => onChange({ ...values, year: event.target.value, lot: "" })}>
        <option value="">Tutti gli anni</option>
        {values.year && !years.includes(Number(values.year)) && <option value={values.year}>{values.year}</option>}
        {years.map(item => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  </>;
}

function money(cents: number, currency = "EUR") {
  const code = String(currency || "EUR").trim().toUpperCase();
  try { return new Intl.NumberFormat("it-IT", { style: "currency", currency: code }).format(cents / 100); }
  catch { return `${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`; }
}
function date(value?: string | null) {
  if (!value) return "Data non indicata";
  const normalized = value.length === 10 ? `${value}T12:00:00Z` : /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? "Data non indicata" : parsed.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
}
function sourceLabel(source: string) {
  return ({ whatsapp: "WhatsApp", org_admin_portal: "Area riservata", portal: "Area riservata", manual: "Inserimento manuale", legacy: "Storico" } as Record<string, string>)[source.toLowerCase()] ?? "Richiesta tessere";
}
function lotLabel(lot: CardLotOption) {
  return `${lot.range_start_label ?? lot.range_start}–${lot.range_end_label ?? lot.range_end}`;
}
function lotTone(status: string) {
  return status === "Attivo" ? "success" : status === "Esaurito" ? "danger" : "muted";
}

export default function CardOrdersPanel({ currentYear, revision, focusRequest }: Props) {
  const navigate = useNavigate();
  const id = useId();
  const [view, setView] = useState<View>("requests");
  const [year, setYear] = useState(String(focusRequest?.requested_year ?? currentYear));
  const [lot, setLot] = useState(focusRequest?.card_batch_id == null ? "" : String(focusRequest.card_batch_id));
  const [billing, setBilling] = useState("");
  const [lotStatus, setLotStatus] = useState("");
  const [requestPage, setRequestPage] = useState(0);
  const [lotPage, setLotPage] = useState(0);
  const [orders, setOrders] = useState<OrgAdminCardReplenishmentsResponse | null>(null);
  const [movements, setMovements] = useState<CardMovementsResponse | null>(null);
  const [years, setYears] = useState<number[]>([currentYear]);
  const [lots, setLots] = useState<CardLotOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [note, setNote] = useState<{ id: number; text: string } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState<FilterValues>({ status: "", lot: "", year: String(currentYear) });
  const [metadata, setMetadata] = useState<FilterMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState("");
  const [metadataRetry, setMetadataRetry] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const content = useRef<HTMLDivElement | null>(null);
  const desktopFilters = useRef<HTMLDivElement | null>(null);
  const filtersOpenRef = useRef(false);
  filtersOpenRef.current = filtersOpen;
  const requestRows = useRef(new Map<number, HTMLLIElement>());
  const pendingFocus = useRef<CardReplenishmentRequest | null>(focusRequest ?? null);
  const focusTarget = useRef<CardReplenishmentRequest | null>(focusRequest ?? null);
  const page = view === "requests" ? requestPage : lotPage;
  const closeNote = useCallback(() => {
    setNote(null);
    window.requestAnimationFrame(() => {
      if (document.activeElement === document.body) content.current?.focus();
    });
  }, []);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);

  useEffect(() => {
    if (!window.matchMedia) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onResize = () => {
      if (!desktop.matches || !filtersOpenRef.current) return;
      closeFilters();
      window.requestAnimationFrame(() => desktopFilters.current?.querySelector<HTMLSelectElement>("select")?.focus());
    };
    desktop.addEventListener("change", onResize);
    return () => desktop.removeEventListener("change", onResize);
  }, [closeFilters]);

  useEffect(() => {
    if (!filtersOpen) return;
    const controller = new AbortController();
    setMetadataLoading(true); setMetadataError(""); setMetadata(null);
    const load = async () => {
      try {
        const result = view === "requests"
          ? await fetchOrgAdminCardReplenishments({ all_years: true, limit: 1, offset: 0 }, controller.signal)
          : await fetchCardMovements({ all_years: true, limit: 1, offset: 0 }, controller.signal);
        if (!controller.signal.aborted) setMetadata({ years: Array.from(new Set([currentYear, ...(result.available_years ?? [])])).sort((a, b) => b - a), lots: result.lot_options ?? [] });
      } catch (reason) {
        if (controller.signal.aborted) return;
        if (reason instanceof AuthError) navigate("/org-admin/login", { replace: true });
        else setMetadataError("Impossibile caricare tutti i lotti. Puoi riprovare senza perdere i filtri scelti.");
      } finally { if (!controller.signal.aborted) setMetadataLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [filtersOpen, view, revision, metadataRetry, currentYear, navigate]);

  useEffect(() => {
    pendingFocus.current = focusRequest ?? null;
    focusTarget.current = focusRequest ?? null;
    if (!focusRequest) return;
    closeFilters();
    setView("requests");
    setYear(String(focusRequest.requested_year));
    setLot(focusRequest.card_batch_id == null ? "" : String(focusRequest.card_batch_id));
    setBilling("");
    setRequestPage(0);
    setLotPage(0);
  }, [focusRequest, closeFilters]);

  useEffect(() => {
    // A newly created order can change the view and filters together. Wait for
    // that state to settle instead of dispatching the previous view's request.
    const focus = pendingFocus.current;
    if (focus && (view !== "requests" || year !== String(focus.requested_year) || lot !== (focus.card_batch_id == null ? "" : String(focus.card_batch_id)) || billing !== "" || requestPage !== 0)) return;
    pendingFocus.current = null;
    const controller = new AbortController();
    let focusFrame: number | undefined;
    setLoading(true);
    setError("");
    const yearFilter = year ? { year: Number(year) } : { all_years: true };
    const load = async () => {
      try {
        if (view === "requests") {
          const result = await fetchOrgAdminCardReplenishments({
            ...yearFilter,
            limit: PAGE_SIZE,
            offset: requestPage * PAGE_SIZE,
            ...(billing ? { billing_status: billing as CardReplenishmentRequest["billing_status"] } : {}),
            ...(lot ? { card_batch_id: Number(lot) } : {}),
          }, controller.signal);
          if (controller.signal.aborted) return;
          const lastPage = Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1);
          if (requestPage > lastPage) { setRequestPage(lastPage); return; }
          setOrders(result);
          setYears(Array.from(new Set([currentYear, ...(result.available_years ?? [])])).sort((a, b) => b - a));
          setLots(result.lot_options ?? []);
          const target = focusTarget.current;
          if (target) {
            if (!result.items.some(item => item.id === target.id)) focusTarget.current = null;
            else focusFrame = window.requestAnimationFrame(() => {
              if (controller.signal.aborted || focusTarget.current !== target) return;
              const row = requestRows.current.get(target.id);
              if (!row?.isConnected || row.closest("[hidden]")) return;
              focusTarget.current = null;
              row.focus({ preventScroll: true });
              row.scrollIntoView?.({ block: "center", behavior: "auto" });
            });
          }
        } else {
          const result = await fetchCardMovements({
            ...yearFilter,
            limit: PAGE_SIZE,
            offset: lotPage * PAGE_SIZE,
            ...(lotStatus ? { status: lotStatus } : {}),
            ...(lot ? { batch_id: Number(lot) } : {}),
          }, controller.signal);
          if (controller.signal.aborted) return;
          const lastPage = Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1);
          if (lotPage > lastPage) { setLotPage(lastPage); return; }
          setMovements(result);
          setYears(Array.from(new Set([currentYear, ...(result.available_years ?? [])])).sort((a, b) => b - a));
          setLots(result.lot_options ?? []);
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        if (reason instanceof AuthError) navigate("/org-admin/login", { replace: true });
        else setError(reason instanceof Error ? reason.message : "Impossibile caricare lo storico. Riprova.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => { controller.abort(); if (focusFrame != null) window.cancelAnimationFrame(focusFrame); };
  }, [view, year, lot, billing, lotStatus, requestPage, lotPage, currentYear, revision, retry, navigate, focusRequest]);

  const resetPages = () => { focusTarget.current = null; setRequestPage(0); setLotPage(0); };
  const resetFilters = () => { setYear(String(currentYear)); setLot(""); setBilling(""); setLotStatus(""); resetPages(); };
  const selectView = (next: View) => { focusTarget.current = null; closeFilters(); setView(next); };
  const applied = { year, lot, status: view === "requests" ? billing : lotStatus };
  const applyFilters = (values: FilterValues) => {
    setYear(values.year); setLot(values.lot);
    if (view === "requests") setBilling(values.status); else setLotStatus(values.status);
    resetPages();
  };
  const openFilters = () => { focusTarget.current = null; setDraft(applied); setFiltersOpen(true); };
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
    selectView(next === 0 ? "requests" : "lots");
    tabs.current[next]?.focus();
  };
  const total = view === "requests" ? orders?.total ?? 0 : movements?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = year !== String(currentYear) || Boolean(lot || (view === "requests" ? billing : lotStatus));
  const filterCount = Number(Boolean(year)) + Number(Boolean(lot)) + Number(Boolean(applied.status));
  const selectedLot = lots.find(item => String(item.id) === lot);
  const statusLabel = view === "requests" ? billingFilterLabels[billing as keyof typeof billingFilterLabels] : lotStatus;
  const draftYears = metadata?.years ?? years;
  const draftLots = (metadata?.lots ?? []).filter(item => !draft.year || String(item.year) === draft.year);

  return <section className="cards-orders" aria-label="Movimenti e ordini tessere">
    <div className="cards-orders__view-tabs" role="tablist" aria-label="Tipo di storico">
      {([ ["requests", "Richieste"], ["lots", "Lotti"] ] as const).map(([key, label], index) => <button key={key} ref={node => { tabs.current[index] = node; }} type="button" role="tab" id={`${id}-${key}`} aria-selected={view === key} aria-controls={view === key ? `${id}-content` : undefined} tabIndex={view === key ? 0 : -1} onClick={() => selectView(key)} onKeyDown={event => handleTabKey(event, index)}>{label}</button>)}
    </div>

    {!filtersOpen && <div ref={desktopFilters} className="cards-orders__desktop-filters" role="group" aria-label="Filtra lo storico">
      <FilterFields view={view} values={applied} onChange={applyFilters} years={years} lots={lots} />
      {filtered && <button type="button" className="cards-orders__reset" onClick={resetFilters}>Azzera filtri</button>}
    </div>}
    <div className="cards-orders__mobile-toolbar"><button type="button" className="cards-orders__filters-trigger" aria-label={filterCount ? `Filtri (${filterCount} ${filterCount === 1 ? "attivo" : "attivi"})` : "Filtri"} aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={openFilters}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M7 12h10M10 17h4" /></svg><span>Filtri</span>{filterCount > 0 && <span className="cards-orders__filter-count">{filterCount}</span>}</button></div>
    {filterCount > 0 && <div className="cards-orders__active-filters" aria-label="Filtri applicati">
      {year && <button type="button" aria-label={`Rimuovi filtro anno ${year}`} onClick={() => { setYear(""); resetPages(); }}><span>Anno {year}</span><span aria-hidden="true">×</span></button>}
      {applied.status && <button type="button" aria-label={`Rimuovi filtro stato ${statusLabel}`} onClick={() => { if (view === "requests") setBilling(""); else setLotStatus(""); resetPages(); }}><span>{statusLabel}</span><span aria-hidden="true">×</span></button>}
      {lot && <button type="button" aria-label={`Rimuovi filtro lotto ${selectedLot ? lotLabel(selectedLot) : `#${lot}`}`} onClick={() => { setLot(""); resetPages(); }}><span>Lotto {selectedLot ? lotLabel(selectedLot) : `#${lot}`}</span><span aria-hidden="true">×</span></button>}
    </div>}

    <div ref={content} role="tabpanel" id={`${id}-content`} aria-labelledby={`${id}-${view}`} className="cards-orders__content" tabIndex={0} aria-busy={loading}>
      {loading ? <p className="cards-orders__message" role="status">Caricamento {view === "requests" ? "richieste" : "lotti"}…</p> : error ? <div className="cards-orders__message"><p role="alert">{error}</p><button type="button" className="btn-ghost" onClick={() => setRetry(value => value + 1)}>Riprova storico</button></div> : <>
        {view === "requests" && orders && <>
          <dl className="cards-orders__billing" aria-label="Totali delle richieste filtrate">
            <div className="cards-orders__billing-item cards-orders__billing-item--warning"><dt>Da pagare</dt><dd>{money(orders.summary.outstanding_cents, orders.capability.currency)}</dd></div>
            <div className="cards-orders__billing-item cards-orders__billing-item--success"><dt>Pagate</dt><dd>{money(orders.summary.paid_cents, orders.capability.currency)}</dd></div>
          </dl>
          <p className="cards-orders__count">{total} {total === 1 ? "richiesta" : "richieste"}{filtered ? " · filtri attivi" : ` · ${year}`}</p>
          {orders.items.length ? <ul className="cards-orders__list" aria-label="Richieste di rifornimento">
            {orders.items.map(item => <li key={item.id} tabIndex={-1} ref={node => { if (node) requestRows.current.set(item.id, node); else requestRows.current.delete(item.id); }} className={`cards-orders__row ${focusRequest?.id === item.id ? "cards-orders__row--focused" : ""}`}>
              <div className="cards-orders__row-main"><h3>Richiesta #{item.id} <span>· {sourceLabel(item.source)}</span></h3><div className="cards-orders__row-meta"><time dateTime={item.created_at ?? undefined}>{date(item.created_at)}</time>{item.notes?.trim() && <button type="button" className="cards-orders__note-action" aria-label={`Leggi note della richiesta #${item.id}`} title="Leggi note" onClick={() => { focusTarget.current = null; setNote({ id: item.id, text: item.notes ?? "" }); }}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 8h8M8 12h5M4 4h16v14H9l-5 4V4z" /></svg></button>}</div></div>
              <div className="cards-orders__row-detail"><p>{item.requested_cards.toLocaleString("it-IT")} {item.requested_cards === 1 ? "tessera" : "tessere"}{!year ? ` · ${item.requested_year}` : ""}{item.card_batch_id != null ? ` · Lotto #${item.card_batch_id}` : " · Lotto in attesa"}</p><div className="cards-orders__row-billing"><span className="cards-orders__amount" aria-label={item.billing_status === "not_applicable" ? "Importo storico non contabilizzato" : undefined}>{item.billing_status === "not_applicable" ? "—" : money(item.amount_due_cents, item.currency)}</span><span className={`cards-orders__badge cards-orders__badge--${item.billing_status === "unpaid" ? "warning" : item.billing_status === "paid" ? "success" : "muted"}`}>{billingLabels[item.billing_status]}</span></div></div>
            </li>)}
          </ul> : <p className="cards-orders__message">{filtered ? "Nessuna richiesta corrisponde ai filtri." : "Nessuna richiesta di rifornimento per quest'anno."}</p>}
        </>}
        {view === "lots" && movements && <>
          <p className="cards-orders__count">{total} {total === 1 ? "lotto" : "lotti"}{filtered ? " · filtri attivi" : ` · ${year}`}</p>
          {movements.items.length ? <ul className="cards-orders__list" aria-label="Lotti tessere">
            {movements.items.map(item => <li key={item.id} className="cards-orders__row">
              <div className="cards-orders__row-main"><h3>Lotto #{item.id}{!year && <span> · {item.year}</span>}</h3><time dateTime={item.created_at ?? undefined}>{date(item.created_at)}</time></div>
              <div className="cards-orders__row-detail"><p>{item.range_start_label ?? item.range_start}–{item.range_end_label ?? item.range_end} · {item.quantity.toLocaleString("it-IT")} {item.quantity === 1 ? "tessera" : "tessere"}</p><span className={`cards-orders__badge cards-orders__badge--${lotTone(item.status_label)}`}>{item.status_label}</span></div>
            </li>)}
          </ul> : <p className="cards-orders__message">{filtered ? "Nessun lotto corrisponde ai filtri." : "Nessun lotto disponibile per quest'anno."}</p>}
        </>}
        {total > PAGE_SIZE && <nav className="cards-orders__pagination" aria-label="Pagine dello storico">
          <button type="button" className="btn-ghost" disabled={page === 0} onClick={() => { focusTarget.current = null; if (view === "requests") setRequestPage(value => value - 1); else setLotPage(value => value - 1); content.current?.focus(); }}>Precedenti</button>
          <span aria-live="polite">{page + 1} / {pageCount}</span>
          <button type="button" className="btn-ghost" disabled={page + 1 >= pageCount} onClick={() => { focusTarget.current = null; if (view === "requests") setRequestPage(value => value + 1); else setLotPage(value => value + 1); content.current?.focus(); }}>Successivi</button>
        </nav>}
      </>}
    </div>
    <ModalShell open={Boolean(note)} title={`Note richiesta #${note?.id ?? ""}`} onClose={closeNote} placement="bottom" sizeClassName="max-w-lg cards-orders__note-sheet">
      <p className="cards-orders__note-copy">{note?.text}</p>
    </ModalShell>
    <ModalShell open={filtersOpen} title={view === "requests" ? "Filtri richieste" : "Filtri lotti"} onClose={closeFilters} placement="bottom" sizeClassName="max-w-lg cards-orders__filters-sheet" footer={<><button type="button" className="btn-ghost cards-orders__filters-footer-button" onClick={() => setDraft({ year: String(currentYear), lot: "", status: "" })}>Reimposta</button><button type="button" className="btn-primary cards-orders__filters-footer-button" onClick={() => { applyFilters(draft); closeFilters(); }}>Applica filtri</button></>}>
      <div className="cards-orders__filter-form"><FilterFields view={view} values={draft} onChange={setDraft} years={draftYears} lots={draftLots} sheet lotsLoading={metadataLoading || !metadata} /></div>
      {metadataLoading && <p className="cards-orders__filter-loading" role="status">Caricamento lotti…</p>}
      {metadataError && <div className="cards-orders__filter-error"><p role="alert">{metadataError}</p><button type="button" className="cards-orders__reset" onClick={() => setMetadataRetry(value => value + 1)}>Riprova lotti</button></div>}
    </ModalShell>
  </section>;
}
