import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  AuthError,
  createOrgAdmin,
  deleteOrgAdmin,
  fetchOrgAdmins,
  fetchOrganizations,
  patchOrgAdmin,
  resetOrgAdminMfa,
  type OrgAdmin,
  type Organization,
  type SuperAdminProfile,
} from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";
import CreateOrgAdminForm from "./components/CreateOrgAdminForm";
import {
  SuperAdminActionButton,
  SuperAdminEmptyState,
  SuperAdminIcon,
  SuperAdminKpiCard,
  SuperAdminPageHeader,
  SuperAdminStatusChip,
  SuperAdminTableShell,
  SuperAdminToolbar,
} from "./components/SuperAdminPrimitives";

const formatDate = (value: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("it-IT");
};

const SuperAdminOrgAdmins = () => {
  const navigate = useNavigate();
  const { profile } = useOutletContext<{ profile: SuperAdminProfile | null }>();

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [admins, setAdmins] = useState<OrgAdmin[]>([]);

  const [loading, setLoading] = useState(true);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [toggling, setToggling] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OrgAdmin | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [resettingMfa, setResettingMfa] = useState<number | null>(null);

  useEffect(() => {
    if (!profile) return;

    fetchOrganizations()
      .then(setOrgs)
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/super-admin/login", { replace: true });
        } else {
          setError("Errore nel caricamento.");
        }
      })
      .finally(() => setLoading(false));
  }, [profile, navigate]);

  const loadAdmins = useCallback(async () => {
    if (loading || !profile) return;
    setAdminsLoading(true);
    try {
      const payload = await fetchOrgAdmins(selectedOrg !== "" ? selectedOrg : undefined);
      setAdmins(payload);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/super-admin/login", { replace: true });
      }
    } finally {
      setAdminsLoading(false);
    }
  }, [loading, navigate, profile, selectedOrg]);

  useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  const handleCreate = useCallback(
    async (email: string, orgId: number) => {
      const result = await createOrgAdmin(email, orgId);
      const updated = await fetchOrgAdmins(selectedOrg !== "" ? selectedOrg : undefined);
      setAdmins(updated);
      if (result.restored) {
        return "Admin ripristinato. Ora puoi inviare il magic link.";
      }
      return `Invito inviato a ${email}`;
    },
    [selectedOrg],
  );

  const handleToggle = async (admin: OrgAdmin) => {
    setToggling(admin.id);
    try {
      await patchOrgAdmin(admin.id, !admin.is_active);
      setAdmins((prev) =>
        prev.map((item) =>
          item.id === admin.id ? { ...item, is_active: !item.is_active } : item,
        ),
      );
    } finally {
      setToggling(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    setDeleting(deleteConfirm.id);
    setDeleteError("");
    try {
      await deleteOrgAdmin(deleteConfirm.id);
      setAdmins((prev) => prev.filter((admin) => admin.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Errore durante l'eliminazione.");
    } finally {
      setDeleting(null);
    }
  };

  const handleResetMfa = async (admin: OrgAdmin) => {
    if (!window.confirm(`Reimpostare l'MFA di ${admin.email}? Tutte le sue sessioni verranno revocate.`)) return;
    setResettingMfa(admin.id);
    setError("");
    try {
      await resetOrgAdminMfa(admin.id);
      setAdmins((items) => items.map((item) => item.id === admin.id ? { ...item, mfa_enabled: false } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile reimpostare l'MFA.");
    } finally {
      setResettingMfa(null);
    }
  };

  const filteredAdmins = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return admins.filter((admin) => {
      if (statusFilter === "active" && !admin.is_active) return false;
      if (statusFilter === "suspended" && admin.is_active) return false;
      if (normalizedQuery) {
        const haystack = `${admin.email} ${admin.org_name ?? ""}`.toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [admins, query, statusFilter]);

  const stats = useMemo(
    () => ({
      total: admins.length,
      active: admins.filter((admin) => admin.is_active).length,
      suspended: admins.filter((admin) => !admin.is_active).length,
      orgsCovered: new Set(admins.map((admin) => admin.org_id)).size,
    }),
    [admins],
  );

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

  return (
    <div className="sa-page">
      <div className="min-h-[48px]">
        {error ? (
          <div className="rounded-xl border border-red-200/50 bg-red-50/50 p-5 text-sm font-bold text-red-900">
            {error}
          </div>
        ) : null}
      </div>

      <SuperAdminPageHeader
        icon="shield"
        eyebrow="Governance"
        title="Amministratori"
        subtitle="Gestisci gli accessi e i permessi dei gestori delle sedi locali affiliate."
        actions={
          <SuperAdminActionButton icon="refresh" onClick={() => void loadAdmins()} disabled={adminsLoading}>
            Aggiorna
          </SuperAdminActionButton>
        }
      />

      <section className="sa-kpi-grid">
        <SuperAdminKpiCard label="Totale amministratori" value={stats.total} hint="Account registrati" icon="users" tone="success" />
        <SuperAdminKpiCard label="Attivi" value={stats.active} hint="Accessi operativi" icon="check" tone="success" />
        <SuperAdminKpiCard label="Sospesi" value={stats.suspended} hint="Accessi disabilitati" icon="clock" tone="warning" />
        <SuperAdminKpiCard label="Associazioni coperte" value={stats.orgsCovered} hint="Con almeno un admin" icon="building" tone="info" />
      </section>

      <CreateOrgAdminForm orgs={orgs} onCreate={handleCreate} />

      <SuperAdminToolbar>
        <div className="sa-toolbar__row">
          <div className="flex-1 min-w-0 relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--sa-soft)]">
              <SuperAdminIcon name="search" className="h-4 w-4" />
            </span>
            <input
              className="theme-input w-full pl-11"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca per nome, email o associazione..."
            />
          </div>
          <div className="sa-toolbar__field">
            <label>Associazione</label>
            <select
              className="premium-select"
              value={selectedOrg}
              onChange={(event) => setSelectedOrg(event.target.value ? Number(event.target.value) : "")}
            >
              <option value="">Tutte</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sa-toolbar__field">
            <label>Stato</label>
            <select className="premium-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Tutti</option>
              <option value="active">Attivi</option>
              <option value="suspended">Sospesi</option>
            </select>
          </div>
        </div>
      </SuperAdminToolbar>

      <SuperAdminTableShell
        title="Account amministratori"
        subtitle={adminsLoading ? "Caricamento accessi..." : `${filteredAdmins.length} account visibili`}
        className="overflow-hidden"
      >
        <div data-component="superadmin-orgadmins-table" className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Amministratore</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Associazione</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Stato accesso</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em]">Data setup</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-right">Comandi</th>
              </tr>
            </thead>
            <tbody>
              {adminsLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index}>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-44 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-36 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-20 rounded" /></td>
                    <td className="px-5 py-4"><div className="flex justify-end"><Skeleton className="h-8 w-32 rounded-lg" /></div></td>
                  </tr>
                ))
              ) : filteredAdmins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10">
                    <SuperAdminEmptyState
                      title="Nessun amministratore configurato"
                      description="Invita un gestore locale dalla sezione superiore."
                    />
                  </td>
                </tr>
              ) : (
                filteredAdmins.map((admin) => (
                  <tr key={admin.id} className="group">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="sa-avatar">
                          {admin.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-neutral-900 group-hover:text-brand transition-colors">{admin.email}</p>
                          <p className="text-[10px] text-neutral-400 mt-0.5 uppercase tracking-tighter">ID Account: #{admin.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-neutral-600">{admin.org_name ?? "-"}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <SuperAdminStatusChip tone={admin.is_active ? "success" : "warning"} dot>
                          {admin.is_active ? "Attivo" : "Sospeso"}
                        </SuperAdminStatusChip>
                        {admin.mfa_enabled ? (
                          <SuperAdminStatusChip tone="info">MFA</SuperAdminStatusChip>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[11px] font-bold text-neutral-500 tabular-nums">{formatDate(admin.created_at)}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <SuperAdminActionButton
                          tone={admin.is_active ? "warning" : "success"}
                          icon={admin.is_active ? "clock" : "check"}
                          disabled={toggling === admin.id}
                          onClick={() => void handleToggle(admin)}
                        >
                          {admin.is_active ? "Sospendi" : "Riattiva"}
                        </SuperAdminActionButton>
                        <SuperAdminActionButton
                          tone="default"
                          icon="shield"
                          disabled={!admin.mfa_enabled || resettingMfa === admin.id}
                          onClick={() => void handleResetMfa(admin)}
                        >
                          Reset MFA
                        </SuperAdminActionButton>
                        <SuperAdminActionButton
                          tone="danger"
                          icon="trash"
                          onClick={() => {
                            setDeleteError("");
                            setDeleteConfirm(admin);
                          }}
                        >
                          Rimuovi
                        </SuperAdminActionButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SuperAdminTableShell>

      {deleteConfirm && (
        <div className="sa-modal" role="dialog" aria-modal="true">
          <div className="sa-modal__panel sa-modal__panel--sm">
            <header className="sa-modal__header">
              <div className="sa-modal__heading">
                <span className="sa-modal__icon"><SuperAdminIcon name="trash" /></span>
                <div>
                  <h2 className="sa-modal__title">Rimuovi amministratore</h2>
                  <p className="sa-modal__subtitle">{deleteConfirm.email}</p>
                </div>
              </div>
              <button type="button" className="sa-icon-button" onClick={() => setDeleteConfirm(null)} aria-label="Chiudi">
                <SuperAdminIcon name="x" />
              </button>
            </header>
            <div className="sa-modal__body">
              <p className="text-sm text-neutral-600">
                Stai revocando l'accesso a questo account. L'azione e reversibile tramite una nuova creazione dell'account.
              </p>
              {deleteError ? (
                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{deleteError}</p>
              ) : null}
            </div>
            <footer className="sa-modal__footer">
              <SuperAdminActionButton onClick={() => setDeleteConfirm(null)} disabled={Boolean(deleting)}>Annulla</SuperAdminActionButton>
              <SuperAdminActionButton tone="danger" icon="trash" onClick={() => void handleDeleteConfirm()} disabled={deleting === deleteConfirm.id}>
                {deleting === deleteConfirm.id ? "Esecuzione..." : "Conferma rimozione"}
              </SuperAdminActionButton>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminOrgAdmins;
