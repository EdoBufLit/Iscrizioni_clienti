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
  membership_type?: "annual" | "temporary" | null;
  membership_type_label?: string | null;
  valid_until?: string | null;
  card_verification_url?: string | null;
  card?: {
    number: number | null;
    status: string | null;
    year: number | null;
    verification_url: string | null;
    membership_type?: "annual" | "temporary" | null;
    valid_until?: string | null;
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
  stripeConnectDemoEnabled?: boolean;
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
  require_membership_document: boolean;
  adults_only_banner_enabled?: boolean;
  membership_payment?: {
    enabled: boolean;
    required: boolean;
    label: string | null;
    amount: number | null;
    currency: string | null;
    button_label: string | null;
    custom_types_enabled?: boolean;
    temporary_amount?: number | null;
    temporary_duration_value?: number;
    temporary_duration_unit?: "hours" | "days";
  };
  membership_config?: {
    custom_types_enabled: boolean;
    available_types: Array<"annual" | "temporary">;
    annual_fee_amount: number | null;
    temporary_fee_amount: number | null;
    currency: string | null;
    temporary_duration_value: number;
    temporary_duration_unit: "hours" | "days";
    temporary_duration_label: string;
  };
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
    throw new Error(data?.message ?? data?.detail ?? "Socio già presente.");
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

export async function requestPasswordReset(
  email: string,
): Promise<{ status: string; message: string }> {
  const body = new FormData();
  body.append("email", email);
  const res = await fetch("/api/auth/password-reset/request", { method: "POST", body });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export async function confirmPasswordReset(data: {
  token: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ status: string; message: string }> {
  const body = new FormData();
  body.append("token", data.token);
  body.append("new_password", data.newPassword);
  body.append("confirm_password", data.confirmPassword);
  const res = await fetch("/api/auth/password-reset/confirm", { method: "POST", body });
  if (res.status === 400) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.detail ?? "Dati non validi");
  }
  if (!res.ok) throw new Error("Reset failed");
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
    birth_place_foreign?: boolean;
    gender: "M" | "F";
    email: string;
    phone: string;
    fiscal_code: string;
    accept_statute: boolean;
    accepted_statute_version: string | null;
    accept_privacy: boolean;
    payment_method: "CASH" | "BONIFICO";
    membership_type?: "annual" | "temporary";
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
  body.append("birth_place_foreign", String(Boolean(data.birth_place_foreign)));
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
  if (data.membership_type) body.append("membership_type", data.membership_type);
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

export type MemberBookingItem = {
  id: number;
  status: string;
  customer_name: string;
  booking_date: string | null;
  booking_time: string | null;
  party_size: number | null;
  notes_preview: string | null;
  event_summary: string | null;
  customer_note: string | null;
  customer_note_submitted_at: string | null;
  customer_note_reviewed_at: string | null;
  has_unreviewed_customer_note: boolean;
  created_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  source_form: {
    id: number;
    title: string;
  } | null;
};

export type MemberBookingsResponse = {
  items: MemberBookingItem[];
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

export async function fetchMemberBookings(): Promise<MemberBookingsResponse> {
  const res = await fetch("/api/member/bookings");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch bookings");
  return res.json();
}

export async function submitMemberBookingNote(
  bookingId: number,
  note: string,
): Promise<{ booking: MemberBookingItem }> {
  const res = await fetch(`/api/member/bookings/${bookingId}/note`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(payload?.detail ?? "Impossibile inviare la richiesta.");
  }
  return payload;
}

export async function verifyOrgAdminCode(
  email: string,
  code: string,
): Promise<{ ok: boolean; redirect_to?: string }> {
  const body = new FormData();
  body.append("email", email);
  body.append("code", code);
  const res = await fetch("/api/org-admin/auth/verify-code", {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error("Invalid or expired code");
  return res.json();
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
  booking_whatsapp_reminder_enabled: boolean;
  booking_whatsapp_reminder_hours_before: number;
  booking_whatsapp_reminder_template: string | null;
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
  membership_config?: {
    custom_types_enabled: boolean;
    available_types: Array<"annual" | "temporary">;
    annual_fee_amount: number | null;
    temporary_fee_amount: number | null;
    currency: string | null;
    temporary_duration_value: number;
    temporary_duration_unit: "hours" | "days";
    temporary_duration_label: string;
  };
};

export type OrgAdminMembershipSettings = {
  custom_membership_types_enabled: boolean;
  membership_fee_amount: number | null;
  temporary_membership_fee_amount: number | null;
  membership_fee_currency: string | null;
  temporary_membership_duration_value: number;
  temporary_membership_duration_unit: "hours" | "days";
  card_logo_url?: string | null;
  card_style_locked?: boolean;
  card_style: OrgAdminCardStyle;
};

export type OrgAdminCardStyle = {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  text_color: string;
  muted_text_color: string;
  font_family: "classic" | "modern" | "serif";
  surface_pattern: "geometric" | "soft" | "none";
  logo_mode: "none" | "visible" | "watermark" | "both";
  logo_position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  logo_opacity: number;
  logo_blend: "normal" | "soft" | "multiply";
  remove_logo_background: boolean;
  back_title: string;
  back_body: string;
  back_show_member: boolean;
};

export type OrgAdminCommunicationSettings = {
  communications_enabled: boolean;
  whatsapp_enabled?: boolean;
  whatsapp_provider?: string | null;
  whatsapp_evolution_enabled: boolean;
  sender_email_local_part: string | null;
  email_from_name_override: string | null;
  reply_to_email: string | null;
  booking_whatsapp_reminder_enabled: boolean;
  booking_whatsapp_reminder_hours_before: number;
  booking_whatsapp_reminder_template: string | null;
  mail_from_domain: string | null;
  system_email_sender: NonNullable<OrgAdminOrganizationDetail["system_email_sender"]>;
  association_email_sender: NonNullable<OrgAdminOrganizationDetail["association_email_sender"]>;
};

export type OrgAdminCommunicationUsage = {
  period_start: string;
  period_end: string;
  period_label: string;
  included_limit: number;
  used: number;
  extra: number;
  extra_cost_cents: number;
  extra_cost_eur: number;
  unit_extra_cost_cents: number;
};

export type OrgAdminWhatsAppConnectionStatus =
  | "not_connected"
  | "qr_required"
  | "connected"
  | "error";

export type OrgAdminWhatsAppConnection = {
  status: OrgAdminWhatsAppConnectionStatus;
  provider?: string | null;
  provider_instance_id?: string | null;
  provider_configured?: boolean;
  phone_number: string | null;
  profile_name: string | null;
  has_qr: boolean;
  qr_code: string | null;
  last_error: string | null;
  last_healthcheck_at?: string | null;
  updated_at: string | null;
};

export type WhatsAppProviderName = "evolution" | "green_api";

export type SuperAdminWhatsAppProviderSettings = OrgAdminWhatsAppConnection & {
  provider: WhatsAppProviderName | string;
  provider_instance_id: string | null;
  provider_configured: boolean;
  provider_token_configured: boolean;
  webhook_secret_configured: boolean;
  provider_api_url: string | null;
};

export type OrgAdminWhatsAppChat = {
  id: number;
  display_name: string;
  external_chat_id: string;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
};

export type OrgAdminWhatsAppMessage = {
  id: number;
  external_message_id: string | null;
  direction: "inbound" | "outbound" | string;
  status: string;
  sender_phone: string | null;
  recipient_phone: string | null;
  text_body: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type OrgAdminWhatsAppOutboundInput = {
  number: string;
  text: string;
  display_name?: string | null;
};

export type OrgAdminWhatsAppDraftChatInput = {
  number: string;
  display_name?: string | null;
};

export type OrgAdminWhatsAppContact = {
  remote_jid: string;
  display_name: string;
  phone_number: string | null;
  profile_pic_url: string | null;
  updated_at: string | null;
};

export type OrgAdminStripeDemoAccountStatus = {
  id: string | null;
  display_name: string | null;
  contact_email: string | null;
  country: string | null;
  dashboard: string | null;
  requirements_status: string | null;
  card_payments_status: string | null;
  ready_to_process_payments: boolean;
  onboarding_complete: boolean;
  raw: Record<string, unknown>;
};

export type OrgAdminStripeDemoState = {
  enabled: boolean;
  message?: string;
  publishable_key?: string;
  base_url?: string;
  connected_account_id: string | null;
  subscription_status: string | null;
  subscription_id: string | null;
  account: OrgAdminStripeDemoAccountStatus | null;
};

export type StripeDemoProduct = {
  id: string;
  name: string | null;
  description: string | null;
  active: boolean;
  default_price: {
    id: string | null;
    unit_amount: number | null;
    currency: string | null;
  };
};

export type OrgAdminCampaignAudienceType =
  | "active_members"
  | "expired_members"
  | "renewal_due_members";

export type OrgAdminCampaignRecipientMode =
  | "all_members"
  | "selected_members";

export type OrgAdminEmailCtaKind =
  | "none"
  | "form"
  | "document"
  | "renewal"
  | "custom";

export type OrgAdminEmailLayoutKey =
  | "essential"
  | "institutional"
  | "invitation"
  | "renewal"
  | "modern"
  | "elegant"
  | "event"
  | "reminder";

export type OrgAdminEmailFontPreset =
  | "modern_sans"
  | "editorial"
  | "classic";

export type OrgAdminEmailCtaStyle =
  | "solid"
  | "soft"
  | "outline"
  | "shadow";

export type OrgAdminEmailDesign = {
  accent_color: string;
  button_color: string;
  hide_logo: boolean;
  logo_url: string;
  hero_image_url: string;
  email_title: string;
  content_image_url?: string;
  cta_label: string;
  cta_note: string;
  cta_kind: OrgAdminEmailCtaKind;
  cta_url: string;
  layout_key: OrgAdminEmailLayoutKey;
  show_association_name: boolean;
  font_preset: OrgAdminEmailFontPreset;
  cta_style: OrgAdminEmailCtaStyle;
  secondary_image_url: string;
  highlight_title: string;
  highlight_body: string;
  event_details: string;
  signature_name: string;
  signature_role: string;
  final_note: string;
  style_preset?: string;
  button_style?: string;
  hero_kicker?: string;
  hero_title?: string;
  highlight_box?: string;
  signature?: string;
  section_order?: OrgAdminEmailSectionKey[];
};

export type OrgAdminEmailTemplateType =
  | "newsletter"
  | "event"
  | "renewal_reminder"
  | "booking_confirmation"
  | "booking_rejection"
  | "generic_notice";

export type OrgAdminEmailEditorStatus = "draft" | "ready";

export type OrgAdminEmailSectionKey =
  | "hero"
  | "body"
  | "cta"
  | "highlight"
  | "event"
  | "signature"
  | "final_note";

export type OrgAdminLinkedFormSummary = {
  id: number;
  title: string;
  public_slug: string;
  public_path: string;
  public_url: string | null;
};

export type OrgAdminEmailCampaign = {
  id: number;
  association_id: number;
  name: string | null;
  source_template_id?: number | null;
  subject: string;
  body_html?: string | null;
  body_text?: string | null;
  compiled_html?: string | null;
  mjml_source?: string | null;
  grapesjs_project_json?: Record<string, unknown> | null;
  audience_type: OrgAdminCampaignAudienceType;
  recipient_mode: OrgAdminCampaignRecipientMode;
  selected_member_ids: number[];
  selected_member_count: number;
  target_summary: string;
  planned_recipient_count: number;
  status: string;
  editor_status: OrgAdminEmailEditorStatus;
  created_at: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  design: OrgAdminEmailDesign;
  linked_form_id: number | null;
  linked_form: OrgAdminLinkedFormSummary | null;
  source_template?: OrgAdminEmailTemplate | null;
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
  template_type: OrgAdminEmailTemplateType;
  subject: string;
  body_html?: string | null;
  body_text?: string | null;
  compiled_html?: string | null;
  mjml_source?: string | null;
  grapesjs_project_json?: Record<string, unknown> | null;
  channel: string;
  is_active: boolean;
  editor_status: OrgAdminEmailEditorStatus;
  created_by_user_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  is_editable: boolean;
  is_duplicable: boolean;
  scope: "system" | "association";
  design: OrgAdminEmailDesign;
  linked_form_id: number | null;
  linked_form: OrgAdminLinkedFormSummary | null;
};

export type OrgAdminEmailTemplateVariable = {
  key: string;
  placeholder: string;
  label: string;
  description: string;
  example: string;
};

export type OrgAdminEmailBuilderAsset = {
  id: number;
  association_id: number;
  created_by_user_id: number | null;
  name: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  public_url: string;
  created_at: string | null;
  updated_at: string | null;
};

export type AssociationFormVisibility = "public" | "members_only";

export type AssociationFormFieldType =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "time"
  | "select"
  | "radio"
  | "checkbox"
  | "consent";

export type AssociationFormField = {
  id: number;
  form_id: number;
  field_key: string;
  field_type: AssociationFormFieldType;
  label: string;
  placeholder: string | null;
  help_text: string | null;
  is_required: boolean;
  sort_order: number;
  options: string[];
};

export type AssociationFormActionTemplate = {
  id: number;
  name: string;
  subject: string;
  is_system: boolean;
  is_active: boolean;
};

export type AssociationFormType = "generic" | "booking" | "request" | "survey";

export type AssociationForm = {
  id: number;
  association_id: number;
  title: string;
  description: string | null;
  accent_color: string | null;
  submit_button_text: string | null;
  show_logo: boolean;
  cover_image_url: string | null;
  page_style: string;
  font_preset: string;
  public_slug: string;
  is_active: boolean;
  visibility: AssociationFormVisibility;
  success_message: string | null;
  notification_email: string | null;
  allow_multiple_submissions: boolean;
  form_type: AssociationFormType;
  booking_enabled: boolean;
  booking_requires_manual_confirmation: boolean;
  booking_success_message_override: string | null;
  booking_notification_enabled: boolean;
  booking_admin_confirmation_email_enabled: boolean;
  booking_admin_confirmation_email_subject: string | null;
  booking_admin_confirmation_email_body: string | null;
  booking_auto_assign_enabled: boolean;
  booking_field_mapping: Record<string, string>;
  booking_event_date: string | null;
  booking_event_time: string | null;
  booking_event_details: string | null;
  booking_dynamic_events_enabled: boolean;
  booking_availability_mode: "all" | "selected" | string;
  booking_event_series_ids: number[];
  survey_post_event_enabled: boolean;
  survey_post_event_delay_hours: number;
  survey_post_event_message_template: string | null;
  notify_admin_on_submit: boolean;
  send_user_confirmation: boolean;
  whatsapp_auto_reply_enabled: boolean;
  whatsapp_auto_reply_template: string | null;
  whatsapp_confirmation_template: string | null;
  whatsapp_rejection_template: string | null;
  admin_notification_template_id: number | null;
  user_confirmation_template_id: number | null;
  create_internal_request: boolean;
  create_booking: boolean;
  created_by_user_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  field_count: number;
  submission_count: number;
  submission_status_counts: {
    total: number;
    pending: number;
    confirmed: number;
    rejected: number;
  };
  booking_count: number;
  fields: AssociationFormField[];
  whatsapp_automations?: OrgAdminWhatsAppAutomation[];
  public_path?: string;
  design: {
    title: string;
    description: string | null;
    accent_color: string | null;
    submit_button_text: string | null;
    show_logo: boolean;
    cover_image_url: string | null;
    page_style: string;
    font_preset: string;
  };
  actions: {
    save_submission: boolean;
    notify_admin_on_submit: boolean;
    send_user_confirmation: boolean;
    whatsapp_auto_reply_enabled: boolean;
    whatsapp_auto_reply_template: string | null;
    whatsapp_confirmation_template: string | null;
    whatsapp_rejection_template: string | null;
    admin_notification_template: AssociationFormActionTemplate | null;
    user_confirmation_template: AssociationFormActionTemplate | null;
    create_internal_request: boolean;
    create_booking: boolean;
    booking_enabled: boolean;
    booking_requires_manual_confirmation: boolean;
    booking_notification_enabled: boolean;
    booking_admin_confirmation_email_enabled: boolean;
    booking_admin_confirmation_email_subject: string | null;
    booking_admin_confirmation_email_body: string | null;
    booking_field_mapping: Record<string, string>;
    booking_event_date: string | null;
    booking_event_time: string | null;
    booking_event_details: string | null;
    booking_dynamic_events_enabled: boolean;
    booking_availability_mode: "all" | "selected" | string;
    booking_event_series_ids: number[];
    survey_post_event_enabled: boolean;
    survey_post_event_delay_hours: number;
    survey_post_event_message_template: string | null;
    connected_whatsapp_automations?: OrgAdminWhatsAppAutomation[];
  };
};

export type OrgAdminWhatsAppAutomation = {
  id: number;
  association_id: number;
  form_id: number | null;
  form: {
    id: number;
    title: string;
    public_slug: string;
    public_path: string;
  } | null;
  name: string;
  source_type: string;
  trigger_event: string;
  recipient_type: string;
  phone_source: string;
  phone_field_key: string | null;
  custom_phone: string | null;
  template_name: string;
  template_body: string;
  is_active: boolean;
  created_by_user_id: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AssociationFormSubmission = {
  id: number;
  form_id: number;
  association_id: number;
  submitted_by_user_id: number | null;
  submitted_at: string | null;
  status: string;
  payload_json: Record<string, unknown>;
  reviewed_at: string | null;
  review_reason: string | null;
  reviewed_by: {
    id: number;
    email: string | null;
  } | null;
  available_actions: {
    set_pending: boolean;
    confirm: boolean;
    reject: boolean;
  };
  submitted_by: {
    id: number;
    name: string | null;
    email: string | null;
  } | null;
  booking: {
    id: number;
    status: string;
    customer_name: string;
    booking_date: string | null;
    booking_time: string | null;
    party_size: number | null;
  } | null;
};

export type PublicAssociationForm = AssociationForm & {
  association: {
    id: number;
    name: string | null;
    slug: string | null;
  };
};

export type AssociationBookingEvent = {
  id: number;
  booking_id: number;
  event_type: string;
  payload_json: Record<string, unknown>;
  created_at: string | null;
  created_by_user_id: number | null;
};

export type AssociationBooking = {
  id: number;
  association_id: number;
  form_id: number | null;
  submission_id: number | null;
  status: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  booking_date: string | null;
  booking_time: string | null;
  party_size: number | null;
  notes: string | null;
  notes_preview: string | null;
  event_summary: string | null;
  customer_note: string | null;
  customer_note_submitted_at: string | null;
  customer_note_reviewed_at: string | null;
  has_unreviewed_customer_note: boolean;
  customer_reminder_response: {
    status: "confirmed" | "cancelled" | "note" | string;
    label: string;
    event_type: string;
    created_at: string | null;
  } | null;
  room_id: number | null;
  table_id: number | null;
  room: {
    id: number;
    name: string;
    is_active: boolean;
  } | null;
  table: {
    id: number;
    name: string;
    capacity: number;
    shape: string;
    room_id: number;
    is_active: boolean;
    is_out_of_service: boolean;
  } | null;
  created_at: string | null;
  updated_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  source_form: {
    id: number;
    title: string;
    public_slug: string;
  } | null;
  submission: {
    id: number;
    submitted_at: string | null;
    status: string | null;
  } | null;
  request_status: string | null;
  request_review_summary: {
    status: string | null;
    reviewed_at: string | null;
    review_reason: string | null;
    reviewed_by: {
      id: number;
      email: string | null;
    } | null;
  } | null;
  request_payload_summary: Array<{
    key: string;
    label: string;
    value: string;
  }>;
  events: AssociationBookingEvent[];
};

export type PublicBookingReminderResponse = {
  ok: boolean;
  action: "confirm" | "cancel" | "note" | string;
  expired?: boolean;
  title?: string;
  message?: string;
  booking?: {
    customer_name: string;
    booking_date: string | null;
    booking_time: string | null;
    party_size: number | null;
    event_summary: string | null;
  };
};

export type BookingEventTimeSlot = {
  id: number;
  event_series_id: number;
  time: string;
  start_time?: string;
  is_active: boolean;
  sort_order: number;
};

export type OrgAdminBookingEventSeries = {
  id: number;
  association_id: number;
  name: string;
  title?: string;
  description: string | null;
  recurrence_type: "weekly" | "date" | string;
  weekday: number | null;
  specific_date: string | null;
  event_date?: string | null;
  is_active: boolean;
  is_default?: boolean;
  is_closed?: boolean;
  created_at: string | null;
  updated_at: string | null;
  time_slots: BookingEventTimeSlot[];
};

export type BookingEventSeriesListResponse = {
  items: OrgAdminBookingEventSeries[];
  total: number;
  using_default?: boolean;
  has_active_rules?: boolean;
  date_open?: boolean;
  available_slots?: string[];
  date_closed?: boolean;
};

export type PublicBookingAvailableDate = {
  date: string;
  available_slots: string[];
  using_default: boolean;
  has_active_rules: boolean;
  date_open: boolean;
  date_closed: boolean;
};

export type PublicBookingAvailableDatesResponse = {
  items: PublicBookingAvailableDate[];
  start_date: string;
  days: number;
};

export type AssociationRoom = {
  id: number;
  association_id: number;
  name: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  table_count: number;
  booking_count: number;
};

export type AssociationRoomTable = {
  id: number;
  association_id: number;
  room_id: number;
  name: string;
  capacity: number;
  shape: "round" | "square" | "rectangle" | string;
  pos_x: number;
  pos_y: number;
  width: number | null;
  height: number | null;
  is_active: boolean;
  is_out_of_service: boolean;
  created_at: string | null;
  updated_at: string | null;
  occupancy_state: "free" | "semi_free" | "reserved" | "occupied" | "out_of_service" | string;
  active_booking: {
    id: number;
    status: string;
    customer_name: string;
    booking_date: string | null;
    booking_time: string | null;
    party_size: number | null;
    form_title: string | null;
  } | null;
  active_bookings?: Array<{
    id: number;
    status: string;
    customer_name: string;
    booking_date: string | null;
    booking_time: string | null;
    party_size: number | null;
    form_title: string | null;
  }>;
  occupied_seats?: number;
  remaining_seats?: number;
};

export type AssociationRoomMap = {
  room: AssociationRoom;
  focus_date: string | null;
  focus_time: string | null;
  tables: AssociationRoomTable[];
  totals: {
    tables: number;
    free: number;
    reserved: number;
    semi_free?: number;
    occupied: number;
    out_of_service: number;
  };
};

export async function fetchOrgAdminOrganization(): Promise<OrgAdminOrganizationDetail> {
  const res = await fetch("/api/org-admin/organization");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch organization");
  return res.json();
}

export async function fetchOrgAdminMembershipSettings(): Promise<OrgAdminMembershipSettings> {
  const res = await fetch("/api/org-admin/organization/membership-settings");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error("Failed to fetch membership settings");
  return res.json();
}

export async function patchOrgAdminMembershipSettings(data: {
  membership_fee_amount?: number | null;
  temporary_membership_fee_amount?: number | null;
  membership_fee_currency?: string | null;
  temporary_membership_duration_value?: number | null;
  temporary_membership_duration_unit?: "hours" | "days" | null;
  card_style?: OrgAdminCardStyle;
}): Promise<{ ok: boolean; settings: OrgAdminMembershipSettings }> {
  const res = await fetch("/api/org-admin/organization/membership-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore salvataggio impostazioni tessera"));
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

export async function fetchOrgAdminStripeDemoState(): Promise<OrgAdminStripeDemoState> {
  const res = await fetch("/api/org-admin/stripe-demo");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) {
    return {
      enabled: false,
      message: "Stripe Connect demo non attivo in questo ambiente.",
      connected_account_id: null,
      subscription_status: null,
      subscription_id: null,
      account: null,
    };
  }
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento Stripe demo"));
  return res.json();
}

export async function createOrgAdminStripeConnectedAccount(): Promise<{
  created: boolean;
  connected_account_id: string;
  account: OrgAdminStripeDemoAccountStatus;
}> {
  const res = await fetch("/api/stripe/connect/account", { method: "POST" });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione account Stripe demo"));
  return res.json();
}

export async function fetchOrgAdminStripeConnectedAccountStatus(): Promise<{
  connected_account_id: string | null;
  account: OrgAdminStripeDemoAccountStatus | null;
}> {
  const res = await fetch("/api/stripe/connect/account/status");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento stato account Stripe demo"));
  return res.json();
}

export async function createOrgAdminStripeOnboardingLink(): Promise<{
  url: string;
  expires_at?: string | null;
  connected_account_id: string;
}> {
  const res = await fetch("/api/stripe/connect/account/onboarding-link", {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione link onboarding Stripe demo"));
  return res.json();
}

export async function fetchOrgAdminStripeDemoProducts(): Promise<{ items: StripeDemoProduct[] }> {
  const res = await fetch("/api/stripe/connect/demo-products");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento prodotti demo Stripe"));
  return res.json();
}

export async function createOrgAdminStripeDemoProduct(data: {
  name: string;
  description?: string | null;
  priceInCents: number;
  currency: string;
}): Promise<{ product: StripeDemoProduct }> {
  const res = await fetch("/api/stripe/connect/demo-products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione prodotto demo Stripe"));
  return res.json();
}

export async function createOrgAdminStripePlatformSubscriptionCheckout(): Promise<{
  url: string;
  id: string;
}> {
  const res = await fetch("/api/stripe/platform-subscription/checkout", {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione checkout subscription demo"));
  return res.json();
}

export async function createOrgAdminStripePlatformPortal(): Promise<{
  url: string;
  id: string;
}> {
  const res = await fetch("/api/stripe/platform-subscription/portal", {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore apertura portale subscription demo"));
  return res.json();
}

export async function fetchStripeDemoStorefrontProducts(accountId: string): Promise<{ items: StripeDemoProduct[] }> {
  const res = await fetch(`/api/stripe/connect-demo/storefront/${encodeURIComponent(accountId)}/products`);
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento storefront demo Stripe"));
  return res.json();
}

export async function createStripeDemoStorefrontCheckout(
  accountId: string,
  data: { productId: string; quantity: number },
): Promise<{ url: string; id: string }> {
  const res = await fetch(`/api/stripe/connect-demo/storefront/${encodeURIComponent(accountId)}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione checkout storefront demo"));
  return res.json();
}

export async function fetchOrgAdminCommunicationSettings(): Promise<OrgAdminCommunicationSettings> {
  const res = await fetch("/api/org-admin/communications/settings");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento impostazioni comunicazioni"));
  return res.json();
}

export async function uploadOrgAdminCardAssets(
  input: { logo: File; removeBackground?: boolean },
): Promise<{ ok: boolean; card_logo_url: string | null; settings: OrgAdminMembershipSettings }> {
  const body = new FormData();
  body.append("logo", input.logo);
  body.append("remove_background", input.removeBackground ? "true" : "false");
  const res = await fetch("/api/org-admin/organization/card-assets", {
    method: "POST",
    body,
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 413) throw new Error(await parseApiErrorDetail(res, "File troppo grande (max 2 MB)."));
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento logo tessera"));
  return res.json();
}

export async function fetchOrgAdminCommunicationUsage(): Promise<OrgAdminCommunicationUsage> {
  const res = await fetch("/api/org-admin/communications/usage");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento consumo email comunicazioni"));
  return res.json();
}

export async function putOrgAdminCommunicationSettings(data: {
  sender_email_local_part?: string | null;
  email_from_name_override?: string | null;
  reply_to_email?: string | null;
  booking_whatsapp_reminder_enabled?: boolean;
  booking_whatsapp_reminder_hours_before?: number;
  booking_whatsapp_reminder_template?: string | null;
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
  provider_message_id: string;
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

export async function fetchOrgAdminWhatsAppConnection(): Promise<OrgAdminWhatsAppConnection> {
  const res = await fetch("/api/org-admin/communications/whatsapp/connection");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento stato WhatsApp"));
  return res.json();
}

export async function connectOrgAdminWhatsApp(): Promise<{
  ok: boolean;
  connection: OrgAdminWhatsAppConnection;
}> {
  const res = await fetch("/api/org-admin/communications/whatsapp/connect", {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore avvio connessione WhatsApp"));
  return res.json();
}

export async function fetchOrgAdminWhatsAppQr(): Promise<OrgAdminWhatsAppConnection> {
  const res = await fetch("/api/org-admin/communications/whatsapp/qr");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento QR WhatsApp"));
  return res.json();
}

export async function disconnectOrgAdminWhatsApp(): Promise<{
  ok: boolean;
  connection: OrgAdminWhatsAppConnection;
}> {
  const res = await fetch("/api/org-admin/communications/whatsapp/disconnect", {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore disconnessione WhatsApp"));
  return res.json();
}

export async function fetchOrgAdminWhatsAppChats(): Promise<{
  items: OrgAdminWhatsAppChat[];
  total: number;
}> {
  const res = await fetch("/api/org-admin/communications/whatsapp/chats");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento chat WhatsApp"));
  return res.json();
}

export async function fetchOrgAdminWhatsAppContacts(): Promise<{
  items: OrgAdminWhatsAppContact[];
  total: number;
}> {
  const res = await fetch("/api/org-admin/communications/whatsapp/contacts");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento contatti WhatsApp"));
  return res.json();
}

export async function fetchOrgAdminWhatsAppMessages(
  chatId: number,
): Promise<{
  chat: OrgAdminWhatsAppChat;
  items: OrgAdminWhatsAppMessage[];
  total: number;
}> {
  const res = await fetch(`/api/org-admin/communications/whatsapp/chats/${chatId}/messages`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento messaggi WhatsApp"));
  return res.json();
}

export async function sendOrgAdminWhatsAppMessage(
  chatId: number,
  text: string,
): Promise<{
  ok: boolean;
  message: OrgAdminWhatsAppMessage;
}> {
  const res = await fetch(`/api/org-admin/communications/whatsapp/chats/${chatId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore invio messaggio WhatsApp"));
  return res.json();
}

export async function openOrgAdminWhatsAppDraftChat(
  input: OrgAdminWhatsAppDraftChatInput,
): Promise<{
  ok: boolean;
  chat: OrgAdminWhatsAppChat;
}> {
  const res = await fetch("/api/org-admin/communications/whatsapp/draft-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore apertura chat WhatsApp"));
  return res.json();
}

export async function startOrgAdminWhatsAppChat(
  input: OrgAdminWhatsAppOutboundInput,
): Promise<{
  ok: boolean;
  chat: OrgAdminWhatsAppChat;
  message: OrgAdminWhatsAppMessage;
}> {
  const res = await fetch("/api/org-admin/communications/whatsapp/outbound", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore avvio nuova chat WhatsApp"));
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

export async function searchOrgAdminCommunicationMembers(input?: {
  q?: string;
  limit?: number;
}): Promise<OrgAdminMembersResponse> {
  const params = new URLSearchParams();
  if (input?.q?.trim()) params.set("q", input.q.trim());
  if (input?.limit) params.set("limit", String(input.limit));
  const res = await fetch(
    `/api/org-admin/communications/member-search${params.toString() ? `?${params.toString()}` : ""}`,
  );
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore ricerca soci"));
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
  compiled_html?: string | null;
  mjml_source?: string | null;
  grapesjs_project_json?: Record<string, unknown> | null;
  audience_type: OrgAdminCampaignAudienceType;
  recipient_mode?: OrgAdminCampaignRecipientMode;
  member_ids?: number[];
  scheduled_at?: string | null;
  design?: Partial<OrgAdminEmailDesign> | null;
  linked_form_id?: number | null;
  source_template_id?: number | null;
  editor_status?: OrgAdminEmailEditorStatus | null;
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

export async function updateOrgAdminEmailCampaign(
  campaignId: number,
  data: {
    name?: string | null;
    subject: string;
    body_html?: string | null;
    body_text?: string | null;
    compiled_html?: string | null;
    mjml_source?: string | null;
    grapesjs_project_json?: Record<string, unknown> | null;
    audience_type: OrgAdminCampaignAudienceType;
    recipient_mode?: OrgAdminCampaignRecipientMode;
    member_ids?: number[];
    scheduled_at?: string | null;
    design?: Partial<OrgAdminEmailDesign> | null;
    linked_form_id?: number | null;
    source_template_id?: number | null;
    editor_status?: OrgAdminEmailEditorStatus | null;
  },
): Promise<{ ok: boolean; campaign: OrgAdminEmailCampaign }> {
  const res = await fetch(`/api/org-admin/communications/campaigns/${campaignId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento campagna"));
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

export async function createMembershipPaymentCheckout(
  orgSlug: string,
  data: {
    first_name: string;
    last_name: string;
    birth_date: string;
    birth_place: string;
    birth_place_code: string;
    birth_place_foreign?: boolean;
    gender: "M" | "F";
    email: string;
    phone: string;
    fiscal_code: string;
    password?: string;
    accept_statute: boolean;
    accepted_statute_version: string | null;
    accept_privacy: boolean;
    membership_type?: "annual" | "temporary";
    id_document?: File | null;
  },
): Promise<{ payment_id: number; hosted_checkout_url: string }> {
  const body = new FormData();
  body.append("first_name", data.first_name);
  body.append("last_name", data.last_name);
  body.append("birth_date", data.birth_date);
  body.append("birth_place", data.birth_place);
  body.append("birth_place_code", data.birth_place_code);
  body.append("birth_place_foreign", String(Boolean(data.birth_place_foreign)));
  body.append("gender", data.gender);
  body.append("email", data.email);
  body.append("phone", data.phone);
  body.append("fiscal_code", data.fiscal_code);
  if (data.password) body.append("password", data.password);
  body.append("accept_statute", String(data.accept_statute));
  if (data.accepted_statute_version) {
    body.append("accepted_statute_version", data.accepted_statute_version);
  }
  body.append("accept_privacy", String(data.accept_privacy));
  if (data.membership_type) body.append("membership_type", data.membership_type);
  if (data.id_document) {
    body.append("id_document", data.id_document);
  }

  let res: Response;
  try {
    res = await fetch(
      `/api/public/orgs/${encodeURIComponent(orgSlug)}/membership-payment/create-checkout`,
      {
        method: "POST",
        body,
      },
    );
  } catch {
    throw new Error(
      "Connessione interrotta durante la creazione del pagamento. I dati non sono stati inviati: controlla la rete e riprova da questo riepilogo.",
    );
  }
  if (res.status === 404) throw new Error("Associazione non trovata.");
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.detail ?? "Errore durante la creazione del checkout.");
  }
  return res.json();
}

export type MembershipPaymentStatusResponse = {
  payment_status: string;
  is_paid: boolean;
  card_status: string;
  message: string;
  can_retry: boolean;
  active_card_page_url?: string | null;
  card_verification_token?: string | null;
  card_verification_url?: string | null;
  card_download_url?: string | null;
  card_wallet_apple_url?: string | null;
  card_wallet_google_url?: string | null;
};

export async function fetchMembershipPaymentStatus(
  paymentId: number,
): Promise<MembershipPaymentStatusResponse> {
  const res = await fetch(`/api/public/membership-payments/${paymentId}/status`);
  if (res.status === 404) throw new Error("Pagamento non trovato.");
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.detail ?? "Errore nel recupero dello stato pagamento.");
  }
  return res.json();
}

export async function deleteOrgAdminEmailCampaign(
  campaignId: number,
): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/org-admin/communications/campaigns/${campaignId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore eliminazione campagna"));
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
  template_type?: OrgAdminEmailTemplateType | null;
  subject: string;
  body_html?: string | null;
  body_text?: string | null;
  compiled_html?: string | null;
  mjml_source?: string | null;
  grapesjs_project_json?: Record<string, unknown> | null;
  channel?: string;
  editor_status?: OrgAdminEmailEditorStatus | null;
  design?: Partial<OrgAdminEmailDesign> | null;
  linked_form_id?: number | null;
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
    template_type?: OrgAdminEmailTemplateType | null;
    subject: string;
    body_html?: string | null;
    body_text?: string | null;
    compiled_html?: string | null;
    mjml_source?: string | null;
    grapesjs_project_json?: Record<string, unknown> | null;
    channel?: string;
    is_active?: boolean;
    editor_status?: OrgAdminEmailEditorStatus | null;
    design?: Partial<OrgAdminEmailDesign> | null;
    linked_form_id?: number | null;
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

export async function deleteOrgAdminEmailTemplate(
  templateId: number,
): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/org-admin/communications/templates/${templateId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore eliminazione template"));
  return res.json();
}

export async function fetchOrgAdminForms(): Promise<{
  items: AssociationForm[];
  total: number;
  field_types: AssociationFormFieldType[];
  visibility_options: AssociationFormVisibility[];
}> {
  const res = await fetch("/api/org-admin/forms");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento form"));
  return res.json();
}

export async function createOrgAdminForm(data: {
  title: string;
  description?: string | null;
  accent_color?: string | null;
  submit_button_text?: string | null;
  show_logo?: boolean;
  cover_image_url?: string | null;
  page_style?: string | null;
  public_slug?: string | null;
  is_active?: boolean;
  visibility?: AssociationFormVisibility;
  success_message?: string | null;
  notification_email?: string | null;
  allow_multiple_submissions?: boolean;
  form_type?: AssociationFormType;
  booking_enabled?: boolean;
  booking_requires_manual_confirmation?: boolean;
  booking_success_message_override?: string | null;
  booking_notification_enabled?: boolean;
  booking_admin_confirmation_email_enabled?: boolean;
  booking_admin_confirmation_email_subject?: string | null;
  booking_admin_confirmation_email_body?: string | null;
  booking_auto_assign_enabled?: boolean;
  booking_field_mapping?: Record<string, string>;
  booking_event_date?: string | null;
  booking_event_time?: string | null;
  booking_event_details?: string | null;
  booking_dynamic_events_enabled?: boolean;
  booking_availability_mode?: "all" | "selected" | string;
  booking_event_series_ids?: number[];
  font_preset?: string | null;
  survey_post_event_enabled?: boolean;
  survey_post_event_delay_hours?: number;
  survey_post_event_message_template?: string | null;
  notify_admin_on_submit?: boolean;
  send_user_confirmation?: boolean;
  whatsapp_auto_reply_enabled?: boolean;
  whatsapp_auto_reply_template?: string | null;
  whatsapp_confirmation_template?: string | null;
  whatsapp_rejection_template?: string | null;
  admin_notification_template_id?: number | null;
  user_confirmation_template_id?: number | null;
  create_internal_request?: boolean;
  create_booking?: boolean;
}): Promise<{ form: AssociationForm }> {
  const res = await fetch("/api/org-admin/forms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione form"));
  return res.json();
}

export async function fetchOrgAdminForm(formId: number): Promise<{ form: AssociationForm }> {
  const res = await fetch(`/api/org-admin/forms/${formId}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento dettaglio form"));
  return res.json();
}

export async function updateOrgAdminForm(
  formId: number,
  data: {
    title: string;
    description?: string | null;
    accent_color?: string | null;
    submit_button_text?: string | null;
    show_logo?: boolean;
    cover_image_url?: string | null;
    page_style?: string | null;
    public_slug?: string | null;
    is_active?: boolean;
  visibility?: AssociationFormVisibility;
  success_message?: string | null;
  notification_email?: string | null;
  allow_multiple_submissions?: boolean;
  form_type?: AssociationFormType;
  booking_enabled?: boolean;
  booking_requires_manual_confirmation?: boolean;
  booking_success_message_override?: string | null;
  booking_notification_enabled?: boolean;
  booking_admin_confirmation_email_enabled?: boolean;
  booking_admin_confirmation_email_subject?: string | null;
  booking_admin_confirmation_email_body?: string | null;
  booking_auto_assign_enabled?: boolean;
  booking_field_mapping?: Record<string, string>;
  booking_event_date?: string | null;
  booking_event_time?: string | null;
  booking_event_details?: string | null;
  booking_dynamic_events_enabled?: boolean;
  booking_availability_mode?: "all" | "selected" | string;
  booking_event_series_ids?: number[];
  font_preset?: string | null;
  survey_post_event_enabled?: boolean;
  survey_post_event_delay_hours?: number;
  survey_post_event_message_template?: string | null;
  notify_admin_on_submit?: boolean;
  send_user_confirmation?: boolean;
  whatsapp_auto_reply_enabled?: boolean;
  whatsapp_auto_reply_template?: string | null;
  whatsapp_confirmation_template?: string | null;
  whatsapp_rejection_template?: string | null;
  admin_notification_template_id?: number | null;
  user_confirmation_template_id?: number | null;
  create_internal_request?: boolean;
    create_booking?: boolean;
  },
): Promise<{ form: AssociationForm }> {
  const res = await fetch(`/api/org-admin/forms/${formId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento form"));
  return res.json();
}

export async function deleteOrgAdminForm(formId: number): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/org-admin/forms/${formId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore eliminazione form"));
  return res.json();
}

export async function duplicateOrgAdminForm(
  formId: number,
  data?: { title?: string | null; public_slug?: string | null },
): Promise<{ form: AssociationForm }> {
  const res = await fetch(`/api/org-admin/forms/${formId}/duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {}),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore duplicazione form"));
  return res.json();
}

export async function setOrgAdminFormActive(
  formId: number,
  isActive: boolean,
): Promise<{ form: AssociationForm }> {
  const res = await fetch(`/api/org-admin/forms/${formId}/${isActive ? "activate" : "deactivate"}`, {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento stato form"));
  return res.json();
}

export async function createOrgAdminFormField(
  formId: number,
  data: {
    field_key?: string | null;
    field_type: AssociationFormFieldType;
    label: string;
    placeholder?: string | null;
    help_text?: string | null;
    is_required?: boolean;
    sort_order?: number;
    options?: string[] | string | null;
  },
): Promise<{ field: AssociationFormField }> {
  const res = await fetch(`/api/org-admin/forms/${formId}/fields`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione campo"));
  return res.json();
}

export async function updateOrgAdminFormField(
  formId: number,
  fieldId: number,
  data: {
    field_key?: string | null;
    field_type: AssociationFormFieldType;
    label: string;
    placeholder?: string | null;
    help_text?: string | null;
    is_required?: boolean;
    sort_order?: number;
    options?: string[] | string | null;
  },
): Promise<{ field: AssociationFormField }> {
  const res = await fetch(`/api/org-admin/forms/${formId}/fields/${fieldId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento campo"));
  return res.json();
}

export async function deleteOrgAdminFormField(
  formId: number,
  fieldId: number,
): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/org-admin/forms/${formId}/fields/${fieldId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore eliminazione campo"));
  return res.json();
}

export async function fetchOrgAdminFormSubmissions(
  formId: number,
): Promise<{ form: AssociationForm; items: AssociationFormSubmission[]; total: number }> {
  const res = await fetch(`/api/org-admin/forms/${formId}/submissions`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento risposte"));
  return res.json();
}

export async function fetchOrgAdminFormSubmission(
  formId: number,
  submissionId: number,
): Promise<{ submission: AssociationFormSubmission }> {
  const res = await fetch(`/api/org-admin/forms/${formId}/submissions/${submissionId}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento dettaglio risposta"));
  return res.json();
}

export async function updateOrgAdminFormSubmissionStatus(
  formId: number,
  submissionId: number,
  data: {
    status: "pending" | "confirmed" | "rejected";
    reason?: string | null;
    whatsapp_message?: string | null;
  },
): Promise<{
  submission: AssociationFormSubmission;
  booking: AssociationBooking | null;
  whatsapp_result: {
    sent?: boolean;
    sent_count?: number;
    processed?: number;
    trigger_event?: string | null;
    reason?: string | null;
    error?: string | null;
    status?: string | null;
  };
}> {
  const res = await fetch(`/api/org-admin/forms/${formId}/submissions/${submissionId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento richiesta"));
  return res.json();
}

export function buildOrgAdminFormSubmissionsExportUrl(formId: number): string {
  return `/api/org-admin/forms/${formId}/submissions/export.csv`;
}

export async function fetchPublicForm(
  orgSlugOrSlug: string,
  slug?: string,
): Promise<{ form: PublicAssociationForm }> {
  const path = slug
    ? `/api/forms/${encodeURIComponent(orgSlugOrSlug)}/${encodeURIComponent(slug)}`
    : `/api/forms/${encodeURIComponent(orgSlugOrSlug)}`;
  const res = await fetch(path);
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento form pubblico"));
  return res.json();
}

export async function fetchPublicFormBookingEvents(
  orgSlugOrSlug: string,
  slugOrDate: string,
  maybeDateOrOptions?: string | { time?: string | null },
  maybeOptions?: { time?: string | null },
): Promise<BookingEventSeriesListResponse> {
  const scoped = typeof maybeDateOrOptions === "string";
  const dateValue = scoped ? maybeDateOrOptions : slugOrDate;
  const timeValue = scoped ? maybeOptions?.time : maybeDateOrOptions?.time;
  const path = scoped
    ? `/api/forms/${encodeURIComponent(orgSlugOrSlug)}/${encodeURIComponent(slugOrDate)}/booking-events`
    : `/api/forms/${encodeURIComponent(orgSlugOrSlug)}/booking-events`;
  const params = new URLSearchParams({ date: dateValue });
  if (timeValue) params.set("time", timeValue);
  const res = await fetch(`${path}?${params.toString()}`);
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento serate prenotabili"));
  return normalizeBookingEventSeriesList(await res.json());
}

export async function fetchPublicFormBookingAvailableDates(
  orgSlugOrSlug: string,
  slugOrOptions?: string | { start?: string | null; days?: number | null },
  maybeOptions?: { start?: string | null; days?: number | null },
): Promise<PublicBookingAvailableDatesResponse> {
  const scoped = typeof slugOrOptions === "string";
  const options = scoped ? maybeOptions : slugOrOptions;
  const path = scoped
    ? `/api/forms/${encodeURIComponent(orgSlugOrSlug)}/${encodeURIComponent(slugOrOptions)}/booking-available-dates`
    : `/api/forms/${encodeURIComponent(orgSlugOrSlug)}/booking-available-dates`;
  const params = new URLSearchParams();
  if (options?.start) params.set("start", options.start);
  if (options?.days) params.set("days", String(options.days));
  const res = await fetch(`${path}${params.toString() ? `?${params.toString()}` : ""}`);
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento giorni disponibili"));
  const payload = await res.json();
  const items = Array.isArray(payload?.items)
    ? payload.items
        .map((item: any) => ({
          date: String(item?.date || ""),
          available_slots: Array.isArray(item?.available_slots)
            ? item.available_slots.map((slot: unknown) => String(slot || "").slice(0, 5)).filter(Boolean)
            : [],
          using_default: Boolean(item?.using_default),
          has_active_rules: Boolean(item?.has_active_rules),
          date_open: item?.date_open !== false,
          date_closed: Boolean(item?.date_closed),
        }))
        .filter((item: PublicBookingAvailableDate) => item.date)
    : [];
  return {
    items,
    start_date: String(payload?.start_date || ""),
    days: Number(payload?.days || items.length || 0),
  };
}

export async function submitPublicForm(
  orgSlugOrSlug: string,
  slugOrPayload: string | Record<string, unknown>,
  maybePayload?: Record<string, unknown>,
): Promise<{
  ok: boolean;
  message: string;
  submission: AssociationFormSubmission;
  booking: AssociationBooking | null;
}> {
  const scoped = typeof slugOrPayload === "string";
  const path = scoped
    ? `/api/forms/${encodeURIComponent(orgSlugOrSlug)}/${encodeURIComponent(slugOrPayload)}/submit`
    : `/api/forms/${encodeURIComponent(orgSlugOrSlug)}/submit`;
  const payload = (scoped ? maybePayload : slugOrPayload) as Record<string, unknown>;
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore invio form"));
  return res.json();
}

export async function fetchOrgAdminBookings(input?: {
  status?: string;
  formId?: number | null;
  bookingDate?: string | null;
}): Promise<{ items: AssociationBooking[]; total: number }> {
  const params = new URLSearchParams();
  if (input?.status) params.set("status", input.status);
  if (input?.formId) params.set("form_id", String(input.formId));
  if (input?.bookingDate) params.set("booking_date", input.bookingDate);
  const res = await fetch(`/api/org-admin/bookings${params.toString() ? `?${params.toString()}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento prenotazioni"));
  return res.json();
}

export async function fetchOrgAdminBooking(
  bookingId: number,
): Promise<{ booking: AssociationBooking }> {
  const res = await fetch(`/api/org-admin/bookings/${bookingId}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento dettaglio prenotazione"));
  return res.json();
}

export async function createOrgAdminBooking(data: {
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  booking_date?: string | null;
  booking_time?: string | null;
  party_size?: number | null;
  room_id?: number | null;
  table_id?: number | null;
  status: string;
  notes?: string | null;
}): Promise<{ booking: AssociationBooking }> {
  const res = await fetch(`/api/org-admin/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione prenotazione manuale"));
  return res.json();
}

export async function updateOrgAdminBooking(
  bookingId: number,
  data: {
    status: string;
    room_id?: number | null;
    table_id?: number | null;
    notes?: string | null;
    notify_customer?: boolean;
    customer_name?: string | null;
    customer_email?: string | null;
    customer_phone?: string | null;
    booking_date?: string | null;
    booking_time?: string | null;
    party_size?: number | null;
  },
): Promise<{ booking: AssociationBooking }> {
  const res = await fetch(`/api/org-admin/bookings/${bookingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento prenotazione"));
  return res.json();
}

export async function updateOrgAdminBookingPhone(
  bookingId: number,
  data: { customer_phone: string | null },
): Promise<{ booking: AssociationBooking }> {
  const res = await fetch(`/api/org-admin/bookings/${bookingId}/phone`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento telefono prenotazione"));
  return res.json();
}

export async function rejectOrgAdminBookingWithoutMessage(
  bookingId: number,
): Promise<{ booking: AssociationBooking }> {
  const res = await fetch(`/api/org-admin/bookings/${bookingId}/reject-silent`, { method: "POST" });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore rigetto senza messaggio"));
  return res.json();
}

export async function markOrgAdminBookingCustomerNoteRead(
  bookingId: number,
): Promise<{ booking: AssociationBooking }> {
  const res = await fetch(`/api/org-admin/bookings/${bookingId}/customer-note/read`, { method: "POST" });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore lettura nota cliente"));
  return res.json();
}

export async function fetchPublicBookingReminderResponse(
  token: string,
): Promise<PublicBookingReminderResponse> {
  const res = await fetch(`/api/public/bookings/response/${encodeURIComponent(token)}/json`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Link prenotazione non valido"));
  return res.json();
}

export async function submitPublicBookingReminderResponse(
  token: string,
  note?: string,
): Promise<PublicBookingReminderResponse> {
  const body = new FormData();
  if (note !== undefined) body.append("note", note);
  const res = await fetch(`/api/public/bookings/response/${encodeURIComponent(token)}/json`, {
    method: "POST",
    body,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore registrazione risposta"));
  return res.json();
}

type BookingEventSeriesInput = {
  name: string;
  description?: string | null;
  recurrence_type?: "weekly" | "date" | string;
  weekday?: number | null;
  specific_date?: string | null;
  is_active?: boolean;
  is_default?: boolean;
  is_closed?: boolean;
  time_slots?: string[];
};

function normalizeBookingEventSeries(raw: any): OrgAdminBookingEventSeries {
  const rawSlots = Array.isArray(raw?.time_slots) ? raw.time_slots : [];
  return {
    id: Number(raw?.id || 0),
    association_id: Number(raw?.association_id || 0),
    name: String(raw?.name ?? raw?.title ?? ""),
    title: raw?.title ?? raw?.name ?? "",
    description: raw?.description ?? null,
    recurrence_type: raw?.recurrence_type ?? "weekly",
    weekday: typeof raw?.weekday === "number" ? raw.weekday : null,
    specific_date: raw?.specific_date ?? raw?.event_date ?? null,
    event_date: raw?.event_date ?? raw?.specific_date ?? null,
    is_active: Boolean(raw?.is_active),
    is_default: Boolean(raw?.is_default),
    is_closed: Boolean(raw?.is_closed),
    created_at: raw?.created_at ?? null,
    updated_at: raw?.updated_at ?? null,
    time_slots: rawSlots
      .map((slot: any, index: number) => {
        const timeValue = typeof slot === "string" ? slot : slot?.time ?? slot?.start_time ?? "";
        return {
          id: typeof slot === "object" && slot?.id ? Number(slot.id) : index,
          event_series_id:
            typeof slot === "object" && slot?.event_series_id
              ? Number(slot.event_series_id)
              : Number(raw?.id || 0),
          time: String(timeValue || "").slice(0, 5),
          start_time: typeof slot === "object" ? slot?.start_time ?? timeValue : timeValue,
          is_active: typeof slot === "object" && slot?.is_active !== undefined ? Boolean(slot.is_active) : true,
          sort_order: typeof slot === "object" && typeof slot?.sort_order === "number" ? slot.sort_order : index,
        };
      })
      .filter((slot: BookingEventTimeSlot) => slot.time),
  };
}

function normalizeBookingEventSeriesList(payload: any): BookingEventSeriesListResponse {
  const items: OrgAdminBookingEventSeries[] = Array.isArray(payload?.items) ? payload.items.map(normalizeBookingEventSeries) : [];
  const uniqueSlots = (slots: string[]) => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    slots.forEach((slot) => {
      const normalized = String(slot || "").slice(0, 5);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      ordered.push(normalized);
    });
    return ordered;
  };
  const derivedSlots = uniqueSlots(
    items.flatMap((item: OrgAdminBookingEventSeries) =>
      item.time_slots.map((slot: BookingEventTimeSlot) => String(slot.time || slot.start_time || "").slice(0, 5)),
    ),
  );
  const payloadSlots: string[] = Array.isArray(payload?.available_slots)
    ? uniqueSlots(payload.available_slots.map((slot: unknown) => String(slot || "").slice(0, 5)))
    : [];
  const availableSlots = derivedSlots.length ? derivedSlots : payloadSlots;
  return {
    items,
    total: Number(payload?.total ?? items.length),
    using_default: Boolean(payload?.using_default),
    has_active_rules: Boolean(payload?.has_active_rules),
    date_open: payload?.date_open !== false,
    date_closed: Boolean(payload?.date_closed),
    available_slots: availableSlots,
  };
}

function bookingEventSeriesRequestBody(data: BookingEventSeriesInput) {
  return {
    title: data.name,
    description: data.description ?? null,
    recurrence_type: data.recurrence_type ?? "weekly",
    weekday: data.recurrence_type === "weekly" ? data.weekday ?? null : null,
    event_date: data.recurrence_type === "date" ? data.specific_date ?? null : null,
    is_active: data.is_active ?? true,
    is_default: data.is_default ?? false,
    is_closed: data.is_closed ?? false,
    time_slots: data.time_slots ?? [],
  };
}

export async function fetchOrgAdminBookingEventSeries(): Promise<{
  items: OrgAdminBookingEventSeries[];
  total: number;
}> {
  const res = await fetch("/api/org-admin/booking-event-series");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento serate prenotabili"));
  return normalizeBookingEventSeriesList(await res.json());
}

export async function createOrgAdminBookingEventSeries(data: BookingEventSeriesInput): Promise<{ item: OrgAdminBookingEventSeries }> {
  const res = await fetch("/api/org-admin/booking-event-series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bookingEventSeriesRequestBody(data)),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione serata prenotabile"));
  const payload = await res.json();
  return { item: normalizeBookingEventSeries(payload.item ?? payload.series) };
}

export async function updateOrgAdminBookingEventSeries(
  seriesId: number,
  data: BookingEventSeriesInput,
): Promise<{ item: OrgAdminBookingEventSeries }> {
  const res = await fetch(`/api/org-admin/booking-event-series/${seriesId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bookingEventSeriesRequestBody(data)),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento serata prenotabile"));
  const payload = await res.json();
  return { item: normalizeBookingEventSeries(payload.item ?? payload.series) };
}

export async function deleteOrgAdminBookingEventSeries(
  seriesId: number,
): Promise<{ ok: boolean; deleted_id: number }> {
  const res = await fetch(`/api/org-admin/booking-event-series/${seriesId}`, { method: "DELETE" });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore eliminazione serata prenotabile"));
  const payload = await res.json();
  return { ok: Boolean(payload?.ok), deleted_id: Number(payload?.deleted_id ?? payload?.deleted_series_id ?? seriesId) };
}

export async function fetchOrgAdminBookingsAgendaDay(input?: {
  date?: string | null;
  status?: string;
  formId?: number | null;
}): Promise<{
  date: string;
  items: AssociationBooking[];
  total: number;
}> {
  const params = new URLSearchParams();
  if (input?.date) params.set("date", input.date);
  if (input?.status) params.set("status", input.status);
  if (input?.formId) params.set("form_id", String(input.formId));
  const res = await fetch(`/api/org-admin/bookings/agenda/day${params.toString() ? `?${params.toString()}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore agenda giornaliera"));
  return res.json();
}

export async function fetchOrgAdminBookingsAgendaWeek(input?: {
  date?: string | null;
  status?: string;
  formId?: number | null;
}): Promise<{
  week_start: string;
  week_end: string;
  days: Array<{
    date: string;
    weekday: string;
    items: AssociationBooking[];
    total: number;
  }>;
  total: number;
}> {
  const params = new URLSearchParams();
  if (input?.date) params.set("date", input.date);
  if (input?.status) params.set("status", input.status);
  if (input?.formId) params.set("form_id", String(input.formId));
  const res = await fetch(`/api/org-admin/bookings/agenda/week${params.toString() ? `?${params.toString()}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore agenda settimanale"));
  return res.json();
}

export async function fetchOrgAdminRooms(input?: {
  includeInactive?: boolean;
}): Promise<{ items: AssociationRoom[]; total: number }> {
  const params = new URLSearchParams();
  if (input?.includeInactive !== undefined) {
    params.set("include_inactive", input.includeInactive ? "true" : "false");
  }
  const res = await fetch(`/api/org-admin/rooms${params.toString() ? `?${params.toString()}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento sale"));
  return res.json();
}

export async function createOrgAdminRoom(data: {
  name: string;
  is_active?: boolean;
}): Promise<{ room: AssociationRoom }> {
  const res = await fetch("/api/org-admin/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione sala"));
  return res.json();
}

export async function updateOrgAdminRoom(
  roomId: number,
  data: { name: string; is_active?: boolean },
): Promise<{ room: AssociationRoom }> {
  const res = await fetch(`/api/org-admin/rooms/${roomId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento sala"));
  return res.json();
}

export async function deleteOrgAdminRoom(
  roomId: number,
): Promise<{ ok: boolean; deleted_room_id: number }> {
  const res = await fetch(`/api/org-admin/rooms/${roomId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore eliminazione sala"));
  return res.json();
}

export async function fetchOrgAdminRoomTables(
  roomId: number,
  input?: { includeInactive?: boolean },
): Promise<{ items: AssociationRoomTable[]; total: number }> {
  const params = new URLSearchParams();
  if (input?.includeInactive !== undefined) {
    params.set("include_inactive", input.includeInactive ? "true" : "false");
  }
  const res = await fetch(
    `/api/org-admin/rooms/${roomId}/tables${params.toString() ? `?${params.toString()}` : ""}`,
  );
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento tavoli"));
  return res.json();
}

export async function createOrgAdminRoomTable(
  roomId: number,
  data: {
    name: string;
    capacity: number;
    shape: string;
    pos_x: number;
    pos_y: number;
    width?: number | null;
    height?: number | null;
    is_active?: boolean;
    is_out_of_service?: boolean;
  },
): Promise<{ table: AssociationRoomTable }> {
  const res = await fetch(`/api/org-admin/rooms/${roomId}/tables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione tavolo"));
  return res.json();
}

export async function updateOrgAdminRoomTable(
  tableId: number,
  data: {
    room_id: number;
    name: string;
    capacity: number;
    shape: string;
    pos_x: number;
    pos_y: number;
    width?: number | null;
    height?: number | null;
    is_active?: boolean;
    is_out_of_service?: boolean;
  },
): Promise<{ table: AssociationRoomTable }> {
  const res = await fetch(`/api/org-admin/tables/${tableId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento tavolo"));
  return res.json();
}

export async function deleteOrgAdminRoomTable(
  tableId: number,
): Promise<{ ok: boolean; deleted_table_id: number }> {
  const res = await fetch(`/api/org-admin/tables/${tableId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore eliminazione tavolo"));
  return res.json();
}

export async function fetchOrgAdminRoomMap(
  roomId: number,
  input?: { date?: string | null; time?: string | null },
): Promise<AssociationRoomMap> {
  const params = new URLSearchParams();
  if (input?.date) params.set("date", input.date);
  if (input?.time) params.set("time", input.time);
  const res = await fetch(`/api/org-admin/rooms/${roomId}/map${params.toString() ? `?${params.toString()}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento mappa sala"));
  return res.json();
}

export async function saveOrgAdminRoomMap(
  roomId: number,
  positions: Array<{ id: number; pos_x: number; pos_y: number; width?: number | null; height?: number | null }>,
): Promise<{ ok: boolean; items: AssociationRoomTable[] }> {
  const res = await fetch(`/api/org-admin/rooms/${roomId}/map`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ positions }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore salvataggio mappa sala"));
  return res.json();
}

export async function assignOrgAdminBookingTable(
  bookingId: number,
  data: { room_id?: number | null; table_id?: number | null },
): Promise<{ booking: AssociationBooking }> {
  const res = await fetch(`/api/org-admin/bookings/${bookingId}/assignment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore assegnazione tavolo"));
  return res.json();
}

export async function unassignOrgAdminBookingTable(
  bookingId: number,
): Promise<{ booking: AssociationBooking }> {
  const res = await fetch(`/api/org-admin/bookings/${bookingId}/assignment`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore rimozione assegnazione"));
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
  compiled_html?: string | null;
  mjml_source?: string | null;
  grapesjs_project_json?: Record<string, unknown> | null;
  design?: Partial<OrgAdminEmailDesign> | null;
  linked_form_id?: number | null;
}): Promise<{
  preview: {
    subject: string;
    body_html: string | null;
    body_text: string | null;
    compiled_html?: string | null;
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

export async function createOrgAdminEmailCampaignFromTemplate(data: {
  template_id: number;
  name?: string | null;
  subject?: string | null;
  linked_form_id?: number | null;
  audience_type: OrgAdminCampaignAudienceType;
  recipient_mode?: OrgAdminCampaignRecipientMode;
  member_ids?: number[];
  scheduled_at?: string | null;
  design?: Partial<OrgAdminEmailDesign> | null;
}): Promise<{ ok: boolean; campaign: OrgAdminEmailCampaign }> {
  const res = await fetch("/api/org-admin/communications/campaigns/from-template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione campagna da template"));
  return res.json();
}

export async function sendOrgAdminCommunicationBuilderTestEmail(data: {
  to_email: string;
  subject: string;
  body_html?: string | null;
  body_text?: string | null;
  compiled_html?: string | null;
  design?: Partial<OrgAdminEmailDesign> | null;
  linked_form_id?: number | null;
  message_name?: string | null;
}): Promise<{
  ok: boolean;
  provider_message_id: string;
  message: string;
  preview: {
    subject: string;
    body_html: string | null;
    body_text: string | null;
  };
  sender: OrgAdminCommunicationSettings["association_email_sender"];
}> {
  const res = await fetch("/api/org-admin/communications/campaigns/test-send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore invio test builder"));
  return res.json();
}

export async function fetchOrgAdminCommunicationAssets(): Promise<{
  items: OrgAdminEmailBuilderAsset[];
  total: number;
}> {
  const res = await fetch("/api/org-admin/communications/assets");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento asset"));
  return res.json();
}

export async function uploadOrgAdminCommunicationAsset(file: File, name?: string): Promise<{
  ok: boolean;
  asset: OrgAdminEmailBuilderAsset;
}> {
  const body = new FormData();
  body.append("file", file);
  if (name?.trim()) body.append("name", name.trim());
  const res = await fetch("/api/org-admin/communications/assets", {
    method: "POST",
    body,
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore upload asset"));
  return res.json();
}

export async function deleteOrgAdminCommunicationAsset(assetId: number): Promise<{
  ok: boolean;
  deleted_asset_id: number;
}> {
  const res = await fetch(`/api/org-admin/communications/assets/${assetId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore eliminazione asset"));
  return res.json();
}

export async function fetchOrgAdminWhatsAppAutomations(
  params?: { formId?: number | null },
): Promise<{
  items: OrgAdminWhatsAppAutomation[];
  total: number;
  phone_source_options: string[];
  recipient_options: string[];
  source_options: string[];
  trigger_options: string[];
}> {
  const search = new URLSearchParams();
  if (params?.formId) search.set("form_id", String(params.formId));
  const res = await fetch(`/api/org-admin/communications/whatsapp/automations${search.toString() ? `?${search.toString()}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento automazioni WhatsApp"));
  return res.json();
}

export async function createOrgAdminWhatsAppAutomation(data: {
  name: string;
  form_id?: number | null;
  source_type?: string;
  trigger_event: string;
  recipient_type: string;
  phone_source: string;
  phone_field_key?: string | null;
  custom_phone?: string | null;
  template_name: string;
  template_body: string;
  is_active: boolean;
}): Promise<{ ok: boolean; automation: OrgAdminWhatsAppAutomation }> {
  const res = await fetch("/api/org-admin/communications/whatsapp/automations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione automazione WhatsApp"));
  return res.json();
}

export async function updateOrgAdminWhatsAppAutomation(
  automationId: number,
  data: {
    name: string;
    form_id?: number | null;
    source_type?: string;
    trigger_event: string;
    recipient_type: string;
    phone_source: string;
    phone_field_key?: string | null;
    custom_phone?: string | null;
    template_name: string;
    template_body: string;
    is_active: boolean;
  },
): Promise<{ ok: boolean; automation: OrgAdminWhatsAppAutomation }> {
  const res = await fetch(`/api/org-admin/communications/whatsapp/automations/${automationId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento automazione WhatsApp"));
  return res.json();
}

export async function deleteOrgAdminWhatsAppAutomation(
  automationId: number,
): Promise<{ ok: boolean; deleted_automation_id: number }> {
  const res = await fetch(`/api/org-admin/communications/whatsapp/automations/${automationId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore eliminazione automazione WhatsApp"));
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
  active_members_count?: number | null;
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
  membership_type?: "annual" | "temporary" | null;
  membership_type_label?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  membership_fee_snapshot?: number | null;
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
  summary?: {
    total_theoretical_membership_fees: number;
    issued_members_count: number;
  };
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
  membership_type?: "annual" | "temporary";
  membership_fee_snapshot?: number | null;
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
  membership_type?: "annual" | "temporary" | null;
  membership_type_label?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  membership_fee_snapshot?: number | null;
  internal_notes: string | null;
  is_manual: boolean;
  email_sent: boolean;
  email_status?: string;
};

export type OrgAdminMemberDocument = {
  id: number;
  type: string;
  filename: string;
  mime_type?: string;
  size_bytes?: number;
  download_url?: string;
  uploaded_at: string;
  status: string;
  review_notes?: string;
  rejection_note?: string | null;
  reviewed_at?: string;
  replaces_document_id?: number | null;
};

export type OrgAdminMemberPayment = {
  id: number;
  amount_cents: number;
  amount: number;
  method: string;
  paid_at: string | null;
  notes?: string | null;
  created_at?: string | null;
};

export type OrgAdminMembershipPayment = {
  id: number;
  provider: string;
  source: string;
  status: string;
  payment_reason?: string | null;
  amount: number | null;
  currency: string | null;
  checkout_reference?: string | null;
  sumup_checkout_id?: string | null;
  hosted_checkout_url?: string | null;
  confirmed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  notes?: string | null;
};

export type OrgAdminMemberActivity = {
  id: number;
  action: string;
  created_at: string | null;
  actor_admin_id?: number | null;
  actor_admin_email?: string | null;
  actor_member_id?: number | null;
  actor_member_name?: string | null;
  actor_role?: string | null;
  entity_type?: string | null;
  entity_id?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type OrgAdminMemberDetail = {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  birth_date?: string | null;
  birth_place?: string | null;
  birth_place_code?: string | null;
  fiscal_code: string | null;
  payment_method?: string | null;
  payment_required?: boolean;
  payment_status?: string | null;
  payment_completed_at?: string | null;
  card_is_paid?: boolean;
  card_paid_at?: string | null;
  card_payment_status?: string | null;
  status: string;
  workflow_status?: string | null;
  is_active: boolean;
  deleted_at?: string | null;
  card_no?: number | null;
  card_number?: number | null;
  card_year?: number | null;
  membership_type?: "annual" | "temporary" | null;
  membership_type_label?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  membership_fee_snapshot?: number | null;
  card_token?: string | null;
  card_verification_url?: string | null;
  joined_at?: string | null;
  member_type?: string | null;
  internal_notes?: string | null;
  is_manual?: boolean;
  has_access?: boolean;
  last_access_email_at?: string | null;
  document_status?: string;
  documents: OrgAdminMemberDocument[];
  payments?: OrgAdminMemberPayment[];
  membership_payments?: OrgAdminMembershipPayment[];
  activities?: OrgAdminMemberActivity[];
  decision_notes?: string | null;
  decision_at?: string | null;
  decision_by_admin_id?: number | null;
};

export type UpdateOrgAdminMemberProfileInput = {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  birth_place?: string | null;
  birth_place_code?: string | null;
  fiscal_code?: string | null;
  membership_type?: "annual" | "temporary";
  membership_fee_snapshot?: number | null;
  internal_notes?: string | null;
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
  range_start_label?: string;
  range_end_label?: string;
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

export type SuperAdminRegistryMember = {
  id: number;
  organization_id: number | null;
  organization_name: string | null;
  organization_slug: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  fiscal_code: string | null;
  status: string;
  workflow_status?: string | null;
  is_active: boolean;
  card_no: number | null;
  card_year: number | null;
  joined_at: string | null;
};

export type SuperAdminMemberRegistryResponse = {
  items: SuperAdminRegistryMember[];
  total: number;
  kpis: {
    total: number;
    active: number;
    pending: number;
    expired: number;
    rejected: number;
  };
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

export async function fetchSuperAdminMemberRegistry(params?: {
  orgId?: number;
  q?: string;
  status?: string;
  order?: string;
  limit?: number;
  offset?: number;
}): Promise<SuperAdminMemberRegistryResponse> {
  const sp = new URLSearchParams();
  if (params?.orgId != null) sp.set("org_id", String(params.orgId));
  if (params?.q) sp.set("q", params.q);
  if (params?.status) sp.set("status", params.status);
  if (params?.order) sp.set("order", params.order);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  const res = await fetch(`/api/super-admin/members${qs ? `?${qs}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nel caricamento del libro soci"));
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
  require_membership_document?: boolean;
  adults_only_banner_enabled?: boolean;
  custom_membership_types_enabled?: boolean;
  accounting_enabled?: boolean;
  communications_enabled?: boolean;
  card_min: number | null;
  card_max: number | null;
  numbering_mode?: "shared_assonam" | "dedicated" | "legacy";
  numbering_scope_id?: number | null;
  numbering_scope_name?: string | null;
  numbering_scope_type?: string | null;
  affiliation_application_id?: number | null;
  affiliation_status?: string | null;
};

export type SuperAdminOrganizationsResponse = {
  items: SuperAdminOrganization[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  summary?: {
    total: number;
    active: number;
    archived: number;
    pending: number;
    shared: number;
    dedicated: number;
    numbering_configured: number;
    numbering_missing: number;
    auto: number;
  };
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
    status?: "all" | "active" | "pending" | "archived";
    scope?: "all" | "shared" | "dedicated";
    numbering?: "all" | "configured" | "missing";
    signal?: AbortSignal;
  }
): Promise<SuperAdminOrganizationsResponse> {
  const sp = new URLSearchParams();
  sp.set("page", String(params?.page ?? 1));
  sp.set("page_size", String(params?.pageSize ?? 50));
  if (params?.q) sp.set("q", params.q);
  if (params?.sort) sp.set("sort", params.sort);
  if (params?.status && params.status !== "all") sp.set("status", params.status);
  if (params?.scope && params.scope !== "all") sp.set("scope", params.scope);
  if (params?.numbering && params.numbering !== "all") sp.set("numbering", params.numbering);

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

export type AccountingFolderSummary = {
  id: number;
  name: string;
  slug: string;
  year: number | null;
  sort_order: number;
  is_active: boolean;
  is_default: boolean;
  document_count: number;
  created_at: string | null;
  updated_at: string | null;
};

export type AccountingCategorySummary = {
  id: number;
  code: string;
  name: string;
  is_system: boolean;
  sort_order: number;
  is_active: boolean;
  document_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AccountingShareLink = {
  id: number;
  url: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string | null;
};

export type SuperAdminAccountingDocument = {
  id: number;
  title: string;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
  original_filename: string;
  mime_type: string | null;
  file_size: number | null;
  preview_enabled: boolean;
  preview_available: boolean;
  is_share_enabled: boolean;
  legacy_shared_document_id: number | null;
  organization: {
    id: number;
    name: string;
    slug: string;
  } | null;
  folder: AccountingFolderSummary | null;
  category: AccountingCategorySummary | null;
  uploaded_by: {
    id: number;
    email: string;
  } | null;
  download_url: string;
  preview_url: string | null;
  open_url: string;
  share_links?: AccountingShareLink[];
};

export async function fetchSuperAdminAccountingFolders(): Promise<{
  items: AccountingFolderSummary[];
  total: number;
}> {
  const res = await fetch("/api/super-admin/accounting/folders");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nel caricamento cartelle accounting"));
  return res.json();
}

export async function createSuperAdminAccountingFolder(input: {
  name: string;
  year?: number | null;
  isActive?: boolean;
  sortOrder?: number;
}): Promise<{ folder: AccountingFolderSummary }> {
  const res = await fetch("/api/super-admin/accounting/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      year: input.year ?? null,
      is_active: input.isActive ?? true,
      sort_order: input.sortOrder,
    }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione cartella accounting"));
  return res.json();
}

export async function updateSuperAdminAccountingFolder(
  folderId: number,
  input: {
    name?: string;
    year?: number | null;
    isActive?: boolean;
    sortOrder?: number;
  },
): Promise<{ folder: AccountingFolderSummary }> {
  const res = await fetch(`/api/super-admin/accounting/folders/${folderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.year !== undefined ? { year: input.year } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
    }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Cartella non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento cartella accounting"));
  return res.json();
}

export async function deleteSuperAdminAccountingFolder(
  folderId: number,
): Promise<{ ok: boolean; deleted_folder_id: number }> {
  const res = await fetch(`/api/super-admin/accounting/folders/${folderId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Cartella non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore eliminazione cartella accounting"));
  return res.json();
}

export async function fetchSuperAdminAccountingCategories(): Promise<{
  items: AccountingCategorySummary[];
  total: number;
}> {
  const res = await fetch("/api/super-admin/accounting/categories");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nel caricamento categorie accounting"));
  return res.json();
}

export async function createSuperAdminAccountingCategory(input: {
  name: string;
  isActive?: boolean;
  sortOrder?: number;
}): Promise<{ category: AccountingCategorySummary }> {
  const res = await fetch("/api/super-admin/accounting/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      is_active: input.isActive ?? true,
      sort_order: input.sortOrder,
    }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione categoria accounting"));
  return res.json();
}

export async function updateSuperAdminAccountingCategory(
  categoryId: number,
  input: {
    name?: string;
    isActive?: boolean;
    sortOrder?: number;
  },
): Promise<{ category: AccountingCategorySummary }> {
  const res = await fetch(`/api/super-admin/accounting/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
    }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Categoria non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento categoria accounting"));
  return res.json();
}

export async function deleteSuperAdminAccountingCategory(
  categoryId: number,
): Promise<{ ok: boolean; deleted_category_id: number }> {
  const res = await fetch(`/api/super-admin/accounting/categories/${categoryId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Categoria non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore eliminazione categoria accounting"));
  return res.json();
}

export async function fetchSuperAdminAccountingDocuments(params?: {
  q?: string;
  orgId?: number;
  folderId?: number;
  categoryId?: number;
}): Promise<{ items: SuperAdminAccountingDocument[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.orgId != null) sp.set("org_id", String(params.orgId));
  if (params?.folderId != null) sp.set("folder_id", String(params.folderId));
  if (params?.categoryId != null) sp.set("category_id", String(params.categoryId));
  const res = await fetch(`/api/super-admin/accounting/documents${sp.toString() ? `?${sp.toString()}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento documenti accounting"));
  return res.json();
}

export async function fetchSuperAdminAccountingDocument(
  documentId: number,
): Promise<SuperAdminAccountingDocument> {
  const res = await fetch(`/api/super-admin/accounting/documents/${documentId}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Documento accounting non trovato");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento documento accounting"));
  return res.json();
}

export async function createSuperAdminAccountingDocument(input: {
  orgId: number;
  folderId: number;
  categoryId: number;
  title: string;
  description?: string;
  previewEnabled?: boolean;
  isShareEnabled?: boolean;
  file: File;
}): Promise<{ ok: boolean; document: SuperAdminAccountingDocument }> {
  const body = new FormData();
  body.append("org_id", String(input.orgId));
  body.append("folder_id", String(input.folderId));
  body.append("category_id", String(input.categoryId));
  body.append("title", input.title);
  if (input.description !== undefined) body.append("description", input.description);
  body.append("preview_enabled", String(input.previewEnabled ?? true));
  body.append("is_share_enabled", String(input.isShareEnabled ?? false));
  body.append("file", input.file);
  const res = await fetch("/api/super-admin/accounting/documents", {
    method: "POST",
    body,
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione documento accounting"));
  return res.json();
}

export async function updateSuperAdminAccountingDocument(
  documentId: number,
  input: {
    orgId?: number;
    folderId?: number;
    categoryId?: number;
    title?: string;
    description?: string;
    previewEnabled?: boolean;
    isShareEnabled?: boolean;
    file?: File | null;
  },
): Promise<{ ok: boolean; document: SuperAdminAccountingDocument }> {
  const body = new FormData();
  if (input.orgId !== undefined) body.append("org_id", String(input.orgId));
  if (input.folderId !== undefined) body.append("folder_id", String(input.folderId));
  if (input.categoryId !== undefined) body.append("category_id", String(input.categoryId));
  if (input.title !== undefined) body.append("title", input.title);
  if (input.description !== undefined) body.append("description", input.description);
  if (input.previewEnabled !== undefined) body.append("preview_enabled", String(input.previewEnabled));
  if (input.isShareEnabled !== undefined) body.append("is_share_enabled", String(input.isShareEnabled));
  if (input.file) body.append("file", input.file);
  const res = await fetch(`/api/super-admin/accounting/documents/${documentId}`, {
    method: "PATCH",
    body,
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Documento accounting non trovato");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento documento accounting"));
  return res.json();
}

export async function deleteSuperAdminAccountingDocument(
  documentId: number,
): Promise<{ ok: boolean; deleted_document_id: number }> {
  const res = await fetch(`/api/super-admin/accounting/documents/${documentId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Documento accounting non trovato");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore eliminazione documento accounting"));
  return res.json();
}

export async function revokeSuperAdminAccountingShareLink(
  shareLinkId: number,
): Promise<{ ok: boolean; share_link_id: number }> {
  const res = await fetch(`/api/super-admin/accounting/share-links/${shareLinkId}/revoke`, {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Link di condivisione non trovato");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore revoca link accounting"));
  return res.json();
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
    fee_amount: number | null;
    fee_amount_cents: number | null;
    fee_currency: string;
    payment_enabled: boolean;
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
  type: "document_general" | "document_accounting" | "low_cards" | "form_submission" | "booking_request" | string;
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

export type OrgAdminAccountingDocument = {
  id: number;
  title: string;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
  original_filename: string;
  mime_type: string | null;
  file_size: number | null;
  preview_enabled: boolean;
  preview_available: boolean;
  is_share_enabled: boolean;
  folder: {
    id: number;
    name: string;
    slug: string;
    year: number | null;
    sort_order: number;
  } | null;
  category: {
    id: number;
    code: string;
    name: string;
    is_system: boolean;
    sort_order: number;
  } | null;
  download_url: string;
  preview_url: string | null;
  open_url: string;
  share_links: AccountingShareLink[];
};

export type OrgAdminAccountingArchiveCategory = {
  id: number;
  code: string;
  name: string;
  is_system: boolean;
  sort_order: number;
  documents: OrgAdminAccountingDocument[];
};

export type OrgAdminAccountingArchiveFolder = {
  id: number;
  name: string;
  slug: string;
  year: number | null;
  sort_order: number;
  document_count: number;
  categories: OrgAdminAccountingArchiveCategory[];
};

export type OrgAdminAccountingArchiveResponse = {
  items: OrgAdminAccountingArchiveFolder[];
  filters: {
    folders: Array<{ id: number; name: string; year: number | null; slug: string }>;
    categories: Array<{ id: number; name: string; code: string; is_system: boolean }>;
    selected_folder_id: number | null;
    selected_category_id: number | null;
    query: string | null;
  };
  total_documents: number;
};

export async function fetchOrgAdminAccountingArchive(params?: {
  q?: string;
  folderId?: number;
  categoryId?: number;
}): Promise<OrgAdminAccountingArchiveResponse> {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.folderId != null) sp.set("folder_id", String(params.folderId));
  if (params?.categoryId != null) sp.set("category_id", String(params.categoryId));
  const res = await fetch(`/api/org-admin/accounting/archive${sp.toString() ? `?${sp.toString()}` : ""}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 403) throw new Error(await parseApiErrorDetail(res, "Accesso negato"));
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento archivio accounting"));
  return res.json();
}

export async function downloadOrgAdminAccountingDocument(
  document: Pick<OrgAdminAccountingDocument, "download_url" | "original_filename">,
): Promise<void> {
  await downloadAuthenticatedFile(
    document.download_url,
    document.original_filename || "documento",
    "Impossibile scaricare il documento contabile",
  );
}

export async function createOrgAdminAccountingShareLink(
  documentId: number,
  input?: { expiresInDays?: number | null },
): Promise<{ share_link: AccountingShareLink }> {
  const res = await fetch(`/api/org-admin/accounting/documents/${documentId}/share-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_in_days: input?.expiresInDays ?? null,
    }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Documento accounting non trovato");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore creazione link accounting"));
  return res.json();
}

export async function fetchOrgAdminAccountingShareLinks(
  documentId: number,
): Promise<{ items: AccountingShareLink[]; total: number }> {
  const res = await fetch(`/api/org-admin/accounting/documents/${documentId}/share-links`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Documento accounting non trovato");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento link accounting"));
  return res.json();
}

export async function revokeOrgAdminAccountingShareLink(
  shareLinkId: number,
): Promise<{ ok: boolean; share_link_id: number }> {
  const res = await fetch(`/api/org-admin/accounting/share-links/${shareLinkId}/revoke`, {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Link di condivisione non trovato");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore revoca link accounting"));
  return res.json();
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

export async function resetOrgAdminWhatsApp(): Promise<{
  ok: boolean;
  connection: OrgAdminWhatsAppConnection;
  errors?: string[];
}> {
  const res = await fetch("/api/org-admin/communications/whatsapp/reset", {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore reset connessione WhatsApp"));
  return res.json();
}

export async function deleteOrgAdminNotification(
  notificationId: number,
): Promise<{ ok: boolean; deleted_notification_id: number; was_unread: boolean }> {
  const res = await fetch(`/api/org-admin/notifications/${notificationId}`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Notifica non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore eliminazione notifica"));
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
  summary: {
    total: number;
    in_review: number;
    approved: number;
    rejected: number;
    payment_pending: number;
  };
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
  require_membership_document?: boolean;
  adults_only_banner_enabled?: boolean;
  custom_membership_types_enabled?: boolean;
  accounting_enabled?: boolean;
  numbering_mode?: "shared_assonam" | "dedicated";
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
    require_membership_document?: boolean;
    adults_only_banner_enabled?: boolean;
    custom_membership_types_enabled?: boolean;
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

export type SuperAdminMembershipPaymentSettings = {
  payment_provider: "none" | "sumup";
  payment_required_before_card: boolean;
  membership_payment_label: string | null;
  membership_fee_amount: number | null;
  temporary_membership_fee_amount?: number | null;
  membership_fee_currency: string | null;
  payment_button_label: string | null;
  custom_membership_types_enabled?: boolean;
  temporary_membership_duration_value?: number;
  temporary_membership_duration_unit?: "hours" | "days";
  sumup_enabled: boolean;
  sumup_api_key_configured: boolean;
  sumup_api_key_last4: string | null;
  sumup_api_key_configured_at: string | null;
};

export async function fetchSuperAdminMembershipPaymentSettings(
  orgId: number,
): Promise<SuperAdminMembershipPaymentSettings> {
  const res = await fetch(`/api/super-admin/organizations/${orgId}/membership-payment-settings`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Organizzazione non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento impostazioni pagamento"));
  return res.json();
}

export async function patchSuperAdminMembershipPaymentSettings(
  orgId: number,
  payload: {
    payment_provider: "none" | "sumup";
    payment_required_before_card: boolean;
    membership_payment_label?: string | null;
    membership_fee_amount?: number | null;
    membership_fee_currency?: string | null;
    payment_button_label?: string | null;
  },
): Promise<SuperAdminMembershipPaymentSettings> {
  const res = await fetch(`/api/super-admin/organizations/${orgId}/membership-payment-settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Organizzazione non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore salvataggio impostazioni pagamento"));
  return res.json();
}

export async function saveSuperAdminSumUpApiKey(
  orgId: number,
  apiKey: string,
): Promise<SuperAdminMembershipPaymentSettings> {
  const res = await fetch(`/api/super-admin/organizations/${orgId}/sumup-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Organizzazione non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore salvataggio chiave SumUp"));
  return res.json();
}

export async function deleteSuperAdminSumUpApiKey(
  orgId: number,
): Promise<SuperAdminMembershipPaymentSettings> {
  const res = await fetch(`/api/super-admin/organizations/${orgId}/sumup-api-key`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Organizzazione non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore rimozione chiave SumUp"));
  return res.json();
}

export async function fetchSuperAdminWhatsAppProviderSettings(
  orgId: number,
): Promise<SuperAdminWhatsAppProviderSettings> {
  const res = await fetch(`/api/super-admin/organizations/${orgId}/whatsapp-provider-settings`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Organizzazione non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento impostazioni WhatsApp"));
  return res.json();
}

export async function patchSuperAdminWhatsAppProviderSettings(
  orgId: number,
  payload: {
    provider: WhatsAppProviderName;
    provider_instance_id?: string | null;
    provider_api_url?: string | null;
    provider_token?: string | null;
    webhook_secret?: string | null;
    clear_provider_token?: boolean;
    clear_webhook_secret?: boolean;
  },
): Promise<SuperAdminWhatsAppProviderSettings> {
  const res = await fetch(`/api/super-admin/organizations/${orgId}/whatsapp-provider-settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Organizzazione non trovata");
  if (res.status === 409) {
    throw new Error(await parseApiErrorDetail(res, "Istanza Green API gia configurata su un'altra associazione"));
  }
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore salvataggio impostazioni WhatsApp"));
  return res.json();
}

export async function refreshSuperAdminWhatsAppProviderState(
  orgId: number,
): Promise<SuperAdminWhatsAppProviderSettings> {
  const res = await fetch(`/api/super-admin/organizations/${orgId}/whatsapp-provider-settings/state`, {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Connessione WhatsApp non configurata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore verifica stato WhatsApp"));
  return res.json();
}

export async function refreshSuperAdminWhatsAppProviderQr(
  orgId: number,
): Promise<SuperAdminWhatsAppProviderSettings> {
  const res = await fetch(`/api/super-admin/organizations/${orgId}/whatsapp-provider-settings/qr`, {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Connessione WhatsApp non configurata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento QR WhatsApp"));
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
  start_label?: string;
  end_label?: string;
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
  numbering_scope_id?: number | null;
  numbering_scope_name?: string | null;
  numbering_scope_type?: string | null;
  owner_org_id?: number | null;
  owner_org_name?: string | null;
  is_legacy_fallback_batch?: boolean;
};

export type OrganizationNumberingConfig = {
  organization_id: number;
  organization_name: string;
  numbering_mode: "shared_assonam" | "dedicated" | "legacy";
  numbering_scope_id: number | null;
  numbering_scope_name: string | null;
  numbering_scope_type: string | null;
  numbering_scope_prefix: string | null;
  numbering_scope_description: string | null;
  numbering_scope_is_system: boolean;
  is_freely_editable: boolean;
  is_sensitive: boolean;
  members_with_cards: number;
  total_batches: number;
  real_used_batches: number;
  batches_with_linked_members: number;
  warning_message: string | null;
};

export type OrgBatchesResult = {
  current_year: number;
  next_reset_at: string;
  batches: OrgBatch[];
  numbering?: Omit<OrganizationNumberingConfig, "organization_id" | "organization_name">;
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

export type CardLotRegistryItem = {
  id: number;
  batch_id: number;
  organization_id: number | null;
  organization_name: string | null;
  numbering_scope_id: number | null;
  numbering_scope_name: string | null;
  year: number;
  range_start: number;
  range_end: number;
  range_start_label: string;
  range_end_label: string;
  quantity: number;
  status_label: string;
  next_no: number | null;
  recharge_request_id: number | null;
  created_at: string | null;
  released_at: string | null;
  notes: string | null;
};

export type CardLotRegistryResponse = {
  items: CardLotRegistryItem[];
  total: number;
};

export async function fetchCardLotRegistry(): Promise<CardLotRegistryResponse> {
  const res = await fetch("/api/super-admin/card-lots");
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nel caricamento del registro lotti"));
  return res.json();
}

export async function downloadCardLotRegistryExcel(): Promise<void> {
  return downloadAuthenticatedFile(
    "/api/super-admin/card-lots/export.xlsx",
    "registro-lotti.xlsx",
    "Impossibile scaricare il registro lotti",
  );
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

export async function fetchOrganizationNumberingConfig(
  orgId: number,
): Promise<OrganizationNumberingConfig> {
  const res = await fetch(`/api/super-admin/organizations/${orgId}/numbering`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Organizzazione non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore caricamento numerazione"));
  return res.json();
}

export async function patchOrganizationNumberingConfig(
  orgId: number,
  numberingMode: "shared_assonam" | "dedicated",
): Promise<{
  ok: boolean;
  organization_id: number;
  organization_name: string;
  batch_backfill_count: number;
} & Omit<OrganizationNumberingConfig, "organization_id" | "organization_name">> {
  const res = await fetch(`/api/super-admin/organizations/${orgId}/numbering`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numbering_mode: numberingMode }),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Organizzazione non trovata");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore aggiornamento numerazione"));
  return res.json();
}

export async function fetchOrgAdminMemberDetail(
  memberId: number,
): Promise<OrgAdminMemberDetail> {
  const res = await fetch(`/api/org-admin/members/${memberId}`);
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Socio non trovato");
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore nel caricamento del socio"));
  return res.json();
}

export async function updateOrgAdminMemberProfile(
  memberId: number,
  payload: UpdateOrgAdminMemberProfileInput,
): Promise<OrgAdminMemberDetail> {
  const res = await fetch(`/api/org-admin/members/${memberId}/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Socio non trovato");
  if (res.status === 409) throw new Error(await parseApiErrorDetail(res, "Operazione bloccata"));
  if (res.status === 422) throw new Error(await parseApiErrorDetail(res, "Dati anagrafici non validi"));
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore salvataggio anagrafica"));
  return res.json();
}

export async function sendOrgAdminMemberCardEmail(
  memberId: number,
): Promise<{ ok: boolean; queued: boolean; outbox_id?: string | null }> {
  const res = await fetch(`/api/org-admin/members/${memberId}/card-email`, {
    method: "POST",
  });
  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 404) throw new Error("Socio non trovato");
  if (res.status === 409 || res.status === 400) {
    throw new Error(await parseApiErrorDetail(res, "Invio tessera non disponibile"));
  }
  if (!res.ok) throw new Error(await parseApiErrorDetail(res, "Errore invio tessera"));
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
  membership_payment?: {
    id: number;
    status: string;
    source: string;
    amount: number;
    currency: string;
    payment_reason?: string | null;
    confirmed_at?: string | null;
    notes?: string | null;
  };
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
