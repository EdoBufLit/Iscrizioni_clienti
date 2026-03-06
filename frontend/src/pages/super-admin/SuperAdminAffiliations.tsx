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

  const withAction = async (fn: () => Promise<void>) => {
    try {
      setActionLoading(true);
      await fn();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operazione non riuscita");
    } finally {
      setActionLoading(false);
    }
  };

  const onApproveDocument = async (doc: AffiliationDraftDocument) => {
    if (!detail) return;
    await withAction(async () => {
      await reviewSuperAdminAffiliationDocument(detail.id, doc.id, {
        status: "approved",
        notes: "Documento verificato",
      });
      await refreshAll();
    });
  };

  const onRejectDocument = async (doc: AffiliationDraftDocument) => {
    if (!detail) return;
    const note = window.prompt("Inserisci la nota di rifiuto:");
    if (!note) return;
    await withAction(async () => {
      await reviewSuperAdminAffiliationDocument(detail.id, doc.id, {
        status: "rejected",
        notes: note,
      });
      await refreshAll();
    });
  };

  const onVerifyPayment = async () => {
    if (!detail) return;
    await withAction(async () => {
      await verifySuperAdminAffiliationPayment(detail.id, {
        verified: true,
        notes: "Pagamento manuale verificato da super admin",
      });
      await refreshAll();
    });
  };

  const onRequestChanges = async () => {
    if (!detail) return;
    const note = window.prompt("Nota modifiche richiesta:");
    if (!note) return;
    await withAction(async () => {
      await requestChangesSuperAdminAffiliation(detail.id, note);
      await refreshAll();
    });
  };

  const onApprove = async () => {
    if (!detail) return;
    const confirmed = window.confirm("Confermi l'approvazione dell'affiliazione?");
    if (!confirmed) return;
    await withAction(async () => {
      await approveSuperAdminAffiliation(detail.id, "Approvazione super admin");
      await refreshAll();
    });
  };

  const onReject = async () => {
    if (!detail) return;
    const note = window.prompt("Inserisci motivo rifiuto:");
    if (!note) return;
    await withAction(async () => {
      await rejectSuperAdminAffiliation(detail.id, note);
      await refreshAll();
    });
  };

  const onDeleteDraft = async () => {
    if (!detail) return;
    const confirmed = window.confirm(
      "Eliminare questa bozza? L'operazione e irreversibile.",
    );
    if (!confirmed) return;
    await withAction(async () => {
      await deleteSuperAdminAffiliationDraft(detail.id);
      setDetail(null);
      setSelectedId(null);
      await loadList();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Affiliazioni</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Revisione documenti, verifica pagamenti e approvazione pratiche.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
            value={query}
            onChange={(event) => {
              setPage(1);
              setQuery(event.target.value);
            }}
            placeholder="Cerca per nome o email"
          />
          <select
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(event) => {
              setPage(1);
              setStatusFilter(event.target.value);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button className="btn-ghost px-3 py-2 text-sm" onClick={() => loadList()}>
            Aggiorna
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/60 bg-white/40">
                <tr>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-neutral-500">Associazione</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-neutral-500">Richiedente</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-neutral-500">Stato</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-neutral-500">Pagamento</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-neutral-500">Inviata</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-neutral-500" colSpan={5}>
                      Caricamento pratiche...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-neutral-500" colSpan={5}>
                      Nessuna affiliazione trovata.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr
                      key={item.id}
                      className={`cursor-pointer border-b border-white/40 transition hover:bg-brand/[0.04] ${
                        selectedId === item.id ? "bg-brand/[0.08]" : ""
                      }`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <td className="px-4 py-3 font-medium text-neutral-900">{item.organization_name || "-"}</td>
                      <td className="px-4 py-3 text-neutral-700">{item.applicant_email || "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${statusBadgeClass(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${paymentBadgeClass(item.payment_status)}`}>
                          {item.payment_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{formatDate(item.submitted_at || item.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-white/60 px-4 py-3 text-sm text-neutral-600">
            <button
              className="btn-ghost px-3 py-1.5 text-sm"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Precedente
            </button>
            <span>
              Pagina {page} di {totalPages}
            </span>
            <button
              className="btn-ghost px-3 py-1.5 text-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Successiva
            </button>
          </div>
        </div>

        <div className="surface p-5">
          {!selectedId || !selectedItem ? (
            <p className="text-sm text-neutral-500">Seleziona una pratica per vedere il dettaglio.</p>
          ) : detailLoading || !detail ? (
            <p className="text-sm text-neutral-500">Caricamento dettaglio...</p>
          ) : (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-neutral-900">{detail.organization_name || "Affiliazione"}</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Riferimento pagamento: {detail.payment_config.reference_code || "-"}
                </p>
              </div>

              <div className="grid gap-2 text-sm text-neutral-700">
                <div>Richiedente: {detail.applicant_full_name || "-"}</div>
                <div>Email: {detail.applicant_email || "-"}</div>
                <div>Telefono: {detail.applicant_phone || "-"}</div>
                <div>Stato: {detail.status}</div>
                <div>Doc status: {detail.docs_status}</div>
                <div>Pagamento: {detail.payment_status}</div>
                <div>Metodo: {detail.payment_method || "-"}</div>
              </div>

              {detail.referral && (
                <div className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">
                  <p className="font-semibold">Referral associazione</p>
                  <p className="mt-1">
                    Invitata da: <span className="font-medium">{detail.referral.referrer_org_name || "-"}</span>
                    {detail.referral.referrer_org_slug ? ` (${detail.referral.referrer_org_slug})` : ""}
                  </p>
                  <p className="mt-1">Stato referral: {detail.referral.status}</p>
                  {detail.referral.reward_title ? (
                    <p className="mt-1">
                      Premio assegnato: <span className="font-medium">{detail.referral.reward_title}</span>
                      {detail.referral.reward_delivery_timing
                        ? ` - Erogazione: ${detail.referral.reward_delivery_timing}`
                        : ""}
                    </p>
                  ) : null}
                  {detail.referral.wheel_spun_at ? (
                    <p className="mt-1">
                      Ruota girata il:{" "}
                      <span className="font-medium">{formatDate(detail.referral.wheel_spun_at)}</span>
                      {detail.referral.wheel_spun_by_org_admin_id
                        ? ` (org admin #${detail.referral.wheel_spun_by_org_admin_id})`
                        : ""}
                    </p>
                  ) : null}
                  {detail.referral.wheel_result?.description ? (
                    <p className="mt-1">
                      Dettaglio esito:{" "}
                      <span className="font-medium">{detail.referral.wheel_result.description}</span>
                    </p>
                  ) : null}
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Documenti</h4>
                <div className="mt-2 space-y-2">
                  {(detail.documents || []).map((doc) => (
                    <div key={doc.id} className="rounded-md border border-neutral-200 bg-white px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-neutral-900">{doc.doc_type}</p>
                          <p className="text-xs text-neutral-500">{docStatusLabel(doc.status)}</p>
                        </div>
                        <a className="text-xs font-medium text-brand hover:underline" href={doc.download_url} target="_blank" rel="noreferrer">
                          Scarica
                        </a>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                          disabled={actionLoading}
                          onClick={() => onApproveDocument(doc)}
                        >
                          Approva
                        </button>
                        <button
                          className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700"
                          disabled={actionLoading}
                          onClick={() => onRejectDocument(doc)}
                        >
                          Rifiuta
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-4">
                {detail.status === "draft" ? (
                  <button
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                    disabled={actionLoading}
                    onClick={onDeleteDraft}
                  >
                    Elimina bozza
                  </button>
                ) : null}
                {detail.status !== "draft" && detail.payment_method !== "stripe" && (
                  <button
                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700"
                    disabled={actionLoading}
                    onClick={onVerifyPayment}
                  >
                    Verifica pagamento manuale
                  </button>
                )}
                {detail.status !== "draft" &&
                detail.status !== "approved" &&
                detail.status !== "rejected" ? (
                  <button
                    className="rounded-md border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700"
                    disabled={actionLoading}
                    onClick={onRequestChanges}
                  >
                    Richiedi modifiche
                  </button>
                ) : null}
                {detail.can_approve ? (
                  <button
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                    disabled={actionLoading}
                    onClick={onApprove}
                  >
                    Approva
                  </button>
                ) : null}
                {detail.status !== "draft" &&
                detail.status !== "approved" &&
                detail.status !== "rejected" ? (
                  <button
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                    disabled={actionLoading}
                    onClick={onReject}
                  >
                    Rifiuta
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuperAdminAffiliations;
