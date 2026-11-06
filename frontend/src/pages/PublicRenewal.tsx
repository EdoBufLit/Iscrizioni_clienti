import { renewalLaunchAvailable, renewalOpeningMessage } from "../lib/renewalAvailability";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createMemberRenewalCheckout, type MemberMembershipResponse } from "../lib/api";
import { confirmPublicRenewal, fetchPublicRenewal, requestPublicRenewalLink, type PublicRenewalContext } from "../lib/publicRenewals";
import "./PublicRenewal.css";

const dateLabel = (value: string | null | undefined) => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString("it-IT") : "—";

function renewalStatusMessage(membership: MemberMembershipResponse): string {
  const renewal = membership.renewal;
  if (renewal?.card_no != null) return `La tessera ${renewal.membership_year} è già stata predisposta.`;
  if (renewal && ["paid_waiting_card", "approved_waiting_card"].includes(renewal.status)) return "Il rinnovo è confermato e la nuova tessera è in attesa di assegnazione.";
  if (renewal?.status === "payment_pending") return "Il rinnovo è in attesa del pagamento. Contatta l'associazione per completarlo.";
  if (renewal) return "La richiesta di rinnovo è stata presa in carico dall'associazione.";
  if (!renewalLaunchAvailable()) return renewalOpeningMessage(membership.renewal_opens_on);
  if (membership.renewal_opens_on) return `Il rinnovo sarà disponibile dal ${dateLabel(membership.renewal_opens_on)}.`;
  return "Puoi verificare lo stato del rinnovo nella tua area riservata.";
}

export default function PublicRenewal({ slug, associationName, email: initialEmail = "", linkRequested = false, onNewSignup }: {
  slug: string;
  associationName: string;
  email?: string;
  linkRequested?: boolean;
  onNewSignup: () => void;
}) {
  const navigate = useNavigate();
  const [context, setContext] = useState<PublicRenewalContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(linkRequested);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    let disposed = false;
    generation.current += 1;
    submitting.current = false;
    setBusy(false);
    setError("");
    setEmail(initialEmail);
    setSent(linkRequested);
    setContext(null);
    setLoading(true);
    fetchPublicRenewal(slug)
      .then(value => { if (!disposed) setContext(value); })
      .catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : "Rinnovo non disponibile."); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; generation.current += 1; };
  }, [slug]);

  const requestLink = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || !renewalLaunchAvailable(context?.renewal_available)) return;
    submitting.current = true;
    const currentGeneration = generation.current;
    setBusy(true);
    setError("");
    try {
      await requestPublicRenewalLink(slug, email);
      if (currentGeneration !== generation.current) return;
      setSent(true);
    } catch (reason) {
      if (currentGeneration !== generation.current) return;
      setError(reason instanceof Error ? reason.message : "Impossibile richiedere il link.");
    } finally {
      if (currentGeneration === generation.current) {
        submitting.current = false;
        setBusy(false);
      }
    }
  };

  const renew = async () => {
    if (submitting.current || !renewalLaunchAvailable(context?.renewal_available) || !context?.membership?.can_renew) return;
    submitting.current = true;
    const currentGeneration = generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await confirmPublicRenewal(slug);
      if (currentGeneration !== generation.current) return;
      if (result.checkout_required) {
        const checkout = await createMemberRenewalCheckout(result.term.id);
        if (currentGeneration !== generation.current) return;
        window.location.assign(checkout.hosted_checkout_url);
        return;
      }
      navigate("/dashboard");
    } catch (reason) {
      if (currentGeneration !== generation.current) return;
      setError(reason instanceof Error ? reason.message : "Impossibile richiedere il rinnovo.");
    } finally {
      if (currentGeneration === generation.current) {
        submitting.current = false;
        setBusy(false);
      }
    }
  };

  const membership = context?.membership;
  const targetYear = membership?.renewal?.membership_year ?? membership?.renewal_year;
  const previousYear = membership?.current?.membership_year ?? context?.card_year;
  const initials = `${context?.first_name?.trim().charAt(0) ?? ""}${context?.last_name?.trim().charAt(0) ?? ""}`.toLocaleUpperCase("it-IT");
  const launchAvailable = renewalLaunchAvailable(context?.renewal_available);
  const canSubmitRenewal = launchAvailable && membership?.can_renew && (!membership.renewal || membership.renewal_checkout_available !== false);
  return (
    <section className="public-renewal" aria-labelledby="public-renewal-title">
        <article className="public-renewal__card">
          <header className="public-renewal__header">
            <p className="public-renewal__association">{associationName}</p>
            <h1 id="public-renewal-title">Rinnova la tessera</h1>
            <p className="public-renewal__intro">Stesso account, documenti e storico.</p>
          </header>
          {error ? <p role="alert" className="public-renewal__notice public-renewal__notice--error">{error}</p> : null}
          {loading ? <p role="status" className="public-renewal__loading">Verifica dell'accesso…</p> : context && membership ? (
            <>
              <div className="public-renewal__identity">
                <span className="public-renewal__avatar" aria-hidden="true">{initials}</span>
                <p>{context.first_name} {context.last_name}</p>
              </div>
              <div className="public-renewal__summary">
                <div role="group" aria-label="Annualità rinnovo" className="public-renewal__years">
                  <span className="public-renewal__label">Annualità</span>
                  <p><span>{previousYear ?? "—"}</span>{targetYear ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg><strong>{targetYear}</strong></> : null}</p>
                </div>
                <div className="public-renewal__fee">
                  <span className="public-renewal__label">Quota rinnovo</span>
                  <strong>{new Intl.NumberFormat("it-IT", { style: "currency", currency: membership.renewal?.currency ?? context.currency }).format(membership.renewal?.fee_amount ?? context.fee_amount)}</strong>
                </div>
              </div>
              <p className="public-renewal__validity">Scadenza precedente · {dateLabel(membership.current?.valid_through ?? context.valid_through)}</p>
              {canSubmitRenewal ? <button type="button" className="btn-primary public-renewal__submit" disabled={busy} onClick={() => void renew()}>
                {busy ? "Operazione in corso…" : membership.renewal?.status === "payment_pending" ? "Completa rinnovo" : `Conferma rinnovo${targetYear ? ` ${targetYear}` : ""}`}
              </button> : <>
                <p role="status" className="public-renewal__notice">{renewalStatusMessage(membership)}</p>
                <Link className="btn-primary public-renewal__submit" to="/dashboard">Vai alla tua area</Link>
              </>}
            </>
          ) : !launchAvailable ? (
            <p role="status" className="public-renewal__notice">{renewalOpeningMessage(context?.renewal_opens_on)}</p>
          ) : (
            <>
              {sent ? <p role="status" className="public-renewal__notice">Se sei già socio di questa associazione, riceverai un link sicuro via email per confermare il rinnovo.</p> : null}
              <form className="public-renewal__form" onSubmit={event => void requestLink(event)}>
                <label htmlFor="renewal-email">Email del tuo account</label>
                <input id="renewal-email" type="email" autoComplete="email" className="theme-input" value={email} onChange={event => setEmail(event.target.value)} required maxLength={320} placeholder="nome@esempio.it" />
                <button type="submit" className="btn-primary public-renewal__submit" disabled={busy}>{busy ? "Richiesta in corso…" : sent ? "Richiedi un altro link" : "Ricevi link per rinnovare"}</button>
              </form>
            </>
          )}
          <footer className="public-renewal__footer">
            {!loading && (context && membership ? canSubmitRenewal ? <Link to="/dashboard">Vai alla tua area</Link> : null : <Link to="/login">Accedi con la password</Link>)}
            <button type="button" disabled={busy} onClick={onNewSignup}>Nuova iscrizione</button>
          </footer>
        </article>
    </section>
  );
}
