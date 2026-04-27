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
import {
  SuperAdminActionButton,
  SuperAdminKpiCard,
  SuperAdminPageHeader,
  SuperAdminTabs,
} from "./components/SuperAdminPrimitives";

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
    ? "bg-amber-50 text-amber-700 ring-amber-200"
    : "bg-sky-50 text-sky-700 ring-sky-200";

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

  const docStats = useMemo(
    () => ({
      total: documents.length,
      accounting: documents.filter((document) => document.kind === "accounting").length,
      general: documents.filter((document) => document.kind !== "accounting").length,
      recipients: documents.reduce((sum, document) => sum + (document.recipient_count || 0), 0),
      covered: new Set(
        documents.flatMap((document) => (document.recipients ?? document.recipient_preview ?? []).map((recipient) => recipient.id)),
      ).size,
    }),
    [documents],
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
      setSuccess("");
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
      
      // Auto dismiss success
      setTimeout(() => setSuccess(""), 5000);
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
    <div className="sa-page">
      <SuperAdminPageHeader
        icon="documents"
        eyebrow="Governance"
        title="Documenti"
        subtitle="Centro documentale per inviare, archiviare e consultare file contabili e amministrativi per le associazioni."
        actions={
          workspace === "general" ? (
            <SuperAdminActionButton tone="primary" icon="upload" onClick={() => document.getElementById("super-admin-document-title")?.focus()}>
              Nuovo invio
            </SuperAdminActionButton>
          ) : null
        }
      />

      <SuperAdminTabs
        active={workspace}
        onSelect={(key) => setWorkspace(key as "general" | "accounting")}
        items={[
          { key: "general", label: "Documenti", icon: "documents" },
          { key: "accounting", label: "Contabilita", icon: "wallet" },
        ]}
      />

      <section className="sa-kpi-grid">
        <SuperAdminKpiCard label="Documenti totali" value={docStats.total} hint="Archivio invii" icon="document" tone="success" />
        <SuperAdminKpiCard label="Documenti generali" value={docStats.general} hint="Comunicazioni non contabili" icon="documents" tone="info" />
        <SuperAdminKpiCard label="Categorie contabili" value={docStats.accounting} hint="Invii accounting" icon="wallet" tone="warning" />
        <SuperAdminKpiCard label="Invii cumulati" value={docStats.recipients} hint="Destinatari documenti" icon="send" tone="success" />
        <SuperAdminKpiCard label="Associazioni coperte" value={docStats.covered || totals.total} hint={`${totals.accounting} con contabilita attiva`} icon="users" tone="purple" />
      </section>

      {/* Header & Workspace Switcher */}
      <div className="hidden">
        <div className="max-w-xl">
          <h2 className="text-3xl font-bold tracking-tight text-neutral-900">Documenti e Contabilità</h2>
          <p className="mt-2 text-sm font-medium text-neutral-500">
            Gestisci la distribuzione dei documenti verso le associazioni e l'archivio contabile.
          </p>
          
          <div className="mt-6 inline-flex rounded-xl border border-neutral-200 bg-neutral-100/50 p-1">
            <button
              type="button"
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all duration-200 ${
                workspace === "general" ? "bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-200" : "text-neutral-500 hover:text-neutral-700"
              }`}
              onClick={() => setWorkspace("general")}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              Documenti generali
            </button>
            <button
              type="button"
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all duration-200 ${
                workspace === "accounting" ? "bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-200" : "text-neutral-500 hover:text-neutral-700"
              }`}
              onClick={() => setWorkspace("accounting")}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
              </svg>
              Contabilità
            </button>
          </div>
        </div>
        
        <div className="flex gap-4">
          <div className="rounded-2xl border border-neutral-200 bg-white px-5 py-4 min-w-[140px] shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Associazioni Attive</p>
            <p className="mt-1 text-2xl font-black text-neutral-900">{totals.total}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 min-w-[140px] shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">Contabilità Attiva</p>
            <p className="mt-1 text-2xl font-black text-amber-900">{totals.accounting}</p>
          </div>
        </div>
      </div>

      {workspace === "accounting" ? (
        <SuperAdminAccountingWorkspace onAuthError={() => navigate("/super-admin/login", { replace: true })} />
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-800 flex items-center gap-3">
              <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-medium text-emerald-800 flex items-center gap-3">
              <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              {success}
            </div>
          )}

          <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
            {/* New Document Form */}
            <form className="rounded-3xl border border-neutral-200 bg-white shadow-sm overflow-hidden flex flex-col" onSubmit={handleSubmit}>
              <div className="border-b border-neutral-100 px-8 py-6 bg-neutral-50/50">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-brand/10 text-brand flex items-center justify-center">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold tracking-tight text-neutral-900">Nuovo invio</h3>
                </div>
              </div>

              <div className="p-8 space-y-8 flex-1">
                {/* File Upload Area */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3">File Documento</label>
                  <div className={`relative flex flex-col items-center justify-center w-full rounded-2xl border-2 border-dashed transition-colors ${file ? 'border-brand bg-brand/5' : 'border-neutral-300 bg-neutral-50 hover:bg-neutral-100'} p-8 text-center`}>
                    <input
                      type="file"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)}
                    />
                    <div className={`rounded-full p-4 mb-3 ${file ? 'bg-brand/10 text-brand' : 'bg-neutral-200/50 text-neutral-400'}`}>
                      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    {file ? (
                      <>
                        <p className="text-sm font-bold text-neutral-900">{file.name}</p>
                        <p className="mt-1 text-xs font-medium text-brand">File selezionato pronto per l'invio</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-neutral-900">Trascina un file o clicca per selezionare</p>
                        <p className="mt-1 text-xs font-medium text-neutral-500">Supporta PDF, immagini e Office (Max 20MB)</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Titolo</label>
                    <input
                      id="super-admin-document-title"
                      type="text"
                      className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Es: Circolare operativa 2024..."
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Descrizione (Opzionale)</label>
                    <textarea
                      className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 min-h-[100px] resize-none"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Aggiungi contesto utile per i destinatari..."
                    />
                  </div>
                </div>

                <div className="border-t border-neutral-100 pt-8">
                  <h4 className="text-sm font-bold text-neutral-900 mb-4">Configurazione invio</h4>
                  
                  <div className="grid gap-6 sm:grid-cols-2">
                    {/* Category Selection */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3">Categoria</label>
                      <div className="space-y-3">
                        <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${kind === 'general' ? 'border-brand bg-brand/5 ring-1 ring-brand/10' : 'border-neutral-200 hover:border-neutral-300'}`}>
                          <input type="radio" name="kind" checked={kind === 'general'} onChange={() => setKind('general')} className="mt-0.5" />
                          <div>
                            <p className="text-sm font-bold text-neutral-900">Documento Generale</p>
                            <p className="text-xs text-neutral-500 mt-1">Visibile a tutte le associazioni nella tab Documenti.</p>
                          </div>
                        </label>
                        <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${kind === 'accounting' ? 'border-brand bg-brand/5 ring-1 ring-brand/10' : 'border-neutral-200 hover:border-neutral-300'}`}>
                          <input type="radio" name="kind" checked={kind === 'accounting'} onChange={() => setKind('accounting')} className="mt-0.5" />
                          <div>
                            <p className="text-sm font-bold text-neutral-900">Documento Contabile</p>
                            <p className="text-xs text-neutral-500 mt-1">Solo per le associazioni con contabilità attiva.</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Targets Selection */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3">Destinatari</label>
                      <select
                        className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 appearance-none"
                        value={targetMode}
                        onChange={(event) => setTargetMode(event.target.value as any)}
                      >
                        <option value="single">Singola associazione</option>
                        <option value="multiple">Selezione multipla</option>
                        <option value="all" disabled={kind === "accounting"}>Tutte le associazioni ({totals.total})</option>
                        <option value="accounting_enabled">Solo contabilità attiva ({totals.accounting})</option>
                      </select>

                      {targetMode === "single" && (
                        <div className="mt-4">
                          <select
                            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 appearance-none"
                            value={selectedAssociationId ?? ""}
                            onChange={(event) => setSelectedAssociationIds(event.target.value ? [Number(event.target.value)] : [])}
                          >
                            {filteredTargets.map((target) => (
                              <option key={target.id} value={target.id}>
                                {target.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {targetMode === "multiple" && (
                        <div className="mt-4 rounded-xl border border-neutral-200 bg-white overflow-hidden">
                          <div className="bg-neutral-50 px-4 py-2 border-b border-neutral-200 flex justify-between items-center">
                            <span className="text-xs font-bold text-neutral-600">Seleziona associazioni</span>
                            <span className="text-[10px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-md">{selectedAssociationIds.length} selezionate</span>
                          </div>
                          <div className="max-h-48 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                            {filteredTargets.map((target) => (
                              <label key={target.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedAssociationIds.includes(target.id)}
                                  onChange={() => toggleAssociation(target.id)}
                                  className="rounded border-neutral-300 text-brand focus:ring-brand"
                                />
                                <span className="text-sm font-medium text-neutral-700 truncate">{target.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-neutral-100 px-8 py-5 bg-neutral-50/50 flex items-center justify-between">
                <span className="text-xs text-neutral-500 font-medium">Controlla i dati prima di inviare.</span>
                <button
                  type="submit"
                  className="rounded-xl bg-neutral-900 px-8 py-3 text-sm font-bold text-white transition hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  disabled={submitting || !file || !title.trim()}
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Invio...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Invia Documento
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Document Detail Aside */}
            <aside className="rounded-3xl border border-neutral-200 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="border-b border-neutral-100 px-6 py-6 bg-neutral-50/50">
                <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-900">Dettaglio Invio</h3>
              </div>
              
              <div className="p-6 flex-1">
                {detailLoading ? (
                  <div className="space-y-6">
                    <Skeleton className="h-8 w-2/3 rounded-lg" />
                    <Skeleton className="h-20 w-full rounded-xl" />
                    <Skeleton className="h-40 w-full rounded-xl" />
                  </div>
                ) : selectedDocument ? (
                  <div className="space-y-6">
                    <div>
                      <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ring-1 ring-inset ${kindBadgeClass(selectedDocument.kind)}`}>
                        {selectedDocument.kind === "accounting" ? "Accounting" : "Generale"}
                      </div>
                      <h4 className="mt-4 text-xl font-bold text-neutral-900">{selectedDocument.title}</h4>
                      <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
                        {selectedDocument.description || "Nessuna descrizione."}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-neutral-50 p-4 border border-neutral-100">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Data</p>
                        <p className="mt-1 text-sm font-semibold text-neutral-900">{formatDateTime(selectedDocument.created_at)}</p>
                      </div>
                      <div className="rounded-xl bg-neutral-50 p-4 border border-neutral-100">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Dimensione</p>
                        <p className="mt-1 text-sm font-semibold text-neutral-900">{formatBytes(selectedDocument.size_bytes)}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="w-full rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50 hover:border-neutral-300 flex items-center justify-center gap-2"
                      onClick={() => void handleDownload(selectedDocument)}
                    >
                      <svg className="h-5 w-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Scarica Originale
                    </button>

                    <div className="border-t border-neutral-100 pt-6">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Destinatari</p>
                        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-600">
                          {selectedDocument.recipient_count}
                        </span>
                      </div>
                      <div className="max-h-64 space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                        {(selectedDocument.recipients ?? []).map((recipient) => (
                          <div key={recipient.id} className="rounded-xl border border-neutral-100 bg-white p-3 hover:border-neutral-200 transition-colors">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-neutral-900">{recipient.name}</p>
                              </div>
                              {recipient.accounting_enabled && (
                                <div className="h-2 w-2 rounded-full bg-amber-400" title="Contabilità attiva" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-neutral-400">
                    <svg className="h-12 w-12 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm font-medium">Seleziona un documento dall'archivio<br/>per vederne i dettagli.</p>
                  </div>
                )}
              </div>
            </aside>
          </div>

          {/* Archive Table */}
          <section className="rounded-3xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-neutral-100 px-8 py-6 bg-neutral-50/50">
              <h3 className="text-xl font-bold tracking-tight text-neutral-900">Archivio Invii</h3>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-neutral-600 shadow-sm ring-1 ring-neutral-200">
                {documents.length} documenti
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 bg-white">
                    <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Documento</th>
                    <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400 w-32">Tipo</th>
                    <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400 w-40">Data invio</th>
                    <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400 w-32 text-center">Destinatari</th>
                    <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400 w-24 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-16 text-center text-sm font-medium text-neutral-400">
                        Nessun documento inviato finora.
                      </td>
                    </tr>
                  ) : (
                    documents.map((document) => (
                      <tr
                        key={document.id}
                        className={`transition-colors group cursor-pointer ${
                          selectedDocumentId === document.id ? "bg-brand/5" : "hover:bg-neutral-50/80"
                        }`}
                        onClick={() => setSelectedDocumentId(document.id)}
                      >
                        <td className="px-8 py-4">
                          <p className={`text-sm font-bold transition-colors ${selectedDocumentId === document.id ? "text-brand" : "text-neutral-900 group-hover:text-brand"}`}>
                            {document.title}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500 truncate max-w-md">{document.original_filename}</p>
                        </td>
                        <td className="px-8 py-4">
                          <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-widest ring-1 ring-inset ${kindBadgeClass(document.kind)}`}>
                            {document.kind}
                          </span>
                        </td>
                        <td className="px-8 py-4 text-sm font-medium text-neutral-600">
                          {formatDateTime(document.created_at)}
                        </td>
                        <td className="px-8 py-4 text-center">
                          <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-neutral-100 px-2 text-xs font-bold text-neutral-700">
                            {document.recipient_count}
                          </span>
                        </td>
                        <td className="px-8 py-4 text-right">
                          <button
                            type="button"
                            className="p-2 text-neutral-400 hover:text-brand hover:bg-brand/5 rounded-lg transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDownload(document);
                            }}
                            title="Scarica documento"
                          >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDocuments;
