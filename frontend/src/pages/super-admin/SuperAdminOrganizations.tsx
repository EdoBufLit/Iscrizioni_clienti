import { useCallback, useEffect, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import {
  fetchSuperAdminOrganizations,
  deleteOrganization,
  AuthError,
  type SuperAdminOrganization,
  type SuperAdminProfile,
} from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";
import OrganizationManageModal, {
  type OrganizationModalType,
} from "./components/OrganizationManageModal";
import SuperAdminPienissimoIntegrationCard from "./components/SuperAdminPienissimoIntegrationCard";

const thClass =
  "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400";
const tdClass = "px-5 py-3.5 text-sm text-neutral-700";

const SuperAdminOrganizations = () => {
  const navigate = useNavigate();
  const { profile } = useOutletContext<{ profile: SuperAdminProfile | null }>();
  const isSuperAdmin = profile?.role === "super_admin";

  const [orgs, setOrgs] = useState<SuperAdminOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<OrganizationModalType>("create");
  const [selectedOrg, setSelectedOrg] = useState<SuperAdminOrganization | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<SuperAdminOrganization | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [integrationOrg, setIntegrationOrg] = useState<SuperAdminOrganization | null>(null);

  const loadOrgs = useCallback(() => {
    if (orgs.length === 0) {
      setLoading(true);
    }

    fetchSuperAdminOrganizations()
      .then((res) => {
        setOrgs(res.data);
        setError("");
      })
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/super-admin/login", { replace: true });
        } else {
          setError("Errore nel caricamento.");
        }
      })
      .finally(() => setLoading(false));
  }, [orgs.length, navigate]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    loadOrgs();
  }, [profile, loadOrgs]);

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
    loadOrgs();
  }, [loadOrgs]);

  const handleSwitchToAddBatch = useCallback(() => {
    if (!selectedOrg) {
      return;
    }
    setModalType("add-batch");
  }, [selectedOrg]);

  const handleDelete = useCallback((org: SuperAdminOrganization) => {
    setDeleteConfirm(org);
  }, []);

  const openIntegrationModal = useCallback((org: SuperAdminOrganization) => {
    setIntegrationOrg(org);
  }, []);

  const closeIntegrationModal = useCallback(() => {
    setIntegrationOrg(null);
  }, []);

  const confirmDelete = async () => {
    if (!deleteConfirm || deleting) return;
    setDeleting(true);
    try {
      await deleteOrganization(deleteConfirm.id);
      setDeleteConfirm(null);
      loadOrgs();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Errore durante l'eliminazione");
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
      <div className="mb-8 min-h-[76px]">
        {error && (
          <div className="rounded-lg border border-red-200/60 bg-red-50 px-7 py-5">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

      <div className="surface mt-8 overflow-hidden" data-component="superadmin-orgs-table">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-white/60 bg-white/40">
              <tr>
                <th className={thClass}>Nome</th>
                <th className={thClass}>Slug</th>
                <th className={thClass}>Citta</th>
                <th className={thClass}>Stato</th>
                <th className={thClass}>Tessere</th>
                <th className={thClass}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {orgs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-neutral-500">
                    Nessuna associazione trovata.
                  </td>
                </tr>
              ) : (
                orgs.map((org, i) => (
                  <tr
                    key={org.id}
                    className={`transition hover:bg-brand/[0.02] ${i % 2 === 1 ? "bg-white/30" : ""}`}
                  >
                    <td className={`${tdClass} font-medium text-neutral-900`}>{org.name}</td>
                    <td className={tdClass}>{org.slug}</td>
                    <td className={tdClass}>
                      {org.city} {org.province ? `(${org.province})` : ""}
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
                      {org.card_min ? (
                        <span>{org.card_min} - {org.card_max}</span>
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
                              </>
                            )}
                          </>
                        )}
                        {org.is_active && (
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
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="modal-panel max-w-md p-6">
            <div className="flex items-center gap-3 text-red-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-lg font-semibold">Elimina associazione</h3>
            </div>

            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-medium text-red-800">Questa azione e irreversibile.</p>
              <p className="mt-1 text-sm text-red-700">Verranno eliminati permanentemente:</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
                <li>L'associazione <strong>{deleteConfirm.name}</strong></li>
                <li>Tutti i soci iscritti</li>
                <li>Tutti i documenti caricati</li>
                <li>Tutti gli amministratori dell'associazione</li>
                <li>Tutti i dati delle tessere</li>
              </ul>
            </div>

            <p className="mt-4 text-sm text-neutral-600">
              Lo slug <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{deleteConfirm.slug}</code> potra essere riutilizzato.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                onClick={() => setDeleteConfirm(null)}
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
                {deleting ? "Eliminazione..." : "Elimina definitivamente"}
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
