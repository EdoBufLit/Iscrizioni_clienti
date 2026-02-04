import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { createManualPayment } from "../../lib/api";

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
  status: string;
  card_no?: number;
  joined_at?: string;
  member_type?: string | null;
  internal_notes?: string | null;
  is_manual?: boolean;
  has_access?: boolean;
  last_access_email_at?: string | null;
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
  const [rejectionNote, setRejectionNote] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "contanti",
    paid_at: new Date().toISOString().slice(0, 10),
    notes: "",
  });

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
    let category = "AttivitÃ ";
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
        details = `Importo: € ${amount}`;
      }
      if (typeof method === "string") {
        details = details ? `${details} â€¢ ${method}` : `Metodo: ${method}`;
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

  // Decision state
  const [decisionNotes, setDecisionNotes] = useState("");
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  useEffect(() => {
    fetchMember();
  }, [id]);

  useEffect(() => {
      if (member?.decision_notes) {
          setDecisionNotes(member.decision_notes);
      }
  }, [member]);

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

      const result = await res.json();

      // Update local state
      setMember(prev => {
        if (!prev) return null;
        return {
            ...prev,
            status: result.member_status,
            documents: prev.documents.map(d =>
                d.id === docId ? { ...d, status: result.doc_status, rejection_note: null } : d
            )
        };
      });

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
    setRejectionNote(doc.rejection_note ?? "");
    setActionError(null);
    setActionMessage(null);
  };

  const handleReject = async () => {
    if (!rejectingDoc) return;
    const note = rejectionNote.trim();
    if (!note) {
      setActionError("La motivazione è obbligatoria.");
      return;
    }
    setReviewingDocId(rejectingDoc.id);
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
      const result = await res.json();
      setMember(prev => {
        if (!prev) return null;
        return {
          ...prev,
          status: result.member_status,
          documents: prev.documents.map(d =>
            d.id === rejectingDoc.id ? { ...d, status: result.doc_status, rejection_note: note } : d
          )
        };
      });
      setRejectingDoc(null);
      setRejectionNote("");
      setActionMessage("Documento rigettato.");
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setReviewingDocId(null);
    }
  };

  const handleDecision = async (decision: "approve" | "reject") => {
    if (!confirm(`Sei sicuro di voler ${decision === "approve" ? "approvare" : "rifiutare"} questa iscrizione?`)) return;

    setIsSubmittingDecision(true);
    try {
      const res = await fetch(`/api/org-admin/members/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes: decisionNotes }),
      });
      if (!res.ok) throw new Error("Errore durante il salvataggio della decisione");

      const result = await res.json();

      // Update local state
      setMember(prev => {
        if (!prev) return null;
        return {
          ...prev,
          status: result.status,
          decision_notes: decisionNotes,
          decision_at: new Date().toISOString() // optimistic update
        };
      });
      alert("Decisione salvata con successo!");

    } catch (err) {
        alert("Errore: " + (err instanceof Error ? err.message : String(err)));
    } finally {
        setIsSubmittingDecision(false);
    }
  };

  const handleManualPayment = async () => {
    if (!member) return;
    setPaymentMessage(null);
    setPaymentError(null);

    const amountValue = Number(paymentForm.amount.replace(",", "."));
    if (!amountValue || amountValue <= 0) {
      setPaymentError("Inserisci un importo valido.");
      return;
    }
    if (!paymentForm.paid_at) {
      setPaymentError("Seleziona la data di pagamento.");
      return;
    }

    setPaymentSubmitting(true);
    try {
      const result = await createManualPayment(member.id, {
        amount: amountValue,
        method: paymentForm.method,
        paid_at: paymentForm.paid_at,
        notes: paymentForm.notes.trim() || undefined,
      });
      setPaymentMessage("Pagamento registrato con successo.");
      setPaymentForm((prev) => ({ ...prev, amount: "", notes: "" }));
      if (result.member_status) {
        await fetchMember();
      } else {
        setMember((prev) =>
          prev
            ? {
                ...prev,
                payments: [
                  result.payment,
                  ...(prev.payments ?? []),
                ],
              }
            : prev
        );
      }
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Errore durante il salvataggio");
    } finally {
      setPaymentSubmitting(false);
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

  if (loading) return <div className="p-8 text-center">Caricamento...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!member) return <div className="p-8 text-center">Socio non trovato</div>;

  const allDocsApproved = member.documents.length > 0 && member.documents.every(d => d.status === "approved");
  const isDecisionMade = member.status === "active" || member.status === "rejected";
  const lastAccessLabel = member.last_access_email_at
    ? new Date(member.last_access_email_at).toLocaleString("it-IT")
    : null;
  const docById = new Map(member.documents.map((doc) => [doc.id, doc]));

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
          AttivitÃ 
        </button>
      </div>

      {activeTab === "activity" ? (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h2 className="text-lg font-semibold mb-2">AttivitÃ  recenti</h2>
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
                        {who} â€¢ {when}
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
              Nessuna attivitÃ  registrata.
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
                          member.status === "active" ? "bg-green-100 text-green-700" :
                          member.status === "pending_verification" ? "bg-amber-100 text-amber-700" :
                          member.status === "rejected" ? "bg-red-100 text-red-700" :
                          "bg-neutral-100 text-neutral-700"
                        }`}>
                          {member.status === "active" ? "Attivo" :
                           member.status === "pending_verification" ? "In Verifica" :
                           member.status === "rejected" ? "Respinto" : member.status}
                        </dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Tessera N.</dt>
                        <dd className="font-mono font-medium">{member.card_no || "Non assegnata"}</dd>
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
                            {lastAccessLabel && (
                                <p className="mt-1 text-xs text-neutral-500">
                                    Ultimo invio: {lastAccessLabel}
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={handleSendAccess}
                            disabled={sendingAccess || member.has_access || !member.email}
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

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Pagamenti / Iscrizione</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Registra un pagamento manuale per questo socio.
            </p>
          </div>
          {member.payments && member.payments.length > 0 && (
            <div className="text-right text-xs text-neutral-500">
              <p className="font-semibold uppercase tracking-wide">Ultimo pagamento</p>
              <p className="mt-1 text-sm text-neutral-700">
                {member.payments[0].amount.toFixed(2)} € ({member.payments[0].method})
              </p>
              {member.payments[0].paid_at && (
                <p className="text-xs text-neutral-500">
                  {new Date(member.payments[0].paid_at).toLocaleDateString("it-IT")}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-neutral-600">Importo (€)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600">Metodo</label>
            <select
              className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              value={paymentForm.method}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, method: e.target.value }))}
            >
              <option value="contanti">Contanti</option>
              <option value="bonifico">Bonifico</option>
              <option value="altro">Altro</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600">Data pagamento</label>
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              value={paymentForm.paid_at}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, paid_at: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-neutral-600">Note</label>
            <textarea
              rows={3}
              className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              value={paymentForm.notes}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Eventuali note sul pagamento..."
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleManualPayment}
            disabled={paymentSubmitting}
            className="btn-primary"
          >
            {paymentSubmitting ? "Salvataggio..." : "Segna pagato manualmente"}
          </button>
          {paymentError && (
            <span className="text-xs text-red-600">{paymentError}</span>
          )}
          {paymentMessage && (
            <span className="text-xs text-emerald-600">{paymentMessage}</span>
          )}
        </div>

        {member.payments && member.payments.length > 0 && (
          <div className="mt-6 rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Storico pagamenti
            </p>
            <ul className="mt-2 space-y-2 text-sm text-neutral-700">
              {member.payments.slice(0, 3).map((payment) => (
                <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {payment.amount.toFixed(2)} € · {payment.method}
                    </p>
                    {payment.paid_at && (
                      <p className="text-xs text-neutral-500">
                        {new Date(payment.paid_at).toLocaleDateString("it-IT")}
                      </p>
                    )}
                    {payment.notes && (
                      <p className="text-xs text-neutral-500">Note: {payment.notes}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {rejectingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg surface-strong p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-neutral-900">Rigetta documento</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Inserisci la motivazione del rigetto per {rejectingDoc.type === "identity" ? "Documento Identità" : rejectingDoc.type === "fiscal_code" ? "Codice Fiscale" : rejectingDoc.type}.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100"
                onClick={() => setRejectingDoc(null)}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-neutral-600">
                Motivazione / Note *
              </label>
              <textarea
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                rows={4}
                value={rejectionNote}
                onChange={(e) => setRejectionNote(e.target.value)}
                placeholder="Inserisci la motivazione del rigetto..."
              />
            </div>

            {actionError && (
              <div className="mt-3 rounded-md border border-red-200/60 bg-red-50 px-4 py-3 text-sm text-red-700">
                {actionError}
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setRejectingDoc(null)}
                disabled={reviewingDocId === rejectingDoc.id}
              >
                Annulla
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleReject}
                disabled={reviewingDocId === rejectingDoc.id}
              >
                {reviewingDocId === rejectingDoc.id ? "Salvataggio..." : "Conferma rigetto"}
              </button>
            </div>
          </div>
        </div>
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
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-amber-700">
                Pending {member.documents.filter((d) => d.status === "pending" || d.status === "uploaded").length}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-red-700">
                Rigettati {member.documents.filter((d) => d.status === "rejected").length}
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
                          <a
                            href={doc.download_url || `/api/org-admin/documents/${doc.id}`}
                            className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg flex items-center gap-1 text-sm font-medium transition-colors"
                            title="Scarica"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            <span className="hidden md:inline">Scarica</span>
                          </a>
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
                            Doc #{replaces.id} {replaces.status === "rejected" ? "rigettato" : "precedente"} → Doc #{doc.id} {statusLabel.toLowerCase()}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })
            )}
        </div>
      </div>

      {/* Final Decision Section */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Decisione Iscrizione</h2>

          {!allDocsApproved && !isDecisionMade && (
              <div className="bg-amber-50 text-amber-800 p-4 rounded-lg text-sm mb-4 border border-amber-100 flex gap-2">
                 <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                 <p>Non è possibile approvare l'iscrizione finché tutti i documenti non sono stati approvati.</p>
              </div>
          )}

          <div className="space-y-4">
              <div>
                  <label htmlFor="decisionNotes" className="block text-sm font-medium text-neutral-700 mb-1">
                      Note decisione (opzionale)
                  </label>
                  <textarea
                      id="decisionNotes"
                      rows={3}
                      className="w-full rounded-md border border-neutral-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm p-2"
                      placeholder="Inserisci eventuali note per l'approvazione o il rifiuto..."
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                      disabled={isDecisionMade || isSubmittingDecision}
                  />
              </div>

              {isDecisionMade ? (
                  <div className={`p-4 rounded-lg border ${member.status === 'active' ? 'bg-green-50 border-green-100 text-green-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                      <p className="font-medium">
                          Decisione presa: {member.status === 'active' ? 'Approvata' : 'Rifiutata'}
                      </p>
                      {member.decision_at && (
                          <p className="text-sm mt-1 opacity-80">
                              Data: {new Date(member.decision_at).toLocaleString()}
                          </p>
                      )}
                      {member.decision_notes && (
                          <p className="text-sm mt-2 pt-2 border-t border-black/10">
                              Note: {member.decision_notes}
                          </p>
                      )}
                  </div>
              ) : (
                  <div className="flex gap-4">
                      <button
                          onClick={() => handleDecision("approve")}
                          disabled={!allDocsApproved || isSubmittingDecision}
                          className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                      >
                          Approva Iscrizione
                      </button>
                      <button
                          onClick={() => handleDecision("reject")}
                          disabled={isSubmittingDecision}
                          className="flex-1 bg-white text-red-600 border border-red-200 px-4 py-2 rounded-lg font-medium hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                      >
                          Rigetta Iscrizione
                      </button>
                  </div>
              )}

             <div className="mt-8 pt-8 border-t border-neutral-200">
                <h3 className="text-sm font-semibold text-neutral-900 mb-2">Area Pericolosa</h3>
                <p className="text-sm text-neutral-500 mb-4">
                  Eliminando il socio, verranno rimossi i suoi accessi e non comparirà più negli elenchi attivi.
                </p>
                <button
                    onClick={handleDelete}
                    className="bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                >
                    Elimina Socio
                </button>
             </div>
          </div>
      </div>
      </>
      )}
    </div>
  );
}
