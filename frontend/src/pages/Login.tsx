import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { requestMagicLink } from "../lib/api";

const Login = () => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && !submitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      await requestMagicLink(email.trim());
      setSent(true);
    } catch {
      setError("Si è verificato un errore. Riprova più tardi.");
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
      <div
        className="absolute inset-0 bg-gradient-to-t from-neutral-900/70 via-neutral-900/40 to-neutral-900/20"
        aria-hidden="true"
      />
      <div className="relative flex h-full flex-col justify-end p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
          Portale soci
        </p>
        <p className="mt-2 text-lg font-semibold leading-snug text-white">
          Gestione associativa,
          <br />
          contabilità e adempimenti.
        </p>
        <p className="mt-3 text-sm leading-6 text-white/70">
          Iscrizioni, documenti e stato pratica accessibili in un unico punto
          riservato.
        </p>
      </div>
    </div>
  );

  if (sent) {
    return (
      <section className="flex min-h-[70vh] items-center justify-center py-16">
        <div className="container-shell">
          <div className="mx-auto grid max-w-4xl overflow-hidden rounded-lg border border-neutral-100 bg-white shadow-elevated md:grid-cols-2">
            <div className="flex flex-col justify-center px-8 py-12 sm:px-12">
              <div className="flex items-center gap-3">
                <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="ASSO.N.A.M." className="h-8" />
                <div>
                  <p className="text-sm font-semibold text-neutral-900">
                    ASSO.N.A.M.
                  </p>
                  <p className="text-[11px] leading-tight text-neutral-500">
                    Studio contabile
                  </p>
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
                <h1 className="mt-4 text-xl font-semibold text-neutral-900">
                  Controlla la tua email
                </h1>
                <p className="mt-3 text-sm leading-6 text-neutral-600">
                  Se l'indirizzo è associato a un account, riceverai un link per
                  accedere all'area riservata.
                </p>
              </div>

              <div className="mt-10 border-t border-neutral-100 pt-6">
                <Link
                  className="text-sm font-medium text-neutral-600 transition hover:text-neutral-900"
                  to="/"
                >
                  &larr; Torna alla home
                </Link>
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
        <div className="mx-auto grid max-w-4xl overflow-hidden rounded-lg border border-neutral-100 bg-white shadow-elevated md:grid-cols-2">
          <div className="flex flex-col justify-center px-8 py-12 sm:px-12">
            <div className="flex items-center gap-3">
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="ASSO.N.A.M." className="h-8" />
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  ASSO.N.A.M.
                </p>
                <p className="text-[11px] leading-tight text-neutral-500">
                  Studio contabile
                </p>
              </div>
            </div>

            <div className="mt-10">
              <h1 className="text-xl font-semibold text-neutral-900">
                Area riservata
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-neutral-500">
                Inserisci la tua email per ricevere un link di accesso sicuro.
              </p>
            </div>

            {error && (
              <div className="mt-6 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form className="mt-8" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Email
                </label>
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

              <button
                className="mt-7 inline-flex w-full items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-subtle transition hover:-translate-y-px hover:bg-brand-dark hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-subtle"
                type="submit"
                disabled={!canSubmit}
              >
                {submitting ? "Invio in corso…" : "Ricevi link di accesso"}
              </button>
            </form>

            <p className="mt-6 text-center text-xs leading-5 text-neutral-400">
              Accesso riservato ai soci e alle associazioni affiliate.
              <br />I dati sono trattati nel rispetto della normativa vigente.
            </p>

            <div className="mt-8 border-t border-neutral-100 pt-6">
              <Link
                className="text-sm font-medium text-neutral-600 transition hover:text-neutral-900"
                to="/"
              >
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

export default Login;
