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
    fetchWhoAmI().then((w) => {
      if (w.authenticated && w.redirect_to) navigate(w.redirect_to, { replace: true });
    }).catch(() => {});
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
            "siano configurate nelle variabili d'ambiente (SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)."
          );
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex min-h-[70vh] items-center justify-center py-16">
      <div className="container-shell">
        <div className="mx-auto grid max-w-4xl overflow-hidden surface-strong md:grid-cols-2">
          <div className="flex flex-col justify-center px-8 py-12 sm:px-12">
            <div className="flex items-center gap-3">
              <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="ASSO.N.A.M." className="h-10 rounded" />
              <div>
                <p className="text-sm font-bold text-neutral-900">ASSO.N.A.M.</p>
                <p className="text-[11px] leading-tight text-neutral-500">Super Amministrazione</p>
              </div>
            </div>

            <div className="mt-10">
              <h1 className="text-xl font-semibold text-neutral-900">
                Accesso super admin
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-neutral-500">
                Inserisci le credenziali per accedere alla gestione delle
                organizzazioni e degli amministratori.
              </p>
            </div>

            {error && (
              <div className="mt-6 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="sa-email" className="block text-sm font-medium text-neutral-700">
                  Email
                </label>
                <input
                  id="sa-email"
                  className="mt-1.5 w-full rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="sa-password" className="block text-sm font-medium text-neutral-700">
                  Password
                </label>
                <input
                  id="sa-password"
                  className="mt-1.5 w-full rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
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
                {submitting ? "Accesso in corso…" : "Accedi"}
              </button>
            </form>

            <div className="mt-6 rounded-lg border border-neutral-100 bg-neutral-25 px-4 py-3">
              <p className="text-[11px] leading-5 text-neutral-400">
                Credenziali configurate via variabili d'ambiente (SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD).
              </p>
            </div>

            <div className="mt-6 border-t border-neutral-100 pt-4">
              <Link className="text-sm font-medium text-neutral-600 transition hover:text-neutral-900" to="/">
                &larr; Torna alla home
              </Link>
            </div>
          </div>

          {/* Side image panel */}
          <div className="relative hidden overflow-hidden md:block">
            <img
              src={`${import.meta.env.BASE_URL}hero-office.avif`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/90 via-brand/70 to-brand-light/45" aria-hidden="true" />
            <div className="relative flex h-full flex-col justify-end p-10">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">Pannello di controllo</p>
              <p className="mt-2 text-lg font-semibold leading-snug text-white">
                Gestione organizzazioni,<br />amministratori e tessere.
              </p>
              <p className="mt-3 text-sm leading-6 text-white/70">
                Crea e gestisci gli admin delle associazioni affiliate, controlla lo stock tessere e monitora le attività.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SuperAdminLogin;
