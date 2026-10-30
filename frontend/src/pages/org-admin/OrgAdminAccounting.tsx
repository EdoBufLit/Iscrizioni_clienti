import {
  type FormEvent,
  useCallback,
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
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { PageHeader } from "./components/OrgAdminPrimitives";
import "./OrgAdminAccounting.css";

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
  const mobileView = useMediaQuery("(max-width: 767px)");

  const [items, setItems] = useState<OrgAdminAccountingArchiveFolder[]>([]);
  const [folderOptions, setFolderOptions] = useState<Array<{ id: number; name: string; year: number | null; slug: string }>>([]);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ id: number; name: string; code: string; is_system: boolean }>>([]);
  const [query, setQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<number | "">("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFolderId, setDraftFolderId] = useState<number | "">("");
  const [draftCategoryId, setDraftCategoryId] = useState<number | "">("");
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const openFilters = () => { setDraftFolderId(selectedFolderId); setDraftCategoryId(selectedCategoryId); setFiltersOpen(true); };
  const applyFilters = (event: FormEvent) => { event.preventDefault(); setSelectedFolderId(draftFolderId); setSelectedCategoryId(draftCategoryId); closeFilters(); };
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
    let cancelled = false;
    fetchOrgAdminAccountingArchive({
      q: deferredQuery || undefined,
      folderId: selectedFolderId === "" ? undefined : selectedFolderId,
      categoryId: selectedCategoryId === "" ? undefined : selectedCategoryId,
    })
      .then((payload) => {
        if (cancelled) return;
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
        if (cancelled) return;
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Errore nel caricamento archivio contabile.");
      })
      .finally(() => { if (!cancelled) { setLoading(false); setInitialLoaded(true); } });
    return () => { cancelled = true; };
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
        message: "La condivisione non è più valida.",
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

  const documentActions = (document: OrgAdminAccountingDocument) => <div className="accounting-document-actions">
    {document.preview_available && <button type="button" onClick={() => handleOpenPreview(document)} aria-label={`Visualizza ${document.title}`}>Visualizza</button>}
    <button type="button" onClick={() => void handleDownload(document)} disabled={downloadingId === document.id} aria-label={`Scarica ${document.title}`} aria-busy={downloadingId === document.id}>{downloadingId === document.id ? "Download…" : "Scarica"}</button>
    {document.is_share_enabled && <button type="button" onClick={() => setShareDocument(document)} aria-label={`Condividi ${document.title}`}>Condividi</button>}
  </div>;
  const documentIdentity = (document: OrgAdminAccountingDocument) => <div className="accounting-document-identity">
    <DocumentIcon mimeType={document.mime_type} />
    <div>
      {document.preview_available ? <button type="button" className="accounting-document-title" onClick={() => handleOpenPreview(document)}>{document.title}</button> : <strong className="accounting-document-title">{document.title}</strong>}
      {document.description && <p className="accounting-document-description">{document.description}</p>}
      <p className="accounting-document-filename">{document.original_filename}</p>
      {document.is_share_enabled && <span className="accounting-document-shareable">Condivisibile</span>}
    </div>
  </div>;

  if (adminLoading || !initialLoaded) {
    return (
      <div className="container-shell org-admin-mobile-page org-admin-accounting-page">
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-24 w-full rounded-[1.25rem]" />
        <Skeleton className="h-80 w-full rounded-[1.25rem]" />
      </div>
    );
  }

  return (
    <div className="container-shell org-admin-mobile-page org-admin-accounting-page">
      <PageHeader title="Archivio contabile" actions={<span className="accounting-document-count" role="status">{totalDocuments} documenti</span>} />
      <section className="accounting-archive-toolbar" aria-label="Ricerca e filtri archivio">
        <div className="accounting-archive-query">
          <label className="accounting-archive-search"><span className="sr-only">Cerca documenti contabili</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input type="search" placeholder="Titolo, file o descrizione" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <button type="button" className="accounting-filter-trigger" onClick={openFilters} aria-haspopup="dialog" aria-expanded={filtersOpen}>Filtri{(selectedFolderId !== "" || selectedCategoryId !== "") && <span>{Number(selectedFolderId !== "") + Number(selectedCategoryId !== "")}</span>}</button>
        </div>
        {(selectedFolderId !== "" || selectedCategoryId !== "") && <div className="accounting-filter-pills">
          {selectedFolderId !== "" && <button type="button" aria-label="Rimuovi filtro cartella" onClick={() => setSelectedFolderId("")}>{folderOptions.find(folder => folder.id === selectedFolderId)?.name ?? "Cartella selezionata"}<span aria-hidden="true">×</span></button>}
          {selectedCategoryId !== "" && <button type="button" aria-label="Rimuovi filtro categoria" onClick={() => setSelectedCategoryId("")}>{categoryOptions.find(category => category.id === selectedCategoryId)?.name ?? "Categoria selezionata"}<span aria-hidden="true">×</span></button>}
        </div>}
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
        <div className="accounting-archive-folders" aria-busy={loading}>
          {items.map((folder) => {
            const folderOpen = expandedFolders.includes(folder.id);
            return (
              <section key={folder.id} className="accounting-archive-folder">
                {/* Folder Header */}
                <button
                  type="button"
                  className="accounting-folder-trigger"
                  aria-expanded={folderOpen}
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
                            className="accounting-category-trigger"
                            aria-expanded={categoryOpen}
                            onClick={() => toggleCategory(category.id)}
                          >
                            <div className="flex items-center gap-3">
                              <span className="accounting-category-label">
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
                            <div className="accounting-category-documents">
                              {mobileView ? <ul className="accounting-mobile-documents" aria-label={`Documenti ${category.name}`}>
                                {category.documents.map(document => <li key={document.id}>
                                  {documentIdentity(document)}
                                  <p className="accounting-document-meta">{formatDateTime(document.created_at)} · {formatBytes(document.file_size)}</p>
                                  {documentActions(document)}
                                </li>)}
                              </ul> : <div className="accounting-documents-table-shell">
                                <table className="accounting-documents-table">
                                  <caption className="sr-only">Documenti {category.name}</caption>
                                  <thead><tr><th>Documento</th><th>Dettagli</th><th>Azioni</th></tr></thead>
                                  <tbody>{category.documents.map(document => <tr key={document.id}>
                                    <td>{documentIdentity(document)}</td>
                                    <td><p className="accounting-document-meta">{formatDateTime(document.created_at)}</p><p className="accounting-document-meta">{formatBytes(document.file_size)}</p></td>
                                    <td>{documentActions(document)}</td>
                                  </tr>)}</tbody>
                                </table>
                              </div>}
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

      <ModalShell open={filtersOpen} title="Filtri archivio contabile" onClose={closeFilters} placement="bottom" sizeClassName="max-w-lg accounting-archive-filters">
        <form className="accounting-archive-filters-form" onSubmit={applyFilters}>
          <label>Anno o cartella<select className="premium-select" value={draftFolderId} onChange={event => setDraftFolderId(event.target.value ? Number(event.target.value) : "")}><option value="">Tutti gli anni e cartelle</option>{folderOptions.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
          <label>Categoria<select className="premium-select" value={draftCategoryId} onChange={event => setDraftCategoryId(event.target.value ? Number(event.target.value) : "")}><option value="">Tutte le categorie</option>{categoryOptions.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <div className="accounting-archive-filters-actions"><button type="button" className="btn-secondary" onClick={() => { setDraftFolderId(""); setDraftCategoryId(""); }}>Reset</button><button type="submit" className="btn-primary">Applica filtri</button></div>
        </form>
      </ModalShell>

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
