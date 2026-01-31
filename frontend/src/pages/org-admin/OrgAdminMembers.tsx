import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchOrgAdminMembers,
  AuthError,
  type OrgAdminMember,
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
  { value: "pending_verification", label: "Verifica email" },
  { value: "pending_docs", label: "Documenti" },
  { value: "pending_cards", label: "Tessera" },
];

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

  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  };

  useEffect(() => {
    if (adminLoading) return;
    if (!admin) return;

    setLoading(true);
    setError(false);

    fetchOrgAdminMembers({
      q: debouncedSearch || undefined,
      status: status || undefined,
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
  }, [admin, adminLoading, debouncedSearch, status, navigate]);

  const isLoading = adminLoading || loading;

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
        )}
      </div>

      {/* Filters */}
      <div className="mt-8 rounded-lg border border-neutral-100 bg-neutral-25 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
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
              placeholder="Cerca per nome o email…"
              value={search}
              onChange={handleSearch}
            />
          </div>
          <select
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 sm:w-44"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {!isLoading && !error && (
            <p className="text-xs text-neutral-400 sm:ml-auto">
              {total === 1 ? "1 socio" : `${total} soci`}
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
              <thead className="border-b border-neutral-100 bg-neutral-25">
                <tr>
                  <th className={thClass}>Nome</th>
                  <th className={thClass}>Email</th>
                  <th className={thClass}>Stato</th>
                  <th className={thClass}>Tessera</th>
                  <th className={thClass}>Iscrizione</th>
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
                        i % 2 === 1 ? "bg-neutral-25" : ""
                      }`}
                    >
                      <td
                        className={`${tdClass} font-medium text-neutral-900`}
                      >
                        {m.name}
                      </td>
                      <td className={tdClass}>{m.email}</td>
                      <td className={tdClass}>
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
                      </td>
                      <td className={`${tdClass} tabular-nums`}>
                        {m.card_no ?? "—"}
                      </td>
                      <td className={`${tdClass} tabular-nums`}>
                        {m.joined_at
                          ? new Date(m.joined_at).toLocaleDateString("it-IT")
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgAdminMembers;
