import { AuthError } from "./api";

export type ReceiptMethod = "cash" | "bank_transfer" | "other" | "sumup";
export type ReceiptStatus = "unmatched" | "partial" | "matched" | "voided";
export type AccountingReceipt = {
  id: number;
  version: number;
  amount_cents: number;
  currency: string;
  method: ReceiptMethod;
  paid_on: string;
  payer: string | null;
  reference: string | null;
  description: string | null;
  source: "manual" | "csv" | "legacy_manual" | "provider";
  source_key: string | null;
  status: ReceiptStatus;
  allocated_cents: number;
  unallocated_cents: number;
  created_at: string;
  permissions: {
    can_adjust: boolean;
    can_void: boolean;
    reason: string | null;
  };
};
export type AccountingAllocation = {
  id: number;
  receipt_id: number;
  target_key: string;
  kind: "initial" | "renewal" | "temporary";
  target_id: number | null;
  member_id: number | null;
  member_name: string;
  membership_year: number | null;
  amount_cents: number;
  net_cents: number;
  reversed_at: string | null;
  payment_id: number | null;
  created_at: string;
};
export type AccountingEvent = {
  id: number;
  action: string;
  reason: string | null;
  actor_admin_id: number | null;
  created_at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};
export type AccountingTarget = {
  target_key: string;
  kind: "initial" | "renewal" | "temporary";
  target_id: number | null;
  member_id: number;
  member_name: string;
  email: string | null;
  membership_year: number | null;
  label: string;
  currency: string;
  expected_cents: number;
  paid_cents: number;
  outstanding_cents: number;
  already_paid: boolean;
  exact_match: boolean;
  reasons: string[];
};
export type ReceiptDetail = {
  receipt: AccountingReceipt;
  allocations: AccountingAllocation[];
  events: AccountingEvent[];
};
export type ReceiptList = {
  items: AccountingReceipt[];
  total: number;
  kpis: {
    total_cents: number;
    allocated_cents: number;
    unallocated_cents: number;
    unmatched_count: number;
  };
};
export type ReceiptInput = {
  amount_cents: number;
  currency: "EUR";
  method: Exclude<ReceiptMethod, "sumup">;
  paid_on: string;
  payer?: string | null;
  reference?: string | null;
  description?: string | null;
};
export type ReceiptImportPreview = {
  rows: Array<{
    row_number: number;
    valid: boolean;
    duplicate: boolean;
    errors: string[];
    receipt: (ReceiptInput & { source_key: string }) | null;
  }>;
  valid_count: number;
  invalid_count: number;
  duplicate_count: number;
};
export type MemberAccounting = {
  balance: {
    expected_cents: number;
    paid_cents: number;
    outstanding_cents: number;
    currency: string;
  };
  receipts: AccountingReceipt[];
  events: AccountingEvent[];
};

export class AccountingError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AccountingError";
  }
}

const base = "/api/org-admin/accounting";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...options,
    credentials: "include",
  });
  if (response.status === 401)
    throw new AuthError("La sessione è scaduta. Accedi nuovamente.");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const validation = Array.isArray(data.detail)
      ? data.detail
          .map((item: unknown) =>
            item &&
            typeof item === "object" &&
            "msg" in item &&
            typeof item.msg === "string"
              ? item.msg
              : "",
          )
          .filter(Boolean)
          .slice(0, 3)
          .join(" · ")
      : "";
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : validation || "Operazione non riuscita. Verifica i dati e riprova.";
    throw new AccountingError(detail, response.status);
  }
  return data as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchReceipts(
  input: { state?: string; q?: string; limit?: number; offset?: number },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return request<ReceiptList>(`/receipts?${params}`, { signal });
}
export const fetchReceipt = (id: number, signal?: AbortSignal) =>
  request<ReceiptDetail>(`/receipts/${id}`, { signal });
export const createReceipt = (input: ReceiptInput & { request_key: string }) =>
  post<ReceiptDetail>("/receipts", input);
export const syncReceipts = (requestKey: string) =>
  post<{ created: number; has_more?: boolean }>("/receipts/sync", { request_key: requestKey });
export const previewReceiptImport = (csvText: string, signal?: AbortSignal) =>
  request<ReceiptImportPreview>("/receipts/import/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv_text: csvText }),
    signal,
  });
export const importReceipts = (csvText: string, requestKey: string) =>
  post<{ created: number; duplicates: number; items: AccountingReceipt[] }>(
    "/receipts/import",
    { csv_text: csvText, request_key: requestKey },
  );
export function fetchReceiptTargets(
  id: number,
  input: { query?: string; year: number; limit: number; offset: number },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return request<{ items: AccountingTarget[]; total: number }>(
    `/receipts/${id}/suggestions?${params}`,
    { signal },
  );
}
export const allocateReceipt = (
  id: number,
  input: {
    request_key: string;
    expected_version: number;
    items: Array<{ target_key: string; amount_cents: number }>;
  },
) => post<ReceiptDetail>(`/receipts/${id}/allocations`, input);
export const adjustReceipt = (
  id: number,
  input: Partial<Omit<ReceiptInput, "currency">> & {
    request_key: string;
    expected_version: number;
    reason: string;
  },
) => post<ReceiptDetail>(`/receipts/${id}/adjustments`, input);
export const reverseReceiptAllocation = (
  id: number,
  allocationId: number,
  input: { request_key: string; expected_version: number; reason: string },
) =>
  post<ReceiptDetail>(
    `/receipts/${id}/allocations/${allocationId}/reverse`,
    input,
  );
export const voidReceipt = (
  id: number,
  input: { request_key: string; expected_version: number; reason: string },
) => post<ReceiptDetail>(`/receipts/${id}/void`, input);
export const fetchMemberAccounting = (
  memberId: number,
  year: number,
  signal?: AbortSignal,
) => request<MemberAccounting>(`/members/${memberId}?year=${year}`, { signal });
