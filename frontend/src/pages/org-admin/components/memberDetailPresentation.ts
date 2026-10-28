import type { OrgAdminMemberDetail } from "../../../lib/api";
import { memberLifecycleStatusMeta, memberWorkflowStatusMeta, type StatusMeta } from "../../../lib/statusLabels";

const neutral = "border-neutral-200 bg-neutral-100 text-neutral-600";
const warning = "border-amber-200 bg-amber-50 text-amber-700";
const success = "border-emerald-200 bg-emerald-50 text-emerald-700";
const danger = "border-red-200 bg-red-50 text-red-700";

export function displayMemberName(first: string, last: string) {
  return [first, last].map(value => {
    const trimmed = value.trim();
    // Preserve intentional mixed case; format imported all-lower/all-upper names for display only.
    return trimmed === trimmed.toLocaleLowerCase("it-IT") || trimmed === trimmed.toLocaleUpperCase("it-IT")
      ? trimmed.toLocaleLowerCase("it-IT").replace(/(^|[\s'’-])(\p{L})/gu, (_, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase("it-IT"))
      : trimmed;
  }).filter(Boolean).join(" ");
}

export function lifecycleMeta(status: string): StatusMeta {
  return memberLifecycleStatusMeta[status.toLowerCase()] ?? { label: "Da verificare", tone: warning };
}

export function workflowMeta(status?: string | null): StatusMeta {
  return memberWorkflowStatusMeta[status?.toLowerCase() ?? ""] ?? { label: "Da verificare", tone: warning };
}

export function documentMeta(status: string): StatusMeta {
  return ({
    not_provided: { label: "Da caricare", tone: warning },
    pending: { label: "In revisione", tone: warning },
    uploaded: { label: "In revisione", tone: warning },
    approved: { label: "Approvati", tone: success },
    rejected: { label: "Da correggere", tone: danger },
  } as Record<string, StatusMeta>)[status.toLowerCase()] ?? { label: "Da verificare", tone: warning };
}

export function paymentMeta(member: OrgAdminMemberDetail): StatusMeta {
  if (member.payment_status === "manual_partial") return { label: "Parzialmente pagata", tone: warning };
  if (member.payment_status === "manual_reversed") return { label: "Incasso stornato", tone: danger };
  if (member.card_is_paid || ["completed", "manual_completed"].includes(member.payment_status ?? "")) return { label: "Pagata", tone: success };
  if (member.payment_required || (member.membership_fee_snapshot ?? 0) > 0) return { label: "In attesa", tone: warning };
  return member.membership_fee_snapshot === 0 ? { label: "Non richiesta", tone: neutral } : { label: "Da verificare", tone: neutral };
}

export function paymentHistoryLabel(status: string) {
  return ({ completed: "Pagato", manual_completed: "Pagato", manual_partial: "Parzialmente pagato", manual_reversed: "Stornato", pending: "In attesa", checkout_pending: "In attesa", failed: "Non riuscito", cancelled: "Annullato", expired: "Scaduto", unpaid: "Da pagare", paid: "Pagato", not_required: "Non richiesto" } as Record<string, string>)[status.toLowerCase()] ?? "Da verificare";
}

export function paymentMethodLabel(method?: string | null) {
  return ({ cash: "Contanti", contanti: "Contanti", bonifico: "Bonifico", bank_transfer: "Bonifico", sumup: "SumUp", other: "Altro", altro: "Altro" } as Record<string, string>)[method?.toLowerCase() ?? ""] ?? "Non indicato";
}

export function formatMemberDate(value?: string | null, withTime = false) {
  if (!value) return "Non indicata";
  const normalized = value.length === 10 ? `${value}T12:00:00Z`
    : /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "Non indicata";
  return withTime ? date.toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : date.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
}
