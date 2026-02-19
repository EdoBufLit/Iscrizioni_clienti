import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { applySeo } from "../lib/seo";

type SubmitStatus = "idle" | "loading" | "success" | "error";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

const PienissimoThankYouPage = () => {
  const { orgSlug } = useParams<{ orgSlug: string }>();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    applySeo({
      title: "Completa la richiesta tessera",
      description: "Inserisci la tua email per ricevere la tessera associativa.",
      canonicalPath: window.location.pathname,
      noindex: true,
    });
  }, []);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const isEmailValid = EMAIL_REGEX.test(normalizedEmail);
  const isLoading = status === "loading";
  const isSuccess = status === "success";

  const canSubmit = Boolean(orgSlug) && !isLoading && normalizedEmail.length > 0 && isEmailValid;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!orgSlug) {
      setStatus("error");
      setErrorMessage("Associazione non trovata nel link.");
      return;
    }

    if (!normalizedEmail || !isEmailValid) {
      setEmailError("Inserisci una email valida.");
      return;
    }

    setStatus("loading");
    setErrorMessage("");
    setEmailError("");

    const payload: {
      email: string;
      external_customer_id: string;
      first_name?: string;
      last_name?: string;
    } = {
      email: normalizedEmail,
      external_customer_id: `email:${normalizedEmail}`,
    };

    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    if (cleanFirstName) payload.first_name = cleanFirstName;
    if (cleanLastName) payload.last_name = cleanLastName;

    try {
      const response = await fetch(
        `${API_BASE}/api/ingest/pienissimo/${encodeURIComponent(orgSlug)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.status === 200) {
        setStatus("success");
        return;
      }

      if (response.status === 409) {
        const payload = await response.json().catch(() => null);
        const detail =
          typeof payload?.detail === "string"
            ? payload.detail
            : typeof payload?.message === "string"
              ? payload.message
              : "Socio già presente.";
        setStatus("error");
        setErrorMessage(detail);
        return;
      }

      if ([402, 403].includes(response.status)) {
        setStatus("error");
        setErrorMessage("Servizio tessera non attivo per questa associazione.");
        return;
      }

      if (response.status === 429) {
        setStatus("error");
        setErrorMessage("Troppi tentativi. Riprova tra qualche minuto.");
        return;
      }

      if (response.status === 422) {
        setStatus("error");
        setEmailError("Inserisci una email valida.");
        return;
      }

      if (response.status >= 500) {
        setStatus("error");
        setErrorMessage("Errore temporaneo. Riprova.");
        return;
      }

      setStatus("error");
      setErrorMessage("Richiesta non completata. Verifica i dati e riprova.");
    } catch {
      setStatus("error");
      setErrorMessage("Errore temporaneo. Riprova.");
    }
  };

  return (
    <section className="py-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="surface-strong mx-auto max-w-[30rem] p-6 sm:p-8">
          <p className="section-title">Pienissimo</p>
          <h1 className="section-heading">Completa la richiesta tessera</h1>
          <p className="mt-4 text-sm leading-7 text-neutral-600">
            Inserisci i dati richiesti per ricevere la tessera associativa.
          </p>

          {isSuccess ? (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Tessera inviata via email. Controlla anche lo spam.
            </div>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
              {errorMessage && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              )}

              <div>
                <label htmlFor="pienissimo-email" className="text-sm font-semibold text-neutral-700">
                  Email
                </label>
                <input
                  id="pienissimo-email"
                  className="mt-2 w-full px-4 py-2.5 text-sm"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  disabled={isLoading}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (emailError) setEmailError("");
                  }}
                  placeholder="nome@esempio.it"
                  aria-invalid={emailError ? "true" : "false"}
                />
                {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
              </div>

              <div>
                <label htmlFor="pienissimo-first-name" className="text-sm font-semibold text-neutral-700">
                  Nome <span className="font-normal text-neutral-500">(opzionale)</span>
                </label>
                <input
                  id="pienissimo-first-name"
                  className="mt-2 w-full px-4 py-2.5 text-sm"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  disabled={isLoading}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </div>

              <div>
                <label htmlFor="pienissimo-last-name" className="text-sm font-semibold text-neutral-700">
                  Cognome <span className="font-normal text-neutral-500">(opzionale)</span>
                </label>
                <input
                  id="pienissimo-last-name"
                  className="mt-2 w-full px-4 py-2.5 text-sm"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  disabled={isLoading}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </div>

              <button className="btn-primary mt-2 w-full py-2.5 text-sm" type="submit" disabled={!canSubmit}>
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Invio...
                  </span>
                ) : (
                  "Invia tessera"
                )}
              </button>
            </form>
          )}

          <p className="mt-5 text-xs leading-6 text-neutral-500">
            Se non ricevi l&#39;email entro 5 minuti, controlla Spam o Promozioni.
          </p>
          <p className="mt-2 text-sm">
            <Link className="font-semibold text-brand hover:text-brand-dark" to="/contatti">
              Contatta l&#39;associazione
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
};

export default PienissimoThankYouPage;
