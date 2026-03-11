import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
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

const fileKindLabel = (mimeType: string | null) => {
  if (!mimeType) return "File";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "Immagine";
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType.includes("csv")) return "Foglio";
  if (mimeType.includes("word") || mimeType.includes("document")) return "Documento";
  return mimeType;
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
        message: "Questo file non puo essere mostrato inline. Usa Apri o Scarica.",
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
        message: "La condivisione non e piu valida.",
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
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-80 w-full rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="container-shell py-10 space-y-8">
      <section className="surface overflow-hidden">
        <div className="border-b border-neutral-100 px-7 py-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">Contabilita</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Archivio contabile</h2>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-neutral-500">
                Documenti ordinati per cartella e categoria, con preview web e link condivisibili quando autorizzati.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm font-semibold text-emerald-800">
              {totalDocuments} documenti disponibili
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-b border-neutral-100 bg-neutral-50/70 px-7 py-5 lg:grid-cols-[minmax(0,1.2fr)_220px_240px]">
          <label className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Ricerca</span>
            <input
              type="search"
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-800 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/5"
              placeholder="Cerca per titolo, descrizione o nome file..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Cartella</span>
            <select
              className="premium-select w-full"
              value={selectedFolderId}
              onChange={(event) => setSelectedFolderId(event.target.value ? Number(event.target.value) : "")}
            >
              <option value="">Tutte le cartelle</option>
              {folderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Categoria</span>
            <select
              className="premium-select w-full"
              value={selectedCategoryId}
              onChange={(event) => setSelectedCategoryId(event.target.value ? Number(event.target.value) : "")}
            >
              <option value="">Tutte le categorie</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <div className="border-b border-red-100 bg-red-50/80 px-7 py-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <div className="px-7 py-7">
          {items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50/70 px-6 py-14 text-center">
              <p className="text-base font-bold text-neutral-700">Nessun documento contabile trovato.</p>
              <p className="mt-2 text-sm font-medium text-neutral-500">
                Prova a cambiare filtri o attendi un nuovo caricamento dal Super Admin.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((folder) => {
                const folderOpen = expandedFolders.includes(folder.id);
                return (
                  <section key={folder.id} className="rounded-[28px] border border-neutral-200 bg-white shadow-[0_24px_60px_-48px_rgba(15,23,42,0.45)]">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                      onClick={() => toggleFolder(folder.id)}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold tracking-tight text-neutral-900">{folder.name}</h3>
                          {folder.year ? (
                            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-sky-700">
                              {folder.year}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm font-medium text-neutral-500">
                          {folder.document_count} documenti distribuiti in {folder.categories.length} categorie.
                        </p>
                      </div>
                      <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-bold text-neutral-600">
                        {folderOpen ? "Chiudi" : "Apri"}
                      </span>
                    </button>

                    {folderOpen ? (
                      <div className="border-t border-neutral-100 px-4 pb-4 pt-2">
                        <div className="space-y-3">
                          {folder.categories.map((category) => {
                            const categoryOpen = expandedCategories.includes(category.id);
                            return (
                              <div key={category.id} className="overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-50/70">
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                                  onClick={() => toggleCategory(category.id)}
                                >
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="text-sm font-bold uppercase tracking-[0.16em] text-neutral-700">
                                        {category.name}
                                      </h4>
                                      {category.is_system ? (
                                        <span className="rounded-full bg-neutral-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-700">
                                          Sistema
                                        </span>
                                      ) : (
                                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                                          Manuale
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-1 text-sm font-medium text-neutral-500">
                                      {category.documents.length} documenti in questa categoria.
                                    </p>
                                  </div>
                                  <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-bold text-neutral-600">
                                    {categoryOpen ? "Chiudi" : "Apri"}
                                  </span>
                                </button>

                                {categoryOpen ? (
                                  <div className="border-t border-neutral-200 bg-white px-4 py-4">
                                    <div className="space-y-3">
                                      {category.documents.map((document) => (
                                        <article
                                          key={document.id}
                                          className="grid gap-4 rounded-3xl border border-neutral-200 bg-neutral-50/60 px-4 py-4 lg:grid-cols-[minmax(0,1.5fr)_auto]"
                                        >
                                          <div className="min-w-0">
                                            <div className="flex items-start gap-3">
                                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/5 text-brand">
                                                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75h6.879a2.25 2.25 0 0 1 1.591.659l2.871 2.871a2.25 2.25 0 0 1 .659 1.591v8.379a2.25 2.25 0 0 1-2.25 2.25h-9A2.25 2.25 0 0 1 6 17.25v-11.25a2.25 2.25 0 0 1 1.5-2.121Z" />
                                                </svg>
                                              </div>
                                              <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                  <h5 className="truncate text-base font-bold tracking-tight text-neutral-900">
                                                    {document.title}
                                                  </h5>
                                                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500 ring-1 ring-inset ring-neutral-200">
                                                    {fileKindLabel(document.mime_type)}
                                                  </span>
                                                </div>
                                                <p className="mt-2 text-sm font-medium leading-relaxed text-neutral-500">
                                                  {document.description || "Documento caricato dal Super Admin senza descrizione aggiuntiva."}
                                                </p>
                                                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-neutral-500">
                                                  <span>Caricato {formatDateTime(document.created_at)}</span>
                                                  <span>{document.original_filename}</span>
                                                  <span>{formatBytes(document.file_size)}</span>
                                                  {document.is_share_enabled ? (
                                                    <span className="font-semibold text-emerald-700">
                                                      Condivisione abilitata
                                                    </span>
                                                  ) : (
                                                    <span className="font-semibold text-neutral-400">
                                                      Condivisione non abilitata
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          </div>

                                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                            <button
                                              type="button"
                                              className="btn-ghost !px-3 !py-2 text-xs font-bold uppercase tracking-widest"
                                              onClick={() => window.open(document.open_url, "_blank", "noopener,noreferrer")}
                                            >
                                              Apri
                                            </button>
                                            <button
                                              type="button"
                                              className="btn-ghost !px-3 !py-2 text-xs font-bold uppercase tracking-widest"
                                              onClick={() => void handleDownload(document)}
                                              disabled={downloadingId === document.id}
                                            >
                                              {downloadingId === document.id ? "Scarico..." : "Scarica"}
                                            </button>
                                            <button
                                              type="button"
                                              className="btn-ghost !px-3 !py-2 text-xs font-bold uppercase tracking-widest"
                                              onClick={() => handleOpenPreview(document)}
                                              disabled={!document.preview_available}
                                            >
                                              Preview
                                            </button>
                                            <button
                                              type="button"
                                              className="btn-primary !px-3 !py-2 text-xs font-bold uppercase tracking-widest"
                                              onClick={() => setShareDocument(document)}
                                              disabled={!document.is_share_enabled}
                                            >
                                              Condividi
                                            </button>
                                          </div>
                                        </article>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <ModalShell
        open={previewDocument !== null}
        title={previewDocument?.title ?? "Preview documento"}
        description={
          previewDocument
            ? `${previewDocument.original_filename} · ${fileKindLabel(previewDocument.mime_type)}`
            : undefined
        }
        sizeClassName="max-w-5xl"
        onClose={() => setPreviewDocument(null)}
      >
        {previewDocument?.preview_url ? (
          previewDocument.mime_type?.startsWith("image/") ? (
            <img
              src={previewDocument.preview_url}
              alt={previewDocument.title}
              className="max-h-[72vh] w-full rounded-3xl object-contain bg-neutral-50"
            />
          ) : (
            <iframe
              src={previewDocument.preview_url}
              title={previewDocument.title}
              className="h-[72vh] w-full rounded-3xl border border-neutral-200"
            />
          )
        ) : (
          <div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center text-sm font-medium text-neutral-500">
            Preview non disponibile per questo documento.
          </div>
        )}
      </ModalShell>

      <ModalShell
        open={shareDocument !== null}
        title={shareSummary?.title ?? "Condividi documento"}
        description="Genera link firmati, opzionalmente con scadenza, e revoca quelli attivi quando necessario."
        sizeClassName="max-w-3xl"
        onClose={() => setShareDocument(null)}
      >
        {shareSummary ? (
          <div className="space-y-5">
            <div className="rounded-3xl border border-neutral-200 bg-neutral-50/70 p-5">
              <p className="text-sm font-bold text-neutral-900">{shareSummary.title}</p>
              <p className="mt-2 text-sm font-medium text-neutral-500">
                {shareSummary.description || "Documento contabile condivisibile dal workspace org admin."}
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[220px_auto]">
              <label className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Scadenza</span>
                <select
                  className="premium-select w-full"
                  value={shareExpiry}
                  onChange={(event) => setShareExpiry(event.target.value as "7" | "30" | "never")}
                >
                  <option value="7">7 giorni</option>
                  <option value="30">30 giorni</option>
                  <option value="never">Nessuna scadenza</option>
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  className="btn-primary w-full justify-center lg:w-auto"
                  onClick={() => void handleCreateShareLink()}
                  disabled={sharing}
                >
                  {sharing ? "Genero link..." : "Crea link condivisibile"}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-neutral-500">Link attivi</h4>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                  {shareLinks.length}
                </span>
              </div>
              {shareLinks.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-8 text-center text-sm font-medium text-neutral-500">
                  Nessun link attivo per questo documento.
                </div>
              ) : (
                <div className="space-y-3">
                  {shareLinks.map((link) => (
                    <div key={link.id} className="rounded-3xl border border-neutral-200 bg-white px-4 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-neutral-900">{link.url}</p>
                          <p className="mt-2 text-xs font-medium text-neutral-500">
                            Creato {formatDateTime(link.created_at)}
                            {link.expires_at ? ` · Scade ${formatDateTime(link.expires_at)}` : " · Nessuna scadenza"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-ghost !px-3 !py-2 text-xs font-bold uppercase tracking-widest"
                            onClick={() => navigator.clipboard.writeText(link.url).then(() => {
                              showToast({
                                title: "Link copiato",
                                message: "URL copiato negli appunti.",
                                tone: "success",
                              });
                            })}
                          >
                            Copia link
                          </button>
                          <button
                            type="button"
                            className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold uppercase tracking-widest text-red-700 transition hover:bg-red-100"
                            onClick={() => void handleRevokeShareLink(link.id)}
                            disabled={revokingShareId === link.id}
                          >
                            {revokingShareId === link.id ? "Revoco..." : "Revoca"}
                          </button>
                        </div>
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
