import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import {
  AuthError,
  deleteOrganization,
  fetchSuperAdminOrganizations,
  type SuperAdminOrganization,
  type SuperAdminProfile,
} from "../../lib/api";
import { useSuperAdminOrganizationsQueryState } from "../../hooks/useSuperAdminOrganizationsQueryState";
import Skeleton from "../../components/ui/Skeleton";
import OrganizationManageModal, {
  type OrganizationModalType,
} from "./components/OrganizationManageModal";
import SuperAdminPienissimoIntegrationCard from "./components/SuperAdminPienissimoIntegrationCard";

const thClass =
  "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400";
const tdClass = "px-5 py-3.5 text-sm text-neutral-700";
const PAGE_SIZE_OPTIONS = [50, 100];
const SEARCH_DEBOUNCE_MS = 400;
const DEFAULT_SORT = "created_at:desc";

const getVisiblePages = (page: number, totalPages: number): Array<number | "ellipsis"> => {
  if (totalPages <= 1) {
    return [1];
  }

  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (page <= 3) {
    return [1, 2, 3, 4, "ellipsis", totalPages];
  }

  if (page >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "ellipsis", page - 1, page, page + 1, "ellipsis", totalPages];
};

const SuperAdminOrganizations = () => {
  const navigate = useNavigate();
  const { profile } = useOutletContext<{ profile: SuperAdminProfile | null }>();
  const isSuperAdmin = profile?.role === "super_admin";
  const {
    q,
    page,
    pageSize,
    setSearchQuery,
    setPage,
    setPageSize,
  } = useSuperAdminOrganizationsQueryState();

  const [orgs, setOrgs] = useState<SuperAdminOrganization[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState(q);
  const [reloadToken, setReloadToken] = useState(0);

  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<OrganizationModalType>("create");
  const [selectedOrg, setSelectedOrg] = useState<SuperAdminOrganization | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<SuperAdminOrganization | null>(null);
  const [deleteMode, setDeleteMode] = useState<"archive" | "purge">("archive");
  const [purgeSlugInput, setPurgeSlugInput] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [integrationOrg, setIntegrationOrg] = useState<SuperAdminOrganization | null>(null);

  const requestIdRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    if (searchInput.trim() === q) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInput);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [q, searchInput, setSearchQuery]);

  const refreshOrganizations = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!profile) {
      return;
    }

    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    } else {
      setIsFetching(true);
    }

    fetchSuperAdminOrganizations({
      page,
      pageSize,
      q: q || undefined,
      sort: DEFAULT_SORT,
      signal: controller.signal,
    })
      .then((response) => {
        if (requestId !== requestIdRef.current) {
          return;
        }

        if (response.total > 0 && page > response.total_pages) {
          setPage(response.total_pages);
          return;
        }

        if (response.total === 0 && page !== 1) {
          setPage(1);
          return;
        }

        setOrgs(response.items);
        setTotal(response.total);
        setTotalPages(response.total_pages);
        setError("");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (requestId !== requestIdRef.current) {
          return;
        }

        if (err instanceof AuthError) {
          navigate("/super-admin/login", { replace: true });
          return;
        }

        const message =
          err instanceof Error && err.message.trim()
            ? err.message
            : "Errore nel caricamento delle associazioni.";
        setError(message);
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) {
          return;
        }

        hasLoadedOnceRef.current = true;
        setLoading(false);
        setIsFetching(false);
      });

    return () => controller.abort();
  }, [navigate, page, pageSize, profile, q, reloadToken, setPage]);

  const openModal = useCallback((type: OrganizationModalType, org?: SuperAdminOrganization) => {
    setModalType(type);
    setSelectedOrg(org || null);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const handleModalSaved = useCallback(() => {
    setShowModal(false);
    refreshOrganizations();
  }, [refreshOrganizations]);

  const handleSwitchToAddBatch = useCallback(() => {
    if (!selectedOrg) {
      return;
    }
    setModalType("add-batch");
  }, [selectedOrg]);

  const handleDelete = useCallback((org: SuperAdminOrganization) => {
    setDeleteConfirm(org);
    const shouldDefaultPurge = org.is_active && !org.is_archived && !Boolean(org.deleted_at);
    setDeleteMode(shouldDefaultPurge ? "purge" : "archive");
    setPurgeSlugInput("");
    setDeleteError("");
  }, []);

  const openIntegrationModal = useCallback((org: SuperAdminOrganization) => {
    setIntegrationOrg(org);
  }, []);

  const closeIntegrationModal = useCallback(() => {
    setIntegrationOrg(null);
  }, []);

  const applySearchImmediately = useCallback(() => {
    setSearchQuery(searchInput);
  }, [searchInput, setSearchQuery]);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setSearchQuery("");
  }, [setSearchQuery]);

  const confirmDelete = async () => {
    if (!deleteConfirm || deleting) {
      return;
    }
    if (deleteMode === "purge" && purgeSlugInput.trim() !== deleteConfirm.slug) {
      setDeleteError("Per confermare il purge devi digitare esattamente lo slug dell'associazione.");
      return;
    }

    setDeleting(true);
    setDeleteError("");
    setDeleteSuccess("");

    try {
      const result = await deleteOrganization(deleteConfirm.id, {
        mode: deleteMode,
        releaseRange: true,
        force: deleteMode === "purge",
      });
      const range = result.releasedRange
        ? `${result.releasedRange.start}-${result.releasedRange.end}`
        : "nessuno";
      setDeleteSuccess(
        deleteMode === "archive"
          ? `Associazione archiviata. Range liberato: ${range}.`
          : `Associazione eliminata definitivamente. Range liberato: ${range}.`,
      );
      setDeleteConfirm(null);
      setPurgeSlugInput("");
      refreshOrganizations();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Errore durante l'eliminazione");
    } finally {
      setDeleting(false);
    }
  };

  const totalLabel =
    total === 1 ? "1 associazione" : `${total.toLocaleString("it-IT")} associazioni`;
  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = total === 0 ? 0 : Math.min(page * pageSize, total);
  const visiblePages = getVisiblePages(page, totalPages);

  if (loading && !orgs.length) {
    return (
      <div>
        <Skeleton className="h-6 w-64" />
        <Skeleton className="mt-3 h-4 w-96" />
        <div className="mt-6">
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
        <div className="mt-6">
          <Skeleton className="h-56 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 min-h-[76px]">
        {error && (
          <div className="rounded-lg border border-red-200/60 bg-red-50 px-7 py-5">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {!error && deleteSuccess && (
          <div className="rounded-lg border border-emerald-200/60 bg-emerald-50 px-7 py-5">
            <p className="text-sm text-emerald-700">{deleteSuccess}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Associazioni</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Gestisci le associazioni registrate sulla piattaforma.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white shadow-subtle transition hover:-translate-y-px hover:bg-brand-dark hover:shadow-card active:translate-y-0"
          onClick={() => openModal("create")}
          data-component="superadmin-orgs-open-modal"
        >
          Nuova associazione
        </button>
      </div>

      <div className="surface mt-8 px-5 py-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="w-full max-w-3xl">
            <label
              htmlFor="super-admin-org-search"
              className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500"
            >
              Ricerca globale
            </label>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </span>
              <input
                id="super-admin-org-search"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applySearchImmediately();
                  }
                }}
                placeholder="Cerca associazioni..."
                className="w-full rounded-2xl border border-neutral-200 bg-white px-12 py-3 text-sm text-neutral-700 shadow-subtle outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-800"
                  aria-label="Pulisci ricerca"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-neutral-400">
              Cerca su tutte le associazioni per nome, slug ed email. Invio forza la ricerca
              immediata.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 shadow-subtle">
              <label className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400">
                Righe
              </label>
              <select
                className="mt-1 block bg-transparent text-sm font-medium text-neutral-700 outline-none"
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} per pagina
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 border-t border-white/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-neutral-500">
            {total === 0 ? "0 associazioni" : `${startIndex}-${endIndex} di ${totalLabel}`}
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-400">
            {isFetching && <span>Aggiornamento elenco...</span>}
            <span>
              Pagina {page} di {totalPages}
            </span>
          </div>
        </div>
      </div>

      <div className="surface mt-8 overflow-hidden" data-component="superadmin-orgs-table">
        {isFetching && (
          <div className="border-b border-white/60 bg-brand/[0.04] px-5 py-3 text-xs font-medium uppercase tracking-[0.16em] text-brand">
            Caricamento risultati...
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-white/60 bg-white/40">
              <tr>
                <th className={thClass}>Nome</th>
                <th className={thClass}>Slug</th>
                <th className={thClass}>Citta</th>
                <th className={thClass}>Stato</th>
                <th className={thClass}>Stato affiliazione</th>
                <th className={thClass}>Tessere</th>
                <th className={thClass}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {orgs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-neutral-500">
                    {q
                      ? "Nessuna associazione trovata per la ricerca corrente."
                      : "Nessuna associazione trovata."}
                  </td>
                </tr>
              ) : (
                orgs.map((org, index) => (
                  <tr
                    key={org.id}
                    className={`transition hover:bg-brand/[0.02] ${index % 2 === 1 ? "bg-white/30" : ""}`}
                  >
                    <td className={`${tdClass} font-medium text-neutral-900`}>{org.name}</td>
                    <td className={tdClass}>{org.slug}</td>
                    <td className={tdClass}>
                      {org.city} {org.province ? `(${org.province})` : ""}
                    </td>
                    <td className={tdClass}>
                      {org.is_archived || org.deleted_at ? (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          Archiviata
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            org.is_active
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-neutral-200 bg-neutral-50 text-neutral-600"
                          }`}
                        >
                          {org.is_active ? "Attiva" : "Disattivata"}
                        </span>
                      )}
                    </td>
                    <td className={tdClass}>
                      {org.affiliation_status ? (
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                              org.affiliation_status === "approved"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : org.affiliation_status === "under_review"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : org.affiliation_status === "changes_requested"
                                    ? "border-orange-200 bg-orange-50 text-orange-700"
                                    : org.affiliation_status === "rejected"
                                      ? "border-red-200 bg-red-50 text-red-700"
                                      : "border-neutral-200 bg-neutral-50 text-neutral-600"
                            }`}
                          >
                            {org.affiliation_status}
                          </span>
                          {org.affiliation_application_id ? (
                            <Link
                              to={`/super-admin/affiliazioni?applicationId=${org.affiliation_application_id}`}
                              className="text-xs font-medium text-brand hover:text-brand-dark"
                            >
                              Apri pratica
                            </Link>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                    </td>
                    <td className={`${tdClass} tabular-nums`}>
                      {org.card_min ? (
                        <span>
                          {org.card_min} - {org.card_max}
                        </span>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                    </td>
                    <td className={tdClass}>
                      <div className="flex items-center gap-2">
                        {org.card_min ? (
                          <>
                            <button
                              onClick={() => openModal("view-batches", org)}
                              className="text-brand hover:text-brand-dark font-medium text-xs uppercase tracking-wide"
                            >
                              Lotti
                            </button>
                            <span className="text-neutral-300">|</span>
                            <button
                              onClick={() => openModal("add-batch", org)}
                              className="text-brand hover:text-brand-dark font-medium text-xs uppercase tracking-wide"
                            >
                              + Lotto
                            </button>
                            {isSuperAdmin && (
                              <>
                                <span className="text-neutral-300">|</span>
                                <button
                                  onClick={() => openIntegrationModal(org)}
                                  className="text-brand hover:text-brand-dark font-medium text-xs uppercase tracking-wide"
                                >
                                  Integrazione
                                </button>
                                <span className="text-neutral-300">|</span>
                                <button
                                  onClick={() => openModal("branding", org)}
                                  className="text-brand hover:text-brand-dark font-medium text-xs uppercase tracking-wide"
                                >
                                  Branding + Alert
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => openModal("range", org)}
                              className="text-brand hover:text-brand-dark font-medium text-xs uppercase tracking-wide"
                            >
                              Imposta range
                            </button>
                            {isSuperAdmin && (
                              <>
                                <span className="text-neutral-300">|</span>
                                <button
                                  onClick={() => openIntegrationModal(org)}
                                  className="text-brand hover:text-brand-dark font-medium text-xs uppercase tracking-wide"
                                >
                                  Integrazione
                                </button>
                                <span className="text-neutral-300">|</span>
                                <button
                                  onClick={() => openModal("branding", org)}
                                  className="text-brand hover:text-brand-dark font-medium text-xs uppercase tracking-wide"
                                >
                                  Branding + Alert
                                </button>
                              </>
                            )}
                          </>
                        )}
                        {isSuperAdmin && (
                          <>
                            <span className="text-neutral-300">|</span>
                            <button
                              onClick={() => handleDelete(org)}
                              className="text-red-600 hover:text-red-800 font-medium text-xs uppercase tracking-wide"
                            >
                              Elimina
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex flex-col gap-3 border-t border-white/60 px-5 py-4 text-sm text-neutral-600 md:flex-row md:items-center md:justify-between">
            <button
              type="button"
              className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              Precedente
            </button>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {visiblePages.map((value, index) =>
                value === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="px-1 text-neutral-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPage(value)}
                    className={`min-w-[40px] rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                      value === page
                        ? "border-brand bg-brand text-white"
                        : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
                    }`}
                    aria-current={value === page ? "page" : undefined}
                  >
                    {value}
                  </button>
                ),
              )}
            </div>

            <button
              type="button"
              className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
            >
              Successiva
            </button>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="modal-panel max-w-md p-6">
            <div className="flex items-center gap-3 text-red-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-lg font-semibold">Elimina e libera tessere</h3>
            </div>

            <p className="mt-4 text-sm text-neutral-700">
              Associazione: <strong>{deleteConfirm.name}</strong>
            </p>

            <div className="mt-4 space-y-3 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="delete-mode"
                  value="archive"
                  checked={deleteMode === "archive"}
                  onChange={() => {
                    setDeleteMode("archive");
                    setDeleteError("");
                  }}
                />
                <span className="text-sm text-neutral-700">
                  <strong>Archivia (consigliato) + libera range</strong>
                  <br />
                  L'associazione resta storicizzata ma disattivata.
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="delete-mode"
                  value="purge"
                  checked={deleteMode === "purge"}
                  onChange={() => {
                    setDeleteMode("purge");
                    setDeleteError("");
                  }}
                />
                <span className="text-sm text-neutral-700">
                  <strong>Elimina definitivamente (purge) + libera range</strong>
                  <br />
                  Cancella dati collegati in modo irreversibile.
                </span>
              </label>
            </div>

            {deleteMode === "purge" && (
              <div className="mt-4">
                <p className="text-sm text-neutral-700">
                  Per confermare il purge digita lo slug:{" "}
                  <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{deleteConfirm.slug}</code>
                </p>
                <input
                  type="text"
                  className="mt-2 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
                  value={purgeSlugInput}
                  onChange={(event) => setPurgeSlugInput(event.target.value)}
                  placeholder="Digita lo slug esatto"
                />
              </div>
            )}

            {deleteError && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {deleteError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                onClick={() => {
                  setDeleteConfirm(null);
                  setDeleteError("");
                  setPurgeSlugInput("");
                }}
                disabled={deleting}
              >
                Annulla
              </button>
              <button
                type="button"
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "Elaborazione..." : deleteMode === "archive" ? "Archivia e libera" : "Purge e libera"}
              </button>
            </div>
          </div>
        </div>
      )}

      <OrganizationManageModal
        open={showModal}
        modalType={modalType}
        selectedOrg={selectedOrg}
        onClose={closeModal}
        onSaved={handleModalSaved}
        onSwitchToAddBatch={handleSwitchToAddBatch}
      />

      {isSuperAdmin && integrationOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="modal-panel w-full max-w-3xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-neutral-900">Integrazione Pienissimo</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Gestione chiave API per: {integrationOrg.name}
                </p>
              </div>
              <button
                type="button"
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                onClick={closeIntegrationModal}
              >
                Chiudi
              </button>
            </div>

            <div className="mt-5">
              <SuperAdminPienissimoIntegrationCard
                orgId={integrationOrg.id}
                orgName={integrationOrg.name}
                open={Boolean(integrationOrg)}
                isSuperAdmin={isSuperAdmin}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminOrganizations;
