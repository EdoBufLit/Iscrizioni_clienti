import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWhoAmI, loginWithPassword } from "../lib/api";
import Login from "./Login";

vi.mock("../lib/api", async original => ({
  ...await original<typeof import("../lib/api")>(),
  fetchWhoAmI: vi.fn(), loginWithPassword: vi.fn(), requestMagicLink: vi.fn(),
}));

function mount(path = "/login") {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/dashboard" element={<h1>Area socio autenticata</h1>} />
    <Route path="/org-admin/login" element={<h1>Accesso amministratore</h1>} />
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchWhoAmI).mockResolvedValue({ authenticated: true, role: "member", redirect_to: "/dashboard" });
  vi.mocked(loginWithPassword).mockResolvedValue({ status: "ok", message: "Login successful.", authenticated: true });
});

describe("Accesso personale da sessione riservata al club", () => {
  it("consente una nuova autenticazione esplicita senza rimbalzare nella sessione limitata", async () => {
    mount("/login?personal=1");
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("heading", { name: "Accedi al portale soci" })).toBeVisible();
    expect(fetchWhoAmI).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "personale@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "PersonalPassword123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Accedi" }));
    expect(await screen.findByRole("heading", { name: "Area socio autenticata" })).toBeVisible();
    expect(loginWithPassword).toHaveBeenCalledExactlyOnceWith("personale@example.com", "PersonalPassword123!");
  });

  it.each(["/login", "/login?personal=0"])("preserva il redirect dell’accesso ordinario (%s)", async path => {
    mount(path);
    expect(await screen.findByRole("heading", { name: "Area socio autenticata" })).toBeVisible();
    expect(fetchWhoAmI).toHaveBeenCalledOnce();
    expect(loginWithPassword).not.toHaveBeenCalled();
  });

  it("ignora una verifica sessione tardiva dopo che la pagina di accesso è stata lasciata", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof fetchWhoAmI>>) => void;
    vi.mocked(fetchWhoAmI).mockReturnValue(new Promise(done => { resolve = done; }));
    mount();
    fireEvent.click(screen.getByRole("link", { name: "Admin Associazione" }));
    expect(screen.getByRole("heading", { name: "Accesso amministratore" })).toBeVisible();
    await act(async () => { resolve({ authenticated: true, role: "member", redirect_to: "/dashboard" }); });
    expect(screen.getByRole("heading", { name: "Accesso amministratore" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Area socio autenticata" })).not.toBeInTheDocument();
  });
});
