import { memo } from "react";
import Skeleton from "../../../components/ui/Skeleton";
import { type OrgAdminMember } from "../../../lib/api";
import { formatMemberDate } from "../../../lib/memberDates";
import {
  EMPTY_STATE_COPY,
  memberLifecycleStatusMeta,
  memberWorkflowStatusMeta,
  resolveStatusMeta,
} from "../../../lib/statusLabels";

const thClass =
  "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400";
const tdClass = "px-3 py-2.5 text-sm text-neutral-700";

type MembersTableProps = {
  error: boolean;
  isLoading: boolean;
  members: OrgAdminMember[];
  totalPages: number;
  page: number;
  statusFilter?: string;
  selectedMemberId?: number | null;
  onPageChange: (nextPage: number) => void;
  onSelectMember?: (memberId: number) => void;
  onOpenMember: (memberId: number) => void;
  checkedMemberIds?: ReadonlySet<number>;
  onToggleMember?: (memberId: number) => void;
  onTogglePage?: () => void;
  mobileSelectionMode?: boolean;
};

const MembersTable = memo(function MembersTable({
  error,
  isLoading,
  members,
  totalPages,
  page,
  statusFilter = "active",
  selectedMemberId,
  onPageChange,
  onSelectMember,
  onOpenMember,
  checkedMemberIds,
  onToggleMember,
  onTogglePage,
  mobileSelectionMode = false,
}: MembersTableProps) {
  const checkedOnPage = members.filter((member) => checkedMemberIds?.has(member.id)).length;
  const allPageChecked = members.length > 0 && checkedOnPage === members.length;
  const showMobileCheckboxes = Boolean(
    onToggleMember && (mobileSelectionMode || (checkedMemberIds && checkedMemberIds.size > 0)),
  );
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
              Si è verificato un errore. Ricarica la pagina per riprovare.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="org-admin-members-table surface-strong mt-0 min-w-0 overflow-hidden md:min-h-[360px]"
      data-tour="admin-members-list"
      data-component="orgadmin-members-table"
    >
      <div className="org-admin-members-table__scroll hidden overflow-x-auto md:block">
        <table className="org-admin-members-table__data w-full text-left">
          <thead className="border-b border-neutral-200/60 bg-slate-50/70">
            <tr>
              {onToggleMember && (
                <th className="w-12 px-2 py-0">
                  <label className="inline-flex min-h-10 min-w-10 items-center justify-center">
                    <input
                      type="checkbox"
                      aria-label="Seleziona tutti i soci della pagina"
                      checked={allPageChecked}
                      ref={(input) => { if (input) input.indeterminate = checkedOnPage > 0 && !allPageChecked; }}
                      disabled={isLoading || members.length === 0}
                      onChange={onTogglePage}
                      className="h-4 w-4 accent-[var(--theme-brand)]"
                    />
                  </label>
                </th>
              )}
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
                  {onToggleMember && <td className="px-3 py-2"><Skeleton className="h-4 w-4" /></td>}
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
                  colSpan={onToggleMember ? 8 : 7}
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
                    data-member-id={m.id}
                    data-testid={`member-row-${m.id}`}
                    tabIndex={onSelectMember ? 0 : undefined}
                    aria-label={onSelectMember ? `Mostra profilo rapido di ${m.name}` : undefined}
                    aria-selected={onSelectMember ? isSelected : undefined}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("button, a, input, label, select, textarea")) return;
                      onSelectMember?.(m.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget || !onSelectMember) return;
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      onSelectMember(m.id);
                    }}
                    className={`org-admin-members-table__row transition hover:bg-slate-50/70 ${onSelectMember ? "cursor-pointer" : ""} ${
                      isSelected ? "bg-emerald-50/70 ring-1 ring-inset ring-emerald-200" : i % 2 === 1 ? "bg-slate-50/50" : ""
                    }`}
                  >
                    {onToggleMember && (
                      <td className="px-2 py-0" onClick={(event) => event.stopPropagation()}>
                        <label className="inline-flex min-h-10 min-w-10 items-center justify-center">
                          <input
                            type="checkbox"
                            aria-label={`Seleziona ${m.name}`}
                            checked={checkedMemberIds?.has(m.id) ?? false}
                            onChange={() => onToggleMember(m.id)}
                            className="h-4 w-4 accent-[var(--theme-brand)]"
                          />
                        </label>
                      </td>
                    )}
                    <td className={`${tdClass} font-medium text-neutral-900`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{m.name}</span>
                        {m.search_match === "similar" && (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                            Corrispondenza simile
                          </span>
                        )}
                        {isPienissimoIntegration && (
                          <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-cyan-700">
                            INTEGRAZIONE PIENISSIMO
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`${tdClass} org-admin-members-table__email break-words`}>{m.email ?? "-"}</td>
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
                        <span className="org-admin-members-table__card-number">
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
                    <td className={`${tdClass} whitespace-nowrap tabular-nums`}>
                      {formatMemberDate(m.joined_at)}
                    </td>
                    <td className={tdClass}>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          aria-label={`Apri profilo completo di ${m.name}`}
                          className="inline-flex min-h-10 items-center text-sm font-medium text-brand hover:text-brand-dark"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenMember(m.id);
                          }}
                          data-testid={`member-open-${m.id}`}
                        >
                          Profilo
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
          Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="mt-2 h-3.5 w-48" />
            </div>
          ))
        ) : members.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-semibold text-neutral-800">{EMPTY_STATE_COPY.filteredResults.title}</p>
            <p className="mt-1 text-sm text-neutral-500">{EMPTY_STATE_COPY.filteredResults.description}</p>
          </div>
        ) : (
          members.map((member) => {
            const lifecycleMeta = resolveStatusMeta(memberLifecycleStatusMeta, member.status);
            const workflowMeta = resolveStatusMeta(memberWorkflowStatusMeta, member.workflow_status);
            const isSelected = selectedMemberId === member.id;
            const cardNo = member.card_number ?? member.card_no;
            const hasPendingWorkflow = Boolean(member.workflow_status && member.workflow_status !== "active");
            const badgeMeta =
              String(member.status || "").toLowerCase() === "pending" && hasPendingWorkflow
                ? { label: "In verifica", tone: workflowMeta.tone }
                : lifecycleMeta;

            let docAttentionLabel: string | null = null;
            let docAttentionTone = "border-amber-200 bg-amber-50 text-amber-800";
            if (member.document_status === "rejected") {
              docAttentionLabel = "Doc rigettati";
              docAttentionTone = "border-rose-200 bg-rose-50 text-rose-700";
            } else if (member.document_status === "pending") {
              docAttentionLabel = "Doc in verifica";
            } else if (member.workflow_status === "pending_docs") {
              docAttentionLabel = "Doc da completare";
            }

            const isStandardActive =
              String(member.status || "").toUpperCase() === "ACTIVE" && !hasPendingWorkflow;
            const showStatusBadge = !isStandardActive || statusFilter === "all";
            const topPill = docAttentionLabel
              ? { label: docAttentionLabel, tone: docAttentionTone }
              : showStatusBadge
                ? badgeMeta
                : null;

            return (
              <article
                key={member.id}
                className={`org-admin-member-mobile-row flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors ${
                  isSelected ? "bg-[var(--theme-surface-muted)]" : "bg-[var(--theme-surface-solid)]"
                }`}
                data-testid={`member-mobile-row-${member.id}`}
              >
                {showMobileCheckboxes && onToggleMember && (
                  <label
                    className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Seleziona ${member.name}`}
                      checked={checkedMemberIds?.has(member.id) ?? false}
                      onChange={() => onToggleMember(member.id)}
                      className="h-4 w-4 accent-[var(--theme-brand)]"
                    />
                  </label>
                )}
                <a
                  className="flex min-h-10 min-w-0 flex-1 items-center justify-between gap-2.5 rounded-sm"
                  href={`/org-admin/soci/${member.id}`}
                  aria-label={`Apri profilo di ${member.name}`}
                  onClick={(event) => {
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    onSelectMember?.(member.id);
                    onOpenMember(member.id);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold text-neutral-900">{member.name}</h3>
                      {topPill ? (
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight ${topPill.tone}`}>
                          {topPill.label}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-neutral-500">
                      <span className="shrink-0 font-medium text-neutral-700 tabular-nums">
                        {cardNo != null ? `#${cardNo}` : "Senza tessera"}
                      </span>
                      {member.email ? (
                        <>
                          <span aria-hidden="true" className="shrink-0">·</span>
                          <span className="min-w-0 flex-1 truncate">{member.email}</span>
                        </>
                      ) : null}
                      {member.search_match === "similar" && (
                        <span className="inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold leading-tight text-amber-800">
                          Corrispondenza simile
                        </span>
                      )}
                    </div>
                  </div>
                  <svg
                    className="h-4 w-4 shrink-0 text-neutral-400"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m7.5 5 5 5-5 5" />
                  </svg>
                </a>
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
