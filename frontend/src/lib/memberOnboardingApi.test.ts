import { afterEach, describe, expect, it, vi } from "vitest";
import { completeMemberOnboarding, establishMemberOnboardingSession, fetchMemberOnboarding, MemberOnboardingError, sendOrgAdminMemberOnboarding } from "./api";

afterEach(() => vi.unstubAllGlobals());
describe("API completamento iscrizione", () => {
  it("scambia la capability solo nel body e richiede risposte senza cache", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ completed: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await establishMemberOnboardingSession("synthetic-proof");
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/member/onboarding/session", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "synthetic-proof" }), cache: "no-store",
    });
    await fetchMemberOnboarding();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/member/onboarding", { cache: "no-store" });
  });

  it("manda password e file nello stesso multipart senza campi di autenticazione ordinaria", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ completed: true, ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["%PDF fake"], "identity.pdf", { type: "application/pdf" });
    await completeMemberOnboarding({ newPassword: "SyntheticPass123!", identityDocument: file });
    const [path, options] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/member/onboarding/complete");
    expect(options.method).toBe("POST");
    expect(options.cache).toBe("no-store");
    expect([...options.body.keys()]).toEqual(["new_password", "identity_document"]);
    expect(options.body.get("new_password")).toBe("SyntheticPass123!");
    expect(options.body.get("identity_document")).toBe(file);
  });

  it("mantiene lo status dei link scaduti e non li tratta come sessione membro ordinaria", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ detail: "Invito scaduto" }), { status: 401 })));
    await expect(fetchMemberOnboarding()).rejects.toEqual(expect.objectContaining({ name: "MemberOnboardingError", status: 401, message: "Invito scaduto" }));
    await expect(fetchMemberOnboarding()).rejects.toBeInstanceOf(MemberOnboardingError);
  });

  it("usa il comando admin corretto e parla di accodamento", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, email_status: "queued" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendOrgAdminMemberOnboarding(27);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/org-admin/members/27/send-onboarding", { method: "POST" });
    expect(result.email_status).toBe("queued");
  });
});
