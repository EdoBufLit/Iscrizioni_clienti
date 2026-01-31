import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchOrgAdminMetrics,
  AuthError,
  type OrgAdminMetrics,
} from "../../lib/api";
import { useOrgAdmin } from "./OrgAdminLayout";
import Skeleton from "../../components/ui/Skeleton";

const CARD_META: {
  key: keyof OrgAdminMetrics;
  label: string;
  description: string;
  icon: string;
  format: (v: number | null) => string;
}[] = [
  {
    key: "members_count",
    label: "Soci totali",
    description: "Iscritti all'associazione.",
    icon: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2.25 2.25 0 0 1 3 16.878v-.003c0-1.113.285-2.16.786-3.07m0 0a9.337 9.337 0 0 1 4.121-.952 9.38 9.38 0 0 1 2.625.372M15.97 13.856a9.337 9.337 0 0 1 4.121-.952M12.534 7.828a3.175 3.175 0 1 1-5.196 0m5.196 0a3 3 0 1 0-5.196 0M19.5 9.375a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z",
    format: (v) => String(v ?? 0),
  },
  {
    key: "cards_remaining",
    label: "Tessere rimanenti",
    description: "Disponibili per nuove assegnazioni.",
    icon: "M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm-1.875 6.375a3 3 0 0 0-3 3h6a3 3 0 0 0-3-3Z",
    format: (v) => (v === null ? "N/D" : String(v)),
  },
  {
    key: "pending_requests_count",
    label: "Richieste in corso",
    description: "In attesa di completamento o verifica.",
    icon: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    format: (v) => (v === null ? "N/D" : String(v)),
  },
];

const OrgAdminDashboard = () => {
  const { admin, loading: adminLoading } = useOrgAdmin();
  const [metrics, setMetrics] = useState<OrgAdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [metricsError, setMetricsError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (adminLoading) return;
    if (!admin) return;

    fetchOrgAdminMetrics()
      .then(setMetrics)
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
        } else {
          setMetricsError(true);
        }
      })
      .finally(() => setLoading(false));
  }, [admin, adminLoading, navigate]);

  const isLoading = adminLoading || loading;

  return (
    <div className="container-shell py-10">
      <h2 className="text-xl font-semibold text-neutral-900">Panoramica</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Stato operativo dell'associazione e riepilogo delle attività.
      </p>

      {isLoading ? (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="surface p-7">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="mt-4 h-3 w-24" />
              <Skeleton className="mt-3 h-7 w-12" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
          ))}
        </div>
      ) : metricsError ? (
        <div className="mt-8 rounded-lg border border-red-200/60 bg-red-50 px-7 py-5">
          <div className="flex gap-4">
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-red-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-700">
                Impossibile caricare le metriche
              </p>
              <p className="mt-1 text-sm leading-6 text-red-600">
                Si è verificato un errore nel recupero dei dati. Ricarica la
                pagina per riprovare.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {CARD_META.map((card) => (
            <div key={card.key} className="surface p-7">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10">
                <svg
                  className="h-[18px] w-[18px] text-brand"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={card.icon} />
                </svg>
              </div>
              <p className="mt-4 text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                {card.label}
              </p>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-neutral-900">
                {card.format(metrics?.[card.key] ?? null)}
              </p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                {card.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !metricsError && (
        <div className="mt-6 rounded-lg border border-neutral-100 bg-neutral-25 px-7 py-5">
          <div className="flex gap-4">
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-neutral-700">
                Area in fase di attivazione
              </p>
              <p className="mt-1 text-sm leading-6 text-neutral-500">
                Le funzionalità di gestione soci, tessere e documenti saranno
                progressivamente disponibili in questa area. I dati mostrati
                sono indicativi.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgAdminDashboard;
