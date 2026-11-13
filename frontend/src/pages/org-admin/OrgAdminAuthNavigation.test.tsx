import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../lib/api";
import OrgAdminLogin from "./OrgAdminLogin";
import OrgAdminCallback from "./OrgAdminCallback";
import MagicLinkVerify from "../MagicLinkVerify";

vi.mock("../../lib/api", async original => ({
  ...await original<typeof import("../../lib/api")>(),
  fetchWhoAmI: vi.fn(), requestOrgAdminMagicLink: vi.fn(), verifyOrgAdminCode: vi.fn(),
  verifyOrgAdminToken: vi.fn(), verifyOrgAdminMfa: vi.fn(), verifyMemberToken: vi.fn(),
}));

const destination = "/org-admin/comunicazioni-assonam?message=12";
const challenge = "test-challenge-123456789012345678901234";
function Position() {
  const location = useLocation();
  return <output aria-label="Destinazione">{location.pathname}{location.search}</output>;
}
function show(path: string, strict = false) {
  const tree = <MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/org-admin/login" element={<OrgAdminLogin />} />
    <Route path="/org-admin/callback" element={<OrgAdminCallback />} />
    <Route path="/auth/verify" element={<MagicLinkVerify />} />
    <Route path="/org-admin" element={<h1>Home associazione</h1>} />
    <Route path="/org-admin/comunicazioni-assonam" element={<h1>Comunicazione richiesta</h1>} />
    <Route path="/dashboard" element={<h1>Home socio</h1>} />
  </Routes><Position /></MemoryRouter>;
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}
async function requestCode() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Ricevi link e codice" }));
  await screen.findByLabelText("Codice ricevuto via email");
}
async function enterEmailCode() {
  fireEvent.change(screen.getByLabelText("Codice ricevuto via email"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Entra con codice" }));
}
async function enterMfa() {
  const code = await screen.findByLabelText("Codice a 6 cifre");
  fireEvent.change(code, { target: { value: "654321" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Conferma e accedi" })));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchWhoAmI).mockResolvedValue({ authenticated: false });
  vi.mocked(api.requestOrgAdminMagicLink).mockResolvedValue({ ok: true });
  vi.mocked(api.verifyOrgAdminCode).mockResolvedValue({ ok: true, redirect_to: "/org-admin" });
  vi.mocked(api.verifyOrgAdminToken).mockResolvedValue({ ok: true, redirect_to: "/org-admin" });
  vi.mocked(api.verifyOrgAdminMfa).mockResolvedValue({ ok: true, redirect_to: "/org-admin" });
});

describe("Ritorno alla comunicazione dopo autenticazione", () => {
  it("mantiene il dettaglio nella richiesta email e dopo il codice", async () => {
    show(`/org-admin/login?${new URLSearchParams({ next: destination })}`);
    await requestCode();
    expect(api.requestOrgAdminMagicLink).toHaveBeenCalledWith("admin@example.com", destination);
    await enterEmailCode();
    expect(await screen.findByRole("heading", { name: "Comunicazione richiesta" })).toBeVisible();
    expect(api.verifyOrgAdminCode).toHaveBeenCalledWith("admin@example.com", "123456", destination);
    expect(screen.getByLabelText("Destinazione")).toHaveTextContent(destination);
  });

  it("ritorna al dettaglio dopo codice email e MFA", async () => {
    vi.mocked(api.verifyOrgAdminCode).mockResolvedValue({ ok: true, mfa_required: true, challenge });
    show(`/org-admin/login?${new URLSearchParams({ next: destination })}`);
    await requestCode();
    await enterEmailCode();
    await enterMfa();
    expect(await screen.findByRole("heading", { name: "Comunicazione richiesta" })).toBeVisible();
    expect(api.verifyOrgAdminMfa).toHaveBeenCalledWith(challenge, "654321", false, destination);
  });

  it("apre il deep link della mail in una nuova navigazione senza stato locale", async () => {
    show(`/auth/verify?${new URLSearchParams({ role: "org_admin", token: "token-email", next: destination })}`);
    expect(await screen.findByRole("heading", { name: "Comunicazione richiesta" })).toBeVisible();
    expect(api.verifyOrgAdminToken).toHaveBeenCalledWith("token-email", destination);
    expect(screen.getByLabelText("Destinazione")).toHaveTextContent(destination);
  });

  it("passa la destinazione dal link email alla callback MFA", async () => {
    vi.mocked(api.verifyOrgAdminToken).mockResolvedValue({ ok: true, mfa_required: true, challenge });
    show(`/auth/verify?${new URLSearchParams({ role: "org_admin", token: "token-email", next: destination })}`);
    await enterMfa();
    expect(await screen.findByRole("heading", { name: "Comunicazione richiesta" })).toBeVisible();
    expect(api.verifyOrgAdminToken).toHaveBeenCalledTimes(1);
    expect(api.verifyOrgAdminMfa).toHaveBeenCalledWith(challenge, "654321", false, destination);
  });

  it("mantiene il deep link anche nella callback legacy col token", async () => {
    show(`/org-admin/callback?${new URLSearchParams({ token: "legacy-token", next: destination })}`);
    expect(await screen.findByRole("heading", { name: "Comunicazione richiesta" })).toBeVisible();
    expect(api.verifyOrgAdminToken).toHaveBeenCalledWith("legacy-token", destination);
  });

  it.each([
    ["/org-admin/callback", false], ["/org-admin/callback", true],
    ["/auth/verify", false], ["/auth/verify", true],
  ] as const)("consuma il token una sola volta in StrictMode su %s (MFA: %s)", async (path, mfa) => {
    vi.mocked(api.verifyOrgAdminToken)
      .mockResolvedValueOnce(mfa ? { ok: true, mfa_required: true, challenge } : { ok: true, redirect_to: "/org-admin" })
      .mockRejectedValue(new Error("Token already consumed"));
    show(`${path}?${new URLSearchParams({ role: "org_admin", token: "single-use-token", next: destination })}`, true);
    if (mfa) await enterMfa();
    expect(await screen.findByRole("heading", { name: "Comunicazione richiesta" })).toBeVisible();
    expect(api.verifyOrgAdminToken).toHaveBeenCalledExactlyOnceWith("single-use-token", destination);
  });

  it("riapre subito il dettaglio quando l’amministratore è già autenticato", async () => {
    vi.mocked(api.fetchWhoAmI).mockResolvedValue({ authenticated: true, role: "org_admin", redirect_to: "/org-admin" });
    show(`/org-admin/login?${new URLSearchParams({ next: destination })}`);
    expect(await screen.findByRole("heading", { name: "Comunicazione richiesta" })).toBeVisible();
    expect(api.requestOrgAdminMagicLink).not.toHaveBeenCalled();
  });

  it("preserva il routing del socio se la sessione appartiene a un altro ruolo", async () => {
    vi.mocked(api.fetchWhoAmI).mockResolvedValue({ authenticated: true, role: "member", redirect_to: "/dashboard" });
    show(`/org-admin/login?${new URLSearchParams({ next: destination })}`);
    expect(await screen.findByRole("heading", { name: "Home socio" })).toBeVisible();
  });

  it.each(["https://example.com", "//example.com", "/org-admin/../super-admin", "/org-admin/login", "/org-admin/LOGIN", "/org-admin/Callback?token=other-token"])("ignora la destinazione non ammessa %s", async next => {
    show(`/org-admin/login?${new URLSearchParams({ next })}`);
    await requestCode();
    await enterEmailCode();
    expect(await screen.findByRole("heading", { name: "Home associazione" })).toBeVisible();
    expect(api.requestOrgAdminMagicLink).toHaveBeenCalledWith("admin@example.com", undefined);
  });

  it("un link scaduto conserva la destinazione per richiedere una nuova email", async () => {
    vi.mocked(api.verifyOrgAdminToken).mockRejectedValue(new Error("Expired"));
    show(`/auth/verify?${new URLSearchParams({ role: "org_admin", token: "expired", next: destination })}`);
    fireEvent.click(await screen.findByRole("link", { name: "Torna al login" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Accesso amministratore" })).toBeVisible());
    const query = screen.getByLabelText("Destinazione").textContent!.split("?")[1];
    expect(new URLSearchParams(query).get("next")).toBe(destination);
  });
});
