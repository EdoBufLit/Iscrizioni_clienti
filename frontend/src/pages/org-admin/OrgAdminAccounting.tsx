import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import AccountingDocumentPreviewModal from "../../components/accounting/AccountingDocumentPreviewModal";
import ModalShell from "../../components/ui/ModalShell";
import Skeleton from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/ToastProvider";
import {
  AuthError,
  createOrgAdminAccountingShareLink,
  downloadOrgAdminAccountingDocument,
  fetchOrgAdminAccountingArchive,
  fetchOrgAdminAccountingShareLinks,
  revokeOrgAdminAccountingShareLink,
  type AccountingShareLink,
  type OrgAdminAccountingArchiveFolder,
  type OrgAdminAccountingDocument,
} from "../../lib/api";
import { useOrgAdmin } from "./OrgAdminLayout";

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

const DocumentIcon = ({ mimeType }: { mimeType: string | null }) => {
  if (mimeType === "application/pdf") {
    return (
      <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  if (mimeType?.includes("sheet") || mimeType?.includes("excel") || mimeType?.includes("csv")) {
    return (
      <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
};

const OrgAdminAccounting = () => {
  const navigate = useNavigate();
  const { admin, loading: adminLoading } = useOrgAdmin();
  const { showToast } = useToast();

  const [items, setItems] = useState<OrgAdminAccountingArchiveFolder[]>([]);
  const [folderOptions, setFolderOptions] = useState<Array<{ id: number; name: string; year: number | null; slug: string }>>([]);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ id: number; name: string; code: string; is_system: boolean }>>([]);
  const [query, setQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<number | "">("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<number[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<number[]>([]);
  const [previewDocument, setPreviewDocument] = useState<OrgAdminAccountingDocument | null>(null);
  const [shareDocument, setShareDocument] = useState<OrgAdminAccountingDocument | null>(null);
  const [shareLinks, setShareLinks] = useState<AccountingShareLink[]>([]);
  const [shareExpiry, setShareExpiry] = useState<"7" | "30" | "never">("30");
  const [sharing, setSharing] = useState(false);
  const [revokingShareId, setRevokingShareId] = useState<number | null>(null);

  const deferredQuery = useDeferredValue(query.trim());

  useEffect(() => {
    if (adminLoading) return;
    if (!admin) return;
    if (!admin.organization?.accounting_enabled) {
      navigate("/org-admin", { replace: true });
      return;
    }

    setLoading(true);
    fetchOrgAdminAccountingArchive({
      q: deferredQuery || undefined,
      folderId: selectedFolderId === "" ? undefined : selectedFolderId,
      categoryId: selectedCategoryId === "" ? undefined : selectedCategoryId,
    })
      .then((payload) => {
        setItems(payload.items);
        setFolderOptions(payload.filters.folders);
        setCategoryOptions(payload.filters.categories);
        setTotalDocuments(payload.total_documents);
        setError("");
        setExpandedFolders((current) =>
          current.length > 0 ? current : payload.items.map((item) => item.id),
        );
        setExpandedCategories((current) =>
          current.length > 0
            ? current
            : payload.items.flatMap((item) => item.categories.map((category) => category.id)),
        );
      })
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Errore nel caricamento archivio contabile.");
      })
      .finally(() => setLoading(false));
  }, [admin, adminLoading, deferredQuery, navigate, selectedCategoryId, selectedFolderId]);

  const flatDocuments = useMemo(
    () =>
      items.flatMap((folder) =>
        folder.categories.flatMap((category) => category.documents),
      ),
    [items],
  );

  useEffect(() => {
    if (!shareDocument) {
      setShareLinks([]);
      return;
    }
    setShareLinks(shareDocument.share_links ?? []);
  }, [shareDocument]);

  const toggleFolder = (folderId: number) => {
    setExpandedFolders((current) =>
      current.includes(folderId)
        ? current.filter((item) => item !== folderId)
        : [...current, folderId],
    );
  };

  const toggleCategory = (categoryId: number) => {
    setExpandedCategories((current) =>
      current.includes(categoryId)
        ? current.filter((item) => item !== categoryId)
        : [...current, categoryId],
    );
  };

  const handleDownload = async (document: OrgAdminAccountingDocument) => {
    try {
      setDownloadingId(document.id);
      setError("");
      await downloadOrgAdminAccountingDocument(document);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Impossibile scaricare il documento.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOpenPreview = (document: OrgAdminAccountingDocument) => {
    if (!document.preview_available || !document.preview_url) {
      showToast({
        title: "Preview non disponibile",
        message: "Questo file non può essere mostrato inline. Usa Apri o Scarica.",
        tone: "info",
      });
      return;
    }
    setPreviewDocument(document);
  };

  const reloadShareLinks = async (documentId: number) => {
    const payload = await fetchOrgAdminAccountingShareLinks(documentId);
    setShareLinks(payload.items);
    setItems((current) =>
      current.map((folder) => ({
        ...folder,
        categories: folder.categories.map((category) => ({
          ...category,
          documents: category.documents.map((document) =>
            document.id === documentId ? { ...document, share_links: payload.items } : document,
          ),
        })),
      })),
    );
  };

  const handleCreateShareLink = async () => {
    if (!shareDocument || sharing) return;
    try {
      setSharing(true);
      const expiresInDays =
        shareExpiry === "never" ? null : Number.parseInt(shareExpiry, 10);
      const payload = await createOrgAdminAccountingShareLink(shareDocument.id, {
        expiresInDays,
      });
      await reloadShareLinks(shareDocument.id);
      await navigator.clipboard.writeText(payload.share_link.url);
      showToast({
        title: "Link creato",
        message: "Link copiato negli appunti.",
        tone: "success",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      showToast({
        title: "Condivisione",
        message: err instanceof Error ? err.message : "Impossibile creare il link.",
        tone: "error",
      });
    } finally {
      setSharing(false);
    }
  };

  const handleRevokeShareLink = async (shareLinkId: number) => {
    if (!shareDocument || revokingShareId === shareLinkId) return;
    try {
      setRevokingShareId(shareLinkId);
      await revokeOrgAdminAccountingShareLink(shareLinkId);
      await reloadShareLinks(shareDocument.id);
      showToast({
        title: "Link revocato",
        message: "La condivisione non ? più valida.",
        tone: "success",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      showToast({
        title: "Revoca link",
        message: err instanceof Error ? err.message : "Impossibile revocare il link.",
        tone: "error",
      });
    } finally {
      setRevokingShareId(null);
    }
  };

  const shareSummary = useMemo(() => {
    if (!shareDocument) return null;
    return flatDocuments.find((document) => document.id === shareDocument.id) ?? shareDocument;
  }, [flatDocuments, shareDocument]);

  if (adminLoading || loading) {
    return (
      <div className="container-shell py-10 space-y-8">
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-24 w-full rounded-[1.25rem]" />
        <Skeleton className="h-80 w-full rounded-[1.25rem]" />
      </div>
    );
  }

  return (
    <div className="container-shell py-10 space-y-8">
      {/* Header and Filters in a unified clean card */}
      <section className="rounded-[1.25rem] border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-8 py-7 border-b border-neutral-100 bg-gradient-to-r from-neutral-50 to-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-brand">Contabilità</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-neutral-900">Archivio contabile</h2>
              <p className="mt-2 text-sm font-medium text-neutral-500 max-w-2xl">
                Consulta e condividi i documenti contabili suddivisi per anno e categoria.
              </p>
            </div>
            <div className="inline-flex flex-col items-end">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-bold text-emerald-800">{totalDocuments} Documenti attivi</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-white">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-neutral-400">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                </svg>
              </div>
              <input
                type="search"
                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50/50 pl-11 pr-4 py-3 text-sm font-medium text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 focus:bg-white"
                placeholder="Cerca per titolo, file o descrizione..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="lg:w-64">
              <select
                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50/50 px-4 py-3 text-sm font-medium text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 focus:bg-white appearance-none"
                value={selectedFolderId}
                onChange={(event) => setSelectedFolderId(event.target.value ? Number(event.target.value) : "")}
              >
                <option value="">Tutti gli anni / cartelle</option>
                {folderOptions.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </select>
            </div>
            <div className="lg:w-64">
              <select
                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50/50 px-4 py-3 text-sm font-medium text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 focus:bg-white appearance-none"
                value={selectedCategoryId}
                onChange={(event) => setSelectedCategoryId(event.target.value ? Number(event.target.value) : "")}
              >
                <option value="">Tutte le categorie</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-800 flex items-center gap-3">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Main Content Area */}
      {items.length === 0 ? (
        <div className="rounded-[1.25rem] ring-1 ring-inset ring-slate-200/60 border-dashed bg-slate-50 px-6 py-20 text-center">
          <div className="mx-auto w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4 text-neutral-400">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-lg font-bold text-neutral-900">Nessun documento trovato</p>
          <p className="mt-2 text-sm font-medium text-neutral-500">
            Modifica i filtri di ricerca o attendi nuovi caricamenti.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {items.map((folder) => {
            const folderOpen = expandedFolders.includes(folder.id);
            return (
              <section key={folder.id} className="rounded-[1.25rem] border border-neutral-200 bg-white shadow-sm overflow-hidden">
                {/* Folder Header */}
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-8 py-5 bg-neutral-50/50 hover:bg-neutral-50 transition-colors"
                  onClick={() => toggleFolder(folder.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-neutral-900">{folder.name}</h3>
                        {folder.year && (
                          <span className="rounded-md bg-neutral-200/60 px-2 py-0.5 text-xs font-bold text-neutral-700">
                            {folder.year}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-neutral-500 mt-0.5">
                        {folder.document_count} documenti in {folder.categories.length} categorie
                      </p>
                    </div>
                  </div>
                  <div className={`transform transition-transform duration-200 ${folderOpen ? 'rotate-180' : ''}`}>
                    <svg className="h-5 w-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </button>

                {/* Folder Content */}
                {folderOpen && (
                  <div className="border-t border-neutral-100 divide-y divide-neutral-100">
                    {folder.categories.map((category) => {
                      const categoryOpen = expandedCategories.includes(category.id);
                      return (
                        <div key={category.id} className="bg-white">
                          <button
                            type="button"
                            className="flex w-full items-center justify-between px-8 py-4 hover:bg-neutral-50/50 transition-colors"
                            onClick={() => toggleCategory(category.id)}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 w-24 text-left">
                                Categoria
                              </span>
                              <h4 className="text-sm font-bold text-neutral-900">{category.name}</h4>
                              <span className="text-xs font-medium text-neutral-400">({category.documents.length})</span>
                            </div>
                            <svg className={`h-4 w-4 text-neutral-400 transform transition-transform ${categoryOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>

                          {categoryOpen && (
                            <div className="px-8 pb-6">
                              <div className="border border-neutral-200 rounded-2xl overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-neutral-50/80 border-b border-neutral-200">
                                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-neutral-500">Documento</th>
                                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-neutral-500 w-48">Dettagli</th>
                                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-neutral-500 w-32 text-right">Azioni</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-neutral-100 bg-white">
                                    {category.documents.map((document) => (
                                      <tr key={document.id} className="hover:bg-neutral-50/30 transition-colors group">
                                        <td className="px-5 py-4">
                                          <div className="flex items-start gap-3">
                                            <div className="mt-1">
                                              <DocumentIcon mimeType={document.mime_type} />
                                            </div>
                                            <div>
                                              <p className="text-sm font-bold text-neutral-900 group-hover:text-brand transition-colors cursor-pointer" onClick={() => handleOpenPreview(document)}>
                                                {document.title}
                                              </p>
                                              <p className="text-xs text-neutral-500 mt-1 max-w-lg truncate">
                                                {document.description || document.original_filename}
                                              </p>
                                              {document.is_share_enabled && (
                                                <span className="inline-flex items-center gap-1 mt-2 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                                                  Condivisibile
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-5 py-4 align-top">
                                          <div className="text-xs font-medium text-neutral-600 space-y-1">
                                            <p>{formatDateTime(document.created_at)}</p>
                                            <p className="text-neutral-400">{formatBytes(document.file_size)}</p>
                                          </div>
                                        </td>
                                        <td className="px-5 py-4 align-top text-right">
                                          <div className="flex items-center justify-end gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                                            {document.preview_available && (
                                              <button
                                                type="button"
                                                onClick={() => handleOpenPreview(document)}
                                                className="p-2 text-neutral-500 hover:text-brand hover:bg-brand/5 rounded-lg transition-colors"
                                                title="Visualizza"
                                              >
                                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => void handleDownload(document)}
                                              className="p-2 text-neutral-500 hover:text-brand hover:bg-brand/5 rounded-lg transition-colors"
                                              disabled={downloadingId === document.id}
                                              title="Scarica"
                                            >
                                              {downloadingId === document.id ? (
                                                <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                              ) : (
                                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                </svg>
                                              )}
                                            </button>
                                            {document.is_share_enabled && (
                                              <button
                                                type="button"
                                                onClick={() => setShareDocument(document)}
                                                className="p-2 text-neutral-500 hover:text-brand hover:bg-brand/5 rounded-lg transition-colors"
                                                title="Condividi"
                                              >
                                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                                </svg>
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <AccountingDocumentPreviewModal
        document={previewDocument}
        open={previewDocument !== null}
        onClose={() => setPreviewDocument(null)}
        onDownload={(document) => handleDownload(document)}
        onOpenInNewTab={(document) => {
          window.open(document.open_url, "_blank", "noopener,noreferrer");
        }}
      />

      <ModalShell
        open={shareDocument !== null}
        title={shareSummary?.title ?? "Condividi documento"}
        description="Genera link firmati, opzionalmente con scadenza, e revoca quelli attivi quando necessario."
        sizeClassName="max-w-3xl"
        onClose={() => setShareDocument(null)}
      >
        {shareSummary ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm font-bold text-neutral-900">{shareSummary.title}</p>
              <p className="mt-1 text-xs font-medium text-neutral-500">
                {shareSummary.description || "Documento contabile condivisibile."}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Scadenza</label>
                <select
                  className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  value={shareExpiry}
                  onChange={(event) => setShareExpiry(event.target.value as "7" | "30" | "never")}
                >
                  <option value="7">7 giorni</option>
                  <option value="30">30 giorni</option>
                  <option value="never">Nessuna scadenza</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  className="w-full sm:w-auto rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand/90 disabled:opacity-50"
                  onClick={() => void handleCreateShareLink()}
                  disabled={sharing}
                >
                  {sharing ? "Generazione..." : "Crea link"}
                </button>
              </div>
            </div>

            <div className="border-t border-neutral-100 pt-5 mt-5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold text-neutral-900">Link attivi</h4>
                <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-bold text-neutral-600">
                  {shareLinks.length}
                </span>
              </div>
              
              {shareLinks.length === 0 ? (
                <div className="rounded-[1.25rem] ring-1 ring-inset ring-slate-200/60 border-dashed bg-slate-50 p-6 text-center text-sm text-neutral-500">
                  Nessun link generato per questo documento.
                </div>
              ) : (
                <div className="space-y-3">
                  {shareLinks.map((link) => (
                    <div key={link.id} className="rounded-xl border border-neutral-200 bg-white p-3 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900 select-all">{link.url}</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Scade: {link.expires_at ? formatDateTime(link.expires_at) : "Mai"}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition"
                          onClick={() => navigator.clipboard.writeText(link.url).then(() => showToast({ title: "Copiato", message: "Link copiato negli appunti", tone: "success" }))}
                        >
                          Copia
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-1.5 text-xs font-bold hover:bg-red-100 transition disabled:opacity-50"
                          onClick={() => void handleRevokeShareLink(link.id)}
                          disabled={revokingShareId === link.id}
                        >
                          {revokingShareId === link.id ? "Revoca..." : "Revoca"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </ModalShell>
    </div>
  );
};

export default OrgAdminAccounting;
