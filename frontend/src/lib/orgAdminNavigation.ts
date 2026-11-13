/** Keep post-login navigation inside the association workspace. */
export function safeOrgAdminNext(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw || raw.length > 2048) return null;
  if (/[\u0000-\u0020\u007f\\]/.test(raw) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw)) return null;
  const path = raw.split(/[?#]/, 1)[0];
  if (!/^\/org-admin(?:\/[a-zA-Z0-9_-]+)*\/?$/.test(path)) return null;
  if (/^\/org-admin\/(?:login|callback)(?:\/|$)/i.test(path)) return null;
  return raw;
}

export function orgAdminLoginUrl(destination: string): string {
  const next = safeOrgAdminNext(destination);
  return next && next !== "/org-admin"
    ? `/org-admin/login?${new URLSearchParams({ next })}`
    : "/org-admin/login";
}
