import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  fetchOrganizations,
  fetchOrgAdmins,
  createOrgAdmin,
  patchOrgAdmin,
  deleteOrgAdmin,
  AuthError,
  type SuperAdminProfile,
  type Organization,
  type OrgAdmin,
} from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";
import CreateOrgAdminForm from "./components/CreateOrgAdminForm";

const SuperAdminOrgAdmins = () => {
  const navigate = useNavigate();
  const { profile } = useOutletContext<{ profile: SuperAdminProfile | null }>();

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [admins, setAdmins] = useState<OrgAdmin[]>([]);

  const [loading, setLoading] = useState(true);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedOrg, setSelectedOrg] = useState<number | "">("");

  const [toggling, setToggling] = useState<number | null>(null);

  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OrgAdmin | null>(null);
  const [deleteError, setDeleteError] = useState("");

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

  useEffect(() => {
    if (loading || !profile) return;

    setAdminsLoading(true);
    fetchOrgAdmins(selectedOrg !== "" ? selectedOrg : undefined)
      .then(setAdmins)
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/super-admin/login", { replace: true });
        }
      })
      .finally(() => setAdminsLoading(false));
  }, [loading, profile, selectedOrg, navigate]);

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
    [selectedOrg]
  );

  const handleToggle = async (admin: OrgAdmin) => {
    setToggling(admin.id);
    try {
      await patchOrgAdmin(admin.id, !admin.is_active);
      setAdmins((prev) =>
        prev.map((a) =>
          a.id === admin.id ? { ...a, is_active: !a.is_active } : a
        )
      );
    } catch {
      // silent
    } finally {
      setToggling(null);
    }
  };

  const handleDeleteClick = (admin: OrgAdmin) => {
    setDeleteError("");
    setDeleteConfirm(admin);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    setDeleting(deleteConfirm.id);
    setDeleteError("");
    try {
      await deleteOrgAdmin(deleteConfirm.id);
      setAdmins((prev) => prev.filter((a) => a.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Errore durante l'eliminazione."
      );
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm(null);
    setDeleteError("");
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="min-h-[76px]">
        {error && (
          <div className="rounded-xl border border-red-200/50 bg-red-50/50 p-5 flex items-center gap-3 animate-in slide-in-from-top-2">
            <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <p className="text-sm font-bold text-red-900">{error}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Account Amministratori</h2>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            Gestione accessi e permessi per i gestori delle sedi locali affiliate.
          </p>
        </div>
      </div>

      <CreateOrgAdminForm orgs={orgs} onCreate={handleCreate} />

      <div className="surface p-2 sm:p-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 max-w-md">
            <select
              className="premium-select w-full !bg-white/50 focus:!bg-white"
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Tutte le associazioni affiliate</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          {!adminsLoading && (
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 px-3">
              {admins.length === 1 ? "1 amministratore attivo" : `${admins.length} amministratori registrati`}
            </p>
          )}
        </div>
      </div>

      <div className="surface overflow-hidden border-neutral-200/60 shadow-premium-lg" data-component="superadmin-orgadmins-table">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/50">
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Identità / Email</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Sede Associata</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Stato Accesso</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Data Setup</th>
                <th className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 text-right">Comandi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {adminsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-44 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-36 rounded" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-5 py-4"><Skeleton className="h-4 w-20 rounded" /></td>
                    <td className="px-5 py-4"><div className="flex justify-end"><Skeleton className="h-8 w-32 rounded-lg" /></div></td>
                  </tr>
                ))
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center">
                    <p className="text-sm font-bold text-neutral-300 uppercase tracking-widest">Nessun amministratore configurato</p>
                  </td>
                </tr>
              ) : (
                admins.map((a) => (
                  <tr key={a.id} className="group transition-colors hover:bg-neutral-50/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-brand/5 text-brand flex items-center justify-center font-bold text-[10px] border border-brand/10">
                          {a.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-neutral-900 group-hover:text-brand transition-colors">{a.email}</p>
                          <p className="text-[10px] text-neutral-400 mt-0.5 uppercase tracking-tighter">ID Account: #{a.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-neutral-600 truncate max-w-[200px]" title={a.org_name ?? "-"}>
                        {a.org_name ?? "-"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter ring-1 ring-inset ${
                          a.is_active
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200/50"
                            : "bg-neutral-50 text-neutral-400 ring-neutral-200"
                        }`}
                      >
                        {a.is_active ? "Attivo" : "Disabilitato"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-[11px] font-bold text-neutral-500 tabular-nums">
                        {a.created_at ? new Date(a.created_at).toLocaleDateString("it-IT") : "-"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          className={`btn-ghost !px-3 !py-1.5 !text-[10px] font-bold uppercase tracking-widest ${
                            a.is_active
                              ? "!text-amber-600 !border-amber-100 hover:!bg-amber-50"
                              : "!text-emerald-600 !border-emerald-100 hover:!bg-emerald-50"
                          } disabled:opacity-50`}
                          type="button"
                          disabled={toggling === a.id}
                          onClick={() => handleToggle(a)}
                        >
                          {a.is_active ? "Sospendi" : "Attiva"}
                        </button>
                        <button
                          className="btn-ghost !px-3 !py-1.5 !text-[10px] font-bold uppercase tracking-widest !text-red-600 !border-red-100 hover:!bg-red-50"
                          type="button"
                          onClick={() => handleDeleteClick(a)}
                        >
                          Elimina
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/80 p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="modal-panel max-w-md p-8 animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5L12 14.5L5 7.5" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-neutral-900 tracking-tight">Rimuovi Amministratore</h3>
                <p className="mt-2 text-sm font-medium text-neutral-500 leading-relaxed">
                  Stai revocando l'accesso a <strong>{deleteConfirm.email}</strong>.<br/>L'azione è reversibile tramite ri-creazione dell'account.
                </p>
              </div>
            </div>

            {deleteError && (
              <p className="mt-4 text-center text-xs font-bold text-red-600 bg-red-50 py-2 rounded-lg">{deleteError}</p>
            )}

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                className="flex-1 btn-ghost !py-3 !text-xs font-bold uppercase tracking-widest"
                onClick={handleDeleteCancel}
                disabled={Boolean(deleting)}
              >
                Annulla
              </button>
              <button
                type="button"
                className="flex-1 bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl shadow-lg shadow-red-200 hover:bg-red-700 transition-all active:scale-95 disabled:opacity-50"
                onClick={handleDeleteConfirm}
                disabled={deleting === deleteConfirm.id}
              >
                {deleting === deleteConfirm.id ? "Esecuzione..." : "Conferma Rimozione"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminOrgAdmins;
