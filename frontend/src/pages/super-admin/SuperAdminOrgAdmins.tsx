import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchSuperAdminMe,
  superAdminLogout,
  fetchOrganizations,
  fetchOrgAdmins,
  fetchVersion,
  createOrgAdmin,
  patchOrgAdmin,
  deleteOrgAdmin,
  increaseOrgCardStock,
  AuthError,
  type SuperAdminProfile,
  type Organization,
  type OrgAdmin,
  type VersionInfo,
  type IncreaseCardsResult,
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
  const [ver, setVer] = useState<VersionInfo | null>(null);

  // Deletion
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OrgAdmin | null>(null);
  const [deleteError, setDeleteError] = useState("");

  // Card stock form
  const [cardOrgId, setCardOrgId] = useState<number | "">("");
  const [cardAmount, setCardAmount] = useState("");
  const [cardReason, setCardReason] = useState("");
  const [cardPaidRef, setCardPaidRef] = useState("");
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [cardError, setCardError] = useState("");
  const [cardSuccess, setCardSuccess] = useState<IncreaseCardsResult | null>(
    null,
  );
  const [cardConfirm, setCardConfirm] = useState(false);
  const [orgStock, setOrgStock] = useState<
    Record<number, { total: number; remaining: number }>
  >({});

  // Initial load
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
    fetchVersion().then(setVer).catch(() => {});
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
      const result = await createOrgAdmin(newEmail.trim(), newOrgId);
      if (result.restored) {
        setCreateSuccess("Admin ripristinato. Ora puoi inviare il magic link.");
      } else {
        setCreateSuccess(`Invito inviato a ${newEmail.trim()}`);
      }
      setNewEmail("");
      const updated = await fetchOrgAdmins(
        selectedOrg !== "" ? selectedOrg : undefined,
      );
      setAdmins(updated);
    } catch (err) {
      if (err instanceof Error && err.message === "admin_exists") {
        setCreateError("Esiste già un admin con questa email.");
      } else {
        setCreateError(
          err instanceof Error ? err.message : "Errore nella creazione.",
        );
      }
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
        err instanceof Error ? err.message : "Errore durante l'eliminazione.",
      );
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm(null);
    setDeleteError("");
  };

  const handleCardFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    const amount = parseInt(cardAmount, 10);
    if (cardOrgId === "" || !amount || amount <= 0) return;
    setCardError("");
    setCardSuccess(null);
    setCardConfirm(true);
  };

  const handleCardConfirm = async () => {
    const amount = parseInt(cardAmount, 10);
    if (cardOrgId === "" || !amount || amount <= 0 || cardSubmitting) return;
    setCardConfirm(false);
    setCardSubmitting(true);
    try {
      const result = await increaseOrgCardStock(
        cardOrgId,
        amount,
        cardReason.trim() || undefined,
        cardPaidRef.trim() || undefined,
      );
      setCardSuccess(result);
      setOrgStock((prev) => ({
        ...prev,
        [cardOrgId as number]: {
          total: result.cards_total,
          remaining: result.cards_remaining,
        },
      }));
      setCardAmount("");
      setCardReason("");
      setCardPaidRef("");
    } catch (err) {
      setCardError(
        err instanceof Error ? err.message : "Errore nell'operazione.",
      );
    } finally {
      setCardSubmitting(false);
    }
  };

  const handleCardCancel = () => {
    setCardConfirm(false);
  };

  const cardFormValid =
    cardOrgId !== "" && !!cardAmount && parseInt(cardAmount, 10) > 0;

  const selectedCardOrgName =
    cardOrgId !== ""
      ? (orgs.find((o) => o.id === cardOrgId)?.name ?? "")
      : "";

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
      <div className="border-b border-white/60 bg-white/40 backdrop-blur-sm">
        <div className="container-shell py-8">
          <div className="flex items-start gap-5">
            <div className="hidden shrink-0 sm:block">
              <img
                src={`${import.meta.env.BASE_URL}logo.jpg`}
                alt="ASSO.N.A.M."
                className="h-12 rounded"
              />
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

        {/* ── Amministratori ────────────────────────────────── */}
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
        <div className="mt-8 surface px-5 py-4">
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
                        i % 2 === 1 ? "bg-white/30" : ""
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
                L’operazione rimuove l’admin{" "}
                <span className="font-medium">{deleteConfirm.email}</span> dall’accesso.
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

        {/* ── Gestione tessere ──────────────────────────────── */}
        <div className="mt-14">
          <h2 className="text-xl font-semibold text-neutral-900">
            Gestione tessere
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Incrementa lo stock tessere per un'associazione.
          </p>

          {/* Per-org stock summary */}
          {cardOrgId !== "" &&
            orgStock[cardOrgId as number] &&
            (() => {
              const stock = orgStock[cardOrgId as number];
              const used = stock.total - stock.remaining;
              const lowStock =
                stock.remaining > 0 && stock.remaining <= 10;
              const noStock = stock.remaining === 0;
              return (
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="surface p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.15em] text-neutral-400">
                      Totale
                    </p>
                    <p className="mt-2 text-xl font-semibold tabular-nums text-neutral-900">
                      {stock.total}
                    </p>
                  </div>
                  <div className="surface p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.15em] text-neutral-400">
                      Assegnate
                    </p>
                    <p className="mt-2 text-xl font-semibold tabular-nums text-neutral-900">
                      {used}
                    </p>
                  </div>
                  <div
                    className={`surface p-5 ${
                      noStock
                        ? "border-red-200 bg-red-50"
                        : lowStock
                          ? "border-amber-200 bg-amber-50"
                          : ""
                    }`}
                  >
                    <p
                      className={`text-xs font-medium uppercase tracking-[0.15em] ${
                        noStock
                          ? "text-red-400"
                          : lowStock
                            ? "text-amber-500"
                            : "text-neutral-400"
                      }`}
                    >
                      Rimanenti
                    </p>
                    <p
                      className={`mt-2 text-xl font-semibold tabular-nums ${
                        noStock
                          ? "text-red-700"
                          : lowStock
                            ? "text-amber-700"
                            : "text-neutral-900"
                      }`}
                    >
                      {stock.remaining}
                    </p>
                  </div>
                </div>
              );
            })()}

          <div className="surface mt-6 p-7">
            {cardError && (
              <div className="mb-5 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{cardError}</p>
              </div>
            )}
            {cardSuccess && !cardConfirm && (
              <div className="mb-5 rounded-md border border-emerald-200/60 bg-emerald-50 px-4 py-3">
                <p className="text-sm text-emerald-700">
                  Aggiunte{" "}
                  {cardSuccess.end_no - cardSuccess.start_no + 1} tessere
                  (n.&nbsp;{cardSuccess.start_no}–{cardSuccess.end_no}).
                  Totale: {cardSuccess.cards_total}, rimanenti:{" "}
                  {cardSuccess.cards_remaining}.
                </p>
              </div>
            )}

            {cardConfirm ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-6 py-5">
                <p className="text-sm font-semibold text-amber-800">
                  Conferma operazione
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-700">
                  Stai per aggiungere{" "}
                  <span className="font-semibold">{cardAmount}</span> tessere
                  a{" "}
                  <span className="font-semibold">
                    {selectedCardOrgName}
                  </span>
                  .
                  {cardReason.trim() && (
                    <>
                      {" "}
                      Causale:{" "}
                      <span className="font-medium">
                        {cardReason.trim()}
                      </span>
                      .
                    </>
                  )}
                  {cardPaidRef.trim() && (
                    <>
                      {" "}
                      Rif. pagamento:{" "}
                      <span className="font-medium">
                        {cardPaidRef.trim()}
                      </span>
                      .
                    </>
                  )}
                </p>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md bg-amber-600 px-5 py-2 text-sm font-semibold text-white shadow-subtle transition hover:-translate-y-px hover:bg-amber-700 hover:shadow-card active:translate-y-0"
                    onClick={handleCardConfirm}
                  >
                    Conferma
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                    onClick={handleCardCancel}
                  >
                    Annulla
                  </button>
                </div>
              </div>
            ) : (
              <form
                className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_1fr_auto] sm:items-end"
                onSubmit={handleCardFormSubmit}
              >
                <div>
                  <label
                    htmlFor="card-org"
                    className="block text-xs font-medium text-neutral-600"
                  >
                    Associazione
                  </label>
                  <select
                    id="card-org"
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    value={cardOrgId}
                    onChange={(e) =>
                      setCardOrgId(
                        e.target.value ? Number(e.target.value) : "",
                      )
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
                <div className="sm:w-24">
                  <label
                    htmlFor="card-amount"
                    className="block text-xs font-medium text-neutral-600"
                  >
                    Quantità
                  </label>
                  <input
                    id="card-amount"
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="50"
                    value={cardAmount}
                    onChange={(e) => setCardAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    htmlFor="card-reason"
                    className="block text-xs font-medium text-neutral-600"
                  >
                    Causale
                  </label>
                  <input
                    id="card-reason"
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="text"
                    placeholder="Acquisto tessere extra"
                    value={cardReason}
                    onChange={(e) => setCardReason(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    htmlFor="card-paid-ref"
                    className="block text-xs font-medium text-neutral-600"
                  >
                    Rif. pagamento
                  </label>
                  <input
                    id="card-paid-ref"
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="text"
                    placeholder="BON-2026-001"
                    value={cardPaidRef}
                    onChange={(e) => setCardPaidRef(e.target.value)}
                  />
                </div>
                <button
                  className="inline-flex shrink-0 items-center justify-center rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white shadow-subtle transition hover:-translate-y-px hover:bg-brand-dark hover:shadow-card active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-subtle"
                  type="submit"
                  disabled={!cardFormValid || cardSubmitting}
                >
                  {cardSubmitting ? "Invio…" : "Aggiungi tessere"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Version footer */}
      {ver && (
        <footer className="container-shell pb-6 pt-12 text-[11px] text-neutral-400">
          v{ver.version}
          {ver.git_sha ? ` (${ver.git_sha.slice(0, 7)})` : ""}
        </footer>
      )}
    </div>
  );
};

export default SuperAdminOrgAdmins;
