import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  completeMemberOnboarding, establishMemberOnboardingSession, fetchMemberOnboarding,
  MemberOnboardingError, type MemberOnboardingContext,
} from "../lib/api";
import { applySeo } from "../lib/seo";
import { publicUploadHint, validatePublicDocumentUpload } from "../lib/uploadValidation";
import "./MemberOnboarding.css";

// StrictMode replays effects. Exchange each one-use fragment through the same
// in-flight promise, then release it: later visits reload the limited session.
let bootstrapFlight: { token: string; promise: Promise<MemberOnboardingContext> } | null = null;
function bootstrapOnboarding(): Promise<MemberOnboardingContext> {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token")?.trim();
  if (token) {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    if (bootstrapFlight?.token === token) return bootstrapFlight.promise;
    const promise = establishMemberOnboardingSession(token);
    const flight = { token, promise };
    bootstrapFlight = flight;
    void promise.finally(() => { if (bootstrapFlight === flight) bootstrapFlight = null; }).catch(() => {});
    return promise;
  }
  return bootstrapFlight?.promise ?? fetchMemberOnboarding();
}

const documentStatusLabels: Record<string, string> = { approved: "Approvato", pending: "In verifica", uploaded: "In verifica", rejected: "Da sostituire" };
type DocumentItem = MemberOnboardingContext["documents"][number];
function latestDocument(context: MemberOnboardingContext, type: string): DocumentItem | undefined {
  return context.documents.filter(item => item.type === type).sort((left, right) => right.id - left.id)[0];
}
function canUpload(document: DocumentItem | undefined) { return !document || document.status === "rejected"; }
function failureMessage(reason: unknown) {
  if (reason instanceof TypeError) return "Connessione interrotta. Controlla lo stato della pratica prima di riprovare.";
  return reason instanceof Error ? reason.message : "Richiesta non completata. Riprova o contatta la tua associazione.";
}

function savedCompletion(previous: MemberOnboardingContext, next: MemberOnboardingContext, identity: File | null, fiscalCode: File | null) {
  return next.completed && next.member.has_password && ([ ["identity", identity], ["fiscal_code", fiscalCode] ] as const).every(([type, file]) => {
    if (!file) return true;
    const document = latestDocument(next, type);
    return Boolean(document && document.id !== latestDocument(previous, type)?.id && document.filename === file.name && document.status !== "rejected");
  });
}

export default function MemberOnboarding() {
  const [context, setContext] = useState<MemberOnboardingContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [identity, setIdentity] = useState<File | null>(null);
  const [fiscalCode, setFiscalCode] = useState<File | null>(null);
  const [uploadErrors, setUploadErrors] = useState({ identity: "", fiscal_code: "" });
  const [managingDocuments, setManagingDocuments] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const identityRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    applySeo({ title: "Completa iscrizione", description: "Imposta la password e invia i documenti richiesti dalla tua associazione.", canonicalPath: "/completa-iscrizione", noindex: true });
    let cancelled = false;
    void bootstrapOnboarding().then(result => { if (!cancelled) setContext(result); })
      .catch(reason => { if (!cancelled) setError(failureMessage(reason)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; mounted.current = false; };
  }, []);

  async function retrySession() {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError("");
    try { const result = await fetchMemberOnboarding(); if (mounted.current) setContext(result); }
    catch (reason) { if (mounted.current) { setContext(null); setError(failureMessage(reason)); } }
    finally { busy.current = false; if (mounted.current) setLoading(false); }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>, type: "identity" | "fiscal_code") {
    const file = event.target.files?.[0] ?? null;
    const message = file ? validatePublicDocumentUpload(file) : "";
    setUploadErrors(current => ({ ...current, [type]: message ?? "" }));
    if (message) event.target.value = "";
    if (type === "identity") setIdentity(message ? null : file); else setFiscalCode(message ? null : file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!context || (context.completed && !managingDocuments) || busy.current) return;
    if (context.completed && !identity && !fiscalCode) return;
    setError("");
    if (!context.member.has_password && password.length < 8) {
      setError("Scegli una password di almeno 8 caratteri."); passwordRef.current?.focus(); return;
    }
    if (!context.member.has_password && password !== confirmation) {
      setError("Le password non coincidono."); confirmationRef.current?.focus(); return;
    }
    if (context.organization.require_identity_document && canUpload(latestDocument(context, "identity")) && !identity) {
      setError("Carica il documento di identità richiesto dalla tua associazione."); identityRef.current?.focus(); return;
    }
    if (uploadErrors.identity || uploadErrors.fiscal_code) return;
    busy.current = true; setSubmitting(true);
    try {
      const result = await completeMemberOnboarding({
        ...(!context.member.has_password ? { newPassword: password } : {}),
        identityDocument: identity, fiscalCodeDocument: fiscalCode,
      });
      if (mounted.current) { setContext(result); setManagingDocuments(false); setPassword(""); setConfirmation(""); setIdentity(null); setFiscalCode(null); }
    } catch (reason) {
      if (!mounted.current) return;
      // Recover a committed result after a lost response before offering a retry.
      try {
        const refreshed = await fetchMemberOnboarding();
        if (!mounted.current) return;
        setContext(refreshed);
        if (savedCompletion(context, refreshed, identity, fiscalCode)) { setManagingDocuments(false); setPassword(""); setConfirmation(""); setIdentity(null); setFiscalCode(null); return; }
      } catch { /* The original response gives the most useful failure detail. */ }
      if (!mounted.current) return;
      if (reason instanceof MemberOnboardingError && [401, 403].includes(reason.status)) setContext(null);
      setError(failureMessage(reason));
      window.requestAnimationFrame(() => alertRef.current?.focus());
    } finally { busy.current = false; if (mounted.current) setSubmitting(false); }
  }

  const shell = (children: React.ReactNode) => <section className="auth-page member-onboarding-page"><div className="auth-shell member-onboarding-shell">{children}</div></section>;
  if (loading) return shell(<><p className="section-title">Completa iscrizione</p><h1 className="auth-title">Verifica dell'invito</h1><p className="auth-copy" role="status">Stiamo aprendo il completamento della tua iscrizione…</p></>);
  if (!context) return shell(<>
    <p className="section-title">Completa iscrizione</p><h1 className="auth-title">Invito non disponibile</h1>
    <div className="auth-alert" role="alert">{error || "La sessione è scaduta. Riapri il link ricevuto via email."}</div>
    <p className="auth-copy">Riapri l'invito più recente. Se il link è scaduto o è già stato utilizzato, chiedi alla tua associazione un nuovo invito.</p>
    <button type="button" className="btn-primary" onClick={() => void retrySession()}>Riprova la sessione</button><Link className="auth-link" to="/">Torna al sito</Link>
  </>);
  if (context.completed && !managingDocuments) return shell(<>
    <p className="section-title">{context.organization.name}</p><h1 className="auth-title">{context.member.is_active ? "Iscrizione attiva" : "Completamento ricevuto"}</h1>
    <p className="member-onboarding-status" role="status">{context.member.is_active ? "Puoi accedere alla tua area socio." : "In attesa di verifica e attivazione"}</p>
    <p className="auth-copy">{context.member.is_active ? "La password è pronta. Usa il normale accesso per entrare." : "I dati necessari sono stati ricevuti. La tua associazione deve verificare la pratica prima di attivare l'area socio e la tessera."}</p>
    <button type="button" className="btn-secondary" onClick={() => { setError(""); setManagingDocuments(true); }}>Gestisci documenti</button>
    {context.member.is_active ? <Link className="btn-primary" to="/login">Accedi</Link> : <Link className="btn-primary" to="/">Torna al sito</Link>}
  </>);

  const identityDocument = latestDocument(context, "identity");
  const fiscalCodeDocument = latestDocument(context, "fiscal_code");
  return shell(<>
    <p className="section-title">{context.organization.name}</p><h1 className="auth-title">{managingDocuments ? "Gestisci i documenti" : "Completa la tua iscrizione"}</h1>
    <p className="auth-copy"><strong>{context.member.display_name}</strong>{context.member.email && <span className="member-onboarding-email">{context.member.email}</span>}</p>
    <p className="auth-copy">Imposta le credenziali e invia i documenti richiesti. L'accesso all'area socio sarà disponibile dopo l'attivazione dell'iscrizione.</p>
    {error && <div id="member-onboarding-error" className="auth-alert" ref={alertRef} tabIndex={-1} role="alert">{error}</div>}
    <form onSubmit={event => void submit(event)} noValidate aria-describedby={error ? "member-onboarding-error" : undefined}>
      <fieldset disabled={submitting}>
        {!context.member.has_password ? <section className="member-onboarding-fields" aria-labelledby="member-onboarding-password-title">
          <h2 id="member-onboarding-password-title">Scegli la password</h2>
          <label htmlFor="member-onboarding-password">Nuova password<input id="member-onboarding-password" ref={passwordRef} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} aria-describedby="member-onboarding-password-help" /></label>
          <label htmlFor="member-onboarding-confirmation">Conferma password<input id="member-onboarding-confirmation" ref={confirmationRef} type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={event => setConfirmation(event.target.value)} aria-describedby="member-onboarding-password-help" /></label>
          <p id="member-onboarding-password-help" className="auth-copy">Almeno 8 caratteri. La password rimane personale.</p>
        </section> : <p className="member-onboarding-status">Password già impostata</p>}
        <section className="member-onboarding-fields" aria-labelledby="member-onboarding-documents-title">
          <h2 id="member-onboarding-documents-title">Documenti</h2><p className="auth-copy">{publicUploadHint}</p>
          {([
            { type: "identity", label: "Documento di identità", required: context.organization.require_identity_document, document: identityDocument },
            { type: "fiscal_code", label: "Documento del codice fiscale", required: false, document: fiscalCodeDocument },
          ] as const).map(item => <div key={item.type} className="member-onboarding-upload">
            {canUpload(item.document) ? <>
              <label htmlFor={`member-onboarding-${item.type}`}>{item.label}{!item.required && " (facoltativo)"}</label>
              {item.document?.rejection_note && <p className="member-onboarding-rejection">Da sostituire: {item.document.rejection_note}</p>}
              <input id={`member-onboarding-${item.type}`} ref={item.type === "identity" ? identityRef : undefined} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required={item.required} aria-describedby={uploadErrors[item.type] ? `member-onboarding-${item.type}-error` : undefined} aria-invalid={Boolean(uploadErrors[item.type])} onChange={event => chooseFile(event, item.type)} />
              {uploadErrors[item.type] && <p id={`member-onboarding-${item.type}-error`} className="member-onboarding-rejection" role="alert">{uploadErrors[item.type]}</p>}
            </> : <><strong>{item.label}</strong><p className="auth-copy">{item.document?.filename}</p><span className="member-onboarding-status">{documentStatusLabels[item.document?.status ?? ""] ?? "Ricevuto"}</span></>}
          </div>)}
        </section>
        <button type="submit" className="btn-primary member-onboarding-submit" disabled={submitting || (context.completed && !identity && !fiscalCode)} aria-busy={submitting}>{submitting ? "Invio in corso…" : managingDocuments ? "Invia documenti" : "Completa iscrizione"}</button>
      </fieldset>
    </form>
    {managingDocuments && <button type="button" className="btn-secondary" disabled={submitting} onClick={() => { setManagingDocuments(false); setIdentity(null); setFiscalCode(null); setUploadErrors({ identity: "", fiscal_code: "" }); setError(""); }}>Torna allo stato iscrizione</button>}
  </>);
}
