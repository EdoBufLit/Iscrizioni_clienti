import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  AuthError,
  fetchSuperAdminMemberDetail,
  fetchSuperAdminMemberRegistry,
  fetchSuperAdminOrganizations,
  type SuperAdminMemberDetail,
  type SuperAdminMemberRegistryResponse,
  type SuperAdminProfile,
  type SuperAdminOrganization,
} from "../../lib/api";
import {
  SuperAdminKpiCard,
  SuperAdminPageHeader,
  SuperAdminToolbar,
} from "./components/SuperAdminPrimitives";

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: "", label: "Tutti gli stati" },
  { value: "active", label: "Attivi" },
  { value: "pending", label: "In lavorazione" },
  { value: "expired", label: "Scaduti" },
  { value: "rejected", label: "Rigettati" },
];

const ORDER_OPTIONS = [
  { value: "joined_at_desc", label: "Data iscrizione (recenti)" },
  { value: "joined_at_asc", label: "Data iscrizione (storiche)" },
  { value: "card_no_asc", label: "Numero tessera (crescente)" },
  { value: "card_no_desc", label: "Numero tessera (decrescente)" },
  { value: "name_asc", label: "Cognome (A-Z)" },
  { value: "name_desc", label: "Cognome (Z-A)" },
  { value: "status_asc", label: "Stato workflow" },
];

function maskFiscalCode(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 8) return value;
  return `${value.slice(0, 6)}••••${value.slice(-4)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("it-IT");
}

function getMemberStatusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "expired") return "border-red-200 bg-red-50 text-red-700";
  if (normalized === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalized.includes("pending")) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-neutral-200 bg-neutral-100 text-neutral-700";
}

function getWorkflowLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const normalized = value.toLowerCase();
  if (normalized === "pending_verification") return "Verifica";
  if (normalized === "pending_docs") return "Documenti";
  if (normalized === "pending_cards") return "Emissione tessera";
  if (normalized === "active") return "Attivo";
  if (normalized === "expired") return "Scaduto";
  if (normalized === "rejected") return "Rigettato";
  return value;
}

type RegistryState = SuperAdminMemberRegistryResponse | null;

const SuperAdminMemberDetailPage = () => {
  const navigate = useNavigate();
  const { profile } = useOutletContext<{ profile: SuperAdminProfile | null }>();

  const [organizations, setOrganizations] = useState<SuperAdminOrganization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(true);
  const [registry, setRegistry] = useState<RegistryState>(null);
  const [registryLoading, setRegistryLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");

  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState("");
  const [order, setOrder] = useState("joined_at_desc");
  const [page, setPage] = useState(1);

  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [selectedMember, setSelectedMember] = useState<SuperAdminMemberDetail | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    if (!profile) return;
    setOrganizationsLoading(true);
    fetchSuperAdminOrganizations({ page: 1, pageSize: 200 })
      .then((data) => {
        setOrganizations(data.items);
      })
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/super-admin/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Errore caricamento associazioni.");
      })
      .finally(() => setOrganizationsLoading(false));
  }, [navigate, profile]);

  useEffect(() => {
    if (!profile) return;
    setRegistryLoading(true);
    setError("");
    fetchSuperAdminMemberRegistry({
      orgId: selectedOrgId ?? undefined,
      q: searchQuery || undefined,
      status: status || undefined,
      order,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    })
      .then((data) => {
        setRegistry(data);
      })
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/super-admin/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Errore caricamento libro soci.");
      })
      .finally(() => setRegistryLoading(false));
  }, [navigate, order, page, profile, searchQuery, selectedOrgId, status]);

  useEffect(() => {
    if (!registry?.items.length) {
      setSelectedMemberId(null);
      setSelectedMember(null);
      return;
    }

    const stillVisible = selectedMemberId != null && registry.items.some((item) => item.id === selectedMemberId);
    if (!stillVisible) {
      setSelectedMemberId(registry.items[0]?.id ?? null);
    }
  }, [registry, selectedMemberId]);

  useEffect(() => {
    if (!selectedMemberId) {
      setSelectedMember(null);
      return;
    }
    setDetailLoading(true);
    setDetailError("");
    fetchSuperAdminMemberDetail(selectedMemberId)
      .then(setSelectedMember)
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/super-admin/login", { replace: true });
          return;
        }
        setDetailError(err instanceof Error ? err.message : "Errore caricamento dettaglio socio.");
      })
      .finally(() => setDetailLoading(false));
  }, [navigate, selectedMemberId]);

  const selectedOrganizationName = useMemo(() => {
    if (selectedOrgId == null) return "Tutte le associazioni";
    return organizations.find((item) => item.id === selectedOrgId)?.name ?? "Associazione selezionata";
  }, [organizations, selectedOrgId]);

  const total = registry?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startIndex = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(page * PAGE_SIZE, total);
  const hasFilters = Boolean(selectedOrgId || searchInput || status || order !== "joined_at_desc");
  const selectedRow = selectedMemberId;

  const resetFilters = () => {
    setSelectedOrgId(null);
    setSearchInput("");
    setSearchQuery("");
    setStatus("");
    setOrder("joined_at_desc");
    setPage(1);
  };

  return (
    <div className="sa-page">
      <SuperAdminPageHeader
        icon="book"
        eyebrow="Governance"
        title="Libro Soci"
        subtitle="Registro digitale dei soci, navigabile per associazione con filtri gestionali e dettaglio dedicato."
      />

      <section className="sa-kpi-grid">
        <SuperAdminKpiCard label="Totale soci" value={registry?.kpis.total ?? 0} hint="Tutti gli stati" icon="users" tone="success" />
        <SuperAdminKpiCard label="Attivi" value={registry?.kpis.active ?? 0} hint="Iscrizioni valide" icon="check" tone="success" />
        <SuperAdminKpiCard label="In lavorazione" value={registry?.kpis.pending ?? 0} hint="Richiedono verifica" icon="clock" tone="info" />
        <SuperAdminKpiCard label="Scaduti" value={registry?.kpis.expired ?? 0} hint="Iscrizioni non rinnovate" icon="clock" tone="warning" />
        <SuperAdminKpiCard label="Rigettati" value={registry?.kpis.rejected ?? 0} hint="Domande rifiutate" icon="shield" tone="purple" />
      </section>

      <div className="hidden">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Libro Soci</h2>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            Registro digitale dei soci, navigabile per associazione con filtri gestionali e dettaglio dedicato.
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-right shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Associazione attiva</p>
          <p className="mt-1 text-sm font-semibold text-neutral-900">{selectedOrganizationName}</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200/70 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <SuperAdminToolbar>
        <div className="grid gap-4 xl:grid-cols-[1.1fr_1.2fr_0.8fr_0.9fr]">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Associazione
            </label>
            <select
              className="premium-select mt-2 w-full"
              value={selectedOrgId ?? ""}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSelectedOrgId(nextValue ? Number(nextValue) : null);
                setPage(1);
              }}
              disabled={organizationsLoading}
            >
              <option value="">Tutte le associazioni</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Cerca socio
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder="Nome, email, CF o numero tessera"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Stato socio
            </label>
            <select
              className="premium-select mt-2 w-full"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Ordinamento
            </label>
            <select
              className="premium-select mt-2 w-full"
              value={order}
              onChange={(event) => {
                setOrder(event.target.value);
                setPage(1);
              }}
            >
              {ORDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-medium text-neutral-500">
            {organizationsLoading ? "Caricamento associazioni..." : `${organizations.length} associazioni disponibili`}
          </p>
          {hasFilters ? (
            <button type="button" className="btn-ghost !px-4 !py-2 text-xs font-bold uppercase tracking-[0.18em]" onClick={resetFilters}>
              Reset filtri
            </button>
          ) : null}
        </div>
      </SuperAdminToolbar>

      <section className="hidden">
        {[
          { label: "Totali", value: registry?.kpis.total ?? 0 },
          { label: "Attivi", value: registry?.kpis.active ?? 0 },
          { label: "In lavorazione", value: registry?.kpis.pending ?? 0 },
          { label: "Scaduti", value: registry?.kpis.expired ?? 0 },
          { label: "Rigettati", value: registry?.kpis.rejected ?? 0 },
        ].map((item) => (
          <div key={item.label} className="surface p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{item.label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-neutral-900">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_380px]">
        <div className="surface overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
            <div>
              <h3 className="text-lg font-semibold text-neutral-900">Registro soci</h3>
              <p className="mt-1 text-sm text-neutral-500">
                {registryLoading ? "Caricamento elenco..." : `${startIndex}-${endIndex} di ${total} soci`}
              </p>
            </div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              {selectedOrganizationName}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50/80">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  <th className="px-4 py-3">Tessera</th>
                  <th className="px-4 py-3">Socio</th>
                  <th className="px-4 py-3">Contatti</th>
                  <th className="px-4 py-3">CF</th>
                  <th className="px-4 py-3">Iscrizione</th>
                  <th className="px-4 py-3">Stato</th>
                  <th className="px-4 py-3">Associazione</th>
                  <th className="px-4 py-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {registryLoading ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-neutral-500" colSpan={8}>
                      Caricamento libro soci...
                    </td>
                  </tr>
                ) : registry?.items.length ? (
                  registry.items.map((member) => {
                    const isSelected = selectedRow === member.id;
                    return (
                      <tr
                        key={member.id}
                        className={isSelected ? "bg-brand/5" : "hover:bg-neutral-50/70"}
                      >
                        <td className="px-4 py-3 text-sm font-semibold text-neutral-900">
                          {member.card_no ? (
                            <span className="font-mono">
                              {member.card_no}
                              {member.card_year ? ` / ${member.card_year}` : ""}
                            </span>
                          ) : (
                            <span className="text-neutral-400">Non assegnata</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-neutral-900">{member.full_name}</p>
                          <p className="mt-0.5 text-xs text-neutral-500">ID #{member.id}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-neutral-900">{member.email || "—"}</p>
                          <p className="mt-0.5 text-xs text-neutral-500">{member.phone || "—"}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-700">{maskFiscalCode(member.fiscal_code)}</td>
                        <td className="px-4 py-3 text-sm text-neutral-700">{formatDate(member.joined_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getMemberStatusTone(
                                member.status,
                              )}`}
                            >
                              {member.status}
                            </span>
                            <span className="text-xs text-neutral-500">{getWorkflowLabel(member.workflow_status)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-700">{member.organization_name || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="text-xs font-semibold uppercase tracking-[0.18em] text-brand hover:text-brand/80"
                            onClick={() => setSelectedMemberId(member.id)}
                          >
                            Visualizza dettaglio
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-neutral-500" colSpan={8}>
                      Nessun socio trovato con i filtri selezionati.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-5 py-4">
            <p className="text-xs text-neutral-500">
              Pagina {page} di {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost !px-4 !py-2 text-xs font-bold uppercase tracking-[0.18em]"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Precedente
              </button>
              <button
                type="button"
                className="btn-ghost !px-4 !py-2 text-xs font-bold uppercase tracking-[0.18em]"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Successiva
              </button>
            </div>
          </div>
        </div>

        <aside className="surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Scheda socio</p>
              <h3 className="mt-2 text-lg font-semibold text-neutral-900">
                {selectedMember ? `${selectedMember.first_name} ${selectedMember.last_name}` : "Nessun socio selezionato"}
              </h3>
            </div>
            {detailLoading ? (
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold text-neutral-500">
                Caricamento
              </span>
            ) : null}
          </div>

          {detailError ? (
            <div className="mt-4 rounded-xl border border-red-200/70 bg-red-50 px-4 py-3 text-sm text-red-700">
              {detailError}
            </div>
          ) : null}

          {!selectedMember && !detailLoading ? (
            <div className="mt-6 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-sm text-neutral-500">
              Seleziona un socio dalla tabella per consultare il dettaglio completo.
            </div>
          ) : null}

          {selectedMember ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Associazione</p>
                <p className="mt-2 text-sm font-semibold text-neutral-900">{selectedMember.organization?.name ?? "—"}</p>
                <p className="mt-1 text-xs text-neutral-500">Slug: {selectedMember.organization?.slug ?? "—"}</p>
              </div>

              <dl className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Email</dt>
                  <dd className="text-right font-medium text-neutral-900">{selectedMember.email || "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Telefono</dt>
                  <dd className="text-right font-medium text-neutral-900">{selectedMember.phone || "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Codice fiscale</dt>
                  <dd className="text-right font-mono text-[13px] text-neutral-900">{selectedMember.fiscal_code || "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Modalita pagamento</dt>
                  <dd className="text-right font-medium text-neutral-900">{selectedMember.payment_method || "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Numero tessera</dt>
                  <dd className="text-right font-mono text-neutral-900">
                    {selectedMember.card_no ? `${selectedMember.card_no}${selectedMember.card_year ? ` / ${selectedMember.card_year}` : ""}` : "—"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Data iscrizione</dt>
                  <dd className="text-right font-medium text-neutral-900">{formatDate(selectedMember.joined_at)}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-neutral-500">Workflow</dt>
                  <dd className="text-right font-medium text-neutral-900">{getWorkflowLabel(selectedMember.workflow_status)}</dd>
                </div>
              </dl>

              {selectedMember.internal_notes ? (
                <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Note interne</p>
                  <p className="mt-2 whitespace-pre-line text-sm text-neutral-700">{selectedMember.internal_notes}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      </section>
    </div>
  );
};

export default SuperAdminMemberDetailPage;
