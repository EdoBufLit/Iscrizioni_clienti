import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AuthError,
  confirmSuperAdminTotp,
  fetchWhoAmI,
  superAdminLogin,
  verifySuperAdminMfa,
} from "../../lib/api";

type LoginStep = "credentials" | "setup" | "verify" | "recovery";

const SuperAdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<LoginStep>("credentials");
  const [challengeToken, setChallengeToken] = useState("");
  const [secret, setSecret] = useState("");
  const [qrDataUri, setQrDataUri] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchWhoAmI()
      .then((who) => {
        if (who.authenticated && who.redirect_to) navigate(who.redirect_to, { replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  const handleCredentialSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password || submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const result = await superAdminLogin(email.trim(), password);
      setPassword("");
      if (result.status === "authenticated") {
        navigate("/super-admin/org-admins", { replace: true });
        return;
      }
      setChallengeToken(result.challenge_token || "");
      if (result.status === "mfa_setup_required") {
        setSecret(result.secret || "");
        setQrDataUri(result.qr_data_uri || "");
        setStep("setup");
      } else {
        setStep("verify");
      }
    } catch (caught) {
      setError(
        caught instanceof AuthError
          ? "Credenziali non valide. Verifica email e password."
          : caught instanceof Error
            ? caught.message
            : "Accesso non riuscito.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleMfaSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!challengeToken || !code.trim() || submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const result =
        step === "setup"
          ? await confirmSuperAdminTotp(challengeToken, code.trim())
          : await verifySuperAdminMfa(challengeToken, code.trim());
      setCode("");
      if (result.recovery_codes?.length) {
        setRecoveryCodes(result.recovery_codes);
        setStep("recovery");
        return;
      }
      navigate("/super-admin/org-admins", { replace: true });
    } catch (caught) {
      setError(
        caught instanceof AuthError
          ? "Codice non valido o già utilizzato."
          : caught instanceof Error
            ? caught.message
            : "Verifica non riuscita.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resetLogin = () => {
    setStep("credentials");
    setChallengeToken("");
    setCode("");
    setError("");
  };

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
                <p className="auth-kicker text-[11px] leading-tight">Super Amministrazione</p>
              </div>
            </div>

            <div className="mt-10">
              <h1 className="auth-title text-xl font-semibold">
                {step === "credentials"
                  ? "Accesso super admin"
                  : step === "setup"
                    ? "Proteggi il tuo account"
                    : step === "verify"
                      ? "Verifica in due passaggi"
                      : "Salva i codici di recupero"}
              </h1>
              <p className="auth-copy mt-1.5 text-sm leading-6">
                {step === "credentials"
                  ? "Inserisci le credenziali per accedere alla governance della piattaforma."
                  : step === "setup"
                    ? "Scansiona il QR con un'app Authenticator e inserisci il codice generato."
                    : step === "verify"
                      ? "Inserisci il codice dell'app Authenticator o un codice di recupero."
                      : "Conservali in un luogo sicuro: ciascun codice può essere usato una sola volta."}
              </p>
            </div>

            {error ? (
              <div className="auth-alert mt-6 px-4 py-3" role="alert">
                <p className="text-sm">{error}</p>
              </div>
            ) : null}

            {step === "credentials" ? (
              <form className="mt-8 space-y-5" onSubmit={handleCredentialSubmit}>
                <div>
                  <label htmlFor="sa-email" className="auth-label block text-sm font-medium">Email</label>
                  <input
                    id="sa-email"
                    className="auth-input mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="sa-password" className="auth-label block text-sm font-medium">Password</label>
                  <input
                    id="sa-password"
                    className="auth-input mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <button className="btn-primary w-full py-2.5 text-sm" type="submit" disabled={!email.trim() || !password || submitting}>
                  {submitting ? "Verifica in corso..." : "Continua"}
                </button>
              </form>
            ) : null}

            {step === "setup" || step === "verify" ? (
              <form className="mt-7 space-y-5" onSubmit={handleMfaSubmit}>
                {step === "setup" ? (
                  <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-center">
                    {qrDataUri ? <img className="mx-auto h-44 w-44" src={qrDataUri} alt="QR per configurare l'app Authenticator" /> : null}
                    <p className="mt-3 text-xs text-neutral-600">Codice manuale</p>
                    <code className="mt-1 block break-all text-sm font-semibold tracking-wider text-neutral-900">{secret}</code>
                  </div>
                ) : null}
                <div>
                  <label htmlFor="sa-mfa-code" className="auth-label block text-sm font-medium">Codice di verifica</label>
                  <input
                    id="sa-mfa-code"
                    className="auth-input mt-1.5 w-full rounded-xl px-4 py-2.5 text-center font-mono text-lg tracking-[0.25em] outline-none"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </div>
                <button className="btn-primary w-full py-2.5 text-sm" type="submit" disabled={!code.trim() || submitting}>
                  {submitting ? "Verifica in corso..." : step === "setup" ? "Attiva e accedi" : "Verifica e accedi"}
                </button>
                <button className="w-full text-sm font-medium text-neutral-600 underline-offset-4 hover:underline" type="button" onClick={resetLogin}>
                  Torna alle credenziali
                </button>
              </form>
            ) : null}

            {step === "recovery" ? (
              <div className="mt-7">
                <ul className="grid grid-cols-2 gap-2 rounded-2xl border border-neutral-200 bg-white p-4 font-mono text-sm" aria-label="Codici di recupero">
                  {recoveryCodes.map((recoveryCode) => <li key={recoveryCode}>{recoveryCode}</li>)}
                </ul>
                <button className="btn-primary mt-5 w-full py-2.5 text-sm" type="button" onClick={() => navigate("/super-admin/sicurezza", { replace: true })}>
                  Ho salvato i codici
                </button>
              </div>
            ) : null}

            <div className="auth-divider mt-7 border-t pt-4">
              <Link className="auth-link text-sm font-medium" to="/">&larr; Torna alla home</Link>
            </div>
          </div>

          <div className="auth-media hidden md:block">
            <img src={`${import.meta.env.BASE_URL}hero-office.avif`} alt="" className="auth-media__image" aria-hidden="true" />
            <div className="auth-media__overlay" aria-hidden="true" />
            <div className="auth-media__content flex h-full flex-col justify-end p-10">
              <p className="auth-media__eyebrow text-xs font-semibold uppercase tracking-[0.25em]">Accesso privilegiato</p>
              <p className="mt-2 text-lg font-semibold leading-snug text-white">Password, secondo fattore<br />e sessioni revocabili.</p>
              <p className="auth-media__copy mt-3 text-sm leading-6">Le operazioni sensibili richiedono una verifica recente per ridurre il rischio di abuso.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SuperAdminLogin;
