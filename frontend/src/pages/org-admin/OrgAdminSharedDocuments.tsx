import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Skeleton from "../../components/ui/Skeleton";
import {
  AuthError,
  downloadOrgAdminSharedDocument,
  fetchOrgAdminSharedDocuments,
  type OrgSharedDocumentItem,
} from "../../lib/api";
import { useOrgAdmin } from "./OrgAdminLayout";

type ViewMode = "grid" | "list";
type FileCategory = "pdf" | "image" | "spreadsheet" | "word" | "archive" | "file";

type FileVisualMeta = {
  category: FileCategory;
  badgeLabel: string;
  extensionLabel: string;
  badgeClass: string;
  iconWrapClass: string;
};

const formatDateShort = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

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
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

function resolveFileVisualMeta(document: Pick<OrgSharedDocumentItem, "original_filename" | "mime_type">): FileVisualMeta {
  const filename = (document.original_filename || "").trim();
  const extRaw = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
  const mime = (document.mime_type || "").toLowerCase();
  const extUpper = extRaw ? extRaw.toUpperCase() : "FILE";

  if (extRaw === "pdf" || mime.includes("pdf")) {
    return {
      category: "pdf",
      badgeLabel: "PDF",
      extensionLabel: "PDF",
      badgeClass: "border-rose-500/35 bg-rose-500/15 text-rose-500",
      iconWrapClass: "border-rose-500/30 bg-rose-500/12 text-rose-500",
    };
  }

  if (
    ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extRaw)
    || mime.startsWith("image/")
  ) {
    return {
      category: "image",
      badgeLabel: "IMG",
      extensionLabel: extUpper !== "FILE" ? extUpper : "IMG",
      badgeClass: "border-sky-500/35 bg-sky-500/15 text-sky-500",
      iconWrapClass: "border-sky-500/30 bg-sky-500/12 text-sky-500",
    };
  }

  if (
    ["xls", "xlsx", "csv", "ods"].includes(extRaw)
    || mime.includes("spreadsheet")
    || mime.includes("excel")
    || mime.includes("csv")
  ) {
    return {
      category: "spreadsheet",
      badgeLabel: "XLS",
      extensionLabel: extUpper !== "FILE" ? extUpper : "XLS",
      badgeClass: "border-emerald-500/35 bg-emerald-500/15 text-emerald-500",
      iconWrapClass: "border-emerald-500/30 bg-emerald-500/12 text-emerald-500",
    };
  }

  if (
    ["doc", "docx", "odt", "rtf", "txt"].includes(extRaw)
    || mime.includes("word")
    || mime.startsWith("text/")
  ) {
    return {
      category: "word",
      badgeLabel: "DOC",
      extensionLabel: extUpper !== "FILE" ? extUpper : "DOC",
      badgeClass: "border-indigo-500/35 bg-indigo-500/15 text-indigo-500",
      iconWrapClass: "border-indigo-500/30 bg-indigo-500/12 text-indigo-500",
    };
  }

  if (["zip", "rar", "7z", "tar", "gz"].includes(extRaw) || mime.includes("zip")) {
    return {
      category: "archive",
      badgeLabel: "ZIP",
      extensionLabel: extUpper !== "FILE" ? extUpper : "ZIP",
      badgeClass: "border-amber-500/35 bg-amber-500/15 text-amber-500",
      iconWrapClass: "border-amber-500/30 bg-amber-500/12 text-amber-500",
    };
  }

  return {
    category: "file",
    badgeLabel: extUpper.slice(0, 4),
    extensionLabel: extUpper,
    badgeClass: "border-[var(--oa-line-strong)] bg-[var(--oa-panel-soft)] text-[var(--oa-muted)]",
    iconWrapClass: "border-[var(--oa-line-strong)] bg-[var(--oa-panel-soft)] text-[var(--oa-brand-strong)]",
  };
}

function DocumentTypeIcon({ category }: { category: FileCategory }) {
  if (category === "pdf") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    );
  }
  if (category === "image") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
      </svg>
    );
  }
  if (category === "spreadsheet") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 0h7.5" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

const OrgAdminSharedDocuments = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { admin, loading: adminLoading } = useOrgAdmin();
  const kind = useMemo(
    () => (location.pathname.includes("/contabilita") ? "accounting" : "general") as "general" | "accounting",
    [location.pathname],
  );

  const [items, setItems] = useState<OrgSharedDocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  useEffect(() => {
    if (adminLoading) return;
    if (!admin) return;
    if (kind === "accounting" && !admin.organization?.accounting_enabled) {
      navigate("/org-admin", { replace: true });
      return;
    }

    fetchOrgAdminSharedDocuments(kind)
      .then((response) => {
        setItems(response.items);
        setError("");
      })
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Errore nel caricamento documenti.");
      })
      .finally(() => setLoading(false));
  }, [admin, adminLoading, kind, navigate]);

  const handleDownload = async (document: OrgSharedDocumentItem) => {
    try {
      setDownloadingId(document.id);
      setError("");
      await downloadOrgAdminSharedDocument(document);
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

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q)
        || (doc.original_filename || "").toLowerCase().includes(q)
        || (doc.description || "").toLowerCase().includes(q),
    );
  }, [items, searchQuery]);

  const heading =
    kind === "accounting"
      ? {
          badge: "Contabilità",
          tagLabel: "ACCOUNTING",
          title: "Documenti contabili",
          description: "Archivio riservato dei documenti contabili inviati alla tua associazione.",
        }
      : {
          badge: "Documenti",
          tagLabel: "GENERAL",
          title: "Documenti associazione",
          description: "Comunicazioni operative e documenti generali assegnati alla tua associazione.",
        };

  if (adminLoading || loading) {
    return (
      <div className="container-shell org-admin-mobile-page org-admin-shared-docs-page py-8 pb-28 space-y-5">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="container-shell org-admin-mobile-page org-admin-shared-docs-page py-8 pb-28 space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="org-eyebrow hidden md:block">{heading.badge}</p>
          <h1 className="org-page-header__title flex items-baseline gap-2 !text-xl md:!text-2xl">
            <span>{heading.title}</span>
            <span className="text-sm font-semibold text-[var(--oa-muted)]">({filteredItems.length})</span>
          </h1>
          <p className="org-page-header__subtitle hidden md:block">{heading.description}</p>
        </div>

        {items.length > 0 && (
          <div className="flex w-full items-center gap-2 md:w-auto">
            <div className="relative min-w-0 flex-1 md:w-64 md:flex-initial">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--oa-muted)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="search"
                aria-label="Cerca documenti"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Cerca titolo o file..."
                className="theme-input w-full rounded-lg py-2 pl-9 pr-3 text-xs sm:text-sm"
              />
            </div>

            <div
              className="inline-flex shrink-0 items-center rounded-lg border border-[var(--oa-line-strong)] bg-[var(--oa-panel-soft)] p-0.5"
              role="group"
              aria-label="Modalità di visualizzazione"
            >
              <button
                type="button"
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition ${
                  viewMode === "grid"
                    ? "bg-[var(--oa-panel)] text-[var(--oa-brand-strong)] shadow-sm"
                    : "text-[var(--oa-muted)] hover:text-[var(--oa-text)]"
                }`}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h3A1.5 1.5 0 0 1 9 4.5v3A1.5 1.5 0 0 1 7.5 9h-3A1.5 1.5 0 0 1 3 7.5v-3Zm8 0A1.5 1.5 0 0 1 12.5 3h3A1.5 1.5 0 0 1 17 4.5v3A1.5 1.5 0 0 1 15.5 9h-3A1.5 1.5 0 0 1 11 7.5v-3ZM3 12.5A1.5 1.5 0 0 1 4.5 11h3A1.5 1.5 0 0 1 9 12.5v3A1.5 1.5 0 0 1 7.5 17h-3A1.5 1.5 0 0 1 3 15.5v-3Zm8 0A1.5 1.5 0 0 1 12.5 11h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3a1.5 1.5 0 0 1-1.5-1.5v-3Z" />
                </svg>
                <span>Schede</span>
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition ${
                  viewMode === "list"
                    ? "bg-[var(--oa-panel)] text-[var(--oa-brand-strong)] shadow-sm"
                    : "text-[var(--oa-muted)] hover:text-[var(--oa-text)]"
                }`}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 5A.75.75 0 0 1 2.75 9h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 9.75Zm0 5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
                </svg>
                <span>Elenco</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {error && (
        <div
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {filteredItems.length === 0 ? (
        <section className="org-section-panel px-6 py-12 text-center">
          <p className="text-sm font-semibold text-[var(--oa-muted)]">
            {items.length === 0
              ? "Nessun documento disponibile in questa sezione."
              : "Nessun documento corrisponde alla ricerca."}
          </p>
        </section>
      ) : viewMode === "grid" ? (
        /* COMPACT HORIZONTAL CARDS (GRID VIEW) */
        <div className="grid gap-3 lg:grid-cols-2" data-testid="shared-documents-grid">
          {filteredItems.map((document) => {
            const fileMeta = resolveFileVisualMeta(document);
            const hasDescription = Boolean(document.description && document.description.trim());
            const isDownloading = downloadingId === document.id;

            return (
              <article
                key={document.id}
                className="group flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--oa-line-strong)] bg-[var(--oa-panel)] p-3.5 sm:p-4 shadow-sm transition hover:border-[var(--oa-brand)]/50"
              >
                {/* Left: Recognizable File Type Icon + Badge */}
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border ${fileMeta.iconWrapClass}`}
                  >
                    <DocumentTypeIcon category={fileMeta.category} />
                  </div>
                  <span
                    className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider leading-none ${fileMeta.badgeClass}`}
                  >
                    {fileMeta.badgeLabel}
                  </span>
                </div>

                {/* Center: Tag + Date, Title, 1-line Description, Inline File Meta */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--oa-muted)]">
                    <span>{heading.tagLabel}</span>
                    <span aria-hidden="true">•</span>
                    <span className="tabular-nums">{formatDateShort(document.created_at)}</span>
                  </div>

                  <h3 className="mt-0.5 truncate text-sm sm:text-[15px] font-bold leading-snug text-[var(--oa-text)]">
                    {document.title}
                  </h3>

                  {hasDescription && (
                    <p className="mt-0.5 truncate text-xs text-[var(--oa-muted)]">
                      {document.description}
                    </p>
                  )}

                  <p className="mt-1 truncate text-xs font-medium text-[var(--oa-muted)]">
                    <span className="text-[var(--oa-text)]/85">{document.original_filename}</span>
                    {" • "}
                    <span className="tabular-nums">{formatBytes(document.size_bytes)}</span>
                  </p>
                </div>

                {/* Right: Compact Download Action */}
                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleDownload(document)}
                    disabled={isDownloading}
                    aria-label={`Scarica ${document.title}`}
                    className="btn-secondary !min-h-9 inline-flex items-center gap-1.5 !rounded-xl !px-2.5 sm:!px-3 !py-1.5 !text-xs font-semibold"
                  >
                    <svg
                      className="h-4 w-4 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                      />
                    </svg>
                    <span className="hidden sm:inline">
                      {isDownloading ? "Download..." : "Scarica"}
                    </span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* SCALABLE TABLE / LIST VIEW */
        <section className="org-section-panel overflow-hidden !p-0" data-testid="shared-documents-list">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--oa-line)] bg-[var(--oa-panel-soft)] text-[11px] font-bold uppercase tracking-wider text-[var(--oa-muted)]">
                <tr>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Nome documento</th>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Assegnato da</th>
                  <th className="px-4 py-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--oa-line)]">
                {filteredItems.map((document) => {
                  const fileMeta = resolveFileVisualMeta(document);
                  const isDownloading = downloadingId === document.id;
                  return (
                    <tr key={document.id} className="transition hover:bg-[var(--oa-panel-soft)]/60">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-extrabold uppercase ${fileMeta.badgeClass}`}
                        >
                          <DocumentTypeIcon category={fileMeta.category} />
                          <span>{fileMeta.badgeLabel}</span>
                        </span>
                      </td>
                      <td className="max-w-xs px-4 py-3">
                        <p className="truncate font-bold text-[var(--oa-text)]">{document.title}</p>
                        {document.description && (
                          <p className="mt-0.5 truncate text-xs text-[var(--oa-muted)]">
                            {document.description}
                          </p>
                        )}
                      </td>
                      <td className="max-w-[220px] px-4 py-3 text-xs text-[var(--oa-muted)]">
                        <p className="truncate font-medium text-[var(--oa-text)]">
                          {document.original_filename}
                        </p>
                        <p className="mt-0.5 tabular-nums">{formatBytes(document.size_bytes)}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs tabular-nums text-[var(--oa-muted)]">
                        {formatDateTime(document.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-[var(--oa-muted)]">
                        Super Admin · {heading.tagLabel}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => void handleDownload(document)}
                          disabled={isDownloading}
                          aria-label={`Scarica ${document.title}`}
                          className="btn-secondary !min-h-8 inline-flex items-center gap-1.5 !rounded-lg !px-3 !py-1.5 !text-xs font-semibold"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                            />
                          </svg>
                          <span>{isDownloading ? "Download..." : "Scarica"}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[var(--oa-line)] md:hidden">
            {filteredItems.map((document) => {
              const fileMeta = resolveFileVisualMeta(document);
              const isDownloading = downloadingId === document.id;
              return (
                <div key={document.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={`inline-flex h-9 w-11 shrink-0 items-center justify-center rounded-lg border text-[11px] font-extrabold ${fileMeta.badgeClass}`}
                    >
                      {fileMeta.badgeLabel}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--oa-text)]">{document.title}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--oa-muted)]">
                        {fileMeta.extensionLabel} • {formatBytes(document.size_bytes)} • {formatDateShort(document.created_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDownload(document)}
                    disabled={isDownloading}
                    aria-label={`Scarica ${document.title}`}
                    className="btn-secondary !min-h-8 shrink-0 !rounded-lg !px-2.5 !py-1.5 !text-xs font-semibold"
                  >
                    {isDownloading ? "..." : "Scarica"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default OrgAdminSharedDocuments;
