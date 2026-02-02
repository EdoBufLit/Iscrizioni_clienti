import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginWithPassword, requestMagicLink, fetchWhoAmI } from "../lib/api";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchWhoAmI().then((w) => {
      if (w.authenticated && w.redirect_to) navigate(w.redirect_to, { replace: true });
    }).catch(() => {});
  }, [navigate]);

  const canSubmit = email.trim().length > 0 && !submitting && (mode === "magic" || password.length > 0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      if (mode === "password") {
        const result = await loginWithPassword(email.trim(), password);
        if (result.authenticated) {
          navigate("/dashboard");
          return;
        }
        // If not authenticated, password was wrong — show as magic link sent
        setSent(true);
      } else {
        await requestMagicLink(email.trim());
        setSent(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("429") || msg.toLowerCase().includes("too many")) {
        setError("Troppi tentativi. Attendi un minuto e riprova.");
      } else {
        setError("Credenziali non valide o errore di connessione.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const imagePanel = (
    <div className="relative hidden overflow-hidden md:block">
      <img
        src={`${import.meta.env.BASE_URL}studio-commercialista_800x504.jpg`}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/90 via-brand/70 to-brand-light/45" aria-hidden="true" />
      <div className="relative flex h-full flex-col justify-end p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">Portale soci</p>
        <p className="mt-2 text-lg font-semibold leading-snug text-white">
          Gestione associativa,<br />contabilità e adempimenti.
        </p>
        <p className="mt-3 text-sm leading-6 text-white/70">
          Iscrizioni, documenti e stato pratica accessibili in un unico punto riservato.
        </p>
      </div>
    </div>
  );

  if (sent) {
    return (
      <section className="flex min-h-[70vh] items-center justify-center py-16">
        <div className="container-shell">
          <div className="mx-auto grid max-w-4xl overflow-hidden surface-strong md:grid-cols-2">
            <div className="flex flex-col justify-center px-8 py-12 sm:px-12">
              <div className="flex items-center gap-3">
                <img src={`${import.meta.env.BASE_URL}logo-transparent.png`} alt="ASSO.N.A.M." className="h-10 rounded" />
                <div>
                  <p className="text-sm font-bold text-neutral-900">ASSO.N.A.M.</p>
                  <p className="text-[11px] leading-tight text-neutral-500">Associazione Nazionale Arti e Mestieri</p>
                </div>
              </div>
              <div className="mt-10">
                <svg className="h-10 w-10 text-brand/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
                <h1 className="mt-4 text-xl font-semibold text-neutral-900">Controlla la tua email</h1>
                <p className="mt-3 text-sm leading-6 text-neutral-600">Se l'indirizzo è associato a un account, riceverai un link per accedere all'area riservata.</p>
              </div>
              <div className="mt-10 border-t border-neutral-100 pt-6">
                <Link className="text-sm font-medium text-neutral-600 transition hover:text-neutral-900" to="/">&larr; Torna alla home</Link>
              </div>
            </div>
            {imagePanel}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-[70vh] items-center justify-center py-16">
      <div className="container-shell">
        <div className="mx-auto grid max-w-4xl overflow-hidden surface-strong md:grid-cols-2">
          <div className="flex flex-col justify-center px-8 py-12 sm:px-12">
            <div className="flex items-center gap-3">
              <img src={`${import.meta.env.BASE_URL}logo-transparent.png`} alt="ASSO.N.A.M." className="h-10 rounded" />
              <div>
                <p className="text-sm font-bold text-neutral-900">ASSO.N.A.M.</p>
                <p className="text-[11px] leading-tight text-neutral-500">Associazione Nazionale Arti e Mestieri</p>
              </div>
            </div>

            <div className="mt-10">
              <h1 className="text-xl font-semibold text-neutral-900">Accedi</h1>
              <p className="mt-1.5 text-sm leading-6 text-neutral-500">
                {mode === "password"
                  ? "Inserisci email e password per accedere."
                  : "Inserisci la tua email per ricevere un link di accesso sicuro."}
              </p>
            </div>

            {error && (
              <div className="mt-6 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form className="mt-8" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-neutral-700">Email</label>
                <input
                  id="login-email"
                  className="mt-1.5 w-full rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  type="email"
                  placeholder="nome@esempio.it"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {mode === "password" && (
                <div className="mt-4">
                  <label htmlFor="login-password" className="block text-sm font-medium text-neutral-700">Password</label>
                  <input
                    id="login-password"
                    className="mt-1.5 w-full rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="password"
                    placeholder="La tua password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}

              <button
                className="btn-primary mt-7 w-full py-2.5 text-sm"
                type="submit"
                disabled={!canSubmit}
                data-component="login-submit"
              >
                {submitting ? "Accesso in corso…" : mode === "password" ? "Accedi" : "Ricevi link di accesso"}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between">
              <button
                className="text-xs font-medium text-neutral-500 transition hover:text-neutral-700"
                type="button"
                onClick={() => setMode(mode === "password" ? "magic" : "password")}
              >
                {mode === "password" ? "Accedi con link via email" : "Accedi con password"}
              </button>
              {mode === "password" && (
                <button
                  className="text-xs font-medium text-brand/70 transition hover:text-brand"
                  type="button"
                  onClick={() => setMode("magic")}
                >
                  Password dimenticata?
                </button>
              )}
            </div>

            <div className="mt-6 rounded-lg border border-brand/15 bg-brand/[0.03] px-5 py-4">
              <p className="text-sm font-medium text-neutral-700">Non hai un account?</p>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                Crea un account per accedere ai servizi associativi.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link className="btn-primary text-xs px-4 py-1.5" to="/registrati">
                  Registrati
                </Link>
                <Link className="text-sm font-medium text-brand transition hover:text-brand-dark" to="/associazioni">
                  Vai alle associazioni &rarr;
                </Link>
              </div>
            </div>

            <div className="mt-6 border-t border-neutral-100 pt-4">
              <p className="text-[11px] text-neutral-400">Accesso per amministratori:</p>
              <div className="mt-2 flex gap-4">
                <Link className="text-xs font-medium text-neutral-500 transition hover:text-neutral-700" to="/super-admin/login">Super Admin</Link>
                <Link className="text-xs font-medium text-neutral-500 transition hover:text-neutral-700" to="/org-admin/login">Admin Associazione</Link>
              </div>
            </div>

            <div className="mt-4 border-t border-neutral-100 pt-4">
              <Link className="text-sm font-medium text-neutral-600 transition hover:text-neutral-900" to="/">&larr; Torna alla home</Link>
            </div>
          </div>
          {imagePanel}
        </div>
      </div>
    </section>
  );
};

export default Login;
