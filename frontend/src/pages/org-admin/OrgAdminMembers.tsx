import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchOrgAdminMembers,
  AuthError,
  type OrgAdminMember,
  createOrgAdminMember,
  type CreateOrgAdminMemberInput,
} from "../../lib/api";
import { useOrgAdmin } from "./OrgAdminLayout";
import Skeleton from "../../components/ui/Skeleton";

const STATUS_LABEL: Record<string, string> = {
  pending_verification: "Verifica email",
  pending_docs: "Documenti",
  pending_cards: "Tessera",
  active: "Attivo",
};

const STATUS_CHIP: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending_verification: "border-blue-200 bg-blue-50 text-blue-700",
  pending_docs: "border-amber-200 bg-amber-50 text-amber-700",
  pending_cards: "border-amber-200 bg-amber-50 text-amber-700",
};

const STATUS_OPTIONS = [
  { value: "", label: "Tutti gli stati" },
  { value: "active", label: "Attivo" },
  { value: "pending", label: "In attesa" },
  { value: "suspended", label: "Sospeso" },
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

const thClass =
  "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400";
const tdClass = "px-5 py-3.5 text-sm text-neutral-700";

const OrgAdminMembers = () => {
  const { admin, loading: adminLoading } = useOrgAdmin();
  const navigate = useNavigate();

  const [members, setMembers] = useState<OrgAdminMember[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [access, setAccess] = useState("");
  const [source, setSource] = useState("");
  const [docs, setDocs] = useState("");
  const [order, setOrder] = useState("joined_at_desc");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [createdMemberId, setCreatedMemberId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    fiscal_code: "",
    joined_at: new Date().toISOString().slice(0, 10),
    member_type: "",
    internal_notes: "",
    is_manual: true,
    send_access_email: false,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    setPage(1);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  };

  const resetFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatus("");
    setAccess("");
    setSource("");
    setDocs("");
    setOrder("joined_at_desc");
    setPage(1);
  };

  const loadMembers = () => {
    if (adminLoading || !admin) return Promise.resolve();
    setLoading(true);
    setError(false);
    return fetchOrgAdminMembers({
      q: debouncedSearch || undefined,
      status: status || undefined,
      access: access || undefined,
      source: source || undefined,
      docs: docs || undefined,
      order: order || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    })
      .then((res) => {
        setMembers(res.items);
        setTotal(res.total);
      })
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
        } else {
          setError(true);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMembers();
  }, [admin, adminLoading, debouncedSearch, status, access, source, docs, order, page, navigate]);

  useEffect(() => {
    setPage(1);
  }, [status, access, source, docs, order, debouncedSearch]);

  const isLoading = adminLoading || loading;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startIndex = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(page * PAGE_SIZE, total);
  const hasFilters =
    search ||
    status ||
    access ||
    source ||
    docs ||
    order !== "joined_at_desc";

  const openModal = () => {
    setSubmitError("");
    setSuccessMessage("");
    setCreatedMemberId(null);
    setFormData({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      fiscal_code: "",
      joined_at: new Date().toISOString().slice(0, 10),
      member_type: "",
      internal_notes: "",
      is_manual: true,
      send_access_email: false,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSubmitError("");
  };

  const handleCreateMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    setSuccessMessage("");

    const payload: CreateOrgAdminMemberInput = {
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim(),
      is_manual: formData.is_manual,
      send_access_email: formData.send_access_email,
    };

    if (!payload.first_name || !payload.last_name) {
      setSubmitError("Nome e cognome sono obbligatori.");
      return;
    }

    if (formData.email.trim()) payload.email = formData.email.trim();
    if (formData.phone.trim()) payload.phone = formData.phone.trim();
    if (formData.fiscal_code.trim()) payload.fiscal_code = formData.fiscal_code.trim();
    if (formData.joined_at) payload.joined_at = formData.joined_at;
    if (formData.member_type.trim()) payload.member_type = formData.member_type.trim();
    if (formData.internal_notes.trim()) {
      payload.internal_notes = formData.internal_notes.trim();
    }

    if (payload.send_access_email && !payload.email) {
      setSubmitError("Inserisci un'email valida per inviare l'accesso.");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createOrgAdminMember(payload);
      setShowModal(false);
      setSuccessMessage(
        `Socio ${created.first_name} ${created.last_name} creato con successo.${
          created.email_sent ? " Accesso inviato via email." : ""
        }`
      );
      setCreatedMemberId(created.id);
      await loadMembers();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Errore durante la creazione");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container-shell py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Soci</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Elenco dei soci iscritti all'associazione.
          </p>
        </div>
        {!adminLoading && admin && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openModal}
              className="btn-primary"
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

      {successMessage && (
        <div className="mt-6 rounded-lg border border-emerald-200/70 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
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

      {/* Filters */}
      <div className="mt-8 surface px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 min-w-[220px]">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              className="w-full rounded-md border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 sm:max-w-xs"
              type="search"
              placeholder="Cerca per nome, cognome, email o CF…"
              value={search}
              onChange={handleSearch}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              value={access}
              onChange={(e) => setAccess(e.target.value)}
            >
              {ACCESS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              value={docs}
              onChange={(e) => setDocs(e.target.value)}
            >
              {DOCS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            >
              {ORDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
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

      {/* Table / states */}
      {error ? (
        <div className="mt-4 rounded-lg border border-red-200/60 bg-red-50 px-7 py-5">
          <div className="flex gap-4">
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-red-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-700">
                Impossibile caricare l'elenco dei soci
              </p>
              <p className="mt-1 text-sm leading-6 text-red-600">
                Si è verificato un errore. Ricarica la pagina per riprovare.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="surface mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-white/60 bg-white/40">
                <tr>
                  <th className={thClass}>Nome</th>
                  <th className={thClass}>Email</th>
                  <th className={thClass}>Stato</th>
                  <th className={thClass}>Documenti</th>
                  <th className={thClass}>Tessera</th>
                  <th className={thClass}>Iscrizione</th>
                  <th className={thClass}><span className="sr-only">Azioni</span></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className={tdClass}>
                        <Skeleton className="h-3.5 w-32" />
                      </td>
                      <td className={tdClass}>
                        <Skeleton className="h-3.5 w-40" />
                      </td>
                      <td className={tdClass}>
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </td>
                      <td className={tdClass}>
                        <Skeleton className="h-3.5 w-12" />
                      </td>
                      <td className={tdClass}>
                        <Skeleton className="h-3.5 w-20" />
                      </td>
                    </tr>
                  ))
                ) : members.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-12 text-center text-sm text-neutral-500"
                    >
                      Nessun socio corrisponde ai filtri impostati.
                    </td>
                  </tr>
                ) : (
                  members.map((m, i) => (
                    <tr
                      key={m.id}
                      className={`transition hover:bg-brand/[0.02] ${
                        i % 2 === 1 ? "bg-white/30" : ""
                      }`}
                    >
                      <td
                        className={`${tdClass} font-medium text-neutral-900`}
                      >
                        {m.name}
                      </td>
                      <td className={tdClass}>{m.email ?? "—"}</td>
                      <td className={tdClass}>
                        <div className="flex flex-wrap items-center gap-2">
                          {m.status && (
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                                STATUS_CHIP[m.status] ??
                                "border-neutral-200 bg-neutral-50 text-neutral-600"
                              }`}
                            >
                              {STATUS_LABEL[m.status] ?? m.status}
                            </span>
                          )}
                          {m.is_paid && (
                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                              Pagato
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={tdClass}>
                        {m.docs_count != null ? (
                          <span className="inline-flex items-center rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-800">
                            {m.docs_count}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${tdClass} tabular-nums`}>
                        {m.card_no ?? "—"}
                      </td>
                      <td className={`${tdClass} tabular-nums`}>
                        {m.joined_at
                          ? new Date(m.joined_at).toLocaleDateString("it-IT")
                          : "—"}
                      </td>
                      <td className={tdClass}>
                        <div className="flex justify-end">
                          <button
                            className="text-sm font-medium text-brand hover:text-brand-dark"
                            onClick={() => navigate(`/org-admin/soci/${m.id}`)}
                            data-testid={`member-open-${m.id}`}
                          >
                            Apri
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/60 px-5 py-4 text-sm text-neutral-600">
              <button
                type="button"
                className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
              >
                Precedente
              </button>
              <span className="text-xs text-neutral-500">
                Pagina {page} di {totalPages}
              </span>
              <button
                type="button"
                className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
              >
                Successiva
              </button>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl surface-strong p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-neutral-900">
                  Aggiungi socio
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Inserisci i dati anagrafici del socio e salva l'iscrizione manuale.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100"
                aria-label="Chiudi"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </div>

            {submitError && (
              <div className="mt-4 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}

            <form className="mt-6 grid gap-4" onSubmit={handleCreateMember}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-neutral-600">
                    Nome *
                  </label>
                  <input
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="text"
                    value={formData.first_name}
                    onChange={(e) =>
                      setFormData({ ...formData, first_name: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600">
                    Cognome *
                  </label>
                  <input
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="text"
                    value={formData.last_name}
                    onChange={(e) =>
                      setFormData({ ...formData, last_name: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-neutral-600">
                    Email (opzionale)
                  </label>
                  <input
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        email: e.target.value,
                        send_access_email: e.target.value.trim()
                          ? formData.send_access_email
                          : false,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600">
                    Telefono (opzionale)
                  </label>
                  <input
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-neutral-600">
                    Codice Fiscale (opzionale)
                  </label>
                  <input
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="text"
                    value={formData.fiscal_code}
                    onChange={(e) =>
                      setFormData({ ...formData, fiscal_code: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600">
                    Data iscrizione
                  </label>
                  <input
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="date"
                    value={formData.joined_at}
                    onChange={(e) =>
                      setFormData({ ...formData, joined_at: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  Categoria / Tipo (opzionale)
                </label>
                <input
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  type="text"
                  value={formData.member_type}
                  onChange={(e) =>
                    setFormData({ ...formData, member_type: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  Note interne (solo admin)
                </label>
                <textarea
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  rows={3}
                  value={formData.internal_notes}
                  onChange={(e) =>
                    setFormData({ ...formData, internal_notes: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-brand focus:ring-brand"
                    checked={formData.is_manual}
                    onChange={(e) =>
                      setFormData({ ...formData, is_manual: e.target.checked })
                    }
                  />
                  Iscrizione manuale
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-brand focus:ring-brand"
                    checked={formData.send_access_email}
                    disabled={!formData.email.trim()}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        send_access_email: e.target.checked,
                      })
                    }
                  />
                  Invia accesso via email ora
                </label>
                <p className="text-xs text-neutral-500">
                  L'invio dell'accesso richiede un'email valida e genera un magic link.
                </p>
              </div>

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={closeModal}
                  disabled={isSubmitting}
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Salvataggio..." : "Crea socio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgAdminMembers;
