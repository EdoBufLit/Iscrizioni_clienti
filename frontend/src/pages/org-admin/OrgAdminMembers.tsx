import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchOrgAdminMembers,
  fetchOrgAdminMetrics,
  fetchOrgAdminMembershipSettings,
  AuthError,
  type OrgAdminMember,
  type OrgAdminMetrics,
  type OrgAdminMembershipSettings,
} from "../../lib/api";
import { useOrgAdmin } from "./OrgAdminLayout";
import CreateMemberModal from "./components/CreateMemberModal";
import DebouncedSearchInput from "./components/DebouncedSearchInput";
import MembersTable from "./components/MembersTable";
import { DetailPanel, EmptyState, KpiCard, PageHeader, SectionPanel, StatusChip } from "./components/OrgAdminPrimitives";

const STATUS_OPTIONS = [
  { value: "active", label: "Mostra: Attivi" },
  { value: "all", label: "Mostra: Tutti" },
  { value: "expired", label: "Mostra: Scaduti" },
  { value: "deleted", label: "Mostra: Eliminati" },
];

const ACCESS_OPTIONS = [
  { value: "", label: "Accesso (tutti)" },
  { value: "with", label: "Con accesso" },
  { value: "without", label: "Senza accesso" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "Iscrizione (tutte)" },
  { value: "manual", label: "Manuale" },
  { value: "online", label: "Online" },
];

const DOCS_OPTIONS = [
  { value: "", label: "Documenti (tutti)" },
  { value: "pending", label: "Documenti pending" },
  { value: "rejected", label: "Documenti rigettati" },
  { value: "approved", label: "Documenti approvati" },
];

const ORDER_OPTIONS = [
  { value: "joined_at_desc", label: "Data iscrizione (recenti)" },
  { value: "joined_at_asc", label: "Data iscrizione (meno recenti)" },
  { value: "last_name_asc", label: "Cognome (A-Z)" },
  { value: "last_name_desc", label: "Cognome (Z-A)" },
  { value: "status_asc", label: "Stato (A-Z)" },
  { value: "status_desc", label: "Stato (Z-A)" },
];

const PAGE_SIZE = 25;

function memberInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "S";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("it-IT");
}

function workflowTone(member: OrgAdminMember): "success" | "warning" | "danger" | "muted" {
  const status = (member.status || "").toUpperCase();
  if (status === "EXPIRED" || member.workflow_status === "rejected") return "danger";
  if (status === "PENDING" || member.workflow_status?.startsWith("pending")) return "warning";
  if (status === "ACTIVE" || member.workflow_status === "active") return "success";
  return "muted";
}

type CreatedMember = {
  id: number;
  first_name: string;
  last_name: string;
  email_sent?: boolean;
  email_status?: string;
};

const OrgAdminMembers = () => {
  const { admin, loading: adminLoading } = useOrgAdmin();
  const navigate = useNavigate();

  const [members, setMembers] = useState<OrgAdminMember[]>([]);
  const [total, setTotal] = useState(0);
  const [metrics, setMetrics] = useState<OrgAdminMetrics | null>(null);
  const [membershipSettings, setMembershipSettings] = useState<OrgAdminMembershipSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [access, setAccess] = useState("");
  const [source, setSource] = useState("");
  const [docs, setDocs] = useState("");
  const [order, setOrder] = useState("joined_at_desc");
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [searchResetKey, setSearchResetKey] = useState(0);
  const [successMessage, setSuccessMessage] = useState("");
  const [createdMemberId, setCreatedMemberId] = useState<number | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);

  const loadMembershipSettings = useCallback(async () => {
    if (adminLoading || !admin) return;
    try {
      const settings = await fetchOrgAdminMembershipSettings();
      setMembershipSettings(settings);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
      }
    }
  }, [adminLoading, admin, navigate]);

  const loadMetrics = useCallback(async () => {
    if (adminLoading || !admin) return;
    try {
      setMetrics(await fetchOrgAdminMetrics());
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
      }
    }
  }, [adminLoading, admin, navigate]);

  const loadMembers = useCallback(async () => {
    if (adminLoading || !admin) {
      return;
    }

    setLoading(true);
    setError(false);

    try {
      const response = await fetchOrgAdminMembers({
        q: debouncedSearch || undefined,
        status: status || undefined,
        access: access || undefined,
        source: source || undefined,
        docs: docs || undefined,
        order: order || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setMembers(response.items);
      setTotal(response.total);
      setSelectedMemberId((current) => {
        if (current && response.items.some((member) => member.id === current)) return current;
        return response.items[0]?.id ?? null;
      });
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [adminLoading, admin, debouncedSearch, status, access, source, docs, order, page, navigate]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    void loadMembershipSettings();
  }, [loadMembershipSettings]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const isLoading = adminLoading || loading;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startIndex = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(page * PAGE_SIZE, total);
  const hasFilters =
    Boolean(debouncedSearch) ||
    status !== "active" ||
    Boolean(access) ||
    Boolean(source) ||
    Boolean(docs) ||
    order !== "joined_at_desc";
  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) || members[0] || null,
    [members, selectedMemberId],
  );
  const expiringSoonCount = useMemo(() => {
    const now = new Date();
    const limit = new Date(now);
    limit.setDate(limit.getDate() + 30);
    return members.filter((member) => {
      if (!member.valid_until) return false;
      const validUntil = new Date(member.valid_until);
      return validUntil >= now && validUntil <= limit;
    }).length;
  }, [members]);
  const missingDocumentsCount = metrics?.documents_pending_review ?? members.filter((member) => (member.docs_count ?? 0) === 0).length;
  const activeMembersCount = metrics?.active_members_count ?? total;

  const onFilterChange = useCallback((setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setDebouncedSearch("");
    setStatus("active");
    setAccess("");
    setSource("");
    setDocs("");
    setOrder("joined_at_desc");
    setPage(1);
    setSearchResetKey((prev) => prev + 1);
  }, []);

  const handleCreated = useCallback(
    async (created: CreatedMember) => {
      setShowModal(false);
      setSuccessMessage(
        `Socio ${created.first_name} ${created.last_name} creato con successo.${
          created.email_status === "queued"
            ? " Accesso accodato."
            : created.email_sent
              ? " Accesso inviato via email."
              : ""
        }`
      );
      setCreatedMemberId(created.id);
      await loadMembers();
    },
    [loadMembers]
  );

  const handleOpenMember = useCallback(
    (memberId: number) => {
      navigate(`/org-admin/soci/${memberId}`);
    },
    [navigate]
  );

  return (
    <div className="container-shell py-10 space-y-6">
      <PageHeader
        eyebrow="Soci e tessere"
        title="Soci"
        subtitle="Gestisci i soci, le tessere e la documentazione associativa."
        actions={
          !adminLoading && admin ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSuccessMessage("");
                setCreatedMemberId(null);
                setShowModal(true);
              }}
              className="btn-primary"
              data-tour="admin-add-member"
            >
              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Aggiungi socio
            </button>
            <a
              href="/api/org-admin/members.csv"
              className="btn-ghost !px-4 !py-2 text-xs font-bold uppercase tracking-widest flex items-center gap-2"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export CSV
            </a>
          </div>
          ) : null
        }
      />

      {successMessage && (
        <div className="rounded-xl border border-emerald-200/50 bg-emerald-50/50 p-5 flex items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-sm font-bold text-emerald-900">{successMessage}</p>
          </div>
          {createdMemberId && (
            <button
              type="button"
              className="text-xs font-bold uppercase tracking-widest text-emerald-700 hover:text-emerald-900 transition-colors"
              onClick={() => navigate(`/org-admin/soci/${createdMemberId}`)}
            >
              Vedi profilo
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Soci attivi" value={activeMembersCount} hint="+3% questo mese" tone="success" />
        <KpiCard label="Da approvare" value={metrics?.pending_requests_count ?? 0} hint="Richieste in verifica" tone="warning" />
        <KpiCard label="Documenti mancanti" value={missingDocumentsCount} hint="Da completare o rivedere" tone={missingDocumentsCount ? "danger" : "muted"} />
        <KpiCard label="Rinnovi in scadenza" value={expiringSoonCount} hint="Nei prossimi 30 giorni" tone="info" />
      </div>

      <SectionPanel className="p-4">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center">
          <div className="flex-1 min-w-0">
            <DebouncedSearchInput
              resetKey={searchResetKey}
              onDebouncedChange={(value) => {
                setDebouncedSearch(value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select className="premium-select min-w-[140px] flex-1 sm:flex-none" value={status} onChange={(e) => onFilterChange(setStatus, e.target.value)}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select className="premium-select min-w-[140px] flex-1 sm:flex-none" value={access} onChange={(e) => onFilterChange(setAccess, e.target.value)}>
              {ACCESS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select className="premium-select min-w-[140px] flex-1 sm:flex-none" value={source} onChange={(e) => onFilterChange(setSource, e.target.value)}>
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select className="premium-select min-w-[140px] flex-1 sm:flex-none" value={docs} onChange={(e) => onFilterChange(setDocs, e.target.value)}>
              {DOCS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select className="premium-select min-w-[140px] flex-1 sm:flex-none" value={order} onChange={(e) => onFilterChange(setOrder, e.target.value)}>
              {ORDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasFilters}
              className="btn-ghost !px-4 !py-2 !text-xs font-bold uppercase tracking-widest disabled:opacity-30 flex-1 sm:flex-none"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="mt-4 px-3 pb-1 flex items-center justify-between border-t border-neutral-100/50 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            {total === 0 ? "Nessun risultato" : `${startIndex}-${endIndex} di ${total} soci`}
          </p>
          <div className="flex gap-1.5">
            {hasFilters && (
              <span className="inline-flex items-center rounded-full bg-brand/5 px-2 py-0.5 text-[10px] font-bold text-brand uppercase tracking-tighter ring-1 ring-inset ring-brand/10">
                Filtri attivi
              </span>
            )}
          </div>
        </div>
      </SectionPanel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <MembersTable
          error={error}
          isLoading={isLoading}
          members={members}
          totalPages={totalPages}
          page={page}
          selectedMemberId={selectedMember?.id ?? null}
          onPageChange={setPage}
          onSelectMember={setSelectedMemberId}
          onOpenMember={handleOpenMember}
        />
        <MemberSidePanel member={selectedMember} onOpenMember={handleOpenMember} />
      </div>

      <CreateMemberModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={handleCreated}
        membershipSettings={membershipSettings}
      />
    </div>
  );
};

function MemberSidePanel({
  member,
  onOpenMember,
}: {
  member: OrgAdminMember | null;
  onOpenMember: (memberId: number) => void;
}) {
  if (!member) {
    return (
      <DetailPanel title="Dettaglio socio" eyebrow="Master detail">
        <EmptyState title="Nessun socio selezionato" description="Seleziona una riga per vedere tessera, stato e attivita recente." />
      </DetailPanel>
    );
  }

  return (
    <DetailPanel title="Dettaglio socio" eyebrow="Profilo rapido">
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-brand">
            {memberInitials(member.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-slate-950">{member.name}</p>
            <div className="mt-1">
              <StatusChip tone={workflowTone(member)}>{member.workflow_status || member.status || "Sconosciuto"}</StatusChip>
            </div>
          </div>
        </div>

        <div className="space-y-2 text-sm text-slate-600">
          <p>{member.email || "Email non disponibile"}</p>
          <p>Iscritto il {formatDate(member.joined_at)}</p>
          <p>{member.has_access ? "Accesso area socio attivo" : "Accesso area socio non attivo"}</p>
        </div>

        <div className="rounded-[0.85rem] border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-4">
            <div className="grid h-20 w-20 shrink-0 grid-cols-4 gap-1 rounded-[0.65rem] border border-slate-200 bg-slate-50 p-2">
              {Array.from({ length: 16 }).map((_, index) => (
                <span key={index} className={index % 3 === 0 || index % 5 === 0 ? "bg-slate-900" : "bg-white"} />
              ))}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-950">{member.card_number ?? member.card_no ?? "Tessera non assegnata"}</p>
                <StatusChip tone={member.card_number || member.card_no ? "success" : "warning"}>
                  {member.card_number || member.card_no ? "Attiva" : "Da assegnare"}
                </StatusChip>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {member.membership_type_label || "Tipo tessera non definito"}
                {member.valid_until ? ` - Scadenza ${formatDate(member.valid_until)}` : ""}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[0.85rem] border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Attivita recente</p>
          <div className="mt-3 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-slate-600">Documenti caricati</span>
              <span className="font-semibold text-slate-900">{member.docs_count ?? 0}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-600">Pagamento quota</span>
              <span className="font-semibold text-slate-900">{member.is_paid ? "Registrato" : "Da verificare"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-600">Origine</span>
              <span className="font-semibold text-slate-900">{member.signup_source || (member.is_manual ? "Manuale" : "Online")}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <button type="button" className="btn-primary w-full justify-center" onClick={() => onOpenMember(member.id)}>
            Vedi profilo completo
          </button>
          <a className="btn-secondary w-full justify-center" href="/api/org-admin/members.csv">
            Esporta elenco
          </a>
        </div>
      </div>
    </DetailPanel>
  );
}

export default OrgAdminMembers;

