import { FormEvent, memo, useEffect, useState } from "react";
import {
  createSuperAdminOrganization,
  patchSuperAdminOrganization,
  setOrganizationCardRange,
  addOrgCardBatch,
  fetchOrgBatches,
  runAnnualMaintenance,
  uploadSuperAdminStatute,
  type SuperAdminOrganization,
  type OrgBatch,
} from "../../../lib/api";

export type OrganizationModalType = "create" | "range" | "add-batch" | "view-batches" | "branding";

type OrganizationManageModalProps = {
  open: boolean;
  modalType: OrganizationModalType;
  selectedOrg: SuperAdminOrganization | null;
  onClose: () => void;
  onSaved: () => void;
  onSwitchToAddBatch: () => void;
};

type ModalFormData = {
  name: string;
  slug: string;
  club_display_name: string;
  card_email_subject: string;
  card_logo_url: string;
  city: string;
  province: string;
  description_short: string;
  is_active: boolean;
  from_no: string;
  to_no: string;
};

const createInitialFormData = (): ModalFormData => ({
  name: "",
  slug: "",
  club_display_name: "",
  card_email_subject: "",
  card_logo_url: "",
  city: "",
  province: "",
  description_short: "",
  is_active: true,
  from_no: "",
  to_no: "",
});

const OrganizationManageModal = memo(function OrganizationManageModal({
  open,
  modalType,
  selectedOrg,
  onClose,
  onSaved,
  onSwitchToAddBatch,
}: OrganizationManageModalProps) {
  const [formData, setFormData] = useState<ModalFormData>(createInitialFormData);
  const [statuteFile, setStatuteFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [batches, setBatches] = useState<OrgBatch[]>([]);
  const [batchesSummary, setBatchesSummary] = useState<{
    total: number;
    assigned: number;
    remaining: number;
  } | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [maintenanceRunning, setMaintenanceRunning] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [batchesCurrentYear, setBatchesCurrentYear] = useState<number | null>(null);
  const [nextResetAt, setNextResetAt] = useState<string | null>(null);

  const normalizeOptionalString = (value: string): string | null => {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    setFormData(createInitialFormData());
    setStatuteFile(null);
    setSubmitting(false);
    setSubmitError("");
    setBatches([]);
    setBatchesSummary(null);
    setMaintenanceMessage("");
    setBatchesCurrentYear(null);
    setNextResetAt(null);
  }, [open, modalType, selectedOrg?.id]);

  useEffect(() => {
    if (!open || !selectedOrg || modalType !== "branding") {
      return;
    }
    setFormData((prev) => ({
      ...prev,
      name: selectedOrg.name ?? "",
      slug: selectedOrg.slug ?? "",
      club_display_name: selectedOrg.club_display_name ?? "",
      card_email_subject: selectedOrg.card_email_subject ?? "",
      card_logo_url: selectedOrg.card_logo_url ?? "",
    }));
  }, [open, modalType, selectedOrg]);

  useEffect(() => {
    if (!open || modalType !== "view-batches" || !selectedOrg) {
      return;
    }
    let active = true;
    setLoadingBatches(true);
    fetchOrgBatches(selectedOrg.id)
      .then((result) => {
        if (!active) return;
        setBatches(result.batches);
        setBatchesSummary(result.summary);
        setBatchesCurrentYear(result.current_year);
        setNextResetAt(result.next_reset_at);
      })
      .catch(() => {
        if (!active) return;
        setSubmitError("Errore nel caricamento dei lotti");
      })
      .finally(() => {
        if (!active) return;
        setLoadingBatches(false);
      });

    return () => {
      active = false;
    };
  }, [open, modalType, selectedOrg]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      if (modalType === "create") {
        const payload = {
          name: formData.name,
          slug: formData.slug || undefined,
          club_display_name: normalizeOptionalString(formData.club_display_name) ?? undefined,
          card_email_subject: normalizeOptionalString(formData.card_email_subject) ?? undefined,
          card_logo_url: normalizeOptionalString(formData.card_logo_url) ?? undefined,
          city: formData.city || undefined,
          province: formData.province || undefined,
          description_short: formData.description_short || undefined,
          is_active: formData.is_active,
        };
        const newOrg = await createSuperAdminOrganization(payload);
        if (statuteFile && newOrg.id) {
          await uploadSuperAdminStatute(newOrg.id, statuteFile);
        }
      } else if ((modalType === "range" || modalType === "add-batch") && selectedOrg) {
        const from = parseInt(formData.from_no, 10);
        const to = parseInt(formData.to_no, 10);
        if (Number.isNaN(from) || Number.isNaN(to)) {
          throw new Error("Numeri non validi");
        }
        if (from <= 0 || to <= 0) {
          throw new Error("I numeri devono essere positivi");
        }
        if (from > to) {
          throw new Error("Il numero iniziale deve essere minore o uguale al finale");
        }

        if (modalType === "range") {
          await setOrganizationCardRange(selectedOrg.id, from, to);
        } else {
          await addOrgCardBatch(selectedOrg.id, from, to);
        }
      } else if (modalType === "branding" && selectedOrg) {
        await patchSuperAdminOrganization(selectedOrg.id, {
          club_display_name: normalizeOptionalString(formData.club_display_name),
          card_email_subject: normalizeOptionalString(formData.card_email_subject),
          card_logo_url: normalizeOptionalString(formData.card_logo_url),
        });
      }

      onSaved();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Errore operazione");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunMaintenance = async () => {
    if (maintenanceRunning) return;
    const confirmed = window.confirm(
      "Confermi l'esecuzione della manutenzione annuale? Verranno scaduti e purgati i soci con tessera di anni precedenti."
    );
    if (!confirmed) return;

    setMaintenanceRunning(true);
    setMaintenanceMessage("");
    setSubmitError("");
    try {
      const result = await runAnnualMaintenance(true);
      setMaintenanceMessage(
        `Manutenzione completata: ${result.expired_count} soci scaduti, ${result.purged_count} soci purgati.`
      );
      if (selectedOrg) {
        const refreshed = await fetchOrgBatches(selectedOrg.id);
        setBatches(refreshed.batches);
        setBatchesSummary(refreshed.summary);
        setBatchesCurrentYear(refreshed.current_year);
        setNextResetAt(refreshed.next_reset_at);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Errore esecuzione manutenzione");
    } finally {
      setMaintenanceRunning(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="modal-panel max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        data-component="superadmin-org-manage-modal"
      >
        <h3 className="text-lg font-semibold text-neutral-900">
          {modalType === "create" && "Nuova associazione"}
          {modalType === "range" && `Imposta range tessere: ${selectedOrg?.name}`}
          {modalType === "add-batch" && `Aggiungi lotto tessere: ${selectedOrg?.name}`}
          {modalType === "view-batches" && `Lotti tessere: ${selectedOrg?.name}`}
          {modalType === "branding" && `Branding tessera: ${selectedOrg?.name}`}
        </h3>

        <div className="mt-4 min-h-[48px]">
          {submitError && (
            <div className="rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}
        </div>

        <form className="mt-2 grid gap-4" onSubmit={handleSubmit}>
          {modalType === "create" && (
            <>
              <div>
                <label htmlFor="name" className="block text-xs font-medium text-neutral-600">
                  Nome associazione *
                </label>
                <input
                  id="name"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="city" className="block text-xs font-medium text-neutral-600">
                    Citta
                  </label>
                  <input
                    id="city"
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="province" className="block text-xs font-medium text-neutral-600">
                    Provincia
                  </label>
                  <input
                    id="province"
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="text"
                    placeholder="RM"
                    maxLength={2}
                    value={formData.province}
                    onChange={(e) => setFormData((prev) => ({ ...prev, province: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="slug" className="block text-xs font-medium text-neutral-600">
                  Slug (opzionale, autogenerato)
                </label>
                <input
                  id="slug"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-xs font-medium text-neutral-600">
                  Descrizione breve
                </label>
                <textarea
                  id="description"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  rows={3}
                  value={formData.description_short}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description_short: e.target.value }))
                  }
                />
              </div>

              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  Branding tessera
                </p>
                <div className="mt-3 grid gap-3">
                  <div>
                    <label htmlFor="club_display_name" className="block text-xs font-medium text-neutral-600">
                      Nome club visualizzato
                    </label>
                    <input
                      id="club_display_name"
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      type="text"
                      value={formData.club_display_name}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, club_display_name: e.target.value }))
                      }
                      placeholder="Golden Age Club - Speakeasy"
                    />
                  </div>
                  <div>
                    <label htmlFor="card_email_subject" className="block text-xs font-medium text-neutral-600">
                      Oggetto email tessera
                    </label>
                    <input
                      id="card_email_subject"
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      type="text"
                      value={formData.card_email_subject}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, card_email_subject: e.target.value }))
                      }
                      placeholder="La tua tessera {club_display_name}"
                    />
                  </div>
                  <div>
                    <label htmlFor="card_logo_url" className="block text-xs font-medium text-neutral-600">
                      URL logo tessera (opzionale)
                    </label>
                    <input
                      id="card_logo_url"
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      type="url"
                      value={formData.card_logo_url}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, card_logo_url: e.target.value }))
                      }
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                  className="rounded border-gray-300 text-brand focus:ring-brand"
                />
                <label htmlFor="is_active" className="text-sm text-neutral-700">
                  Attiva subito
                </label>
              </div>

              <div>
                <label htmlFor="statute_file" className="block text-xs font-medium text-neutral-600">
                  Statuto (PDF, opzionale)
                </label>
                <input
                  id="statute_file"
                  type="file"
                  accept=".pdf"
                  className="mt-1 block text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-700"
                  onChange={(e) => setStatuteFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </>
          )}

          {modalType === "range" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600">Da (Inizio)</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  required
                  value={formData.from_no}
                  onChange={(e) => setFormData((prev) => ({ ...prev, from_no: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600">A (Fine)</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  required
                  value={formData.to_no}
                  onChange={(e) => setFormData((prev) => ({ ...prev, to_no: e.target.value }))}
                />
              </div>
            </div>
          )}

          {modalType === "add-batch" && (
            <div>
              <p className="mb-4 text-sm text-neutral-600">
                Aggiungi un nuovo lotto di tessere per <strong>{selectedOrg?.name}</strong>.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600">
                    Da (numero iniziale)
                  </label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
                    required
                    min="1"
                    value={formData.from_no}
                    onChange={(e) => setFormData((prev) => ({ ...prev, from_no: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600">
                    A (numero finale)
                  </label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
                    required
                    min="1"
                    value={formData.to_no}
                    onChange={(e) => setFormData((prev) => ({ ...prev, to_no: e.target.value }))}
                  />
                </div>
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                Il range non deve sovrapporsi a lotti esistenti (di questa o altre associazioni).
              </p>
            </div>
          )}

          {modalType === "view-batches" && (
            <div>
              <div className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="text-neutral-500">Anno corrente (server)</p>
                    <p className="font-semibold text-neutral-900 tabular-nums">
                      {batchesCurrentYear ?? "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-neutral-500">Reset annuale</p>
                    <p className="font-medium text-neutral-800">
                      {nextResetAt
                        ? `Previsto il ${new Date(nextResetAt).toLocaleDateString("it-IT")}`
                        : "A inizio anno (01/01)"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-xs font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-60"
                    onClick={handleRunMaintenance}
                    disabled={maintenanceRunning}
                  >
                    {maintenanceRunning ? "Manutenzione..." : "Esegui manutenzione annuale"}
                  </button>
                </div>
                {maintenanceMessage && (
                  <p className="mt-2 text-xs text-emerald-700">{maintenanceMessage}</p>
                )}
              </div>

              {loadingBatches ? (
                <p className="text-sm text-neutral-500">Caricamento lotti...</p>
              ) : batches.length === 0 ? (
                <p className="text-sm text-neutral-500">Nessun lotto configurato.</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-neutral-500">
                        <th className="py-2 font-medium">Range</th>
                        <th className="py-2 font-medium text-right">Next</th>
                        <th className="py-2 font-medium text-right">Anno</th>
                        <th className="py-2 font-medium text-right">Stato</th>
                        <th className="py-2 font-medium text-right">Totale</th>
                        <th className="py-2 font-medium text-right">Assegnate</th>
                        <th className="py-2 font-medium text-right">Rimanenti</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map((batch) => (
                        <tr key={batch.id} className="border-b border-neutral-100">
                          <td className="py-2 tabular-nums">{batch.start_no} - {batch.end_no}</td>
                          <td className="py-2 text-right tabular-nums">{batch.next_no}</td>
                          <td className="py-2 text-right tabular-nums">{batch.year}</td>
                          <td className="py-2 text-right">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                batch.is_active
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-neutral-200 bg-neutral-50 text-neutral-600"
                              }`}
                            >
                              {batch.is_active ? "Attivo" : "Chiuso"}
                            </span>
                          </td>
                          <td className="py-2 text-right tabular-nums">{batch.total}</td>
                          <td className="py-2 text-right tabular-nums">{batch.assigned}</td>
                          <td className="py-2 text-right tabular-nums font-medium text-brand">{batch.remaining}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {batchesSummary && (
                    <div className="mt-4 rounded-md bg-neutral-50 px-4 py-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-600">Totale tessere:</span>
                        <span className="font-medium tabular-nums">{batchesSummary.total}</span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-neutral-600">Assegnate:</span>
                        <span className="font-medium tabular-nums">{batchesSummary.assigned}</span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-neutral-600">Rimanenti:</span>
                        <span className="font-semibold text-brand tabular-nums">{batchesSummary.remaining}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {modalType === "branding" && (
            <div className="grid gap-4">
              <p className="text-sm text-neutral-600">
                Configura nome pubblico, oggetto email e logo dedicato per la tessera digitale.
              </p>
              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  Nome club visualizzato
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                  value={formData.club_display_name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, club_display_name: e.target.value }))
                  }
                  placeholder={selectedOrg?.name ?? "Nome club"}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  Oggetto email tessera
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                  value={formData.card_email_subject}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, card_email_subject: e.target.value }))
                  }
                  placeholder="La tua tessera {club_display_name}"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Placeholder supportati: {"{club_display_name}"}, {"{org_name}"}.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  URL logo tessera
                </label>
                <input
                  type="url"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                  value={formData.card_logo_url}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, card_logo_url: e.target.value }))
                  }
                  placeholder="https://..."
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Se vuoto, viene usato il logo ufficiale associazione (se presente).
                </p>
              </div>
            </div>
          )}

          {modalType !== "view-batches" && (
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                onClick={onClose}
              >
                Annulla
              </button>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-subtle transition hover:-translate-y-px hover:bg-brand-dark hover:shadow-card active:translate-y-0 disabled:opacity-50"
                disabled={submitting}
              >
                {submitting ? "Salvataggio..." : "Conferma"}
              </button>
            </div>
          )}

          {modalType === "view-batches" && (
            <div className="mt-6 flex justify-between">
              <button
                type="button"
                className="text-sm font-medium text-brand hover:text-brand-dark"
                onClick={onSwitchToAddBatch}
              >
                + Aggiungi lotto
              </button>
              <button
                type="button"
                className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                onClick={onClose}
              >
                Chiudi
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
});

export default OrganizationManageModal;
