import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { requestOrgAdminMagicLink, fetchWhoAmI, verifyOrgAdminCode } from "../../lib/api";
import OrgAdminMfaChallenge from "./components/OrgAdminMfaChallenge";

const OrgAdminLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState("");

  useEffect(() => {
    fetchWhoAmI()
      .then((w) => {
        if (w.authenticated && w.redirect_to) navigate(w.redirect_to, { replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  const canSubmit = email.trim().length > 0 && !submitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      await requestOrgAdminMagicLink(email.trim());
      setSent(true);
    } catch {
      setError("Si ? verificato un errore. Riprova più tardi.");
    } finally {
      setSubmitting(false);
    }
  };

  const normalizedAccessCode = accessCode.replace(/\D/g, "").slice(0, 6);
  const canVerifyCode = email.trim().length > 0 && normalizedAccessCode.length === 6 && !verifyingCode;

  const handleCodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canVerifyCode) return;
    setCodeError("");
    setVerifyingCode(true);
    try {
      const result = await verifyOrgAdminCode(email.trim(), normalizedAccessCode);
      if (result.mfa_required && result.challenge) {
        setMfaChallenge(result.challenge);
        return;
      }
      navigate(result.redirect_to || "/org-admin", { replace: true });
    } catch {
      setCodeError("Codice non valido o scaduto. Richiedi una nuova email e riprova.");
    } finally {
      setVerifyingCode(false);
    }
  };

  const imagePanel = (
    <div className="auth-media hidden md:block">
      <img
        src={`${import.meta.env.BASE_URL}studio-commercialista_800x504.jpg`}
        alt=""
        className="auth-media__image"
        aria-hidden="true"
      />
      <div className="auth-media__overlay" aria-hidden="true" />
      <div className="auth-media__content flex h-full flex-col justify-end p-10">
        <p className="auth-media__eyebrow text-xs font-semibold uppercase tracking-[0.25em]">
          Area amministratori
        </p>
        <p className="mt-2 text-lg font-semibold leading-snug text-white">
          Gestione soci,
          <br />
          tessere e pratiche.
        </p>
        <p className="auth-media__copy mt-3 text-sm leading-6">
          Accedi per gestire l'associazione, monitorare le iscrizioni e controllare lo stock
          tessere.
        </p>
      </div>
    </div>
  );

  if (mfaChallenge) {
    return (
      <section className="auth-page auth-page--standalone">
        <div className="container-shell w-full">
          <div className="auth-shell mx-auto grid max-w-4xl md:grid-cols-2">
            <div className="flex items-center px-6 py-10 sm:px-10">
              <OrgAdminMfaChallenge
                challenge={mfaChallenge}
                onSuccess={(redirectTo) => navigate(redirectTo, { replace: true })}
              />
            </div>
            {imagePanel}
          </div>
        </div>
      </section>
    );
  }

  if (sent) {
    return (
      <section className="auth-page auth-page--standalone">
        <div className="container-shell w-full">
          <div className="auth-shell mx-auto grid max-w-4xl md:grid-cols-2">
            <div className="auth-panel flex flex-col justify-center px-8 py-12 sm:px-12">
              <div className="flex items-center gap-3">
                <img
                  src={`${import.meta.env.BASE_URL}logo-transparent.png`}
                  alt="ASSO.N.A.M."
                  className="auth-logo-mark h-10 rounded-xl"
                />
                <div>
                  <p className="auth-copy-strong text-sm font-bold">ASSO.N.A.M.</p>
                  <p className="auth-kicker text-[11px] leading-tight">Amministrazione associazione</p>
                </div>
              </div>
              <div className="mt-10">
                <svg
                  className="h-10 w-10 text-brand/80"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
                <h1 className="auth-title mt-4 text-xl font-semibold">Controlla la tua email</h1>
                <p className="auth-copy mt-3 text-sm leading-6">
                  Se l'indirizzo e associato a un account amministratore, riceverai un link e un
                  codice a 6 cifre. Per restare nell'app, copia il codice qui sotto.
                </p>
              </div>
              <form className="mt-7" onSubmit={handleCodeSubmit}>
                <label htmlFor="org-admin-code" className="auth-label block text-sm font-medium">
                  Codice ricevuto via email
                </label>
                <input
                  id="org-admin-code"
                  className="auth-input mt-1.5 w-full rounded-xl px-4 py-3 text-center text-lg font-semibold tracking-[0.35em] outline-none"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  value={normalizedAccessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                />
                {codeError ? <p className="mt-3 text-sm font-semibold text-red-600">{codeError}</p> : null}
                <button
                  className="btn-primary mt-5 w-full py-2.5 text-sm"
                  type="submit"
                  disabled={!canVerifyCode}
                >
                  {verifyingCode ? "Verifica in corso..." : "Entra con codice"}
                </button>
              </form>
              <div className="auth-divider mt-10 border-t pt-6">
                <button
                  type="button"
                  className="auth-link text-sm font-medium"
                  onClick={() => {
                    setSent(false);
                    setAccessCode("");
                    setCodeError("");
                  }}
                >
                  Cambia email o reinvia codice
                </button>
              </div>
            </div>
            {imagePanel}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-page auth-page--standalone">
      <div className="container-shell w-full">
        <div className="auth-shell mx-auto grid max-w-4xl md:grid-cols-2">
          <div className="auth-panel flex flex-col justify-center px-8 py-12 sm:px-12">
            <div className="flex items-center gap-3">
              <img
                src={`${import.meta.env.BASE_URL}logo-transparent.png`}
                alt="ASSO.N.A.M."
                className="auth-logo-mark h-10 rounded-xl"
              />
              <div>
                <p className="auth-copy-strong text-sm font-bold">ASSO.N.A.M.</p>
                <p className="auth-kicker text-[11px] leading-tight">Amministrazione associazione</p>
              </div>
            </div>

            <div className="mt-10">
              <h1 className="auth-title text-xl font-semibold">Accesso amministratore</h1>
              <p className="auth-copy mt-1.5 text-sm leading-6">
                Inserisci l'email associata al tuo account per ricevere un link e un codice di
                accesso. Il codice ti permette di restare nell'app senza aprire un browser esterno.
              </p>
            </div>

            {error ? (
              <div className="auth-alert mt-6 px-4 py-3">
                <p className="text-sm">{error}</p>
              </div>
            ) : null}

            <form className="mt-8" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="org-admin-email" className="auth-label block text-sm font-medium">
                  Email
                </label>
                <input
                  id="org-admin-email"
                  className="auth-input mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                  type="email"
                  placeholder="admin@associazione.it"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <button
                className="btn-primary mt-7 w-full py-2.5 text-sm"
                type="submit"
                disabled={!canSubmit}
                data-component="org-admin-login-submit"
              >
                {submitting ? "Invio in corso..." : "Ricevi link e codice"}
              </button>
            </form>

            <p className="auth-kicker mt-6 text-center text-xs leading-5">
              Accesso riservato agli amministratori delle associazioni affiliate.
            </p>

            <div className="auth-divider mt-6 border-t pt-4">
              <Link className="auth-link text-sm font-medium" to="/">
                &larr; Torna alla home
              </Link>
            </div>
          </div>
          {imagePanel}
        </div>
      </div>
    </section>
  );
};

export default OrgAdminLogin;
