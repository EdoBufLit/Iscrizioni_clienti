import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createOrgAdminReferralInvite,
  fetchOrgAdminMetrics,
  fetchOrgAdminReferralSummary,
  spinOrgAdminReferralReward,
  AuthError,
  type OrgAdminMetrics,
  type OrgAdminReferralReward,
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
  const [wheelRotation, setWheelRotation] = useState(0);
  const [spinLoading, setSpinLoading] = useState(false);
  const [spinError, setSpinError] = useState("");
  const [lastReward, setLastReward] = useState<OrgAdminReferralReward | null>(null);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [inviteOrgName, setInviteOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteNotes, setInviteNotes] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [videoGuideOpen, setVideoGuideOpen] = useState(false);
  const [videoGuideFailed, setVideoGuideFailed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (adminLoading) return;
    if (!admin) return;

    Promise.allSettled([fetchOrgAdminMetrics(), fetchOrgAdminReferralSummary()])
      .then(([metricsResult, referralResult]) => {
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
          setLastReward(referralResult.value.latest_reward);
          setReferralError("");
        } else {
          const err = referralResult.reason;
          if (err instanceof AuthError) {
            navigate("/org-admin/login", { replace: true });
            return;
          }
          setReferralError(err instanceof Error ? err.message : "Errore caricamento referral.");
        }
      })
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
        } else {
          setMetricsError(true);
          setReferralError(err instanceof Error ? err.message : "Errore caricamento referral.");
        }
      })
      .finally(() => setLoading(false));
  }, [admin, adminLoading, navigate]);

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

  const pendingRewardReferral = referralSummary?.pending_reward_referrals?.[0] ?? null;

  const onCopyReferralLink = useCallback(async () => {
    const link = referralSummary?.referral_link;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopyFeedback("Link copiato");
      window.setTimeout(() => setCopyFeedback(""), 1500);
    } catch {
      setCopyFeedback("Copia non disponibile");
      window.setTimeout(() => setCopyFeedback(""), 1500);
    }
  }, [referralSummary?.referral_link]);

  const onShareReferralLink = useCallback(async () => {
    const link = referralSummary?.referral_link;
    if (!link) return;
    const shareText = `Invita un'altra associazione su ASSONAM: ${link}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Invito affiliazione ASSONAM",
          text: shareText,
          url: link,
        });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setCopyFeedback("Testo invito copiato");
      window.setTimeout(() => setCopyFeedback(""), 1500);
    } catch {
      setCopyFeedback("Condivisione non disponibile");
      window.setTimeout(() => setCopyFeedback(""), 1500);
    }
  }, [referralSummary?.referral_link]);

  const onSpinWheel = useCallback(async () => {
    if (!pendingRewardReferral || spinLoading) return;
    setSpinLoading(true);
    setSpinError("");
    const extraTurn = 1080 + Math.floor(Math.random() * 360);
    setWheelRotation((prev) => prev + extraTurn);

    const startedAt = Date.now();
    try {
      const response = await spinOrgAdminReferralReward(pendingRewardReferral.id);
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, 1800 - elapsed);
      if (wait > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, wait));
      }
      setLastReward(response.reward);
      const refreshed = await fetchOrgAdminReferralSummary();
      setReferralSummary(refreshed);
      setReferralError("");
    } catch (err) {
      setSpinError(err instanceof Error ? err.message : "Errore durante la ruota premi.");
    } finally {
      setSpinLoading(false);
    }
  }, [pendingRewardReferral, spinLoading]);

  const onCreateInvite = useCallback(async () => {
    const normalizedName = inviteOrgName.trim();
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedName || !normalizedEmail) {
      setInviteError("Inserisci nome associazione ed email referente.");
      return;
    }

    try {
      setInviteLoading(true);
      setInviteError("");
      setInviteSuccess("");
      const response = await createOrgAdminReferralInvite({
        organization_name: normalizedName,
        applicant_email: normalizedEmail,
        notes: inviteNotes.trim() || undefined,
      });
      setInviteSuccess(
        `Invito creato con successo. Link inviato a ${normalizedEmail}. Pratica #${response.application_id}.`,
      );
      setInviteOrgName("");
      setInviteEmail("");
      setInviteNotes("");
      const refreshed = await fetchOrgAdminReferralSummary();
      setReferralSummary(refreshed);
      setLastReward(refreshed.latest_reward);
      setReferralError("");
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      setInviteError(err instanceof Error ? err.message : "Errore creazione invito.");
    } finally {
      setInviteLoading(false);
    }
  }, [inviteEmail, inviteNotes, inviteOrgName, navigate]);

  return (
    <div className="container-shell py-10" data-tour="admin-dashboard-home">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Panoramica</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Stato operativo dell'associazione e riepilogo delle attività.
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost px-4 py-2 text-sm"
          onClick={() => {
            setVideoGuideFailed(false);
            setVideoGuideOpen(true);
          }}
        >
          Video guida affiliazione
        </button>
      </div>

      {isLoading ? (
        <div className="mt-8 grid gap-6 md:grid-cols-3 xl:grid-cols-5">
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
        <div className="mt-8 grid gap-6 md:grid-cols-3 xl:grid-cols-5" data-tour="admin-stats">
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

      {!isLoading && !metricsError && (
        <div className="surface mt-8 p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h3 className="text-base font-semibold text-neutral-900">Invita un&apos;altra Associazione</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Condividi il tuo link referral e ottieni premi dopo approvazione super admin.
              </p>
            </div>
            {copyFeedback && (
              <span className="inline-flex rounded-full border border-brand/20 bg-brand/[0.07] px-3 py-1 text-xs font-medium text-brand">
                {copyFeedback}
              </span>
            )}
          </div>

          {referralError ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {referralError}
            </div>
          ) : (
            <>
              <div className="mt-5 rounded-lg border border-neutral-200 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  Crea invito diretto
                </p>
                <p className="mt-1 text-sm text-neutral-600">
                  Invia un invito a una nuova associazione: verrà generata una pratica in bozza con referral collegato.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <input
                    className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
                    value={inviteOrgName}
                    onChange={(event) => setInviteOrgName(event.target.value)}
                    placeholder="Nome associazione invitata"
                  />
                  <input
                    className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="Email referente"
                    type="email"
                  />
                  <textarea
                    className="rounded-md border border-neutral-200 px-3 py-2 text-sm md:col-span-2"
                    rows={3}
                    value={inviteNotes}
                    onChange={(event) => setInviteNotes(event.target.value)}
                    placeholder="Note (opzionale)"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-primary px-4 py-2 text-sm"
                    disabled={inviteLoading}
                    onClick={onCreateInvite}
                  >
                    {inviteLoading ? "Invio in corso..." : "Invia invito"}
                  </button>
                  {inviteError ? (
                    <p className="text-sm text-red-600">{inviteError}</p>
                  ) : null}
                  {inviteSuccess ? (
                    <p className="text-sm text-emerald-700">{inviteSuccess}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-neutral-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  Referral link
                </p>
                <p className="mt-2 break-all text-sm text-neutral-800">
                  {referralSummary?.referral_link || "-"}
                </p>
                <p className="mt-1 break-all text-xs text-neutral-500">
                  Short link: {referralSummary?.invite_route || "-"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onCopyReferralLink}>
                    Copia link
                  </button>
                  <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onShareReferralLink}>
                    Share link
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Inviti inviati</p>
                  <p className="mt-2 text-2xl font-semibold text-neutral-900 tabular-nums">
                    {referralSummary?.stats.sent ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Associazioni affiliate</p>
                  <p className="mt-2 text-2xl font-semibold text-neutral-900 tabular-nums">
                    {referralSummary?.stats.approved ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Bonus ottenuti</p>
                  <p className="mt-2 text-2xl font-semibold text-neutral-900 tabular-nums">
                    {referralSummary?.stats.rewarded ?? 0}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-5 lg:grid-cols-[240px_1fr] lg:items-center">
                <div className="referral-wheel-wrap">
                  <div
                    className={`referral-wheel${spinLoading ? " is-spinning" : ""}`}
                    style={{ transform: `rotate(${wheelRotation}deg)` }}
                    aria-hidden="true"
                  >
                    <div className="referral-wheel-center">Bonus</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-neutral-800">Ruota premi referral</p>
                  <p className="text-sm text-neutral-600">
                    {pendingRewardReferral
                      ? `Referral pronto: ${pendingRewardReferral.organization_name} (approvato il ${formatDateTime(
                          pendingRewardReferral.approved_at,
                        )})`
                      : "Nessun referral approvato disponibile per la ruota al momento."}
                  </p>
                  <button
                    type="button"
                    className="btn-primary px-4 py-2 text-sm"
                    disabled={!pendingRewardReferral || spinLoading}
                    onClick={onSpinWheel}
                  >
                    {spinLoading ? "Estrazione in corso..." : "Gira la ruota"}
                  </button>
                  {spinError && (
                    <p className="text-sm text-red-600">{spinError}</p>
                  )}
                  {lastReward?.title && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        Premio assegnato
                      </p>
                      <p className="mt-2 text-sm font-semibold text-emerald-800">{lastReward.title}</p>
                      {lastReward.description && (
                        <p className="mt-1 text-sm text-emerald-700">{lastReward.description}</p>
                      )}
                      {lastReward.delivery_timing && (
                        <p className="mt-1 text-xs text-emerald-700">
                          Quando viene erogato: {lastReward.delivery_timing}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-emerald-800">
                        Il risultato viene comunicato automaticamente al Super Admin.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 rounded-lg border border-neutral-200 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  Storico inviti
                </p>
                {(referralSummary?.recent_referrals || []).length === 0 ? (
                  <p className="mt-2 text-sm text-neutral-600">Nessun invito registrato.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-[0.12em] text-neutral-500">
                          <th className="py-2 pr-3">Data</th>
                          <th className="py-2 pr-3">Associazione</th>
                          <th className="py-2 pr-3">Stato</th>
                          <th className="py-2">Pratica</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(referralSummary?.recent_referrals || []).map((item) => (
                          <tr key={item.id} className="border-t border-neutral-100 text-neutral-700">
                            <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(item.created_at)}</td>
                            <td className="py-2 pr-3">{item.organization_name || "-"}</td>
                            <td className="py-2 pr-3">
                              <span className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-700">
                                {item.status}
                              </span>
                            </td>
                            <td className="py-2">
                              <span className="text-xs text-neutral-500">#{item.application_id}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
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

      {videoGuideOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Video guida affiliazione"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setVideoGuideOpen(false);
            }
          }}
        >
          <div className="relative w-full max-w-6xl">
            <button
              type="button"
              className="absolute right-2 top-2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/55 text-white"
              aria-label="Chiudi video guida"
              onClick={() => setVideoGuideOpen(false)}
            >
              X
            </button>
            <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/20 bg-black shadow-2xl">
              <video
                src="/videos/welcome_base.mp4"
                controls
                autoPlay
                playsInline
                className="h-full w-full object-contain"
                onError={() => setVideoGuideFailed(true)}
              />
            </div>
            {videoGuideFailed ? (
              <p className="mt-3 text-center text-sm text-white/80">
                Video guida temporaneamente non disponibile.
              </p>
            ) : null}
          </div>
        </div>
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
