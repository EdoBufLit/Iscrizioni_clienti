import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ModalShell from "../../../components/ui/ModalShell";
import { apiFetch, invalidateSwrCache, fetchOrgAdminMembers, fetchOrgAdminMemberDetail, type OrgAdminMemberDetail, type OrgAdminMemberDocument } from "../../../lib/api";
import RejectDocumentModal from "./RejectDocumentModal";
import { useToast } from "../../../components/ui/ToastProvider";
import "./DocumentReviewQueue.css";

export function pendingReviewDocuments(documents: OrgAdminMemberDocument[]) {
  const replaced = new Set(documents.map(doc => doc.replaces_document_id));
  return documents.filter(doc => !replaced.has(doc.id) && ["pending", "uploaded"].includes(doc.status));
}

export default function DocumentReviewQueue({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [member, setMember] = useState<OrgAdminMemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const lock = useRef(false);
  const mounted = useRef(true);
  const { showToast } = useToast();
  const doc = member ? pendingReviewDocuments(member.documents)[0] : undefined;
  useEffect(() => () => { mounted.current = false; }, []);
  const loadNext = useCallback(async () => {
    setLoading(true); setError("");
    invalidateSwrCache("org-admin:members:");
    try {
      // Always read the current queue: decisions in another session must not be replayed.
      let next: OrgAdminMemberDetail | null = null;
      let offset = 0, total = 0;
      do {
        const page = await fetchOrgAdminMembers({ status: "review", docs: "pending", limit: 25, offset });
        total = page.total;
        for (const item of page.items) {
          if (item.deleted_at) continue;
          const detail = await fetchOrgAdminMemberDetail(item.id);
          if (!detail.deleted_at && pendingReviewDocuments(detail.documents).length) { next = detail; break; }
        }
        offset += page.items.length;
        if (!page.items.length) break;
      } while (!next && offset < total && mounted.current);
      if (mounted.current) { setMember(next); setRemaining(total); }
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : "Impossibile caricare la coda."); }
    finally { if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => { mounted.current = true; void loadNext(); }, [loadNext]);

  async function decide(approved: boolean, note?: string) {
    if (!doc || !member || lock.current) return;
    lock.current = true; setSaving(true); setError("");
    try {
      const response = await apiFetch(`/api/org-admin/documents/${doc.id}/${approved ? "approve" : "reject"}`, {
        method: "POST", ...(approved ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rejection_note: note }) }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof result?.detail === "string" ? result.detail : "Decisione non salvata. Riprova.");
      if (!mounted.current) return;
      setRejecting(false);
      showToast({ tone: "success", message: approved ? "Documento approvato." : result?.email_status === "failed" ? "Rigetto salvato. Email non accodata: reinvia la richiesta dal profilo socio." : "Rigetto e motivazione salvati." });
      onChanged();
      const documents = member.documents.map(item => item.id === doc.id ? { ...item, status: approved ? "approved" : "rejected" } : item);
      setMember({ ...member, documents });
      if (!pendingReviewDocuments(documents).length) await loadNext();
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : "Decisione non salvata."); }
    finally { lock.current = false; if (mounted.current) setSaving(false); }
  }

  return <>
    <ModalShell open title="Revisione documenti" description="Approva o rigetta: la coda passa automaticamente al prossimo documento." onClose={() => { if (!saving && !rejecting) onClose(); }} closeDisabled={saving || rejecting} closeOnEscape={!saving && !rejecting} closeOnOverlay={!saving && !rejecting} sizeClassName="max-w-5xl" contentClassName="document-review-shell">
      {error && <div role="alert" className="document-review-error">{error} {(!member || !doc) && <button type="button" onClick={() => void loadNext()}>Riprova</button>}</div>}
      {loading ? <p role="status">Caricamento documento…</p> : !doc || !member ? <p role="status">{error ? "Coda non aggiornata. Riprova il caricamento." : "Nessun documento in attesa di revisione."}</p> : <div className="document-review-grid">
        <div className="document-review-preview">
          {["image/jpeg", "image/png", "image/webp", "image/gif"].includes(doc.mime_type || "") ? <img key={doc.id} src={`/api/org-admin/documents/${doc.id}?preview=true`} alt={`Documento di ${member.first_name} ${member.last_name}`} /> : doc.mime_type === "application/pdf" ? <iframe key={doc.id} title={`Anteprima ${doc.filename}`} src={`/api/org-admin/documents/${doc.id}?preview=true`} /> : <p>Apri il documento per consultare il file.</p>}
          <a href={doc.download_url || `/api/org-admin/documents/${doc.id}`} target="_blank" rel="noopener noreferrer">Apri documento in una nuova scheda</a>
        </div>
        <div className="document-review-actions">
          <p aria-live="polite">{remaining} soci in coda</p>
          <h3>{member.first_name} {member.last_name}</h3>
          <p>{doc.type === "identity" ? "Documento d’identità" : doc.type === "fiscal_code" ? "Codice fiscale" : doc.type}</p>
          <p className="document-review-filename">{doc.filename}</p>
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void decide(true)}>{saving ? "Salvataggio…" : "Approva e continua"}</button>
          <button type="button" className="btn-secondary" disabled={saving} onClick={() => { setError(""); setRejecting(true); }}>Rigetta con motivazione</button>
          <Link to={`/org-admin/soci/${member.id}?tab=documents`} onClick={onClose}>Vedi profilo completo</Link>
        </div>
      </div>}
    </ModalShell>
    <RejectDocumentModal open={rejecting} docLabel={doc?.filename || "Documento"} isSubmitting={saving} error={error} onClose={() => { if (!saving) setRejecting(false); }} onConfirm={note => void decide(false, note)} />
  </>;
}
