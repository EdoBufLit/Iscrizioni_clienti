import { AuthError } from "./api";

export type TemporaryPaymentMethod = "sumup" | "bonifico" | "contanti";
export type TemporaryPurchase = {
  id: number; member_id: number; org_id: number; member_name: string; email: string | null;
  status: "payment_pending" | "manual_pending" | "paid_waiting_card" | "active" | "expired" | "cancelled";
  method: TemporaryPaymentMethod | "legacy"; amount: number | null; currency: string;
  duration_value: number; duration_unit: "hours" | "days";
  created_at: string; issued_at: string | null; valid_from: string | null; valid_until: string | null;
  card_no: number | null; card_year: number | null; payment_status: string | null;
  hosted_checkout_url: string | null; issue_reason: string | null;
};

export type TemporaryOffer = {
  enabled: boolean; eligible: boolean; reason: string | null;
  offer: { amount: number; currency: string; duration_value: number; duration_unit: "hours" | "days"; duration_label: string; methods: TemporaryPaymentMethod[] } | null;
  current_purchase: TemporaryPurchase | null;
};

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, credentials: "include" });
  if (response.status === 401) throw new AuthError("La sessione è scaduta. Accedi nuovamente.");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Operazione non riuscita. Riprova.");
  return data;
}

export const fetchTemporaryOffer = (signal?: AbortSignal) => request<TemporaryOffer>("/api/member/temporary-memberships/offer", { signal });
export const fetchTemporaryPurchase = (id: number, signal?: AbortSignal) => request<{purchase: TemporaryPurchase}>(`/api/member/temporary-memberships/${id}`, { signal });
export const createTemporaryPurchase = (method: TemporaryPaymentMethod) => request<{purchase: TemporaryPurchase; hosted_checkout_url?: string | null}>("/api/member/temporary-memberships", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method }) });
export const cancelTemporaryPurchase = (id: number) => request<{purchase: TemporaryPurchase}>(`/api/member/temporary-memberships/${id}/cancel`, { method: "POST" });
export const fetchAdminTemporaryPurchases = (memberId: number, signal?: AbortSignal) => request<{items: TemporaryPurchase[]; total: number}>(`/api/org-admin/temporary-memberships?member_id=${memberId}&limit=50`, { signal });
export const confirmTemporaryPayment = (id: number, paidAt: string, notes: string) => request<{purchase: TemporaryPurchase}>(`/api/org-admin/temporary-memberships/${id}/confirm-manual`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paid_at: paidAt, notes: notes.trim() || undefined }) });

export const temporaryMethodLabels: Record<TemporaryPurchase["method"], string> = { sumup: "Paga online", bonifico: "Bonifico", contanti: "Contanti", legacy: "Emissione precedente" };
export const temporaryStatusLabels: Record<TemporaryPurchase["status"], string> = {
  payment_pending: "Pagamento da completare", manual_pending: "In attesa di conferma dell'incasso",
  paid_waiting_card: "Pagamento ricevuto, in attesa di emissione", active: "Tessera emessa",
  expired: "Tessera scaduta", cancelled: "Acquisto annullato",
};
export const formatTemporaryDate = (value: string | null) => value ? new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(value)) : "—";
export const formatTemporaryAmount = (value: number | null, currency: string) => value == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value);
export function localPaymentDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)?.value).join("-");
}
