import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import {
  AuthError,
  approveSuperAdminAffiliation,
  deleteSuperAdminAffiliationDraft,
  fetchSuperAdminAffiliationDetail,
  fetchSuperAdminAffiliations,
  rejectSuperAdminAffiliation,
  requestChangesSuperAdminAffiliation,
  reviewSuperAdminAffiliationDocument,
  type AffiliationDraftDocument,
  type SuperAdminAffiliationDetail,
  type SuperAdminAffiliationListItem,
  type SuperAdminProfile,
  verifySuperAdminAffiliationPayment,
} from "../../lib/api";
import AsyncActionButton, { type AsyncActionState } from "../../components/ui/AsyncActionButton";
import ConfirmModal from "../../components/ui/ConfirmModal";
import PromptModal from "../../components/ui/PromptModal";
import Skeleton from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/ToastProvider";

const STATUS_OPTIONS = [
  { value: "", label: "Tutti" },
  { value: "draft", label: "Bozza" },
  { value: "under_review", label: "In revisione" },
  { value: "changes_requested", label: "Modifiche richieste" },
  { value: "approved", label: "Approvata" },
  { value: "rejected", label: "Rifiutata" },
];

const PAGE_SIZE = 20;

const formatDate = (value: string | null | undefined) => {
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

const statusBadgeClass = (status: string) => {
  switch (status) {
    case "under_review":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "changes_requested":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "rejected":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-neutral-200 bg-neutral-50 text-neutral-600";
  }
};

const paymentBadgeClass = (status: string) => {
  switch (status) {
    case "paid":
    case "verified":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "payment_under_review":
    case "checkout_pending":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-neutral-200 bg-neutral-50 text-neutral-600";
  }
};

const docStatusLabel = (status: string) => {
  if (status === "approved") return "Approvato";
  if (status === "rejected") return "Rifiutato";
  return "In attesa";
};

const SuperAdminAffiliations = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useOutletContext<{ profile: SuperAdminProfile | null }>();
  const { showToast } = useToast();

  const [items, setItems] = useState<SuperAdminAffiliationListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SuperAdminAffiliationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionStates, setActionStates] = useState<Record<string, AsyncActionState>>({});
  const [modalActionState, setModalActionState] = useState<AsyncActionState>("idle");
  const [modalError, setModalError] = useState("");
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    tone?: "brand" | "danger";
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [promptModal, setPromptModal] = useState<{
    title: string;
    description: string;
    label: string;
    placeholder?: string;
    confirmLabel: string;
    initialValue?: string;
    onConfirm: (value: string) => Promise<void>;
  } | null>(null);
  const initialOpenId = Number(searchParams.get("applicationId") || "");

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetchSuperAdminAffiliations({
        page,
        pageSize: PAGE_SIZE,
        q: query.trim() || undefined,
        status: statusFilter || undefined,
      });
      setItems(response.items);
      setTotalPages(response.total_pages || 1);
      setError("");

      if (
        Number.isInteger(initialOpenId) &&
        initialOpenId > 0 &&
        response.items.some((item) => item.id === initialOpenId)
      ) {
        setSelectedId(initialOpenId);
      } else if (response.items.length > 0 && !response.items.some((item) => item.id === selectedId)) {
        setSelectedId(response.items[0].id);
      }
      if (response.items.length === 0) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/super-admin/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Errore caricamento affiliazioni");
    } finally {
      setLoading(false);
    }
  }, [initialOpenId, navigate, page, query, selectedId, statusFilter]);

  const loadDetail = useCallback(
    async (id: number) => {
      try {
        setDetailLoading(true);
        const response = await fetchSuperAdminAffiliationDetail(id);
        setDetail(response);
      } catch (err) {
        if (err instanceof AuthError) {
          navigate("/super-admin/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Errore caricamento dettaglio");
      } finally {
        setDetailLoading(false);
      }
    },
    [navigate],
  );

  useEffect(() => {
    if (!profile) return;
    loadList();
  }, [profile, loadList]);

  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId);
  }, [loadDetail, selectedId]);

  const refreshAll = useCallback(async () => {
    await loadList();
    if (selectedId) {
      await loadDetail(selectedId);
    }
  }, [loadDetail, loadList, selectedId]);

  const setActionState = (key: string, state: AsyncActionState) => {
    setActionStates((prev) => ({ ...prev, [key]: state }));
  };

  const resetActionStateLater = (key: string) => {
    window.setTimeout(() => {
      setActionStates((prev) => ({ ...prev, [key]: "idle" }));
    }, 1300);
  };

  const runInlineAction = async (key: string, successMessage: string, fn: () => Promise<void>) => {
    setActionState(key, "loading");
    try {
      setActionLoading(true);
      await fn();
      setError("");
      setActionState(key, "success");
      showToast({ tone: "success", title: "Affiliazioni", message: successMessage });
      resetActionStateLater(key);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Operazione non riuscita";
      setError(message);
      setActionState(key, "error");
      showToast({ tone: "error", title: "Affiliazioni", message });
      resetActionStateLater(key);
    } finally {
      setActionLoading(false);
    }
  };

  const closeModalState = () => {
    if (modalActionState === "loading") {
      return;
    }
    setConfirmModal(null);
    setPromptModal(null);
    setModalError("");
    setModalActionState("idle");
  };

  const runModalAction = async (successMessage: string, fn: () => Promise<void>) => {
    try {
      setActionLoading(true);
      setModalActionState("loading");
      setModalError("");
      await fn();
      setError("");
      setModalActionState("success");
      showToast({ tone: "success", title: "Affiliazioni", message: successMessage });
      window.setTimeout(() => {
        setConfirmModal(null);
        setPromptModal(null);
        setModalError("");
        setModalActionState("idle");
      }, 900);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Operazione non riuscita";
      setError(message);
      setModalError(message);
      setModalActionState("error");
      showToast({ tone: "error", title: "Affiliazioni", message });
      window.setTimeout(() => setModalActionState("idle"), 1300);
    } finally {
      setActionLoading(false);
    }
  };

  const onApproveDocument = async (doc: AffiliationDraftDocument) => {
    if (!detail) return;
    await runInlineAction(`doc-approve-${doc.id}`, "Documento approvato.", async () => {
      await reviewSuperAdminAffiliationDocument(detail.id, doc.id, {
        status: "approved",
        notes: "Documento verificato",
      });
      await refreshAll();
    });
  };

  const onRejectDocument = async (doc: AffiliationDraftDocument) => {
    if (!detail) return;
    setPromptModal({
      title: "Rifiuta documento",
      description: `Inserisci la motivazione del rifiuto per ${doc.doc_type}.`,
      label: "Motivo del rifiuto",
      placeholder: "Scrivi una nota chiara per l'associazione...",
      confirmLabel: "Conferma rifiuto",
      onConfirm: async (note) =>
        runModalAction("Documento rigettato.", async () => {
          await reviewSuperAdminAffiliationDocument(detail.id, doc.id, {
            status: "rejected",
            notes: note,
          });
          await refreshAll();
        }),
    });
  };

  const onVerifyPayment = async () => {
    if (!detail) return;
    await runInlineAction("verify-payment", "Pagamento manuale verificato.", async () => {
      await verifySuperAdminAffiliationPayment(detail.id, {
        verified: true,
        notes: "Pagamento manuale verificato da super admin",
      });
      await refreshAll();
    });
  };

  const onRequestChanges = async () => {
    if (!detail) return;
    setPromptModal({
      title: "Richiedi modifiche",
      description: "Spiega all'associazione quali integrazioni o correzioni servono prima di proseguire.",
      label: "Nota modifiche richiesta",
      placeholder: "Indica i punti da correggere...",
      confirmLabel: "Invia richiesta",
      onConfirm: async (note) =>
        runModalAction("Richiesta modifiche inviata.", async () => {
          await requestChangesSuperAdminAffiliation(detail.id, note);
          await refreshAll();
        }),
    });
  };

  const onApprove = async () => {
    if (!detail) return;
    setConfirmModal({
      title: "Approva affiliazione",
      description: "Conferma l'approvazione della pratica. Lo stato verrà aggiornato senza refresh completo della pagina.",
      confirmLabel: "Approva pratica",
      tone: "brand",
      onConfirm: async () =>
        runModalAction("Affiliazione approvata.", async () => {
          await approveSuperAdminAffiliation(detail.id, "Approvazione super admin");
          await refreshAll();
        }),
    });
  };

  const onReject = async () => {
    if (!detail) return;
    setPromptModal({
      title: "Rifiuta richiesta",
      description: "Inserisci il motivo del rifiuto. Il testo sarà salvato nel workflow della pratica.",
      label: "Motivo del rifiuto",
      placeholder: "Spiega perché la pratica non può essere approvata...",
      confirmLabel: "Conferma rifiuto",
      onConfirm: async (note) =>
        runModalAction("Pratica rigettata.", async () => {
          await rejectSuperAdminAffiliation(detail.id, note);
          await refreshAll();
        }),
    });
  };

  const onDeleteDraft = async () => {
    if (!detail) return;
    setConfirmModal({
      title: "Elimina bozza",
      description: "Questa operazione è irreversibile. La bozza verrà rimossa dall'archivio super admin.",
      confirmLabel: "Elimina bozza",
      tone: "danger",
      onConfirm: async () =>
        runModalAction("Bozza eliminata.", async () => {
          await deleteSuperAdminAffiliationDraft(detail.id);
          setDetail(null);
          setSelectedId(null);
          await loadList();
        }),
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Gestione Affiliazioni</h2>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            Revisione documentale e validazione flussi di affiliazione associazioni.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative group">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              className="premium-select pl-10 min-w-[240px] !bg-white/50 focus:!bg-white"
              value={query}
              onChange={(event) => {
                setPage(1);
                setQuery(event.target.value);
              }}
              placeholder="Cerca per nome o email..."
            />
          </div>
          <select
            className="premium-select min-w-[160px]"
            value={statusFilter}
            onChange={(event) => {
              setPage(1);
              setStatusFilter(event.target.value);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                Stato: {option.label}
              </option>
            ))}
          </select>
          <button className="btn-ghost !px-4 !py-2 !text-xs font-bold uppercase tracking-widest" onClick={() => loadList()}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200/50 bg-red-50/50 p-5 flex items-center gap-3 animate-in slide-in-from-top-2">
          <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm font-bold text-red-900">{error}</p>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] items-start">
        <div className="surface overflow-hidden border-neutral-200/60 shadow-premium-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/50">
                  <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Associazione</th>
                  <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Stato Pratica</th>
                  <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Pagamento</th>
                  <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {loading ? (
                  <tr>
                    <td className="px-4 py-16 text-center" colSpan={4}>
                      <div className="inline-flex items-center gap-2 text-xs font-bold text-neutral-400 uppercase tracking-widest animate-pulse">
                        <span className="h-2 w-2 rounded-full bg-brand" />
                        Sincronizzazione database...
                      </div>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-16 text-center" colSpan={4}>
                      <p className="text-xs font-bold text-neutral-300 uppercase tracking-widest">Nessun record trovato</p>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr
                      key={item.id}
                      className={`group cursor-pointer transition-all duration-200 hover:bg-brand/[0.02] ${
                        selectedId === item.id ? "bg-brand/[0.05]" : ""
                      }`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <td className="px-4 py-4">
                        <p className={`text-sm font-bold transition-colors ${selectedId === item.id ? 'text-brand' : 'text-neutral-900 group-hover:text-brand'}`}>
                          {item.organization_name || "N/D"}
                        </p>
                        <p className="text-[10px] text-neutral-400 mt-0.5 uppercase tracking-tighter truncate max-w-[180px]">
                          {item.applicant_email}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter ring-1 ring-inset ${statusBadgeClass(item.status)}`}>
                          {item.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter ring-1 ring-inset ${paymentBadgeClass(item.payment_status)}`}>
                          {item.payment_status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <p className="text-[11px] font-bold text-neutral-500 tabular-nums">
                          {formatDate(item.submitted_at || item.created_at).split(',')[0]}
                        </p>
                        <p className="text-[9px] text-neutral-400 uppercase tracking-tighter">
                          {formatDate(item.submitted_at || item.created_at).split(',')[1] || ''}
                        </p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/30 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Pagina {page} / {totalPages}
            </p>
            <div className="flex gap-1">
              <button
                className="btn-ghost !px-3 !py-1 !text-[10px] font-bold uppercase tracking-widest disabled:opacity-30"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                ← Precedente
              </button>
              <button
                className="btn-ghost !px-3 !py-1 !text-[10px] font-bold uppercase tracking-widest disabled:opacity-30"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Successiva →
              </button>
            </div>
          </div>
        </div>

        <div className={`surface transition-all duration-500 ${!selectedId || !selectedItem ? 'bg-neutral-50/50' : 'bg-white shadow-premium-lg'}`}>
          {!selectedId || !selectedItem ? (
            <div className="p-12 text-center flex flex-col items-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-neutral-100 text-neutral-300 flex items-center justify-center">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-neutral-400 uppercase tracking-widest">Seleziona una pratica</p>
            </div>
          ) : detailLoading || !detail ? (
            <div className="p-12 space-y-6">
              <Skeleton className="h-8 w-2/3" />
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="p-6 border-b border-neutral-100 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="h-2 w-2 rounded-full bg-brand animate-pulse" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Affiliazione #{detail.id}</p>
                  </div>
                  <h3 className="text-xl font-bold text-neutral-900 tracking-tight leading-tight">{detail.organization_name || "Associazione"}</h3>
                  <p className="mt-1 text-xs font-mono font-bold text-neutral-400 uppercase">Ref: {detail.payment_config.reference_code || "N/D"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Stato</p>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-tighter ring-1 ring-inset ${statusBadgeClass(detail.status)}`}>
                    {detail.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              <div className="p-6 space-y-8">
                {/* Details Grid */}
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Anagrafica Richiedente</h4>
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-neutral-400 w-5">👤</span>
                        <span className="font-bold text-neutral-700">{detail.applicant_full_name || "-"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-neutral-400 w-5">✉️</span>
                        <span className="font-medium text-brand truncate">{detail.applicant_email || "-"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-neutral-400 w-5">📞</span>
                        <span className="font-medium text-neutral-600">{detail.applicant_phone || "-"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Dati Amministrativi</h4>
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-neutral-400 w-5">📄</span>
                        <span className="font-bold text-neutral-700 uppercase tracking-tighter">Docs: {detail.docs_status}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-neutral-400 w-5">💳</span>
                        <span className={`font-bold uppercase tracking-tighter ${detail.payment_status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>{detail.payment_status}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-neutral-400 w-5">🏛️</span>
                        <span className="font-medium text-neutral-600">Metodo: {detail.payment_method || "-"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Referral Info */}
                {detail.referral && (
                  <div className="rounded-2xl border border-cyan-100 bg-cyan-50/30 p-5 relative overflow-hidden group">
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">🔗</span>
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-700">Programma Referral</h4>
                      </div>
                      <div className="grid gap-3">
                        <p className="text-sm text-cyan-900 leading-relaxed">
                          Invitata da: <strong className="font-bold">{detail.referral.referrer_org_name || "-"}</strong>
                          <span className="ml-1.5 text-xs text-cyan-600/70 font-mono">[{detail.referral.referrer_org_slug}]</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center rounded-lg bg-cyan-100 px-2 py-1 text-[10px] font-bold uppercase text-cyan-700">
                            Stato: {detail.referral.status}
                          </span>
                          {detail.referral.reward_title && (
                            <span className="inline-flex items-center rounded-lg bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700">
                              Premio: {detail.referral.reward_title}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="absolute -right-8 -bottom-8 h-24 w-24 rounded-full bg-cyan-100/20 blur-2xl group-hover:bg-cyan-100/40 transition-colors duration-500" />
                  </div>
                )}

                {/* Documents Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Verifica Documentale</h4>
                    <span className="text-[10px] font-bold text-neutral-300 uppercase tracking-widest">{(detail.documents || []).length} file caricati</span>
                  </div>
                  <div className="grid gap-3">
                    {(detail.documents || []).map((doc) => (
                      <div key={doc.id} className="group rounded-xl border border-neutral-100 bg-neutral-50/30 p-4 transition-all hover:bg-white hover:shadow-md hover:border-brand/20">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center shadow-sm transition-colors ${doc.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : doc.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-white text-neutral-400 group-hover:bg-brand/5 group-hover:text-brand'}`}>
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-neutral-900 group-hover:text-brand transition-colors">{doc.doc_type}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${doc.status === 'approved' ? 'text-emerald-600' : doc.status === 'rejected' ? 'text-red-600' : 'text-neutral-400'}`}>
                                  {docStatusLabel(doc.status)}
                                </span>
                                {(doc.review_notes || doc.rejection_note) && <span className="text-[10px] text-neutral-300">•</span>}
                                {(doc.review_notes || doc.rejection_note) && <span className="text-[10px] text-neutral-400 italic truncate max-w-[120px]">{doc.review_notes || doc.rejection_note}</span>}
                              </div>
                            </div>
                          </div>
                          <a 
                            className="btn-ghost !px-3 !py-1.5 !text-[10px] font-bold uppercase tracking-widest shadow-sm hover:!bg-brand hover:!text-white transition-all" 
                            href={doc.download_url} 
                            target="_blank" 
                            rel="noreferrer"
                          >
                            View
                          </a>
                        </div>
                        
                        {doc.status !== 'approved' && (
                          <div className="mt-4 flex gap-2 pt-4 border-t border-neutral-100/50">
                            <AsyncActionButton
                              className="flex-1 rounded-lg bg-emerald-50 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-700 hover:bg-emerald-500 hover:text-white"
                              disabled={actionLoading}
                              state={actionStates[`doc-approve-${doc.id}`] ?? "idle"}
                              idleLabel="Approve"
                              loadingLabel="Invio..."
                              successLabel="Approved"
                              errorLabel="Errore"
                              onClick={() => onApproveDocument(doc)}
                            />
                            <button
                              className="flex-1 bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-widest py-2 rounded-lg hover:bg-red-500 hover:text-white transition-all disabled:opacity-30"
                              disabled={actionLoading}
                              onClick={() => onRejectDocument(doc)}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Main Actions */}
                <div className="pt-6 border-t border-neutral-100">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-4 text-center">Workflow Governance</h4>
                  <div className="flex flex-wrap gap-3">
                    {detail.status === "draft" && (
                      <button
                        className="flex-1 bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl border border-red-100 hover:bg-red-600 hover:text-white transition-all disabled:opacity-50"
                        disabled={actionLoading}
                        onClick={onDeleteDraft}
                      >
                        Elimina Bozza
                      </button>
                    )}
                    {detail.status !== "draft" && detail.payment_method !== "stripe" && detail.payment_status !== "paid" && (
                      <AsyncActionButton
                        className="w-full rounded-xl border border-amber-100 bg-amber-50 py-3 text-[10px] font-bold uppercase tracking-widest text-amber-700 hover:bg-amber-500 hover:text-white"
                        disabled={actionLoading}
                        state={actionStates["verify-payment"] ?? "idle"}
                        idleLabel="Valida Pagamento Manuale"
                        loadingLabel="Verifica..."
                        successLabel="Pagamento verificato"
                        errorLabel="Errore"
                        onClick={onVerifyPayment}
                      />
                    )}
                    <div className="grid grid-cols-2 gap-3 w-full mt-2">
                      {detail.status !== "draft" && detail.status !== "approved" && detail.status !== "rejected" && (
                        <button
                          className="bg-neutral-900 text-white text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl shadow-lg shadow-black/10 hover:bg-neutral-800 transition-all disabled:opacity-50"
                          disabled={actionLoading}
                          onClick={onRequestChanges}
                        >
                          Modifiche
                        </button>
                      )}
                      {detail.can_approve && (
                        <button
                          className="bg-brand text-white text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl shadow-lg shadow-brand/20 hover:bg-brand-light transition-all disabled:opacity-50"
                          disabled={actionLoading}
                          onClick={onApprove}
                        >
                          Approva Pratica
                        </button>
                      )}
                      {detail.status !== "draft" && detail.status !== "approved" && detail.status !== "rejected" && !detail.can_approve && (
                        <button
                          className="bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl shadow-lg shadow-red-200 hover:bg-red-700 transition-all disabled:opacity-50"
                          disabled={actionLoading}
                          onClick={onReject}
                        >
                          Rigetta
                        </button>
                      )}
                    </div>
                  </div>
                  {actionLoading && (
                    <p className="mt-4 text-center text-[10px] font-bold text-brand uppercase tracking-widest animate-pulse">Esecuzione comando governance in corso...</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <ConfirmModal
        open={Boolean(confirmModal)}
        title={confirmModal?.title ?? ""}
        description={confirmModal?.description ?? ""}
        confirmLabel={confirmModal?.confirmLabel ?? "Conferma"}
        tone={confirmModal?.tone ?? "brand"}
        confirmState={modalActionState}
        onClose={closeModalState}
        onConfirm={() => {
          if (confirmModal) {
            void confirmModal.onConfirm();
          }
        }}
      />
      <PromptModal
        open={Boolean(promptModal)}
        title={promptModal?.title ?? ""}
        description={promptModal?.description ?? ""}
        label={promptModal?.label ?? ""}
        placeholder={promptModal?.placeholder}
        initialValue={promptModal?.initialValue}
        confirmLabel={promptModal?.confirmLabel ?? "Conferma"}
        confirmState={modalActionState}
        error={modalError}
        onClose={closeModalState}
        onConfirm={(value) => {
          if (promptModal) {
            void promptModal.onConfirm(value);
          }
        }}
      />
    </div>
  );
};

export default SuperAdminAffiliations;
