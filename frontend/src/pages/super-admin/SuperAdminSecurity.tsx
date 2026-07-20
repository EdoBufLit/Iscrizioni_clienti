import { FormEvent, useEffect, useState } from "react";
import {
  changeSuperAdminPassword,
  fetchSuperAdminMe,
  fetchSuperAdminSessions,
  regenerateSuperAdminRecoveryCodes,
  revokeOtherSuperAdminSessions,
  revokeSuperAdminSession,
  stepUpSuperAdmin,
  type SuperAdminProfile,
  type SuperAdminSessionInfo,
} from "../../lib/api";

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const SuperAdminSecurity = () => {
  const [profile, setProfile] = useState<SuperAdminProfile | null>(null);
  const [sessions, setSessions] = useState<SuperAdminSessionInfo[]>([]);
  const [stepUpCode, setStepUpCode] = useState("");
  const [stepUpActive, setStepUpActive] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const [nextProfile, nextSessions] = await Promise.all([
      fetchSuperAdminMe(),
      fetchSuperAdminSessions(),
    ]);
    setProfile(nextProfile);
    setSessions(nextSessions);
  };

  useEffect(() => {
    reload().catch((caught) => setError(caught instanceof Error ? caught.message : "Caricamento non riuscito"));
  }, []);

  const verifyStepUp = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await stepUpSuperAdmin(stepUpCode);
      setStepUpCode("");
      setStepUpActive(true);
      setMessage("Verifica completata. Le operazioni sensibili sono abilitate per 10 minuti.");
      window.setTimeout(() => setStepUpActive(false), 10 * 60 * 1000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Codice non valido");
    } finally {
      setBusy(false);
    }
  };

  const revokeSession = async (session: SuperAdminSessionInfo) => {
    if (session.current) return;
    setBusy(true);
    try {
      await revokeSuperAdminSession(session.id);
      await reload();
      setMessage("Sessione revocata.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Revoca non riuscita");
    } finally {
      setBusy(false);
    }
  };

  const revokeOthers = async () => {
    setBusy(true);
    try {
      const revoked = await revokeOtherSuperAdminSessions();
      await reload();
      setMessage(`${revoked} sessioni revocate.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Revoca non riuscita");
    } finally {
      setBusy(false);
    }
  };

  const regenerateCodes = async () => {
    setBusy(true);
    try {
      const codes = await regenerateSuperAdminRecoveryCodes();
      setRecoveryCodes(codes);
      await reload();
      setMessage("Nuovi codici generati. I precedenti non sono più validi.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await changeSuperAdminPassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password aggiornata; le altre sessioni sono state revocate.");
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cambio password non riuscito");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Accesso privilegiato</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Sicurezza</h1>
        <p className="mt-1 text-sm text-neutral-600">Secondo fattore, codici di recupero, password e dispositivi collegati.</p>
      </header>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{message}</div> : null}

      <section className="surface p-5" aria-labelledby="mfa-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="mfa-heading" className="font-semibold text-neutral-950">Autenticazione a due fattori</h2>
            <p className="mt-1 text-sm text-neutral-600">TOTP {profile?.mfa_enabled ? "attivo" : "non attivo"}; {profile?.recovery_codes_remaining ?? 0} codici di recupero disponibili.</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${profile?.mfa_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {profile?.mfa_enabled ? "Protetto" : "Da configurare"}
          </span>
        </div>

        <form className="mt-5 flex max-w-lg flex-col gap-3 sm:flex-row" onSubmit={verifyStepUp}>
          <div className="flex-1">
            <label className="text-sm font-medium text-neutral-800" htmlFor="security-step-up">Codice per operazioni sensibili</label>
            <input id="security-step-up" className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono tracking-widest focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" value={stepUpCode} onChange={(event) => setStepUpCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" />
          </div>
          <button className="btn-primary self-end px-4 py-2" disabled={busy || !stepUpCode.trim()} type="submit">Verifica</button>
        </form>

        <button className="mt-4 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={!stepUpActive || busy} onClick={regenerateCodes}>
          Rigenera codici di recupero
        </button>

        {recoveryCodes.length ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">Salvali ora: non verranno mostrati di nuovo.</p>
            <ul className="mt-3 grid gap-2 font-mono text-sm sm:grid-cols-2" aria-label="Nuovi codici di recupero">
              {recoveryCodes.map((code) => <li key={code}>{code}</li>)}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="surface overflow-hidden" aria-labelledby="sessions-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <div>
            <h2 id="sessions-heading" className="font-semibold text-neutral-950">Sessioni attive</h2>
            <p className="text-sm text-neutral-600">Revoca immediatamente dispositivi non riconosciuti.</p>
          </div>
          <button className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold" type="button" disabled={busy || sessions.length < 2} onClick={revokeOthers}>Revoca le altre</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <caption className="sr-only">Sessioni Super Admin attive</caption>
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600"><tr><th className="px-5 py-3">Dispositivo</th><th className="px-5 py-3">Ultima attività</th><th className="px-5 py-3">Scadenza</th><th className="px-5 py-3 text-right">Azione</th></tr></thead>
            <tbody className="divide-y divide-neutral-200">
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td className="px-5 py-4"><span className="font-medium text-neutral-900">{session.user_agent || "Dispositivo non identificato"}</span>{session.current ? <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">Questa sessione</span> : null}<p className="mt-1 text-xs text-neutral-500">IP {session.ip_hash?.slice(0, 12) || "-"}</p></td>
                  <td className="px-5 py-4 text-neutral-700">{formatDateTime(session.last_seen_at)}</td>
                  <td className="px-5 py-4 text-neutral-700">{formatDateTime(session.absolute_expires_at)}</td>
                  <td className="px-5 py-4 text-right"><button className="text-sm font-semibold text-red-700 disabled:text-neutral-400" type="button" disabled={busy || session.current} onClick={() => revokeSession(session)}>Revoca</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface p-5" aria-labelledby="password-heading">
        <h2 id="password-heading" className="font-semibold text-neutral-950">Cambia password</h2>
        <p className="mt-1 text-sm text-neutral-600">Richiede la verifica MFA recente e revoca le altre sessioni.</p>
        <form className="mt-4 grid max-w-2xl gap-4 sm:grid-cols-2" onSubmit={changePassword}>
          <div><label className="text-sm font-medium" htmlFor="current-password">Password attuale</label><input id="current-password" className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div>
          <div><label className="text-sm font-medium" htmlFor="new-password">Nuova password</label><input id="new-password" className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2" type="password" minLength={12} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></div>
          <button className="btn-primary px-4 py-2 sm:col-span-2 sm:w-fit" type="submit" disabled={!stepUpActive || busy || !currentPassword || newPassword.length < 12}>Aggiorna password</button>
        </form>
      </section>
    </div>
  );
};

export default SuperAdminSecurity;
