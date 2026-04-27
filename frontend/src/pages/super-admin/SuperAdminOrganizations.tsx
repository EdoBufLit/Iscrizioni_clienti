import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import {
  AuthError,
  deleteOrganization,
  fetchSuperAdminOrganizations,
  patchSuperAdminOrganization,
  type SuperAdminProfile,
  type SuperAdminOrganization,
} from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/ToastProvider";
import OrganizationManageModal from "./components/OrganizationManageModal";
import SuperAdminPienissimoIntegrationCard from "./components/SuperAdminPienissimoIntegrationCard";
import {
  SuperAdminActionButton,
  SuperAdminEmptyState,
  SuperAdminIcon,
  SuperAdminKpiCard,
  SuperAdminPageHeader,
  SuperAdminStatusChip,
  SuperAdminTableShell,
  SuperAdminToolbar,
  type SuperAdminTone,
} from "./components/SuperAdminPrimitives";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const SuperAdminOrganizations = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { profile } = useOutletContext<{ profile: SuperAdminProfile | null }>();
  const isSuperAdmin = profile?.role === "super_admin";

  const [orgs, setOrgs] = useState<SuperAdminOrganization[]>([]);
  const [metricOrgs, setMetricOrgs] = useState<SuperAdminOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending" | "archived">("all");
  const [scopeFilter, setScopeFilter] = useState<"all" | "shared" | "dedicated">("all");
  const [numberingFilter, setNumberingFilter] = useState<"all" | "configured" | "missing">("all");

  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<"create" | "range" | "branding" | "view-batches" | "add-batch">("create");
  const [selectedOrg, setSelectedOrg] = useState<SuperAdminOrganization | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<SuperAdminOrganization | null>(null);
  const [deleteMode, setDeleteMode] = useState<"archive" | "purge">("archive");
  const [purgeSlugInput, setPurgeSlugInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState("");

  const [integrationOrg, setIntegrationOrg] = useState<SuperAdminOrganization | null>(null);
  const [communicationsSavingOrgId, setCommunicationsSavingOrgId] = useState<number | null>(null);

  const searchTimeout = useRef<any>(null);

  const loadOrgs = useCallback(async () => {
    if (!profile) return;
    try {
      setIsFetching(true);
      const data = await fetchSuperAdminOrganizations({
        page,
        pageSize,
        q: q || undefined,
      });
      setOrgs(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
      fetchSuperAdminOrganizations({ page: 1, pageSize: 100, q: q || undefined })
        .then((payload) => setMetricOrgs(payload.items))
        .catch(() => setMetricOrgs(data.items));
      setError("");
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/super-admin/login", { replace: true });
      } else {
        setError("Impossibile caricare le associazioni.");
      }
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, [profile, page, pageSize, q, navigate]);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 400);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchInput]);

  const applySearchImmediately = () => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setQ(searchInput.trim());
    setPage(1);
  };

  const clearSearch = () => {
    setSearchInput("");
    setQ("");
    setPage(1);
  };

  const orgInitials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "A";

  const openModal = (type: typeof modalType, org: SuperAdminOrganization | null = null) => {
    setModalType(type);
    setSelectedOrg(org);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedOrg(null);
  };

  const handleModalSaved = () => {
    loadOrgs();
  };

  const handleSwitchToAddBatch = () => {
    setModalType("add-batch");
  };

  const handleDelete = (org: SuperAdminOrganization) => {
    setDeleteSuccess("");
    setDeleteError("");
    setDeleteConfirm(org);
    setDeleteMode("archive");
    setPurgeSlugInput("");
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteMode === "purge" && purgeSlugInput !== deleteConfirm.slug) {
      setDeleteError("Lo slug inserito non corrisponde.");
      return;
    }

    setDeleting(true);
    setDeleteError("");
    try {
      await deleteOrganization(deleteConfirm.id, {
        mode: deleteMode,
        releaseRange: true,
      });
      setDeleteSuccess(
        deleteMode === "purge"
          ? `Associazione ${deleteConfirm.name} eliminata definitivamente.`
          : `Associazione ${deleteConfirm.name} archiviata.`
      );
      setDeleteConfirm(null);
      loadOrgs();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Errore nell'operazione.");
    } finally {
      setDeleting(false);
    }
  };

  const openIntegrationModal = (org: SuperAdminOrganization) => {
    setIntegrationOrg(org);
  };

  const closeIntegrationModal = () => {
    setIntegrationOrg(null);
  };

  const handleToggleCommunications = async (org: SuperAdminOrganization, enabled: boolean) => {
    if (communicationsSavingOrgId === org.id) return;
    setCommunicationsSavingOrgId(org.id);
    try {
      const updated = await patchSuperAdminOrganization(org.id, {
        communications_enabled: enabled,
      });
      setOrgs((prev) => prev.map((item) => (item.id === org.id ? { ...item, ...updated } : item)));
      showToast({
        title: "Modulo Comunicazioni",
        message: `${updated.name}: ${enabled ? "attivato" : "disattivato"}.`,
        tone: "success",
      });
    } catch (err) {
      showToast({
        title: "Modulo Comunicazioni",
        message: err instanceof Error ? err.message : "Errore aggiornamento modulo.",
        tone: "error",
      });
    } finally {
      setCommunicationsSavingOrgId(null);
    }
  };

  const visiblePages = useMemo(() => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (page <= 4) {
        pages.push(1, 2, 3, 4, 5, "ellipsis", totalPages);
      } else if (page >= totalPages - 3) {
        pages.push(1, "ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, "ellipsis", page - 1, page, page + 1, "ellipsis", totalPages);
      }
    }
    return pages;
  }, [page, totalPages]);

  const statsSource = metricOrgs.length > 0 ? metricOrgs : orgs;
  const organizationStats = useMemo(() => {
    const archived = statsSource.filter((org) => org.is_archived || org.deleted_at).length;
    const active = statsSource.filter((org) => org.is_active && !org.is_archived && !org.deleted_at).length;
    const auto = statsSource.filter((org) => org.auto_approve_signup).length;
    const shared = statsSource.filter((org) => (org.numbering_mode ?? "shared_assonam") === "shared_assonam").length;
    const dedicated = statsSource.filter((org) => org.numbering_mode === "dedicated").length;
    return {
      total: q ? statsSource.length : total || statsSource.length,
      active,
      archived,
      auto,
      shared,
      dedicated,
    };
  }, [q, statsSource, total]);

  const filteredOrgs = useMemo(() => {
    return orgs.filter((org) => {
      const isArchived = Boolean(org.is_archived || org.deleted_at);
      const isActive = org.is_active && !isArchived;
      if (statusFilter === "active" && !isActive) return false;
      if (statusFilter === "archived" && !isArchived) return false;
      if (statusFilter === "pending" && org.affiliation_status !== "under_review") return false;
      if (scopeFilter === "shared" && (org.numbering_mode ?? "shared_assonam") !== "shared_assonam") return false;
      if (scopeFilter === "dedicated" && org.numbering_mode !== "dedicated") return false;
      if (numberingFilter === "configured" && !org.card_min) return false;
      if (numberingFilter === "missing" && org.card_min) return false;
      return true;
    });
  }, [numberingFilter, orgs, scopeFilter, statusFilter]);

  const resetFilters = () => {
    setSearchInput("");
    setQ("");
    setStatusFilter("all");
    setScopeFilter("all");
    setNumberingFilter("all");
    setPage(1);
  };

  const platformTone = (org: SuperAdminOrganization): SuperAdminTone => {
    if (org.is_archived || org.deleted_at) return "muted";
    return org.is_active ? "success" : "warning";
  };

  const affiliationTone = (status: string | null | undefined): SuperAdminTone => {
    if (status === "approved") return "success";
    if (status === "under_review") return "warning";
    if (status === "changes_requested") return "accent";
    if (status === "rejected") return "danger";
    return "muted";
  };

  if (loading || !profile) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="mt-10">
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const startIndex = (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  return (
    <div className="sa-page">
      {(error || deleteSuccess) && (
        <div>
          {error && (
          <div className="rounded-xl border border-red-200/50 bg-red-50/50 p-5 flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
            <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <p className="text-sm font-bold text-red-900">{error}</p>
          </div>
          )}
          {!error && deleteSuccess && (
          <div className="rounded-xl border border-emerald-200/50 bg-emerald-50/50 p-5 flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
            <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <p className="text-sm font-bold text-emerald-900">{deleteSuccess}</p>
          </div>
          )}
        </div>
      )}

      <SuperAdminPageHeader
        icon="users"
        eyebrow="Governance"
        title="Associazioni"
        subtitle="Governance completa delle entita affiliate e configurazione lotti card."
        actions={
          <SuperAdminActionButton
            tone="primary"
            icon="plus"
            onClick={() => openModal("create")}
            data-component="superadmin-orgs-open-modal"
          >
            Nuova associazione
          </SuperAdminActionButton>
        }
      />

      <section className="sa-kpi-grid sa-kpi-grid--six" aria-label="Metriche associazioni">
        <SuperAdminKpiCard label="Totale associazioni" value={organizationStats.total.toLocaleString("it-IT")} hint="Entita registrate" icon="users" tone="success" />
        <SuperAdminKpiCard label="Attive" value={organizationStats.active.toLocaleString("it-IT")} hint="Associazioni operative" icon="check" tone="success" />
        <SuperAdminKpiCard label="Archiviate" value={organizationStats.archived.toLocaleString("it-IT")} hint="Non operative" icon="documents" tone="muted" />
        <SuperAdminKpiCard label="Iscrizione automatica" value={organizationStats.auto.toLocaleString("it-IT")} hint="Abilitata" icon="send" tone="info" />
        <SuperAdminKpiCard label="Numerazione condivisa" value={organizationStats.shared.toLocaleString("it-IT")} hint="ASSONAM central" icon="cards" tone="warning" />
        <SuperAdminKpiCard label="Numerazione dedicata" value={organizationStats.dedicated.toLocaleString("it-IT")} hint="Range proprio" icon="shield" tone="purple" />
      </section>

      <div className="hidden">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Registro Associazioni</h2>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            Governance completa delle entità affiliate e configurazione lotti card.
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => openModal("create")}
          data-component="superadmin-orgs-open-modal"
        >
          <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nuova associazione
        </button>
      </div>

      <SuperAdminToolbar>
        <div className="sa-toolbar__row">
          <div className="flex-1 min-w-0 relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--sa-soft)]">
              <SuperAdminIcon name="search" className="h-4 w-4" />
            </span>
            <input
              id="super-admin-org-search-v2"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applySearchImmediately();
                }
              }}
              placeholder="Cerca per nome, slug o localita..."
              className="theme-input w-full pl-11 pr-11"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sa-soft)] transition-colors hover:text-[var(--sa-text)]"
              >
                <SuperAdminIcon name="x" className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="sa-toolbar__field">
            <label htmlFor="super-admin-org-status">Stato</label>
            <select
              id="super-admin-org-status"
              className="premium-select"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as typeof statusFilter);
                setPage(1);
              }}
            >
              <option value="all">Tutti</option>
              <option value="active">Attive</option>
              <option value="pending">In attesa</option>
              <option value="archived">Archiviate</option>
            </select>
          </div>

          <div className="sa-toolbar__field">
            <label htmlFor="super-admin-org-scope">Scope</label>
            <select
              id="super-admin-org-scope"
              className="premium-select"
              value={scopeFilter}
              onChange={(event) => {
                setScopeFilter(event.target.value as typeof scopeFilter);
                setPage(1);
              }}
            >
              <option value="all">Tutti</option>
              <option value="shared">Condivisa</option>
              <option value="dedicated">Dedicata</option>
            </select>
          </div>

          <div className="sa-toolbar__field">
            <label htmlFor="super-admin-org-numbering">Numerazione</label>
            <select
              id="super-admin-org-numbering"
              className="premium-select"
              value={numberingFilter}
              onChange={(event) => {
                setNumberingFilter(event.target.value as typeof numberingFilter);
                setPage(1);
              }}
            >
              <option value="all">Tutti</option>
              <option value="configured">Configurata</option>
              <option value="missing">Da configurare</option>
            </select>
          </div>

          <SuperAdminActionButton icon="refresh" onClick={resetFilters} className="self-end">
            Reset
          </SuperAdminActionButton>
        </div>

        <div className="sa-toolbar__chips">
          <button type="button" className={`sa-filter-chip ${statusFilter === "all" ? "is-active" : ""}`} onClick={() => setStatusFilter("all")}>
            Tutti <span>{organizationStats.total}</span>
          </button>
          <button type="button" className={`sa-filter-chip ${statusFilter === "active" ? "is-active" : ""}`} onClick={() => setStatusFilter("active")}>
            Attive <span>{organizationStats.active}</span>
          </button>
          <button type="button" className={`sa-filter-chip ${statusFilter === "pending" ? "is-active" : ""}`} onClick={() => setStatusFilter("pending")}>
            In attesa <span>{statsSource.filter((org) => org.affiliation_status === "under_review").length}</span>
          </button>
          <button type="button" className={`sa-filter-chip ${statusFilter === "archived" ? "is-active" : ""}`} onClick={() => setStatusFilter("archived")}>
            Archiviate <span>{organizationStats.archived}</span>
          </button>
        </div>
      </SuperAdminToolbar>

      <div className="hidden">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="flex-1 min-w-0 relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-brand transition-colors">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
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
              placeholder="Cerca per nome, slug o email..."
              className="theme-input w-full rounded-xl pl-12 pr-12 py-2.5 text-sm font-semibold"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-900 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <select
              className="premium-select min-w-[160px]"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} righe
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-2 px-3 pb-1 flex items-center justify-between border-t border-neutral-100/50 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            {total === 0 ? "Nessun risultato" : `${startIndex}-${endIndex} di ${total.toLocaleString("it-IT")} entità`}
          </p>
          <div className="flex items-center gap-2">
            {isFetching && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-brand uppercase tracking-widest animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                Aggiornamento...
              </span>
            )}
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
              Pagina {page} / {totalPages}
            </span>
          </div>
        </div>
      </div>

      <SuperAdminTableShell className="sa-orgs-table-shell overflow-hidden">
        <div data-component="superadmin-orgs-table-v2">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Associazione</th>
                  <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Slug</th>
                  <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Localita</th>
                  <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Stato</th>
                  <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Comunicazioni</th>
                  <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Numerazione tessere</th>
                  <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {filteredOrgs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10">
                      <SuperAdminEmptyState
                        title={q ? "Nessuna corrispondenza" : "Database vuoto"}
                        description="Modifica i filtri o crea una nuova associazione."
                        action={
                          <SuperAdminActionButton tone="primary" icon="plus" onClick={() => openModal("create")}>
                            Nuova associazione
                          </SuperAdminActionButton>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filteredOrgs.map((org) => (
                    <tr
                      key={org.id}
                      data-tone={platformTone(org)}
                      data-affiliation-tone={affiliationTone(org.affiliation_status)}
                      className="group transition-colors hover:bg-neutral-50/50"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="sa-avatar sa-avatar--lg">
                            {orgInitials(org.club_display_name || org.name)}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-neutral-900 group-hover:text-brand transition-colors">
                              {org.name}
                            </p>
                            <p className="text-[10px] text-neutral-400 mt-0.5">ID: {org.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <code className="text-[11px] font-mono font-bold text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded uppercase">
                          {org.slug}
                        </code>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium uppercase text-neutral-600">
                          {org.city || "-"} {org.province ? `(${org.province})` : ""}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        {org.is_archived || org.deleted_at ? (
                          <SuperAdminStatusChip tone="muted" dot>Archiviata</SuperAdminStatusChip>
                        ) : org.is_active ? (
                          <SuperAdminStatusChip tone="success" dot>Attiva</SuperAdminStatusChip>
                        ) : (
                          <SuperAdminStatusChip tone="warning" dot>Sospesa</SuperAdminStatusChip>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {isSuperAdmin ? (
                          <button
                            type="button"
                            onClick={() =>
                              void handleToggleCommunications(org, !Boolean(org.communications_enabled))
                            }
                            className={`sa-switch ${org.communications_enabled ? "is-on" : ""}`}
                            disabled={communicationsSavingOrgId === org.id}
                            aria-pressed={Boolean(org.communications_enabled)}
                            title="Attiva o disattiva il modulo Comunicazioni"
                          >
                            <span>{org.communications_enabled ? "ON" : "OFF"}</span>
                          </button>
                        ) : (
                          <span className="text-sm font-semibold text-neutral-500">
                            {org.communications_enabled ? "ON" : "OFF"}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <SuperAdminIcon
                            name={org.numbering_mode === "dedicated" ? "shield" : "users"}
                            className={`h-5 w-5 ${org.numbering_mode === "dedicated" ? "text-purple-600" : "text-blue-600"}`}
                          />
                          <div>
                            <p className="text-sm font-semibold text-neutral-800">
                              {org.numbering_mode === "dedicated" ? "Dedicata" : "Condivisa"}
                              {org.numbering_mode !== "dedicated" ? " (ASSONAM Central)" : ""}
                            </p>
                            <p className="text-xs text-neutral-500 tabular-nums">
                              {org.card_min ? `${org.card_min}-${org.card_max}` : "Range non impostato"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openModal(org.card_min ? "view-batches" : "range", org)}
                            className="sa-row-action"
                            title={org.card_min ? "Gestione lotti" : "Imposta range iniziale"}
                          >
                            <SuperAdminIcon name="cards" className="h-4 w-4" />
                            Lotti
                          </button>
                          {isSuperAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => openModal("branding", org)}
                                className="sa-row-action"
                                title="Configurazione associazione"
                              >
                                <SuperAdminIcon name="settings" className="h-4 w-4" />
                                Setup
                              </button>
                              <button
                                type="button"
                                onClick={() => openIntegrationModal(org)}
                                className="sa-row-action"
                                title="Integrazione API esterne"
                              >
                                <SuperAdminIcon name="api" className="h-4 w-4" />
                                API
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(org)}
                                className="sa-row-action sa-row-action--danger"
                                title="Elimina o archivia associazione"
                              >
                                <SuperAdminIcon name="trash" className="h-4 w-4" />
                                <span className="sr-only">Elimina</span>
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
        </div>
      </SuperAdminTableShell>

      <SuperAdminTableShell
        title="Registro associazioni"
        subtitle={`${filteredOrgs.length.toLocaleString("it-IT")} righe visibili su ${total.toLocaleString("it-IT")} entita`}
        action={isFetching ? <SuperAdminStatusChip tone="info" dot>Aggiornamento</SuperAdminStatusChip> : null}
        className="hidden"
      >
        <div data-component="superadmin-orgs-table">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/50">
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Nome</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Slug</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Località</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Piattaforma</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Affiliazione</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 text-center">Tessere</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {filteredOrgs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10">
                    <SuperAdminEmptyState
                      title={q ? "Nessuna corrispondenza" : "Database vuoto"}
                      description="Modifica i filtri o crea una nuova associazione."
                      action={
                        <SuperAdminActionButton tone="primary" icon="plus" onClick={() => openModal("create")}>
                          Nuova associazione
                        </SuperAdminActionButton>
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredOrgs.map((org) => (
                  <tr
                    key={org.id}
                    data-tone={platformTone(org)}
                    data-affiliation-tone={affiliationTone(org.affiliation_status)}
                    className="group transition-colors hover:bg-neutral-50/50"
                  >
                    <td className="px-5 py-4">
                      <p className="text-sm font-bold text-neutral-900 group-hover:text-brand transition-colors">{org.name}</p>
                      <p className="text-[10px] text-neutral-400 mt-0.5">ID: {org.id}</p>
                    </td>
                    <td className="px-5 py-4">
                      <code className="text-[11px] font-mono font-bold text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded uppercase">{org.slug}</code>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-neutral-600">
                        {org.city} <span className="text-neutral-400">{org.province ? `(${org.province})` : ""}</span>
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col items-start gap-1.5">
                        {org.is_archived || org.deleted_at ? (
                          <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500 uppercase tracking-tighter ring-1 ring-inset ring-neutral-200">
                            Archiviata
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter ring-1 ring-inset ${
                              org.is_active
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200/50"
                                : "bg-neutral-50 text-neutral-400 ring-neutral-200"
                            }`}
                          >
                            {org.is_active ? "Attiva" : "Sospesa"}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter ring-1 ring-inset ${
                            org.accounting_enabled
                              ? "bg-amber-50 text-amber-700 ring-amber-200/50"
                              : "bg-neutral-50 text-neutral-400 ring-neutral-200"
                          }`}
                        >
                          {org.accounting_enabled ? "Contabilità on" : "Contabilità off"}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter ring-1 ring-inset ${
                            org.communications_enabled
                              ? "bg-sky-50 text-sky-700 ring-sky-200/60"
                              : "bg-neutral-50 text-neutral-400 ring-neutral-200"
                          }`}
                        >
                          {org.communications_enabled ? "Comunicazioni on" : "Comunicazioni off"}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {org.affiliation_status ? (
                        <div className="flex flex-col gap-1.5 items-start">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-tighter ring-1 ring-inset ${
                              org.affiliation_status === "approved"
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200/50"
                                : org.affiliation_status === "under_review"
                                  ? "bg-amber-50 text-amber-700 ring-amber-200/50"
                                  : org.affiliation_status === "changes_requested"
                                    ? "bg-orange-50 text-orange-700 ring-orange-200/50"
                                    : org.affiliation_status === "rejected"
                                      ? "bg-red-50 text-red-700 ring-red-200/50"
                                      : "bg-neutral-50 text-neutral-400 ring-neutral-200"
                            }`}
                          >
                            {org.affiliation_status.replace('_', ' ')}
                          </span>
                          {org.affiliation_application_id && (
                            <Link
                              to={`/super-admin/affiliazioni?applicationId=${org.affiliation_application_id}`}
                              className="text-[10px] font-bold text-brand hover:text-brand-dark transition-colors uppercase tracking-widest flex items-center gap-1"
                            >
                              Apri pratica
                              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                              </svg>
                            </Link>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-neutral-300 uppercase tracking-widest">Nessuna</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      {org.card_min ? (
                        <div className="flex flex-col items-center">
                          <span className="text-sm font-bold text-neutral-900 tabular-nums">
                            {org.card_min}-{org.card_max}
                          </span>
                          <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-tighter">
                            Range impostato
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-neutral-300 uppercase tracking-widest">Non config.</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleToggleCommunications(org, !Boolean(org.communications_enabled))
                            }
                            className={`btn-ghost !px-2.5 !py-1 !text-[10px] font-bold uppercase tracking-widest ${
                              org.communications_enabled
                                ? "!border-sky-200 !text-sky-700 hover:!bg-sky-50"
                                : "!border-neutral-200 !text-neutral-600 hover:!bg-neutral-50"
                            }`}
                            disabled={communicationsSavingOrgId === org.id}
                            title="Attiva o disattiva il modulo Comunicazioni"
                          >
                            {communicationsSavingOrgId === org.id
                              ? "Salvataggio..."
                              : org.communications_enabled
                                ? "Comunicazioni off"
                                : "Comunicazioni on"}
                          </button>
                        )}
                        <button
                          onClick={() => openModal(org.card_min ? "view-batches" : "range", org)}
                          className="btn-ghost !px-2.5 !py-1 !text-[10px] font-bold uppercase tracking-widest"
                          title={org.card_min ? "Gestione lotti" : "Imposta range iniziale"}
                        >
                          {org.card_min ? "Lotti" : "Range"}
                        </button>
                        {isSuperAdmin && (
                          <>
                            <button
                              onClick={() => openModal("branding", org)}
                              className="btn-ghost !px-2.5 !py-1 !text-[10px] font-bold uppercase tracking-widest"
                              title="Configurazione branding e notifiche"
                            >
                              Setup
                            </button>
                            <button
                              onClick={() => openIntegrationModal(org)}
                              className="btn-ghost !px-2.5 !py-1 !text-[10px] font-bold uppercase tracking-widest"
                              title="Integrazione API esterne"
                            >
                              API
                            </button>
                            <button
                              onClick={() => handleDelete(org)}
                              className="btn-ghost !px-2.5 !py-1 !text-[10px] font-bold uppercase tracking-widest !text-red-600 !border-red-100 hover:!bg-red-50"
                              title="Elimina o archivia associazione"
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
          <div className="flex flex-col gap-4 border-t border-neutral-100 bg-neutral-50/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 text-center sm:text-left">
              Pagina {page} di {totalPages}
            </p>
            <div className="flex items-center justify-center gap-1.5">
              <button
                type="button"
                className="btn-ghost !px-3 !py-1.5 !text-[10px] font-bold uppercase tracking-widest disabled:opacity-30"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
              >
                ← Precedente
              </button>

              <div className="flex items-center gap-1">
                {visiblePages.map((value, index) =>
                  value === "ellipsis" ? (
                    <span key={`ellipsis-${index}`} className="px-1 text-neutral-300 font-bold">
                      ...
                    </span>
                  ) : (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPage(value)}
                      className={`h-8 min-w-[32px] rounded-lg text-[10px] font-bold transition-all ${
                        value === page
                          ? "bg-brand text-white shadow-md shadow-brand/20"
                          : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                      }`}
                    >
                      {value}
                    </button>
                  ),
                )}
              </div>

              <button
                type="button"
                className="btn-ghost !px-3 !py-1.5 !text-[10px] font-bold uppercase tracking-widest disabled:opacity-30"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
              >
                Successiva →
              </button>
            </div>
          </div>
        )}
        </div>
      </SuperAdminTableShell>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/80 p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="modal-panel max-w-md p-8 animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-neutral-900 tracking-tight">Rimuovi Associazione</h3>
                <p className="mt-2 text-sm font-medium text-neutral-500 leading-relaxed">
                  Stai per intervenire su <strong>{deleteConfirm.name}</strong>.<br/>Seleziona la modalità operativa:
                </p>
              </div>
            </div>

            <div className="mt-8 space-y-3">
              <label className={`flex cursor-pointer items-start gap-4 p-4 rounded-xl border-2 transition-all duration-200 ${deleteMode === 'archive' ? 'border-brand bg-brand/5' : 'border-neutral-100 bg-white hover:border-neutral-200'}`}>
                <div className="mt-1">
                  <input
                    type="radio"
                    className="h-4 w-4 text-brand focus:ring-brand accent-brand"
                    name="delete-mode"
                    value="archive"
                    checked={deleteMode === "archive"}
                    onChange={() => {
                      setDeleteMode("archive");
                      setDeleteError("");
                    }}
                  />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-bold ${deleteMode === 'archive' ? 'text-brand' : 'text-neutral-900'}`}>Archivia + Libera range</p>
                  <p className="mt-0.5 text-xs font-medium text-neutral-500">Consigliato. Mantiene lo storico dei dati disattivando l'accesso.</p>
                </div>
              </label>

              <label className={`flex cursor-pointer items-start gap-4 p-4 rounded-xl border-2 transition-all duration-200 ${deleteMode === 'purge' ? 'border-red-500 bg-red-50/50' : 'border-neutral-100 bg-white hover:border-neutral-200'}`}>
                <div className="mt-1">
                  <input
                    type="radio"
                    className="h-4 w-4 text-red-600 focus:ring-red-500 accent-red-600"
                    name="delete-mode"
                    value="purge"
                    checked={deleteMode === "purge"}
                    onChange={() => {
                      setDeleteMode("purge");
                      setDeleteError("");
                    }}
                  />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-bold ${deleteMode === 'purge' ? 'text-red-900' : 'text-neutral-900'}`}>Eliminazione totale (Purge)</p>
                  <p className="mt-0.5 text-xs font-medium text-neutral-500">Azione irreversibile. Cancella ogni riferimento dal database.</p>
                </div>
              </label>
            </div>

            {deleteMode === "purge" && (
              <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-100 animate-in slide-in-from-bottom-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-700">Conferma di sicurezza</p>
                <p className="mt-1 text-xs font-medium text-red-600">Digita lo slug <strong>{deleteConfirm.slug}</strong> per procedere:</p>
                <input
                  type="text"
                  className="mt-3 w-full rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-900 focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none"
                  value={purgeSlugInput}
                  onChange={(event) => setPurgeSlugInput(event.target.value)}
                  placeholder="Slug associazione..."
                />
              </div>
            )}

            {deleteError && (
              <p className="mt-4 text-center text-xs font-bold text-red-600 bg-red-50 py-2 rounded-lg">{deleteError}</p>
            )}

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                className="flex-1 btn-ghost !py-3 !text-xs font-bold uppercase tracking-widest"
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
                className={`flex-1 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-lg transition-all active:scale-95 disabled:opacity-50 ${deleteMode === 'purge' ? 'bg-red-600 shadow-red-200 hover:bg-red-700' : 'bg-brand shadow-brand/20 hover:bg-brand-light'}`}
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "In corso..." : "Conferma"}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/80 p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="modal-panel w-full max-w-3xl p-8 animate-in zoom-in-95 duration-300 relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-start justify-between gap-4 border-b border-neutral-100 pb-6 mb-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">Integrazione Esterna</p>
                  <h3 className="mt-1 text-2xl font-bold text-neutral-900 tracking-tight">Backend Pienissimo</h3>
                  <p className="mt-1 text-sm font-medium text-neutral-500">
                    Gestione chiave API e sincronizzazione per: <strong>{integrationOrg.name}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ghost !px-4 !py-2 !text-xs font-bold uppercase tracking-widest"
                  onClick={closeIntegrationModal}
                >
                  Chiudi ×
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
            {/* Decoration */}
            <div className="absolute -right-32 -top-32 h-64 w-64 rounded-full bg-brand/5 blur-3xl pointer-events-none" />
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminOrganizations;
