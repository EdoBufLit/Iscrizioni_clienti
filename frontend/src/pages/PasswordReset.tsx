import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmPasswordReset, requestPasswordReset } from "../lib/api";
import { applySeo } from "../lib/seo";

const GENERIC_MESSAGE =
  "Se l'email e associata a un account, riceverai un link per reimpostare la password.";

const PasswordReset = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const initialEmail = searchParams.get("email")?.trim() ?? "";
  const isConfirmMode = token.length > 0;

  const [email, setEmail] = useState(initialEmail);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    applySeo({
      title: "Recupera password",
      description: "Reimposta la password della tua area riservata ASSONAM.",
      canonicalPath: "/recupera-password",
      noindex: true,
    });
  }, []);

  const passwordHelp = useMemo(() => {
    if (!newPassword) return "Minimo 8 caratteri.";
    if (newPassword.length < 8) return "La password deve avere almeno 8 caratteri.";
    if (confirmPassword && newPassword !== confirmPassword) return "Le password non coincidono.";
    return "Password pronta.";
  }, [confirmPassword, newPassword]);

  const canSubmit = isConfirmMode
    ? newPassword.length >= 8 && confirmPassword.length >= 8 && !submitting
    : email.trim().length > 0 && !submitting;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");
    try {
      if (isConfirmMode) {
        await confirmPasswordReset({
          token,
          newPassword,
          confirmPassword,
        });
        setCompleted(true);
      } else {
        await requestPasswordReset(email.trim());
        setSent(true);
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "";
      if (message.includes("429") || message.toLowerCase().includes("too many")) {
        setError("Troppi tentativi. Attendi un minuto e riprova.");
      } else {
        setError(message || "Richiesta non completata. Riprova.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (sent || completed) {
    return (
      <section className="auth-page" data-reveal="fade-up">
        <div className="container-shell w-full">
          <div className="auth-shell mx-auto max-w-3xl p-8 md:p-10">
            <p className="section-title">Area riservata</p>
            <h1 className="section-heading auth-title">
              {completed ? "Password aggiornata" : "Controlla la tua email"}
            </h1>
            <p className="auth-copy mt-5 max-w-2xl text-sm leading-7">
              {completed
                ? "Ora puoi accedere con la nuova password."
                : GENERIC_MESSAGE}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn-primary px-6 py-2.5" to="/login">
                Vai al login
              </Link>
              {!completed ? (
                <button
                  className="btn-ghost px-6 py-2.5"
                  type="button"
                  onClick={() => setSent(false)}
                >
                  Inserisci un'altra email
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-page" data-reveal="fade-up">
      <div className="container-shell w-full">
        <div className="auth-shell mx-auto max-w-3xl p-8 md:p-10">
          <p className="section-title">Area riservata</p>
          <h1 className="section-heading auth-title">
            {isConfirmMode ? "Scegli una nuova password" : "Recupera password"}
          </h1>
          <p className="auth-copy mt-4 text-sm leading-7">
            {isConfirmMode
              ? "Inserisci una nuova password per il tuo account socio."
              : "Ti invieremo un link one-time per reimpostare la password, se l'email appartiene a un account socio attivo."}
          </p>

          {error ? (
            <div className="auth-alert mt-6 px-4 py-3 text-sm" role="alert">
              {error}
            </div>
          ) : null}

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            {isConfirmMode ? (
              <>
                <div>
                  <label htmlFor="reset-password" className="auth-label text-sm font-semibold">
                    Nuova password
                  </label>
                  <input
                    id="reset-password"
                    className="auth-input mt-2 w-full rounded-xl px-4 py-2.5 text-sm"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    aria-required="true"
                    aria-invalid={newPassword.length > 0 && newPassword.length < 8}
                    aria-describedby="reset-password-help"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </div>
                <div>
                  <label
                    htmlFor="reset-password-confirm"
                    className="auth-label text-sm font-semibold"
                  >
                    Conferma password
                  </label>
                  <input
                    id="reset-password-confirm"
                    className="auth-input mt-2 w-full rounded-xl px-4 py-2.5 text-sm"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    aria-required="true"
                    aria-invalid={confirmPassword.length > 0 && newPassword !== confirmPassword}
                    aria-describedby="reset-password-help"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                  <p id="reset-password-help" className="auth-copy mt-2 text-xs">
                    {passwordHelp}
                  </p>
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="reset-email" className="auth-label text-sm font-semibold">
                  Email
                </label>
                <input
                  id="reset-email"
                  className="auth-input mt-2 w-full rounded-xl px-4 py-2.5 text-sm"
                  type="email"
                  autoComplete="email"
                  placeholder="nome@esempio.it"
                  aria-required="true"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            )}

            <button
              className="btn-primary mt-2 w-full py-2.5 text-sm"
              type="submit"
              disabled={!canSubmit}
            >
              {submitting
                ? "Invio in corso..."
                : isConfirmMode
                  ? "Aggiorna password"
                  : "Invia link di recupero"}
            </button>
          </form>

          <div className="auth-divider auth-copy mt-6 border-t pt-4 text-xs">
            <Link className="auth-link font-semibold" to="/login">
              Torna al login
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PasswordReset;
