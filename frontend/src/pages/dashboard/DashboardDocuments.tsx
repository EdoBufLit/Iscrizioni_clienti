import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AuthError,
  downloadMemberOrganizationStatute,
  fetchMemberDocuments,
  fetchMemberOrganizationStatute,
  resubmitMemberDocument,
  type MemberDocumentItem,
  type MemberOrganizationStatuteResponse,
} from "../../lib/api";
import { useToast } from "../../components/ui/ToastProvider";

const DOC_LABELS: Record<string, string> = {
  identity: "Documento Identità",
  fiscal_code: "Codice Fiscale",
};

const STATUS_META: Record<string, { label: string; tone: string }> = {
  approved: {
    label: "Approvato",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-200/50",
  },
  pending: {
    label: "In revisione",
    tone: "bg-amber-50 text-amber-700 ring-amber-200/50",
  },
  uploaded: {
    label: "In revisione",
    tone: "bg-amber-50 text-amber-700 ring-amber-200/50",
  },
  rejected: {
    label: "Rigettato",
    tone: "bg-red-50 text-red-700 ring-red-200/50",
  },
};

const formatBytes = (bytes?: number | null) => {
  if (!bytes) return null;
  const kb = 1024;
  if (bytes < kb) return `${bytes} B`;
  const mb = kb * 1024;
  if (bytes < mb) return `${(bytes / kb).toFixed(1)} KB`;
  return `${(bytes / mb).toFixed(1)} MB`;
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("it-IT");
};

const normalizeStatus = (status: string) =>
  status === "uploaded" ? "pending" : status;

const DashboardDocuments = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<MemberDocumentItem[]>([]);
  const [requiredTypes, setRequiredTypes] = useState<string[]>([
    "identity",
    "fiscal_code",
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [statute, setStatute] = useState<MemberOrganizationStatuteResponse | null>(null);
  const [statuteLoading, setStatuteLoading] = useState(true);
  const [statuteError, setStatuteError] = useState<string | null>(null);
  const [statuteDownloading, setStatuteDownloading] = useState(false);
  const { showToast } = useToast();

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setStatuteLoading(true);
    setError(null);
    setStatuteError(null);
    try {
      const [documentsResult, statuteResult] = await Promise.allSettled([
        fetchMemberDocuments(),
        fetchMemberOrganizationStatute(),
      ]);

      if (documentsResult.status === "rejected") {
        throw documentsResult.reason;
      }

      const data = documentsResult.value;
      setItems(data.items ?? []);
      setRequiredTypes(data.required_types?.length ? data.required_types : ["identity", "fiscal_code"]);

      if (statuteResult.status === "fulfilled") {
        setStatute(statuteResult.value);
      } else if (statuteResult.reason instanceof AuthError) {
        navigate("/login", { replace: true });
        return;
      } else {
        setStatute({ available: false });
        setStatuteError(
          statuteResult.reason instanceof Error
            ? statuteResult.reason.message
            : "Errore nel caricamento dello statuto",
        );
      }
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Errore nel caricamento documenti");
    } finally {
      setLoading(false);
      setStatuteLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const docsByType = useMemo(() => {
    const map = new Map<string, MemberDocumentItem[]>();
    items.forEach((doc) => {
      const list = map.get(doc.type) ?? [];
      list.push(doc);
      map.set(doc.type, list);
    });
    map.forEach((docs, key) => {
      docs.sort((a, b) => {
        const aTime = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0;
        const bTime = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0;
        return bTime - aTime;
      });
      map.set(key, docs);
    });
    return map;
  }, [items]);

  const allTypes = useMemo(() => {
    const set = new Set<string>(requiredTypes);
    items.forEach((doc) => set.add(doc.type));
    return Array.from(set);
  }, [items, requiredTypes]);

  const handleResubmit = async (docId: number, file?: File) => {
    if (!file) return;
    setUploadingId(docId);
    try {
      await resubmitMemberDocument(docId, file);
      showToast({
        tone: "success",
        title: "Documenti",
        message: "Documento reinviato. Stato aggiornato a In revisione.",
      });
      await loadDocuments();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore durante il reinvio";
      showToast({ tone: "error", title: "Documenti", message });
    } finally {
      setUploadingId(null);
    }
  };

  const handleStatuteDownload = async () => {
    if (!statute?.available) return;
    setStatuteError(null);
    setStatuteDownloading(true);
    try {
      await downloadMemberOrganizationStatute({
        url: statute.download_url ?? "/api/me/organization/statute/download",
        filename: statute.filename ?? "statuto.pdf",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/login", { replace: true });
        return;
      }
      const message = err instanceof Error ? err.message : "Impossibile scaricare lo statuto";
      setStatuteError(message);
      showToast({ tone: "error", title: "Statuto", message });
    } finally {
      setStatuteDownloading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Documentazione</h1>
        <p className="mt-1 text-sm font-medium text-neutral-500">
          Gestisci i tuoi documenti ufficiali e consulta lo statuto dell'associazione.
        </p>
      </div>

      <div className="surface p-8 relative overflow-hidden bg-white/40">
        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-brand/5 text-brand flex items-center justify-center shadow-sm">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-neutral-900 tracking-tight">Statuto Associativo</h3>
                <p className="mt-1 text-sm font-medium text-neutral-500">
                  Documento ufficiale depositato della tua associazione di riferimento.
                </p>
              </div>
            </div>
          </div>
          {!(loading || statuteLoading) && statute?.available && (
            <button
              type="button"
              className="btn-primary group"
              onClick={handleStatuteDownload}
              disabled={statuteDownloading}
            >
              <svg className="mr-2 h-4 w-4 transition-transform group-hover:translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {statuteDownloading ? "In corso..." : "Download PDF"}
            </button>
          )}
        </div>

        <div className="mt-8 rounded-2xl border border-neutral-100 bg-white/80 p-5 flex items-center justify-between group transition-all hover:border-brand/20">
          {loading || statuteLoading ? (
            <div className="flex items-center gap-3 animate-pulse">
              <div className="h-10 w-10 rounded-lg bg-neutral-100" />
              <div className="space-y-2">
                <div className="h-3 w-32 bg-neutral-100 rounded" />
                <div className="h-2 w-20 bg-neutral-50 rounded" />
              </div>
            </div>
          ) : statute?.available ? (
            <>
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-neutral-900 group-hover:text-brand transition-colors">{statute.filename || "Statuto.pdf"}</p>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-0.5">
                    {statute.mime_type?.split('/')[1]?.toUpperCase() || "PDF"} Document <span className="mx-1">•</span> Verificato
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 uppercase tracking-tighter ring-1 ring-inset ring-emerald-200/50">
                Disponibile
              </span>
            </>
          ) : (
            <div className="flex items-center gap-3 text-neutral-400 py-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm font-medium italic">Statuto non ancora caricato dall'associazione</p>
            </div>
          )}
        </div>
        
        {statuteError && (
          <p className="mt-4 text-xs font-bold text-red-500 flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-red-500" /> {statuteError}
          </p>
        )}
        
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand/5 blur-3xl pointer-events-none" />
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-400">Certificazioni Personali</h3>
          <div className="flex gap-2">
            {allTypes.map((type) => {
              const latest = docsByType.get(type)?.[0];
              const status = latest ? normalizeStatus(latest.status) : "missing";
              return (
                <div key={type} className={`h-2 w-8 rounded-full ${status === 'approved' ? 'bg-emerald-500' : status === 'rejected' ? 'bg-red-500' : 'bg-neutral-200'}`} title={`${DOC_LABELS[type] || type}: ${status}`} />
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="grid gap-6">
            {[0, 1].map(i => (
              <div key={i} className="surface p-7 animate-pulse">
                <div className="flex justify-between">
                  <div className="h-6 w-48 bg-neutral-100 rounded" />
                  <div className="h-6 w-20 bg-neutral-100 rounded-full" />
                </div>
                <div className="mt-6 h-12 bg-neutral-50 rounded-xl" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="surface p-8 text-center bg-red-50/30 border-red-100">
            <p className="text-sm font-bold text-red-600">{error}</p>
            <button onClick={() => void loadDocuments()} className="btn-ghost mt-4 !text-red-700 !border-red-200">
              Riprova
            </button>
          </div>
        ) : allTypes.length === 0 ? (
          <div className="surface p-12 text-center bg-neutral-50/50 border-dashed border-2">
            <p className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Nessun documento richiesto</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {allTypes.map((type) => {
              const docs = docsByType.get(type) ?? [];
              const latest = docs.length ? docs[0] : undefined;
              const normalizedStatus = latest ? normalizeStatus(latest.status) : "missing";
              const statusMeta =
                normalizedStatus === "missing"
                  ? { label: "Da caricare", tone: "bg-neutral-100 text-neutral-500 ring-neutral-200" }
                  : STATUS_META[normalizedStatus] ?? { label: normalizedStatus, tone: "bg-neutral-100 text-neutral-500 ring-neutral-200" };

              return (
                <div key={type} className="surface p-7 group">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`h-12 w-12 rounded-xl flex items-center justify-center transition-colors ${normalizedStatus === 'approved' ? 'bg-emerald-50 text-emerald-600' : normalizedStatus === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-neutral-50 text-neutral-400 group-hover:bg-brand/5 group-hover:text-brand'}`}>
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-neutral-900 group-hover:text-brand transition-colors">
                          {DOC_LABELS[type] ?? type}
                        </h2>
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-0.5">
                          {latest ? `Upload: ${formatDate(latest.uploaded_at)}` : "Configurazione necessaria"}
                        </p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-tighter ring-1 ring-inset ${statusMeta.tone}`}>
                      {statusMeta.label}
                    </span>
                  </div>

                  {latest && normalizedStatus !== 'rejected' && (
                    <div className="mt-6 rounded-2xl border border-neutral-100 bg-neutral-50/30 p-4 flex items-center justify-between group/file">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-neutral-700 truncate">{latest.filename}</p>
                        <p className="text-[10px] font-bold text-neutral-400 mt-0.5 uppercase tracking-widest">
                          {formatBytes(latest.size_bytes) || "File verificato"}
                        </p>
                      </div>
                      <a
                        href={latest.download_url}
                        className="btn-ghost !px-4 !py-2 !text-[10px] font-bold uppercase tracking-widest shadow-sm hover:!bg-brand hover:!text-white transition-all"
                      >
                        Vedi File
                      </a>
                    </div>
                  )}

                  {normalizedStatus === "rejected" && latest && (
                    <div className="mt-6 rounded-2xl border-2 border-red-100 bg-red-50/30 p-6 animate-in zoom-in-95 duration-300" data-tour="member-document-rejected">
                      <div className="flex items-start gap-4">
                        <div className="h-10 w-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-red-900">Documento Rigettato</p>
                          <p className="mt-1 text-sm font-medium text-red-700/80 leading-relaxed">
                            {latest.rejection_note
                              ? `Nota amministrativa: "${latest.rejection_note}"`
                              : "Il file non è conforme agli standard richiesti. Carica una nuova versione corretta."}
                          </p>
                          <div className="mt-5">
                            <label className="btn-primary !bg-red-600 hover:!bg-red-700 shadow-red-200 cursor-pointer inline-flex items-center" data-tour="member-upload-document">
                              <input
                                type="file"
                                className="sr-only"
                                accept="application/pdf,image/*"
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.currentTarget.value = "";
                                  handleResubmit(latest.id, file);
                                }}
                                disabled={uploadingId === latest.id}
                              />
                              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                              </svg>
                              {uploadingId === latest.id ? "Invio in corso..." : "Upload Nuova Versione"}
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardDocuments;
