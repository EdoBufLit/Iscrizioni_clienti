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

export type PlatformStats = {
  organizations: number;
  members: number;
  cities: number;
};

export type PlatformCapabilities = {
  affiliazioneEnabled: boolean;
  stripeEnabled: boolean;
  affiliationVideoEnabled?: boolean;
  videoWorkerEnabled?: boolean;
};

export async function fetchPlatformStats(): Promise<PlatformStats> {
  const res = await fetch("/api/stats/platform");
  if (!res.ok) throw new Error("Failed to fetch platform stats");
  return res.json();
}

export async function fetchPlatformCapabilities(): Promise<PlatformCapabilities> {
  const res = await fetch("/api/capabilities");
  if (!res.ok) throw new Error("Failed to fetch platform capabilities");
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


function resolveClientVersion(): string {
  const raw =
    import.meta.env.VITE_BUILD_SHA ||
    import.meta.env.VITE_APP_VERSION ||
    import.meta.env.MODE ||
    "dev";
  const normalized = String(raw).trim();
  return normalized || "dev";
}

export type PublicOrganizationInfo = {
  slug: string;
  name: string;
  club_display_name: string;
  card_logo_url: string | null;
  wallet_enabled: boolean;
};

export type MunicipalitySearchItem = {
  name: string;
  province: string | null;
  region: string | null;
  code: string;
};

export async function fetchPublicOrganizationInfo(
  orgSlug: string,
): Promise<PublicOrganizationInfo> {
  const res = await fetch(`/api/public/orgs/${encodeURIComponent(orgSlug)}`);
  if (res.status === 404) throw new Error("Organization not found");
  if (!res.ok) throw new Error("Failed to fetch public organization info");
  return res.json();
}

export async function searchMunicipalities(
  query: string,
  limit = 8,
): Promise<MunicipalitySearchItem[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }
  const params = new URLSearchParams({
    q: trimmed,
    limit: String(limit),
  });
  const res = await fetch(`/api/municipalities?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch municipalities");
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
    birth_date: string;
    birth_place: string;
    birth_place_code: string;
    gender: "M" | "F";
    email: string;
    phone: string;
    fiscal_code: string;
    accept_statute: boolean;
    accepted_statute_version: string | null;
    accept_privacy: boolean;
    payment_method: "CASH" | "BONIFICO";
    id_document?: File | null;
  },
): Promise<{
  status: string;
  organization?: string;
  id?: number;
  email_sent?: boolean;
  email_status?: string;
  warnings?: string[];
  active_card_page_url?: string;
  card_verification_token?: string;
  card_verification_url?: string;
  card_download_url?: string;
}> {
  const clientVersion = resolveClientVersion();
  const body = new FormData();
  body.append("first_name", data.first_name);
  body.append("last_name", data.last_name);
  body.append("birth_date", data.birth_date);
  body.append("birth_place", data.birth_place);
  body.append("birth_place_code", data.birth_place_code);
  body.append("gender", data.gender);
  body.append("email", data.email);
  body.append("phone", data.phone);
  body.append("fiscal_code", data.fiscal_code);
  body.append("accept_statute", String(data.accept_statute));
  if (data.accepted_statute_version) {
    body.append("accepted_statute_version", data.accepted_statute_version);
  }
  body.append("accept_privacy", String(data.accept_privacy));
  body.append("payment_method", data.payment_method);
  body.append("client_version", clientVersion);

  if (data.id_document) {
    body.append("id_document", data.id_document);
  }
  const res = await fetch(`/api/join/${encodeURIComponent(orgSlug)}/submit`, {
    method: "POST",
    headers: {
      "X-Client-Version": clientVersion,
    },
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

export type GoogleWalletSaveLinkResponse = {
  url: string;
  classId: string;
  objectId: string;
};

export async function createMemberGoogleWalletSaveLink(): Promise<GoogleWalletSaveLinkResponse> {
  const res = await fetch("/api/me/wallet/google/save-link", {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      payload?.detail ??
        "Impossibile generare link Wallet, riprova.",
    );
  }
  return payload;
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

export type MemberOrganizationStatuteResponse = {
  available: boolean;
  filename?: string | null;
  mime_type?: string | null;
  download_url?: string | null;
};

export async function fetchMemberDocuments(): Promise<MemberDocumentsResponse> {
  const res = await fetch("/api/member/documents");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch documents");
  return res.json();
}

export async function fetchMemberOrganizationStatute(): Promise<MemberOrganizationStatuteResponse> {
  const res = await fetch("/api/me/organization/statute");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Errore nel caricamento dello statuto");
  return res.json();
}

export async function downloadMemberOrganizationStatute(
  input?: {
    url?: string | null;
    filename?: string | null;
  },
): Promise<void> {
  const targetUrl = input?.url?.trim() || "/api/me/organization/statute/download";
  const res = await fetch(targetUrl, { method: "GET" });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.detail ?? "Impossibile scaricare lo statuto");
  }

  const blob = await res.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = input?.filename?.trim() || "statuto.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

async function downloadAuthenticatedFile(
  url: string,
  fallbackFilename: string,
  fallbackError: string,
): Promise<void> {
  const res = await fetch(url, { method: "GET" });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.detail ?? fallbackError);
  }

  const blob = await res.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fallbackFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
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
    accounting_enabled: boolean;
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
  accounting_enabled: boolean;
  wallet_bg_color: string | null;
  wallet_logo_url: string | null;
  wallet_hero_image_url: string | null;
  wallet_title_override: string | null;
  wallet_is_test_prefix: boolean;
  communications_enabled: boolean;
  sender_email_local_part: string | null;
  email_from_name_override: string | null;
  reply_to_email: string | null;
  mail_from_domain: string | null;
  wallet_effective_bg_color?: string | null;
  wallet_effective_logo_url?: string | null;
  wallet_effective_hero_image_url?: string | null;
  wallet_effective_title_override?: string | null;
  system_email_sender?: {
    from_name: string | null;
    from_email: string;
    from_header: string;
    reply_to: string | null;
    selected_mode: "system";
    fallback_used: boolean;
  };
  association_email_sender?: {
    from_name: string | null;
    from_email: string;
    from_header: string;
    reply_to: string | null;
    selected_mode: "system" | "association";
    fallback_used: boolean;
  };
};

export type OrgAdminCommunicationSettings = {
  communications_enabled: boolean;
  sender_email_local_part: string | null;
  email_from_name_override: string | null;
  reply_to_email: string | null;
  mail_from_domain: string | null;
  system_email_sender: NonNullable<OrgAdminOrganizationDetail["system_email_sender"]>;
  association_email_sender: NonNullable<OrgAdminOrganizationDetail["association_email_sender"]>;
};

export type OrgAdminCampaignAudienceType =
  | "active_members"
  | "expired_members"
  | "renewal_due_members";

export type OrgAdminEmailCampaign = {
  id: number;
  association_id: number;
  name: string | null;
  subject: string;
  body_html?: string | null;
  body_text?: string | null;
  audience_type: OrgAdminCampaignAudienceType;
  status: string;
  created_at: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number;
  recipient_status_counts: {
    queued: number;
    sent: number;
    failed: number;
  };
  created_by: {
    id: number;
    email: string;
  } | null;
};

export type OrgAdminEmailCampaignRecipient = {
  id: number;
  campaign_id: number;
  association_id: number;
  user_id: number | null;
  recipient_email: string;
  recipient_name: string | null;
  provider_message_id: string | null;
  delivery_status: string | null;
  error_message: string | null;
  created_at: string | null;
  sent_at: string | null;
};

export type OrgAdminEmailTemplate = {
  id: number;
  association_id: number | null;
  is_system: boolean;
  name: string;
  category: string | null;
  subject: string;
  body_html?: string | null;
  body_text?: string | null;
  channel: string;
  is_active: boolean;
  created_by_user_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  is_editable: boolean;
  is_duplicable: boolean;
  scope: "system" | "association";
};

export type OrgAdminEmailTemplateVariable = {
  key: string;
  placeholder: string;
  label: string;
  description: string;
  example: string;
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
  wallet_bg_color?: string | null;
  wallet_title_override?: string | null;
  wallet_is_test_prefix?: boolean;
}): Promise<{ ok: boolean; organization?: OrgAdminOrganizationDetail }> {
  const res = await fetch("/api/org-admin/organization", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento associazione"));
  return res.json();
}

export async function fetchOrgAdminCommunicationSettings(): Promise<OrgAdminCommunicationSettings> {
  const res = await fetch("/api/org-admin/communications/settings");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento impostazioni comunicazioni"));
  return res.json();
}

export async function putOrgAdminCommunicationSettings(data: {
  sender_email_local_part?: string | null;
  email_from_name_override?: string | null;
  reply_to_email?: string | null;
}): Promise<{ ok: boolean; settings: OrgAdminCommunicationSettings }> {
  const res = await fetch("/api/org-admin/communications/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore salvataggio impostazioni comunicazioni"));
  return res.json();
}

export async function sendOrgAdminCommunicationTestEmail(
  toEmail: string,
): Promise<{
  ok: boolean;
  outbox_id: string;
  message: string;
  sender: OrgAdminCommunicationSettings["association_email_sender"];
}> {
  const res = await fetch("/api/org-admin/communications/test-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to_email: toEmail }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore invio email di test"));
  return res.json();
}

export async function fetchOrgAdminCommunicationAudienceEstimate(
  audienceType: OrgAdminCampaignAudienceType,
): Promise<{
  audience_type: string;
  count: number;
  available_audiences: string[];
}> {
  const res = await fetch(
    `/api/org-admin/communications/audience-estimate?audience_type=${encodeURIComponent(audienceType)}`,
  );
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore calcolo audience"));
  return res.json();
}

export async function fetchOrgAdminEmailCampaigns(): Promise<{
  items: OrgAdminEmailCampaign[];
  total: number;
}> {
  const res = await fetch("/api/org-admin/communications/campaigns");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento campagne"));
  return res.json();
}

export async function createOrgAdminEmailCampaign(data: {
  name?: string | null;
  subject: string;
  body_html?: string | null;
  body_text?: string | null;
  audience_type: OrgAdminCampaignAudienceType;
}): Promise<{ ok: boolean; campaign: OrgAdminEmailCampaign }> {
  const res = await fetch("/api/org-admin/communications/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione campagna"));
  return res.json();
}

export async function fetchOrgAdminEmailCampaign(
  campaignId: number,
): Promise<{ campaign: OrgAdminEmailCampaign }> {
  const res = await fetch(`/api/org-admin/communications/campaigns/${campaignId}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento dettaglio campagna"));
  return res.json();
}

export async function sendOrgAdminEmailCampaign(
  campaignId: number,
): Promise<{ ok: boolean; campaign: OrgAdminEmailCampaign; recipient_count: number; message: string }> {
  const res = await fetch(`/api/org-admin/communications/campaigns/${campaignId}/send`, {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore invio campagna"));
  return res.json();
}

export async function fetchOrgAdminEmailCampaignRecipients(
  campaignId: number,
): Promise<{ items: OrgAdminEmailCampaignRecipient[]; total: number }> {
  const res = await fetch(`/api/org-admin/communications/campaigns/${campaignId}/recipients`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento destinatari"));
  return res.json();
}

export async function fetchOrgAdminEmailTemplates(input?: {
  scope?: "all" | "system" | "association";
  includeInactive?: boolean;
}): Promise<{ items: OrgAdminEmailTemplate[]; total: number; scope: string }> {
  const params = new URLSearchParams();
  if (input?.scope) params.set("scope", input.scope);
  if (input?.includeInactive) params.set("include_inactive", "true");
  const res = await fetch(`/api/org-admin/communications/templates${params.toString() ? `?${params.toString()}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento template"));
  return res.json();
}

export async function fetchOrgAdminEmailTemplateVariables(): Promise<{
  items: OrgAdminEmailTemplateVariable[];
  fake_context: Record<string, string>;
}> {
  const res = await fetch("/api/org-admin/communications/templates/variables");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento variabili template"));
  return res.json();
}

export async function fetchOrgAdminEmailTemplate(
  templateId: number,
): Promise<{ template: OrgAdminEmailTemplate }> {
  const res = await fetch(`/api/org-admin/communications/templates/${templateId}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento template"));
  return res.json();
}

export async function createOrgAdminEmailTemplate(data: {
  name: string;
  category?: string | null;
  subject: string;
  body_html?: string | null;
  body_text?: string | null;
  channel?: string;
}): Promise<{ ok: boolean; template: OrgAdminEmailTemplate }> {
  const res = await fetch("/api/org-admin/communications/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione template"));
  return res.json();
}

export async function updateOrgAdminEmailTemplate(
  templateId: number,
  data: {
    name: string;
    category?: string | null;
    subject: string;
    body_html?: string | null;
    body_text?: string | null;
    channel?: string;
    is_active?: boolean;
  },
): Promise<{ ok: boolean; template: OrgAdminEmailTemplate }> {
  const res = await fetch(`/api/org-admin/communications/templates/${templateId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento template"));
  return res.json();
}

export async function duplicateOrgAdminEmailTemplate(
  templateId: number,
  name?: string | null,
): Promise<{ ok: boolean; template: OrgAdminEmailTemplate }> {
  const res = await fetch(`/api/org-admin/communications/templates/${templateId}/duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore duplicazione template"));
  return res.json();
}

export async function archiveOrgAdminEmailTemplate(
  templateId: number,
): Promise<{ ok: boolean; template: OrgAdminEmailTemplate }> {
  const res = await fetch(`/api/org-admin/communications/templates/${templateId}/archive`, {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore archiviazione template"));
  return res.json();
}

export async function previewOrgAdminEmailTemplate(data: {
  template_id?: number;
  subject?: string | null;
  body_html?: string | null;
  body_text?: string | null;
}): Promise<{
  preview: {
    subject: string;
    body_html: string | null;
    body_text: string | null;
  };
  fake_context: Record<string, string>;
}> {
  const res = await fetch("/api/org-admin/communications/templates/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore preview template"));
  return res.json();
}

export async function uploadOrgAdminWalletAssets(
  input: { logo?: File | null; heroImage?: File | null },
): Promise<{
  ok: boolean;
  wallet_logo_url: string | null;
  wallet_hero_image_url: string | null;
  wallet_effective_logo_url?: string | null;
  wallet_effective_hero_image_url?: string | null;
}> {
  const body = new FormData();
  if (input.logo) body.append("logo", input.logo);
  if (input.heroImage) body.append("hero_image", input.heroImage);
  const res = await fetch("/api/org-admin/organization/wallet-assets", {
    method: "POST",
    body,
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 413) {
    throw new Error(await parseApiErrorDetail(res, "File troppo grande (max 2 MB per asset)."));
  }
  if (res.status === 415 || res.status === 422 || res.status === 400) {
    throw new Error(await parseApiErrorDetail(res, "Asset non valido."));
  }
  if (res.status >= 500) {
    throw new Error("Errore server, riprova.");
  }
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nel caricamento asset Wallet"));
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
  if (res.status === 413) {
    throw new Error(await parseApiErrorDetail(res, "File troppo grande (max 10 MB)."));
  }
  if (res.status === 415) {
    throw new Error(await parseApiErrorDetail(res, "Formato non valido: carica un PDF."));
  }
  if (res.status === 422) {
    throw new Error(await parseApiErrorDetail(res, "File non valido."));
  }
  if (res.status >= 500) {
    throw new Error("Errore server, riprova.");
  }
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nel caricamento dello statuto"));
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
  if (res.status === 413) {
    throw new Error(await parseApiErrorDetail(res, "File troppo grande (max 10 MB)."));
  }
  if (res.status === 415) {
    throw new Error(await parseApiErrorDetail(res, "Formato non valido: carica un PDF."));
  }
  if (res.status === 422) {
    throw new Error(await parseApiErrorDetail(res, "File non valido."));
  }
  if (res.status >= 500) {
    throw new Error("Errore server, riprova.");
  }
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nel caricamento dello statuto"));
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

export type OrgAdminReferralStats = {
  sent: number;
  approved: number;
  rewarded: number;
};

export type OrgAdminReferralListItem = {
  id: number;
  application_id: number;
  status: "pending" | "approved" | "rewarded";
  invite_status: "invited" | "completed_by_association" | "under_review" | "approved" | "rejected";
  wheel_enabled: boolean;
  created_at: string | null;
  approved_at: string | null;
  rewarded_at: string | null;
  wheel_spun_at: string | null;
  wheel_spun_by_org_admin_id: number | null;
  organization_name: string;
  applicant_email: string | null;
  reward_code: string | null;
  reward_title: string | null;
  reward_description: string | null;
  reward_delivery_timing: string | null;
  wheel_result: {
    code: string | null;
    title: string | null;
    description: string | null;
    delivery_timing: string | null;
  } | null;
};

export type OrgAdminReferralReward = {
  code: string | null;
  title: string | null;
  description: string | null;
  delivery_timing: string | null;
  rewarded_at: string | null;
};

export type OrgAdminReferralSummary = {
  referral_slug: string;
  referral_link: string;
  invite_route: string;
  stats: OrgAdminReferralStats;
  pending_reward_referrals: OrgAdminReferralListItem[];
  recent_referrals: OrgAdminReferralListItem[];
  latest_reward: OrgAdminReferralReward | null;
  reward_options: Array<{ code: string; title: string; delivery_timing: string }>;
};

export type OrgAdminReferralInvitesResponse = {
  items: OrgAdminReferralListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export type OrgAdminReferralInviteResponse = {
  ok: boolean;
  application_id: number;
  status: string;
  invite_url: string;
  referral_id: number | null;
  invite_status?: "invited" | "completed_by_association" | "under_review" | "approved" | "rejected";
  wheel_enabled?: boolean;
};

export async function fetchOrgAdminReferralSummary(): Promise<OrgAdminReferralSummary> {
  const res = await fetch("/api/org-admin/referrals/summary");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento referral."));
  return res.json();
}

export async function spinOrgAdminReferralReward(
  referralId: number,
): Promise<{
  ok: boolean;
  referral_id: number;
  status: "approved" | "rewarded";
  reward: OrgAdminReferralReward;
  wheel_result: {
    code: string | null;
    title: string | null;
    description: string | null;
    delivery_timing: string | null;
  } | null;
  wheel_spun_at: string | null;
  wheel_spun_by_org_admin_id: number | null;
  message: string;
  super_admin_note: string;
}> {
  const res = await fetch(`/api/org-admin/referrals/${referralId}/spin`, {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore durante la ruota premi."));
  return res.json();
}

export async function fetchOrgAdminReferralInvites(
  params?: { page?: number; pageSize?: number; q?: string; status?: string },
): Promise<OrgAdminReferralInvitesResponse> {
  const sp = new URLSearchParams();
  sp.set("page", String(params?.page ?? 1));
  sp.set("page_size", String(params?.pageSize ?? 20));
  if (params?.q) sp.set("q", params.q);
  if (params?.status) sp.set("status", params.status);
  const query = sp.toString();
  const res = await fetch(`/api/org-admin/referrals/invites${query ? `?${query}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento inviti."));
  return res.json();
}

export async function createOrgAdminReferralInvite(payload: {
  applicant_email: string;
  organization_name: string;
  notes?: string;
}): Promise<OrgAdminReferralInviteResponse> {
  const res = await fetch("/api/org-admin/referrals/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione invito."));
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
  email_status?: string;
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
  created_at: string | null;
  year: number;
  range_start: number;
  range_end: number;
  quantity: number;
  status_label: string;
};

export type CardMovementsResponse = {
  items: CardMovement[];
  total: number;
  current_year?: number;
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
  whatsapp_e164?: string | null;
  card_email_subject?: string | null;
  card_logo_url?: string | null;
  description: string | null;
  is_active: boolean;
  is_archived?: boolean;
  deleted_at?: string | null;
  created_at: string | null;
  city: string | null;
  province: string | null;
  auto_approve_signup?: boolean;
  accounting_enabled?: boolean;
  communications_enabled?: boolean;
  card_min: number | null;
  card_max: number | null;
  affiliation_application_id?: number | null;
  affiliation_status?: string | null;
};

export type SuperAdminOrganizationsResponse = {
  items: SuperAdminOrganization[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  data?: SuperAdminOrganization[];
  meta?: {
    page: number;
    limit: number;
    page_size?: number;
    total: number;
    total_pages?: number;
  };
};

export async function fetchSuperAdminOrganizations(
  params?: {
    page?: number;
    pageSize?: number;
    q?: string;
    sort?: string;
    signal?: AbortSignal;
  }
): Promise<SuperAdminOrganizationsResponse> {
  const sp = new URLSearchParams();
  sp.set("page", String(params?.page ?? 1));
  sp.set("page_size", String(params?.pageSize ?? 50));
  if (params?.q) sp.set("q", params.q);
  if (params?.sort) sp.set("sort", params.sort);

  const query = sp.toString();
  const res = await fetch(`/api/admin/organizations${query ? `?${query}` : ""}`, {
    signal: params?.signal,
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 403) throw new Error("Accesso negato");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nel caricamento associazioni"));
  return res.json();
}

export type SuperAdminDocumentTarget = {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  accounting_enabled: boolean;
};

export type SuperAdminSharedDocument = {
  id: number;
  title: string;
  description: string | null;
  kind: "general" | "accounting";
  created_at: string | null;
  original_filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  recipient_count: number;
  recipient_preview: Array<{
    id: number;
    name: string;
    slug: string;
    accounting_enabled: boolean;
    assigned_at: string | null;
  }>;
  recipients?: Array<{
    id: number;
    name: string;
    slug: string;
    accounting_enabled: boolean;
    assigned_at: string | null;
  }>;
  download_url: string;
  uploaded_by: {
    id: number;
    email: string;
  } | null;
};

export async function fetchSuperAdminDocumentTargets(): Promise<{
  items: SuperAdminDocumentTarget[];
  total: number;
}> {
  const res = await fetch("/api/super-admin/documents/targets");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nel caricamento destinatari"));
  return res.json();
}

export async function createSuperAdminSharedDocument(input: {
  title: string;
  description?: string;
  kind: "general" | "accounting";
  targetMode: "single" | "multiple" | "all" | "accounting_enabled";
  associationIds?: number[];
  file: File;
}): Promise<{ ok: boolean; document: SuperAdminSharedDocument }> {
  const body = new FormData();
  body.append("title", input.title);
  if (input.description) body.append("description", input.description);
  body.append("kind", input.kind);
  body.append("target_mode", input.targetMode);
  if (input.associationIds?.length) {
    body.append("association_ids", JSON.stringify(input.associationIds));
  }
  body.append("file", input.file);

  const res = await fetch("/api/super-admin/documents", {
    method: "POST",
    body,
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore invio documento"));
  return res.json();
}

export async function fetchSuperAdminSharedDocuments(params?: {
  kind?: "general" | "accounting";
}): Promise<{ items: SuperAdminSharedDocument[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.kind) sp.set("kind", params.kind);
  const res = await fetch(`/api/super-admin/documents${sp.toString() ? `?${sp.toString()}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento archivio documenti"));
  return res.json();
}

export async function fetchSuperAdminSharedDocumentDetail(
  documentId: number,
): Promise<SuperAdminSharedDocument> {
  const res = await fetch(`/api/super-admin/documents/${documentId}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Documento non trovato");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento documento"));
  return res.json();
}

export async function downloadSuperAdminSharedDocument(
  document: Pick<SuperAdminSharedDocument, "download_url" | "original_filename">,
): Promise<void> {
  await downloadAuthenticatedFile(
    document.download_url,
    document.original_filename || "documento",
    "Impossibile scaricare il documento",
  );
}

export type AffiliationDraftPerson = {
  id: number;
  role: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  fiscal_code: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AffiliationDraftDocument = {
  id: number;
  doc_type: string;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  status: string;
  review_notes: string | null;
  rejection_note: string | null;
  uploaded_at: string | null;
  reviewed_at: string | null;
  download_url: string;
};

export type AffiliationVideoJob = {
  id: number;
  application_id: number;
  mode: "review" | "payment_pending" | "approved";
  status: "queued" | "processing" | "done" | "failed";
  provider: string;
  output_url: string | null;
  error_text: string | null;
  requested_at: string | null;
  started_at: string | null;
  finished_at: string | null;
};

export type AffiliationReferral = {
  id: number;
  referrer_org_id: number;
  referrer_org_slug: string | null;
  referrer_org_name: string | null;
  status: "pending" | "approved" | "rewarded";
  wheel_enabled: boolean;
  created_at: string | null;
  approved_at: string | null;
  rewarded_at: string | null;
  wheel_spun_at: string | null;
  wheel_spun_by_org_admin_id: number | null;
  reward_code: string | null;
  reward_title: string | null;
  reward_description: string | null;
  reward_delivery_timing: string | null;
  wheel_result: {
    code: string | null;
    title: string | null;
    description: string | null;
    delivery_timing: string | null;
  } | null;
};

export type AffiliationDraft = {
  id: number;
  public_token: string;
  status: string;
  docs_status: string;
  payment_method: string | null;
  payment_status: string;
  payment_amount_cents: number;
  organization_name: string | null;
  organization_legal_name: string | null;
  organization_slug_candidate: string | null;
  tax_code: string | null;
  vat_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  applicant_full_name: string | null;
  applicant_email: string | null;
  applicant_phone: string | null;
  notes: string | null;
  manual_preferred_date: string | null;
  manual_preferred_time: string | null;
  manual_contact: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  approved_org_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  required_document_types: string[];
  resume_url: string;
  payment_config: {
    stripe_enabled: boolean;
    bank_iban: string;
    bank_causale_prefix: string;
    cash_location: string;
    reference_code: string | null;
  };
  can_approve: boolean;
  latest_video_job: AffiliationVideoJob | null;
  welcome_video_url: string | null;
  welcome_video_ready: boolean;
  welcome_video_error: string | null;
  referral: AffiliationReferral | null;
  people: AffiliationDraftPerson[];
  documents: AffiliationDraftDocument[];
};

export type AffiliationSubmitResponse = {
  ok: boolean;
  status: string;
  payment_status: string;
  message: string;
  next_steps: string[];
  latest_video_job: AffiliationVideoJob | null;
  application: AffiliationDraft;
};

type AffiliationRequestOptions = {
  idempotencyKey?: string;
};

function buildAffiliationHeaders(
  options?: AffiliationRequestOptions,
  extra?: HeadersInit,
): HeadersInit {
  const headers = new Headers(extra);
  const idempotencyKey = options?.idempotencyKey?.trim();
  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }
  return headers;
}

export async function createAffiliationDraft(
  payload?: {
    applicant_email?: string;
    organization_name?: string;
    organization_legal_name?: string;
    tax_code?: string;
    vat_number?: string;
    referral_slug?: string;
  },
  options?: AffiliationRequestOptions,
): Promise<AffiliationDraft & { resume_url_absolute?: string }> {
  const res = await fetch("/api/affiliazione/draft", {
    method: "POST",
    headers: buildAffiliationHeaders(options, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Impossibile creare la bozza."));
  return res.json();
}

export async function fetchAffiliationDraft(
  token: string,
): Promise<AffiliationDraft> {
  const res = await fetch(`/api/affiliazione/draft/${encodeURIComponent(token)}`);
  if (res.status === 404) throw new Error("Bozza affiliazione non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nel caricamento bozza."));
  return res.json();
}

export async function patchAffiliationDraft(
  token: string,
  payload: Partial<{
    organization_name: string | null;
    organization_legal_name: string | null;
    organization_slug_candidate: string | null;
    tax_code: string | null;
    vat_number: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    country: string | null;
    applicant_full_name: string | null;
    applicant_email: string | null;
    applicant_phone: string | null;
    notes: string | null;
    payment_method: "stripe" | "bank_transfer" | "cash" | null;
    manual_preferred_date: string | null;
    manual_preferred_time: string | null;
    manual_contact: string | null;
  }>,
): Promise<AffiliationDraft> {
  const res = await fetch(`/api/affiliazione/draft/${encodeURIComponent(token)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore salvataggio bozza."));
  return res.json();
}

export async function replaceAffiliationPeople(
  token: string,
  items: Array<{
    role: string;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    fiscal_code?: string | null;
  }>,
): Promise<AffiliationDraft> {
  const res = await fetch(`/api/affiliazione/draft/${encodeURIComponent(token)}/people`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore salvataggio cariche."));
  return res.json();
}

export async function uploadAffiliationDocument(
  token: string,
  docType: string,
  file: File,
): Promise<{ ok: boolean; document: AffiliationDraftDocument; docs_status: string }> {
  const body = new FormData();
  body.append("doc_type", docType);
  body.append("file", file);
  const res = await fetch(`/api/affiliazione/draft/${encodeURIComponent(token)}/documents`, {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore upload documento."));
  return res.json();
}

export async function createAffiliationStripeCheckout(
  token: string,
  options?: AffiliationRequestOptions,
): Promise<{ ok: boolean; checkout_url: string; session_id: string; payment_status: string }> {
  const res = await fetch(`/api/affiliazione/draft/${encodeURIComponent(token)}/stripe/checkout`, {
    method: "POST",
    headers: buildAffiliationHeaders(options),
  });
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione checkout Stripe."));
  return res.json();
}

export async function submitAffiliationDraft(
  token: string,
  options?: AffiliationRequestOptions,
): Promise<AffiliationSubmitResponse> {
  const res = await fetch(`/api/affiliazione/draft/${encodeURIComponent(token)}/submit`, {
    method: "POST",
    headers: buildAffiliationHeaders(options),
  });
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore invio richiesta affiliazione."));
  return res.json();
}

export async function retryAffiliationWelcomeVideo(
  token: string,
  options?: AffiliationRequestOptions,
): Promise<{
  ok: boolean;
  status: "queued" | "ready";
  welcome_video_url: string | null;
  latest_video_job: AffiliationVideoJob | null;
  application: AffiliationDraft;
}> {
  const res = await fetch(`/api/affiliazione/draft/${encodeURIComponent(token)}/video/retry`, {
    method: "POST",
    headers: buildAffiliationHeaders(options),
  });
  if (!res.ok) {
    throw new Error(await parseApiErrorDetail(res, "Errore riavvio generazione video."));
  }
  return res.json();
}

export type OrgSharedDocumentKind = "general" | "accounting";

export type OrgAdminNotification = {
  id: number;
  type: "document_general" | "document_accounting" | "low_cards" | string;
  title: string;
  body: string;
  href: string;
  is_read: boolean;
  created_at: string | null;
  read_at: string | null;
};

export type OrgSharedDocumentItem = {
  id: number;
  title: string;
  description: string | null;
  kind: OrgSharedDocumentKind;
  created_at: string | null;
  original_filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  download_url: string;
};

export async function fetchOrgAdminSharedDocuments(
  kind: OrgSharedDocumentKind,
): Promise<{ items: OrgSharedDocumentItem[]; total: number }> {
  const sp = new URLSearchParams();
  sp.set("kind", kind);
  const res = await fetch(`/api/org-admin/shared-documents?${sp.toString()}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 403) throw new Error(await parseApiErrorDetail(res, "Accesso negato"));
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nel caricamento documenti"));
  return res.json();
}

export async function downloadOrgAdminSharedDocument(
  document: Pick<OrgSharedDocumentItem, "download_url" | "original_filename">,
): Promise<void> {
  await downloadAuthenticatedFile(
    document.download_url,
    document.original_filename || "documento",
    "Impossibile scaricare il documento",
  );
}

export async function fetchOrgAdminNotifications(
  limit = 20,
): Promise<{ items: OrgAdminNotification[]; unread_count: number }> {
  const sp = new URLSearchParams();
  sp.set("limit", String(limit));
  const res = await fetch(`/api/org-admin/notifications?${sp.toString()}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nel caricamento notifiche"));
  return res.json();
}

export async function fetchOrgAdminUnreadNotificationCount(): Promise<{ unread_count: number }> {
  const res = await fetch("/api/org-admin/notifications/unread-count");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nel caricamento badge notifiche"));
  return res.json();
}

export async function markOrgAdminNotificationRead(
  notificationId: number,
): Promise<{ ok: boolean; notification: OrgAdminNotification }> {
  const res = await fetch(`/api/org-admin/notifications/${notificationId}/read`, {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Notifica non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento notifica"));
  return res.json();
}

export async function markAllOrgAdminNotificationsRead(): Promise<{ ok: boolean; updated: number }> {
  const res = await fetch("/api/org-admin/notifications/read-all", {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento notifiche"));
  return res.json();
}

export type SuperAdminAffiliationListItem = {
  id: number;
  public_token: string | null;
  organization_name: string | null;
  applicant_email: string | null;
  status: string;
  docs_status: string;
  payment_method: string | null;
  payment_status: string;
  submitted_at: string | null;
  created_at: string | null;
  can_approve: boolean;
};

export type SuperAdminAffiliationsResponse = {
  items: SuperAdminAffiliationListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export type SuperAdminAffiliationDetail = Omit<
  AffiliationDraft,
  "public_token" | "resume_url"
> & {
  public_token: string | null;
  resume_url: string | null;
  events: Array<Record<string, unknown>>;
  video_jobs: AffiliationVideoJob[];
};

export async function fetchSuperAdminAffiliations(
  params?: { page?: number; pageSize?: number; q?: string; status?: string },
): Promise<SuperAdminAffiliationsResponse> {
  const sp = new URLSearchParams();
  sp.set("page", String(params?.page ?? 1));
  sp.set("page_size", String(params?.pageSize ?? 20));
  if (params?.q) sp.set("q", params.q);
  if (params?.status) sp.set("status", params.status);
  const query = sp.toString();
  const res = await fetch(`/api/super-admin/affiliations${query ? `?${query}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 403) throw new Error("Accesso negato");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento affiliazioni."));
  return res.json();
}

export async function fetchSuperAdminAffiliationDetail(
  applicationId: number,
): Promise<SuperAdminAffiliationDetail> {
  const res = await fetch(`/api/super-admin/affiliations/${applicationId}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Affiliazione non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore dettaglio affiliazione."));
  return res.json();
}

export async function reviewSuperAdminAffiliationDocument(
  applicationId: number,
  documentId: number,
  payload: { status: "approved" | "rejected"; notes?: string | null },
): Promise<{ ok: boolean; docs_status: string; application_status: string; document: AffiliationDraftDocument }> {
  const res = await fetch(
    `/api/super-admin/affiliations/${applicationId}/documents/${documentId}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore review documento."));
  return res.json();
}

export async function verifySuperAdminAffiliationPayment(
  applicationId: number,
  payload: { verified: boolean; notes?: string | null },
): Promise<{ ok: boolean; payment_status: string; can_approve: boolean }> {
  const res = await fetch(`/api/super-admin/affiliations/${applicationId}/payment/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore verifica pagamento."));
  return res.json();
}

export async function requestChangesSuperAdminAffiliation(
  applicationId: number,
  notes: string,
): Promise<{ ok: boolean; status: string; docs_status: string }> {
  const res = await fetch(`/api/super-admin/affiliations/${applicationId}/request-changes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore richiesta modifiche."));
  return res.json();
}

export async function approveSuperAdminAffiliation(
  applicationId: number,
  notes?: string,
): Promise<{ ok: boolean; status: string; approved_org_id: number; org_admin_id: number | null; organization_slug: string | null }> {
  const res = await fetch(`/api/super-admin/affiliations/${applicationId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore approvazione affiliazione."));
  return res.json();
}

export async function rejectSuperAdminAffiliation(
  applicationId: number,
  notes: string,
): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`/api/super-admin/affiliations/${applicationId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore rifiuto affiliazione."));
  return res.json();
}

export async function deleteSuperAdminAffiliationDraft(
  applicationId: number,
): Promise<{ ok: boolean; deleted_id: number }> {
  const res = await fetch(`/api/super-admin/affiliations/${applicationId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore eliminazione bozza."));
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
  const requestId =
    (typeof payload?.request_id === "string" && payload.request_id.trim()
      ? payload.request_id.trim()
      : null) ||
    (res.headers.get("X-Request-Id") || "").trim() ||
    null;
  const withReference = (message: string) =>
    requestId && !message.includes("(ref:")
      ? `${message} (ref: ${requestId})`
      : message;
  const detail = payload?.detail;
  if (typeof detail === "string" && detail.trim()) {
    return withReference(detail);
  }
  if (detail && typeof detail === "object") {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return withReference(message);
    }
    const issues = (detail as { issues?: unknown }).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      const first = issues[0] as { message?: unknown };
      if (typeof first?.message === "string" && first.message.trim()) {
        return withReference(first.message);
      }
    }
  }
  return withReference(fallback);
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
  whatsapp_e164?: string;
  card_email_subject?: string;
  card_logo_url?: string;
  city?: string;
  province?: string;
  description_short?: string;
  is_active?: boolean;
  auto_approve_signup?: boolean;
  accounting_enabled?: boolean;
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
    whatsapp_e164?: string | null;
    card_email_subject?: string | null;
    card_logo_url?: string | null;
    description?: string;
    is_active?: boolean;
    auto_approve_signup?: boolean;
    accounting_enabled?: boolean;
    communications_enabled?: boolean;
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
  is_enabled: boolean;
  is_active: boolean;
  status_label: string;
  notes: string | null;
  total: number;
  assigned: number;
  remaining: number;
  linked_members: number;
  range_editable: boolean;
  deletable: boolean;
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

export type PatchOrgCardLotPayload = {
  status?: "active" | "inactive";
  year?: number;
  notes?: string | null;
  range_start?: number;
  range_end?: number;
};

export async function patchOrgCardLot(
  orgId: number,
  lotId: number,
  payload: PatchOrgCardLotPayload,
): Promise<{ ok: boolean; item: OrgBatch }> {
  const res = await fetch(`/api/admin/organizations/${orgId}/card-lots/${lotId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Lotto tessere non trovato");
  if (res.status === 409) {
    throw new Error(await parseApiErrorDetail(res, "Operazione bloccata"));
  }
  if (res.status === 400) {
    throw new Error(await parseApiErrorDetail(res, "Dati lotto non validi"));
  }
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nella modifica del lotto"));
  return res.json();
}

export async function deleteOrgCardLot(
  orgId: number,
  lotId: number,
): Promise<{ ok: boolean; deleted_lot_id: number }> {
  const res = await fetch(`/api/admin/organizations/${orgId}/card-lots/${lotId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Lotto tessere non trovato");
  if (res.status === 409) {
    throw new Error(await parseApiErrorDetail(res, "Operazione bloccata"));
  }
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nell'eliminazione del lotto"));
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
