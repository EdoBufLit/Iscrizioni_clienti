export type OrganizationListItem = {
  id: number;
  name: string;
  slug: string;
  city: string | null;
  province: string | null;
  description_short: string | null;
  logo_url: string | null;
};

// Kept for MemberProfile compatibility
export type Organization = {
  id: number;
  name: string;
  slug: string;
};

export type MemberProfile = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  fiscal_code: string | null;
  signup_source?: string | null;
  external_customer_id?: string | null;
  payment_method?: string | null;
  status: string;
  card_no: number | null;
  card_status?: string | null;
  card_year?: number | null;
  card_verification_url?: string | null;
  card?: {
    number: number | null;
    status: string | null;
    year: number | null;
    verification_url: string | null;
  } | null;
  joined_at: string | null;
  organization: {
    id: number;
    name: string;
    slug: string;
    club_display_name?: string | null;
    card_logo_url?: string | null;
  } | null;
};

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function fetchOrganizations(
  q?: string,
): Promise<OrganizationListItem[]> {
  const params = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await fetch(`/api/organizations${params}`);
  if (!res.ok) throw new Error("Failed to fetch organizations");
  return res.json();
}

export type OrganizationDetail = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logo_url: string | null;
  is_active: boolean;
  statute_version?: string;
  statute_url?: string;
  has_statute: boolean;
  privacy_version?: string;
};

export async function fetchOrganizationDetail(
  slug: string,
): Promise<OrganizationDetail> {
  const res = await fetch(`/api/organizations/${encodeURIComponent(slug)}`);
  if (res.status === 404) throw new Error("Organization not found");
  if (!res.ok) throw new Error("Failed to fetch organization");
  return res.json();
}

export type PublicOrganizationInfo = {
  slug: string;
  name: string;
  club_display_name: string;
  card_logo_url: string | null;
  wallet_enabled: boolean;
};

export async function fetchPublicOrganizationInfo(
  orgSlug: string,
): Promise<PublicOrganizationInfo> {
  const res = await fetch(`/api/public/orgs/${encodeURIComponent(orgSlug)}`);
  if (res.status === 404) throw new Error("Organization not found");
  if (!res.ok) throw new Error("Failed to fetch public organization info");
  return res.json();
}

export type PienissimoIngestResponse = {
  status: string;
  member_id: number;
  card_number: number;
  card_verification_token: string;
  card_url: string;
  card_verification_url: string;
  card_download_url: string;
  verify_url?: string;
  download_pdf_url?: string;
  card_wallet_apple_url?: string | null;
  card_wallet_google_url?: string | null;
  wallet_enabled: boolean;
};

export async function ingestPienissimoMember(
  orgSlug: string,
  payload: {
    email: string;
    external_customer_id: string;
    first_name?: string;
    last_name?: string;
  },
): Promise<PienissimoIngestResponse> {
  const res = await fetch(`/api/ingest/pienissimo/${encodeURIComponent(orgSlug)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.status === 409) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message ?? data?.detail ?? "Socio gia presente.");
  }
  if (res.status === 402 || res.status === 403) {
    throw new Error("Servizio tessera non attivo per questa associazione.");
  }
  if (res.status === 429) {
    throw new Error("Troppi tentativi. Riprova tra qualche minuto.");
  }
  if (res.status === 422) {
    throw new Error("Inserisci una email valida.");
  }
  if (res.status >= 500) {
    throw new Error("Errore temporaneo. Riprova.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail ?? data?.message ?? "Richiesta non completata. Verifica i dati e riprova.");
  }

  return res.json();
}

export async function requestMagicLink(
  email: string,
): Promise<{ status: string; message: string }> {
  const body = new FormData();
  body.append("email", email);
  const res = await fetch("/api/auth/login", { method: "POST", body });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export async function loginWithPassword(
  email: string,
  password: string,
): Promise<{ status: string; message: string; authenticated?: boolean }> {
  const body = new FormData();
  body.append("email", email);
  body.append("password", password);
  const res = await fetch("/api/auth/login", { method: "POST", body });
  if (!res.ok) throw new Error("Login failed");
  return res.json();
}

export async function registerMember(data: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  fiscal_code?: string;
  org_slug?: string;
}): Promise<{ status: string; message: string; authenticated?: boolean }> {
  const body = new FormData();
  body.append("email", data.email);
  body.append("password", data.password);
  body.append("first_name", data.first_name);
  body.append("last_name", data.last_name);
  if (data.phone) body.append("phone", data.phone);
  if (data.fiscal_code) body.append("fiscal_code", data.fiscal_code);
  if (data.org_slug) body.append("org_slug", data.org_slug);
  const res = await fetch("/api/auth/register", { method: "POST", body });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.detail ?? "Registrazione fallita.");
  }
  return res.json();
}

export async function joinOrganization(
  orgSlug: string,
  data: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    fiscal_code: string;
    accept_statute: boolean;
    accepted_statute_version: string | null;
    accept_privacy: boolean;
    payment_method: "CASH" | "BONIFICO";
    id_document?: File | null;
  },
): Promise<{ status: string; organization?: string; id?: number; email_sent?: boolean }> {
  const body = new FormData();
  body.append("first_name", data.first_name);
  body.append("last_name", data.last_name);
  body.append("email", data.email);
  body.append("phone", data.phone);
  body.append("fiscal_code", data.fiscal_code);
  body.append("accept_statute", String(data.accept_statute));
  if (data.accepted_statute_version) {
    body.append("accepted_statute_version", data.accepted_statute_version);
  }
  body.append("accept_privacy", String(data.accept_privacy));
  body.append("payment_method", data.payment_method);

  if (data.id_document) {
    body.append("id_document", data.id_document);
  }
  const res = await fetch(`/api/join/${encodeURIComponent(orgSlug)}/submit`, {
    method: "POST",
    body,
  });
  if (res.status === 404) throw new Error("Associazione non trovata.");
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const detail = payload?.detail;
    if (res.status === 409) throw new Error(detail ?? "Iscrizione già presente.");
    if (res.status === 400) throw new Error(detail ?? "Dati non validi.");
    if (res.status === 429) throw new Error("Troppe richieste. Riprova tra qualche minuto.");
    throw new Error(detail ?? "Errore durante l'iscrizione.");
  }
  return res.json();
}

export async function fetchMe(): Promise<MemberProfile> {
  const res = await fetch("/api/auth/me");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

export type MemberDocumentItem = {
  id: number;
  type: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string | null;
  status: string;
  rejection_note?: string | null;
  reviewed_at?: string | null;
  replaces_document_id?: number | null;
  download_url: string;
};

export type MemberDocumentsResponse = {
  required_types: string[];
  items: MemberDocumentItem[];
};

export async function fetchMemberDocuments(): Promise<MemberDocumentsResponse> {
  const res = await fetch("/api/member/documents");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch documents");
  return res.json();
}

export async function resubmitMemberDocument(
  docId: number,
  file: File,
): Promise<{ ok: boolean; id: number; status: string }> {
  const body = new FormData();
  body.append("document", file);
  const res = await fetch(`/api/member/documents/${docId}/resubmit`, {
    method: "POST",
    body,
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 400) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.detail ?? "Dati non validi");
  }
  if (!res.ok) throw new Error("Errore durante il reinvio del documento");
  return res.json();
}

export async function changePassword(
  newPassword: string,
): Promise<{ status: string; message: string }> {
  const body = new FormData();
  body.append("new_password", newPassword);
  const res = await fetch("/api/auth/change-password", { method: "POST", body });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 400) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail ?? "Dati non validi");
  }
  if (!res.ok) throw new Error("Errore nel cambio password");
  return res.json();
}

export async function apiLogout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export type WhoAmIResponse = {
  authenticated: boolean;
  role?: "super_admin" | "org_admin" | "member";
  redirect_to?: string;
};

export async function fetchWhoAmI(): Promise<WhoAmIResponse> {
  try {
    const res = await fetch("/api/auth/whoami");
    if (!res.ok) return { authenticated: false };
    return res.json();
  } catch {
    return { authenticated: false };
  }
}

// ── Org Admin ────────────────────────────────────────────────────

export type OrgAdminProfile = {
  id: number;
  email: string;
  org_id: number;
  role: string;
  organization: {
    id: number;
    name: string;
    slug: string;
  } | null;
};

export async function requestOrgAdminMagicLink(
  email: string,
): Promise<{ ok: boolean }> {
  const body = new FormData();
  body.append("email", email);
  const res = await fetch("/api/org-admin/auth/magic-link", {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export async function verifyOrgAdminToken(
  token: string,
): Promise<void> {
  // Use default redirect behavior to ensure cookies are set correctly by the browser
  const res = await fetch(
    `/api/org-admin/auth/verify?token=${encodeURIComponent(token)}`
  );

  // If successful, the backend redirects to the dashboard (200 OK HTML)
  // If failed, it returns 400 or similar
  if (!res.ok) throw new Error("Invalid or expired token");
}

export async function verifyMemberToken(token: string): Promise<void> {
  // We use normal fetch which follows redirects.
  // Success: redirects to /app/dashboard
  // Failure: redirects to /app/login
  const res = await fetch(`/member/auth?token=${encodeURIComponent(token)}`);

  if (res.url.includes("/dashboard") || res.url.includes("/app/dashboard")) {
    return;
  }

  throw new Error("Link non valido o scaduto");
}

export async function fetchOrgAdminMe(): Promise<OrgAdminProfile> {
  const res = await fetch("/api/org-admin/auth/me");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

export async function orgAdminLogout(): Promise<void> {
  await fetch("/api/org-admin/auth/logout", { method: "POST" });
}

export type OrgAdminOrganizationDetail = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logo_url: string | null;
  statute_version: string | null;
  statute_updated_at: string | null;
  statute_url: string | null;
  has_statute: boolean;
};

export async function fetchOrgAdminOrganization(): Promise<OrgAdminOrganizationDetail> {
  const res = await fetch("/api/org-admin/organization");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch organization");
  return res.json();
}

export async function patchOrgAdminOrganization(data: {
  name?: string;
  description?: string;
  city?: string;
  province?: string;
  email?: string;
  phone?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  postal_code?: string;
  country?: string;
}): Promise<{ ok: boolean }> {
  const res = await fetch("/api/org-admin/organization", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to update organization");
  return res.json();
}

export async function uploadOrgAdminStatute(
  file: File,
): Promise<{ statute_version: string; updated_at: string; has_statute: boolean }> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/org-admin/organization/statute", {
    method: "POST",
    body,
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to upload statute");
  return res.json();
}

export async function uploadSuperAdminStatute(
  orgId: number,
  file: File,
): Promise<{ statute_version: string; updated_at: string; has_statute: boolean }> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/super-admin/organizations/${orgId}/statute`, {
    method: "POST",
    body,
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to upload statute");
  return res.json();
}

export type OrgAdminMetrics = {
  members_count: number;
  cards_total: number | null;
  cards_used: number | null;
  cards_remaining: number | null;
  pending_requests_count: number | null;
  documents_pending_review?: number | null;
  documents_rejected?: number | null;
};

export async function fetchOrgAdminMetrics(): Promise<OrgAdminMetrics> {
  const res = await fetch("/api/org-admin/metrics");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch metrics");
  return res.json();
}

export type OrgAdminMember = {
  id: number;
  name: string;
  email: string | null;
  status: string | null;
  workflow_status?: string | null;
  is_active: boolean;
  deleted_at: string | null;
  card_no: number | null;
  card_number: number | null;
  card_year?: number | null;
  joined_at: string | null;
  docs_count: number;
  is_paid?: boolean;
  last_payment_at?: string | null;
  has_access?: boolean;
  is_manual?: boolean;
  signup_source?: string | null;
  external_customer_id?: string | null;
};

export type OrgAdminMembersResponse = {
  items: OrgAdminMember[];
  total: number;
};

export type CreateOrgAdminMemberInput = {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  fiscal_code?: string;
  payment_method?: "CASH" | "BONIFICO";
  joined_at?: string;
  member_type?: string;
  internal_notes?: string;
  is_manual?: boolean;
  send_access_email?: boolean;
};

export type OrgAdminMemberCreated = {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  fiscal_code: string | null;
  signup_source?: string | null;
  external_customer_id?: string | null;
  payment_method?: string | null;
  status: string | null;
  joined_at: string | null;
  member_type: string | null;
  internal_notes: string | null;
  is_manual: boolean;
  email_sent: boolean;
};

export type CardStock = {
  total: number;
  used: number;
  remaining: number;
};

export async function fetchCardStock(): Promise<CardStock> {
  const res = await fetch("/api/org-admin/cards");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch card stock");
  return res.json();
}

export type CardMovement = {
  id: number;
  card_no: number | null;
  delta: number;
  reason: string;
  created_at: string | null;
  member_name: string | null;
};

export type CardMovementsResponse = {
  items: CardMovement[];
  total: number;
};

export async function fetchCardMovements(params?: {
  limit?: number;
  offset?: number;
}): Promise<CardMovementsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  const res = await fetch(`/api/org-admin/cards/movements${qs ? `?${qs}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch card movements");
  return res.json();
}

// ── Super Admin ─────────────────────────────────────────────────

export type SuperAdminProfile = {
  id: number;
  email: string;
  role: string;
};

export type SuperAdminMemberDetail = {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  fiscal_code: string | null;
  payment_method: string | null;
  status: string;
  workflow_status?: string | null;
  is_active?: boolean;
  deleted_at?: string | null;
  card_no: number | null;
  card_number?: number | null;
  card_year?: number | null;
  joined_at: string | null;
  member_type?: string | null;
  internal_notes?: string | null;
  is_manual?: boolean;
  organization?: {
    id: number;
    name: string;
    slug: string;
  } | null;
};

export async function superAdminLogin(
  email: string,
  password: string,
): Promise<{ ok: boolean }> {
  const res = await fetch("/api/super-admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 401) throw new AuthError("Invalid credentials");
  if (!res.ok) throw new Error("Login failed");
  return res.json();
}

export async function fetchSuperAdminMe(): Promise<SuperAdminProfile> {
  const res = await fetch("/api/super-admin/auth/me");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

export async function fetchSuperAdminMemberDetail(
  memberId: number,
): Promise<SuperAdminMemberDetail> {
  const res = await fetch(`/api/super-admin/members/${memberId}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Socio non trovato");
  if (!res.ok) throw new Error("Errore nel caricamento del socio");
  return res.json();
}

export async function superAdminLogout(): Promise<void> {
  await fetch("/api/super-admin/auth/logout", { method: "POST" });
}

export type OrgAdmin = {
  id: number;
  email: string;
  org_id: number;
  org_name: string | null;
  is_active: boolean;
  created_at: string | null;
  restored?: boolean;
  created?: boolean;
};

export async function fetchOrgAdmins(
  orgId?: number,
): Promise<OrgAdmin[]> {
  const qs = orgId != null ? `?org_id=${orgId}` : "";
  const res = await fetch(`/api/super-admin/org-admins${qs}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch org admins");
  return res.json();
}

export type SuperAdminOrganization = {
  id: number;
  name: string;
  slug: string;
  club_display_name?: string | null;
  card_email_subject?: string | null;
  card_logo_url?: string | null;
  description: string | null;
  is_active: boolean;
  is_archived?: boolean;
  deleted_at?: string | null;
  created_at: string | null;
  city: string | null;
  province: string | null;
  card_min: number | null;
  card_max: number | null;
};

export type SuperAdminOrganizationsResponse = {
  data: SuperAdminOrganization[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
};

export async function fetchSuperAdminOrganizations(
  page: number = 1,
  limit: number = 50,
  q?: string
): Promise<SuperAdminOrganizationsResponse> {
  const sp = new URLSearchParams();
  sp.set("page", String(page));
  sp.set("limit", String(limit));
  if (q) sp.set("q", q);

  const res = await fetch(`/api/super-admin/organizations?${sp.toString()}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch organizations");
  return res.json();
}

export type SuperAdminIntegrationKey = {
  id: number;
  name: string;
  scopes: string[];
  is_active: boolean;
  created_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
};

export type SuperAdminIntegrationKeysResponse = {
  items: SuperAdminIntegrationKey[];
};

export type SuperAdminIntegrationKeyCreated = {
  id: number;
  created_at: string | null;
  raw_key: string;
  replaced_key_id?: number;
};

async function parseApiErrorDetail(
  res: Response,
  fallback: string,
): Promise<string> {
  const payload = await res.json().catch(() => null);
  const detail = payload?.detail;
  return typeof detail === "string" && detail.trim() ? detail : fallback;
}

export async function fetchSuperAdminIntegrationKeys(
  orgId: number,
  name: string = "pienissimo",
): Promise<SuperAdminIntegrationKeysResponse> {
  const res = await fetch(
    `/api/super-admin/orgs/${orgId}/integration-keys?name=${encodeURIComponent(name)}`,
  );
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 403) throw new Error("Accesso negato");
  if (res.status === 404) throw new Error("Organizzazione non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nel caricamento chiavi"));
  return res.json();
}

export async function createSuperAdminIntegrationKey(
  orgId: number,
  payload: { name?: string; scopes?: string[] } = {},
): Promise<SuperAdminIntegrationKeyCreated> {
  const body = {
    name: payload.name ?? "pienissimo",
    scopes: payload.scopes ?? ["issue_member"],
  };
  const res = await fetch(`/api/super-admin/orgs/${orgId}/integration-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 403) throw new Error("Accesso negato");
  if (res.status === 404) throw new Error("Organizzazione non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione chiave"));
  return res.json();
}

export async function rotateSuperAdminIntegrationKey(
  orgId: number,
  keyId: number,
): Promise<SuperAdminIntegrationKeyCreated> {
  const res = await fetch(`/api/super-admin/orgs/${orgId}/integration-keys/${keyId}/rotate`, {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 403) throw new Error("Accesso negato");
  if (res.status === 404) throw new Error("Chiave non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore rotazione chiave"));
  return res.json();
}

export async function disableSuperAdminIntegrationKey(
  orgId: number,
  keyId: number,
): Promise<{ ok: boolean; is_active: boolean }> {
  const res = await fetch(`/api/super-admin/orgs/${orgId}/integration-keys/${keyId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 403) throw new Error("Accesso negato");
  if (res.status === 404) throw new Error("Chiave non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore disattivazione chiave"));
  return res.json();
}

export async function createSuperAdminOrganization(data: {
  name: string;
  slug?: string;
  club_display_name?: string;
  card_email_subject?: string;
  card_logo_url?: string;
  city?: string;
  province?: string;
  description_short?: string;
  is_active?: boolean;
}): Promise<SuperAdminOrganization> {
  const res = await fetch("/api/super-admin/organizations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 409) throw new Error("Slug already exists");
  if (!res.ok) throw new Error("Failed to create organization");
  return res.json();
}

export async function patchSuperAdminOrganization(
  orgId: number,
  data: {
    name?: string;
    club_display_name?: string | null;
    card_email_subject?: string | null;
    card_logo_url?: string | null;
    description?: string;
    is_active?: boolean;
  },
): Promise<SuperAdminOrganization> {
  const res = await fetch(`/api/super-admin/organizations/${orgId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Organizzazione non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento associazione"));
  return res.json();
}

export type DeleteAssociationMode = "archive" | "purge";

export type DeleteAssociationResult = {
  ok: boolean;
  mode: DeleteAssociationMode;
  releasedRange: { start: number; end: number } | null;
  archivedAssociationId: number | null;
  purgedAssociationId: number | null;
};

export async function deleteOrganization(
  orgId: number,
  options?: {
    mode?: DeleteAssociationMode;
    releaseRange?: boolean;
    force?: boolean;
  }
): Promise<DeleteAssociationResult> {
  const mode = options?.mode ?? "archive";
  const releaseRange = options?.releaseRange ?? true;
  const force = options?.force ?? false;
  const query = new URLSearchParams({
    mode,
    release_range: String(releaseRange),
    force: String(force),
  });

  const res = await fetch(`/api/admin/associations/${orgId}?${query.toString()}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 403) throw new Error("Operazione consentita solo a super-admin");
  if (res.status === 404) throw new Error("Associazione non trovata");
  if (res.status === 409) throw new Error(await parseApiErrorDetail(res, "Operazione bloccata"));
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Failed to delete organization"));
  return res.json();
}

export async function setOrganizationCardRange(
  orgId: number,
  from: number,
  to: number,
): Promise<void> {
  const res = await fetch(`/api/super-admin/organizations/${orgId}/card-range`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from_no: from, to_no: to }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 400 || res.status === 409) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail ?? "Errore nel set range");
  }
  if (!res.ok) throw new Error("Failed to set card range");
}

export async function createOrgAdmin(
  email: string,
  orgId: number,
): Promise<OrgAdmin> {
  const res = await fetch("/api/super-admin/org-admins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, org_id: orgId }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 409) {
    const data = await res.json().catch(() => null);
    if (data?.detail === "admin_exists") throw new Error("admin_exists");
    throw new Error("Email già registrata");
  }
  if (res.status === 404) throw new Error("Organizzazione non trovata");
  if (!res.ok) throw new Error("Failed to create org admin");
  return res.json();
}

export async function patchOrgAdmin(
  adminId: number,
  isActive: boolean,
): Promise<void> {
  const res = await fetch(`/api/super-admin/org-admins/${adminId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: isActive }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to update org admin");
}

export async function deleteOrgAdmin(
  adminId: number,
): Promise<{ ok: boolean; already_deleted?: boolean }> {
  const res = await fetch(`/api/super-admin/org-admins/${adminId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 409) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail ?? "Impossibile eliminare l'amministratore");
  }
  if (!res.ok) throw new Error("Failed to delete org admin");
  return res.json();
}

export async function restoreOrgAdmin(
  adminId: number,
): Promise<{ ok: boolean; already_active?: boolean }> {
  const res = await fetch(`/api/super-admin/org-admins/${adminId}/restore`, {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to restore org admin");
  return res.json();
}

export type AddBatchResult = {
  ok: boolean;
  batch_id: number;
  start_no: number;
  end_no: number;
  cards_total: number;
  cards_remaining: number;
};

export async function addOrgCardBatch(
  orgId: number,
  fromNo: number,
  toNo: number,
): Promise<AddBatchResult> {
  const res = await fetch(`/api/super-admin/orgs/${orgId}/cards/add-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from_no: fromNo, to_no: toNo }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 409) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail ?? "Range in conflitto con altro lotto");
  }
  if (res.status === 400) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail ?? "Dati non validi");
  }
  if (res.status === 404) throw new Error("Organizzazione non trovata");
  if (!res.ok) throw new Error("Errore nell'aggiunta lotto tessere");
  return res.json();
}

export type OrgBatch = {
  id: number;
  start_no: number;
  end_no: number;
  next_no: number;
  year: number;
  is_active: boolean;
  total: number;
  assigned: number;
  remaining: number;
};

export type OrgBatchesResult = {
  current_year: number;
  next_reset_at: string;
  batches: OrgBatch[];
  summary: {
    total: number;
    assigned: number;
    remaining: number;
  };
};

export async function fetchOrgBatches(orgId: number): Promise<OrgBatchesResult> {
  const res = await fetch(`/api/super-admin/organizations/${orgId}/batches`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Organizzazione non trovata");
  if (!res.ok) throw new Error("Errore nel caricamento lotti");
  return res.json();
}

export type MaintenanceRunResult = {
  ok: boolean;
  ran_at: string;
  expired_count: number;
  purged_count: number;
  current_year: number;
  member_ids: number[];
};

export async function runAnnualMaintenance(
  purgePii: boolean = true,
): Promise<MaintenanceRunResult> {
  const res = await fetch("/api/super-admin/maintenance/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purge_pii: purgePii }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 403) throw new Error("Operazione consentita solo a super-admin");
  if (!res.ok) throw new Error("Errore esecuzione manutenzione annuale");
  return res.json();
}

// ── Version ─────────────────────────────────────────────────────

export type VersionInfo = {
  version: string;
  git_sha: string | null;
  build_time: string | null;
};

export async function fetchVersion(): Promise<VersionInfo> {
  const res = await fetch("/version");
  if (!res.ok) throw new Error("Failed to fetch version");
  return res.json();
}

export async function fetchOrgAdminMembers(params?: {
  q?: string;
  status?: string;
  access?: string;
  source?: string;
  docs?: string;
  order?: string;
  limit?: number;
  offset?: number;
}): Promise<OrgAdminMembersResponse> {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.status) sp.set("status", params.status);
  if (params?.access) sp.set("access", params.access);
  if (params?.source) sp.set("source", params.source);
  if (params?.docs) sp.set("docs", params.docs);
  if (params?.order) sp.set("order", params.order);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  const res = await fetch(`/api/org-admin/members${qs ? `?${qs}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch members");
  return res.json();
}

export async function createOrgAdminMember(
  data: CreateOrgAdminMemberInput,
): Promise<OrgAdminMemberCreated> {
  const res = await fetch("/api/org-admin/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 400 || res.status === 422) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.detail ?? "Dati non validi");
  }
  if (!res.ok) throw new Error("Errore nella creazione del socio");
  return res.json();
}

export type ManualPaymentInput = {
  amount: number;
  method: string;
  paid_at: string;
  notes?: string;
};

export type ManualPaymentResult = {
  ok: boolean;
  payment: {
    id: number;
    amount_cents: number;
    amount: number;
    method: string;
    paid_at: string | null;
    notes?: string | null;
  };
  member_status: string | null;
  card_assigned: boolean;
};

export async function createManualPayment(
  memberId: number,
  payload: ManualPaymentInput,
): Promise<ManualPaymentResult> {
  const res = await fetch(`/api/org-admin/members/${memberId}/payments/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 400) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail ?? "Dati non validi");
  }
  if (res.status === 403) throw new Error("Permesso negato");
  if (res.status === 404) throw new Error("Socio non trovato");
  if (!res.ok) throw new Error("Errore durante il salvataggio del pagamento");
  return res.json();
}

// ── Onboarding Tour ─────────────────────────────────────────────

export type OnboardingTourStatus = {
  tour_key: string;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  should_show: boolean;
};

export async function fetchOnboardingStatus(): Promise<OnboardingTourStatus> {
  const res = await fetch("/api/me/onboarding");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch onboarding status");
  return res.json();
}

export async function startOnboardingTour(): Promise<{ ok: boolean }> {
  const res = await fetch("/api/me/onboarding/start", { method: "POST" });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to start tour");
  return res.json();
}

export async function completeOnboardingTour(): Promise<{ ok: boolean }> {
  const res = await fetch("/api/me/onboarding/complete", { method: "POST" });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to complete tour");
  return res.json();
}

export async function skipOnboardingTour(): Promise<{ ok: boolean }> {
  const res = await fetch("/api/me/onboarding/skip", { method: "POST" });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to skip tour");
  return res.json();
}

export async function resetOnboardingTour(): Promise<{ ok: boolean; should_show: boolean }> {
  const res = await fetch("/api/me/onboarding/reset", { method: "POST" });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to reset tour");
  return res.json();
}
