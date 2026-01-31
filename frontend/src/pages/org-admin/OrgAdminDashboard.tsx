import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
          {CARD_META.map((card) => {
            const value = metrics?.[card.key] ?? null;
            const isCards = card.key === "cards_remaining";
            const exhausted =
              isCards && value === 0 && metrics?.cards_total != null;
            return (
              <div
                key={card.key}
                className={`surface p-7 ${exhausted ? "border-red-200 bg-red-50" : ""}`}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    exhausted ? "bg-red-100" : "bg-brand/10"
                  }`}
                >
                  <svg
                    className={`h-[18px] w-[18px] ${exhausted ? "text-red-500" : "text-brand"}`}
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
                <p
                  className={`mt-3 text-2xl font-semibold tabular-nums ${
                    exhausted ? "text-red-700" : "text-neutral-900"
                  }`}
                >
                  {card.format(value)}
                </p>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  {card.description}
                </p>
                {isCards && metrics?.cards_total != null && (
                  <>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className={`h-full rounded-full transition-all ${
                          exhausted ? "bg-red-400" : "bg-brand"
                        }`}
                        style={{
                          width: `${
                            metrics.cards_total > 0
                              ? ((metrics.cards_used ?? 0) / metrics.cards_total) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs tabular-nums text-neutral-500">
                      {metrics.cards_used ?? 0} usate su {metrics.cards_total}{" "}
                      totali
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isLoading &&
        !metricsError &&
        metrics?.cards_remaining === 0 &&
        metrics.cards_total != null && (
          <div className="mt-6 rounded-lg border border-red-200/60 bg-red-50 px-7 py-5">
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
                <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" />
                <path d="M12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-700">
                  Limite tessere raggiunto
                </p>
                <p className="mt-1 text-sm leading-6 text-red-600">
                  Contatta ASSONAM per richiedere l&apos;estensione del
                  pacchetto tessere.
                </p>
              </div>
            </div>
          </div>
        )}

      {!isLoading && !metricsError && admin && (
        <OnboardingChecklist orgId={admin.org_id} />
      )}
    </div>
  );
};

// ── Onboarding checklist ─────────────────────────────────────────

type CheckKey = "verify_data" | "first_member" | "verify_stock" | "contacts";
type CheckState = Record<CheckKey, boolean>;

const CHECKLIST_ITEMS: {
  key: CheckKey;
  label: string;
  hint: string;
  link?: { to: string; label: string };
}[] = [
  {
    key: "verify_data",
    label: "Verifica dati associazione",
    hint: "Controlla che nome, slug e versioni statuto/privacy siano corretti.",
  },
  {
    key: "first_member",
    label: "Primo socio o import soci",
    hint: "Registra almeno un socio oppure prepara un import, se previsto.",
    link: { to: "/org-admin/soci", label: "Vai ai soci" },
  },
  {
    key: "verify_stock",
    label: "Tessere: verifica stock",
    hint: "Assicurati di avere tessere disponibili per le nuove iscrizioni.",
    link: { to: "/org-admin/tessere", label: "Vai alle tessere" },
  },
  {
    key: "contacts",
    label: "Contatti e PEC",
    hint: "Verifica che i recapiti dell'associazione e la PEC siano aggiornati.",
  },
];

const STORAGE_PREFIX = "onboarding_checklist_";

function loadChecks(orgId: number): CheckState {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${orgId}`);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore corrupt data */
  }
  return { verify_data: false, first_member: false, verify_stock: false, contacts: false };
}

function saveChecks(orgId: number, state: CheckState) {
  localStorage.setItem(`${STORAGE_PREFIX}${orgId}`, JSON.stringify(state));
}

const OnboardingChecklist = ({ orgId }: { orgId: number }) => {
  const [checks, setChecks] = useState<CheckState>(() => loadChecks(orgId));

  const toggle = useCallback(
    (key: CheckKey) => {
      setChecks((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        saveChecks(orgId, next);
        return next;
      });
    },
    [orgId],
  );

  const done = Object.values(checks).filter(Boolean).length;
  const total = CHECKLIST_ITEMS.length;
  const allDone = done === total;

  return (
    <div className="surface mt-8 p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">
            Checklist di attivazione
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Completa questi passaggi per rendere operativa l'associazione.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            allDone
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-neutral-200 bg-neutral-50 text-neutral-600"
          }`}
        >
          {done}/{total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-brand transition-all duration-300"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>

      <ul className="mt-5 divide-y divide-neutral-100">
        {CHECKLIST_ITEMS.map((item) => {
          const checked = checks[item.key];
          return (
            <li key={item.key} className="flex items-start gap-3 py-3.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggle(item.key)}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
                  checked
                    ? "border-brand bg-brand text-white"
                    : "border-neutral-300 bg-white hover:border-brand/50"
                }`}
              >
                {checked && (
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.5 6l2.5 2.5 4.5-5" />
                  </svg>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    checked ? "text-neutral-400 line-through" : "text-neutral-800"
                  }`}
                >
                  {item.label}
                </p>
                <p className="mt-0.5 text-sm leading-6 text-neutral-500">
                  {item.hint}
                </p>
                {item.link && !checked && (
                  <Link
                    to={item.link.to}
                    className="mt-1 inline-block text-sm font-medium text-brand hover:text-brand-dark"
                  >
                    {item.link.label} &rarr;
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {allDone && (
        <div className="mt-4 rounded-md border border-emerald-200/60 bg-emerald-50 px-4 py-3">
          <p className="text-sm text-emerald-700">
            Tutti i passaggi completati. L'associazione è pronta.
          </p>
        </div>
      )}
    </div>
  );
};

export default OrgAdminDashboard;
