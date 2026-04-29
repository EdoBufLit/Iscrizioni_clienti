import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AuthError,
  createOrgAdminReferralInvite,
  fetchOrgAdminReferralInvites,
  fetchOrgAdminReferralSummary,
  spinOrgAdminReferralReward,
  type OrgAdminReferralListItem,
  type OrgAdminReferralSummary,
} from "../../lib/api";
import { referralInviteStatusMeta } from "../../lib/statusLabels";
import { useToast } from "../../components/ui/ToastProvider";
import { useOrgAdmin } from "./OrgAdminLayout";

const PAGE_SIZE = 20;

const STATUS_FILTERS: Array<{
  value: string;
  label: string;
}> = [
  { value: "", label: "Tutti" },
  { value: "invited", label: "Invitati" },
  { value: "completed_by_association", label: "Completati da associazione" },
  { value: "under_review", label: "In revisione" },
  { value: "approved", label: "Approvati" },
  { value: "rejected", label: "Rifiutati" },
];

const formatDateTime = (value: string | null | undefined) => {
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

const resolveWheelResult = (
  item: OrgAdminReferralListItem | null,
): {
  code: string | null;
  title: string | null;
  description: string | null;
  delivery_timing: string | null;
} | null => {
  if (!item) return null;
  if (item.wheel_result) return item.wheel_result;
  if (!item.reward_title) return null;
  return {
    code: item.reward_code,
    title: item.reward_title,
    description: item.reward_description,
    delivery_timing: item.reward_delivery_timing,
  };
};

const OrgAdminInvites = () => {
  const { admin, loading: adminLoading } = useOrgAdmin();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [summary, setSummary] = useState<OrgAdminReferralSummary | null>(null);
  const [items, setItems] = useState<OrgAdminReferralListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [reloadTick, setReloadTick] = useState(0);

  const [selectedInviteId, setSelectedInviteId] = useState<number | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [spinLoading, setSpinLoading] = useState(false);
  const [spinError, setSpinError] = useState("");

  const [inviteOrgName, setInviteOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteNotes, setInviteNotes] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (adminLoading) return;
    if (!admin) return;

    setLoading(true);
    setError("");
    Promise.all([
      fetchOrgAdminReferralSummary(),
      fetchOrgAdminReferralInvites({
        page,
        pageSize: PAGE_SIZE,
        q: debouncedQuery || undefined,
        status: statusFilter || undefined,
      }),
    ])
      .then(([summaryPayload, invitesPayload]) => {
        setSummary(summaryPayload);
        setItems(invitesPayload.items || []);
        setTotalPages(invitesPayload.total_pages || 1);

        if (!invitesPayload.items || invitesPayload.items.length === 0) {
          setSelectedInviteId(null);
          return;
        }

        const hasSelected = invitesPayload.items.some((item) => item.id === selectedInviteId);
        if (!hasSelected) {
          setSelectedInviteId(invitesPayload.items[0].id);
        }
      })
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Errore caricamento inviti.");
      })
      .finally(() => setLoading(false));
  }, [admin, adminLoading, debouncedQuery, navigate, page, reloadTick, selectedInviteId, statusFilter]);

  const selectedInvite = useMemo(
    () => items.find((item) => item.id === selectedInviteId) ?? null,
    [items, selectedInviteId],
  );
  const selectedInviteStatusMeta =
    referralInviteStatusMeta[selectedInvite?.invite_status || "invited"] ?? referralInviteStatusMeta.invited;
  const selectedWheelResult = resolveWheelResult(selectedInvite);

  const onCreateInvite = async () => {
    const normalizedName = inviteOrgName.trim();
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedName || !normalizedEmail) {
      setInviteError("Inserisci nome associazione ed email referente.");
      return;
    }

    try {
      setInviteLoading(true);
      setInviteError("");
      setInviteSuccess("");
      await createOrgAdminReferralInvite({
        organization_name: normalizedName,
        applicant_email: normalizedEmail,
        notes: inviteNotes.trim() || undefined,
      });
      setInviteSuccess(`Invito inviato a ${normalizedEmail}.`);
      showToast({ tone: "success", title: "Inviti", message: "Invito creato con successo." });
      setInviteOrgName("");
      setInviteEmail("");
      setInviteNotes("");
      setPage(1);
      setReloadTick((value) => value + 1);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      setInviteError(err instanceof Error ? err.message : "Errore creazione invito.");
    } finally {
      setInviteLoading(false);
    }
  };

  const onSpinWheel = async () => {
    if (!selectedInvite || !selectedInvite.wheel_enabled || spinLoading) return;

    setSpinLoading(true);
    setSpinError("");
    const extraTurn = 1080 + Math.floor(Math.random() * 360);
    setWheelRotation((prev) => prev + extraTurn);

    const startedAt = Date.now();
    try {
      const response = await spinOrgAdminReferralReward(selectedInvite.id);
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, 1800 - elapsed);
      if (wait > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, wait));
      }

      const rewardTitle =
        response.wheel_result?.title || response.reward?.title || "Premio assegnato";
      showToast({ tone: "success", title: "Ruota premi", message: `Ruota completata: ${rewardTitle}` });
      setReloadTick((value) => value + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore durante la ruota premi.";
      setSpinError(message);
      showToast({ tone: "error", title: "Ruota premi", message });
    } finally {
      setSpinLoading(false);
    }
  };

  return (
    <div className="container-shell py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Inviti</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Gestisci associazioni invitate, stato pratica e ruota premi.
          </p>
        </div>
      </div>

      <div className="surface mt-6 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Crea invito
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          L'associazione riceve un link per completare la pratica di affiliazione.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
            value={inviteOrgName}
            onChange={(event) => setInviteOrgName(event.target.value)}
            placeholder="Nome associazione invitata"
          />
          <input
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="Email referente"
            type="email"
          />
          <textarea
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm md:col-span-2"
            rows={3}
            value={inviteNotes}
            onChange={(event) => setInviteNotes(event.target.value)}
            placeholder="Note (opzionale)"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary px-4 py-2 text-sm"
            disabled={inviteLoading}
            onClick={onCreateInvite}
          >
            {inviteLoading ? "Invio in corso..." : "Invia invito"}
          </button>
          {inviteError ? <p className="text-sm text-red-600">{inviteError}</p> : null}
          {inviteSuccess ? <p className="text-sm text-emerald-700">{inviteSuccess}</p> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Inviti inviati</p>
          <p className="mt-2 text-2xl font-semibold text-neutral-900 tabular-nums">
            {summary?.stats.sent ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Approvate</p>
          <p className="mt-2 text-2xl font-semibold text-neutral-900 tabular-nums">
            {summary?.stats.approved ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Ruote concluse</p>
          <p className="mt-2 text-2xl font-semibold text-neutral-900 tabular-nums">
            {summary?.stats.rewarded ?? 0}
          </p>
        </div>
      </div>

      <div className="surface mt-6 overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-neutral-200 bg-white/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
              value={query}
              onChange={(event) => {
                setPage(1);
                setQuery(event.target.value);
              }}
              placeholder="Cerca associazione o email"
            />
            <select
              className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value);
              }}
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-ghost px-3 py-2 text-sm"
            onClick={() => setReloadTick((value) => value + 1)}
          >
            Aggiorna
          </button>
        </div>

        {error ? (
          <div className="px-4 py-4 text-sm text-red-700">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-white/60">
                <tr>
                  <th className="px-4 py-3 text-xs uppercase tracking-[0.14em] text-neutral-500">
                    Associazione
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-[0.14em] text-neutral-500">
                    Stato
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-[0.14em] text-neutral-500">
                    Data invio
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-[0.14em] text-neutral-500">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-6 py-12 text-center text-sm text-slate-500 bg-slate-50 border-dashed ring-1 ring-inset ring-slate-200/60 rounded-[1.25rem] block m-4" colSpan={4}>
                      Caricamento inviti...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="px-6 py-12 text-center text-sm text-slate-500 bg-slate-50 border-dashed ring-1 ring-inset ring-slate-200/60 rounded-[1.25rem] block m-4" colSpan={4}>
                      Nessun invito registrato.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const statusMeta =
                      referralInviteStatusMeta[item.invite_status] ?? referralInviteStatusMeta.invited;
                    return (
                      <tr
                        key={item.id}
                        className={`border-b border-neutral-100 ${
                          selectedInviteId === item.id ? "bg-brand/[0.06]" : "bg-white/30"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-neutral-900">{item.organization_name || "-"}</p>
                          <p className="mt-0.5 text-xs text-neutral-500">{item.applicant_email || "-"}</p>
                        </td>
                        <td className="px-4 py-3">
                      <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusMeta.tone}`}
                          >
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-neutral-700 whitespace-nowrap">
                          {formatDateTime(item.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="btn-ghost px-3 py-1.5 text-xs"
                              onClick={() => setSelectedInviteId(item.id)}
                            >
                              Apri dettaglio
                            </button>
                            {item.wheel_enabled ? (
                              <button
                                type="button"
                                className="btn-primary px-3 py-1.5 text-xs"
                                onClick={() => {
                                  setSelectedInviteId(item.id);
                                  const panel = document.getElementById("invite-wheel-panel");
                                  panel?.scrollIntoView({ behavior: "smooth", block: "center" });
                                }}
                              >
                                Apri ruota
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3 text-sm text-neutral-600">
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

      <div id="invite-wheel-panel" className="surface mt-6 p-6">
        {!selectedInvite ? (
          <p className="text-sm text-neutral-500">
            Seleziona un invito per vedere dettagli e disponibilita ruota.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  Associazione invitata
                </p>
                <p className="mt-1 text-base font-semibold text-neutral-900">
                  {selectedInvite.organization_name || "-"}
                </p>
                <p className="mt-1 text-sm text-neutral-600">{selectedInvite.applicant_email || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  Stato pratica
                </p>
                <span
                  className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${selectedInviteStatusMeta.tone}`}
                >
                  {selectedInviteStatusMeta.label}
                </span>
                <p className="mt-1 text-sm text-neutral-600">{selectedInviteStatusMeta.hint}</p>
              </div>
            </div>

            {selectedInvite.wheel_enabled ? (
              <div className="grid gap-5 lg:grid-cols-[240px_1fr] lg:items-center">
                <div className="referral-wheel-wrap">
                  <div
                    className={`referral-wheel${spinLoading ? " is-spinning" : ""}`}
                    style={{ transform: `rotate(${wheelRotation}deg)` }}
                    aria-hidden="true"
                  >
                    <div className="referral-wheel-center">Bonus</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-neutral-800">
                    Ruota premi disponibile
                  </p>
                  <p className="text-sm text-neutral-600">
                    Questa pratica e approvata dal super admin: puoi procedere con la ruota.
                  </p>
                  <button
                    type="button"
                    className="btn-primary px-4 py-2 text-sm"
                    disabled={spinLoading}
                    onClick={onSpinWheel}
                  >
                    {spinLoading ? "Estrazione in corso..." : "Gira la ruota"}
                  </button>
                  {spinError ? <p className="text-sm text-red-600">{spinError}</p> : null}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
                  In attesa di approvazione
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  La ruota resta nascosta finche l'associazione completa la pratica e il super admin approva.
                </p>
              </div>
            )}

            {selectedWheelResult ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  Esito ruota registrato
                </p>
                <p className="mt-1 text-sm font-semibold text-emerald-800">
                  {selectedWheelResult.title || "Premio assegnato"}
                </p>
                {selectedWheelResult.description ? (
                  <p className="mt-1 text-sm text-emerald-700">{selectedWheelResult.description}</p>
                ) : null}
                {selectedWheelResult.delivery_timing ? (
                  <p className="mt-1 text-xs text-emerald-700">
                    Erogazione: {selectedWheelResult.delivery_timing}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-emerald-800">
                  Girata il {formatDateTime(selectedInvite.wheel_spun_at)} (org admin id{" "}
                  {selectedInvite.wheel_spun_by_org_admin_id ?? "-"}).
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>

    </div>
  );
};

export default OrgAdminInvites;
