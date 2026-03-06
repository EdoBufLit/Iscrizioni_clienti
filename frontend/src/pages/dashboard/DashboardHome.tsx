import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  MemberCardPreview,
  isMemberCardPreviewData,
  type MemberCardPreviewData,
} from "../../components/cards/MemberCardPreview";
import Skeleton from "../../components/ui/Skeleton";
import type { DashboardContext } from "./DashboardLayout";
import { AuthError, createMemberGoogleWalletSaveLink } from "../../lib/api";

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  active: {
    label: "Attiva",
    color: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  pending_docs: {
    label: "In attesa documenti",
    color: "border-amber-200 bg-amber-50 text-amber-700",
  },
  pending_cards: {
    label: "In attesa tessera",
    color: "border-amber-200 bg-amber-50 text-amber-700",
  },
  pending_verification: {
    label: "In attesa verifica",
    color: "border-blue-200 bg-blue-50 text-blue-700",
  },
};

const SUMMARY_CARDS = [
  {
    key: "status",
    label: "Stato iscrizione",
    icon: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
  {
    key: "org",
    label: "Associazione",
    icon: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
  },
  {
    key: "membership",
    label: "Iscrizione",
    icon: "M12 6v6l4 2m5-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
] as const;

type MemberCardProfileCompat = {
  organization_slug?: string | null;
  organization_name?: string | null;
  club_display_name?: string | null;
  organization_logo_url?: string | null;
  card_number?: string | number | null;
  assigned_card_number?: string | number | null;
  activated_at?: string | null;
  valid_from?: string | null;
  card_status?: string | null;
  card_year?: string | number | null;
  card_verification_url?: string | null;
  card?: {
    number?: string | number | null;
    status?: string | null;
    year?: string | number | null;
    verification_url?: string | null;
  } | null;
};

const buildMemberCardDataFromProfile = (
  profile: DashboardContext["user"],
): unknown => {
  if (!profile) return {};
  const compat = profile as DashboardContext["user"] & MemberCardProfileCompat;
  const card = compat.card;

  return {
    firstName: profile.first_name ?? null,
    lastName: profile.last_name ?? null,
    fullName: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || null,
    clubDisplayName:
      profile.organization?.club_display_name ??
      compat.club_display_name ??
      null,
    organizationSlug:
      profile.organization?.slug ??
      compat.organization_slug ??
      null,
    organizationName: profile.organization?.name ?? compat.organization_name ?? null,
    organizationLogoUrl:
      profile.organization?.card_logo_url ??
      compat.organization_logo_url ??
      null,
    cardNumber:
      card?.number ??
      profile.card_no ??
      compat.card_number ??
      compat.assigned_card_number ??
      null,
    cardStatus: card?.status ?? compat.card_status ?? profile.status ?? null,
    cardYear: card?.year ?? compat.card_year ?? null,
    verificationUrl: card?.verification_url ?? compat.card_verification_url ?? null,
  };
};

const toSummaryValue = (value?: string | number | null): string => {
  if (value === null || value === undefined) return "-";
  const text = String(value).trim();
  return text.length ? text : "-";
};

const toDateText = (value?: string | null): string => {
  if (!value) return "Data non disponibile";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Data non disponibile";
  return parsed.toLocaleDateString("it-IT");
};

const DashboardHome = () => {
  const { user, loading, profileError, reloadProfile } = useOutletContext<DashboardContext>();
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const statusInfo = user
    ? STATUS_STYLE[user.status] ?? { label: user.status, color: "border-neutral-200 bg-neutral-50 text-neutral-600" }
    : null;

  const cardDataCandidate = buildMemberCardDataFromProfile(user);
  const cardData: MemberCardPreviewData = isMemberCardPreviewData(cardDataCandidate)
    ? cardDataCandidate
    : {};
  const canShowGoogleWalletButton = Boolean(
    user &&
      cardData.cardNumber != null &&
      cardData.verificationUrl &&
      String(cardData.cardStatus ?? "").toLowerCase() === "attiva",
  );

  const handleAddToGoogleWallet = async () => {
    if (walletLoading) return;
    setWalletError(null);
    setWalletLoading(true);
    try {
      const payload = await createMemberGoogleWalletSaveLink();
      window.location.href = payload.url;
    } catch (error) {
      if (error instanceof AuthError) {
        window.location.href = "/login";
        return;
      }
      setWalletError(
        error instanceof Error
          ? error.message
          : "Impossibile generare link Wallet, riprova",
      );
    } finally {
      setWalletLoading(false);
    }
  };

  return (
    <div data-tour="member-dashboard-home" className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Riepilogo</h1>
        <p className="mt-1 text-sm font-medium text-neutral-500">
          Benvenuto nella tua area riservata ASSO.N.A.M.
        </p>
      </div>

      {loading ? (
        <>
          <div className="grid gap-6 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="surface p-7">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="mt-5 h-3 w-24" />
                <Skeleton className="mt-4 h-6 w-32" />
                <Skeleton className="mt-3 h-4 w-full" />
              </div>
            ))}
          </div>

          <section className="surface-strong p-8">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-8 w-64" />
            <Skeleton className="mt-3 h-4 w-full max-w-[28rem]" />
            <div className="mx-auto mt-10 max-w-2xl">
              <Skeleton className="h-64 w-full rounded-[28px]" />
            </div>
          </section>
        </>
      ) : user ? (
        <>
          <div className="grid gap-6 md:grid-cols-3">
            {SUMMARY_CARDS.map((card) => (
              <div
                key={card.key}
                className="surface p-7 flex flex-col justify-between group"
                data-tour={card.key === "status" ? "member-status" : undefined}
              >
                <div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/5 text-brand group-hover:bg-brand group-hover:text-white transition-all duration-300">
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

                  {card.key === "status" && statusInfo && (
                    <>
                      <div className="mt-3 flex items-center gap-2.5">
                        <p className="text-lg font-bold text-neutral-900">
                          {statusInfo.label}
                        </p>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusInfo.color}`}
                        >
                          {user.status === "active" ? "OK" : "IN CORSO"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-medium leading-relaxed text-neutral-500 opacity-80">
                        {user.status === "active"
                          ? "Iscrizione confermata e tessera abilitata."
                          : user.status === "pending_cards"
                            ? "Iscrizione approvata, tessera in assegnazione."
                            : "Richiesta in fase di lavorazione."}
                      </p>
                    </>
                  )}

                  {card.key === "org" && (
                    <>
                      <p className="mt-3 text-lg font-bold text-neutral-900 truncate" title={user.organization?.name}>
                        {toSummaryValue(user.organization?.name)}
                      </p>
                      <p className="mt-3 text-sm font-medium leading-relaxed text-neutral-500 opacity-80">
                        La sede locale associata al tuo profilo socio.
                      </p>
                    </>
                  )}

                  {card.key === "membership" && (
                    <>
                      <p className="mt-3 text-lg font-bold text-neutral-900">
                        Dal {toDateText(user.joined_at)}
                      </p>
                      <p className="mt-3 text-sm font-medium leading-relaxed text-neutral-500 opacity-80 truncate">
                        Email: {toSummaryValue(user.email)}
                      </p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <section className="surface-strong relative overflow-hidden p-6 sm:p-8 md:p-10">
            <div className="relative z-10 grid gap-10 xl:grid-cols-[minmax(34rem,1fr)_minmax(30rem,34rem)] 2xl:grid-cols-[minmax(38rem,1fr)_minmax(34rem,38rem)] xl:items-center xl:gap-12">
              <div className="min-w-0 max-w-2xl xl:max-w-[42rem] xl:pr-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
                  Documento digitale
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-neutral-900" style={{ fontFamily: "\"Source Serif 4\", serif" }}>
                  La tua tessera socio
                </h2>
                <p className="mt-4 max-w-[36rem] text-base font-medium leading-relaxed text-neutral-600 opacity-90">
                  Questa è la tua tessera digitale ASSO.N.A.M. Clicca sulla card per ruotarla e accedere ai dettagli sul retro o verificare il QR code.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-4 sm:flex-nowrap">
                  <button
                    type="button"
                    className="btn-primary inline-flex items-center justify-center whitespace-nowrap px-6 py-3"
                    onClick={() => {
                      void handleAddToGoogleWallet();
                    }}
                    disabled={!canShowGoogleWalletButton || walletLoading}
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.21.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                    </svg>
                    {walletLoading ? "Generazione..." : "Aggiungi a Google Wallet"}
                  </button>
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                    Google Wallet <span className="mx-1.5 opacity-30">•</span> Android
                  </p>
                </div>
                {walletError && (
                  <p className="mt-4 text-sm font-semibold text-red-500 flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {walletError}
                  </p>
                )}
              </div>

              <div className="flex w-full justify-center xl:justify-self-end" data-tour="member-card-number">
                <MemberCardPreview
                  cardData={cardData}
                  className="max-w-[24rem] sm:max-w-[28rem] lg:max-w-[31rem] xl:max-w-[34rem] 2xl:max-w-[38rem]"
                />
              </div>
            </div>

            {/* Subtle background decoration */}
            <div className="absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-brand/5 blur-3xl pointer-events-none" />
          </section>
        </>
      ) : (
        <div className="surface p-10 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-neutral-900">Dati non disponibili</h2>
          <p className="text-sm font-medium text-neutral-500 max-w-sm mx-auto leading-relaxed">
            Impossibile caricare il riepilogo socio in questo momento. Verifica la tua connessione e riprova.
          </p>
          {profileError && (
            <p className="text-xs font-mono text-red-400 bg-red-50 p-2 rounded">{profileError}</p>
          )}
          <button
            type="button"
            className="btn-ghost mt-6"
            onClick={() => {
              void reloadProfile();
            }}
          >
            Riprova il caricamento
          </button>
        </div>
      )}
    </div>
  );
};

export default DashboardHome;
