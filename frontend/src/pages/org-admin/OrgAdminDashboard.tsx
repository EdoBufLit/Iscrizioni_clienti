import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchOrgAdminMetrics,
  fetchOrgAdminReferralSummary,
  AuthError,
  type OrgAdminMetrics,
  type OrgAdminReferralSummary,
} from "../../lib/api";
import { useOrgAdmin } from "./OrgAdminLayout";
import Skeleton from "../../components/ui/Skeleton";

const CARD_META: {
  key: keyof OrgAdminMetrics;
  label: string;
  description: string;
  icon: string;
  format: (v: number | null) => string;
  href?: string;
}[] = [
  {
    key: "active_members_count",
    label: "Soci attivi",
    description: "Soci con tessera emessa è valida.",
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
    label: "Richieste in verifica",
    description: "Non ancora approvate e senza tessera.",
    icon: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    format: (v) => (v === null ? "N/D" : String(v)),
    href: "/org-admin/soci?status=pending_verification",
  },
  {
    key: "documents_pending_review",
    label: "Documenti da rivedere",
    description: "Documenti in attesa di approvazione.",
    icon: "M12 7.5h6m-6 3h6m-6 3h3m-6.75 5.25h9A2.25 2.25 0 0 0 19.5 16.5V6.75A2.25 2.25 0 0 0 17.25 4.5h-9A2.25 2.25 0 0 0 6 6.75v9.75A2.25 2.25 0 0 0 8.25 18.75Z",
    format: (v) => (v === null ? "N/D" : String(v)),
  },
  {
    key: "documents_rejected",
    label: "Documenti rigettati",
    description: "Documenti da correggere e reinviare.",
    icon: "M12 9v3.75m0 3h.008v.008H12v-.008Zm9-3.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    format: (v) => (v === null ? "N/D" : String(v)),
  },
];

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const OrgAdminDashboard = () => {
  const { admin, loading: adminLoading } = useOrgAdmin();
  const [metrics, setMetrics] = useState<OrgAdminMetrics | null>(null);
  const [referralSummary, setReferralSummary] = useState<OrgAdminReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [metricsError, setMetricsError] = useState(false);
  const [referralError, setReferralError] = useState("");
  const [videoGuideOpen, setVideoGuideOpen] = useState(false);
  const [videoGuideFailed, setVideoGuideFailed] = useState(false);
  const navigate = useNavigate();

  const loadDashboardData = useCallback(async () => {
    if (adminLoading || !admin) return;

    setLoading(true);
    const [metricsResult, referralResult] = await Promise.allSettled([
      fetchOrgAdminMetrics(),
      fetchOrgAdminReferralSummary(),
    ]);

    if (metricsResult.status === "fulfilled") {
      setMetrics(metricsResult.value);
      setMetricsError(false);
    } else {
      const err = metricsResult.reason;
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      setMetricsError(true);
    }

    if (referralResult.status === "fulfilled") {
      setReferralSummary(referralResult.value);
      setReferralError("");
    } else {
      const err = referralResult.reason;
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      setReferralError(err instanceof Error ? err.message : "Errore caricamento inviti.");
    }

    setLoading(false);
  }, [admin, adminLoading, navigate]);

  useEffect(() => {
    if (adminLoading || !admin) return;
    void loadDashboardData().catch((err) => {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
      } else {
        setMetricsError(true);
        setReferralError(err instanceof Error ? err.message : "Errore caricamento inviti.");
        setLoading(false);
      }
    });
  }, [admin, adminLoading, loadDashboardData, navigate]);

  useEffect(() => {
    if (!videoGuideOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setVideoGuideOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [videoGuideOpen]);

  const isLoading = adminLoading || loading;

  return (
    <div className="container-shell py-10 space-y-10" data-tour="admin-dashboard-home">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Panoramica operativa</h2>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            Monitora lo stato e le performance della tua associazione.
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost px-5 py-2.5 text-xs font-bold uppercase tracking-widest"
          onClick={() => {
            setVideoGuideFailed(false);
            setVideoGuideOpen(true);
          }}
        >
          <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
          </svg>
          Guida rapida
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-3 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="surface p-7">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="mt-5 h-3 w-24" />
              <Skeleton className="mt-4 h-8 w-16" />
              <Skeleton className="mt-3 h-4 w-full" />
            </div>
          ))}
        </div>
      ) : metricsError ? (
        <div className="rounded-xl border border-red-200/50 bg-red-50/50 p-8 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-red-900">Errore caricamento metriche</h3>
          <p className="text-sm font-medium text-red-600/80 max-w-md mx-auto">
            Non è stato possibile recuperare i dati operativi. Ricarica la pagina o contatta il supporto se il problema persiste.
          </p>
          <button onClick={() => void loadDashboardData()} className="btn-ghost !border-red-200 !text-red-700 hover:!bg-red-100">
            Riprova
          </button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3 xl:grid-cols-5" data-tour="admin-stats">
          {CARD_META.map((card) => {
            const value = metrics?.[card.key] ?? null;
            const isCards = card.key === "cards_remaining";
            const exhausted =
              isCards && value === 0 && metrics?.cards_total != null;
            const cardContent = (
              <>
                <div>
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300 ${
                      exhausted ? "bg-red-100 text-red-600" : "bg-brand/5 text-brand group-hover:bg-brand group-hover:text-white"
                    }`}
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={card.icon} />
                    </svg>
                  </div>
                  <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 group-hover:text-neutral-500 transition-colors">
                    {card.label}
                  </p>
                  <p
                    className={`mt-3 text-3xl font-bold tracking-tight tabular-nums ${
                      exhausted ? "text-red-700" : "text-neutral-900"
                    }`}
                  >
                    {card.format(value)}
                  </p>
                  <p className="mt-3 text-xs font-medium leading-relaxed text-neutral-500 opacity-80 group-hover:opacity-100 transition-opacity">
                    {card.description}
                  </p>
                </div>

                {isCards && metrics?.cards_total != null && (
                  <div className="mt-6 pt-4 border-t border-neutral-100/50">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${
                          exhausted ? "bg-red-500" : "bg-brand"
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
                    <div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                      <span>Usate: {metrics.cards_used ?? 0}</span>
                      <span>Totali: {metrics.cards_total}</span>
                    </div>
                  </div>
                )}
              </>
            );
            const className = `surface p-7 flex flex-col justify-between group transition-all ${
              exhausted ? "border-red-200 bg-red-50/50" : ""
            }`;
            if (card.href) {
              return (
                <Link key={card.key} to={card.href} className={`${className} hover:border-brand/30 hover:no-underline`}>
                  {cardContent}
                </Link>
              );
            }
            return (
              <div
                key={card.key}
                className={className}
              >
                {cardContent}
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && !metricsError && metrics && (
        <div className="rounded-lg border border-brand/15 bg-brand/5 px-4 py-3 text-sm leading-6 text-brand-dark">
          <span className="font-semibold">Conteggio operativo:</span>{" "}
          {metrics.members_count} include {metrics.active_members_count ?? metrics.cards_used ?? 0} soci attivi con tessera
          e {metrics.pending_requests_count ?? 0} richieste non ancora approvate. Le richieste non consumano tessere finche
          non vengono approvate.
        </div>
      )}

      {!isLoading && !metricsError && (
        <section className="surface p-8 relative overflow-hidden">
          <div className="relative z-10 flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shadow-sm">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5L12 14.5L5 7.5" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-neutral-900">Riepilogo inviti</h3>
                  <p className="mt-1 text-sm font-medium text-neutral-500">
                    Performance del programma referral e premi assegnati.
                  </p>
                </div>
              </div>
            </div>
            <Link to="/org-admin/inviti" className="btn-primary group">
              Gestione Inviti
              <svg className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>

          {referralError ? (
            <div className="mt-8 rounded-lg border border-red-100 bg-red-50/50 p-4 text-sm font-medium text-red-600 flex items-center gap-3">
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {referralError}
            </div>
          ) : (
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {[
                { label: "Inviti inviati", value: referralSummary?.stats.sent, color: "bg-blue-50 text-blue-700" },
                { label: "Approvati", value: referralSummary?.stats.approved, color: "bg-emerald-50 text-emerald-700" },
                { label: "Ruote concluse", value: referralSummary?.stats.rewarded, color: "bg-purple-50 text-purple-700" },
              ].map((item, i) => (
                <div key={i} className="rounded-2xl border border-neutral-100 bg-neutral-50/30 p-6 flex items-center justify-between group hover:bg-white hover:shadow-sm transition-all duration-300">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 group-hover:text-neutral-500 transition-colors">{item.label}</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-neutral-900 tabular-nums">
                      {item.value ?? 0}
                    </p>
                  </div>
                  <div className={`h-12 w-12 rounded-full ${item.color.split(' ')[0]} flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity`}>
                    <span className="text-xl">📈</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {referralSummary?.latest_reward?.title && (
            <div className="mt-8 rounded-2xl border border-emerald-200/50 bg-emerald-50/40 p-5 flex items-center gap-4 animate-in fade-in slide-in-from-left-4 duration-500">
              <div className="h-12 w-12 shrink-0 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner">
                <span className="text-xl">🏆</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700/70">
                  Ultimo traguardo raggiunto
                </p>
                <p className="mt-1 text-base font-bold text-emerald-900 truncate">
                  {referralSummary.latest_reward.title}
                </p>
                <p className="mt-0.5 text-xs font-medium text-emerald-600/80">
                  Assegnato il {formatDateTime(referralSummary.latest_reward.rewarded_at)}
                </p>
              </div>
            </div>
          )}
          
          <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-accent/5 blur-3xl pointer-events-none" />
        </section>
      )}

      {!isLoading && !metricsError && admin && (
        <OnboardingChecklist orgId={admin.org_id} />
      )}

      {videoGuideOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-neutral-900/95 p-4 backdrop-blur-sm transition-all animate-in fade-in duration-300"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setVideoGuideOpen(false);
            }
          }}
        >
          <div className="relative w-full max-w-5xl shadow-2xl scale-in-center animate-in zoom-in-95 duration-300">
            <button
              type="button"
              className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white flex items-center gap-2 text-sm font-bold uppercase tracking-widest transition-colors"
              onClick={() => setVideoGuideOpen(false)}
            >
              Chiudi <span className="text-xl">×</span>
            </button>
            <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
              <video
                src="/videos/welcome_base.mp4"
                controls
                autoPlay
                playsInline
                className="h-full w-full object-contain"
                onError={() => setVideoGuideFailed(true)}
              />
            </div>
            {videoGuideFailed && (
              <p className="mt-4 text-center text-sm font-medium text-red-400">
                Il contenuto video non è al momento disponibile. Riprova più tardi.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Onboarding checklist

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
    label: "Configurazione associazione",
    hint: "Verifica che il nome e le impostazioni statuto/privacy siano conformi.",
  },
  {
    key: "first_member",
    label: "Anagrafica soci iniziale",
    hint: "Registra il primo socio o carica il database esistente via CSV.",
    link: { to: "/org-admin/soci", label: "Gestione soci" },
  },
  {
    key: "verify_stock",
    label: "Pacchetto tessere digitali",
    hint: "Assicurati di avere disponibilità di card per i nuovi iscritti.",
    link: { to: "/org-admin/tessere", label: "Stock tessere" },
  },
  {
    key: "contacts",
    label: "Recapiti istituzionali e PEC",
    hint: "Verifica email, telefono e PEC per le comunicazioni ufficiali.",
  },
];

const STORAGE_PREFIX = "onboarding_checklist_";

function loadChecks(orgId: number): CheckState {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${orgId}`);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore corrupted values
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
    <div className="surface p-8 relative overflow-hidden bg-white/40">
      <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-neutral-900">
            Checklist di attivazione
          </h3>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            Segui questi passaggi per rendere operativa la tua piattaforma.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Progresso</p>
            <p className="text-sm font-bold text-neutral-900">{Math.round((done/total)*100)}%</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest shadow-sm ${
              allDone
                ? "bg-emerald-500 text-white"
                : "bg-neutral-100 text-neutral-500"
            }`}
          >
            {done} / {total}
          </span>
        </div>
      </div>

      <div className="mt-8 h-2 w-full overflow-hidden rounded-full bg-neutral-100 shadow-inner">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${allDone ? 'bg-emerald-500' : 'bg-brand'}`}
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>

      <ul className="mt-8 grid gap-4">
        {CHECKLIST_ITEMS.map((item) => {
          const checked = checks[item.key];
          return (
            <li 
              key={item.key} 
              className={`flex items-start gap-5 p-4 rounded-2xl border transition-all duration-300 ${
                checked 
                  ? "border-emerald-100 bg-emerald-50/20 opacity-60" 
                  : "border-neutral-100 bg-white hover:border-brand/30 hover:shadow-md"
              }`}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggle(item.key)}
                className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-300 ${
                  checked
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-neutral-200 bg-white hover:border-brand"
                }`}
              >
                {checked && (
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.5 6l2.5 2.5 4.5-5" />
                  </svg>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-base font-bold tracking-tight transition-colors ${
                    checked ? "text-emerald-900/40 line-through" : "text-neutral-900"
                  }`}
                >
                  {item.label}
                </p>
                <p className={`mt-1 text-sm font-medium leading-relaxed transition-colors ${checked ? 'text-neutral-400' : 'text-neutral-500'}`}>
                  {item.hint}
                </p>
                {item.link && !checked && (
                  <Link
                    to={item.link.to}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand hover:text-brand-light transition-colors"
                  >
                    {item.link.label}
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {allDone && (
        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-500 p-6 text-center animate-in zoom-in-95 duration-500">
          <p className="text-base font-bold text-white uppercase tracking-widest">
            ✨ Complimenti! La piattaforma è ora operativa al 100%
          </p>
        </div>
      )}

      {/* Decorative gradient */}
      <div className="absolute -right-32 -top-32 h-64 w-64 rounded-full bg-brand/5 blur-3xl pointer-events-none" />
    </div>
  );
};

export default OrgAdminDashboard;
