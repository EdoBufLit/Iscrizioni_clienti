import { useDeferredValue, useEffect, useMemo, useState } from "react";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import ModalShell from "../../../components/ui/ModalShell";
import Skeleton from "../../../components/ui/Skeleton";
import { useToast } from "../../../components/ui/ToastProvider";
import {
  AuthError,
  createSuperAdminAccountingCategory,
  createSuperAdminAccountingDocument,
  createSuperAdminAccountingFolder,
  deleteSuperAdminAccountingCategory,
  deleteSuperAdminAccountingDocument,
  deleteSuperAdminAccountingFolder,
  downloadSuperAdminSharedDocument,
  fetchSuperAdminAccountingCategories,
  fetchSuperAdminAccountingDocuments,
  fetchSuperAdminAccountingFolders,
  fetchSuperAdminDocumentTargets,
  revokeSuperAdminAccountingShareLink,
  updateSuperAdminAccountingCategory,
  updateSuperAdminAccountingDocument,
  updateSuperAdminAccountingFolder,
  type AccountingCategorySummary,
  type AccountingFolderSummary,
  type SuperAdminAccountingDocument,
  type SuperAdminDocumentTarget,
} from "../../../lib/api";

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const formatBytes = (value: number | null | undefined) => {
  if (!value) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

type Props = { onAuthError: () => void };
type DeleteTarget = { type: "folder" | "category" | "document"; id: number; label: string } | null;

const SuperAdminAccountingWorkspace = ({ onAuthError }: Props) => {
  const { showToast } = useToast();
  const [targets, setTargets] = useState<SuperAdminDocumentTarget[]>([]);
  const [folders, setFolders] = useState<AccountingFolderSummary[]>([]);
  const [categories, setCategories] = useState<AccountingCategorySummary[]>([]);
  const [documents, setDocuments] = useState<SuperAdminAccountingDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [previewDocument, setPreviewDocument] = useState<SuperAdminAccountingDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [confirmState, setConfirmState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filterOrgId, setFilterOrgId] = useState<number | "">("");
  const [filterFolderId, setFilterFolderId] = useState<number | "">("");
  const [filterCategoryId, setFilterCategoryId] = useState<number | "">("");
  const [folderForm, setFolderForm] = useState({ id: null as number | null, name: "", year: "", isActive: true });
  const [categoryForm, setCategoryForm] = useState({ id: null as number | null, name: "", isActive: true });
  const [documentForm, setDocumentForm] = useState({
    id: null as number | null,
    orgId: "",
    folderId: "",
    categoryId: "",
    title: "",
    description: "",
    previewEnabled: true,
    isShareEnabled: false,
    file: null as File | null,
  });
  const deferredQuery = useDeferredValue(query.trim());

  const enabledTargets = useMemo(() => targets.filter((target) => target.accounting_enabled), [targets]);
  const selectedDocument = useMemo(() => documents.find((item) => item.id === selectedDocumentId) ?? null, [documents, selectedDocumentId]);

  const resetFolderForm = () => setFolderForm({ id: null, name: "", year: "", isActive: true });
  const resetCategoryForm = () => setCategoryForm({ id: null, name: "", isActive: true });
  const resetDocumentForm = () => setDocumentForm({
    id: null,
    orgId: enabledTargets[0] ? String(enabledTargets[0].id) : "",
    folderId: folders[0] ? String(folders[0].id) : "",
    categoryId: categories[0] ? String(categories[0].id) : "",
    title: "",
    description: "",
    previewEnabled: true,
    isShareEnabled: false,
    file: null,
  });

  const loadWorkspace = async () => {
    try {
      setLoading(true);
      const [targetsPayload, foldersPayload, categoriesPayload, documentsPayload] = await Promise.all([
        fetchSuperAdminDocumentTargets(),
        fetchSuperAdminAccountingFolders(),
        fetchSuperAdminAccountingCategories(),
        fetchSuperAdminAccountingDocuments({
          q: deferredQuery || undefined,
          orgId: filterOrgId === "" ? undefined : filterOrgId,
          folderId: filterFolderId === "" ? undefined : filterFolderId,
          categoryId: filterCategoryId === "" ? undefined : filterCategoryId,
        }),
      ]);
      setTargets(targetsPayload.items);
      setFolders(foldersPayload.items);
      setCategories(categoriesPayload.items);
      setDocuments(documentsPayload.items);
      setSelectedDocumentId((current) => current && documentsPayload.items.some((item) => item.id === current) ? current : documentsPayload.items[0]?.id ?? null);
      setError("");
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      setError(err instanceof Error ? err.message : "Errore nel caricamento workspace accounting.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadWorkspace(); }, [deferredQuery, filterOrgId, filterFolderId, filterCategoryId]);
  useEffect(() => { if (!documentForm.orgId && enabledTargets[0]) setDocumentForm((current) => ({ ...current, orgId: String(enabledTargets[0].id) })); }, [documentForm.orgId, enabledTargets]);
  useEffect(() => { if (!documentForm.folderId && folders[0]) setDocumentForm((current) => ({ ...current, folderId: String(folders[0].id) })); }, [documentForm.folderId, folders]);
  useEffect(() => { if (!documentForm.categoryId && categories[0]) setDocumentForm((current) => ({ ...current, categoryId: String(categories[0].id) })); }, [categories, documentForm.categoryId]);

  const handleApiError = (title: string, err: unknown) => {
    if (err instanceof AuthError) {
      onAuthError();
      return;
    }
    showToast({ title, message: err instanceof Error ? err.message : "Operazione non completata.", tone: "error" });
  };

  const saveFolder = async () => {
    try {
      if (!folderForm.name.trim()) return showToast({ title: "Cartelle", message: "Inserisci un nome.", tone: "error" });
      if (folderForm.id) await updateSuperAdminAccountingFolder(folderForm.id, { name: folderForm.name.trim(), year: folderForm.year ? Number(folderForm.year) : null, isActive: folderForm.isActive });
      else await createSuperAdminAccountingFolder({ name: folderForm.name.trim(), year: folderForm.year ? Number(folderForm.year) : null, isActive: folderForm.isActive });
      resetFolderForm();
      await loadWorkspace();
      showToast({ title: "Cartelle", message: "Salvataggio completato.", tone: "success" });
    } catch (err) { handleApiError("Cartelle", err); }
  };

  const saveCategory = async () => {
    try {
      if (!categoryForm.name.trim()) return showToast({ title: "Categorie", message: "Inserisci un nome.", tone: "error" });
      if (categoryForm.id) await updateSuperAdminAccountingCategory(categoryForm.id, { name: categoryForm.name.trim(), isActive: categoryForm.isActive });
      else await createSuperAdminAccountingCategory({ name: categoryForm.name.trim(), isActive: categoryForm.isActive });
      resetCategoryForm();
      await loadWorkspace();
      showToast({ title: "Categorie", message: "Salvataggio completato.", tone: "success" });
    } catch (err) { handleApiError("Categorie", err); }
  };

  const saveDocument = async () => {
    try {
      if (!documentForm.orgId || !documentForm.folderId || !documentForm.categoryId || !documentForm.title.trim()) {
        return showToast({ title: "Documenti", message: "Compila associazione, cartella, categoria e titolo.", tone: "error" });
      }
      if (!documentForm.id && !documentForm.file) {
        return showToast({ title: "Documenti", message: "Carica un file.", tone: "error" });
      }
      if (documentForm.id) {
        const payload = await updateSuperAdminAccountingDocument(documentForm.id, {
          orgId: Number(documentForm.orgId),
          folderId: Number(documentForm.folderId),
          categoryId: Number(documentForm.categoryId),
          title: documentForm.title.trim(),
          description: documentForm.description.trim(),
          previewEnabled: documentForm.previewEnabled,
          isShareEnabled: documentForm.isShareEnabled,
          file: documentForm.file,
        });
        setSelectedDocumentId(payload.document.id);
      } else {
        const payload = await createSuperAdminAccountingDocument({
          orgId: Number(documentForm.orgId),
          folderId: Number(documentForm.folderId),
          categoryId: Number(documentForm.categoryId),
          title: documentForm.title.trim(),
          description: documentForm.description.trim(),
          previewEnabled: documentForm.previewEnabled,
          isShareEnabled: documentForm.isShareEnabled,
          file: documentForm.file as File,
        });
        setSelectedDocumentId(payload.document.id);
      }
      resetDocumentForm();
      await loadWorkspace();
      showToast({ title: "Documenti", message: "Documento contabile salvato.", tone: "success" });
    } catch (err) { handleApiError("Documenti", err); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setConfirmState("loading");
      if (deleteTarget.type === "folder") await deleteSuperAdminAccountingFolder(deleteTarget.id);
      if (deleteTarget.type === "category") await deleteSuperAdminAccountingCategory(deleteTarget.id);
      if (deleteTarget.type === "document") await deleteSuperAdminAccountingDocument(deleteTarget.id);
      setConfirmState("success");
      setDeleteTarget(null);
      await loadWorkspace();
      showToast({ title: "Eliminazione", message: `${deleteTarget.label} eliminato.`, tone: "success" });
      setConfirmState("idle");
    } catch (err) {
      setConfirmState("error");
      handleApiError("Eliminazione", err);
      window.setTimeout(() => setConfirmState("idle"), 1200);
    }
  };

  if (loading) {
    return <div className="space-y-8"><Skeleton className="h-56 w-full rounded-3xl" /><Skeleton className="h-80 w-full rounded-3xl" /></div>;
  }

  return (
    <div className="space-y-8">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-sm font-semibold text-red-700">{error}</div> : null}

      <section className="grid gap-8 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <div className="space-y-8">
          <section className="surface overflow-hidden">
            <div className="border-b border-neutral-100 px-7 py-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">Setup accounting</p>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-neutral-900">Cartelle e categorie</h3>
            </div>
            <div className="grid gap-6 px-7 py-7 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="rounded-3xl border border-neutral-200 bg-neutral-50/70 p-5">
                  <input className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800" placeholder="Nome cartella" value={folderForm.name} onChange={(event) => setFolderForm((current) => ({ ...current, name: event.target.value }))} />
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800" placeholder="Anno opzionale" value={folderForm.year} onChange={(event) => setFolderForm((current) => ({ ...current, year: event.target.value }))} />
                    <label className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700"><input type="checkbox" checked={folderForm.isActive} onChange={(event) => setFolderForm((current) => ({ ...current, isActive: event.target.checked }))} />Attiva</label>
                  </div>
                  <div className="mt-3 flex gap-3"><button type="button" className="btn-primary" onClick={() => void saveFolder()}>{folderForm.id ? "Aggiorna" : "Crea cartella"}</button>{folderForm.id ? <button type="button" className="btn-ghost" onClick={resetFolderForm}>Annulla</button> : null}</div>
                </div>
                {folders.map((folder) => (
                  <article key={folder.id} className="rounded-3xl border border-neutral-200 bg-white px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-sm font-bold text-neutral-900">{folder.name}</p><p className="mt-1 text-xs font-medium text-neutral-500">{folder.document_count} documenti · {folder.is_active ? "Attiva" : "Off"}</p></div>
                      <div className="flex gap-2"><button type="button" className="btn-ghost !px-3 !py-2 text-xs" onClick={() => setFolderForm({ id: folder.id, name: folder.name, year: folder.year ? String(folder.year) : "", isActive: folder.is_active })}>Modifica</button><button type="button" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold uppercase tracking-widest text-red-700" onClick={() => setDeleteTarget({ type: "folder", id: folder.id, label: folder.name })} disabled={folder.is_default}>Elimina</button></div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-neutral-200 bg-neutral-50/70 p-5">
                  <input className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800" placeholder="Nome categoria" value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} />
                  <label className="mt-3 flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700"><input type="checkbox" checked={categoryForm.isActive} onChange={(event) => setCategoryForm((current) => ({ ...current, isActive: event.target.checked }))} />Attiva</label>
                  <div className="mt-3 flex gap-3"><button type="button" className="btn-primary" onClick={() => void saveCategory()}>{categoryForm.id ? "Aggiorna" : "Crea categoria"}</button>{categoryForm.id ? <button type="button" className="btn-ghost" onClick={resetCategoryForm}>Annulla</button> : null}</div>
                </div>
                {categories.map((category) => (
                  <article key={category.id} className="rounded-3xl border border-neutral-200 bg-white px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-sm font-bold text-neutral-900">{category.name}</p><p className="mt-1 text-xs font-medium text-neutral-500">{category.document_count ?? 0} documenti · {category.is_system ? "Sistema" : "Manuale"}</p></div>
                      <div className="flex gap-2"><button type="button" className="btn-ghost !px-3 !py-2 text-xs" onClick={() => setCategoryForm({ id: category.id, name: category.name, isActive: category.is_active })}>Modifica</button><button type="button" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold uppercase tracking-widest text-red-700" onClick={() => setDeleteTarget({ type: "category", id: category.id, label: category.name })} disabled={category.is_system}>Elimina</button></div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="surface overflow-hidden">
            <div className="border-b border-neutral-100 px-7 py-6"><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">Documento accounting</p><h3 className="mt-2 text-xl font-bold tracking-tight text-neutral-900">{documentForm.id ? "Modifica documento" : "Nuovo documento"}</h3></div>
            <div className="grid gap-5 px-7 py-7">
              <div className="grid gap-4 lg:grid-cols-3">
                <select className="premium-select w-full" value={documentForm.orgId} onChange={(event) => setDocumentForm((current) => ({ ...current, orgId: event.target.value }))}><option value="">Associazione</option>{enabledTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select>
                <select className="premium-select w-full" value={documentForm.folderId} onChange={(event) => setDocumentForm((current) => ({ ...current, folderId: event.target.value }))}><option value="">Cartella</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
                <select className="premium-select w-full" value={documentForm.categoryId} onChange={(event) => setDocumentForm((current) => ({ ...current, categoryId: event.target.value }))}><option value="">Categoria</option>{categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
              </div>
              <input className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800" placeholder="Titolo documento" value={documentForm.title} onChange={(event) => setDocumentForm((current) => ({ ...current, title: event.target.value }))} />
              <textarea className="min-h-24 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-700" placeholder="Descrizione" value={documentForm.description} onChange={(event) => setDocumentForm((current) => ({ ...current, description: event.target.value }))} />
              <input type="file" className="block w-full rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 file:mr-4 file:rounded-xl file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-xs file:font-bold file:uppercase file:tracking-widest file:text-white" onChange={(event) => setDocumentForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))} />
              <div className="grid gap-3 sm:grid-cols-2"><label className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50/70 px-4 py-3 text-sm font-semibold text-neutral-700"><input type="checkbox" checked={documentForm.previewEnabled} onChange={(event) => setDocumentForm((current) => ({ ...current, previewEnabled: event.target.checked }))} />Preview</label><label className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50/70 px-4 py-3 text-sm font-semibold text-neutral-700"><input type="checkbox" checked={documentForm.isShareEnabled} onChange={(event) => setDocumentForm((current) => ({ ...current, isShareEnabled: event.target.checked }))} />Condivisione</label></div>
              <div className="flex justify-end gap-3">{documentForm.id ? <button type="button" className="btn-ghost" onClick={resetDocumentForm}>Annulla</button> : null}<button type="button" className="btn-primary" onClick={() => void saveDocument()}>{documentForm.id ? "Aggiorna documento" : "Carica documento"}</button></div>
            </div>
          </section>
        </div>

        <aside className="space-y-8">
          <section className="surface overflow-hidden">
            <div className="border-b border-neutral-100 px-6 py-5"><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">Filtri</p><h3 className="mt-2 text-lg font-bold tracking-tight text-neutral-900">Archivio accounting</h3></div>
            <div className="grid gap-4 px-6 py-6">
              <input className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-800" placeholder="Cerca documento, file o associazione..." value={query} onChange={(event) => setQuery(event.target.value)} />
              <select className="premium-select w-full" value={filterOrgId} onChange={(event) => setFilterOrgId(event.target.value ? Number(event.target.value) : "")}><option value="">Tutte le associazioni</option>{enabledTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select>
              <select className="premium-select w-full" value={filterFolderId} onChange={(event) => setFilterFolderId(event.target.value ? Number(event.target.value) : "")}><option value="">Tutte le cartelle</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
              <select className="premium-select w-full" value={filterCategoryId} onChange={(event) => setFilterCategoryId(event.target.value ? Number(event.target.value) : "")}><option value="">Tutte le categorie</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            </div>
          </section>

          <section className="surface overflow-hidden">
            <div className="border-b border-neutral-100 px-6 py-5"><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">Dettaglio</p><h3 className="mt-2 text-lg font-bold tracking-tight text-neutral-900">Documento selezionato</h3></div>
            <div className="px-6 py-6">
              {selectedDocument ? (
                <div className="space-y-4">
                  <div><h4 className="text-xl font-bold tracking-tight text-neutral-900">{selectedDocument.title}</h4><p className="mt-2 text-sm font-medium text-neutral-500">{selectedDocument.description || "Nessuna descrizione aggiuntiva."}</p></div>
                  <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Associazione</p><p className="mt-2 text-sm font-bold text-neutral-900">{selectedDocument.organization?.name ?? "-"}</p></div><div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">File</p><p className="mt-2 text-sm font-bold text-neutral-900">{selectedDocument.original_filename}</p></div><div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Data</p><p className="mt-2 text-sm font-bold text-neutral-900">{formatDateTime(selectedDocument.created_at)}</p></div><div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Peso</p><p className="mt-2 text-sm font-bold text-neutral-900">{formatBytes(selectedDocument.file_size)}</p></div></div>
                  <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" onClick={() => window.open(selectedDocument.open_url, "_blank", "noopener,noreferrer")}>Apri</button><button type="button" className="btn-ghost" onClick={() => void downloadSuperAdminSharedDocument(selectedDocument)}>Scarica</button><button type="button" className="btn-ghost" onClick={() => setPreviewDocument(selectedDocument)} disabled={!selectedDocument.preview_available}>Preview</button><button type="button" className="btn-ghost" onClick={() => setDocumentForm({ id: selectedDocument.id, orgId: selectedDocument.organization?.id ? String(selectedDocument.organization.id) : "", folderId: selectedDocument.folder?.id ? String(selectedDocument.folder.id) : "", categoryId: selectedDocument.category?.id ? String(selectedDocument.category.id) : "", title: selectedDocument.title, description: selectedDocument.description ?? "", previewEnabled: selectedDocument.preview_enabled, isShareEnabled: selectedDocument.is_share_enabled, file: null })}>Modifica</button></div>
                  <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">Link condivisi</p><div className="mt-3 space-y-3">{(selectedDocument.share_links ?? []).length === 0 ? <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-sm font-medium text-neutral-500">Nessun link attivo.</div> : (selectedDocument.share_links ?? []).map((link) => <div key={link.id} className="rounded-2xl border border-neutral-200 bg-white px-4 py-3"><p className="truncate text-sm font-semibold text-neutral-900">{link.url}</p><p className="mt-2 text-xs font-medium text-neutral-500">{formatDateTime(link.created_at)}{link.expires_at ? ` · scade ${formatDateTime(link.expires_at)}` : ""}</p><div className="mt-3 flex gap-2"><button type="button" className="btn-ghost !px-3 !py-2 text-xs" onClick={() => navigator.clipboard.writeText(link.url).then(() => showToast({ title: "Link copiato", message: "URL copiato negli appunti.", tone: "success" }))}>Copia</button><button type="button" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold uppercase tracking-widest text-red-700" onClick={() => void revokeSuperAdminAccountingShareLink(link.id).then(loadWorkspace).then(() => showToast({ title: "Condivisione", message: "Link revocato.", tone: "success" })).catch((err) => handleApiError("Condivisione", err))}>Revoca</button></div></div>)}</div></div>
                </div>
              ) : <p className="text-sm font-medium text-neutral-500">Seleziona un documento per vedere il dettaglio.</p>}
            </div>
          </section>
        </aside>
      </section>

      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-7 py-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">Archivio</p><h3 className="mt-2 text-lg font-bold tracking-tight text-neutral-900">Documenti contabili registrati</h3></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">{documents.length} record</span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[880px] text-left"><thead><tr className="border-b border-neutral-100 bg-neutral-50/50"><th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Documento</th><th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Associazione</th><th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Cartella / categoria</th><th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Data</th><th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 text-right">Azioni</th></tr></thead><tbody className="divide-y divide-neutral-100">{documents.length === 0 ? <tr><td colSpan={5} className="px-5 py-14 text-center text-sm font-medium text-neutral-400">Nessun documento accounting.</td></tr> : documents.map((document) => <tr key={document.id} className={selectedDocumentId === document.id ? "bg-brand/5" : ""}><td className="px-5 py-4"><button type="button" className="text-left" onClick={() => setSelectedDocumentId(document.id)}><p className="text-sm font-bold text-neutral-900">{document.title}</p><p className="mt-1 text-xs font-medium text-neutral-500">{document.original_filename} · {formatBytes(document.file_size)}</p></button></td><td className="px-5 py-4 text-sm font-medium text-neutral-600">{document.organization?.name ?? "-"}</td><td className="px-5 py-4 text-sm font-medium text-neutral-600">{document.folder?.name ?? "-"} · {document.category?.name ?? "-"}</td><td className="px-5 py-4 text-sm font-medium text-neutral-600">{formatDateTime(document.created_at)}</td><td className="px-5 py-4 text-right"><div className="flex justify-end gap-2"><button type="button" className="btn-ghost !px-3 !py-1.5 !text-[10px] font-bold uppercase tracking-widest" onClick={() => setPreviewDocument(document)} disabled={!document.preview_available}>Preview</button><button type="button" className="btn-ghost !px-3 !py-1.5 !text-[10px] font-bold uppercase tracking-widest" onClick={() => setDocumentForm({ id: document.id, orgId: document.organization?.id ? String(document.organization.id) : "", folderId: document.folder?.id ? String(document.folder.id) : "", categoryId: document.category?.id ? String(document.category.id) : "", title: document.title, description: document.description ?? "", previewEnabled: document.preview_enabled, isShareEnabled: document.is_share_enabled, file: null })}>Modifica</button><button type="button" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-red-700" onClick={() => setDeleteTarget({ type: "document", id: document.id, label: document.title })}>Elimina</button></div></td></tr>)}</tbody></table></div>
      </section>

      <ModalShell open={previewDocument !== null} title={previewDocument?.title ?? "Preview documento"} description={previewDocument ? `${previewDocument.original_filename} · ${formatBytes(previewDocument.file_size)}` : undefined} sizeClassName="max-w-5xl" onClose={() => setPreviewDocument(null)}>
        {previewDocument?.preview_url ? (previewDocument.mime_type?.startsWith("image/") ? <img src={previewDocument.preview_url} alt={previewDocument.title} className="max-h-[72vh] w-full rounded-3xl object-contain bg-neutral-50" /> : <iframe src={previewDocument.preview_url} title={previewDocument.title} className="h-[72vh] w-full rounded-3xl border border-neutral-200" />) : <div className="rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center text-sm font-medium text-neutral-500">Preview non disponibile per questo documento.</div>}
      </ModalShell>

      <ConfirmModal open={deleteTarget !== null} title="Conferma eliminazione" description={deleteTarget ? `Eliminare definitivamente ${deleteTarget.label}?` : ""} confirmLabel="Elimina definitivamente" tone="danger" confirmState={confirmState} onClose={() => { setDeleteTarget(null); setConfirmState("idle"); }} onConfirm={() => void confirmDelete()} />
    </div>
  );
};

export default SuperAdminAccountingWorkspace;
