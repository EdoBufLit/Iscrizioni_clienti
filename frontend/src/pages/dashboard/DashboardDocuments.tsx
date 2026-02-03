import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AuthError,
  fetchMemberDocuments,
  resubmitMemberDocument,
  type MemberDocumentItem,
} from "../../lib/api";

const DOC_LABELS: Record<string, string> = {
  identity: "Documento Identità",
  fiscal_code: "Codice Fiscale",
};

const STATUS_META: Record<string, { label: string; tone: string }> = {
  approved: {
    label: "Approvato",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  pending: {
    label: "In revisione",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  uploaded: {
    label: "In revisione",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  rejected: {
    label: "Rigettato",
    tone: "border-red-200 bg-red-50 text-red-700",
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMemberDocuments();
      setItems(data.items ?? []);
      setRequiredTypes(data.required_types?.length ? data.required_types : ["identity", "fiscal_code"]);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Errore nel caricamento documenti");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

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

  const docById = useMemo(() => new Map(items.map((doc) => [doc.id, doc])), [items]);

  const allTypes = useMemo(() => {
    const set = new Set<string>(requiredTypes);
    items.forEach((doc) => set.add(doc.type));
    return Array.from(set);
  }, [items, requiredTypes]);

  const rejectedDocs = allTypes
    .map((type) => docsByType.get(type)?.[0])
    .filter((doc): doc is MemberDocumentItem => Boolean(doc))
    .filter((doc) => normalizeStatus(doc.status) === "rejected");

  const handleResubmit = async (docId: number, file?: File) => {
    if (!file) return;
    setActionError(null);
    setActionMessage(null);
    setUploadingId(docId);
    try {
      await resubmitMemberDocument(docId, file);
      setActionMessage("Documento reinviato. Stato: In revisione.");
      await loadDocuments();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Errore durante il reinvio");
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Documenti</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Consulta lo stato dei documenti richiesti e carica una nuova versione se necessario.
      </p>

      {loading ? (
        <div className="surface mt-8 p-7">
          <p className="text-sm text-neutral-500">Caricamento documenti...</p>
        </div>
      ) : error ? (
        <div className="mt-8 rounded-lg border border-red-200/60 bg-red-50 px-7 py-5 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <>
          <div className="surface mt-8 p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-neutral-900">Documenti richiesti</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Verifica che ogni documento sia approvato. Se manca qualcosa, contatta l&apos;associazione.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {allTypes.map((type) => {
                  const latest = docsByType.get(type)?.[0];
                  const status = latest ? normalizeStatus(latest.status) : "missing";
                  const meta =
                    status === "missing"
                      ? { label: "Da caricare", tone: "border-neutral-200 bg-neutral-50 text-neutral-600" }
                      : STATUS_META[status] ?? { label: status, tone: "border-neutral-200 bg-neutral-50 text-neutral-600" };
                  return (
                    <span
                      key={type}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${meta.tone}`}
                    >
                      {DOC_LABELS[type] ?? type}
                      <span className="text-[10px] opacity-80">{meta.label}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {actionError && (
            <div className="mt-6 rounded-lg border border-red-200/60 bg-red-50 px-6 py-4 text-sm text-red-700">
              {actionError}
            </div>
          )}
          {actionMessage && (
            <div className="mt-6 rounded-lg border border-emerald-200/60 bg-emerald-50 px-6 py-4 text-sm text-emerald-700">
              {actionMessage}
            </div>
          )}

          {allTypes.length === 0 ? (
            <div className="surface mt-6 overflow-hidden">
              <div className="flex flex-col items-center px-7 py-14 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-50">
                  <svg
                    className="h-6 w-6 text-neutral-300"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                  </svg>
                </div>
                <p className="mt-5 text-base font-semibold text-neutral-900">
                  Nessun documento disponibile
                </p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-neutral-500">
                  I documenti saranno visibili in questa sezione una volta completata la pratica.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {allTypes.map((type) => {
                const docs = docsByType.get(type) ?? [];
                const latest = docs.length ? docs[0] : undefined;
                const chain: MemberDocumentItem[] = [];
                let cursor = latest;
                while (cursor && chain.length < 3) {
                  chain.push(cursor);
                  if (!cursor.replaces_document_id) break;
                  cursor = docById.get(cursor.replaces_document_id);
                }
                const normalizedStatus = latest ? normalizeStatus(latest.status) : "missing";
                const statusMeta =
                  normalizedStatus === "missing"
                    ? { label: "Da caricare", tone: "border-neutral-200 bg-neutral-50 text-neutral-600" }
                    : STATUS_META[normalizedStatus] ?? { label: normalizedStatus, tone: "border-neutral-200 bg-neutral-50 text-neutral-600" };

                return (
                  <div key={type} className="surface p-7">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-neutral-900">
                          {DOC_LABELS[type] ?? type}
                        </h2>
                        <p className="mt-1 text-sm text-neutral-500">
                          {latest ? `Ultimo upload: ${formatDate(latest.uploaded_at)}` : "Documento non ancora caricato"}
                        </p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusMeta.tone}`}>
                        {statusMeta.label}
                      </span>
                    </div>

                    {latest && (
                      <div className="mt-4 rounded-lg border border-neutral-100 bg-white/80 px-4 py-3 text-sm text-neutral-600">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-neutral-800">{latest.filename}</p>
                            <p className="mt-1 text-xs text-neutral-400">
                              {formatBytes(latest.size_bytes) ?? "Dimensione non disponibile"}
                            </p>
                          </div>
                          <a
                            href={latest.download_url}
                            className="text-sm font-medium text-brand hover:text-brand-dark"
                          >
                            Scarica
                          </a>
                        </div>
                      </div>
                    )}

                    {normalizedStatus === "rejected" && latest && (
                      <div className="mt-4 rounded-lg border border-red-200/70 bg-red-50 px-4 py-4">
                        <p className="text-sm font-semibold text-red-700">Azione richiesta</p>
                        <p className="mt-1 text-sm text-red-600">
                          {latest.rejection_note
                            ? `Note admin: ${latest.rejection_note}`
                            : "Il documento Ã¨ stato rigettato. Carica una nuova versione."}
                        </p>
                        <div className="mt-3">
                          <label className="btn-primary cursor-pointer">
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
                            {uploadingId === latest.id ? "Caricamento..." : "Carica nuovo documento"}
                          </label>
                        </div>
                      </div>
                    )}

                    {chain.length > 1 && (
                      <div className="mt-4 rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          Storico recente
                        </p>
                        <ul className="mt-2 space-y-1 text-xs text-neutral-600">
                          {chain
                            .slice()
                            .reverse()
                            .map((doc, index) => {
                              const stepStatus = normalizeStatus(doc.status);
                              const stepMeta =
                                STATUS_META[stepStatus] ?? { label: stepStatus, tone: "border-neutral-200 bg-neutral-50 text-neutral-600" };
                              return (
                                <li key={doc.id} className="flex items-center gap-2">
                                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stepMeta.tone}`}>
                                    {stepMeta.label}
                                  </span>
                                  <span>
                                    Doc #{doc.id} â€” {formatDate(doc.uploaded_at)}
                                  </span>
                                  {index === chain.length - 1 && (
                                    <span className="text-[10px] uppercase tracking-wide text-neutral-400">Ultimo</span>
                                  )}
                                </li>
                              );
                            })}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {rejectedDocs.length > 0 && (
            <div className="mt-8 rounded-lg border border-amber-200/70 bg-amber-50 px-7 py-5 text-sm text-amber-700">
              Sono presenti documenti rigettati. Carica una nuova versione per completare la verifica.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DashboardDocuments;
