import { FormEvent, useState } from "react";
import {
  executeAnnualCardDeactivation,
  previewAnnualCardDeactivation,
  stepUpSuperAdmin,
  type AnnualCardDeactivationPreview,
  type AnnualCardDeactivationResult,
} from "../../lib/api";

const SuperAdminAnnualClosure = () => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [preview, setPreview] = useState<AnnualCardDeactivationPreview | null>(null);
  const [result, setResult] = useState<AnnualCardDeactivationResult | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadPreview = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setPreview(await previewAnnualCardDeactivation(year));
      setConfirmation("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Anteprima non disponibile");
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!preview || confirmation !== `DISATTIVA ${preview.membership_year}`) return;
    setBusy(true);
    setError("");
    try {
      await stepUpSuperAdmin(mfaCode);
      const completed = await executeAnnualCardDeactivation(
        preview.membership_year,
        preview.preview_hash,
        confirmation,
      );
      setResult(completed);
      setMfaCode("");
      setConfirmation("");
      setPreview(await previewAnnualCardDeactivation(preview.membership_year));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Disattivazione non riuscita");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Operazione globale controllata</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Chiusura annualità</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-600">Disattiva le tessere annuali scadute senza eliminare soci, dati, pagamenti, documenti, numeri tessera o disponibilità dei lotti.</p>
      </header>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div> : null}
      {result ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">Operazione registrata: {result.deactivated_count} tessere disattivate.</div> : null}

      <section className="surface p-5" aria-busy={busy}>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={loadPreview}>
          <div>
            <label className="block text-sm font-medium text-neutral-800" htmlFor="annual-year">Annualità tessera</label>
            <input id="annual-year" className="mt-1 w-40 rounded-lg border border-neutral-300 bg-white px-3 py-2" type="number" min="1900" max="9998" value={year} onChange={(event) => { setYear(Number(event.target.value)); setPreview(null); }} />
          </div>
          <button className="btn-primary px-4 py-2" disabled={busy} type="submit">Genera anteprima</button>
        </form>
      </section>

      {preview ? (
        <section className="surface overflow-hidden" aria-labelledby="preview-heading">
          <div className="border-b border-neutral-200 px-5 py-4">
            <h2 id="preview-heading" className="font-semibold text-neutral-950">Anteprima annualità {preview.membership_year}</h2>
            <p className="mt-1 text-sm text-neutral-600">Valida fino al <strong>{new Date(`${preview.valid_through}T12:00:00`).toLocaleDateString("it-IT")}</strong> incluso. Diventa inattiva dal giorno successivo alle 00:00, ora italiana.</p>
          </div>
          <div className="grid gap-4 border-b border-neutral-200 p-5 sm:grid-cols-3">
            <div><p className="text-xs uppercase tracking-wide text-neutral-500">Tessere interessate</p><p className="mt-1 text-2xl font-semibold tabular-nums">{preview.total_count}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-neutral-500">Associazioni</p><p className="mt-1 text-2xl font-semibold tabular-nums">{preview.organizations.length}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-neutral-500">Eseguibile ora</p><p className={`mt-1 text-sm font-semibold ${preview.can_execute ? "text-emerald-700" : "text-amber-700"}`}>{preview.can_execute ? "Sì" : "No, la validità non è terminata"}</p></div>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Tessere da disattivare per associazione</caption>
              <thead className="sticky top-0 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600"><tr><th scope="col" className="px-5 py-3">Associazione</th><th scope="col" className="px-5 py-3 text-right">Tessere</th></tr></thead>
              <tbody className="divide-y divide-neutral-200">{preview.organizations.map((organization) => <tr key={organization.org_id}><td className="px-5 py-3 font-medium text-neutral-900">{organization.organization_name}</td><td className="px-5 py-3 text-right tabular-nums">{organization.count}</td></tr>)}</tbody>
            </table>
          </div>

          <div className="border-t border-neutral-200 bg-neutral-50 p-5">
            <p className="text-sm font-semibold text-neutral-900">Conferma protetta</p>
            <p className="mt-1 text-sm text-neutral-600">Inserisci un codice Authenticator e digita <code>DISATTIVA {preview.membership_year}</code>. Se i dati cambiano, l’anteprima viene rifiutata.</p>
            <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
              <div><label className="text-sm font-medium" htmlFor="annual-mfa">Codice Authenticator</label><input id="annual-mfa" className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono tracking-widest" autoComplete="one-time-code" inputMode="numeric" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} /></div>
              <div><label className="text-sm font-medium" htmlFor="annual-confirm">Testo di conferma</label><input id="annual-confirm" className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
            </div>
            <button className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={busy || !preview.can_execute || !mfaCode.trim() || confirmation !== `DISATTIVA ${preview.membership_year}`} onClick={execute}>{busy ? "Esecuzione..." : "Disattiva tessere annuali"}</button>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default SuperAdminAnnualClosure;
