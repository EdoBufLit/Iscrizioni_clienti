import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchOrgAdminMembers,
  AuthError,
  type OrgAdminMember,
} from "../../lib/api";
import { useOrgAdmin } from "./OrgAdminLayout";
import CreateMemberModal from "./components/CreateMemberModal";
import DebouncedSearchInput from "./components/DebouncedSearchInput";
import MembersTable from "./components/MembersTable";

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

type CreatedMember = {
  id: number;
  first_name: string;
  last_name: string;
  email_sent?: boolean;
};

const OrgAdminMembers = () => {
  const { admin, loading: adminLoading } = useOrgAdmin();
  const navigate = useNavigate();

  const [members, setMembers] = useState<OrgAdminMember[]>([]);
  const [total, setTotal] = useState(0);
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
          created.email_sent ? " Accesso inviato via email." : ""
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
    <div className="container-shell py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Soci</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Elenco soci. Vista predefinita: solo soci attivi.
          </p>
        </div>
        {!adminLoading && admin && (
          <div className="flex flex-wrap items-center gap-2">
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
              Aggiungi socio
            </button>
            <a
              href="/api/org-admin/members.csv"
              className="inline-flex shrink-0 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-subtle transition hover:border-neutral-300 hover:text-neutral-900"
            >
              <svg
                className="h-4 w-4 text-neutral-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Scarica CSV
            </a>
          </div>
        )}
      </div>

      <div className="mt-6 min-h-[58px]">
        {successMessage && (
          <div className="rounded-lg border border-emerald-200/70 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>{successMessage}</p>
              {createdMemberId && (
                <button
                  type="button"
                  className="text-sm font-medium text-emerald-700 hover:text-emerald-900"
                  onClick={() => navigate(`/org-admin/soci/${createdMemberId}`)}
                >
                  Apri scheda
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="surface px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <DebouncedSearchInput
            resetKey={searchResetKey}
            onDebouncedChange={(value) => {
              setDebouncedSearch(value);
              setPage(1);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <select className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20" value={status} onChange={(e) => onFilterChange(setStatus, e.target.value)}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20" value={access} onChange={(e) => onFilterChange(setAccess, e.target.value)}>
              {ACCESS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20" value={source} onChange={(e) => onFilterChange(setSource, e.target.value)}>
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20" value={docs} onChange={(e) => onFilterChange(setDocs, e.target.value)}>
              {DOCS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20" value={order} onChange={(e) => onFilterChange(setOrder, e.target.value)}>
              {ORDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasFilters}
              className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset filtri
            </button>
          </div>
          {!isLoading && !error && (
            <p className="text-xs text-neutral-400">
              {total === 0 ? "0 soci" : `${startIndex}-${endIndex} di ${total}`}
            </p>
          )}
        </div>
      </div>

      <MembersTable
        error={error}
        isLoading={isLoading}
        members={members}
        totalPages={totalPages}
        page={page}
        onPageChange={setPage}
        onOpenMember={handleOpenMember}
      />

      <CreateMemberModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={handleCreated}
      />
    </div>
  );
};

export default OrgAdminMembers;
