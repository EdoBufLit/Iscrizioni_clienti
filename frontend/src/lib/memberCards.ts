import { apiFetch, AuthError, type MemberProfile } from "./api";

export type MemberCardItem = MemberProfile & { can_select: boolean };
export type MemberCardsResponse = {
  account: { id: number; email: string | null } | null;
  selected_member_id: number | null;
  items: MemberCardItem[];
};

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) throw new AuthError("Sessione scaduta. Accedi nuovamente.");
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(typeof payload?.detail === "string" ? payload.detail : "Operazione non riuscita. Riprova.");
  }
  return response.json();
}

export async function fetchMemberCards(): Promise<MemberCardsResponse> {
  return readResponse(await apiFetch("/api/member/cards", { cache: "no-store" }));
}

export async function selectMemberCard(memberId: number): Promise<void> {
  await readResponse(await apiFetch(`/api/member/cards/${memberId}/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }));
}

export async function linkMemberCard(input: { org_slug: string; card_number: string; password: string }): Promise<void> {
  await readResponse(await apiFetch("/api/member/cards/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

/** Recreate every club-specific view after changing the server session. */
export function openSelectedMemberCard(): void {
  window.location.assign("/dashboard");
}
