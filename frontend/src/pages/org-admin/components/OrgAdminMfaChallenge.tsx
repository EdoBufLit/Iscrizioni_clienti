import { FormEvent, useState } from "react";
import { verifyOrgAdminMfa } from "../../../lib/api";

type Props = {
  challenge: string;
  onSuccess: (redirectTo: string) => void;
};

const OrgAdminMfaChallenge = ({ challenge, onSuccess }: Props) => {
  const [code, setCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const normalizedCode = useRecoveryCode
    ? code.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 14)
    : code.replace(/\D/g, "").slice(0, 6);
  const canSubmit = (useRecoveryCode ? normalizedCode.length >= 12 : normalizedCode.length === 6) && !submitting;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      const result = await verifyOrgAdminMfa(challenge, normalizedCode, useRecoveryCode);
      onSuccess(result.redirect_to || "/org-admin");
    } catch {
      setError("Codice non valido o scaduto. Riprova o usa un codice di recupero.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="surface mx-auto max-w-md p-7 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Verifica in due passaggi</p>
      <h1 className="mt-2 text-xl font-semibold text-neutral-900">Conferma il tuo accesso</h1>
      <p className="mt-3 text-sm leading-6 text-neutral-600">
        Inserisci il codice dell'app di autenticazione. Il link o il codice email sono già stati
        verificati e non possono essere riutilizzati.
      </p>
      <form className="mt-6" onSubmit={submit}>
        <label htmlFor="org-admin-mfa-code" className="block text-sm font-medium text-neutral-800">
          {useRecoveryCode ? "Codice di recupero" : "Codice a 6 cifre"}
        </label>
        <input
          id="org-admin-mfa-code"
          className="theme-input mt-2 w-full rounded-xl px-4 py-3 text-center text-lg font-semibold tracking-[0.2em]"
          inputMode={useRecoveryCode ? "text" : "numeric"}
          autoComplete="one-time-code"
          value={normalizedCode}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "org-admin-mfa-error" : undefined}
          autoFocus
        />
        {error ? (
          <p id="org-admin-mfa-error" className="mt-3 text-sm font-semibold text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn-primary mt-5 w-full py-2.5 text-sm" type="submit" disabled={!canSubmit}>
          {submitting ? "Verifica in corso..." : "Conferma e accedi"}
        </button>
        <button
          className="auth-link mt-4 w-full text-sm font-medium"
          type="button"
          onClick={() => {
            setUseRecoveryCode((value) => !value);
            setCode("");
            setError("");
          }}
        >
          {useRecoveryCode ? "Usa l'app di autenticazione" : "Usa un codice di recupero"}
        </button>
      </form>
    </div>
  );
};

export default OrgAdminMfaChallenge;
