"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_ERROR_MESSAGES: Record<number, string> = {
  402: "Iscrizione non attiva per questa associazione.",
  403: "Iscrizione non attiva per questa associazione.",
  404: "Associazione non trovata.",
  422: "Email non valida.",
  429: "Troppi tentativi, riprova più tardi.",
};

export default function PienissimoClaimPage() {
  const searchParams = useSearchParams();

  // Pienissimo sends only the association slug in the `assoc` query parameter.
  const assoc = (searchParams.get("assoc") ?? "").trim();
  const isAssocMissing = assoc.length === 0;

  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Normalize before validation/submission to keep backend payload consistent.
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const isEmailValid = EMAIL_REGEX.test(normalizedEmail);

  const canSubmit =
    !isSubmitting &&
    !isAssocMissing &&
    normalizedEmail.length > 0 &&
    isEmailValid;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit)
      return;

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(`/api/ingest/pienissimo/${encodeURIComponent(assoc)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (response.status === 200) {
        setSuccessMessage("Iscrizione completata. Controlla la tua email.");
        setEmail("");
        return;
      }

      const mappedError = STATUS_ERROR_MESSAGES[response.status];
      if (mappedError) {
        setErrorMessage(mappedError);
        return;
      }

      setErrorMessage("Si è verificato un errore. Riprova più tardi.");
    } catch {
      setErrorMessage("Errore di rete. Verifica la connessione e riprova.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10 sm:py-16">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-neutral-900">Completa la tua iscrizione</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          Inserisci l&#39;email che hai usato durante la registrazione.
        </p>

        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Attenzione: se l&#39;email è errata non sarà possibile recuperare la tessera.
        </p>

        {isAssocMissing && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Parametro associazione mancante. Verifica il link ricevuto e riprova.
          </p>
        )}

        {errorMessage && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {errorMessage}
          </p>
        )}

        {successMessage && (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            {successMessage}
          </p>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="claim-email" className="text-sm font-medium text-neutral-700">
              Email
            </label>
            <input
              id="claim-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="utente@example.com"
              className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              aria-invalid={email.length > 0 && !isEmailValid}
            />
            {email.length > 0 && !isEmailValid && (
              <p className="mt-1 text-xs text-red-600">Email non valida.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {isSubmitting ? "Invio in corso..." : "Genera tessera"}
          </button>
        </form>
      </section>
    </main>
  );
}
