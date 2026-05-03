import { memo } from "react";
import Skeleton from "../../../components/ui/Skeleton";
import { type OrgAdminMember } from "../../../lib/api";
import {
  EMPTY_STATE_COPY,
  memberLifecycleStatusMeta,
  memberWorkflowStatusMeta,
  resolveStatusMeta,
} from "../../../lib/statusLabels";

const thClass =
  "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400";
const tdClass = "px-5 py-3.5 text-sm text-neutral-700";

type MembersTableProps = {
  error: boolean;
  isLoading: boolean;
  members: OrgAdminMember[];
  totalPages: number;
  page: number;
  selectedMemberId?: number | null;
  onPageChange: (nextPage: number) => void;
  onSelectMember?: (memberId: number) => void;
  onOpenMember: (memberId: number) => void;
};

const MembersTable = memo(function MembersTable({
  error,
  isLoading,
  members,
  totalPages,
  page,
  selectedMemberId,
  onPageChange,
  onSelectMember,
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
              Si ? verificato un errore. Ricarica la pagina per riprovare.
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
      <div className="hidden overflow-x-auto md:block">
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
                  {EMPTY_STATE_COPY.filteredResults.title}. {EMPTY_STATE_COPY.filteredResults.description}
                </td>
              </tr>
            ) : (
              members.map((m, i) => {
                const sourceRaw = (m.signup_source ?? "").trim();
                const sourceLower = sourceRaw.toLowerCase();
                const isPienissimoIntegration =
                  sourceLower === "pienissimo" || sourceLower === "pienissimo_api";
                const isSelected = selectedMemberId === m.id;
                const lifecycleMeta = resolveStatusMeta(memberLifecycleStatusMeta, m.status);
                const workflowMeta = resolveStatusMeta(memberWorkflowStatusMeta, m.workflow_status);

                return (
                  <tr
                    key={m.id}
                    onClick={() => onSelectMember?.(m.id)}
                    className={`cursor-pointer transition hover:bg-slate-50/70 ${
                      isSelected ? "bg-emerald-50/70 ring-1 ring-inset ring-emerald-200" : i % 2 === 1 ? "bg-slate-50/50" : ""
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
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${lifecycleMeta.tone}`}
                          >
                            {lifecycleMeta.label}
                          </span>
                        )}
                        {m.workflow_status && m.workflow_status !== "active" && (
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${workflowMeta.tone}`}>
                            {workflowMeta.label}
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
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenMember(m.id);
                          }}
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
      <div className="divide-y divide-neutral-200/70 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="p-4">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="mt-3 h-3.5 w-48" />
              <Skeleton className="mt-4 h-16 w-full rounded-xl" />
            </div>
          ))
        ) : members.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-semibold text-neutral-800">{EMPTY_STATE_COPY.filteredResults.title}</p>
            <p className="mt-1 text-sm text-neutral-500">{EMPTY_STATE_COPY.filteredResults.description}</p>
          </div>
        ) : (
          members.map((member) => {
            const lifecycleMeta = resolveStatusMeta(memberLifecycleStatusMeta, member.status);
            const workflowMeta = resolveStatusMeta(memberWorkflowStatusMeta, member.workflow_status);
            const isSelected = selectedMemberId === member.id;
            return (
              <article
                key={member.id}
                className={`p-4 ${isSelected ? "bg-emerald-50/70" : "bg-white/40"}`}
                onClick={() => onSelectMember?.(member.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-neutral-900">{member.name}</h3>
                    <p className="mt-1 truncate text-xs text-neutral-500">{member.email ?? "Email non indicata"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${lifecycleMeta.tone}`}>
                    {lifecycleMeta.label}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="font-semibold uppercase tracking-[0.12em] text-neutral-400">Documenti</dt>
                    <dd className="mt-1 text-neutral-800">{member.docs_count ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-[0.12em] text-neutral-400">Tessera</dt>
                    <dd className="mt-1 text-neutral-800">
                      {member.card_number ?? member.card_no ?? "-"}{member.card_year ? ` / ${member.card_year}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-[0.12em] text-neutral-400">Iscrizione</dt>
                    <dd className="mt-1 text-neutral-800">
                      {member.joined_at ? new Date(member.joined_at).toLocaleDateString("it-IT") : "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-[0.12em] text-neutral-400">Avanzamento</dt>
                    <dd className="mt-1 text-neutral-800">
                      {member.workflow_status && member.workflow_status !== "active" ? workflowMeta.label : "Completo"}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="mt-4 w-full rounded-lg border border-brand/20 px-3 py-2 text-sm font-semibold text-brand"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenMember(member.id);
                  }}
                >
                  Apri profilo socio
                </button>
              </article>
            );
          })
        )}
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
