import { FormEvent, useEffect, useState } from "react";

import {
  commitOrgAdminMemberImport,
  previewOrgAdminMemberImport,
  type MemberImportBatch,
} from "../../../lib/api";
import ModalShell from "../../../components/ui/ModalShell";

type Props = {
  open: boolean;
  onClose: () => void;
  onCompleted: (count: number) => void | Promise<void>;
};

const MemberImportModal = ({ open, onClose, onCompleted }: Props) => {
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<MemberImportBatch | null>(null);
  const [policy, setPolicy] = useState<"all_or_nothing" | "valid_only">("all_or_nothing");
  const [activationMode, setActivationMode] = useState<"pending" | "active">("pending");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setBatch(null);
    setPolicy("all_or_nothing");
    setActivationMode("pending");
    setConfirmation("");
    setBusy(false);
    setError("");
  }, [open]);

  if (!open) return null;

  const preview = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      setBatch(await previewOrgAdminMemberImport(file));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Anteprima non disponibile");
    } finally {
      setBusy(false);
    }
  };

  const expectedConfirmation = batch
    ? activationMode === "active"
      ? `ATTIVA ${batch.valid_rows} SOCI`
      : `IMPORTA ${batch.valid_rows} SOCI`
    : "";

  const commit = async () => {
    if (!batch || confirmation !== expectedConfirmation || busy) return;
    setBusy(true);
    setError("");
    try {
      const completed = await commitOrgAdminMemberImport(batch.id, {
        policy,
        activation_mode: activationMode,
        confirmation,
      });
      await onCompleted(completed.imported_rows);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Importazione non riuscita");
    } finally {
      setBusy(false);
    }
  };

  const closeIfIdle = () => {
    if (!busy) onClose();
  };

  return (
    <ModalShell
      open={open}
      title="Importa soci da CSV"
      description="Prima viene generata un'anteprima: nessun socio, tessera o email viene creato in questa fase."
      onClose={closeIfIdle}
      closeOnOverlay={!busy}
      closeOnEscape={!busy}
      closeDisabled={busy}
      sizeClassName="max-w-5xl"
      zIndexClassName="z-[100]"
      contentClassName="max-h-[92vh] overflow-y-auto p-6"
    >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Importazione controllata</p>

        {!batch ? (
          <form className="mt-6 rounded-xl border border-dashed border-neutral-300 p-6" onSubmit={preview} aria-busy={busy}>
            <label className="text-sm font-semibold text-neutral-900" htmlFor="members-csv">File CSV UTF-8, massimo 5 MB e 5.000 righe</label>
            <input id="members-csv" className="mt-3 block w-full text-sm" type="file" accept=".csv,text/csv" required onChange={(event) => setFile(event.target.files?.[0] || null)} />
            <div className="mt-5 flex flex-wrap gap-3"><button className="btn-primary px-5 py-2.5" type="submit" disabled={!file || busy}>{busy ? "Analisi…" : "Genera anteprima"}</button><a className="btn-secondary px-5 py-2.5" href="/api/org-admin/members/imports/template.csv">Scarica modello CSV</a></div>
          </form>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-neutral-50 p-4"><p className="text-xs uppercase text-neutral-500">Righe</p><p className="mt-1 text-2xl font-bold">{batch.total_rows}</p></div><div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs uppercase text-emerald-700">Valide</p><p className="mt-1 text-2xl font-bold text-emerald-900">{batch.valid_rows}</p></div><div className="rounded-xl bg-red-50 p-4"><p className="text-xs uppercase text-red-700">Con errori</p><p className="mt-1 text-2xl font-bold text-red-900">{batch.error_rows}</p></div></div>
            {batch.error_rows ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><span>Le righe con errori non saranno mai importate.</span><a className="font-semibold underline" href={`/api/org-admin/members/imports/${batch.id}/errors.csv`}>Scarica errori CSV</a></div> : null}
            <div className="overflow-x-auto rounded-xl border border-neutral-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">Anteprima righe importazione</caption>
                <thead className="bg-neutral-50 text-xs uppercase text-neutral-600">
                  <tr>
                    <th scope="col" className="px-3 py-2">Riga</th>
                    <th scope="col" className="px-3 py-2">Socio</th>
                    <th scope="col" className="px-3 py-2">Email</th>
                    <th scope="col" className="px-3 py-2">Esito</th>
                    <th scope="col" className="px-3 py-2">Dettaglio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {(batch.rows || []).map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 tabular-nums">{row.row_number}</td>
                      <th scope="row" className="px-3 py-2 text-left font-medium">{row.preview.first_name} {row.preview.last_name}</th>
                      <td className="px-3 py-2">{row.preview.email || "-"}</td>
                      <td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status === "valid" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{row.status === "valid" ? "Valida" : "Errore"}</span></td>
                      <td className="px-3 py-2 text-xs text-red-700">{row.errors.map((item) => item.message).join("; ") || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {batch.rows_truncated ? <p className="text-xs text-neutral-500">Sono mostrate le prime 200 righe. I conteggi includono tutto il file.</p> : null}

            <fieldset className="grid gap-3 rounded-xl border border-neutral-200 p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-bold text-neutral-900">Modalità</legend><label className={`rounded-xl border p-4 ${activationMode === "pending" ? "border-brand bg-brand/5" : "border-neutral-200"}`}><input className="mr-2" type="radio" name="activation-mode" checked={activationMode === "pending"} onChange={() => { setActivationMode("pending"); setConfirmation(""); }} /><strong>Solo anagrafica (consigliata)</strong><span className="mt-1 block text-xs leading-5 text-neutral-600">Crea soci in attesa, senza tessera, email, pagamento o consenso.</span></label><label className={`rounded-xl border p-4 ${activationMode === "active" ? "border-red-300 bg-red-50" : "border-neutral-200"}`}><input className="mr-2" type="radio" name="activation-mode" checked={activationMode === "active"} onChange={() => { setActivationMode("active"); setConfirmation(""); }} /><strong>Approva e assegna tessere</strong><span className="mt-1 block text-xs leading-5 text-neutral-600">Richiede stock sufficiente; non invia email e non aggira pagamenti obbligatori.</span></label></fieldset>

            {batch.error_rows ? <label className="block text-sm font-semibold text-neutral-800">Gestione errori<select className="premium-select mt-1 w-full max-w-md" value={policy} onChange={(event) => setPolicy(event.target.value as typeof policy)}><option value="all_or_nothing">Blocca se esiste anche un errore</option><option value="valid_only">Importa solo le righe valide</option></select></label> : null}
            <div className="rounded-xl bg-neutral-50 p-4"><label className="text-sm font-semibold text-neutral-900" htmlFor="member-import-confirm">Digita <code>{expectedConfirmation}</code></label><input id="member-import-confirm" className="mt-2 w-full max-w-md rounded-lg border border-neutral-300 bg-white px-3 py-2" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
            {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-3"><button className="btn-secondary px-5 py-2.5" type="button" disabled={busy} onClick={() => { setBatch(null); setFile(null); }}>Cambia file</button><button className={`px-5 py-2.5 ${activationMode === "active" ? "rounded-lg bg-red-700 font-semibold text-white" : "btn-primary"}`} type="button" disabled={busy || confirmation !== expectedConfirmation || (policy === "all_or_nothing" && batch.error_rows > 0)} onClick={() => void commit()}>{busy ? "Importazione…" : `Importa ${batch.valid_rows} soci`}</button></div>
          </div>
        )}
        {error && !batch ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
    </ModalShell>
  );
};

export default MemberImportModal;
