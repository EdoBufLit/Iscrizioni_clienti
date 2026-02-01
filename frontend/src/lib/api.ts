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
  status: string;
  card_no: number | null;
  joined_at: string | null;
  organization: {
    id: number;
    name: string;
    slug: string;
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
  if (!res.ok) throw new Error("Registration failed");
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
    id_document?: File | null;
  },
): Promise<{ status: string; organization: string }> {
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

  if (data.id_document) {
    body.append("id_document", data.id_document);
    // Switch to new endpoint if document is present
    const res = await fetch(`/api/join/${encodeURIComponent(orgSlug)}/submit`, {
      method: "POST",
      body,
    });
    if (res.status === 404) throw new Error("Organization not found");
    if (!res.ok) throw new Error("Join failed");
    return res.json();
  } else {
    // Legacy endpoint
    const res = await fetch(`/api/join/${encodeURIComponent(orgSlug)}`, {
        method: "POST",
        body,
    });
    if (res.status === 404) throw new Error("Organization not found");
    if (!res.ok) throw new Error("Join failed");
    return res.json();
  }
}

export async function fetchMe(): Promise<MemberProfile> {
  const res = await fetch("/api/auth/me");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch profile");
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

export type OrgAdminMetrics = {
  members_count: number;
  cards_total: number | null;
  cards_used: number | null;
  cards_remaining: number | null;
  pending_requests_count: number | null;
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
  email: string;
  status: string | null;
  card_no: number | null;
  joined_at: string | null;
  docs_count: number;
};

export type OrgAdminMembersResponse = {
  items: OrgAdminMember[];
  total: number;
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
  description: string | null;
  is_active: boolean;
  created_at: string | null;
  city: string | null;
  province: string | null;
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

export async function createSuperAdminOrganization(data: {
  name: string;
  slug?: string;
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

export type IncreaseCardsResult = {
  batch_id: number;
  start_no: number;
  end_no: number;
  cards_total: number;
  cards_remaining: number;
};

export async function increaseOrgCardStock(
  orgId: number,
  amount: number,
  reason?: string,
  paidRef?: string,
): Promise<IncreaseCardsResult> {
  const body: Record<string, unknown> = { amount };
  if (reason) body.reason = reason;
  if (paidRef) body.paid_ref = paidRef;
  const res = await fetch(`/api/super-admin/orgs/${orgId}/cards/increase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 400) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail ?? "Dati non validi");
  }
  if (res.status === 404) throw new Error("Organizzazione non trovata");
  if (!res.ok) throw new Error("Errore nell'aggiunta tessere");
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
  limit?: number;
  offset?: number;
}): Promise<OrgAdminMembersResponse> {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.status) sp.set("status", params.status);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  const res = await fetch(`/api/org-admin/members${qs ? `?${qs}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch members");
  return res.json();
}
