import { memo } from "react";
import Skeleton from "../../../components/ui/Skeleton";
import { type OrgAdminMember } from "../../../lib/api";

const LIFECYCLE_LABEL: Record<string, string> = {
  ACTIVE: "ATTIVO",
  EXPIRED: "SCADUTO",
  DELETED: "ELIMINATO",
  PENDING: "IN ATTESA",
};

const LIFECYCLE_CHIP: Record<string, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  EXPIRED: "border-red-200 bg-red-50 text-red-700",
  DELETED: "border-slate-300 bg-slate-100 text-slate-700",
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
};

const WORKFLOW_LABEL: Record<string, string> = {
  pending_verification: "Verifica email",
  pending_docs: "Documenti",
  pending_cards: "Tessera",
  rejected: "Rigettato",
  active: "Attivo",
};

const thClass =
  "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400";
const tdClass = "px-5 py-3.5 text-sm text-neutral-700";

type MembersTableProps = {
  error: boolean;
  isLoading: boolean;
  members: OrgAdminMember[];
  totalPages: number;
  page: number;
  onPageChange: (nextPage: number) => void;
  onOpenMember: (memberId: number) => void;
};

const MembersTable = memo(function MembersTable({
  error,
  isLoading,
  members,
  totalPages,
  page,
  onPageChange,
  onOpenMember,
}: MembersTableProps) {
  if (error) {
    return (
      <div className="mt-4 rounded-lg border border-red-200/60 bg-red-50 px-7 py-5 min-h-[120px]">
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
              Si e verificato un errore. Ricarica la pagina per riprovare.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="surface-strong mt-4 overflow-hidden min-h-[360px]"
      data-tour="admin-members-list"
      data-component="orgadmin-members-table"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-neutral-200/60 bg-slate-50/70">
            <tr>
              <th className={thClass}>Nome</th>
              <th className={thClass}>Email</th>
              <th className={thClass}>Stato</th>
              <th className={thClass}>Documenti</th>
              <th className={thClass}>Tessera</th>
              <th className={thClass}>Iscrizione</th>
              <th className={thClass}>
                <span className="sr-only">Azioni</span>
              </th>
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
                  colSpan={7}
                  className="px-5 py-12 text-center text-sm text-neutral-500"
                >
                  Nessun socio corrisponde ai filtri impostati.
                </td>
              </tr>
            ) : (
              members.map((m, i) => {
                const sourceRaw = (m.signup_source ?? "").trim();
                const sourceLower = sourceRaw.toLowerCase();
                const isPienissimoIntegration =
                  sourceLower === "pienissimo" || sourceLower === "pienissimo_api";

                return (
                  <tr
                    key={m.id}
                    className={`transition hover:bg-slate-50/70 ${
                      i % 2 === 1 ? "bg-slate-50/50" : ""
                    }`}
                  >
                    <td className={`${tdClass} font-medium text-neutral-900`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{m.name}</span>
                        {isPienissimoIntegration && (
                          <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-cyan-700">
                            INTEGRAZIONE PIENISSIMO
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={tdClass}>{m.email ?? "-"}</td>
                    <td className={tdClass}>
                      <div className="flex flex-wrap items-center gap-2">
                        {m.status && (
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                              LIFECYCLE_CHIP[m.status] ??
                              "border-neutral-200 bg-neutral-50 text-neutral-600"
                            }`}
                          >
                            {LIFECYCLE_LABEL[m.status] ?? m.status}
                          </span>
                        )}
                        {m.workflow_status && m.workflow_status !== "active" && (
                          <span className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
                            {WORKFLOW_LABEL[m.workflow_status] ?? m.workflow_status}
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
                        "-"
                      )}
                    </td>
                    <td className={`${tdClass} tabular-nums`}>
                      <div className="flex flex-col gap-1">
                        <span>
                          {m.card_number ?? m.card_no ?? "-"}
                          {m.card_year ? ` / ${m.card_year}` : ""}
                        </span>
                        {m.membership_type_label ? (
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                            {m.membership_type_label}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className={`${tdClass} tabular-nums`}>
                      {m.joined_at
                        ? new Date(m.joined_at).toLocaleDateString("it-IT")
                        : "-"}
                    </td>
                    <td className={tdClass}>
                      <div className="flex justify-end">
                        <button
                          className="text-sm font-medium text-brand hover:text-brand-dark"
                          onClick={() => onOpenMember(m.id)}
                          data-testid={`member-open-${m.id}`}
                        >
                          Apri
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-neutral-200/60 px-5 py-4 text-sm text-neutral-600">
          <button
            type="button"
            className="btn-ghost !rounded-md !px-3 !py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            Precedente
          </button>
          <span className="text-xs text-neutral-500">
            Pagina {page} di {totalPages}
          </span>
          <button
            type="button"
            className="btn-ghost !rounded-md !px-3 !py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            Successiva
          </button>
        </div>
      )}
    </div>
  );
});

export default MembersTable;
