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

const thClass =
  "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400";
const tdClass = "px-5 py-3.5 text-sm text-neutral-700";

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
      <div>
        <Skeleton className="h-6 w-64" />
        <Skeleton className="mt-3 h-4 w-96" />
        <div className="mt-10">
          <Skeleton className="h-48 w-full rounded-lg" />
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
      </div>

      <h2 className="text-xl font-semibold text-neutral-900">
        Amministratori associazioni
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        Gestisci gli account org admin per ogni associazione.
      </p>

      <CreateOrgAdminForm orgs={orgs} onCreate={handleCreate} />

      <div className="mt-8 surface px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 sm:w-64"
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Tutte le associazioni</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          {!adminsLoading && (
            <p className="text-xs text-neutral-400 sm:ml-auto">
              {admins.length === 1 ? "1 amministratore" : `${admins.length} amministratori`}
            </p>
          )}
        </div>
      </div>

      <div className="surface mt-4 overflow-hidden" data-component="superadmin-orgadmins-table">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-white/60 bg-white/40">
              <tr>
                <th className={thClass}>Email</th>
                <th className={thClass}>Associazione</th>
                <th className={thClass}>Stato</th>
                <th className={thClass}>Creato il</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {adminsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td className={tdClass}><Skeleton className="h-3.5 w-44" /></td>
                    <td className={tdClass}><Skeleton className="h-3.5 w-36" /></td>
                    <td className={tdClass}><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className={tdClass}><Skeleton className="h-3.5 w-20" /></td>
                    <td className={tdClass}><Skeleton className="h-7 w-20 rounded-md" /></td>
                  </tr>
                ))
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-neutral-500">
                    Nessun amministratore trovato.
                  </td>
                </tr>
              ) : (
                admins.map((a, i) => (
                  <tr key={a.id} className={`transition hover:bg-brand/[0.02] ${i % 2 === 1 ? "bg-white/30" : ""}`}>
                    <td className={`${tdClass} font-medium text-neutral-900`}>{a.email}</td>
                    <td className={tdClass}>{a.org_name ?? "-"}</td>
                    <td className={tdClass}>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          a.is_active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-neutral-200 bg-neutral-50 text-neutral-600"
                        }`}
                      >
                        {a.is_active ? "Attivo" : "Disattivato"}
                      </span>
                    </td>
                    <td className={`${tdClass} tabular-nums`}>
                      {a.created_at ? new Date(a.created_at).toLocaleDateString("it-IT") : "-"}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <button
                        className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                          a.is_active
                            ? "border-red-200 text-red-600 hover:bg-red-50"
                            : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                        } disabled:opacity-50`}
                        type="button"
                        disabled={toggling === a.id}
                        onClick={() => handleToggle(a)}
                      >
                        {a.is_active ? "Disattiva" : "Attiva"}
                      </button>
                      <button
                        className="ml-2 rounded-md border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        type="button"
                        onClick={() => handleDeleteClick(a)}
                      >
                        Elimina
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md surface-strong p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-neutral-900">
              Eliminare questo admin?
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              L'operazione rimuove l'admin <span className="font-medium">{deleteConfirm.email}</span> dall'accesso.
              Puoi ripristinarlo in seguito.
            </p>
            {deleteError && (
              <div className="mt-4 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{deleteError}</p>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                onClick={handleDeleteCancel}
              >
                Annulla
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-subtle transition hover:bg-red-700 disabled:opacity-50"
                onClick={handleDeleteConfirm}
                disabled={deleting === deleteConfirm.id}
              >
                {deleting === deleteConfirm.id ? "Eliminazione..." : "Elimina"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminOrgAdmins;
