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

  const heading =
    kind === "accounting"
      ? {
          badge: "Contabilità",
          title: "Documenti contabili",
          description: "Archivio riservato dei documenti contabili inviati alla tua associazione.",
        }
      : {
          badge: "Documenti",
          title: "Documenti associazione",
          description: "Comunicazioni operative e documenti generali assegnati alla tua associazione.",
        };

  if (adminLoading || loading) {
    return (
      <div className="container-shell py-10 space-y-8">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="container-shell py-10 space-y-8">
      <section className="surface overflow-hidden">
        <div className="border-b border-neutral-100 px-7 py-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">{heading.badge}</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">{heading.title}</h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-neutral-500">{heading.description}</p>
        </div>

        {error && (
          <div className="border-b border-red-100 bg-red-50/80 px-7 py-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-5 px-7 py-7 sm:grid-cols-2 xl:grid-cols-3">
          {items.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-dashed border-neutral-300 bg-neutral-50/70 px-6 py-12 text-center">
              <p className="text-sm font-semibold text-neutral-500">
                Nessun documento disponibile in questa sezione.
              </p>
            </div>
          ) : (
            items.map((document) => (
              <article
                key={document.id}
                className="group rounded-3xl border border-neutral-200 bg-white p-6 shadow-[0_18px_60px_-40px_rgba(15,23,42,0.32)] transition hover:-translate-y-0.5 hover:border-brand/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-400">
                      {kind === "accounting" ? "Accounting" : "General"}
                    </p>
                    <h3 className="mt-3 text-lg font-bold tracking-tight text-neutral-900">{document.title}</h3>
                  </div>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/5 text-brand">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-7.5a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 6 6.75v10.5A2.25 2.25 0 0 0 8.25 19.5h4.5m2.121-8.379 3.75 3.75m0 0 3.75-3.75m-3.75 3.75V3.75" />
                    </svg>
                  </div>
                </div>

                <p className="mt-4 min-h-16 text-sm font-medium leading-relaxed text-neutral-500">
                  {document.description || "Documento caricato dal Super Admin senza descrizione aggiuntiva."}
                </p>

                <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-2xl bg-neutral-50/80 px-4 py-3">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Caricato</dt>
                    <dd className="mt-2 font-bold text-neutral-900">{formatDateTime(document.created_at)}</dd>
                  </div>
                  <div className="rounded-2xl bg-neutral-50/80 px-4 py-3">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Formato</dt>
                    <dd className="mt-2 font-bold text-neutral-900">
                      {document.original_filename} · {formatBytes(document.size_bytes)}
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  className="btn-primary mt-6 w-full justify-center"
                  onClick={() => void handleDownload(document)}
                  disabled={downloadingId === document.id}
                >
                  {downloadingId === document.id ? "Download..." : "Apri / scarica"}
                </button>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default OrgAdminSharedDocuments;
