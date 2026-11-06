import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import AccountingDocumentPreviewModal from "../../../components/accounting/AccountingDocumentPreviewModal";
import ModalShell from "../../../components/ui/ModalShell";
import ConfirmModal from "../../../components/ui/ConfirmModal";
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

type Props = { onAuthError: () => void; createRequest?: number };

type DeleteTarget =
  | { type: "folder" | "category" | "document"; id: number; label: string }
  | null;

const MetadataTile = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4">
    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
      {label}
    </p>
    <p className="mt-2 text-sm font-bold leading-6 text-neutral-900">{value}</p>
  </div>
);

const StatusChip = ({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
      active
        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
        : "bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200"
    }`}
  >
    {label}
  </span>
);

const SuperAdminAccountingWorkspace = ({ onAuthError, createRequest = 0 }: Props) => {
  const { showToast } = useToast();

  const [targets, setTargets] = useState<SuperAdminDocumentTarget[]>([]);
  const [folders, setFolders] = useState<AccountingFolderSummary[]>([]);
  const [categories, setCategories] = useState<AccountingCategorySummary[]>([]);
  const [documents, setDocuments] = useState<SuperAdminAccountingDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [previewDocument, setPreviewDocument] =
    useState<SuperAdminAccountingDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [confirmState, setConfirmState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [documentEditorOpen, setDocumentEditorOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const loadSequence = useRef(0);
  const documentSaveLock = useRef(false);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filterOrgId, setFilterOrgId] = useState<number | "">("");
  const [filterFolderId, setFilterFolderId] = useState<number | "">("");
  const [filterCategoryId, setFilterCategoryId] = useState<number | "">("");
  const [folderForm, setFolderForm] = useState({
    id: null as number | null,
    name: "",
    year: "",
    isActive: true,
  });
  const [categoryForm, setCategoryForm] = useState({
    id: null as number | null,
    name: "",
    isActive: true,
  });
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

  const enabledTargets = useMemo(
    () => targets.filter((target) => target.accounting_enabled),
    [targets],
  );
  const selectedDocument = useMemo(
    () => documents.find((item) => item.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  );

  const previousCreateRequest = useRef(createRequest);
  useEffect(() => {
    if (createRequest !== previousCreateRequest.current) {
      previousCreateRequest.current = createRequest;
      resetDocumentForm();
      setDocumentEditorOpen(true);
    }
  }, [createRequest]);

  const returnToDetail = useRef(false);
  const restoreDetail = () => {
    if (returnToDetail.current) setDetailOpen(true);
    returnToDetail.current = false;
  };
  const requestDelete = (target: DeleteTarget) => {
    returnToDetail.current = detailOpen;
    setSetupOpen(false);
    setDetailOpen(false);
    setDeleteTarget(target);
  };

  const resetFolderForm = () =>
    setFolderForm({ id: null, name: "", year: "", isActive: true });
  const resetCategoryForm = () =>
    setCategoryForm({ id: null, name: "", isActive: true });
  const resetDocumentForm = () =>
    setDocumentForm({
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

  const applyDocumentToForm = (document: SuperAdminAccountingDocument) => {
    returnToDetail.current = detailOpen;
    setDetailOpen(false);
    setDocumentEditorOpen(true);
    setDocumentForm({
      id: document.id,
      orgId: document.organization?.id ? String(document.organization.id) : "",
      folderId: document.folder?.id ? String(document.folder.id) : "",
      categoryId: document.category?.id ? String(document.category.id) : "",
      title: document.title,
      description: document.description ?? "",
      previewEnabled: document.preview_enabled,
      isShareEnabled: document.is_share_enabled,
      file: null,
    });
  };

  const loadWorkspace = async () => {
    const sequence = ++loadSequence.current;
    try {
      setLoading(true);
      const [targetsPayload, foldersPayload, categoriesPayload, documentsPayload] =
        await Promise.all([
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
      if (sequence !== loadSequence.current) return;
      setReady(true);
      setTargets(targetsPayload.items);
      setFolders(foldersPayload.items);
      setCategories(categoriesPayload.items);
      setDocuments(documentsPayload.items);
      setSelectedDocumentId((current) =>
        current && documentsPayload.items.some((item) => item.id === current)
          ? current
          : documentsPayload.items[0]?.id ?? null,
      );
      setError("");
    } catch (err) {
      if (sequence !== loadSequence.current) return;
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Errore nel caricamento workspace accounting.",
      );
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, [deferredQuery, filterOrgId, filterFolderId, filterCategoryId]);

  useEffect(() => {
    if (!documentForm.orgId && enabledTargets[0]) {
      setDocumentForm((current) => ({ ...current, orgId: String(enabledTargets[0].id) }));
    }
  }, [documentForm.orgId, enabledTargets]);

  useEffect(() => {
    if (!documentForm.folderId && folders[0]) {
      setDocumentForm((current) => ({ ...current, folderId: String(folders[0].id) }));
    }
  }, [documentForm.folderId, folders]);

  useEffect(() => {
    if (!documentForm.categoryId && categories[0]) {
      setDocumentForm((current) => ({ ...current, categoryId: String(categories[0].id) }));
    }
  }, [categories, documentForm.categoryId]);

  const handleApiError = (title: string, err: unknown) => {
    if (err instanceof AuthError) {
      onAuthError();
      return;
    }
    showToast({
      title,
      message: err instanceof Error ? err.message : "Operazione non completata.",
      tone: "error",
    });
  };

  const saveFolder = async () => {
    try {
      if (!folderForm.name.trim()) {
        showToast({ title: "Cartelle", message: "Inserisci un nome.", tone: "error" });
        return;
      }
      if (folderForm.id) {
        await updateSuperAdminAccountingFolder(folderForm.id, {
          name: folderForm.name.trim(),
          year: folderForm.year ? Number(folderForm.year) : null,
          isActive: folderForm.isActive,
        });
      } else {
        await createSuperAdminAccountingFolder({
          name: folderForm.name.trim(),
          year: folderForm.year ? Number(folderForm.year) : null,
          isActive: folderForm.isActive,
        });
      }
      resetFolderForm();
      await loadWorkspace();
      showToast({ title: "Cartelle", message: "Salvataggio completato.", tone: "success" });
    } catch (err) {
      handleApiError("Cartelle", err);
    }
  };

  const saveCategory = async () => {
    try {
      if (!categoryForm.name.trim()) {
        showToast({ title: "Categorie", message: "Inserisci un nome.", tone: "error" });
        return;
      }
      if (categoryForm.id) {
        await updateSuperAdminAccountingCategory(categoryForm.id, {
          name: categoryForm.name.trim(),
          isActive: categoryForm.isActive,
        });
      } else {
        await createSuperAdminAccountingCategory({
          name: categoryForm.name.trim(),
          isActive: categoryForm.isActive,
        });
      }
      resetCategoryForm();
      await loadWorkspace();
      showToast({
        title: "Categorie",
        message: "Salvataggio completato.",
        tone: "success",
      });
    } catch (err) {
      handleApiError("Categorie", err);
    }
  };

  const saveDocument = async () => {
    if (documentSaveLock.current) return;
    try {
      if (
        !documentForm.orgId ||
        !documentForm.folderId ||
        !documentForm.categoryId ||
        !documentForm.title.trim()
      ) {
        showToast({
          title: "Documenti",
          message: "Compila associazione, cartella, categoria e titolo.",
          tone: "error",
        });
        return;
      }
      if (!documentForm.id && !documentForm.file) {
        showToast({ title: "Documenti", message: "Carica un file.", tone: "error" });
        return;
      }

      documentSaveLock.current = true;
      setDocumentSaving(true);
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
      setDocumentEditorOpen(false);
      restoreDetail();
      await loadWorkspace();
      showToast({
        title: "Documenti",
        message: "Documento contabile salvato.",
        tone: "success",
      });
    } catch (err) {
      handleApiError("Documenti", err);
    } finally {
      documentSaveLock.current = false;
      setDocumentSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setConfirmState("loading");
      if (deleteTarget.type === "folder") await deleteSuperAdminAccountingFolder(deleteTarget.id);
      if (deleteTarget.type === "category") {
        await deleteSuperAdminAccountingCategory(deleteTarget.id);
      }
      if (deleteTarget.type === "document") {
        await deleteSuperAdminAccountingDocument(deleteTarget.id);
      }
      setConfirmState("success");
      setDeleteTarget(null);
      returnToDetail.current = false;
      await loadWorkspace();
      showToast({
        title: "Eliminazione",
        message: `${deleteTarget.label} eliminato.`,
        tone: "success",
      });
      setConfirmState("idle");
    } catch (err) {
      setConfirmState("error");
      handleApiError("Eliminazione", err);
      window.setTimeout(() => setConfirmState("idle"), 1200);
    }
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast({
        title: "Link copiato",
        message: "URL copiato negli appunti.",
        tone: "success",
      });
    } catch {
      showToast({
        title: "Link",
        message: "Impossibile copiare automaticamente il link.",
        tone: "error",
      });
    }
  };

  if (loading && !ready) {
    return (
      <div className="sa-accounting-workspace space-y-8">
        <Skeleton className="h-48 w-full rounded-3xl" />
        <Skeleton className="h-80 w-full rounded-3xl" />
        <Skeleton className="h-[32rem] w-full rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="sa-accounting-workspace space-y-4" aria-busy={loading}>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="sa-accounting-filterbar">
        <input type="search" className="sa-input" aria-label="Cerca documento, file o associazione" placeholder="Cerca documento o associazione" value={query} onChange={event => setQuery(event.target.value)} />
        <button type="button" className="btn-ghost" onClick={() => setFiltersOpen(true)}>Filtri{[filterOrgId, filterFolderId, filterCategoryId].filter(value => value !== "").length ? " attivi" : ""}</button>
        <button type="button" className="btn-ghost" onClick={() => setSetupOpen(true)}>Gestisci</button>
      </div>
      <section className="sa-accounting-archive surface overflow-hidden">
        <div className="sa-documents-archive-header flex flex-col gap-3 border-b border-neutral-100 px-7 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">
              Archivio
            </p>
            <h3 className="mt-2 text-lg font-bold tracking-tight text-neutral-900">
              Documenti contabili
            </h3>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            {documents.length} record
          </span>
        </div>

        <div className="overflow-x-auto">
          <table aria-label="Archivio documenti contabili" className="sa-accounting-table w-full min-w-[980px] text-left">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/60">
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                  Documento
                </th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                  Associazione
                </th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                  Cartella / categoria
                </th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                  Stato
                </th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                  Data
                </th>
                <th className="px-5 py-4 text-right text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                  Azioni
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {documents.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-14 text-center text-sm font-medium text-neutral-400"
                  >
                    Nessun documento accounting.
                  </td>
                </tr>
              ) : (
                documents.map((document) => {
                  const isSelected = selectedDocumentId === document.id;
                  return (
                    <tr
                      key={document.id}
                      className={isSelected ? "bg-brand/5" : "hover:bg-neutral-50/50"}
                    >
                      <td data-label="Documento" className="px-5 py-4">
                        <button
                          type="button"
                          className="sa-accounting-document-title text-left"
                          onClick={() => { setSelectedDocumentId(document.id); setDetailOpen(true); }}
                        >
                          <p className="sa-document-row-title text-sm font-bold text-neutral-900">
                            {document.title}
                          </p>
                          <p className="sa-document-row-file mt-1 text-xs font-medium text-neutral-500">
                            {document.original_filename} · {formatBytes(document.file_size)}
                          </p>
                        </button>
                      </td>
                      <td data-label="Associazione" className="px-5 py-4 text-sm font-medium text-neutral-600">
                        <span className="sa-document-row-meta">{document.organization?.name ?? "-"}</span>
                      </td>
                      <td data-label="Cartella / categoria" className="px-5 py-4 text-sm font-medium text-neutral-600">
                        <span className="sa-document-row-meta">{document.folder?.name ?? "-"} · {document.category?.name ?? "-"}</span>
                      </td>
                      <td data-label="Stato" className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <StatusChip
                            label={document.preview_available ? "Preview" : "No preview"}
                            active={document.preview_available}
                          />
                          <StatusChip
                            label={document.is_share_enabled ? "Share" : "Privato"}
                            active={document.is_share_enabled}
                          />
                        </div>
                      </td>
                      <td data-label="Data" className="px-5 py-4 text-sm font-medium text-neutral-600">
                        {formatDateTime(document.created_at)}
                      </td>
                      <td data-label="Azioni" className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="btn-ghost !px-3 !py-1.5 !text-[10px] font-bold uppercase tracking-widest"
                            onClick={() => { setDetailOpen(false); setPreviewDocument(document); }}
                            disabled={!document.preview_available}
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            className="btn-ghost !px-3 !py-1.5 !text-[10px] font-bold uppercase tracking-widest"
                            onClick={() => applyDocumentToForm(document)}
                            data-row-secondary="true"
                          >
                            Modifica
                          </button>
                          <button
                            type="button"
                            className="rounded-2xl border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-red-700"
                            data-row-secondary="true"
                            onClick={() =>
                              requestDelete({
                                type: "document",
                                id: document.id,
                                label: document.title,
                              })
                            }
                          >
                            Elimina
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      <ModalShell open={filtersOpen} title="Filtri documenti contabili" onClose={() => setFiltersOpen(false)} contentClassName="sa-documents-dialog" footer={<button type="button" className="btn-primary" onClick={() => setFiltersOpen(false)}>Mostra risultati</button>}>
        <div className="grid gap-4">
          <label>Associazione<select className="sa-select w-full mt-2" aria-label="Filtra associazione" value={filterOrgId} onChange={event => setFilterOrgId(event.target.value ? Number(event.target.value) : "")}><option value="">Tutte le associazioni</option>{enabledTargets.map(target => <option key={target.id} value={target.id}>{target.name}</option>)}</select></label>
          <label>Cartella<select className="sa-select w-full mt-2" aria-label="Filtra cartella" value={filterFolderId} onChange={event => setFilterFolderId(event.target.value ? Number(event.target.value) : "")}><option value="">Tutte le cartelle</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
          <label>Categoria<select className="sa-select w-full mt-2" aria-label="Filtra categoria" value={filterCategoryId} onChange={event => setFilterCategoryId(event.target.value ? Number(event.target.value) : "")}><option value="">Tutte le categorie</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <button type="button" className="btn-ghost" onClick={() => { setFilterOrgId(""); setFilterFolderId(""); setFilterCategoryId(""); setQuery(""); }}>Azzera filtri</button>
        </div>
      </ModalShell>
      <ModalShell open={setupOpen} title="Cartelle e categorie" onClose={() => setSetupOpen(false)} sizeClassName="max-w-4xl" contentClassName="sa-documents-dialog"><div className="sa-accounting-editor"><section className="surface overflow-hidden">
            <div className="border-b border-neutral-100 px-7 py-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">
                Setup accounting
              </p>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-neutral-900">
                Cartelle e categorie
              </h3>
              <p className="mt-2 text-sm font-medium text-neutral-500">
                Mantieni la tassonomia ordinata prima di caricare i documenti nel circuito
                org-admin.
              </p>
            </div>

            <div className="grid gap-6 px-7 py-7 xl:grid-cols-2">
              <div className="rounded-[28px] border border-neutral-200 bg-neutral-50/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">Cartelle</p>
                    <p className="mt-1 text-xs font-medium text-neutral-500">
                      Di solito anni o gruppi contabili principali.
                    </p>
                  </div>
                  <StatusChip
                    label={folderForm.id ? "Modifica" : "Nuova"}
                    active={Boolean(folderForm.id)}
                  />
                </div>
                <div className="mt-5 grid gap-3">
                  <input
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800"
                    placeholder="Nome cartella"
                    value={folderForm.name}
                    onChange={(event) =>
                      setFolderForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input
                      className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800"
                      placeholder="Anno opzionale"
                      value={folderForm.year}
                      onChange={(event) =>
                        setFolderForm((current) => ({ ...current, year: event.target.value }))
                      }
                    />
                    <label className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700">
                      <input
                        type="checkbox"
                        checked={folderForm.isActive}
                        onChange={(event) =>
                          setFolderForm((current) => ({
                            ...current,
                            isActive: event.target.checked,
                          }))
                        }
                      />
                      Attiva
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" className="btn-primary" onClick={() => void saveFolder()}>
                      {folderForm.id ? "Aggiorna cartella" : "Crea cartella"}
                    </button>
                    {folderForm.id ? (
                      <button type="button" className="btn-ghost" onClick={resetFolderForm}>
                        Annulla
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-neutral-200 bg-neutral-50/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">Categorie</p>
                    <p className="mt-1 text-xs font-medium text-neutral-500">
                      Raggruppa IVA, paghe, dichiarazioni o categorie custom.
                    </p>
                  </div>
                  <StatusChip
                    label={categoryForm.id ? "Modifica" : "Nuova"}
                    active={Boolean(categoryForm.id)}
                  />
                </div>
                <div className="mt-5 grid gap-3">
                  <input
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800"
                    placeholder="Nome categoria"
                    value={categoryForm.name}
                    onChange={(event) =>
                      setCategoryForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                  <label className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700">
                    <input
                      type="checkbox"
                      checked={categoryForm.isActive}
                      onChange={(event) =>
                        setCategoryForm((current) => ({
                          ...current,
                          isActive: event.target.checked,
                        }))
                      }
                    />
                    Attiva
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => void saveCategory()}
                    >
                      {categoryForm.id ? "Aggiorna categoria" : "Crea categoria"}
                    </button>
                    {categoryForm.id ? (
                      <button type="button" className="btn-ghost" onClick={resetCategoryForm}>
                        Annulla
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 border-t border-neutral-100 px-7 py-7 xl:grid-cols-2">
              <div className="min-h-0">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-neutral-900">Cartelle registrate</h4>
                    <p className="mt-1 text-xs font-medium text-neutral-500">
                      Elementi che guidano l'archivio nelle aree riservate.
                    </p>
                  </div>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
                    {folders.length}
                  </span>
                </div>
                <div className="sa-accounting-taxonomy-list space-y-3">
                  {folders.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center text-sm font-medium text-neutral-500">
                      Nessuna cartella disponibile.
                    </div>
                  ) : (
                    folders.map((folder) => (
                      <article
                        key={folder.id}
                        className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-bold text-neutral-900">{folder.name}</p>
                              {folder.year ? (
                                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">
                                  {folder.year}
                                </span>
                              ) : null}
                              {folder.is_default ? (
                                <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-brand">
                                  Default
                                </span>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <StatusChip label={folder.is_active ? "Attiva" : "Off"} active={folder.is_active} />
                              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
                                {folder.document_count} documenti
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn-ghost !px-3 !py-2 text-xs"
                              onClick={() =>
                                setFolderForm({
                                  id: folder.id,
                                  name: folder.name,
                                  year: folder.year ? String(folder.year) : "",
                                  isActive: folder.is_active,
                                })
                              }
                            >
                              Modifica
                            </button>
                            <button
                              type="button"
                              className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold uppercase tracking-widest text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() =>
                                requestDelete({ type: "folder", id: folder.id, label: folder.name })
                              }
                              disabled={folder.is_default}
                            >
                              Elimina
                            </button>
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>

              <div className="min-h-0">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-neutral-900">Categorie registrate</h4>
                    <p className="mt-1 text-xs font-medium text-neutral-500">
                      Le categorie di sistema restano protette.
                    </p>
                  </div>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
                    {categories.length}
                  </span>
                </div>
                <div className="sa-accounting-taxonomy-list space-y-3">
                  {categories.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center text-sm font-medium text-neutral-500">
                      Nessuna categoria disponibile.
                    </div>
                  ) : (
                    categories.map((category) => (
                      <article
                        key={category.id}
                        className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-bold text-neutral-900">{category.name}</p>
                              {category.is_system ? (
                                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">
                                  Sistema
                                </span>
                              ) : (
                                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">
                                  Manuale
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <StatusChip label={category.is_active ? "Attiva" : "Off"} active={category.is_active} />
                              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
                                {category.document_count ?? 0} documenti
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn-ghost !px-3 !py-2 text-xs"
                              onClick={() =>
                                setCategoryForm({
                                  id: category.id,
                                  name: category.name,
                                  isActive: category.is_active,
                                })
                              }
                            >
                              Modifica
                            </button>
                            <button
                              type="button"
                              className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold uppercase tracking-widest text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() =>
                                requestDelete({
                                  type: "category",
                                  id: category.id,
                                  label: category.name,
                                })
                              }
                              disabled={category.is_system}
                            >
                              Elimina
                            </button>
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section></div></ModalShell>
      <ModalShell open={documentEditorOpen} title={documentForm.id ? "Modifica documento contabile" : "Nuovo documento contabile"} onClose={() => { if (!documentSaving) { setDocumentEditorOpen(false); restoreDetail(); } }} closeDisabled={documentSaving} closeOnEscape={!documentSaving} closeOnOverlay={!documentSaving} sizeClassName="max-w-3xl" contentClassName="sa-documents-dialog"><div className="sa-accounting-editor"><section className="surface overflow-hidden">
            <div className="border-b border-neutral-100 px-7 py-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">
                Documento accounting
              </p>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-neutral-900">
                {documentForm.id ? "Modifica documento" : "Nuovo documento"}
              </h3>
              <p className="mt-2 text-sm font-medium text-neutral-500">
                Assegna il file all'associazione corretta e controlla subito preview e
                condivisione.
              </p>
            </div>

            <div className="grid gap-5 px-7 py-7">
              <div className="grid gap-4 lg:grid-cols-3">
                <select
                  className="premium-select w-full"
                  aria-label="Associazione del documento contabile"
                  value={documentForm.orgId}
                  onChange={(event) =>
                    setDocumentForm((current) => ({ ...current, orgId: event.target.value }))
                  }
                >
                  <option value="">Associazione</option>
                  {enabledTargets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}
                    </option>
                  ))}
                </select>
                <select
                  className="premium-select w-full"
                  aria-label="Cartella del documento contabile"
                  value={documentForm.folderId}
                  onChange={(event) =>
                    setDocumentForm((current) => ({ ...current, folderId: event.target.value }))
                  }
                >
                  <option value="">Cartella</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <select
                  className="premium-select w-full"
                  aria-label="Categoria del documento contabile"
                  value={documentForm.categoryId}
                  onChange={(event) =>
                    setDocumentForm((current) => ({
                      ...current,
                      categoryId: event.target.value,
                    }))
                  }
                >
                  <option value="">Categoria</option>
                  {categories
                    .filter((category) => category.is_active)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </div>

              <input
                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800"
                placeholder="Titolo documento"
                value={documentForm.title}
                onChange={(event) =>
                  setDocumentForm((current) => ({ ...current, title: event.target.value }))
                }
              />

              <textarea
                className="min-h-24 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-700"
                placeholder="Descrizione operativa"
                value={documentForm.description}
                onChange={(event) =>
                  setDocumentForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />

              <div className="rounded-[28px] border border-dashed border-neutral-300 bg-neutral-50/70 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">File sorgente</p>
                    <p className="mt-1 text-xs font-medium text-neutral-500">
                      PDF e immagini supportano la preview inline. Gli altri formati
                      restano scaricabili.
                    </p>
                  </div>
                  {documentForm.id ? (
                    <span className="rounded-full bg-neutral-900 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                      Update
                    </span>
                  ) : null}
                </div>
                <input
                  type="file"
                  className="mt-4 block w-full rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 file:mr-4 file:rounded-xl file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-xs file:font-bold file:uppercase file:tracking-widest file:text-white"
                  onChange={(event) =>
                    setDocumentForm((current) => ({
                      ...current,
                      file: event.target.files?.[0] ?? null,
                    }))
                  }
                />
                {documentForm.file ? (
                  <p className="mt-3 text-xs font-semibold text-neutral-500">
                    File selezionato: {documentForm.file.name}
                  </p>
                ) : documentForm.id ? (
                  <p className="mt-3 text-xs font-semibold text-neutral-500">
                    Nessun nuovo file selezionato: verrà mantenuto quello già registrato.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50/70 px-4 py-3 text-sm font-semibold text-neutral-700">
                  <input
                    type="checkbox"
                    checked={documentForm.previewEnabled}
                    onChange={(event) =>
                      setDocumentForm((current) => ({
                        ...current,
                        previewEnabled: event.target.checked,
                      }))
                    }
                  />
                  Preview inline abilitata
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50/70 px-4 py-3 text-sm font-semibold text-neutral-700">
                  <input
                    type="checkbox"
                    checked={documentForm.isShareEnabled}
                    onChange={(event) =>
                      setDocumentForm((current) => ({
                        ...current,
                        isShareEnabled: event.target.checked,
                      }))
                    }
                  />
                  Link condivisibili
                </label>
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                {documentForm.id ? (
                  <button type="button" className="btn-ghost" onClick={resetDocumentForm}>
                    Annulla
                  </button>
                ) : null}
                <button type="button" className="btn-primary" disabled={documentSaving} onClick={() => void saveDocument()}>
                  {documentSaving ? "Salvataggio…" : documentForm.id ? "Aggiorna documento" : "Carica documento"}
                </button>
              </div>
            </div>
          </section></div></ModalShell>
      <ModalShell open={detailOpen} title="Dettaglio documento contabile" onClose={() => setDetailOpen(false)} sizeClassName="max-w-2xl" contentClassName="sa-documents-dialog"><div className="sa-accounting-sidebar"><section className="surface overflow-hidden">
            <div className="border-b border-neutral-100 px-6 py-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">
                Dettaglio
              </p>
              <h3 className="mt-2 text-lg font-bold tracking-tight text-neutral-900">
                Documento selezionato
              </h3>
            </div>
            <div className="px-6 py-6">
              {selectedDocument ? (
                <div className="space-y-5">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="text-xl font-bold tracking-tight text-neutral-900">
                          {selectedDocument.title}
                        </h4>
                        <p className="mt-2 text-sm font-medium leading-6 text-neutral-500">
                          {selectedDocument.description ||
                            "Nessuna descrizione aggiuntiva."}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusChip
                          label={
                            selectedDocument.preview_available ? "Preview on" : "Preview off"
                          }
                          active={selectedDocument.preview_available}
                        />
                        <StatusChip
                          label={selectedDocument.is_share_enabled ? "Share on" : "Share off"}
                          active={selectedDocument.is_share_enabled}
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <MetadataTile
                        label="Associazione"
                        value={selectedDocument.organization?.name ?? "-"}
                      />
                      <MetadataTile label="File" value={selectedDocument.original_filename} />
                      <MetadataTile
                        label="Cartella"
                        value={selectedDocument.folder?.name ?? "-"}
                      />
                      <MetadataTile
                        label="Categoria"
                        value={selectedDocument.category?.name ?? "-"}
                      />
                      <MetadataTile
                        label="Data upload"
                        value={formatDateTime(selectedDocument.created_at)}
                      />
                      <MetadataTile
                        label="Peso"
                        value={formatBytes(selectedDocument.file_size)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() =>
                        window.open(
                          selectedDocument.open_url,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      Apri
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => void downloadSuperAdminSharedDocument(selectedDocument)}
                    >
                      Scarica
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => { returnToDetail.current = true; setDetailOpen(false); setPreviewDocument(selectedDocument); }}
                      disabled={!selectedDocument.preview_available}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => applyDocumentToForm(selectedDocument)}
                    >
                      Modifica
                    </button>
                    <button type="button" className="btn-ghost text-red-700" onClick={() => requestDelete({ type: "document", id: selectedDocument.id, label: selectedDocument.title })}>Elimina</button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">
                        Link condivisi
                      </p>
                      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
                        {(selectedDocument.share_links ?? []).length}
                      </span>
                    </div>
                    {(selectedDocument.share_links ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-sm font-medium text-neutral-500">
                        Nessun link attivo.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(selectedDocument.share_links ?? []).map((link) => (
                          <div
                            key={link.id}
                            className="rounded-2xl border border-neutral-200 bg-white px-4 py-4"
                          >
                            <p className="truncate text-sm font-semibold text-neutral-900">
                              {link.url}
                            </p>
                            <p className="mt-2 text-xs font-medium text-neutral-500">
                              {formatDateTime(link.created_at)}
                              {link.expires_at
                                ? ` · scade ${formatDateTime(link.expires_at)}`
                                : ""}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="btn-ghost !px-3 !py-2 text-xs"
                                onClick={() => void handleCopyLink(link.url)}
                              >
                                Copia
                              </button>
                              <button
                                type="button"
                                className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold uppercase tracking-widest text-red-700"
                                onClick={() => {
                                  void revokeSuperAdminAccountingShareLink(link.id)
                                    .then(loadWorkspace)
                                    .then(() =>
                                      showToast({
                                        title: "Condivisione",
                                        message: "Link revocato.",
                                        tone: "success",
                                      }),
                                    )
                                    .catch((err) => handleApiError("Condivisione", err));
                                }}
                              >
                                Revoca
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center text-sm font-medium text-neutral-500">
                  Seleziona un documento per vedere il dettaglio.
                </div>
              )}
            </div>
          </section></div></ModalShell>

      <AccountingDocumentPreviewModal
        document={previewDocument}
        open={previewDocument !== null}
        onClose={() => { setPreviewDocument(null); restoreDetail(); }}
        onDownload={(document) => downloadSuperAdminSharedDocument(document)}
        onOpenInNewTab={(document) => {
          window.open(document.open_url, "_blank", "noopener,noreferrer");
        }}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title="Conferma eliminazione"
        description={
          deleteTarget ? `Eliminare definitivamente ${deleteTarget.label}?` : ""
        }
        confirmLabel="Elimina definitivamente"
        tone="danger"
        confirmState={confirmState}
        onClose={() => {
          setDeleteTarget(null);
          setConfirmState("idle");
          restoreDetail();
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
};

export default SuperAdminAccountingWorkspace;
