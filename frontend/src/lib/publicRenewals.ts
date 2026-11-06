import type { MemberMembershipResponse, MemberRenewalResponse } from "./api";

export type PublicRenewalContext = {
  first_name: string;
  last_name: string;
  card_year: number | null;
  valid_through: string | null;
  fee_amount: number;
  currency: string;
  membership: MemberMembershipResponse | null;
  renewal_available?: boolean;
  renewal_opens_on?: string | null;
};

async function errorDetail(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  return typeof payload?.detail === "string" ? payload.detail : fallback;
}

export async function fetchPublicRenewal(slug: string): Promise<PublicRenewalContext | null> {
  const response = await fetch(`/api/join/${encodeURIComponent(slug)}/renewal`);
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(await errorDetail(response, "Rinnovo non disponibile."));
  return response.json();
}

export async function requestPublicRenewalLink(slug: string, email: string): Promise<void> {
  const body = new FormData();
  body.set("email", email.trim());
  const response = await fetch(`/api/join/${encodeURIComponent(slug)}/renewal/request`, { method: "POST", body });
  if (!response.ok) throw new Error(await errorDetail(response, "Impossibile richiedere il link. Riprova tra poco."));
}

export async function confirmPublicRenewal(slug: string): Promise<MemberRenewalResponse> {
  const response = await fetch(`/api/join/${encodeURIComponent(slug)}/renewal/confirm`, { method: "POST" });
  if (!response.ok) throw new Error(await errorDetail(response, "Impossibile richiedere il rinnovo."));
  return response.json();
}
