import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  MemberCardPreview,
  isMemberCardPreviewData,
  type MemberCardPreviewData,
} from "../../components/cards/MemberCardPreview";
import Skeleton from "../../components/ui/Skeleton";
import TemporaryMembershipPanel from "./TemporaryMembershipPanel";
import { formatMemberDate } from "../../lib/memberDates";
import "./MemberDashboard.css";
import { MEMBER_NOTIFICATIONS_UPDATED } from "./MemberNotificationBell";
import { memberAccountStatus, memberNotificationHref } from "../../lib/memberAccount";
import type { DashboardContext } from "./DashboardLayout";
import {
  AuthError,
  createMemberGoogleWalletSaveLink,
  createMemberRenewalCheckout,
  fetchMemberNotifications,
  fetchMemberMembership,
  markMemberNotificationRead,
  requestMemberRenewal,
  type MemberAreaNotification,
  type MemberMembershipResponse,
} from "../../lib/api";

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  inactive: { label: "Tessera non attiva", color: "border-amber-200 bg-amber-50 text-amber-700" },
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
  expired: {
    label: "Da rinnovare",
    color: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

type MemberCardProfileCompat = {
  organization_slug?: string | null;
  organization_name?: string | null;
  club_display_name?: string | null;
  organization_logo_url?: string | null;
  card_number?: string | number | null;
  assigned_card_number?: string | number | null;
  activated_at?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  membership_type_label?: string | null;
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
    membershipTypeLabel: compat.membership_type_label ?? null,
    validUntil: compat.valid_until ?? null,
    verificationUrl: card?.verification_url ?? compat.card_verification_url ?? null,
  };
};

const DashboardHome = () => {
  const { user, loading, profileError, reloadProfile } = useOutletContext<DashboardContext>();
  const [cardFlipped, setCardFlipped] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [membership, setMembership] = useState<MemberMembershipResponse | null>(null);
  const [renewalBusy, setRenewalBusy] = useState(false);
  const [renewalMessage, setRenewalMessage] = useState<string | null>(null);
  const [renewalError, setRenewalError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<MemberAreaNotification[]>([]);

  const loadMembership = async () => {
    try {
      setMembership(await fetchMemberMembership());
    } catch (error) {
      if (!(error instanceof AuthError)) {
        setRenewalError(error instanceof Error ? error.message : "Rinnovo non disponibile");
      }
    }
  };

  const loadNotifications = async () => {
    try {
      const payload = await fetchMemberNotifications({ limit: 5 });
      setNotifications(payload.items);
    } catch (error) {
      if (error instanceof AuthError) return;
      setRenewalError(error instanceof Error ? error.message : "Notifiche non disponibili");
    }
  };

  useEffect(() => {
    if (!user) return;
    void Promise.all([loadMembership(), loadNotifications()]);
  }, [user?.id, user?.card_no, user?.membership_type, user?.status]);

  const statusInfo = user
    ? STATUS_STYLE[memberAccountStatus(user)] ?? { label: "Iscrizione in verifica", color: "border-neutral-200 bg-neutral-50 text-neutral-600" }
    : null;

  const cardDataCandidate = buildMemberCardDataFromProfile(user);
  const cardData: MemberCardPreviewData = isMemberCardPreviewData(cardDataCandidate)
    ? cardDataCandidate
    : {};
  const canShowGoogleWalletButton = Boolean(
    user &&
      cardData.cardNumber != null &&
      cardData.verificationUrl &&
      memberAccountStatus(user) === "active" && ["attiva", "active"].includes(String(cardData.cardStatus ?? "").toLowerCase()),
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

  const handleRenewal = async () => {
    if (renewalBusy) return;
    setRenewalBusy(true);
    setRenewalError(null);
    setRenewalMessage(null);
    try {
      const result = await requestMemberRenewal();
      if (result.checkout_required) {
        const checkout = await createMemberRenewalCheckout(result.term.id);
        window.location.href = checkout.hosted_checkout_url;
        return;
      }
      setRenewalMessage(
        result.term.card_no != null
          ? "Rinnovo registrato: la nuova tessera è stata predisposta."
          : "Richiesta inviata. L'associazione può seguirla dal Centro Quote.",
      );
      await loadMembership();
      await loadNotifications();
    } catch (error) {
      if (error instanceof AuthError) {
        window.location.href = "/login";
        return;
      }
      setRenewalError(error instanceof Error ? error.message : "Impossibile richiedere il rinnovo");
    } finally {
      setRenewalBusy(false);
    }
  };

  const handleNotificationRead = async (notificationId: number) => {
    try {
      await markMemberNotificationRead(notificationId);
      window.dispatchEvent(new Event(MEMBER_NOTIFICATIONS_UPDATED));
      setNotifications((current) => current.map((item) => (
        item.id === notificationId ? { ...item, is_read: true } : item
      )));
    } catch (error) {
      setRenewalError(error instanceof Error ? error.message : "Impossibile aggiornare la notifica");
    }
  };

  const validCard = Boolean(user && memberAccountStatus(user) === "active" && cardData.cardNumber != null && ["attiva", "active"].includes(String(cardData.cardStatus ?? "").toLowerCase()));
  const expiry = user?.membership_type === "temporary" ? user.valid_until : membership?.current?.valid_through ?? user?.valid_until;
  const renewalNeeded = Boolean(membership?.can_renew || membership?.renewal);

  return (
    <div data-tour="member-dashboard-home" className="member-home">
      <header className="member-home__heading">
        <h1>Riepilogo</h1>
        <p>La tua tessera, sempre a portata di mano.</p>
      </header>
      {loading ? (
        <section className="surface-strong member-home__card-section" aria-label="Caricamento tessera">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-4 h-52 w-full rounded-2xl" />
        </section>
      ) : user ? (
        <>
          <section className="surface-strong member-home__card-section" aria-labelledby="member-digital-card-title">
            <div className="member-home__card-header">
              <h2 id="member-digital-card-title">Tessera digitale</h2>
              <button type="button" className="member-home__qr-toggle" disabled={!cardData.verificationUrl} aria-pressed={cardFlipped} onClick={() => setCardFlipped(value => !value)}>
                {cardFlipped ? "Mostra fronte" : "Mostra QR"}
              </button>
            </div>
            <div className="member-home__preview" data-tour="member-card-number">
              <MemberCardPreview cardData={cardData} flipped={cardFlipped} onFlippedChange={setCardFlipped} />
            </div>
            <div className="member-home__status" data-tour="member-status" role="status">
              <span className={`member-home__status-label ${statusInfo?.color ?? ""}`}>{statusInfo?.label}</span>
              {expiry ? <span>{memberAccountStatus(user) === "expired" ? "Scaduta il" : "Scadenza"} {formatMemberDate(expiry)}</span> : null}
            </div>
            {canShowGoogleWalletButton ? (
              <button type="button" className="btn-primary member-home__wallet" onClick={() => void handleAddToGoogleWallet()} disabled={walletLoading}>
                {walletLoading ? "Generazione in corso…" : "Aggiungi a Google Wallet"}
              </button>
            ) : null}
            {walletError ? <p className="member-home__error" role="alert">{walletError}</p> : null}
          </section>

          {renewalNeeded && membership ? (
            <section className="surface member-home__renewal" aria-labelledby="membership-renewal-title">
              <div>
                <h2 id="membership-renewal-title">{membership.renewal?.card_no != null ? `Rinnovo ${membership.renewal.membership_year} completato` : "Rinnova la tessera"}</h2>
                <p>{membership.renewal?.card_no != null
                  ? `La nuova tessera sarà valida dal ${formatMemberDate(membership.renewal.starts_on)}.`
                  : membership.renewal?.status === "payment_pending" ? "Il rinnovo è in attesa del pagamento."
                  : "Puoi rinnovare senza ripetere l'iscrizione."}</p>
              </div>
              {membership.can_renew ? <button type="button" className="btn-primary" onClick={() => void handleRenewal()} disabled={renewalBusy}>
                {renewalBusy ? "Operazione in corso…" : membership.renewal?.status === "payment_pending" ? "Completa rinnovo" : "Rinnova tessera"}
              </button> : null}
            </section>
          ) : null}
          {renewalMessage ? <p className="member-home__feedback" role="status">{renewalMessage}</p> : null}
          {renewalError ? <p className="member-home__error" role="alert">{renewalError}</p> : null}
          {!validCard ? <TemporaryMembershipPanel onIssued={reloadProfile} /> : null}

          {notifications.length ? (
            <section className="surface member-home__notifications" aria-labelledby="member-notifications-title">
              <h2 id="member-notifications-title">Comunicazioni</h2>
              {notifications.map(notification => (
                <article key={notification.id}>
                  <div className="member-home__notification-heading">
                    <h3>{notification.title}</h3>
                    {!notification.is_read ? <span className="member-home__unread">Da leggere</span> : null}
                  </div>
                  <p>{notification.body}</p>
                  {notification.created_at ? <time dateTime={notification.created_at}>{formatMemberDate(notification.created_at)}</time> : null}
                  <div className="member-home__notification-actions">
                    {notification.type === "document_rejected" ? <Link to={memberNotificationHref(notification.href)}>Correggi e reinvia documento</Link> : null}
                    {!notification.is_read ? <button type="button" onClick={() => void handleNotificationRead(notification.id)}>Segna come letta</button> : null}
                  </div>
                </article>
              ))}
            </section>
          ) : null}
        </>
      ) : (
        <section className="surface member-home__empty">
          <h2>Dati non disponibili</h2>
          <p>{profileError || "Impossibile caricare il riepilogo socio. Riprova tra qualche istante."}</p>
          <button type="button" className="btn-ghost" onClick={() => void reloadProfile()}>Riprova il caricamento</button>
        </section>
      )}
    </div>
  );
};

export default DashboardHome;
