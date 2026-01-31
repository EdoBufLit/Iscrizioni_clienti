import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { superAdminLogin, AuthError } from "../../lib/api";

const SuperAdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

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
        setError("Credenziali non valide.");
      } else {
        setError("Si è verificato un errore. Riprova più tardi.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex min-h-[70vh] items-center justify-center py-16">
      <div className="container-shell">
        <div className="mx-auto max-w-md">
          <div className="surface overflow-hidden">
            <div className="border-b border-neutral-100 bg-gradient-to-b from-neutral-50 to-white px-8 py-6">
              <div className="flex items-center gap-3">
                <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="ASSO.N.A.M." className="h-8" />
                <div>
                  <p className="text-sm font-semibold text-neutral-900">
                    ASSO.N.A.M.
                  </p>
                  <p className="text-[11px] leading-tight text-neutral-500">
                    Super Amministrazione
                  </p>
                </div>
              </div>
            </div>
            <div className="px-8 py-10">
              <h1 className="text-xl font-semibold text-neutral-900">
                Accesso super admin
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-neutral-500">
                Inserisci le credenziali per accedere alla gestione delle
                organizzazioni.
              </p>

              {error && (
                <div className="mt-6 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label
                    htmlFor="sa-email"
                    className="block text-sm font-medium text-neutral-700"
                  >
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
                  <label
                    htmlFor="sa-password"
                    className="block text-sm font-medium text-neutral-700"
                  >
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
                  className="inline-flex w-full items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-subtle transition hover:-translate-y-px hover:bg-brand-dark hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-subtle"
                  type="submit"
                  disabled={!canSubmit}
                >
                  {submitting ? "Accesso in corso…" : "Accedi"}
                </button>
              </form>

              <div className="mt-8 border-t border-neutral-100 pt-6">
                <Link
                  className="text-sm font-medium text-neutral-600 transition hover:text-neutral-900"
                  to="/"
                >
                  &larr; Torna alla home
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SuperAdminLogin;
