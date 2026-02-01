import { FormEvent, useEffect, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import {
  fetchSuperAdminOrganizations,
  createSuperAdminOrganization,
  setInitialCardRange,
  increaseOrgCardStock,
  deleteSuperAdminOrganization,
  AuthError,
  type SuperAdminOrganization,
  type SuperAdminProfile,
} from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";

const thClass =
  "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400";
const tdClass = "px-5 py-3.5 text-sm text-neutral-700";

const SuperAdminOrganizations = () => {
  const navigate = useNavigate();
  const { profile } = useOutletContext<{ profile: SuperAdminProfile | null }>();

  const [orgs, setOrgs] = useState<SuperAdminOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Card Modal State
  const [showCardModal, setShowCardModal] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<SuperAdminOrganization | null>(
    null
  );
  const [cardFormData, setCardFormData] = useState({
    from_no: "",
    to_no: "",
    amount: "",
  });
  const [cardError, setCardError] = useState("");
  const [cardSuccess, setCardSuccess] = useState("");
  const [managingCards, setManagingCards] = useState(false);

  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<SuperAdminOrganization | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    city: "",
    province: "",
    description_short: "",
    is_active: true,
  });

  const loadOrgs = () => {
    // Only set loading true if we don't have orgs yet to avoid flicker on refresh
    if (orgs.length === 0) setLoading(true);

    fetchSuperAdminOrganizations()
      .then((res) => setOrgs(res.data))
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/super-admin/login", { replace: true });
        } else {
          setError("Errore nel caricamento.");
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (profile) {
        loadOrgs();
    }
  }, [profile, navigate]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || creating) return;

    setCreating(true);
    setCreateError("");

    try {
      const payload = {
        name: formData.name,
        slug: formData.slug || undefined,
        city: formData.city || undefined,
        province: formData.province || undefined,
        description_short: formData.description_short || undefined,
        is_active: formData.is_active,
      };
      await createSuperAdminOrganization(payload);
      setShowModal(false);
      setFormData({
        name: "",
        slug: "",
        city: "",
        province: "",
        description_short: "",
        is_active: true,
      });
      loadOrgs();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Errore nella creazione");
    } finally {
      setCreating(false);
    }
  };

  const openCardModal = (org: SuperAdminOrganization) => {
    setSelectedOrg(org);
    setCardFormData({ from_no: "", to_no: "", amount: "" });
    setCardError("");
    setCardSuccess("");
    setShowCardModal(true);
  };

  const handleCardSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedOrg || managingCards) return;

    setManagingCards(true);
    setCardError("");
    setCardSuccess("");

    try {
      if (selectedOrg.card_min) {
        // Increase
        const amount = parseInt(cardFormData.amount, 10);
        if (isNaN(amount) || amount <= 0) throw new Error("Quantità non valida");

        await increaseOrgCardStock(selectedOrg.id, amount);
        setCardSuccess(`Aggiunte ${amount} tessere con successo.`);
      } else {
        // Set Initial Range
        const from = parseInt(cardFormData.from_no, 10);
        const to = parseInt(cardFormData.to_no, 10);
        if (isNaN(from) || isNaN(to) || from <= 0 || to <= 0)
          throw new Error("Valori non validi");
        if (from > to) throw new Error("Dal deve essere <= Al");

        await setInitialCardRange(selectedOrg.id, from, to);
        setCardSuccess(`Range ${from}–${to} impostato con successo.`);
      }

      // Refresh orgs to update table
      loadOrgs();

      // Close modal after short delay? Or keep open to show success.
      // Let's keep open but clear form if needed.
      setCardFormData({ from_no: "", to_no: "", amount: "" });

    } catch (err) {
      setCardError(err instanceof Error ? err.message : "Errore operazione");
    } finally {
      setManagingCards(false);
    }
  };

  const confirmDelete = (org: SuperAdminOrganization) => {
    setOrgToDelete(org);
    setDeleteError("");
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!orgToDelete || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteSuperAdminOrganization(orgToDelete.id);
      setShowDeleteModal(false);
      loadOrgs();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Errore nella disattivazione");
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !orgs.length) {
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
      {error && (
        <div className="mb-8 rounded-lg border border-red-200/60 bg-red-50 px-7 py-5">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">
            Associazioni
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Gestisci le associazioni registrate sulla piattaforma.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white shadow-subtle transition hover:-translate-y-px hover:bg-brand-dark hover:shadow-card active:translate-y-0"
          onClick={() => setShowModal(true)}
        >
          Nuova associazione
        </button>
      </div>

      <div className="surface mt-8 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-white/60 bg-white/40">
              <tr>
                <th className={thClass}>Nome</th>
                <th className={thClass}>Slug</th>
                <th className={thClass}>Città</th>
                <th className={thClass}>Tessere</th>
                <th className={thClass}>Stato</th>
                <th className={thClass}>Creata il</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {orgs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-neutral-500">
                    Nessuna associazione trovata.
                  </td>
                </tr>
              ) : (
                orgs.map((org, i) => (
                  <tr
                    key={org.id}
                    className={`transition hover:bg-brand/[0.02] ${
                      i % 2 === 1 ? "bg-white/30" : ""
                    }`}
                  >
                    <td className={`${tdClass} font-medium text-neutral-900`}>
                      {org.name}
                    </td>
                    <td className={tdClass}>{org.slug}</td>
                    <td className={tdClass}>
                      {org.city} {org.province ? `(${org.province})` : ""}
                    </td>
                    <td className={`${tdClass} tabular-nums`}>
                      {org.card_min ? `${org.card_min} – ${org.card_max}` : "—"}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          org.is_active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-neutral-200 bg-neutral-50 text-neutral-600"
                        }`}
                      >
                        {org.is_active ? "Attiva" : "Disattivata"}
                      </span>
                    </td>
                    <td className={`${tdClass} tabular-nums`}>
                      {org.created_at
                        ? new Date(org.created_at).toLocaleDateString("it-IT")
                        : "—"}
                    </td>
                    <td className={tdClass}>
                      <div className="flex gap-3">
                        <button
                          onClick={() => openCardModal(org)}
                          className="text-xs font-semibold text-brand hover:text-brand-dark hover:underline"
                        >
                          Gestisci
                        </button>
                        {org.is_active && (
                          <button
                            onClick={() => confirmDelete(org)}
                            className="text-xs font-semibold text-red-600 hover:text-red-800 hover:underline"
                          >
                            Elimina
                          </button>
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

      {/* Cards Modal */}
      {showCardModal && selectedOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md surface-strong p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-neutral-900">
              Gestione Tessere: {selectedOrg.name}
            </h3>

            {cardError && (
              <div className="mt-4 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{cardError}</p>
              </div>
            )}
            {cardSuccess && (
              <div className="mt-4 rounded-md border border-emerald-200/60 bg-emerald-50 px-4 py-3">
                <p className="text-sm text-emerald-700">{cardSuccess}</p>
              </div>
            )}

            <form className="mt-6 grid gap-4" onSubmit={handleCardSubmit}>
              {selectedOrg.card_min ? (
                <>
                  <div className="p-3 bg-neutral-50 border border-neutral-200 rounded text-sm text-neutral-600">
                    <span className="block text-xs uppercase tracking-wider text-neutral-400 font-bold mb-1">
                      Range Attuale
                    </span>
                    <span className="text-lg font-semibold text-neutral-900">
                      {selectedOrg.card_min} – {selectedOrg.card_max}
                    </span>
                  </div>
                  <div>
                    <label
                      htmlFor="amount"
                      className="block text-xs font-medium text-neutral-600"
                    >
                      Quantità da aggiungere
                    </label>
                    <input
                      id="amount"
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      type="number"
                      min="1"
                      required
                      value={cardFormData.amount}
                      onChange={(e) =>
                        setCardFormData({ ...cardFormData, amount: e.target.value })
                      }
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      Il range verrà esteso automaticamente da {selectedOrg.card_max! + 1}.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-neutral-600">
                    Questa associazione non ha ancora tessere assegnate. Imposta un range iniziale.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="from_no"
                        className="block text-xs font-medium text-neutral-600"
                      >
                        Da (Inclusivo)
                      </label>
                      <input
                        id="from_no"
                        className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                        type="number"
                        min="1"
                        required
                        value={cardFormData.from_no}
                        onChange={(e) =>
                          setCardFormData({ ...cardFormData, from_no: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="to_no"
                        className="block text-xs font-medium text-neutral-600"
                      >
                        A (Inclusivo)
                      </label>
                      <input
                        id="to_no"
                        className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                        type="number"
                        min="1"
                        required
                        value={cardFormData.to_no}
                        onChange={(e) =>
                          setCardFormData({ ...cardFormData, to_no: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                  onClick={() => setShowCardModal(false)}
                >
                  Chiudi
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-subtle transition hover:-translate-y-px hover:bg-brand-dark hover:shadow-card active:translate-y-0 disabled:opacity-50"
                  disabled={managingCards}
                >
                  {managingCards
                    ? "Elaborazione..."
                    : selectedOrg.card_min
                    ? "Aggiungi tessere"
                    : "Imposta range"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && orgToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm surface-strong p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">
                Disattiva associazione
              </h3>
            </div>

            <div className="mt-3">
              <p className="text-sm text-neutral-500">
                Sei sicuro di voler disattivare <strong>{orgToDelete.name}</strong>?
                <br /><br />
                L'associazione non sarà più visibile pubblicamente e gli amministratori non potranno accedere.
              </p>
              {deleteError && (
                <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
                  {deleteError}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                Annulla
              </button>
              <button
                type="button"
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-subtle transition hover:bg-red-700 active:bg-red-800 disabled:opacity-50"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Disattivazione..." : "Disattiva"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg surface-strong p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-neutral-900">
              Nuova associazione
            </h3>

            {createError && (
              <div className="mt-4 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{createError}</p>
              </div>
            )}

            <form className="mt-6 grid gap-4" onSubmit={handleCreate}>
              <div>
                <label htmlFor="name" className="block text-xs font-medium text-neutral-600">
                  Nome associazione *
                </label>
                <input
                  id="name"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label htmlFor="city" className="block text-xs font-medium text-neutral-600">
                      Città
                    </label>
                    <input
                      id="city"
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                 </div>
                 <div>
                    <label htmlFor="province" className="block text-xs font-medium text-neutral-600">
                      Provincia
                    </label>
                    <input
                      id="province"
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      type="text"
                      placeholder="RM"
                      maxLength={2}
                      value={formData.province}
                      onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                    />
                 </div>
              </div>

              <div>
                <label htmlFor="slug" className="block text-xs font-medium text-neutral-600">
                  Slug (opzionale, autogenerato)
                </label>
                <input
                  id="slug"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-xs font-medium text-neutral-600">
                  Descrizione breve
                </label>
                <textarea
                  id="description"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  rows={3}
                  value={formData.description_short}
                  onChange={(e) => setFormData({ ...formData, description_short: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-2">
                 <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-gray-300 text-brand focus:ring-brand"
                 />
                 <label htmlFor="is_active" className="text-sm text-neutral-700">Attiva subito</label>
              </div>

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                  onClick={() => setShowModal(false)}
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-subtle transition hover:-translate-y-px hover:bg-brand-dark hover:shadow-card active:translate-y-0 disabled:opacity-50"
                  disabled={creating}
                >
                  {creating ? "Creazione..." : "Crea associazione"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminOrganizations;
