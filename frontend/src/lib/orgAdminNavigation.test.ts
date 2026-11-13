import { describe, expect, it } from "vitest";
import { orgAdminLoginUrl, safeOrgAdminNext } from "./orgAdminNavigation";

describe("Destinazioni di accesso amministratore", () => {
  it.each([
    "/org-admin", "/org-admin/", "/org-admin/comunicazioni-assonam?message=12",
    "/org-admin/soci/42?tab=documenti#richiesta", "/org-admin/comunicazioni?search=Nome%20associazione",
  ])("conserva il percorso interno %s", path => expect(safeOrgAdminNext(path)).toBe(path));

  it.each([
    null, undefined, "", "https://example.com", "//example.com", "/\\example.com",
    "/org-admin/../super-admin", "/org-admin/%2e%2e/super-admin", "/org-admin//example.com",
    "/org-admin\\example.com", "/org-admin/login", "/org-admin/login?next=/org-admin",
    "/org-admin/callback?token=secret", "/org-admin/callback/", "/super-admin",
    "/org-admin/LOGIN", "/org-admin/Callback?token=secret", "/org-admin/CaLlBaCk/?token=secret",
    "/org-administer", " /org-admin", "/org-admin?x=\n//example.com", "/org-admin?x=%0d%0aLocation:evil",
  ])("rifiuta percorsi esterni, normalizzati o di autenticazione: %s", path => expect(safeOrgAdminNext(path)).toBeNull());

  it("codifica query e frammento una sola volta nel link di accesso", () => {
    const target = "/org-admin/comunicazioni-assonam?message=12#testo";
    const url = new URL(orgAdminLoginUrl(target), "https://assonam.example");
    expect(url.pathname).toBe("/org-admin/login");
    expect(url.searchParams.get("next")).toBe(target);
    expect(orgAdminLoginUrl("https://example.com")).toBe("/org-admin/login");
  });
});
