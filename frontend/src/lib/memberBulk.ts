import { AuthError } from "./api";
import type { MemberSelection } from "../hooks/useMemberSelection";

export type BulkAction = "export" | "send_access" | "quote_reminder";
export type BulkItem = {
  member_id: number | null; name: string; status: "pending" | "succeeded" | "skipped" | "failed";
  reason_code: string | null; detail: string | null; attempts: number; delivery_status: string | null;
  amount_cents?: number | null; currency?: string;
};
export type BulkRun = {
  id: string; action: BulkAction; action_label: string; membership_year: number | null;
  selection_mode: "ids" | "filtered"; status: "preview" | "running" | "completed" | "expired";
  selected_count: number; eligible_count: number;
  counts: { pending: number; succeeded: number; skipped: number; failed: number };
  reason_counts: Record<string, number>; created_at: string; expires_at: string;
  started_at: string | null; completed_at: string | null;
  items: BulkItem[]; offset: number; limit: number; total: number; has_more: boolean;
  can_execute: boolean; can_retry_failed: boolean; can_download: boolean;
  outstanding_total_cents?: number | null; currency?: string;
};
export type RecentBulkRun = Pick<BulkRun, "id" | "action" | "action_label" | "status" | "created_at" | "selected_count" | "counts">;

const base = "/api/org-admin/member-bulk";
export function bulkRequestKey() {
  return globalThis.crypto?.randomUUID?.() ?? `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function checkedResponse(url: string, options: RequestInit) {
  const response = await fetch(url, { ...options, credentials: "include" });
  if (response.status === 401) throw new AuthError("La sessione è scaduta. Accedi nuovamente.");
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const detail = data.detail;
    const message = typeof detail === "string" ? detail
      : Array.isArray(detail) ? detail.map((item: { msg?: string }) => item.msg || "Dato non valido").join("; ")
      : "Operazione non riuscita. Riprova.";
    throw new Error(message);
  }
  return response;
}

const post = async (path: string, body: object): Promise<BulkRun> => (await checkedResponse(`${base}${path}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
})).json();

export const previewMemberBulk = (body: { request_key: string; action: BulkAction; selection: MemberSelection; membership_year?: number }) => post("/preview", body);
export const fetchMemberBulk = async (id: string, offset = 0): Promise<BulkRun> =>
  (await checkedResponse(`${base}/${encodeURIComponent(id)}?offset=${offset}&limit=50`, {})).json();
export const fetchRecentMemberBulk = async (offset = 0): Promise<{ items: RecentBulkRun[]; total: number }> =>
  (await checkedResponse(`${base}?offset=${offset}&limit=10`, {})).json();
export const executeMemberBulk = (id: string, requestKey: string) => post(`/${encodeURIComponent(id)}/execute`, { request_key: requestKey });
export const retryMemberBulk = (id: string, requestKey: string) => post(`/${encodeURIComponent(id)}/retry-failed`, { request_key: requestKey });
export async function downloadMemberBulk(id: string) {
  const response = await checkedResponse(`${base}/${encodeURIComponent(id)}/export.xlsx`, {});
  const value = response.headers.get("X-Exported-Count");
  const count = value == null ? null : Number(value);
  return { blob: await response.blob(), count: count != null && Number.isFinite(count) ? count : null };
}
