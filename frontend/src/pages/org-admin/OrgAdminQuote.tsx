import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ModalShell from "../../components/ui/ModalShell";
import Skeleton from "../../components/ui/Skeleton";
import {
  AuthError,
  confirmOrgAdminRenewal,
  fetchOrgAdminQuotes,
  recordOrgAdminRenewalPayment,
  type QuoteCenterResponse,
  type QuoteCenterRow,
} from "../../lib/api";
import { EmptyState, KpiCard, PageHeader, SectionPanel, StatusChip } from "./components/OrgAdminPrimitives";
import MemberBulkActions from "./components/MemberBulkActions";
import { useOrgAdmin } from "./OrgAdminLayout";

const currentYear = new Date().getFullYear();
const defaultYear = currentYear + 1;

const euro = (value: number, currency = "EUR") =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value);

const formatDate = (value: string | null) => {
  if (!value) return "-";
  return new Date(`${value}T12:00:00`).toLocaleDateString("it-IT");
};

const renewalLabel = (row: QuoteCenterRow) => {
  if (row.renewed) return "Rinnovato";
  if (row.renewal_status === "approved_waiting_card") return "Approvato, attesa tessera";
  if (row.renewal_status === "paid_waiting_card") return "Pagato, attesa tessera";
  if (row.renewal_status === "payment_pending") return "Pagamento in corso";
  return "Da rinnovare";
};

const renewalTone = (row: QuoteCenterRow): "success" | "warning" | "info" | "muted" => {
  if (row.renewed) return "success";
  if (["approved_waiting_card", "paid_waiting_card"].includes(row.renewal_status)) return "info";
  if (row.renewal_status === "payment_pending") return "warning";
  return "muted";
};

const OrgAdminQuote = () => {
  const navigate = useNavigate();
  const { admin } = useOrgAdmin();
  const [year, setYear] = useState(defaultYear);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<QuoteCenterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [paymentRow, setPaymentRow] = useState<QuoteCenterRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const generation = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const next = await fetchOrgAdminQuotes({ year, status, q: search, limit: 25, offset: page * 25 });
      if (generation === requestId.current) setData(next);
    } catch (reason) {
      if (generation !== requestId.current) return;
      if (reason instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      setError(reason instanceof Error ? reason.message : "Impossibile caricare il Centro Quote");
    } finally {
      if (generation === requestId.current) setLoading(false);
    }
  }, [navigate, search, status, year, page]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 250);
    return () => { window.clearTimeout(timeout); requestId.current += 1; };
  }, [load]);

  useEffect(() => {
    setSelected(new Set());
  }, [year, status, search]);
  useEffect(() => setPage(0), [year, status, search]);

  const allVisibleSelected = useMemo(
    () => Boolean(data?.items.length) && data!.items.every((item) => selected.has(item.member_id)),
    [data, selected],
  );

  const handlePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentRow || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await recordOrgAdminRenewalPayment(paymentRow.member_id, {
        membership_year: year,
        amount: Number(form.get("amount")),
        method: String(form.get("method") || ""),
        paid_at: String(form.get("paid_at") || ""),
        notes: String(form.get("notes") || "").trim() || undefined,
      });
      setPaymentRow(null);
      setNotice("Pagamento registrato e rinnovo aggiornato.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossibile registrare il pagamento");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async (row: QuoteCenterRow) => {
    if (!window.confirm(`Confermare il rinnovo ${year} di ${row.first_name ?? ""} ${row.last_name ?? ""} senza registrare un incasso?`)) return;
    setSaving(true);
    setError("");
    try {
      await confirmOrgAdminRenewal(row.member_id, year);
      setNotice("Rinnovo confermato.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossibile confermare il rinnovo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-shell org-admin-mobile-page space-y-6 py-10">
      <PageHeader
        eyebrow="Soci e tessere"
        title="Quote e rinnovi"
        subtitle="Scadenze, incassi e nuove tessere riuniti per annualità."
        actions={
          <div className="flex flex-wrap gap-3">
          <Link className="btn-secondary" to="/org-admin/incassi">Incassi e riconciliazione</Link>
          <a
            className="btn-secondary"
            href={`/api/org-admin/quotes.csv?year=${year}&status=${encodeURIComponent(status)}&q=${encodeURIComponent(search)}`}
          >
            Esporta CSV
          </a>
          </div>
        }
      />

      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800" role="status">{notice}</div> : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-800" role="alert">{error}</div> : null}

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-32 rounded-2xl" />)}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Da rinnovare" value={data.kpis.due} hint={`Annualità ${year}`} tone="warning" />
            <KpiCard label="Rinnovati" value={data.kpis.renewed} hint="Tessera assegnata" tone="success" />
            <KpiCard label="Incassato" value={euro(data.kpis.collected_total, data.kpis.currency)} hint={`Teorico ${euro(data.kpis.theoretical_total, data.kpis.currency)}`} tone="info" />
            <KpiCard label="Residuo" value={euro(data.kpis.outstanding_total, data.kpis.currency)} hint={`${data.kpis.paid_waiting_card} pagati e ${data.kpis.approved_waiting_card} approvati in attesa tessera`} tone={data.kpis.outstanding_total > 0 ? "warning" : "success"} />
          </div>

          <SectionPanel title="Elenco rinnovi" eyebrow={`${data.total} soci`}>
            <div className="mb-5 grid gap-3 lg:grid-cols-[10rem_13rem_minmax(16rem,1fr)_auto]">
              <label className="block text-sm font-semibold text-slate-700">
                Annualità
                <select className="premium-select mt-2" value={year} onChange={(event) => setYear(Number(event.target.value))}>
                  {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Stato
                <select className="premium-select mt-2" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">Tutti gli stati</option>
                  <option value="due">Da rinnovare</option>
                  <option value="renewed">Rinnovati</option>
                  <option value="payment_pending">Pagamento in corso</option>
                  <option value="approved_waiting_card">Approvati, attesa tessera</option>
                  <option value="paid_waiting_card">Pagati, attesa tessera</option>
                  <option value="unpaid">Non pagati</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Cerca socio
                <input className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, cognome o email" />
              </label>
            </div>

            <MemberBulkActions
              selection={{ mode: "ids", member_ids: [...selected] }} count={selected.size}
              total={data.total} pageCount={data.items.length} allPageChecked={allVisibleSelected}
              disabled={saving || loading} storageKey={`assonam-member-bulk:${admin?.org_id ?? "org"}:${admin?.id ?? "self"}`}
              actions={["quote_reminder"]} membershipYear={year} showSelectionControls={false}
              onTogglePage={() => setSelected((previous) => {
                const next = new Set(previous);
                for (const item of data.items) { if (allVisibleSelected) next.delete(item.member_id); else next.add(item.member_id); }
                return next;
              })}
              onClear={() => setSelected(new Set())} onSelectAll={() => {}} onCompleted={() => { void load(); }}
            />

            {data.items.length === 0 ? (
              <EmptyState title="Nessun socio in questo elenco" description="Modifica annualità o filtri per vedere altri rinnovi." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1040px] text-left">
                    <caption className="sr-only">Soci, scadenze, rinnovi e stato delle quote annuali</caption>
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label="Seleziona tutti i soci visibili"
                            checked={allVisibleSelected}
                            onChange={(event) => setSelected((previous) => {
                              const next = new Set(previous);
                              for (const item of data.items) { if (event.target.checked) next.add(item.member_id); else next.delete(item.member_id); }
                              return next;
                            })}
                          />
                        </th>
                        <th className="px-4 py-3">Socio</th>
                        <th className="px-4 py-3">Scadenza</th>
                        <th className="px-4 py-3">Rinnovo</th>
                        <th className="px-4 py-3">Quota</th>
                        <th className="px-4 py-3">Pagamento</th>
                        <th className="px-4 py-3">Nuova tessera</th>
                        <th className="px-4 py-3 text-right">Azioni</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.items.map((row) => (
                        <tr key={row.member_id} className="text-sm text-slate-700">
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              aria-label={`Seleziona ${row.first_name ?? ""} ${row.last_name ?? ""}`}
                              checked={selected.has(row.member_id)}
                              onChange={(event) => setSelected((previous) => {
                                const next = new Set(previous);
                                if (event.target.checked) next.add(row.member_id); else next.delete(row.member_id);
                                return next;
                              })}
                            />
                          </td>
                          <td className="px-4 py-4"><strong className="block text-slate-950">{row.first_name} {row.last_name}</strong><span className="text-xs text-slate-500">{row.email}</span></td>
                          <td className="px-4 py-4 tabular-nums">{formatDate(row.previous_valid_through)}</td>
                          <td className="px-4 py-4"><StatusChip tone={renewalTone(row)}>{renewalLabel(row)}</StatusChip></td>
                          <td className="px-4 py-4 font-semibold tabular-nums">{euro(row.fee_amount, row.currency)}</td>
                          <td className="px-4 py-4">
                            <StatusChip tone={row.payment_state === "paid" ? "success" : ["pending", "partial"].includes(row.payment_state) ? "warning" : "muted"}>{row.payment_state === "paid" ? "Pagato" : row.payment_state === "partial" ? "Parzialmente pagato" : row.payment_state === "pending" ? "In corso" : row.payment_state === "not_required" ? "Non richiesta" : "Da pagare"}</StatusChip>
                            {row.accounting_balance && row.accounting_balance.outstanding_cents > 0 && <p className="mt-1 text-xs">Residuo {euro(row.accounting_balance.outstanding_cents / 100, row.accounting_balance.currency)}</p>}
                          </td>
                          <td className="px-4 py-4 tabular-nums">{row.new_card_no ?? "-"}</td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              {row.payment_state === "partial" ? <Link className="btn-secondary !px-3 !py-2 !text-xs" to={`/org-admin/incassi?member_id=${row.member_id}&year=${year}`}>Completa saldo</Link> : row.payment_state !== "paid" && row.fee_amount > 0 ? <button type="button" className="btn-secondary !px-3 !py-2 !text-xs" onClick={() => setPaymentRow(row)}>Registra pagamento</button> : null}
                              {!row.renewed && row.can_confirm_without_payment && row.payment_state !== "paid" && row.renewal_status !== "approved_waiting_card" ? <button type="button" className="btn-ghost !px-3 !py-2 !text-xs" disabled={saving} onClick={() => void handleConfirm(row)}>Conferma</button> : null}
                              {row.payment_state !== "paid" && row.fee_amount > 0 ? <button type="button" className="btn-ghost !px-3 !py-2 !text-xs" disabled={saving} onClick={() => setSelected((previous) => new Set([...previous, row.member_id]))}>Seleziona per sollecito</button> : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <nav className="mt-4 flex justify-end gap-3" aria-label="Pagine quote">
              <button className="btn-secondary" type="button" disabled={loading || page === 0} onClick={() => setPage((value) => value - 1)}>Precedente</button>
              <span className="self-center text-sm">Pagina {page + 1} di {Math.max(1, Math.ceil(data.total / 25))}</span>
              <button className="btn-secondary" type="button" disabled={loading || (page + 1) * 25 >= data.total} onClick={() => setPage((value) => value + 1)}>Successiva</button>
            </nav>
          </SectionPanel>
        </>
      ) : null}

      <ModalShell
        open={paymentRow !== null}
        title="Registra pagamento rinnovo"
        description={paymentRow ? `${paymentRow.first_name ?? ""} ${paymentRow.last_name ?? ""} · annualità ${year}` : undefined}
        onClose={() => !saving && setPaymentRow(null)}
      >
        <form className="space-y-4" onSubmit={handlePayment}>
          <label className="block text-sm font-semibold text-slate-700">Importo
            <input required className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-4" type="number" min="0.01" step="0.01" name="amount" defaultValue={paymentRow?.fee_amount || ""} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">Metodo
            <select required className="premium-select mt-2" name="method" defaultValue="bonifico"><option value="contanti">Contanti</option><option value="bonifico">Bonifico</option><option value="altro">Altro</option></select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">Data pagamento
            <input required className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-4" type="date" name="paid_at" defaultValue={new Date().toISOString().slice(0, 10)} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">Nota
            <textarea className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 px-4 py-3" name="notes" maxLength={1000} />
          </label>
          <div className="flex justify-end gap-3 pt-2"><button type="button" className="btn-ghost" onClick={() => setPaymentRow(null)} disabled={saving}>Annulla</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? "Salvataggio…" : "Registra e rinnova"}</button></div>
        </form>
      </ModalShell>
    </div>
  );
};

export default OrgAdminQuote;
