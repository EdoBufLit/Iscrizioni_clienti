import { AuthError } from "./api";

export const CENTRAL_COMMUNICATIONS_PATH = "/org-admin/comunicazioni-assonam";
export const NOTIFICATIONS_UPDATED_EVENT = "org-admin:notifications-updated";

export type CommunicationRecipient = {
  id: number;
  name: string;
  slug: string;
  admin_count: number;
  email_count: number;
};

export type CommunicationDraft = {
  subject: string;
  body: string;
  audience: "all" | "selected";
  organization_ids: number[];
};

export type CommunicationPreview = {
  organization_count: number;
  admin_count: number;
  email_count: number;
  without_admin_count: number;
  recipients: CommunicationRecipient[];
};

export type CentralCommunication = {
  id: number;
  subject: string;
  body: string;
  excerpt: string;
  audience: "all" | "selected";
  created_at: string;
  recipient_count: number;
  email_count: number;
  notification_count: number;
  created_by_email: string;
  is_read?: boolean;
  read_at?: string | null;
  recipients?: Array<{
    id: number;
    organization_id: number | null;
    organization_name: string;
    admin_count: number;
    email_count: number;
  }>;
};

export type CommunicationPage = {
  items: CentralCommunication[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  unread_count?: number;
};

export type ReceivedCommunication = Pick<CentralCommunication, "id" | "subject" | "body" | "excerpt" | "created_at" | "is_read" | "read_at">;
export type ReceivedCommunicationPage = Omit<CommunicationPage, "items"> & { items: ReceivedCommunication[] };

async function request<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(path, body ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } : undefined);
  if (res.status === 401) throw new AuthError("Sessione scaduta. Accedi nuovamente.");
  if (!res.ok) {
    let message = "Impossibile completare la richiesta. Riprova.";
    try {
      const error = await res.json() as { detail?: unknown };
      if (typeof error.detail === "string") message = error.detail;
    } catch { /* Keep a readable fallback for non-JSON server errors. */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const fetchCommunicationRecipients = () =>
  request<{ items: CommunicationRecipient[]; total: number }>("/api/super-admin/communications/recipients");

export const previewCommunication = (draft: CommunicationDraft) =>
  request<CommunicationPreview>("/api/super-admin/communications/preview", draft);

export const sendCommunication = (draft: CommunicationDraft & { idempotency_key: string; expected_organization_ids: number[] }) =>
  request<{ item: CentralCommunication; replayed: boolean }>("/api/super-admin/communications", draft);

export const fetchSentCommunications = (page = 1) =>
  request<CommunicationPage>(`/api/super-admin/communications?page=${page}&page_size=10`);

export const fetchSentCommunication = (id: number) =>
  request<{ item: CentralCommunication }>(`/api/super-admin/communications/${id}`);

export const fetchReceivedCommunications = (page = 1) =>
  request<ReceivedCommunicationPage>(`/api/org-admin/communications/inbox?page=${page}&page_size=15`);

export const fetchReceivedCommunication = (id: number) =>
  request<{ item: ReceivedCommunication }>(`/api/org-admin/communications/inbox/${id}`);

export const markCommunicationRead = (id: number) =>
  request<{ item: ReceivedCommunication }>(`/api/org-admin/communications/inbox/${id}/read`, {});

export const notifyCommunicationRead = () => window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));

export function communicationDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("it-IT", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
