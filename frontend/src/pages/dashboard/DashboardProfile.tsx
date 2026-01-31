import { FormEvent, useState } from "react";
import { useOutletContext } from "react-router-dom";
import Skeleton from "../../components/ui/Skeleton";
import { changePassword } from "../../lib/api";
import type { DashboardContext } from "./DashboardLayout";

const PERSONAL_FIELDS = [
  { key: "first_name", label: "Nome" },
  { key: "last_name", label: "Cognome" },
  { key: "email", label: "Email" },
  { key: "fiscal_code", label: "Codice fiscale" },
  { key: "phone", label: "Telefono" },
] as const;

const DashboardProfile = () => {
  const { user, loading } = useOutletContext<DashboardContext>();

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Profilo</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Dati personali associati all'iscrizione. Per modifiche, contattare lo
        studio.
      </p>

      <div className="surface mt-8 overflow-hidden">
        {/* Card header */}
        <div className="border-b border-neutral-100 bg-neutral-25 px-7 py-4">
          <div className="flex items-center gap-2.5">
            <svg
              className="h-4 w-4 text-neutral-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
              Dati personali
            </p>
          </div>
        </div>

        {/* Card body */}
        <div className="p-7">
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-2 h-4 w-40" />
                </div>
              ))}
            </div>
          ) : user ? (
            <div className="grid gap-6 md:grid-cols-2">
              {PERSONAL_FIELDS.map((field) => {
                const value = user[field.key];
                return (
                  <div key={field.key}>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                      {field.label}
                    </p>
                    <p className="mt-1.5 text-sm text-neutral-900">
                      {value ?? "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-neutral-600">
              Impossibile caricare i dati del profilo.
            </p>
          )}
        </div>

        {/* Association section */}
        {!loading && user && (
          <>
            <div className="border-t border-neutral-100 bg-neutral-25 px-7 py-4">
              <div className="flex items-center gap-2.5">
                <svg
                  className="h-4 w-4 text-neutral-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                  Associazione
                </p>
              </div>
            </div>
            <div className="p-7">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                    Associazione
                  </p>
                  <p className="mt-1.5 text-sm text-neutral-900">
                    {user.organization?.name ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
                    Data iscrizione
                  </p>
                  <p className="mt-1.5 text-sm text-neutral-900">
                    {user.joined_at
                      ? new Date(user.joined_at).toLocaleDateString("it-IT")
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Password section */}
      {!loading && user && <ChangePasswordSection />}
    </div>
  );
};

const ChangePasswordSection = () => {
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const canSubmit = newPw.length >= 8 && newPw === confirmPw && !submitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      await changePassword(newPw);
      setSuccess("Password aggiornata con successo.");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel cambio password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="surface mt-8 overflow-hidden">
      <div className="border-b border-neutral-100 bg-neutral-25 px-7 py-4">
        <div className="flex items-center gap-2.5">
          <svg
            className="h-4 w-4 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
            Sicurezza
          </p>
        </div>
      </div>
      <div className="p-7">
        <p className="text-sm text-neutral-600">
          Imposta o modifica la tua password per accedere senza magic link.
        </p>

        {success && (
          <div className="mt-4 rounded-md border border-emerald-200/60 bg-emerald-50 px-4 py-3">
            <p className="text-sm text-emerald-700">{success}</p>
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form className="mt-5 grid gap-4 sm:grid-cols-2 sm:items-end" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="new-pw" className="block text-xs font-medium text-neutral-600">
              Nuova password
            </label>
            <input
              id="new-pw"
              className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              type="password"
              autoComplete="new-password"
              placeholder="Minimo 8 caratteri"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="confirm-pw" className="block text-xs font-medium text-neutral-600">
              Conferma password
            </label>
            <input
              id="confirm-pw"
              className={`mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:ring-2 ${
                confirmPw && confirmPw !== newPw
                  ? "border-red-300 focus:border-red-400 focus:ring-red-200/40"
                  : "border-neutral-200 focus:border-brand focus:ring-brand/20"
              }`}
              type="password"
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <button
              className="inline-flex items-center justify-center rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white shadow-subtle transition hover:-translate-y-px hover:bg-brand-dark hover:shadow-card active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-subtle"
              type="submit"
              disabled={!canSubmit}
            >
              {submitting ? "Salvataggio…" : "Salva password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DashboardProfile;
