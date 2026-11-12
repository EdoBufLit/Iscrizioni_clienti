import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import ModalShell from "../../components/ui/ModalShell";
import Skeleton from "../../components/ui/Skeleton";
import { AuthError, fetchOrganizations, type OrganizationListItem } from "../../lib/api";
import { memberAccountStatus } from "../../lib/memberAccount";
import { formatMemberDate } from "../../lib/memberDates";
import { displayCardNumber } from "../../lib/cardIdentity";
import { fetchMemberCards, linkMemberCard, openSelectedMemberCard, selectMemberCard, type MemberCardItem, type MemberCardsResponse } from "../../lib/memberCards";
import type { DashboardContext } from "./DashboardLayout";
import "./MemberDashboard.css";

const STATUS_LABELS: Record<string, string> = {
  active: "Attiva", expired: "Da rinnovare", inactive: "Non attiva",
  pending_docs: "Documenti da completare", pending_verification: "In verifica",
  pending_cards: "In attesa tessera", rejected: "Iscrizione non approvata",
};

function clubName(item: MemberCardItem): string {
  return item.organization?.club_display_name || item.organization?.name || "Associazione";
}

const DashboardCards = () => {
  const { user, loading: profileLoading, reloadProfile, offline = false } = useOutletContext<DashboardContext>();
  const navigate = useNavigate();
  const [cards, setCards] = useState<MemberCardsResponse | null>(null);
  const [loading, setLoading] = useState(!offline);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const switchLock = useRef(false);
  const generation = useRef(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [organizations, setOrganizations] = useState<OrganizationListItem[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgSlug, setOrgSlug] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [password, setPassword] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const linkLock = useRef(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    const current = ++generation.current;
    setError(null);
    setLoading(true);
    try {
      const result = await fetchMemberCards();
      if (current === generation.current) setCards(result);
    } catch (err) {
      if (current !== generation.current) return;
      if (err instanceof AuthError) navigate("/login", { replace: true });
      else setError(err instanceof Error ? err.message : "Impossibile caricare le tessere.");
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!profileLoading && !offline) void loadCards();
    return () => { generation.current += 1; };
  }, [loadCards, profileLoading, offline]);

  const closeLink = useCallback(() => {
    if (linkLock.current) return;
    setLinkOpen(false);
    setPassword("");
    setLinkError(null);
  }, []);

  useEffect(() => {
    if (!linkOpen) return;
    let live = true;
    setOrgLoading(true);
    void fetchOrganizations().then(items => {
      if (live) setOrganizations(items);
    }, () => {
      if (live) setLinkError("Impossibile caricare le associazioni. Chiudi e riprova.");
    }).finally(() => { if (live) setOrgLoading(false); });
    return () => { live = false; };
  }, [linkOpen]);

  const selectCard = async (item: MemberCardItem) => {
    if (switchLock.current || linkLock.current) return;
    switchLock.current = true;
    setBusyId(item.id);
    setError(null);
    try {
      await selectMemberCard(item.id);
      openSelectedMemberCard();
    } catch (err) {
      if (err instanceof AuthError) navigate("/login", { replace: true });
      else setError(err instanceof Error ? err.message : "Impossibile aprire la tessera.");
      switchLock.current = false;
      setBusyId(null);
    }
  };

  const submitLink = async (event: FormEvent) => {
    event.preventDefault();
    if (linkLock.current || switchLock.current) return;
    linkLock.current = true;
    setLinkBusy(true);
    setLinkError(null);
    try {
      await linkMemberCard({ org_slug: orgSlug, card_number: cardNumber.trim(), password });
      setPassword("");
      setLinkOpen(false);
      setCardNumber("");
      setOrgSlug("");
      setSuccess("Tessera collegata al tuo account.");
      try {
        await reloadProfile();
      } catch {
        setSuccess("Tessera collegata al tuo account. Ricarica la pagina per aggiornare la tessera salvata sul dispositivo.");
      }
      await loadCards();
    } catch (err) {
      setPassword("");
      if (err instanceof AuthError) navigate("/login", { replace: true });
      else setLinkError(err instanceof Error ? err.message : "Impossibile collegare la tessera.");
    } finally {
      linkLock.current = false;
      setLinkBusy(false);
    }
  };

  const items = offline && user ? [{ ...user, can_select: true }] : cards?.items ?? [];
  const selectedId = cards?.selected_member_id ?? user?.id;

  return (
    <div className="member-cards">
      <header className="member-cards__heading">
        <div><h1>Le mie tessere</h1><p>Tutte le tue associazioni, con un solo accesso.</p></div>
        {!offline && cards?.account && <button type="button" className="member-cards__link-button" disabled={busyId !== null || profileLoading} onClick={() => { setSuccess(null); setLinkError(null); setLinkOpen(true); }}>Collega una tessera</button>}
      </header>
      {offline && <p className="member-cards__hint">È disponibile la tessera salvata su questo dispositivo. Connettiti per vedere le altre associazioni.</p>}
      {!offline && cards && !cards.account && <p className="member-cards__hint">Questo accesso è riservato alla singola iscrizione. <Link to="/login?personal=1" className="underline">Accedi al tuo account personale</Link> per vedere e collegare le altre tessere.</p>}
      {success && <p className="member-home__feedback" role="status">{success}</p>}
      {error && <div className="member-cards__error" role="alert"><p>{error}</p>{busyId === null && <button type="button" onClick={() => void loadCards()}>Riprova</button>}</div>}
      {loading || profileLoading ? <div className="member-cards__list" aria-label="Caricamento tessere"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div> : (
        <ul className="member-cards__list" aria-label="Tessere collegate">
          {items.map(item => {
            const selected = selectedId === item.id;
            const status = memberAccountStatus(item);
            const name = clubName(item);
            return (
              <li key={item.id} className={`surface member-cards__item${selected ? " is-selected" : ""}`}>
                <div className="member-cards__identity">
                  <span className="member-cards__club-icon" aria-hidden="true">{name.slice(0, 1)}</span>
                  <div className="member-cards__details"><h2>{name}</h2><p>{displayCardNumber(item) !== null ? `Tessera ${displayCardNumber(item)}` : "Numero da assegnare"}{item.card_year ? ` · ${item.card_year}` : ""}</p></div>
                </div>
                <div className="member-cards__metadata"><span className={`member-cards__status is-${status}`}>{STATUS_LABELS[status] ?? "Non attiva"}</span>{item.valid_until && <span>Scadenza {formatMemberDate(item.valid_until)}</span>}</div>
                <div className="member-cards__action">{selected ? <Link to="/dashboard" aria-label={`Mostra tessera ${name}`}>Mostra tessera <span aria-hidden="true">→</span></Link> : item.can_select ? <button type="button" disabled={busyId !== null} onClick={() => void selectCard(item)} aria-label={`Apri tessera ${name}`}>{busyId === item.id ? "Apertura…" : "Apri tessera"}<span aria-hidden="true">→</span></button> : <span>Disponibile dopo l’approvazione</span>}{selected && <span className="member-cards__selected">Club selezionato</span>}</div>
              </li>
            );
          })}
        </ul>
      )}
      {!loading && !profileLoading && !items.length && !error && <p className="member-cards__hint">Non ci sono tessere collegate.</p>}
      {items.some(item => item.card_namespace === "paper_exception") && <p className="member-cards__hint">* Tessera cartacea collegata in via eccezionale, con numerazione distinta dalle tessere digitali ordinarie.</p>}
      <p className="member-cards__hint">Seleziona un club per vedere la sua tessera, i documenti, le prenotazioni e i rinnovi.</p>
      <ModalShell open={linkOpen} title="Collega una tessera" description="Hai già un’iscrizione digitale in un altro club? Usa la password di quell’iscrizione per collegarla al tuo account." onClose={closeLink} closeDisabled={linkBusy} closeOnEscape={!linkBusy} closeOnOverlay={!linkBusy}>
        <form className="member-cards__form" onSubmit={event => void submitLink(event)}>
          <label htmlFor="link-card-club">Associazione</label>
          <select id="link-card-club" required disabled={orgLoading || linkBusy} value={orgSlug} onChange={event => setOrgSlug(event.target.value)}><option value="">{orgLoading ? "Caricamento…" : "Scegli l’associazione"}</option>{organizations.map(org => <option key={org.id} value={org.slug}>{org.name}</option>)}</select>
          <label htmlFor="link-card-number">Numero tessera</label>
          <input id="link-card-number" required inputMode="numeric" pattern="[0-9]+" maxLength={12} autoComplete="off" disabled={linkBusy} value={cardNumber} onChange={event => setCardNumber(event.target.value)} />
          <label htmlFor="link-card-password">Password dell’altra iscrizione</label>
          <input id="link-card-password" required type="password" autoComplete="off" maxLength={256} disabled={linkBusy} value={password} onChange={event => setPassword(event.target.value)} />
          {linkError && <p className="member-home__error" role="alert">{linkError}</p>}
          <p className="member-cards__hint">Hai solo una tessera cartacea o non riesci ad accedere all’altra iscrizione? Contatta l’associazione per verificare il collegamento.</p>
          <button className="btn-primary" type="submit" disabled={linkBusy || orgLoading || !orgSlug || !cardNumber || !password}>{linkBusy ? "Collegamento…" : "Collega al mio account"}</button>
        </form>
      </ModalShell>
    </div>
  );
};

export default DashboardCards;
