import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { requestMagicLink } from "../lib/api";

const inputClass =
  "mt-1.5 w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-1 focus:ring-brand/20";

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

  if (sent) {
    return (
      <section className="flex min-h-[60vh] items-center justify-center py-16">
        <div className="w-full max-w-sm px-6">
          <div className="surface p-7">
            <div className="text-center">
              <img
                src="/favicon.svg"
                alt=""
                className="mx-auto h-7"
                aria-hidden="true"
              />
              <h1 className="mt-4 text-xl font-semibold text-neutral-900">
                Controlla la tua email
              </h1>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Se l'indirizzo è associato a un account, riceverai un link per
                accedere all'area riservata.
              </p>
            </div>
            <p className="mt-6 text-center text-sm text-neutral-500">
              <Link
                className="font-medium text-neutral-600 transition hover:text-neutral-900"
                to="/"
              >
                Torna alla home
              </Link>
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-[60vh] items-center justify-center py-16">
      <div className="w-full max-w-sm px-6">
        <div className="surface p-7">
          <div className="text-center">
            <img
              src="/favicon.svg"
              alt=""
              className="mx-auto h-7"
              aria-hidden="true"
            />
            <h1 className="mt-4 text-xl font-semibold text-neutral-900">
              Area riservata
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-neutral-500">
              Inserisci la tua email per ricevere un link di accesso sicuro.
            </p>
          </div>

          {error && (
            <div className="mt-6 rounded-md border border-red-100 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">{error}</p>
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
                className={inputClass}
                type="email"
                placeholder="nome@esempio.it"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button
              className="btn-primary mt-7 w-full disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={!canSubmit}
            >
              {submitting ? "Invio in corso…" : "Ricevi link di accesso"}
            </button>
            <p className="mt-4 text-center text-xs leading-5 text-neutral-400">
              Accesso riservato ai soci e alle associazioni affiliate.
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-neutral-500">
            <Link
              className="font-medium text-neutral-600 transition hover:text-neutral-900"
              to="/"
            >
              Torna alla home
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
};

export default Login;
