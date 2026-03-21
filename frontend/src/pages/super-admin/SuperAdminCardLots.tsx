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

const formatDateTime = (value: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusBadgeClassName = (statusLabel: string) => {
  if (statusLabel === "Attivo") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (statusLabel === "Disattivo") return "border-amber-200 bg-amber-50 text-amber-700";
  if (statusLabel === "Esaurito") return "border-neutral-200 bg-neutral-100 text-neutral-700";
  if (statusLabel === "Rilasciato") return "border-slate-200 bg-slate-100 text-slate-700";
  return "border-neutral-200 bg-neutral-50 text-neutral-600";
};

const SuperAdminCardLots = () => {
  const navigate = useNavigate();
  const { profile } = useOutletContext<{ profile: SuperAdminProfile | null }>();

  const [items, setItems] = useState<CardLotRegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    setError("");
    fetchCardLotRegistry()
      .then((payload) => setItems(payload.items))
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/super-admin/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Errore nel caricamento del registro lotti");
      })
      .finally(() => setLoading(false));
  }, [navigate, profile]);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.totalLots += 1;
        acc.totalCards += item.quantity;
        if (item.released_at) acc.releasedLots += 1;
        return acc;
      },
      { totalLots: 0, totalCards: 0, releasedLots: 0 },
    );
  }, [items]);

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
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Registro lotti</h2>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            Registro centrale dei lotti tessere ASSONAM generato direttamente dal database.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={exporting || loading}
          className="inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting ? "Download in corso..." : "Scarica Excel aggiornato"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200/60 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-strong p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Lotti</p>
          <p className="mt-3 text-3xl font-semibold text-neutral-900">{totals.totalLots}</p>
        </div>
        <div className="surface-strong p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Tessere totali</p>
          <p className="mt-3 text-3xl font-semibold text-neutral-900">{totals.totalCards}</p>
        </div>
        <div className="surface-strong p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Lotti storici</p>
          <p className="mt-3 text-3xl font-semibold text-neutral-900">{totals.releasedLots}</p>
        </div>
      </div>

      <div className="surface-strong overflow-hidden border-neutral-200/60 shadow-premium-lg">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/50">
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Organizzazione</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Lotto</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Range</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Quantita</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Stato</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Scope</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Richiesta</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Creazione</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Rilascio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index}>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-40 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-16 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-28 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-20 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-6 w-20 rounded-full" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-24 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-14 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-28 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-28 rounded" /></td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center text-sm font-medium text-neutral-500">
                    Nessun lotto presente nel database.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="align-top transition-colors hover:bg-neutral-50/60">
                    <td className="px-5 py-4">
                      <div className="min-w-[220px]">
                        <p className="text-sm font-semibold text-neutral-900">{item.organization_name || "—"}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                          Anno {item.year}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-neutral-900">#{item.batch_id}</td>
                    <td className="px-5 py-4 text-sm text-neutral-700">
                      {item.range_start_label} - {item.range_end_label}
                    </td>
                    <td className="px-5 py-4 text-sm text-neutral-700">{item.quantity}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClassName(item.status_label)}`}>
                        {item.status_label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-neutral-700">{item.numbering_scope_name || "Legacy"}</td>
                    <td className="px-5 py-4 text-sm text-neutral-700">
                      {item.recharge_request_id ? `#${item.recharge_request_id}` : "—"}
                    </td>
                    <td className="px-5 py-4 text-sm text-neutral-700">{formatDateTime(item.created_at)}</td>
                    <td className="px-5 py-4 text-sm text-neutral-700">{formatDateTime(item.released_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminCardLots;
