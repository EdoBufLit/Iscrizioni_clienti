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
): Promise<Organization[]> {
  const params = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await fetch(`/api/organizations${params}`);
  if (!res.ok) throw new Error("Failed to fetch organizations");
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

export async function fetchMe(): Promise<MemberProfile> {
  const res = await fetch("/api/auth/me");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch profile");
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
  const res = await fetch(
    `/api/org-admin/auth/verify?token=${encodeURIComponent(token)}`,
    { redirect: "manual" },
  );
  // The backend returns a 302 redirect on success.
  // With redirect: "manual", a redirect becomes an opaque response (type "opaqueredirect").
  // Any non-error response means the session cookie was set.
  if (res.type === "opaqueredirect" || res.ok || res.status === 302) return;
  throw new Error("Invalid or expired token");
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
  if (res.status === 409) throw new Error("Email già registrata");
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
