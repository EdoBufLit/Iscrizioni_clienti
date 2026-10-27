import { type ChangeEvent, useEffect, useRef, useState } from "react";
import ModalShell from "../../../../components/ui/ModalShell";
import {
  importReceipts,
  previewReceiptImport,
  type ReceiptImportPreview,
} from "../../../../lib/accounting";
import { formatCents, formatReceiptDate, mutationKey } from "./accountingUi";

type Props = {
  onClose: () => void;
  onImported: (created: number, duplicates: number) => void;
  onAuthError: (error: unknown) => void;
};

export default function ReceiptImportModal({
  onClose,
  onImported,
  onAuthError,
}: Props) {
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ReceiptImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestKey = useRef(mutationKey());
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current += 1;
      controller.current?.abort();
    },
    [],
  );

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const current = ++generation.current;
    controller.current?.abort();
    setPreview(null);
    setCsvText("");
    setError("");
    setFileName(file?.name ?? "");
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("Il file deve pesare al massimo 1 MB.");
      return;
    }
    setBusy(true);
    const activeController = new AbortController();
    controller.current = activeController;
    try {
      const text = await file.text();
      if (current !== generation.current) return;
      const result = await previewReceiptImport(text, activeController.signal);
      if (current !== generation.current) return;
      setCsvText(text);
      setPreview(result);
      requestKey.current = mutationKey();
    } catch (failure) {
      if (current !== generation.current || activeController.signal.aborted)
        return;
      onAuthError(failure);
      setError(
        failure instanceof Error
          ? failure.message
          : "Impossibile verificare il CSV.",
      );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  const commit = async () => {
    if (
      busy ||
      !preview ||
      preview.invalid_count ||
      !preview.valid_count ||
      !csvText
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await importReceipts(csvText, requestKey.current);
      onImported(result.created, result.duplicates);
    } catch (failure) {
      onAuthError(failure);
      setError(
        failure instanceof Error
          ? failure.message
          : "Importazione non riuscita. Puoi riprovare senza duplicare gli incassi.",
      );
    } finally {
      setBusy(false);
    }
  };
  const newCount = preview
    ? Math.max(0, preview.valid_count - preview.duplicate_count)
    : 0;
  return (
    <ModalShell
      open
      title="Importa incassi da CSV"
      description="L'anteprima non registra movimenti e non abbina quote. Conferma soltanto dopo aver controllato date, importi e duplicati."
      onClose={onClose}
      closeDisabled={busy}
      closeOnEscape={!busy}
      closeOnOverlay={!busy}
      sizeClassName="max-w-4xl"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-4 text-sm text-[var(--theme-text-muted)]">
          <p>
            Colonne minime: <strong>date,amount</strong> (sono accettati anche
            gli alias italiani). Facoltative: reference, payer, description,
            currency. Date e importi vengono mostrati nell'anteprima.
          </p>
          <p className="mt-2">
            Solo entrate positive in EUR, massimo 1.000 righe e 1 MB. Una riga
            non valida blocca l'intero import; i duplicati riconosciuti vengono
            saltati.
          </p>
          <code className="mt-3 block overflow-x-auto whitespace-pre text-xs">
            {
              "date;amount;reference;payer;description\n2026-10-26;60,00;BON-123;Mario Rossi;Quote associative"
            }
          </code>
        </div>
        <label className="block text-sm font-semibold text-[var(--theme-text)]">
          File CSV
          <input
            className="mt-2 block w-full text-base"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              void chooseFile(event);
            }}
            disabled={busy}
          />
        </label>
        {busy ? (
          <p role="status" className="text-sm text-[var(--theme-text-muted)]">
            Verifica o importazione in corso…
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-[var(--theme-danger)]">
            {error}
          </p>
        ) : null}
        {preview ? (
          <>
            <p className="text-sm font-semibold text-[var(--theme-text)]">
              {fileName}: {newCount} nuovi incassi, {preview.duplicate_count}{" "}
              duplicati, {preview.invalid_count} righe non valide.
            </p>
            {preview.invalid_count ? (
              <p role="alert" className="text-sm text-[var(--theme-danger)]">
                Correggi le righe indicate e scegli nuovamente il file. Nessun
                incasso è stato importato.
              </p>
            ) : null}
            <div className="max-h-80 overflow-auto rounded-xl border border-[var(--theme-border)]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">
                  Anteprima incassi da importare
                </caption>
                <thead className="bg-[var(--theme-surface-muted)] text-[var(--theme-text-muted)]">
                  <tr>
                    <th className="p-3">Riga</th>
                    <th className="p-3">Esito</th>
                    <th className="p-3">Data</th>
                    <th className="p-3">Importo</th>
                    <th className="p-3">Riferimento / pagante</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr
                      key={row.row_number}
                      className="border-t border-[var(--theme-border)]"
                    >
                      <td className="p-3">{row.row_number}</td>
                      <td className="p-3">
                        {row.errors.length ? (
                          <span className="text-[var(--theme-danger)]">
                            {row.errors.join(" · ")}
                          </span>
                        ) : row.duplicate ? (
                          "Duplicato: sarà saltato"
                        ) : (
                          "Da importare"
                        )}
                      </td>
                      <td className="p-3">
                        {row.receipt
                          ? formatReceiptDate(row.receipt.paid_on)
                          : "—"}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {row.receipt
                          ? formatCents(
                              row.receipt.amount_cents,
                              row.receipt.currency,
                            )
                          : "—"}
                      </td>
                      <td className="p-3">
                        {row.receipt?.reference || row.receipt?.payer || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            className="btn-secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            className="btn-primary"
            type="button"
            disabled={
              busy || !preview || preview.invalid_count > 0 || newCount <= 0
            }
            onClick={() => {
              void commit();
            }}
          >
            {busy
              ? "Operazione in corso…"
              : `Conferma importazione${preview ? ` di ${newCount} incassi` : ""}`}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
