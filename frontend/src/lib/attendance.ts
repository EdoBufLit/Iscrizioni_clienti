import { AuthError, type OrgAdminAttendance } from "./api";

export type AttendanceMemberOption = {
  id: number;
  name: string;
  email: string | null;
  card_no: number | null;
  card_year: number | null;
  membership_type: "annual" | "temporary";
  is_active: boolean;
  already_checked_in: boolean;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/org-admin/attendances${path}`, options);
  if (response.status === 401) throw new AuthError("La sessione è scaduta. Accedi nuovamente.");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.detail === "string" ? payload.detail : "Operazione non riuscita. Riprova.");
  }
  return payload;
}

export function searchAttendanceMembers(query: string, signal?: AbortSignal) {
  return request<{ items: AttendanceMemberOption[]; total: number }>(
    `/members?${new URLSearchParams({ q: query.trim() })}`, { signal },
  );
}

export function checkInAttendanceMember(memberId: number) {
  return request<{ created: boolean; item: OrgAdminAttendance }>("/manual-check-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ member_id: memberId }),
  });
}
