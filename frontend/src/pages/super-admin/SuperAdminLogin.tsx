import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { superAdminLogin, AuthError, fetchWhoAmI } from "../../lib/api";

const SuperAdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchWhoAmI()
      .then((w) => {
        if (w.authenticated && w.redirect_to) navigate(w.redirect_to, { replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      await superAdminLogin(email.trim(), password);
      navigate("/super-admin/org-admins", { replace: true });
    } catch (err) {
      if (err instanceof AuthError) {
        setError("Credenziali non valide. Verifica email e password.");
      } else {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("429") || msg.toLowerCase().includes("too many")) {
          setError("Troppi tentativi. Attendi un minuto e riprova.");
        } else {
          setError(
            "Errore di connessione al server. Verifica che il backend sia avviato e che le credenziali " +
              "siano configurate nelle variabili d'ambiente (SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD).",
          );
        }
      }
    } finally {
      setSubmitting(false);
    }
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
              <h1 className="auth-title text-xl font-semibold">Accesso super admin</h1>
              <p className="auth-copy mt-1.5 text-sm leading-6">
                Inserisci le credenziali per accedere alla gestione delle organizzazioni e degli
                amministratori.
              </p>
            </div>

            {error ? (
              <div className="auth-alert mt-6 px-4 py-3">
                <p className="text-sm">{error}</p>
              </div>
            ) : null}

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="sa-email" className="auth-label block text-sm font-medium">
                  Email
                </label>
                <input
                  id="sa-email"
                  className="auth-input mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="sa-password" className="auth-label block text-sm font-medium">
                  Password
                </label>
                <input
                  id="sa-password"
                  className="auth-input mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button
                className="btn-primary w-full py-2.5 text-sm"
                type="submit"
                disabled={!canSubmit}
                data-component="super-admin-login-submit"
              >
                {submitting ? "Accesso in corso..." : "Accedi"}
              </button>
            </form>

            <div className="auth-note mt-6 rounded-2xl px-4 py-3">
              <p className="text-[11px] leading-5">
                Credenziali configurate via variabili d'ambiente (SUPER_ADMIN_EMAIL,
                SUPER_ADMIN_PASSWORD).
              </p>
            </div>

            <div className="auth-divider mt-6 border-t pt-4">
              <Link className="auth-link text-sm font-medium" to="/">
                &larr; Torna alla home
              </Link>
            </div>
          </div>

          <div className="auth-media hidden md:block">
            <img
              src={`${import.meta.env.BASE_URL}hero-office.avif`}
              alt=""
              className="auth-media__image"
              aria-hidden="true"
            />
            <div className="auth-media__overlay" aria-hidden="true" />
            <div className="auth-media__content flex h-full flex-col justify-end p-10">
              <p className="auth-media__eyebrow text-xs font-semibold uppercase tracking-[0.25em]">
                Pannello di controllo
              </p>
              <p className="mt-2 text-lg font-semibold leading-snug text-white">
                Gestione organizzazioni,
                <br />
                amministratori e tessere.
              </p>
              <p className="auth-media__copy mt-3 text-sm leading-6">
                Crea e gestisci gli admin delle associazioni affiliate, controlla lo stock tessere
                e monitora le attività.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SuperAdminLogin;
