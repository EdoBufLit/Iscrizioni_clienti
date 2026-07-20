import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  confirmOrgAdminMfa,
  fetchOrgAdminSecurity,
  regenerateOrgAdminRecoveryCodes,
  requestOrgAdminMfaSetupEmailCode,
  revokeOrgAdminSession,
  revokeOtherOrgAdminSessions,
  setupOrgAdminMfa,
  verifyOrgAdminMfaSetupEmailCode,
  type OrgAdminMfaSetup,
  type OrgAdminMfaSetupEmailStepUp,
  type OrgAdminSecurityInfo,
} from "../../lib/api";

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Non disponibile";

const deviceLabel = (userAgent: string | null) => {
  if (!userAgent) return "Dispositivo non identificato";
  const browser = userAgent.includes("Edg/")
    ? "Edge"
    : userAgent.includes("Chrome/")
      ? "Chrome"
      : userAgent.includes("Firefox/")
        ? "Firefox"
        : userAgent.includes("Safari/")
          ? "Safari"
          : "Browser";
  const platform = userAgent.includes("Windows")
    ? "Windows"
    : userAgent.includes("Android")
      ? "Android"
      : userAgent.includes("iPhone") || userAgent.includes("iPad")
        ? "iOS/iPadOS"
        : userAgent.includes("Mac OS")
          ? "macOS"
          : "dispositivo";
  return `${browser} su ${platform}`;
};

const RecoveryCodes = ({ codes }: { codes: string[] }) => (
  <div className="rounded-xl border border-amber-200 bg-amber-50 p-5" role="status">
    <h2 className="font-semibold text-amber-950">Salva ora i codici di recupero</h2>
    <p className="mt-1 text-sm leading-6 text-amber-900">
      Sono mostrati una sola volta. Ogni codice può essere usato una sola volta.
    </p>
    <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm text-amber-950 sm:grid-cols-5">
      {codes.map((code) => (
        <code key={code} className="rounded-lg bg-white px-2 py-2 text-center shadow-sm">
          {code}
        </code>
      ))}
    </div>
    <button
      type="button"
      className="btn-ghost mt-4 text-sm"
      onClick={() => void navigator.clipboard.writeText(codes.join("\n"))}
    >
      Copia tutti i codici
    </button>
  </div>
);

const OrgAdminSecurity = () => {
  const [security, setSecurity] = useState<OrgAdminSecurityInfo | null>(null);
  const [setup, setSetup] = useState<OrgAdminMfaSetup | null>(null);
  const [emailStepUp, setEmailStepUp] = useState<OrgAdminMfaSetupEmailStepUp | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setSecurity(await fetchOrgAdminSecurity());
  }, []);

  useEffect(() => {
    load().catch(() => setError("Impossibile caricare le impostazioni di sicurezza."));
  }, [load]);

  const startSetup = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await requestOrgAdminMfaSetupEmailCode();
      setEmailStepUp(result);
      setMessage(`Codice inviato a ${result.masked_email}. Scade tra 5 minuti.`);
    } catch {
      // A page refresh can occur while a still-valid code is in flight. Keep
      // the input available without ever exposing or regenerating that code.
      setEmailStepUp((current) => current ?? {
        ok: true,
        masked_email: "l'email dell'account",
        expires_in_seconds: 300,
        resend_after_seconds: 60,
      });
      setError("Invio non riuscito o richiesto troppo presto. Se hai già ricevuto il codice, inseriscilo qui sotto.");
    } finally {
      setBusy(false);
    }
  };

  const confirmEmailStepUp = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await verifyOrgAdminMfaSetupEmailCode(emailCode);
      setSetup(await setupOrgAdminMfa());
      setEmailStepUp(null);
      setEmailCode("");
      setMessage("Email verificata. Ora configura l'app di autenticazione.");
    } catch {
      setError("Codice email non valido o scaduto. Richiedine uno nuovo e riprova.");
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await confirmOrgAdminMfa(setupCode);
      setRecoveryCodes(result.recovery_codes);
      setSetup(null);
      setSetupCode("");
      setMessage("Verifica in due passaggi attivata.");
      await load();
    } catch {
      setError("Codice non valido. Controlla l'orario del dispositivo e riprova.");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await regenerateOrgAdminRecoveryCodes(verificationCode, useRecoveryCode);
      setRecoveryCodes(result.recovery_codes);
      setVerificationCode("");
      setMessage("Nuovi codici generati. I precedenti non sono più validi.");
      await load();
    } catch {
      setError("Codice di verifica non valido.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (sessionId: number) => {
    setBusy(true);
    setError("");
    try {
      const result = await revokeOrgAdminSession(sessionId);
      if (result.current) {
        window.location.assign("/org-admin/login");
        return;
      }
      setMessage("Sessione revocata immediatamente.");
      await load();
    } catch {
      setError("Impossibile revocare la sessione.");
    } finally {
      setBusy(false);
    }
  };

  const revokeOthers = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await revokeOtherOrgAdminSessions();
      setMessage(`${result.revoked_count} sessioni revocate.`);
      await load();
    } catch {
      setError("Impossibile revocare le altre sessioni.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-shell max-w-5xl py-8 sm:py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Account</p>
        <h1 className="mt-2 text-2xl font-bold text-neutral-950">Sicurezza e sessioni</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
          La verifica in due passaggi è facoltativa. Se non la attivi, link e codice email continueranno
          a funzionare esattamente come prima.
        </p>
      </header>

      {error ? <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
      {message ? <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800" role="status">{message}</p> : null}
      {recoveryCodes.length ? <div className="mt-6"><RecoveryCodes codes={recoveryCodes} /></div> : null}

      <section className="surface mt-7 p-6 sm:p-7" aria-labelledby="mfa-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="mfa-heading" className="text-lg font-semibold text-neutral-950">Verifica in due passaggi</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Stato: <strong>{security?.mfa_enabled ? "attiva" : "non attiva"}</strong>
              {security?.mfa_enabled ? ` · ${security.recovery_codes_remaining} codici di recupero disponibili` : ""}
            </p>
          </div>
          {!security?.mfa_enabled && !setup && !emailStepUp ? (
            <button className="btn-primary text-sm" type="button" onClick={startSetup} disabled={busy}>
              Attiva MFA
            </button>
          ) : null}
        </div>

        {emailStepUp && !setup ? (
          <div className="mt-6 border-t border-neutral-200 pt-6">
            <h3 className="font-semibold text-neutral-900">Conferma prima la tua email</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-600">
              Abbiamo inviato un codice a <strong>{emailStepUp.masked_email}</strong>. Questo controllo impedisce
              a chi possiede soltanto una vecchia sessione di attivare un nuovo fattore di accesso.
            </p>
            <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={confirmEmailStepUp}>
              <div>
                <label className="block text-sm font-medium text-neutral-800" htmlFor="mfa-email-step-up-code">
                  Codice email a 6 cifre
                </label>
                <input
                  id="mfa-email-step-up-code"
                  className="theme-input mt-1 w-48 rounded-xl px-4 py-2.5 text-center font-semibold tracking-[0.2em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={emailCode.replace(/\D/g, "").slice(0, 6)}
                  onChange={(event) => setEmailCode(event.target.value)}
                  placeholder="000000"
                />
              </div>
              <button className="btn-primary text-sm" disabled={busy || emailCode.replace(/\D/g, "").length !== 6}>
                Verifica e continua
              </button>
              <button className="btn-ghost text-sm" type="button" onClick={startSetup} disabled={busy}>
                Invia di nuovo
              </button>
            </form>
          </div>
        ) : null}

        {setup ? (
          <div className="mt-6 grid gap-6 border-t border-neutral-200 pt-6 sm:grid-cols-[180px_1fr]">
            <img className="h-44 w-44 rounded-xl border bg-white p-2" src={setup.qr_data_uri} alt="QR per configurare l'app di autenticazione" />
            <div>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-neutral-700">
                <li>Scansiona il QR con Google Authenticator, Microsoft Authenticator, 1Password o un'app equivalente.</li>
                <li>Se non puoi scansionarlo, inserisci manualmente questa chiave: <code className="break-all font-mono font-semibold">{setup.secret}</code></li>
                <li>Conferma con il codice a 6 cifre generato dall'app.</li>
              </ol>
              <form className="mt-5 flex flex-wrap gap-3" onSubmit={confirmSetup}>
                <label className="sr-only" htmlFor="mfa-setup-code">Codice a 6 cifre</label>
                <input id="mfa-setup-code" className="theme-input w-48 rounded-xl px-4 py-2.5 text-center font-semibold tracking-[0.2em]" inputMode="numeric" autoComplete="one-time-code" value={setupCode.replace(/\D/g, "").slice(0, 6)} onChange={(event) => setSetupCode(event.target.value)} placeholder="000000" />
                <button className="btn-primary text-sm" disabled={busy || setupCode.replace(/\D/g, "").length !== 6}>Conferma attivazione</button>
              </form>
            </div>
          </div>
        ) : null}

        {security?.mfa_enabled ? (
          <form className="mt-6 border-t border-neutral-200 pt-6" onSubmit={regenerate}>
            <h3 className="font-semibold text-neutral-900">Rigenera codici di recupero</h3>
            <p className="mt-1 text-sm text-neutral-600">L'operazione invalida subito tutti i codici precedenti.</p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-800" htmlFor="mfa-regenerate-code">
                  {useRecoveryCode ? "Codice di recupero" : "Codice dell'app"}
                </label>
                <input id="mfa-regenerate-code" className="theme-input mt-1 w-56 rounded-xl px-4 py-2.5" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} />
              </div>
              <button className="btn-secondary text-sm" disabled={busy || verificationCode.trim().length < 6}>Rigenera</button>
              <button type="button" className="auth-link pb-2.5 text-sm" onClick={() => { setUseRecoveryCode((value) => !value); setVerificationCode(""); }}>
                {useRecoveryCode ? "Usa codice dell'app" : "Usa codice di recupero"}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="surface mt-7 p-6 sm:p-7" aria-labelledby="sessions-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="sessions-heading" className="text-lg font-semibold text-neutral-950">Sessioni attive</h2>
            <p className="mt-1 text-sm text-neutral-600">Durano 30 giorni come prima. La revoca è effettiva sulla richiesta successiva.</p>
          </div>
          <button className="btn-ghost text-sm" type="button" onClick={revokeOthers} disabled={busy}>Revoca le altre</button>
        </div>
        <div className="mt-5 divide-y divide-neutral-200">
          {security?.sessions.map((session) => (
            <article key={session.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div>
                <p className="font-semibold text-neutral-900">
                  {deviceLabel(session.user_agent)} {session.current ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Questa sessione</span> : null}
                </p>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Ultimo uso: {formatDate(session.last_seen_at)} · Scade: {formatDate(session.expires_at)}
                  {session.ip_hash ? ` · Rete ${session.ip_hash.slice(0, 10)}…` : ""}
                </p>
              </div>
              <button className="text-sm font-semibold text-red-700 hover:text-red-900" type="button" onClick={() => void revoke(session.id)} disabled={busy}>
                Revoca
              </button>
            </article>
          ))}
          {security && security.sessions.length === 0 ? <p className="py-5 text-sm text-neutral-500">Nessuna sessione attiva.</p> : null}
        </div>
      </section>
    </div>
  );
};

export default OrgAdminSecurity;
