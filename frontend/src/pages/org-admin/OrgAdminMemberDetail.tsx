import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import ModalShell from "../../components/ui/ModalShell";
import MemberDetailHeader, { type MemberDetailTab } from "./components/MemberDetailHeader";
import MemberPaymentsPanel from "./components/MemberPaymentsPanel";
import { displayMemberName, documentMeta, formatMemberDate, lifecycleMeta, paymentMeta, paymentMethodLabel as humanPaymentMethod, workflowMeta } from "./components/memberDetailPresentation";
import { MemberCardPreview } from "../../components/cards/MemberCardPreview";
import ManualPaymentForm, { type ManualPaymentPayload } from "./components/ManualPaymentForm";
import TemporaryPurchasesPanel from "./components/TemporaryPurchasesPanel";
import MemberDecisionPanel from "./components/MemberDecisionPanel";
import RejectDocumentModal from "./components/RejectDocumentModal";
import EditMemberProfileModal from "./components/EditMemberProfileModal";
import AsyncActionButton, { type AsyncActionState } from "../../components/ui/AsyncActionButton";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { useToast } from "../../components/ui/ToastProvider";
import { useOrgAdmin } from "./OrgAdminLayout";
import "./OrgAdminMemberDetail.css";

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
  const [activeTab, setActiveTab] = useState<MemberDetailTab>("profile");
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentRevision, setPaymentRevision] = useState(0);
  const [cardSheetOpen, setCardSheetOpen] = useState(false);
  const [decisionSheetOpen, setDecisionSheetOpen] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const requestSequence = useRef(0);
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
    let label = ACTION_LABELS[item.action] ?? "Aggiornamento del socio";
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
        details = docType === "identity" ? "Documento d'identità" : docType === "fiscal_code" ? "Codice fiscale" : "Documento reinviato";
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
        details = details ? `${details} · ${humanPaymentMethod(method)}` : humanPaymentMethod(method);
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
        const fieldLabels: Record<string, string> = { first_name: "nome", last_name: "cognome", email: "email", phone: "telefono", birth_date: "data di nascita", birth_place: "luogo di nascita", birth_place_code: "comune", fiscal_code: "codice fiscale", membership_type: "tipo tessera", membership_fee_snapshot: "quota", valid_from: "inizio validità", valid_until: "scadenza", internal_notes: "note interne" };
        details = `Dati aggiornati: ${fields.map(field => fieldLabels[String(field)] ?? "altri dati").join(", ")}`;
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

  const closePaymentSheet = useCallback(() => { if (!paymentSaving) setPaymentSheetOpen(false); }, [paymentSaving]);
  const closeCardSheet = useCallback(() => setCardSheetOpen(false), []);
  const closeDecisionSheet = useCallback(() => setDecisionSheetOpen(false), []);
  const closeProfile = useCallback(() => { if (!profileSaving) { setEditModalOpen(false); setProfileError(null); } }, [profileSaving]);
  const closeRejectDocument = useCallback(() => { if (!reviewingDocId) setRejectingDoc(null); }, [reviewingDocId]);
  const closeDecisionConfirmation = useCallback(() => { if (!isSubmittingDecision) setDecisionDraft(null); }, [isSubmittingDecision]);
  const closeDeleteConfirmation = useCallback(() => { if (deleteActionState !== "loading") { setDeleteConfirmOpen(false); setDeleteActionState("idle"); } }, [deleteActionState]);

  useEffect(() => {
    setActiveTab("profile");
    setPaymentSheetOpen(false); setCardSheetOpen(false); setDecisionSheetOpen(false);
    void fetchMember();
    void loadMembershipSettings();
    return () => { requestSequence.current += 1; };
  }, [id]);

  const fetchMember = async (refresh = false) => {
    const sequence = ++requestSequence.current;
    if (!id) { setLoading(false); setError("Socio non trovato"); return; }
    if (!refresh) { setLoading(true); setError(null); }
    setRefreshError(null);
    try {
      const data = await fetchOrgAdminMemberDetail(Number(id));
      if (sequence === requestSequence.current) setMember(data);
    } catch (err) {
      if (sequence !== requestSequence.current) return;
      if (err instanceof AuthError) { navigate("/org-admin/login", { replace: true }); return; }
      if (refresh) setRefreshError("Operazione salvata; non è stato possibile aggiornare i dati. Riprova l'aggiornamento.");
      else setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
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
          ? "Accesso accodato. Verrà inviato a breve."
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
      setPaymentRevision(value => value + 1);
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
      await fetchMember(true);
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
    const printWindow = isPrint ? window.open("", "_blank") : null;
    // Retain the handle for our generated PDF while isolating the admin window.
    if (printWindow) printWindow.opener = null;
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
      await fetchMember(true);

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
      await fetchMember(true);
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
    setDecisionSheetOpen(false);
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
      await fetchMember(true);
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
    if (!member || paymentSaving) return;
    setPaymentSaving(true);
    try {
      const result = await createManualPayment(member.id, {
        amount: payload.amount,
        method: payload.method,
        paid_at: payload.paid_at,
        notes: payload.notes,
      });
      // A failed refresh must not offer another registration after a successful write.
      setMember(current => current ? {
        ...current,
        card_is_paid: true,
        payment_status: result.membership_payment?.status ?? "manual_completed",
        payment_completed_at: result.membership_payment?.confirmed_at ?? result.payment.paid_at ?? payload.paid_at,
      } : current);
      setPaymentSheetOpen(false);
      setPaymentRevision(value => value + 1);
      showToast({ tone: "success", title: "Pagamento registrato", message: "La quota è stata registrata." });
      await fetchMember(true);
      window.requestAnimationFrame(() => document.getElementById("member-tab-payments")?.focus());
    } catch (err) {
      throw err instanceof Error ? err : new Error("Errore durante il salvataggio");
    } finally { setPaymentSaving(false); }
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

  const workflowStatus = (member.workflow_status || member.status || "").toLowerCase();
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
    ? formatMemberDate(member.last_access_email_at, true)
    : null;
  const paymentMethodSummary = humanPaymentMethod(member.payment_method);
  const cardNumber = member.card_number ?? member.card_no ?? null;
  const canUseCardActions = Boolean(cardNumber && member.card_year);
  const canSendCardEmail = Boolean(canUseCardActions && member.is_active && member.email);
  const cardPreviewData = {
    firstName: member.first_name,
    lastName: member.last_name,
    fullName: `${member.first_name} ${member.last_name}`.trim(),
    organizationName: admin?.organization?.name ?? null,
    organizationSlug: admin?.organization?.slug ?? null,
    organizationLogoUrl: membershipSettings?.card_logo_url ?? null,
    cardNumber,
    cardStatus: member.status,
    cardYear: member.card_year ?? null,
    membershipTypeLabel: member.membership_type_label ?? null,
    validUntil: member.valid_until ?? null,
    verificationUrl: member.card_verification_url ?? null,
  };


  const paymentStatus = paymentMeta(member);
  const name = displayMemberName(member.first_name, member.last_name);
  const lifecycle = lifecycleMeta(member.status);
  const workflow = workflowMeta(workflowStatus);
  const documentState = documentMeta(documentStatus);
  const decisionMade = Boolean(member.decision_at) || ["active", "rejected"].includes(workflowStatus.toLowerCase());
  const showCard = () => setCardSheetOpen(true);
  const openProfile = () => { setProfileError(null); setEditModalOpen(true); };
  const cardPanel = <section className="member-detail-panel member-detail-card" aria-label="Tessera socio">
    <h2>Tessera socio</h2>
    <div className="member-detail-card-preview"><MemberCardPreview cardData={cardPreviewData} className="max-w-[420px]" /></div>
    <div className="member-detail-card-actions">
      <button type="button" onClick={handleSendCardEmail} disabled={sendingCardEmail || !canSendCardEmail} className="btn-primary member-detail-card-send">{sendingCardEmail ? "Invio…" : "Invia tessera via email"}</button>
      <button type="button" onClick={() => void downloadCardPdf("download")} disabled={downloadingCard || !canUseCardActions} className="btn-ghost">{downloadingCard ? "Preparazione…" : "Scarica PDF"}</button>
      <button type="button" onClick={() => void downloadCardPdf("print")} disabled={printingCard || !canUseCardActions} className="btn-ghost">{printingCard ? "Apertura…" : "Stampa"}</button>
    </div>
    <dl className="member-detail-data mt-4">
      <div><dt>Tipo tessera</dt><dd>{member.membership_type_label ?? "Annuale"}</dd></div>
      <div><dt>Iscrizione</dt><dd>{formatMemberDate(member.joined_at)}</dd></div>
      <div><dt>Scadenza</dt><dd>{formatMemberDate(member.valid_until, true)}</dd></div>
    </dl>
    {cardEmailError && <p role="alert" className="mt-3 text-sm text-red-600">{cardEmailError}</p>}
    {cardEmailMessage && <p role="status" className="mt-3 text-sm text-emerald-600">{cardEmailMessage}</p>}
    {!canUseCardActions && <p className="member-detail-hint">Tessera non ancora assegnata.</p>}
    {canUseCardActions && !member.email && <p className="member-detail-hint">Aggiungi un'email per inviare la tessera.</p>}
    {canUseCardActions && !member.is_active && <p className="member-detail-hint">L'invio è disponibile per i soci attivi.</p>}
    {canUseCardActions && member.card_verification_url && <a href={member.card_verification_url} target="_blank" rel="noreferrer" className="member-detail-text-link mt-4 inline-flex">Verifica tessera ↗</a>}
  </section>;

  return <div className="member-detail">
    <Link to="/org-admin/soci" className="member-detail-back"><span aria-hidden="true">←</span> Soci</Link>
    <MemberDetailHeader member={member} activeTab={activeTab} onTabChange={setActiveTab} onEdit={openProfile} onShowCard={showCard} />
    {refreshError && <div role="alert" className="member-detail-panel text-sm text-red-600">{refreshError} <button type="button" className="underline" onClick={() => void fetchMember(true)}>Riprova aggiornamento</button></div>}
    <div role="tabpanel" id={`member-panel-${activeTab}`} aria-labelledby={`member-tab-${activeTab}`} tabIndex={0} className="member-detail-content">
      {activeTab === "profile" && <div className="member-detail-profile-grid">
        <div className="member-detail-stack">
          <section className="member-detail-panel">
            <h2>Dati anagrafici</h2>
            <dl className="member-detail-data mt-4">
              <div><dt>Email</dt><dd>{member.email ? <a href={`mailto:${member.email}`}>{member.email}</a> : "Non indicata"}</dd></div>
              <div><dt>Telefono</dt><dd>{member.phone ? <a href={`tel:${member.phone.replace(/[^\d+]/g, "")}`}>{member.phone}</a> : "Non indicato"}</dd></div>
              <div><dt>Codice fiscale</dt><dd className="font-mono">{member.fiscal_code || "Non indicato"}</dd></div>
              <div><dt>Data di nascita</dt><dd>{formatMemberDate(member.birth_date)}</dd></div>
              <div><dt>Luogo di nascita</dt><dd>{member.birth_place || "Non indicato"}</dd></div>
              <div><dt>Categoria</dt><dd>{member.member_type || "Non indicata"}</dd></div>
              <div><dt>Metodo di pagamento</dt><dd>{paymentMethodSummary}</dd></div>
              {member.is_manual && <div><dt>Origine iscrizione</dt><dd>Inserimento manuale</dd></div>}
            </dl>
          </section>
          <section className="member-detail-panel">
            <h2>Stato iscrizione</h2>
            <dl className="member-detail-data mt-4">
              <div><dt>Socio</dt><dd><span className={`member-detail-badge ${lifecycle.tone}`}>{lifecycle.label}</span></dd></div>
              <div><dt>Iscrizione</dt><dd><span className={`member-detail-badge ${workflow.tone}`}>{workflow.label}</span></dd></div>
              <div><dt>Documenti</dt><dd><button type="button" onClick={() => setActiveTab("documents")} className={`member-detail-badge ${documentState.tone}`}>{documentState.label} →</button></dd></div>
              <div><dt>Quota {member.card_year ?? "associativa"}</dt><dd><button type="button" onClick={() => setActiveTab("payments")} className={`member-detail-badge ${paymentStatus.tone}`}>{paymentStatus.label} →</button></dd></div>
            </dl>
          </section>
          <section className="member-detail-panel" data-tour="admin-send-access">
            <h2>Accesso area riservata</h2>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-medium">{member.has_access ? "Account attivo" : "Accesso da attivare"}</p>{lastAccessLabel && <p className="member-detail-hint !mt-1">Ultimo invio: {lastAccessLabel}</p>}</div>
              {!member.has_access && <button type="button" onClick={handleSendAccess} disabled={sendingAccess || !member.email || !member.is_active} className="btn-ghost">{sendingAccess ? "Invio…" : "Invia accesso"}</button>}
            </div>
            {!member.has_access && !member.is_active && <p className="member-detail-hint">Attiva il socio per inviare l'accesso.</p>}
            {!member.has_access && !member.email && <p className="member-detail-hint">Aggiungi un'email per inviare l'accesso.</p>}
            {sendAccessError && <p role="alert" className="mt-3 text-sm text-red-600">{sendAccessError}</p>}
            {sendAccessMessage && <p role="status" className="mt-3 text-sm text-emerald-600">{sendAccessMessage}</p>}
          </section>
        </div>
        {cardPanel}
      </div>}
      {activeTab === "payments" && <div className="member-detail-stack">
        <MemberPaymentsPanel key={paymentRevision} member={member} paymentStatus={paymentStatus} registering={paymentSaving} onRegisterPayment={() => setPaymentSheetOpen(true)} />
        <TemporaryPurchasesPanel memberId={member.id} onChanged={async () => { await fetchMember(true); setPaymentRevision(value => value + 1); }} />
      </div>}
      {activeTab === "documents" && <div className="member-detail-stack">
      <div className="member-detail-panel !p-0 overflow-hidden" data-tour="admin-documents">
        <div className="px-6 py-4 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Documenti caricati</h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              {documentStatus === "not_provided" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 text-neutral-700">
                  Da caricare
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-amber-700">
                Da verificare {pendingDocsCount}
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
                            title="Scarica documento" aria-label={`Scarica ${doc.filename}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            <span>{downloadingDocId === doc.id ? "..." : "Scarica"}</span>
                          </button>
                          <AsyncActionButton
                            onClick={() => handleApprove(doc.id)}
                            disabled={reviewingDocId === doc.id}
                            state={docActionStates[doc.id] ?? "idle"}
                            idleLabel="Approva"
                            loadingLabel="Invio..."
                            successLabel="Approvato"
                            errorLabel="Errore"
                            className="rounded-lg bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100"
                          />
                          <button
                            onClick={() => openRejectModal(doc)}
                            disabled={reviewingDocId === doc.id}
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

        <section className="member-detail-panel"><h2>Note interne</h2><p className="mt-3 whitespace-pre-line text-sm text-[var(--theme-text-muted)]">{member.internal_notes || "Nessuna nota interna."}</p><button type="button" className="member-detail-text-link mt-3" onClick={openProfile}>Modifica note</button></section>
        {decisionMade ? <MemberDecisionPanel status={workflowStatus || member.status} decisionAt={member.decision_at ?? undefined} initialNotes={member.decision_notes ?? undefined} isSubmitting={isSubmittingDecision} approveState={decisionActionStates.approve} rejectState={decisionActionStates.reject} onSubmit={handleDecision} /> : <section className="member-detail-panel flex flex-wrap items-center justify-between gap-3"><div><h2>Decisione iscrizione</h2><p className="member-detail-hint">Da valutare</p></div><button type="button" className="btn-primary" onClick={() => setDecisionSheetOpen(true)}>Valuta iscrizione</button></section>}
      </div>}
      {activeTab === "activity" && <>
        <div className="member-detail-panel">
          <h2 className="text-lg font-semibold mb-2">Attività recenti</h2>
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
                  ? formatMemberDate(item.created_at, true)
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
      </>}
    </div>
    <div className="member-detail-footer"><button type="button" onClick={() => setDeleteConfirmOpen(true)} className="member-detail-delete">Elimina socio</button></div>
    <ModalShell open={paymentSheetOpen} title="Registra pagamento" placement="bottom" sizeClassName="max-w-xl member-detail-sheet" onClose={closePaymentSheet} closeDisabled={paymentSaving} closeOnEscape={!paymentSaving} closeOnOverlay={!paymentSaving}>
      <p className="mb-4 text-sm text-[var(--theme-text-muted)]">Quota {member.card_year ?? "associativa"} · {name}</p>
      <ManualPaymentForm embedded paymentMethodLabel={paymentMethodSummary} onSubmit={handleManualPayment} />
    </ModalShell>
    <ModalShell open={cardSheetOpen} title="Tessera socio" placement="bottom" sizeClassName="max-w-xl member-detail-sheet" onClose={closeCardSheet}>
      {cardPanel}
    </ModalShell>
    <ModalShell open={decisionSheetOpen} title="Valuta iscrizione" placement="bottom" sizeClassName="max-w-xl member-detail-sheet" onClose={closeDecisionSheet}>
      <MemberDecisionPanel status={workflowStatus || member.status} decisionAt={member.decision_at ?? undefined} initialNotes={member.decision_notes ?? undefined} isSubmitting={isSubmittingDecision} approveState={decisionActionStates.approve} rejectState={decisionActionStates.reject} onSubmit={handleDecision} />
    </ModalShell>
      <EditMemberProfileModal
        open={editModalOpen}
        member={member}
        membershipSettings={membershipSettings}
        saving={profileSaving}
        error={profileError}
        onClose={closeProfile}
        onSubmit={handleProfileSave}
      />

      {rejectingDoc && (
        <RejectDocumentModal
          open={Boolean(rejectingDoc)}
          docLabel={rejectingDoc.type === "identity" ? "Documento Identità" : rejectingDoc.type === "fiscal_code" ? "Codice Fiscale" : rejectingDoc.type}
          initialNote={rejectingDoc.rejection_note}
          isSubmitting={reviewingDocId === rejectingDoc.id}
          error={actionError}
          onClose={closeRejectDocument}
          onConfirm={handleReject}
        />
      )}

    <ConfirmModal open={Boolean(decisionDraft)} title={decisionDraft?.decision === "approve" ? "Approva iscrizione" : "Rifiuta iscrizione"} description={decisionDraft?.decision === "approve" ? "Conferma l'approvazione dell'iscrizione." : "Conferma il rifiuto dell'iscrizione."} objectName={name} impact="Le note resteranno associate alla decisione." confirmLabel={decisionDraft?.decision === "approve" ? "Conferma approvazione" : "Conferma rifiuto"} tone={decisionDraft?.decision === "approve" ? "brand" : "danger"} confirmState={decisionDraft ? decisionActionStates[decisionDraft.decision] : "idle"} onClose={closeDecisionConfirmation} onConfirm={confirmDecision} />
    <ConfirmModal open={deleteConfirmOpen} title="Elimina socio" description="Il socio verrà rimosso dagli elenchi e non potrà più accedere all'area riservata." objectName={name} impact="I suoi accessi saranno revocati. Verifica di aver selezionato il socio corretto." requireCheckbox checkboxLabel="Confermo di voler eliminare questo socio" confirmLabel="Elimina socio" tone="danger" confirmState={deleteActionState} onClose={closeDeleteConfirmation} onConfirm={confirmDelete} />
  </div>;
}
