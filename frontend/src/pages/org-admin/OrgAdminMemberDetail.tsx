import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  AuthError,
  createManualPayment,
  fetchOrgAdminMemberDetail,
  fetchOrgAdminMembershipSettings,
  sendOrgAdminMemberCardEmail,
  updateOrgAdminMemberProfile,
  type OrgAdminMemberActivity,
  type OrgAdminMemberDetail,
  type OrgAdminMemberDocument,
  type OrgAdminMembershipSettings,
  type UpdateOrgAdminMemberProfileInput,
} from "../../lib/api";
import { MemberCardPreview } from "../../components/cards/MemberCardPreview";
import ManualPaymentForm, { type ManualPaymentPayload } from "./components/ManualPaymentForm";
import MemberDecisionPanel from "./components/MemberDecisionPanel";
import RejectDocumentModal from "./components/RejectDocumentModal";
import EditMemberProfileModal from "./components/EditMemberProfileModal";
import AsyncActionButton, { type AsyncActionState } from "../../components/ui/AsyncActionButton";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { useToast } from "../../components/ui/ToastProvider";
import { useOrgAdmin } from "./OrgAdminLayout";

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function OrgAdminMemberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { admin } = useOrgAdmin();
  const [member, setMember] = useState<OrgAdminMemberDetail | null>(null);
  const [membershipSettings, setMembershipSettings] = useState<OrgAdminMembershipSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "activity">("details");
  const [reviewingDocId, setReviewingDocId] = useState<number | null>(null);
  const [sendingAccess, setSendingAccess] = useState(false);
  const [sendAccessMessage, setSendAccessMessage] = useState<string | null>(null);
  const [sendAccessError, setSendAccessError] = useState<string | null>(null);
  const [rejectingDoc, setRejectingDoc] = useState<OrgAdminMemberDocument | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [decisionDraft, setDecisionDraft] = useState<{ decision: "approve" | "reject"; notes: string } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteActionState, setDeleteActionState] = useState<AsyncActionState>("idle");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [sendingCardEmail, setSendingCardEmail] = useState(false);
  const [cardEmailMessage, setCardEmailMessage] = useState<string | null>(null);
  const [cardEmailError, setCardEmailError] = useState<string | null>(null);
  const [downloadingCard, setDownloadingCard] = useState(false);
  const [printingCard, setPrintingCard] = useState(false);
  const [decisionActionStates, setDecisionActionStates] = useState<Record<"approve" | "reject", AsyncActionState>>({
    approve: "idle",
    reject: "idle",
  });
  const [docActionStates, setDocActionStates] = useState<Record<number, AsyncActionState>>({});

  const ACTION_LABELS: Record<string, string> = {
    "member.manual_create": "Socio creato",
    "member.update": "Socio modificato",
    "member.access_sent": "Accesso inviato",
    "member_doc.review": "Documento revisionato",
    "member.document.resubmit": "Documento reinviato",
    "member.payment.manual": "Pagamento manuale registrato",
    "member.payment.membership_manual": "Pagamento quota registrato",
    "member.decision": "Decisione iscrizione",
    "member.card_email.manual": "Tessera inviata",
  };

  const getActivityMeta = (item: OrgAdminMemberActivity) => {
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
    } else if (item.action === "member.payment.membership_manual") {
      category = "Pagamenti";
      tone = "border-emerald-200 bg-emerald-50 text-emerald-700";
    } else if (item.action === "member.access_sent") {
      category = "Accesso";
      tone = "border-blue-200 bg-blue-50 text-blue-700";
      const sent = (meta as Record<string, unknown>)?.email_sent;
      const status = (meta as Record<string, unknown>)?.email_status;
      if (status === "queued") {
        details = "Esito: accodata";
      } else if (typeof sent === "boolean") {
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
    } else if (item.action === "member.card_email.manual") {
      category = "Tessera";
      label = "Tessera inviata via email";
      tone = "border-blue-200 bg-blue-50 text-blue-700";
    }

    return { label, details, category, tone };
  };

  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  const resetActionStateLater = (reset: () => void) => {
    window.setTimeout(reset, 1300);
  };

  const setDecisionActionState = (decision: "approve" | "reject", state: AsyncActionState) => {
    setDecisionActionStates((prev) => ({ ...prev, [decision]: state }));
  };

  const setDocActionState = (docId: number, state: AsyncActionState) => {
    setDocActionStates((prev) => ({ ...prev, [docId]: state }));
  };

  useEffect(() => {
    void fetchMember();
    void loadMembershipSettings();
  }, [id]);

  const fetchMember = async () => {
    if (!id) {
      setLoading(false);
      setError("Socio non trovato");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await fetchOrgAdminMemberDetail(Number(id));
      setMember(data);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
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
        data.email_status === "queued"
          ? "Accesso accodato. Verra inviato a breve."
          : data.email_sent
            ? "Accesso inviato via email."
            : "Invio non riuscito, riprova."
      );
      setMember((prev) =>
        prev
          ? {
              ...prev,
              last_access_email_at: data.last_access_email_at ?? prev.last_access_email_at,
            }
          : prev
      );
      showToast({
        tone: "success",
        title: "Accesso socio",
        message:
          data.email_status === "queued"
            ? "Invio accesso accodato correttamente."
            : data.email_sent
              ? "Accesso inviato via email."
              : "Invio completato senza conferma email.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore durante l'invio";
      setSendAccessError(message);
      showToast({ tone: "error", title: "Accesso socio", message });
    } finally {
      setSendingAccess(false);
    }
  };

  const handleProfileSave = async (payload: UpdateOrgAdminMemberProfileInput) => {
    if (!member) return;
    setProfileSaving(true);
    setProfileError(null);
    try {
      const updated = await updateOrgAdminMemberProfile(member.id, payload);
      setMember(updated);
      setEditModalOpen(false);
      setActionMessage("Anagrafica aggiornata correttamente.");
      setActionError(null);
      showToast({
        tone: "success",
        title: "Anagrafica socio",
        message: "Dati anagrafici aggiornati correttamente.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore salvataggio anagrafica";
      setProfileError(message);
      showToast({ tone: "error", title: "Anagrafica socio", message });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSendCardEmail = async () => {
    if (!member) return;
    setCardEmailMessage(null);
    setCardEmailError(null);
    setSendingCardEmail(true);
    try {
      await sendOrgAdminMemberCardEmail(member.id);
      setCardEmailMessage("Invio tessera accodato correttamente.");
      showToast({
        tone: "success",
        title: "Tessera socio",
        message: "Email tessera accodata correttamente.",
      });
      await fetchMember();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore invio tessera";
      setCardEmailError(message);
      showToast({ tone: "error", title: "Tessera socio", message });
    } finally {
      setSendingCardEmail(false);
    }
  };

  const downloadCardPdf = async (mode: "download" | "print") => {
    if (!member) return;
    const isPrint = mode === "print";
    const printWindow = isPrint ? window.open("", "_blank", "noopener,noreferrer") : null;
    if (isPrint && !printWindow) {
      const message = "Consenti al browser di aprire una nuova finestra per la stampa della tessera.";
      setCardEmailError(message);
      showToast({ tone: "error", title: "Tessera socio", message });
      return;
    }

    if (isPrint) {
      setPrintingCard(true);
    } else {
      setDownloadingCard(true);
    }
    setCardEmailError(null);

    try {
      const disposition = isPrint ? "inline" : "attachment";
      const res = await fetch(`/api/org-admin/members/${member.id}/card.pdf?disposition=${disposition}`);
      if (!res.ok) {
        let detail = "Errore generazione PDF tessera.";
        try {
          const payload = await res.json();
          detail = payload?.detail ?? detail;
        } catch {
          // Ignore non-JSON errors.
        }
        throw new Error(detail);
      }

      const blob = await res.blob();
      const filename = `tessera-${member.card_number ?? member.card_no ?? member.id}.pdf`;
      const blobUrl = URL.createObjectURL(blob);

      if (isPrint && printWindow) {
        printWindow.location.href = blobUrl;
        window.setTimeout(() => {
          try {
            printWindow.focus();
            printWindow.print();
          } catch {
            // The PDF viewer may manage print flow itself.
          }
        }, 700);
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      } else {
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        window.setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
          anchor.remove();
        }, 200);
      }

      showToast({
        tone: "success",
        title: "Tessera socio",
        message: isPrint ? "PDF tessera aperto in stampa." : "PDF tessera scaricato.",
      });
    } catch (err) {
      if (printWindow) {
        printWindow.close();
      }
      const message = err instanceof Error ? err.message : "Errore PDF tessera";
      setCardEmailError(message);
      showToast({ tone: "error", title: "Tessera socio", message });
    } finally {
      if (isPrint) {
        setPrintingCard(false);
      } else {
        setDownloadingCard(false);
      }
    }
  };

  const handleApprove = async (docId: number) => {
    setReviewingDocId(docId);
    setDocActionState(docId, "loading");
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
      setDocActionState(docId, "success");
      showToast({
        tone: "success",
        title: "Documenti socio",
        message: "Documento approvato con successo.",
      });
      resetActionStateLater(() => setDocActionState(docId, "idle"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(message);
      setDocActionState(docId, "error");
      showToast({ tone: "error", title: "Documenti socio", message });
      resetActionStateLater(() => setDocActionState(docId, "idle"));
    } finally {
      setReviewingDocId(null);
    }
  };

  const openRejectModal = (doc: OrgAdminMemberDocument) => {
    setRejectingDoc(doc);
    setActionError(null);
    setActionMessage(null);
  };

  const handleReject = async (note: string) => {
    if (!rejectingDoc) return;
    setReviewingDocId(rejectingDoc.id);
    setDocActionState(rejectingDoc.id, "loading");
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
      setRejectingDoc(null);
      setActionMessage("Documento rigettato.");
      setActionError(null);
      setDocActionState(rejectingDoc.id, "success");
      showToast({
        tone: "success",
        title: "Documenti socio",
        message: "Documento rigettato con motivazione salvata.",
      });
      resetActionStateLater(() => setDocActionState(rejectingDoc.id, "idle"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(message);
      setDocActionState(rejectingDoc.id, "error");
      showToast({ tone: "error", title: "Documenti socio", message });
      resetActionStateLater(() => setDocActionState(rejectingDoc.id, "idle"));
    } finally {
      setReviewingDocId(null);
    }
  };

  const handleDecision = async (decision: "approve" | "reject", notes: string) => {
    setDecisionDraft({ decision, notes });
    setActionError(null);
    setActionMessage(null);
  };

  const confirmDecision = async () => {
    if (!decisionDraft) return;
    setIsSubmittingDecision(true);
    setDecisionActionState(decisionDraft.decision, "loading");
    try {
      const res = await fetch(`/api/org-admin/members/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: decisionDraft.decision, notes: decisionDraft.notes }),
      });
      if (!res.ok) throw new Error("Errore durante il salvataggio della decisione");

      await res.json();
      await fetchMember();
      setDecisionDraft(null);
      setDecisionActionState(decisionDraft.decision, "success");
      showToast({
        tone: "success",
        title: "Decisione iscrizione",
        message:
          decisionDraft.decision === "approve"
            ? "Iscrizione approvata correttamente."
            : "Iscrizione rigettata correttamente.",
      });
      resetActionStateLater(() => setDecisionActionState(decisionDraft.decision, "idle"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDecisionActionState(decisionDraft.decision, "error");
      showToast({ tone: "error", title: "Decisione iscrizione", message });
      resetActionStateLater(() => setDecisionActionState(decisionDraft.decision, "idle"));
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const handleManualPayment = async (payload: ManualPaymentPayload) => {
    if (!member) return;
    try {
      await createManualPayment(member.id, {
        amount: payload.amount,
        method: payload.method,
        paid_at: payload.paid_at,
        notes: payload.notes,
      });
      await fetchMember();
    } catch (err) {
      throw err instanceof Error ? err : new Error("Errore durante il salvataggio");
    }
  };

  const loadMembershipSettings = async () => {
    try {
      const data = await fetchOrgAdminMembershipSettings();
      setMembershipSettings(data);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
      }
    }
  };

  const [downloadingDocId, setDownloadingDocId] = useState<number | null>(null);

  const handleDownloadDoc = async (doc: OrgAdminMemberDocument) => {
    const url = doc.download_url || `/api/org-admin/documents/${doc.id}`;
    setDownloadingDocId(doc.id);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const detail = payload?.detail ?? "Errore durante il download";
        if (res.status === 404) {
          setActionError("Documento non disponibile sul server. Potrebbe essere stato rimosso.");
          showToast({
            tone: "error",
            title: "Documenti socio",
            message: "Documento non disponibile sul server.",
          });
        } else if (res.status === 403) {
          setActionError("Permesso negato per questo documento.");
          showToast({
            tone: "error",
            title: "Documenti socio",
            message: "Permesso negato per questo documento.",
          });
        } else {
          setActionError(detail);
          showToast({ tone: "error", title: "Documenti socio", message: detail });
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
      showToast({
        tone: "error",
        title: "Documenti socio",
        message: "Errore di rete durante il download del documento.",
      });
    } finally {
      setDownloadingDocId(null);
    }
  };

  const confirmDelete = async () => {
    setDeleteActionState("loading");
    try {
      const res = await fetch(`/api/org-admin/members/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Errore durante l'eliminazione");

      setDeleteActionState("success");
      showToast({
        tone: "success",
        title: "Soci",
        message: "Socio eliminato con successo.",
      });
      navigate("/org-admin/soci", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDeleteActionState("error");
      showToast({ tone: "error", title: "Soci", message });
      resetActionStateLater(() => setDeleteActionState("idle"));
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
  const membershipPayments = member.membership_payments ?? [];
  const paymentStatusLabel =
    member.card_is_paid || member.payment_status === "completed" || member.payment_status === "manual_completed"
      ? "Pagata"
      : member.payment_required
        ? "Pagamento non registrato"
        : "Non richiesta";
  const paymentStatusTone =
    paymentStatusLabel === "Pagata"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : paymentStatusLabel === "Non richiesta"
        ? "border-neutral-200 bg-neutral-100 text-neutral-600"
        : "border-amber-200 bg-amber-50 text-amber-700";
  const paymentMethodSummary =
    member.payment_required && membershipPayments[0]?.payment_reason
      ? membershipPayments[0].payment_reason
      : paymentMethodLabel;
  const birthDateLabel = member.birth_date
    ? new Date(`${member.birth_date}T00:00:00`).toLocaleDateString("it-IT")
    : "-";
  const cardNumber = member.card_number ?? member.card_no ?? null;
  const canUseCardActions = Boolean(cardNumber && member.card_year);
  const canSendCardEmail = Boolean(canUseCardActions && member.is_active && member.email);
  const cardPreviewData = {
    firstName: member.first_name,
    lastName: member.last_name,
    fullName: `${member.first_name} ${member.last_name}`.trim(),
    organizationName: admin?.organization?.name ?? null,
    organizationSlug: admin?.organization?.slug ?? null,
    cardNumber,
    cardStatus: member.status,
    cardYear: member.card_year ?? null,
    membershipTypeLabel: member.membership_type_label ?? null,
    validUntil: member.valid_until ?? null,
    verificationUrl: member.card_verification_url ?? null,
  };

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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
                Anagrafica socio
              </p>
              <h2 className="mt-2 text-xl font-semibold text-neutral-900">
                {member.first_name} {member.last_name}
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Correggi i dati anagrafici del socio senza alterare i riferimenti di sistema.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setProfileError(null);
                setEditModalOpen(true);
              }}
              className="btn-ghost !px-4 !py-2 text-xs font-bold uppercase tracking-[0.18em]"
            >
              Modifica anagrafica
            </button>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-5">
              <h3 className="text-sm font-semibold text-neutral-900">Dati principali</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Nome completo</dt>
                  <dd className="text-right font-medium text-neutral-900">
                    {member.first_name} {member.last_name}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Email</dt>
                  <dd className="text-right font-medium text-neutral-900">{member.email || "-"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Telefono</dt>
                  <dd className="text-right font-medium text-neutral-900">{member.phone || "-"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Codice fiscale</dt>
                  <dd className="text-right font-mono text-[13px] font-medium text-neutral-900">
                    {member.fiscal_code || "-"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-5">
              <h3 className="text-sm font-semibold text-neutral-900">Dati associativi</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Data di nascita</dt>
                  <dd className="text-right font-medium text-neutral-900">{birthDateLabel}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Luogo di nascita</dt>
                  <dd className="text-right font-medium text-neutral-900">{member.birth_place || "-"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Categoria / Tipo</dt>
                  <dd className="text-right font-medium text-neutral-900">{member.member_type || "-"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Modalita di pagamento</dt>
                  <dd className="text-right font-medium text-neutral-900">{paymentMethodSummary}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Iscrizione manuale</dt>
                  <dd className="text-right font-medium text-neutral-900">{member.is_manual ? "Si" : "No"}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Accesso area riservata
                </p>
                <p className="mt-1 text-sm text-neutral-700">
                  {member.has_access ? "Account attivo e credenziali gia presenti." : "Accesso non ancora attivato."}
                </p>
                {!member.is_active && (
                  <p className="mt-1 text-xs text-red-600">
                    Il socio non e attivo: l'invio credenziali resta disabilitato.
                  </p>
                )}
                {lastAccessLabel && (
                  <p className="mt-1 text-xs text-neutral-500">Ultimo invio accesso: {lastAccessLabel}</p>
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
            {sendAccessError && <p className="mt-2 text-xs text-red-600">{sendAccessError}</p>}
            {sendAccessMessage && <p className="mt-2 text-xs text-emerald-600">{sendAccessMessage}</p>}
            {!member.email && (
              <p className="mt-2 text-xs text-neutral-500">Inserisci un'email per inviare le credenziali.</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="overflow-hidden rounded-[28px] border border-neutral-200 bg-[radial-gradient(circle_at_top,rgba(166,124,82,0.10),transparent_35%),linear-gradient(180deg,#ffffff_0%,#faf7f2_100%)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
                  Tessera socio
                </p>
                <h2 className="mt-2 text-lg font-semibold text-neutral-900">Tessera digitale e PDF</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Invia la tessera via email, scarica il PDF o apri il flusso di stampa.
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  member.is_active
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {member.is_active ? "Socio attivo" : "Socio non attivo"}
              </span>
            </div>

            <div className="mt-5">
              <MemberCardPreview cardData={cardPreviewData} className="max-w-[420px]" />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={handleSendCardEmail}
                disabled={sendingCardEmail || !canSendCardEmail}
                className="btn-primary !justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sendingCardEmail ? "Invio..." : "Invia tessera via email"}
              </button>
              <button
                type="button"
                onClick={() => void downloadCardPdf("download")}
                disabled={downloadingCard || !canUseCardActions}
                className="btn-ghost !justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloadingCard ? "Preparazione..." : "Scarica PDF tessera"}
              </button>
              <button
                type="button"
                onClick={() => void downloadCardPdf("print")}
                disabled={printingCard || !canUseCardActions}
                className="btn-ghost !justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                {printingCard ? "Apertura..." : "Stampa tessera"}
              </button>
            </div>

            <div className="mt-4 grid gap-3 rounded-2xl border border-neutral-200 bg-white/80 p-4 text-sm text-neutral-700 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Numero tessera</p>
                <p className="mt-1 font-mono text-base font-semibold text-neutral-900">
                  {cardNumber ?? "Non assegnata"}
                  {member.card_year ? ` / ${member.card_year}` : ""}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Data iscrizione</p>
                <p className="mt-1 font-medium text-neutral-900">
                  {member.joined_at ? new Date(member.joined_at).toLocaleDateString("it-IT") : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Tipo tessera</p>
                <p className="mt-1 font-medium text-neutral-900">
                  {member.membership_type_label ?? "Annuale"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Scadenza reale</p>
                <p className="mt-1 font-medium text-neutral-900">
                  {member.valid_until ? new Date(member.valid_until).toLocaleString("it-IT") : "-"}
                </p>
              </div>
            </div>

            {cardEmailError && <p className="mt-3 text-xs text-red-600">{cardEmailError}</p>}
            {cardEmailMessage && <p className="mt-3 text-xs text-emerald-600">{cardEmailMessage}</p>}
            {!canUseCardActions && (
              <p className="mt-3 text-xs text-neutral-500">
                Le azioni PDF sono disponibili quando la tessera ha numero e anno assegnati.
              </p>
            )}
            {canUseCardActions && !member.email && (
              <p className="mt-3 text-xs text-neutral-500">
                Per inviare la tessera via email e necessario salvare un indirizzo email valido.
              </p>
            )}
            {canUseCardActions && member.card_verification_url && (
              <a
                href={member.card_verification_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex text-xs font-semibold uppercase tracking-[0.18em] text-brand hover:text-brand/80"
              >
                Apri verifica tessera
              </a>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
            <h3 className="text-sm font-semibold text-neutral-900">Stato iscrizione</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-neutral-500">Stato operativo</dt>
                <dd className="font-medium text-neutral-900">{member.status || "-"}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-neutral-500">Workflow</dt>
                <dd className="font-medium text-neutral-900">{workflowStatus || "-"}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-neutral-500">Documenti</dt>
                <dd className="font-medium text-neutral-900">{documentStatus}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Pagamenti</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Stato quota associativa e dettagli dei pagamenti registrati.
                </p>
              </div>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${paymentStatusTone}`}>
                {paymentStatusLabel}
              </span>
            </div>

            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-neutral-500">Stato pagamento</dt>
                <dd className="text-right font-medium text-neutral-900">{member.payment_status || "-"}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-neutral-500">Data conferma</dt>
                <dd className="text-right font-medium text-neutral-900">
                  {member.payment_completed_at
                    ? new Date(member.payment_completed_at).toLocaleString("it-IT")
                    : "-"}
                </dd>
              </div>
            </dl>

            {membershipPayments.length > 0 ? (
              <div className="mt-4 space-y-3">
                {membershipPayments.slice(0, 3).map((payment) => (
                  <div key={payment.id} className="rounded-2xl border border-neutral-200 bg-neutral-50/70 px-4 py-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-neutral-900">
                          {payment.payment_reason || "Quota associativa"}
                        </p>
                        <p className="mt-1 text-neutral-500">
                          {payment.amount != null ? `${payment.amount.toFixed(2)} ${payment.currency || "EUR"}` : "-"}
                        </p>
                      </div>
                      <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700">
                        {payment.status}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-neutral-500">
                      <p>Provider: {payment.provider}</p>
                      <p>Sorgente: {payment.source}</p>
                      <p>Checkout: {payment.checkout_reference || payment.sumup_checkout_id || "-"}</p>
                      <p>
                        Data pagamento: {payment.confirmed_at ? new Date(payment.confirmed_at).toLocaleString("it-IT") : "-"}
                      </p>
                      {payment.notes ? <p>Note: {payment.notes}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-neutral-500">Nessun pagamento quota registrato.</p>
            )}
          </div>
        </div>
      </div>

      <ManualPaymentForm
        payments={member.payments}
        paymentMethodLabel={paymentMethodLabel}
        onSubmit={handleManualPayment}
      />

      <EditMemberProfileModal
        open={editModalOpen}
        member={member}
        membershipSettings={membershipSettings}
        saving={profileSaving}
        error={profileError}
        onClose={() => {
          if (!profileSaving) {
            setEditModalOpen(false);
            setProfileError(null);
          }
        }}
        onSubmit={handleProfileSave}
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
                          <AsyncActionButton
                            onClick={() => handleApprove(doc.id)}
                            disabled={reviewingDocId === doc.id || isDecisionMade}
                            state={docActionStates[doc.id] ?? "idle"}
                            idleLabel="Approva"
                            loadingLabel="Invio..."
                            successLabel="Approvato"
                            errorLabel="Errore"
                            className="rounded-lg bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100"
                          />
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
        decisionAt={member.decision_at ?? undefined}
        initialNotes={member.decision_notes ?? undefined}
        isSubmitting={isSubmittingDecision}
        approveState={decisionActionStates.approve}
        rejectState={decisionActionStates.reject}
        onSubmit={handleDecision}
      />

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <h3 className="text-sm font-semibold text-neutral-900 mb-2">Area Pericolosa</h3>
        <p className="text-sm text-neutral-500 mb-4">
          Eliminando il socio, verranno rimossi i suoi accessi e non comparira piu negli elenchi attivi.
        </p>
        <button
          onClick={() => setDeleteConfirmOpen(true)}
          className="bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
        >
          Elimina Socio
        </button>
      </div>
      <ConfirmModal
        open={Boolean(decisionDraft)}
        title={decisionDraft?.decision === "approve" ? "Approva iscrizione" : "Rifiuta iscrizione"}
        description={
          decisionDraft?.decision === "approve"
            ? "Conferma l'approvazione di questa iscrizione. Il profilo verrà aggiornato subito senza refresh completo."
            : "Conferma il rifiuto di questa iscrizione. Le note inserite resteranno associate alla decisione."
        }
        confirmLabel={decisionDraft?.decision === "approve" ? "Conferma approvazione" : "Conferma rifiuto"}
        tone={decisionDraft?.decision === "approve" ? "brand" : "danger"}
        confirmState={decisionDraft ? decisionActionStates[decisionDraft.decision] : "idle"}
        onClose={() => {
          if (!isSubmittingDecision) {
            setDecisionDraft(null);
          }
        }}
        onConfirm={confirmDecision}
      />
      <ConfirmModal
        open={deleteConfirmOpen}
        title="Elimina socio"
        description="Questa azione rimuove definitivamente il socio e revoca subito i suoi accessi. Nessun refresh completo della pagina."
        confirmLabel="Elimina definitivamente"
        tone="danger"
        confirmState={deleteActionState}
        onClose={() => {
          if (deleteActionState !== "loading") {
            setDeleteConfirmOpen(false);
            setDeleteActionState("idle");
          }
        }}
        onConfirm={confirmDelete}
      />
      </>
      )}
    </div>
  );
}

