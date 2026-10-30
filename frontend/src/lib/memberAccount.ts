import type { MemberProfile } from "./api";

/** Workflow may remain active after the card expires; use the card lifecycle too. */
export function memberAccountStatus(member: MemberProfile): string {
  if (member.status !== "active") return member.status;
  const expiry = member.card?.valid_until ?? member.valid_until;
  if (expiry) {
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(expiry) ? expiry : `${expiry}${expiry.length === 10 ? "T00:00:00" : ""}Z`;
    const end = Date.parse(normalized);
    if (Number.isFinite(end) && end <= Date.now()) return "expired";
  }
  const cardStatus = String(member.card?.status ?? member.card_status ?? "").toLowerCase();
  return cardStatus && !["active", "attiva"].includes(cardStatus) ? "inactive" : member.status;
}

export function memberNotificationHref(href: string | null | undefined): string {
  return href && /^\/dashboard(?:[/?#]|$)/.test(href) ? href : "/dashboard";
}
