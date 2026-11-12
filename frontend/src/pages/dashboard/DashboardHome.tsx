import { renewalLaunchAvailable, renewalOpeningMessage } from "../../lib/renewalAvailability";
import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  MemberCardPreview,
  isMemberCardPreviewData,
  type MemberCardPreviewData,
} from "../../components/cards/MemberCardPreview";
import { readCachedApi, subscribeApiCache } from "../../lib/swrCache";
import Skeleton from "../../components/ui/Skeleton";
import MemberOnboardingTimeline from "./MemberOnboardingTimeline";
import TemporaryMembershipPanel from "./TemporaryMembershipPanel";
import { formatMemberDate } from "../../lib/memberDates";
import { displayCardNumber } from "../../lib/cardIdentity";
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
      displayCardNumber(profile) ??
      profile.card?.number_label ??
      card?.number ??
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

function renewalDescription(membership: MemberMembershipResponse) {
  const term = membership.renewal;
  if (term?.card_no != null) return `Validità dal ${formatMemberDate(term.starts_on)}.`;
  if (!term && !renewalLaunchAvailable()) return renewalOpeningMessage(membership.renewal_opens_on);
  if (term?.status === "payment_pending" && !renewalLaunchAvailable()) return "Richiesta già presente, in attesa di pagamento. " + renewalOpeningMessage(membership.renewal_opens_on);
  if (term?.status === "payment_pending") return membership.renewal_checkout_available === false
    ? "Richiesta ricevuta. Concorda il pagamento della quota con l'associazione."
    : "Completa il pagamento online per confermare il rinnovo.";
  if (term?.status === "due") return "Richiesta ricevuta, in attesa di conferma dell'associazione.";
  if (["paid_waiting_card", "approved_waiting_card"].includes(term?.status ?? "")) return "Rinnovo confermato. La tessera sarà assegnata appena disponibile.";
  const year = membership.renewal_year ?? term?.membership_year;
  return `Puoi rinnovare${year ? ` per il ${year}` : ""} senza ripetere l'iscrizione.`;
}

const DashboardHome = () => {
  const { user, loading, profileError, reloadProfile, offline = false } = useOutletContext<DashboardContext>();
  const [cardFlipped, setCardFlipped] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [membership, setMembership] = useState<MemberMembershipResponse | null>(() => readCachedApi<MemberMembershipResponse>("member:membership") ?? null);
  const [renewalBusy, setRenewalBusy] = useState(false);
  const renewalLock = useRef(false);
  const membershipRequest = useRef(0);
  const notificationsRequest = useRef(0);
  const [renewalMessage, setRenewalMessage] = useState<string | null>(null);
  const [renewalError, setRenewalError] = useState<string | null>(null);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<MemberAreaNotification[]>(() => readCachedApi<{ items: MemberAreaNotification[] }>("member:notifications:?limit=5")?.items ?? []);

  useEffect(() => subscribeApiCache(key => {
    if (key === "member:membership") {
      const cached = readCachedApi<MemberMembershipResponse>(key);
      if (cached) setMembership(cached);
    } else if (key === "member:notifications:?limit=5") {
      const cached = readCachedApi<{ items: MemberAreaNotification[] }>(key);
      if (cached) setNotifications(cached.items);
    }
  }), []);

  const loadMembership = async () => {
    if (offline) return;
    const generation = ++membershipRequest.current;
    try {
      const result = await fetchMemberMembership();
      if (generation === membershipRequest.current) setMembership(result);
    } catch (error) {
      if (generation !== membershipRequest.current) return;
      if (!(error instanceof AuthError)) {
        setRenewalError(error instanceof Error ? error.message : "Rinnovo non disponibile");
      }
    }
  };

  const loadNotifications = async () => {
    if (offline) return;
    const generation = ++notificationsRequest.current;
    try {
      const payload = await fetchMemberNotifications({ limit: 5 });
      if (generation !== notificationsRequest.current) return;
      setNotifications(payload.items);
      setNotificationsError(null);
    } catch (error) {
      if (generation !== notificationsRequest.current) return;
      if (error instanceof AuthError) return;
      setNotificationsError(error instanceof Error ? error.message : "Notifiche non disponibili");
    }
  };

  useEffect(() => {
    if (!user || offline) return;
    setRenewalError(null);
    setNotificationsError(null);
    void Promise.all([loadMembership(), loadNotifications()]);
    return () => { membershipRequest.current += 1; notificationsRequest.current += 1; };
  }, [user?.id, user?.card_no, user?.membership_type, user?.status, offline]);

  const statusInfo = user
    ? STATUS_STYLE[memberAccountStatus(user)] ?? { label: "Iscrizione in verifica", color: "border-neutral-200 bg-neutral-50 text-neutral-600" }
    : null;

  const cardDataCandidate = buildMemberCardDataFromProfile(user);
  const cardData: MemberCardPreviewData = isMemberCardPreviewData(cardDataCandidate)
    ? cardDataCandidate
    : {};
  const canShowGoogleWalletButton = Boolean(
    !offline && user &&
      cardData.cardNumber != null &&
      cardData.verificationUrl &&
      memberAccountStatus(user) === "active" && ["attiva", "active"].includes(String(cardData.cardStatus ?? "").toLowerCase()),
  );

  const handleAddToGoogleWallet = async () => {
    if (offline || walletLoading) return;
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
    if (offline || renewalLock.current || !renewalLaunchAvailable() || !membership?.can_renew) return;
    renewalLock.current = true;
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
          : result.action === "manual_payment"
            ? "Richiesta inviata. Concorda il pagamento della quota con l'associazione."
            : "Richiesta inviata. L'associazione può seguirla da Quote e rinnovi.",
      );
      const refreshed = await Promise.allSettled([loadMembership(), loadNotifications(), reloadProfile()]);
      if (refreshed.some(result => result.status === "rejected")) {
        setRenewalError("Rinnovo registrato. Non è stato possibile aggiornare tutti i dati: ricarica la pagina per vedere la tessera aggiornata.");
      }
    } catch (error) {
      if (error instanceof AuthError) {
        window.location.href = "/login";
        return;
      }
      setRenewalError(error instanceof Error ? error.message : "Impossibile richiedere il rinnovo");
    } finally {
      renewalLock.current = false;
      setRenewalBusy(false);
    }
  };

  const handleNotificationRead = async (notificationId: number) => {
    if (offline) return;
    try {
      await markMemberNotificationRead(notificationId);
      window.dispatchEvent(new Event(MEMBER_NOTIFICATIONS_UPDATED));
      setNotifications((current) => current.map((item) => (
        item.id === notificationId ? { ...item, is_read: true } : item
      )));
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : "Impossibile aggiornare la notifica");
    }
  };

  const validCard = Boolean(user && memberAccountStatus(user) === "active" && cardData.cardNumber != null && ["attiva", "active"].includes(String(cardData.cardStatus ?? "").toLowerCase()));
  const expiry = user?.membership_type === "temporary" ? user.valid_until : membership?.current?.valid_through ?? user?.valid_until;
  const renewalNeeded = Boolean(membership?.can_renew || membership?.renewal || (!renewalLaunchAvailable() && membership?.is_account_only));
  const renewalYear = membership?.renewal_year ?? membership?.renewal?.membership_year;
  const canSubmitRenewal = Boolean(renewalLaunchAvailable() && membership?.can_renew && (
    !membership.renewal || membership.renewal_checkout_available !== false
  ));

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
            {!offline && walletError ? <p className="member-home__error" role="alert">{walletError}</p> : null}
            {user.card_namespace === "paper_exception" && <p className="member-cards__hint">* Tessera cartacea collegata in via eccezionale, con numerazione distinta dalle tessere digitali ordinarie.</p>}
          </section>

          {!offline && renewalNeeded && membership ? (
            <section className="surface member-home__renewal" aria-labelledby="membership-renewal-title">
              <div>
                <h2 id="membership-renewal-title">{membership.renewal?.card_no != null ? `Rinnovo ${membership.renewal.membership_year} completato` : !renewalLaunchAvailable() ? "Stato del rinnovo" : "Rinnova la tessera"}</h2>
                <p>{renewalDescription(membership)}</p>
              </div>
              {canSubmitRenewal ? <button type="button" className="btn-primary" onClick={() => void handleRenewal()} disabled={renewalBusy}>
                {renewalBusy ? "Operazione in corso…" : membership.renewal?.status === "payment_pending" ? `Completa rinnovo${renewalYear ? ` ${renewalYear}` : ""}` : `Rinnova tessera${renewalYear ? ` ${renewalYear}` : ""}`}
              </button> : null}
            </section>
          ) : null}
          {!offline && renewalMessage ? <p className="member-home__feedback" role="status">{renewalMessage}</p> : null}
          {!offline && renewalError ? <p className="member-home__error" role="alert">{renewalError}</p> : null}
          {["pending_docs", "pending_verification", "pending_cards"].includes(user.status) ? <MemberOnboardingTimeline user={user} /> : null}
          {!offline && !validCard ? <TemporaryMembershipPanel onIssued={reloadProfile} /> : null}

          {!offline && notifications.length ? (
            <section className="surface member-home__notifications" aria-labelledby="member-notifications-title">
              <h2 id="member-notifications-title">Comunicazioni</h2>
              {notificationsError ? <p className="member-home__error" role="alert">{notificationsError}</p> : null}
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
