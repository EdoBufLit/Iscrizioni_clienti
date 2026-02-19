import { useOutletContext } from "react-router-dom";
import {
  MemberCardPreview,
  isMemberCardPreviewData,
  type MemberCardPreviewData,
} from "../../components/cards/MemberCardPreview";
import Skeleton from "../../components/ui/Skeleton";
import type { DashboardContext } from "./DashboardLayout";

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

  const statusInfo = user
    ? STATUS_STYLE[user.status] ?? { label: user.status, color: "border-neutral-200 bg-neutral-50 text-neutral-600" }
    : null;

  const cardDataCandidate = buildMemberCardDataFromProfile(user);
  const cardData: MemberCardPreviewData = isMemberCardPreviewData(cardDataCandidate)
    ? cardDataCandidate
    : {};

  return (
    <div data-tour="member-dashboard-home">
      <h1 className="text-xl font-semibold text-neutral-900">Riepilogo</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Panoramica dello stato iscrizione e della tessera socio.
      </p>

      {loading ? (
        <>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="surface p-7">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="mt-4 h-3 w-24" />
                <Skeleton className="mt-3 h-5 w-32" />
                <Skeleton className="mt-2 h-3 w-full" />
              </div>
            ))}
          </div>

          <section className="mt-12 rounded-2xl border border-[#d8c698]/55 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(252,248,238,0.98))] p-6 shadow-[0_14px_26px_rgba(15,61,58,0.10)] md:p-8">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-3 h-6 w-56" />
            <Skeleton className="mt-2 h-4 w-full max-w-[28rem]" />
            <div className="mx-auto mt-8 max-w-3xl">
              <Skeleton className="h-[20rem] w-full rounded-[28px]" />
            </div>
          </section>
        </>
      ) : user ? (
        <>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {SUMMARY_CARDS.map((card) => (
              <div
                key={card.key}
                className="surface p-7"
                data-tour={card.key === "status" ? "member-status" : undefined}
              >
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

                {card.key === "status" && statusInfo && (
                  <>
                    <div className="mt-3 flex items-center gap-2">
                      <p className="text-base font-semibold text-neutral-900">
                        {statusInfo.label}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${statusInfo.color}`}
                      >
                        {user.status === "active" ? "OK" : "IN CORSO"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">
                      {user.status === "active"
                        ? "Iscrizione confermata e tessera abilitata."
                        : user.status === "pending_cards"
                          ? "Iscrizione approvata, tessera in assegnazione."
                          : "Richiesta in lavorazione."}
                    </p>
                  </>
                )}

                {card.key === "org" && (
                  <>
                    <p className="mt-3 text-base font-semibold text-neutral-900">
                      {toSummaryValue(user.organization?.name)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">
                      Organizzazione associata al tuo profilo socio.
                    </p>
                  </>
                )}

                {card.key === "membership" && (
                  <>
                    <p className="mt-3 text-base font-semibold text-neutral-900">
                      Dal {toDateText(user.joined_at)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">
                      Email registrata: {toSummaryValue(user.email)}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>

          <section className="mt-12 rounded-2xl border border-[#d8c698]/55 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(252,248,238,0.98))] p-6 shadow-[0_14px_26px_rgba(15,61,58,0.10)] md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#7e6f4a]">
              Sezione dedicata
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[#123a38]" style={{ fontFamily: "\"Source Serif 4\", serif" }}>
              La tua tessera
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              Tessera ASSO.N.A.M. separata dalle card KPI: clicca per ruotare fronte/retro e verificare il QR verso endpoint backend.
            </p>

            <div className="mx-auto mt-8 max-w-3xl" data-tour="member-card-number">
              <MemberCardPreview cardData={cardData} />
            </div>
          </section>
        </>
      ) : (
        <>
          <div className="mt-8 surface p-7">
            <p className="text-base font-semibold text-neutral-900">Dati profilo non disponibili</p>
            <p className="mt-2 text-sm text-neutral-600">
              Impossibile caricare il riepilogo socio in questo momento.
            </p>
            {profileError && (
              <p className="mt-2 text-xs text-neutral-500">{profileError}</p>
            )}
            <button
              type="button"
              className="btn-ghost mt-4 px-3 py-1.5 text-xs"
              onClick={() => {
                void reloadProfile();
              }}
            >
              Riprova
            </button>
          </div>

          <section className="mt-10 rounded-2xl border border-amber-200/70 bg-amber-50/70 p-6" data-tour="member-card-number">
            <p className="text-sm font-semibold text-amber-800">Impossibile caricare tessera</p>
            <p className="mt-1 text-xs text-amber-700">
              Il widget tessera e separato dal riepilogo e verra mostrato appena il profilo torna disponibile.
            </p>
          </section>
        </>
      )}
    </div>
  );
};

export default DashboardHome;
