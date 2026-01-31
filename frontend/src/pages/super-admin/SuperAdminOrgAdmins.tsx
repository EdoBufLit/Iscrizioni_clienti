import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchSuperAdminMe,
  superAdminLogout,
  fetchOrganizations,
  fetchOrgAdmins,
  createOrgAdmin,
  patchOrgAdmin,
  AuthError,
  type SuperAdminProfile,
  type Organization,
  type OrgAdmin,
} from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";

const thClass =
  "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400";
const tdClass = "px-5 py-3.5 text-sm text-neutral-700";

const SuperAdminOrgAdmins = () => {
  const navigate = useNavigate();

  const [profile, setProfile] = useState<SuperAdminProfile | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [admins, setAdmins] = useState<OrgAdmin[]>([]);

  const [loading, setLoading] = useState(true);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedOrg, setSelectedOrg] = useState<number | "">("");

  // Create form
  const [newEmail, setNewEmail] = useState("");
  const [newOrgId, setNewOrgId] = useState<number | "">("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  // Toggling
  const [toggling, setToggling] = useState<number | null>(null);

  // Initial load: profile + orgs
  useEffect(() => {
    Promise.all([fetchSuperAdminMe(), fetchOrganizations()])
      .then(([p, o]) => {
        setProfile(p);
        setOrgs(o);
      })
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/super-admin/login", { replace: true });
        } else {
          setError("Errore nel caricamento.");
        }
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  // Load admins when org filter changes
  useEffect(() => {
    if (loading) return;
    if (!profile) return;

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

  const handleLogout = async () => {
    await superAdminLogout();
    navigate("/super-admin/login", { replace: true });
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || newOrgId === "" || creating) return;
    setCreateError("");
    setCreateSuccess("");
    setCreating(true);
    try {
      await createOrgAdmin(newEmail.trim(), newOrgId);
      setCreateSuccess(`Invito inviato a ${newEmail.trim()}`);
      setNewEmail("");
      // Reload admins
      const updated = await fetchOrgAdmins(
        selectedOrg !== "" ? selectedOrg : undefined,
      );
      setAdmins(updated);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Errore nella creazione.",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (admin: OrgAdmin) => {
    setToggling(admin.id);
    try {
      await patchOrgAdmin(admin.id, !admin.is_active);
      setAdmins((prev) =>
        prev.map((a) =>
          a.id === admin.id ? { ...a, is_active: !a.is_active } : a,
        ),
      );
    } catch {
      // silent
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="container-shell py-16">
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
      {/* Header band */}
      <div className="border-b border-neutral-100 bg-gradient-to-b from-neutral-50 to-white">
        <div className="container-shell py-8">
          <div className="flex items-start gap-5">
            <div className="hidden shrink-0 sm:block">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand/10">
                <img
                  src="/favicon.svg"
                  alt=""
                  className="h-6"
                  aria-hidden="true"
                />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-lg font-semibold text-neutral-900">
                  Super Amministrazione
                </h1>
                <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                  Super Admin
                </span>
              </div>
              {profile && (
                <p className="mt-1 text-sm text-neutral-500">
                  {profile.email}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Link
                className="hidden text-sm font-medium text-neutral-500 transition hover:text-neutral-700 sm:block"
                to="/"
              >
                Torna al sito
              </Link>
              <button
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                type="button"
                onClick={handleLogout}
              >
                Esci
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container-shell py-10">
        {error && (
          <div className="mb-8 rounded-lg border border-red-200/60 bg-red-50 px-7 py-5">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <h2 className="text-xl font-semibold text-neutral-900">
          Amministratori associazioni
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Gestisci gli account org admin per ogni associazione.
        </p>

        {/* Create form */}
        <div className="surface mt-8 p-7">
          <h3 className="text-sm font-semibold text-neutral-900">
            Nuovo amministratore
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            L'invito con magic link verrà inviato automaticamente.
          </p>

          {createError && (
            <div className="mt-4 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{createError}</p>
            </div>
          )}
          {createSuccess && (
            <div className="mt-4 rounded-md border border-emerald-200/60 bg-emerald-50 px-4 py-3">
              <p className="text-sm text-emerald-700">{createSuccess}</p>
            </div>
          )}

          <form
            className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={handleCreate}
          >
            <div className="flex-1">
              <label
                htmlFor="new-admin-email"
                className="block text-xs font-medium text-neutral-600"
              >
                Email
              </label>
              <input
                id="new-admin-email"
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                type="email"
                placeholder="admin@associazione.it"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="sm:w-56">
              <label
                htmlFor="new-admin-org"
                className="block text-xs font-medium text-neutral-600"
              >
                Associazione
              </label>
              <select
                id="new-admin-org"
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                value={newOrgId}
                onChange={(e) =>
                  setNewOrgId(e.target.value ? Number(e.target.value) : "")
                }
              >
                <option value="">Seleziona…</option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white shadow-subtle transition hover:-translate-y-px hover:bg-brand-dark hover:shadow-card active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-subtle"
              type="submit"
              disabled={!newEmail.trim() || newOrgId === "" || creating}
            >
              {creating ? "Invio…" : "Invita"}
            </button>
          </form>
        </div>

        {/* Filter */}
        <div className="mt-8 rounded-lg border border-neutral-100 bg-neutral-25 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 sm:w-64"
              value={selectedOrg}
              onChange={(e) =>
                setSelectedOrg(
                  e.target.value ? Number(e.target.value) : "",
                )
              }
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
                {admins.length === 1
                  ? "1 amministratore"
                  : `${admins.length} amministratori`}
              </p>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="surface mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-neutral-100 bg-neutral-25">
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
                      <td className={tdClass}>
                        <Skeleton className="h-3.5 w-44" />
                      </td>
                      <td className={tdClass}>
                        <Skeleton className="h-3.5 w-36" />
                      </td>
                      <td className={tdClass}>
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </td>
                      <td className={tdClass}>
                        <Skeleton className="h-3.5 w-20" />
                      </td>
                      <td className={tdClass}>
                        <Skeleton className="h-7 w-20 rounded-md" />
                      </td>
                    </tr>
                  ))
                ) : admins.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-12 text-center text-sm text-neutral-500"
                    >
                      Nessun amministratore trovato.
                    </td>
                  </tr>
                ) : (
                  admins.map((a, i) => (
                    <tr
                      key={a.id}
                      className={`transition hover:bg-brand/[0.02] ${
                        i % 2 === 1 ? "bg-neutral-25" : ""
                      }`}
                    >
                      <td
                        className={`${tdClass} font-medium text-neutral-900`}
                      >
                        {a.email}
                      </td>
                      <td className={tdClass}>{a.org_name ?? "—"}</td>
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
                        {a.created_at
                          ? new Date(a.created_at).toLocaleDateString("it-IT")
                          : "—"}
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
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminOrgAdmins;
