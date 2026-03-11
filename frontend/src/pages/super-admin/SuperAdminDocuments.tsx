import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import Skeleton from "../../components/ui/Skeleton";
import SuperAdminAccountingWorkspace from "./components/SuperAdminAccountingWorkspace";
import {
  AuthError,
  createSuperAdminSharedDocument,
  downloadSuperAdminSharedDocument,
  fetchSuperAdminDocumentTargets,
  fetchSuperAdminSharedDocumentDetail,
  fetchSuperAdminSharedDocuments,
  type SuperAdminDocumentTarget,
  type SuperAdminProfile,
  type SuperAdminSharedDocument,
} from "../../lib/api";

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatBytes = (value: number | null | undefined) => {
  if (!value) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const kindBadgeClass = (kind: string) =>
  kind === "accounting"
    ? "bg-amber-50 text-amber-700 ring-amber-200/60"
    : "bg-sky-50 text-sky-700 ring-sky-200/60";

const SuperAdminDocuments = () => {
  const navigate = useNavigate();
  const { profile } = useOutletContext<{ profile: SuperAdminProfile | null }>();

  const [targets, setTargets] = useState<SuperAdminDocumentTarget[]>([]);
  const [documents, setDocuments] = useState<SuperAdminSharedDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<SuperAdminSharedDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [workspace, setWorkspace] = useState<"general" | "accounting">("general");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"general" | "accounting">("general");
  const [targetMode, setTargetMode] = useState<"single" | "multiple" | "all" | "accounting_enabled">("all");
  const [selectedAssociationIds, setSelectedAssociationIds] = useState<number[]>([]);
  const [file, setFile] = useState<File | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [targetsResponse, documentsResponse] = await Promise.all([
        fetchSuperAdminDocumentTargets(),
        fetchSuperAdminSharedDocuments(),
      ]);
      setTargets(targetsResponse.items);
      setDocuments(documentsResponse.items);
      setSelectedDocumentId((current) =>
        current && documentsResponse.items.some((item) => item.id === current)
          ? current
          : documentsResponse.items[0]?.id ?? null,
      );
      setError("");
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/super-admin/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Errore nel caricamento documenti.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const loadDetail = useCallback(
    async (documentId: number) => {
      try {
        setDetailLoading(true);
        const payload = await fetchSuperAdminSharedDocumentDetail(documentId);
        setSelectedDocument(payload);
      } catch (err) {
        if (err instanceof AuthError) {
          navigate("/super-admin/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Errore nel caricamento dettaglio.");
      } finally {
        setDetailLoading(false);
      }
    },
    [navigate],
  );

  useEffect(() => {
    if (!profile) return;
    void loadAll();
  }, [profile, loadAll]);

  useEffect(() => {
    if (!selectedDocumentId) {
      setSelectedDocument(null);
      return;
    }
    void loadDetail(selectedDocumentId);
  }, [loadDetail, selectedDocumentId]);

  useEffect(() => {
    if (kind !== "accounting") {
      return;
    }
    setSelectedAssociationIds((current) =>
      current.filter((id) => targets.some((target) => target.id === id && target.accounting_enabled)),
    );
    if (targetMode === "all") {
      setTargetMode("accounting_enabled");
    }
  }, [kind, targetMode, targets]);

  const filteredTargets = useMemo(
    () => targets.filter((target) => kind === "general" || target.accounting_enabled),
    [kind, targets],
  );

  const totals = useMemo(
    () => ({
      total: targets.length,
      accounting: targets.filter((target) => target.accounting_enabled).length,
    }),
    [targets],
  );

  const selectedAssociationId = selectedAssociationIds[0] ?? filteredTargets[0]?.id ?? null;

  useEffect(() => {
    if (targetMode !== "single") {
      return;
    }
    if (selectedAssociationId && selectedAssociationIds[0] !== selectedAssociationId) {
      setSelectedAssociationIds([selectedAssociationId]);
    }
  }, [selectedAssociationId, selectedAssociationIds, targetMode]);

  const toggleAssociation = (associationId: number) => {
    setSelectedAssociationIds((current) =>
      current.includes(associationId)
        ? current.filter((item) => item !== associationId)
        : [...current, associationId],
    );
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setKind("general");
    setTargetMode("all");
    setSelectedAssociationIds([]);
    setFile(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    if (!title.trim()) {
      setError("Inserisci un titolo.");
      return;
    }
    if (!file) {
      setError("Carica un file prima di inviare.");
      return;
    }

    let associationIds: number[] | undefined;
    if (targetMode === "single") {
      associationIds = selectedAssociationId ? [selectedAssociationId] : [];
    } else if (targetMode === "multiple") {
      associationIds = selectedAssociationIds;
    }

    try {
      setSubmitting(true);
      setError("");
      const response = await createSuperAdminSharedDocument({
        title: title.trim(),
        description: description.trim(),
        kind,
        targetMode,
        associationIds,
        file,
      });
      setSuccess("Documento inviato correttamente.");
      resetForm();
      await loadAll();
      setSelectedDocumentId(response.document.id);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/super-admin/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Errore invio documento.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (document: Pick<SuperAdminSharedDocument, "download_url" | "original_filename">) => {
    try {
      setError("");
      await downloadSuperAdminSharedDocument(document);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/super-admin/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Impossibile scaricare il documento.");
    }
  };

  if (loading || !profile) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-64 w-full rounded-3xl" />
        <Skeleton className="h-80 w-full rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Documenti e Contabilita</h2>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            Mantieni separati il workspace documenti generali e il nuovo archivio contabile strutturato.
          </p>
          <div className="mt-4 inline-flex rounded-2xl border border-neutral-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                workspace === "general" ? "bg-neutral-900 text-white" : "text-neutral-600"
              }`}
              onClick={() => setWorkspace("general")}
            >
              Documenti generali
            </button>
            <button
              type="button"
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                workspace === "accounting" ? "bg-neutral-900 text-white" : "text-neutral-600"
              }`}
              onClick={() => setWorkspace("accounting")}
            >
              Contabilita
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="surface px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Associazioni totali</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">{totals.total}</p>
          </div>
          <div className="surface px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Contabilità attiva</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-amber-700">{totals.accounting}</p>
          </div>
        </div>
      </div>

      {workspace === "accounting" ? (
        <SuperAdminAccountingWorkspace onAuthError={() => navigate("/super-admin/login", { replace: true })} />
      ) : (
        <>
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-5 py-4 text-sm font-semibold text-emerald-700">
              {success}
            </div>
          )}

          <section className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <form className="surface overflow-hidden" onSubmit={handleSubmit}>
          <div className="border-b border-neutral-100 px-7 py-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">Nuovo invio</p>
            <h3 className="mt-2 text-xl font-bold tracking-tight text-neutral-900">Distribuzione documenti associazioni</h3>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-neutral-500">
              Carica un documento, scegli la categoria corretta e definisci il perimetro di recapito senza notifiche automatiche.
            </p>
          </div>

          <div className="grid gap-6 px-7 py-7">
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">Titolo</label>
                <input
                  type="text"
                  className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/5"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Bilancio annuale, circolare operativa, verbale..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">File</label>
                <input
                  type="file"
                  className="mt-2 block w-full rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 file:mr-4 file:rounded-xl file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-xs file:font-bold file:uppercase file:tracking-widest file:text-white"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)}
                />
                <p className="mt-2 text-xs font-medium text-neutral-500">
                  Supporto base: PDF, immagini e documenti Office comuni. Max 20 MB.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">Descrizione</label>
              <textarea
                className="mt-2 min-h-28 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-700 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/5"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Contesto utile per l'associazione e note operative."
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-3xl border border-neutral-200 bg-neutral-50/70 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">Tipo documento</p>
                <div className="mt-4 grid gap-3">
                  {[
                    {
                      value: "general" as const,
                      title: "General",
                      description: "Visibile nella tab Documenti di ogni associazione destinataria.",
                    },
                    {
                      value: "accounting" as const,
                      title: "Accounting",
                      description: "Distribuito solo ad associazioni con contabilità attiva.",
                    },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`rounded-2xl border px-4 py-4 transition ${
                        kind === option.value
                          ? "border-brand bg-brand/5 shadow-sm"
                          : "border-neutral-200 bg-white hover:border-neutral-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="kind"
                          checked={kind === option.value}
                          onChange={() => setKind(option.value)}
                          className="mt-1"
                        />
                        <div>
                          <p className="text-sm font-bold text-neutral-900">{option.title}</p>
                          <p className="mt-1 text-xs font-medium leading-relaxed text-neutral-500">{option.description}</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-neutral-200 bg-neutral-50/70 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">Destinatari</p>
                <select
                  className="premium-select mt-4 w-full"
                  value={targetMode}
                  onChange={(event) =>
                    setTargetMode(event.target.value as "single" | "multiple" | "all" | "accounting_enabled")
                  }
                >
                  <option value="single">Una associazione</option>
                  <option value="multiple">Più associazioni</option>
                  <option value="all" disabled={kind === "accounting"}>
                    Tutte le associazioni
                  </option>
                  <option value="accounting_enabled">Solo contabilità attiva</option>
                </select>
                <p className="mt-3 text-xs font-medium leading-relaxed text-neutral-500">
                  {kind === "accounting"
                    ? "I documenti accounting vengono limitati alle sole associazioni con contabilità attiva."
                    : "Puoi inviare un documento operativo a una singola associazione, a un gruppo o a tutto il network."}
                </p>
              </div>
            </div>

            {targetMode === "single" && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">Associazione</label>
                <select
                  className="premium-select mt-2 w-full"
                  value={selectedAssociationId ?? ""}
                  onChange={(event) => setSelectedAssociationIds(event.target.value ? [Number(event.target.value)] : [])}
                >
                  {filteredTargets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}{target.accounting_enabled ? " · contabilità" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {targetMode === "multiple" && (
              <div className="rounded-3xl border border-neutral-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">Selezione multipla</p>
                    <p className="mt-1 text-sm font-medium text-neutral-500">
                      Seleziona una o più associazioni da includere nell'invio.
                    </p>
                  </div>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    {selectedAssociationIds.length} selezionate
                  </span>
                </div>
                <div className="mt-4 grid max-h-72 gap-3 overflow-auto pr-2 sm:grid-cols-2">
                  {filteredTargets.map((target) => (
                    <label
                      key={target.id}
                      className={`rounded-2xl border px-4 py-3 transition ${
                        selectedAssociationIds.includes(target.id)
                          ? "border-brand bg-brand/5"
                          : "border-neutral-200 bg-neutral-50/60 hover:border-neutral-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedAssociationIds.includes(target.id)}
                          onChange={() => toggleAssociation(target.id)}
                          className="mt-1"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-neutral-900">{target.name}</p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                            {target.slug}
                            {target.accounting_enabled ? " · contabilita attiva" : ""}
                          </p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {(targetMode === "all" || targetMode === "accounting_enabled") && (
              <div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50/60 px-5 py-4 text-sm font-semibold text-neutral-600">
                {targetMode === "all"
                  ? `Invio previsto a tutte le associazioni attive in archivio: ${totals.total}.`
                  : `Invio previsto solo alle associazioni con contabilita attiva: ${totals.accounting}.`}
              </div>
            )}

            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Invio in corso..." : "Invia documento"}
              </button>
            </div>
          </div>
        </form>

        <aside className="surface overflow-hidden">
          <div className="border-b border-neutral-100 px-6 py-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">Dettaglio invio</p>
            <h3 className="mt-2 text-lg font-bold tracking-tight text-neutral-900">Selezione archivio</h3>
          </div>
          <div className="px-6 py-6">
            {detailLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-40 w-full rounded-2xl" />
              </div>
            ) : selectedDocument ? (
              <div className="space-y-5">
                <div>
                  <div className={`inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ring-1 ring-inset ${kindBadgeClass(selectedDocument.kind)}`}>
                    {selectedDocument.kind === "accounting" ? "Accounting" : "General"}
                  </div>
                  <h4 className="mt-3 text-xl font-bold tracking-tight text-neutral-900">{selectedDocument.title}</h4>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-neutral-500">
                    {selectedDocument.description || "Nessuna descrizione aggiuntiva."}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Data invio</p>
                    <p className="mt-2 text-sm font-bold text-neutral-900">{formatDateTime(selectedDocument.created_at)}</p>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Dimensione</p>
                    <p className="mt-2 text-sm font-bold text-neutral-900">{formatBytes(selectedDocument.size_bytes)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-ghost w-full justify-center"
                  onClick={() => void handleDownload(selectedDocument)}
                >
                  Scarica file sorgente
                </button>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">Destinatari</p>
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                      {selectedDocument.recipient_count}
                    </span>
                  </div>
                  <div className="mt-3 max-h-72 space-y-3 overflow-auto pr-1">
                    {(selectedDocument.recipients ?? []).map((recipient) => (
                      <div key={recipient.id} className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-neutral-900">{recipient.name}</p>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                              {recipient.slug}
                            </p>
                          </div>
                          {recipient.accounting_enabled && (
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                              Accounting
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm font-medium text-neutral-500">Seleziona un invio dall'archivio per vedere i destinatari.</p>
            )}
          </div>
        </aside>
      </section>

      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-7 py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">Archivio</p>
            <h3 className="mt-2 text-lg font-bold tracking-tight text-neutral-900">Invii registrati</h3>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            {documents.length} record
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/50">
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Titolo</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Tipo</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Data invio</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Destinatari</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center text-sm font-medium text-neutral-400">
                    Nessun documento inviato.
                  </td>
                </tr>
              ) : (
                documents.map((document) => (
                  <tr
                    key={document.id}
                    className={`transition hover:bg-neutral-50/60 ${
                      selectedDocumentId === document.id ? "bg-brand/5" : ""
                    }`}
                  >
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        className="text-left"
                        onClick={() => setSelectedDocumentId(document.id)}
                      >
                        <p className="text-sm font-bold text-neutral-900">{document.title}</p>
                        <p className="mt-1 text-xs font-medium text-neutral-500">{document.original_filename}</p>
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ring-1 ring-inset ${kindBadgeClass(document.kind)}`}>
                        {document.kind}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-neutral-600">{formatDateTime(document.created_at)}</td>
                    <td className="px-5 py-4 text-sm font-bold text-neutral-900">{document.recipient_count}</td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        className="btn-ghost !px-3 !py-1.5 !text-[10px] font-bold uppercase tracking-widest"
                        onClick={() => void handleDownload(document)}
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
        </>
      )}
    </div>
  );
};

export default SuperAdminDocuments;
