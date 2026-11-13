import { afterEach, describe, expect, it, vi } from "vitest";
import { requestOrgAdminMagicLink, verifyOrgAdminCode, verifyOrgAdminMfa, verifyOrgAdminToken } from "./api";

afterEach(() => vi.unstubAllGlobals());
const destination = "/org-admin/comunicazioni-assonam?message=12";

describe("Destinazione nelle richieste di autenticazione Org Admin", () => {
  it("inoltra la destinazione valida in email, codice, token e MFA", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetch);
    await requestOrgAdminMagicLink("admin@example.test", destination);
    expect((fetch.mock.calls[0][1].body as FormData).get("next")).toBe(destination);
    await verifyOrgAdminCode("admin@example.test", "123456", destination);
    expect((fetch.mock.calls[1][1].body as FormData).get("next")).toBe(destination);
    await verifyOrgAdminToken("token-example", destination);
    expect(new URL(String(fetch.mock.calls[2][0]), "https://assonam.example").searchParams.get("next")).toBe(destination);
    await verifyOrgAdminMfa("challenge-example", "654321", false, destination);
    expect(JSON.parse(fetch.mock.calls[3][1].body as string).next).toBe(destination);
  });

  it("ignora una destinazione esterna anche se il chiamante API la passa direttamente", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetch);
    await requestOrgAdminMagicLink("admin@example.test", "https://example.com");
    expect((fetch.mock.calls[0][1].body as FormData).has("next")).toBe(false);
    await verifyOrgAdminToken("token-example", "/org-admin/../super-admin");
    expect(new URL(String(fetch.mock.calls[1][0]), "https://assonam.example").searchParams.has("next")).toBe(false);
    await verifyOrgAdminMfa("challenge-example", "654321", false, "//example.com");
    expect(JSON.parse(fetch.mock.calls[2][1].body as string).next).toBeUndefined();
  });
});
