import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AuthError, downloadMemberOrganizationStatute, fetchMemberDocuments, fetchMemberOrganizationStatute, uploadMemberDocument, type MemberDocumentItem, type MemberOrganizationStatuteResponse } from "../../lib/api";
import { useToast } from "../../components/ui/ToastProvider";
import { formatMemberDate } from "../../lib/memberDates";
import { publicUploadHint, validatePublicDocumentUpload } from "../../lib/uploadValidation";
import "./MemberDashboard.css";

const DOC_LABELS: Record<string, string> = { identity: "Documento di identità", fiscal_code: "Codice fiscale" };
const STATUS_LABELS: Record<string, string> = { approved: "Approvato", pending: "In verifica", uploaded: "In verifica", rejected: "Da sostituire", missing: "Da caricare" };
const formatBytes = (bytes?: number | null) => !bytes ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function DashboardDocuments() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const targetDocument = Number(params.get("document_id"));
  const [items, setItems] = useState<MemberDocumentItem[]>([]);
  const [allowedTypes, setAllowedTypes] = useState<string[]>(["identity", "fiscal_code"]);
  const [requiredTypes, setRequiredTypes] = useState<string[]>([]);
  const [uploadableTypes, setUploadableTypes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState(0);
  const [statute, setStatute] = useState<MemberOrganizationStatuteResponse | null>(null);
  const [statuteError, setStatuteError] = useState("");
  const [statuteLoading, setStatuteLoading] = useState(true);
  const [statuteDownloading, setStatuteDownloading] = useState(false);
  const uploadLock = useRef(false);
  const mounted = useRef(true);
  const requestSequence = useRef(0);
  const { showToast } = useToast();

  const load = useCallback(async (refresh = false) => {
    const sequence = ++requestSequence.current;
    if (!refresh) setLoading(true);
    setError("");
    try {
      const result = await fetchMemberDocuments();
      if (!mounted.current || sequence !== requestSequence.current) return;
      setItems(result.items ?? []);
      setRequiredTypes(result.required_types ?? []);
      setAllowedTypes(result.allowed_types ?? ["identity", "fiscal_code"]);
      setUploadableTypes(result.uploadable_types ?? null);
    } catch (reason) {
      if (!mounted.current || sequence !== requestSequence.current) return;
      if (reason instanceof AuthError) navigate("/login", { replace: true });
      else setError(reason instanceof Error ? reason.message : "Documenti non disponibili.");
    } finally { if (mounted.current && sequence === requestSequence.current) setLoading(false); }
  }, [navigate]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void load();
    setStatuteLoading(true);
    void fetchMemberOrganizationStatute().then(result => { if (active && mounted.current) setStatute(result); })
      .catch(reason => { if (active && mounted.current) { if (reason instanceof AuthError) navigate("/login", { replace: true }); else setStatuteError(reason instanceof Error ? reason.message : "Statuto non disponibile."); } })
      .finally(() => { if (active && mounted.current) setStatuteLoading(false); });
    return () => { active = false; mounted.current = false; requestSequence.current += 1; };
  }, [load, navigate, location.key]);

  const documents = useMemo(() => {
    const groups = new Map<string, MemberDocumentItem[]>();
    items.forEach(item => groups.set(item.type, [...groups.get(item.type) ?? [], item]));
    groups.forEach(group => group.sort((a, b) => (Date.parse(b.uploaded_at ?? "") || 0) - (Date.parse(a.uploaded_at ?? "") || 0) || b.id - a.id));
    return groups;
  }, [items]);
  const types = [...new Set([...allowedTypes, ...items.map(item => item.type)])];

  useEffect(() => {
    if (loading || !targetDocument) return;
    const type = items.find(item => item.id === targetDocument)?.type;
    if (type) document.getElementById(`member-document-${type}`)?.focus();
  }, [items, loading, targetDocument]);

  function select(type: string, file: File | null) {
    const invalid = file ? validatePublicDocumentUpload(file) : null;
    setFiles(current => ({ ...current, [type]: invalid ? null : file }));
    setFileErrors(current => ({ ...current, [type]: invalid ?? "" }));
    setSent(current => ({ ...current, [type]: "" }));
  }
  async function send(type: string) {
    const file = files[type];
    if (!file || uploadLock.current) return;
    uploadLock.current = true; setUploading(type); setFileErrors(current => ({ ...current, [type]: "" }));
    try {
      const result = await uploadMemberDocument(type as "identity" | "fiscal_code", file);
      if (!mounted.current) return;
      const message = result.message || "Documento inviato all'associazione. In attesa di verifica.";
      setSent(current => ({ ...current, [type]: message }));
      setFiles(current => ({ ...current, [type]: null })); setRevision(value => value + 1);
      showToast({ tone: "success", title: "Documento inviato", message });
      await load(true);
    } catch (reason) {
      if (!mounted.current) return;
      if (reason instanceof AuthError) navigate("/login", { replace: true });
      else setFileErrors(current => ({ ...current, [type]: reason instanceof Error ? reason.message : "Invio non riuscito. Riprova." }));
    } finally { uploadLock.current = false; if (mounted.current) setUploading(null); }
  }
  async function downloadStatute() {
    if (!statute?.available || statuteDownloading) return;
    setStatuteDownloading(true); setStatuteError("");
    try { await downloadMemberOrganizationStatute({ url: statute.download_url, filename: statute.filename }); }
    catch (reason) { if (reason instanceof AuthError) navigate("/login", { replace: true }); else setStatuteError(reason instanceof Error ? reason.message : "Download non riuscito."); }
    finally { setStatuteDownloading(false); }
  }

  return <div className="member-documents">
    <header><h1>Documentazione</h1><p>Carica i documenti e inviali alla tua associazione per la verifica.</p></header>
    <section className="surface member-documents__statute" aria-labelledby="member-statute-title">
      <div><h2 id="member-statute-title">Statuto associativo</h2><p>{statuteLoading ? "Caricamento…" : statute?.available ? [statute.filename || "Statuto.pdf", formatBytes(statute.size_bytes)].filter(Boolean).join(" · ") : "Non ancora disponibile"}</p></div>
      {statute?.available ? <button type="button" className="member-documents__download" onClick={() => void downloadStatute()} disabled={statuteDownloading} aria-label="Scarica statuto associativo">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" /></svg><span>{statuteDownloading ? "Download…" : "Scarica"}</span>
      </button> : null}
      {statuteError ? <p className="member-documents__error" role="alert">{statuteError}</p> : null}
    </section>
    <section aria-labelledby="member-certifications-title">
      <h2 id="member-certifications-title">Certificazioni personali</h2>
      <p className="member-documents__hint">{publicUploadHint}</p>
      {loading ? <p role="status">Caricamento documenti…</p> : error ? <div className="member-documents__error" role="alert">{error} <button type="button" onClick={() => void load(true)}>Riprova</button></div> : <div className="member-documents__list">
        {types.map(type => {
          const history = documents.get(type) ?? [];
          const latest = history[0]; const status = latest?.status ?? "missing";
          const canSend = allowedTypes.includes(type) && (uploadableTypes?.includes(type) ?? (!latest || status === "rejected"));
          return <section key={type} id={`member-document-${type}`} tabIndex={-1} className={`surface member-documents__item ${history.some(item => item.id === targetDocument) ? "is-targeted" : ""}`} aria-labelledby={`member-document-title-${type}`}>
            <div className="member-documents__item-heading"><h3 id={`member-document-title-${type}`}>{DOC_LABELS[type] || "Documento personale"}</h3><span className={`member-documents__badge is-${status}`}>{STATUS_LABELS[status] || "Ricevuto"}</span></div>
            <p className="member-documents__hint">{requiredTypes.includes(type) ? "Richiesto dall'associazione" : "Facoltativo"}{latest ? ` · Inviato il ${formatMemberDate(latest.uploaded_at)}` : ""}</p>
            {latest ? <div className="member-documents__file"><span>{latest.filename}{latest.size_bytes ? ` · ${formatBytes(latest.size_bytes)}` : ""}</span><a href={latest.download_url} aria-label={`Scarica ${DOC_LABELS[type] || "documento"}`}>Scarica</a></div> : null}
            {status === "rejected" ? <div className="member-documents__rejection" data-tour="member-document-rejected"><strong>Indicazioni dell'associazione</strong><p>{latest?.rejection_note || "Carica una nuova versione leggibile e completa del documento."}</p></div> : null}
            {sent[type] ? <p className="member-documents__success" role="status">{sent[type]}</p> : null}
            {canSend ? <form className="member-documents__upload" data-tour="member-upload-document" onSubmit={event => { event.preventDefault(); void send(type); }}>
              <label htmlFor={`member-upload-${type}`}>{status === "rejected" ? "Scegli il documento corretto" : "Scegli il documento da inviare"}</label>
              <input key={`${type}-${revision}`} id={`member-upload-${type}`} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={uploading !== null} onChange={event => select(type, event.target.files?.[0] ?? null)} aria-describedby={fileErrors[type] ? `member-upload-error-${type}` : undefined} aria-invalid={Boolean(fileErrors[type])} />
              {files[type] ? <p className="member-documents__hint">Pronto per l'invio: {files[type]?.name}</p> : null}
              {fileErrors[type] ? <p id={`member-upload-error-${type}`} className="member-documents__error" role="alert">{fileErrors[type]}</p> : null}
              <button className="btn-primary" type="submit" disabled={!files[type] || uploading !== null}>{uploading === type ? "Invio in corso…" : status === "rejected" ? "Reinvia documento" : "Invia documento"}</button>
            </form> : null}
          </section>;
        })}
      </div>}
    </section>
  </div>;
}
