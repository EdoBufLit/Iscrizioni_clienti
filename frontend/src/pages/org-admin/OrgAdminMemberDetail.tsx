import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { createManualPayment } from "../../lib/api";
import ManualPaymentForm, { type ManualPaymentPayload } from "./components/ManualPaymentForm";
import MemberDecisionPanel from "./components/MemberDecisionPanel";
import RejectDocumentModal from "./components/RejectDocumentModal";

interface Document {
  id: number;
  type: string;
  filename: string;
  mime_type?: string;
  size_bytes?: number;
  download_url?: string;
  uploaded_at: string;
  status: string;
  review_notes?: string;
  rejection_note?: string | null;
  reviewed_at?: string;
  replaces_document_id?: number | null;
}

interface Payment {
  id: number;
  amount_cents: number;
  amount: number;
  method: string;
  paid_at: string | null;
  notes?: string | null;
}

interface ActivityItem {
  id: number;
  action: string;
  created_at: string | null;
  actor_admin_id?: number | null;
  actor_admin_email?: string | null;
  actor_member_id?: number | null;
  actor_member_name?: string | null;
  actor_role?: string | null;
  entity_type?: string | null;
  entity_id?: number | null;
  metadata?: Record<string, unknown> | null;
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

interface MemberDetail {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  fiscal_code: string | null;
  payment_method?: string | null;
  status: string;
  workflow_status?: string | null;
  is_active: boolean;
  deleted_at?: string | null;
  card_no?: number;
  card_number?: number | null;
  card_year?: number | null;
  joined_at?: string;
  member_type?: string | null;
  internal_notes?: string | null;
  is_manual?: boolean;
  has_access?: boolean;
  last_access_email_at?: string | null;
  document_status?: string;
  documents: Document[];
  payments?: Payment[];
  activities?: ActivityItem[];
  decision_notes?: string;
  decision_at?: string;
  decision_by_admin_id?: number;
}

export default function OrgAdminMemberDetail() {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "activity">("details");
  const [reviewingDocId, setReviewingDocId] = useState<number | null>(null);
  const [sendingAccess, setSendingAccess] = useState(false);
  const [sendAccessMessage, setSendAccessMessage] = useState<string | null>(null);
  const [sendAccessError, setSendAccessError] = useState<string | null>(null);
  const [rejectingDoc, setRejectingDoc] = useState<Document | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const ACTION_LABELS: Record<string, string> = {
    "member.manual_create": "Socio creato",
    "member.update": "Socio modificato",
    "member.access_sent": "Accesso inviato",
    "member_doc.review": "Documento revisionato",
    "member.document.resubmit": "Documento reinviato",
    "member.payment.manual": "Pagamento manuale registrato",
    "member.decision": "Decisione iscrizione",
  };

  const getActivityMeta = (item: ActivityItem) => {
    const meta = item.metadata ?? {};
    let label = ACTION_LABELS[item.action] ?? item.action;
    let details = "";
    let category = "Attività";
    let tone = "border-neutral-200 bg-neutral-50 text-neutral-600";

    if (item.action === "member_doc.review") {
      category = "Documenti";
      const status = meta && typeof meta === "object" ? (meta as Record<string, unknown>).status : null;
      if (status === "approved") {
        label = "Documento approvato";
        tone = "border-emerald-200 bg-emerald-50 text-emerald-700";
      } else if (status === "rejected") {
        label = "Documento rigettato";
        tone = "border-red-200 bg-red-50 text-red-700";
        const note = (meta as Record<string, unknown>)?.rejection_note;
        if (typeof note === "string" && note.trim()) {
          details = `Note: ${note}`;
        }
      } else {
        tone = "border-amber-200 bg-amber-50 text-amber-700";
      }
    } else if (item.action === "member.document.resubmit") {
      category = "Documenti";
      tone = "border-amber-200 bg-amber-50 text-amber-700";
      const docType = (meta as Record<string, unknown>)?.doc_type;
      if (typeof docType === "string") {
        details = `Tipo: ${docType}`;
      }
    } else if (item.action === "member.payment.manual") {
      category = "Pagamenti";
      tone = "border-emerald-200 bg-emerald-50 text-emerald-700";
      const amountCents = (meta as Record<string, unknown>)?.amount_cents;
      const method = (meta as Record<string, unknown>)?.method;
      if (typeof amountCents === "number") {
        const amount = (amountCents / 100).toFixed(2);
        details = `Importo: €${amount}`;
      }
      if (typeof method === "string") {
        details = details ? `${details} — Metodo: ${method}` : `Metodo: ${method}`;
      }
    } else if (item.action === "member.access_sent") {
      category = "Accesso";
      tone = "border-blue-200 bg-blue-50 text-blue-700";
      const sent = (meta as Record<string, unknown>)?.email_sent;
      if (typeof sent === "boolean") {
        details = sent ? "Esito: inviato" : "Esito: non inviato";
      }
    } else if (item.action === "member.manual_create") {
      category = "Iscrizione";
      tone = "border-brand/30 bg-brand/10 text-brand";
    } else if (item.action === "member.update") {
      category = "Iscrizione";
      tone = "border-neutral-200 bg-neutral-50 text-neutral-700";
      const fields = (meta as Record<string, unknown>)?.fields;
      if (Array.isArray(fields) && fields.length) {
        details = `Campi: ${fields.join(", ")}`;
      }
    } else if (item.action === "member.decision") {
      category = "Iscrizione";
      const decision = (meta as Record<string, unknown>)?.decision;
      if (decision === "approve") {
        label = "Iscrizione approvata";
        tone = "border-emerald-200 bg-emerald-50 text-emerald-700";
      } else if (decision === "reject") {
        label = "Iscrizione rigettata";
        tone = "border-red-200 bg-red-50 text-red-700";
      }
    }

    return { label, details, category, tone };
  };

  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  useEffect(() => {
    fetchMember();
  }, [id]);

  const fetchMember = async () => {
    try {
      const res = await fetch(`/api/org-admin/members/${id}`);
      if (!res.ok) throw new Error("Errore nel caricamento del socio");
      const data = await res.json();
      setMember(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  };

  const handleSendAccess = async () => {
    if (!member) return;
    setSendAccessMessage(null);
    setSendAccessError(null);

    if (!member.email) {
      setSendAccessError("Inserisci email per inviare accesso.");
      return;
    }

    setSendingAccess(true);
    try {
      const res = await fetch(`/api/org-admin/members/${member.id}/send-access`, {
        method: "POST",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail ?? "Errore durante l'invio");
      }
      const data = await res.json();
      setSendAccessMessage(
        data.email_sent ? "Accesso inviato via email." : "Invio non riuscito, riprova."
      );
      setMember((prev) =>
        prev
          ? {
              ...prev,
              last_access_email_at: data.last_access_email_at ?? prev.last_access_email_at,
            }
          : prev
      );
    } catch (err) {
      setSendAccessError(err instanceof Error ? err.message : "Errore durante l'invio");
    } finally {
      setSendingAccess(false);
    }
  };

  const handleApprove = async (docId: number) => {
    setReviewingDocId(docId);
    try {
      const res = await fetch(`/api/org-admin/documents/${docId}/approve`, {
        method: "POST",
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail ?? "Errore durante la revisione");
      }

      await res.json();
      await fetchMember();

      setActionMessage("Documento approvato con successo.");
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setReviewingDocId(null);
    }
  };

  const openRejectModal = (doc: Document) => {
    setRejectingDoc(doc);
    setActionError(null);
    setActionMessage(null);
  };

  const handleReject = async (note: string) => {
    if (!rejectingDoc) return;    setReviewingDocId(rejectingDoc.id);
    try {
      const res = await fetch(`/api/org-admin/documents/${rejectingDoc.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejection_note: note }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail ?? "Errore durante il rigetto");
      }
      await res.json();
      await fetchMember();
      setRejectingDoc(null);      setActionMessage("Documento rigettato.");
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setReviewingDocId(null);
    }
  };

  const handleDecision = async (decision: "approve" | "reject", notes: string) => {
    if (!confirm(`Sei sicuro di voler ${decision === "approve" ? "approvare" : "rifiutare"} questa iscrizione?`)) return;

    setIsSubmittingDecision(true);
    try {
      const res = await fetch(`/api/org-admin/members/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes }),
      });
      if (!res.ok) throw new Error("Errore durante il salvataggio della decisione");

      await res.json();
      await fetchMember();
      alert("Decisione salvata con successo!");

    } catch (err) {
        alert("Errore: " + (err instanceof Error ? err.message : String(err)));
    } finally {
        setIsSubmittingDecision(false);
    }
  };

  const handleManualPayment = async (payload: ManualPaymentPayload) => {
    if (!member) return;
    try {
      const result = await createManualPayment(member.id, {
        amount: payload.amount,
        method: payload.method,
        paid_at: payload.paid_at,
        notes: payload.notes,
      });
      if (result.member_status) {
        await fetchMember();
      } else {
        setMember((prev) =>
          prev
            ? {
                ...prev,
                payments: [result.payment, ...(prev.payments ?? [])],
              }
            : prev
        );
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error("Errore durante il salvataggio");
    }
  };

  const [downloadingDocId, setDownloadingDocId] = useState<number | null>(null);

  const handleDownloadDoc = async (doc: Document) => {
    const url = doc.download_url || `/api/org-admin/documents/${doc.id}`;
    setDownloadingDocId(doc.id);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const detail = payload?.detail ?? "Errore durante il download";
        if (res.status === 404) {
          setActionError("Documento non disponibile sul server. Potrebbe essere stato rimosso.");
        } else if (res.status === 403) {
          setActionError("Permesso negato per questo documento.");
        } else {
          setActionError(detail);
        }
        return;
      }
      const blob = await res.blob();
      const filename = doc.filename || "documento";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 100);
    } catch {
      setActionError("Errore di rete durante il download del documento.");
    } finally {
      setDownloadingDocId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm("ATTENZIONE: Sei sicuro di voler ELIMINARE definitivamente questo socio? L'operazione rimuoverà immediatamente l'accesso al socio.")) return;

    try {
      const res = await fetch(`/api/org-admin/members/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Errore durante l'eliminazione");

      alert("Socio eliminato con successo.");
      window.location.href = "/org-admin/soci";

    } catch (err) {
      alert("Errore: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // ── Hooks MUST be called unconditionally (Rules of Hooks) ──────
  const docs = member?.documents ?? [];
  const docById = useMemo(
    () => new Map(docs.map((doc) => [doc.id, doc])),
    [docs]
  );
  const pendingDocsCount = useMemo(
    () => docs.filter((d) => d.status === "pending" || d.status === "uploaded").length,
    [docs]
  );
  const rejectedDocsCount = useMemo(
    () => docs.filter((d) => d.status === "rejected").length,
    [docs]
  );

  if (loading) return <div className="p-8 text-center">Caricamento...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!member) return <div className="p-8 text-center">Socio non trovato</div>;

  const workflowStatus = member.workflow_status ?? "";
  const isDecisionMade = workflowStatus === "active" || workflowStatus === "rejected";
  const documentStatus =
    member.document_status ??
    (docs.length === 0
      ? "not_provided"
      : docs.some((d) => d.status === "rejected")
        ? "rejected"
        : docs.some((d) => d.status === "pending" || d.status === "uploaded")
          ? "pending"
          : "approved");
  const lastAccessLabel = member.last_access_email_at
    ? new Date(member.last_access_email_at).toLocaleString("it-IT")
    : null;
  const paymentMethodLabel =
    member.payment_method === "CASH"
      ? "Contanti"
      : member.payment_method === "BONIFICO"
        ? "Bonifico"
        : "-";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/org-admin/soci" className="p-2 hover:bg-neutral-100 rounded-full text-neutral-600">
           {/* ArrowLeft */}
           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </Link>
        <h1 className="text-2xl font-bold font-display text-primary-900">
          Dettaglio Socio
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("details")}
          className={`px-3 py-1.5 text-sm font-medium transition ${
            activeTab === "details"
              ? "border-b-2 border-brand text-brand"
              : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Dettaglio
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("activity")}
          className={`px-3 py-1.5 text-sm font-medium transition ${
            activeTab === "activity"
              ? "border-b-2 border-brand text-brand"
              : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Attività
        </button>
      </div>

      {activeTab === "activity" ? (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h2 className="text-lg font-semibold mb-2">Attività recenti</h2>
          <p className="text-sm text-neutral-500">
            Ultime azioni registrate sul socio.
          </p>
          {member.activities && member.activities.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {member.activities.map((item) => {
                const who = item.actor_admin_email
                  ? `Admin ${item.actor_admin_email}`
                  : item.actor_admin_id
                    ? `Admin #${item.actor_admin_id}`
                    : item.actor_member_name
                      ? `Socio ${item.actor_member_name}`
                      : item.actor_member_id
                        ? `Socio #${item.actor_member_id}`
                        : "Sistema";
                const when = item.created_at
                  ? new Date(item.created_at).toLocaleString("it-IT")
                  : "-";
                const meta = getActivityMeta(item);
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3 text-sm"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.tone}`}>
                          {meta.category}
                        </span>
                        <p className="font-medium text-neutral-900">{meta.label}</p>
                      </div>
                      <p className="text-xs text-neutral-500">
                        {who} il {when}
                      </p>
                      {meta.details && (
                        <p className="text-xs text-neutral-500">{meta.details}</p>
                      )}
                      {item.entity_type && item.entity_id != null && (
                        <p className="text-xs text-neutral-400">
                          Target: {item.entity_type} #{item.entity_id}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-4 rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
              Nessuna attività registrata.
            </div>
          )}
        </div>
      ) : (
      <>
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="grid md:grid-cols-2 gap-6">
            <div>
                <h2 className="text-lg font-semibold mb-4">Anagrafica</h2>
                <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Nome</dt>
                        <dd className="font-medium">{member.first_name} {member.last_name}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Email</dt>
                        <dd className="font-medium">{member.email || "-"}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Codice Fiscale</dt>
                        <dd className="font-medium">{member.fiscal_code || "-"}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Telefono</dt>
                        <dd className="font-medium">{member.phone || "-"}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Categoria / Tipo</dt>
                        <dd className="font-medium">{member.member_type || "-"}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Modalita di pagamento</dt>
                        <dd className="font-medium">{paymentMethodLabel}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Iscrizione manuale</dt>
                        <dd className="font-medium">{member.is_manual ? "Sì" : "No"}</dd>
                    </div>
                </dl>
            </div>
            <div>
                <h2 className="text-lg font-semibold mb-4">Stato Iscrizione</h2>
                <dl className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                        <dt className="text-neutral-500">Stato</dt>
                        <dd className={`px-2 py-1 rounded-full text-xs font-medium ${
                          member.status === "ACTIVE" ? "bg-green-100 text-green-700" :
                          member.status === "EXPIRED" ? "bg-red-100 text-red-700" :
                          member.status === "DELETED" ? "bg-slate-200 text-slate-700" :
                          member.status === "PENDING" ? "bg-amber-100 text-amber-700" :
                          "bg-neutral-100 text-neutral-700"
                        }`}>
                          {member.status === "ACTIVE" ? "Attivo" :
                           member.status === "EXPIRED" ? "Scaduto" :
                           member.status === "DELETED" ? "Eliminato" :
                           member.status === "PENDING" ? "In attesa" : member.status}
                        </dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Tessera N.</dt>
                        <dd className="font-mono font-medium">
                          {member.card_number ?? member.card_no ?? "Non assegnata"}
                          {member.card_year ? ` / ${member.card_year}` : ""}
                        </dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Data Iscrizione</dt>
                        <dd className="font-medium">
                            {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : "-"}
                        </dd>
                    </div>
                </dl>
                <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Accesso</p>
                            <p className="text-sm text-neutral-700">
                                {member.has_access ? "Accesso attivo" : "Accesso non attivo"}
                            </p>
                            {!member.is_active && (
                                <p className="mt-1 text-xs text-red-600">
                                    Account non attivo: invio accesso disabilitato.
                                </p>
                            )}
                            {lastAccessLabel && (
                                <p className="mt-1 text-xs text-neutral-500">
                                    Ultimo invio: {lastAccessLabel}
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={handleSendAccess}
                            disabled={sendingAccess || member.has_access || !member.email || !member.is_active}
                            className="btn-primary"
                            data-tour="admin-send-access"
                        >
                            {sendingAccess ? "Invio..." : "Invia accesso"}
                        </button>
                    </div>
                    {sendAccessError && (
                        <p className="mt-2 text-xs text-red-600">{sendAccessError}</p>
                    )}
                    {sendAccessMessage && (
                        <p className="mt-2 text-xs text-emerald-600">{sendAccessMessage}</p>
                    )}
                    {!member.email && (
                        <p className="mt-2 text-xs text-neutral-500">
                            Inserisci un'email per inviare l'accesso.
                        </p>
                    )}
                </div>
            </div>
        </div>
      </div>

      <ManualPaymentForm
        payments={member.payments}
        paymentMethodLabel={paymentMethodLabel}
        onSubmit={handleManualPayment}
      />

      {rejectingDoc && (
        <RejectDocumentModal
          open={Boolean(rejectingDoc)}
          docLabel={rejectingDoc.type === "identity" ? "Documento Identita" : rejectingDoc.type === "fiscal_code" ? "Codice Fiscale" : rejectingDoc.type}
          initialNote={rejectingDoc.rejection_note}
          isSubmitting={reviewingDocId === rejectingDoc.id}
          error={actionError}
          onClose={() => setRejectingDoc(null)}
          onConfirm={handleReject}
        />
      )}

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <h2 className="text-lg font-semibold mb-3">Note interne</h2>
        <p className="text-sm text-neutral-600 whitespace-pre-line">
          {member.internal_notes ? member.internal_notes : "Nessuna nota interna."}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden" data-tour="admin-documents">
        <div className="px-6 py-4 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Documenti Caricati</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Gestione approvazioni e rigetti con motivazione obbligatoria.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              {documentStatus === "not_provided" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 text-neutral-700">
                  Documento non caricato
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-amber-700">
                Pending {pendingDocsCount}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-red-700">
                Rigettati {rejectedDocsCount}
              </span>
            </div>
        </div>
        {actionError && (
          <div className="px-6 pt-4">
            <div className="rounded-md border border-red-200/60 bg-red-50 px-4 py-3 text-sm text-red-700">
              {actionError}
            </div>
          </div>
        )}
        {actionMessage && (
          <div className="px-6 pt-4">
            <div className="rounded-md border border-emerald-200/60 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {actionMessage}
            </div>
          </div>
        )}
        <div className="divide-y divide-neutral-100">
            {member.documents.length === 0 ? (
                <div className="p-6 text-center text-neutral-500 text-sm">Nessun documento caricato.</div>
            ) : (
                member.documents.map(doc => {
                  const replaces = doc.replaces_document_id ? docById.get(doc.replaces_document_id) : null;
                  const statusTone = doc.status === "approved"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : doc.status === "rejected"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-amber-200 bg-amber-50 text-amber-700";
                  const statusLabel = doc.status === "approved"
                    ? "Approvato"
                    : doc.status === "rejected"
                      ? "Rigettato"
                      : "In revisione";
                  return (
                    <div key={doc.id} className="p-6 flex flex-col gap-4">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-neutral-50 rounded text-neutral-500">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-medium text-sm text-neutral-900">
                                {doc.type === 'identity' ? 'Documento Identità' : doc.type === 'fiscal_code' ? 'Codice Fiscale' : doc.type}
                              </h3>
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone}`}>
                                {statusLabel}
                              </span>
                            </div>
                            <p className="text-xs text-neutral-500">
                              {doc.filename}
                              {doc.size_bytes ? ` (${formatBytes(doc.size_bytes)})` : ''}
                            </p>
                            <p className="text-xs text-neutral-400 mt-1">
                              Caricato il {new Date(doc.uploaded_at).toLocaleDateString()}
                            </p>
                            {doc.rejection_note && (
                              <p className="mt-1 text-xs text-red-600">
                                Motivo rigetto: {doc.rejection_note}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownloadDoc(doc)}
                            disabled={downloadingDocId === doc.id}
                            className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg flex items-center gap-1 text-sm font-medium transition-colors disabled:opacity-50"
                            title="Scarica"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            <span className="hidden md:inline">{downloadingDocId === doc.id ? "..." : "Scarica"}</span>
                          </button>
                          <button
                            onClick={() => handleApprove(doc.id)}
                            disabled={reviewingDocId === doc.id || isDecisionMade}
                            className="px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            Approva
                          </button>
                          <button
                            onClick={() => openRejectModal(doc)}
                            disabled={reviewingDocId === doc.id || isDecisionMade}
                            className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            data-tour="admin-document-reject"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            Rigetta
                          </button>
                        </div>
                      </div>

                      {replaces && (
                        <div className="rounded-lg border border-amber-200/70 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                          <p className="font-semibold uppercase tracking-wide text-amber-600">
                            Storico documento
                          </p>
                          <p className="mt-1">
                            Doc #{replaces.id} {replaces.status === "rejected" ? "rigettato" : "precedente"} -&gt; Doc #{doc.id} {statusLabel.toLowerCase()}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })
            )}
        </div>
      </div>

            <MemberDecisionPanel
        status={workflowStatus || member.status}
        decisionAt={member.decision_at}
        initialNotes={member.decision_notes}
        isSubmitting={isSubmittingDecision}
        onSubmit={handleDecision}
      />

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <h3 className="text-sm font-semibold text-neutral-900 mb-2">Area Pericolosa</h3>
        <p className="text-sm text-neutral-500 mb-4">
          Eliminando il socio, verranno rimossi i suoi accessi e non comparira piu negli elenchi attivi.
        </p>
        <button
          onClick={handleDelete}
          className="bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
        >
          Elimina Socio
        </button>
      </div>
      </>
      )}
    </div>
  );
}
