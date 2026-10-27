import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OnboardingTour from "./OnboardingTour";

const onboardingApi = vi.hoisted(() => ({
  fetchStatus: vi.fn(),
  start: vi.fn(),
  complete: vi.fn(),
  skip: vi.fn(),
}));

function NavigationProbe() {
  const navigate = useNavigate();
  const location = useLocation();
  return <>
    <button onClick={() => navigate("/org-admin/incassi")}>Apri incassi</button>
    <output aria-label="Pagina corrente">{location.pathname}</output>
  </>;
}

vi.mock("../../lib/api", () => ({
  fetchOnboardingStatus: onboardingApi.fetchStatus,
  startOnboardingTour: onboardingApi.start,
  completeOnboardingTour: onboardingApi.complete,
  skipOnboardingTour: onboardingApi.skip,
}));

describe("OnboardingTour shared interface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    onboardingApi.fetchStatus.mockResolvedValue({ should_show: true });
    onboardingApi.start.mockResolvedValue({ ok: true });
    onboardingApi.complete.mockResolvedValue({ ok: true });
    onboardingApi.skip.mockResolvedValue({ ok: true });
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute("data-theme");
    vi.restoreAllMocks();
  });

  it.each([
    { role: "member" as const, theme: "light", route: "/dashboard", target: "member-dashboard-home" },
    { role: "org_admin" as const, theme: "dark", route: "/org-admin", target: "admin-dashboard-home" },
  ])("mostra azioni italiane e rispetta il tema $theme per $role", async ({ role, theme, route, target }) => {
    document.documentElement.dataset.theme = theme;
    render(
      <MemoryRouter initialEntries={[route]}>
        <div data-tour={target}>Riepilogo</div>
        <OnboardingTour role={role} />
      </MemoryRouter>,
    );

    const next = await screen.findByRole("button", { name: /^Avanti \(1 di \d+\)$/ }, { timeout: 5000 });
    const tooltip = screen.getByRole("alertdialog");
    expect(tooltip).toHaveStyle({
      backgroundColor: "var(--theme-surface-elevated)",
      color: "var(--theme-text)",
      fontFamily: "var(--font-ui)",
    });
    expect(next).toHaveStyle({ backgroundColor: "var(--theme-brand)", color: "var(--theme-on-brand)" });

    fireEvent.click(screen.getByRole("button", { name: "Salta guida" }));
    await waitFor(() => expect(onboardingApi.skip).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(localStorage.getItem(`onboarding_tour_${role}`)).toBe("skipped");
    expect(onboardingApi.complete).not.toHaveBeenCalled();
  });

  it("non abbandona un link diretto per avviare la guida automatica", async () => {
    render(<MemoryRouter initialEntries={["/org-admin/incassi"]}>
      <NavigationProbe /><OnboardingTour role="org_admin" />
    </MemoryRouter>);
    await waitFor(() => expect(onboardingApi.fetchStatus).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 750));
    expect(screen.getByLabelText("Pagina corrente")).toHaveTextContent("/org-admin/incassi");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onboardingApi.start).not.toHaveBeenCalled();
  });

  it("ignora l'avvio automatico se l'utente naviga mentre carica lo stato", async () => {
    let resolveStatus!: (status: { should_show: boolean }) => void;
    onboardingApi.fetchStatus.mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }));
    render(<MemoryRouter initialEntries={["/org-admin"]}>
      <NavigationProbe /><OnboardingTour role="org_admin" />
    </MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Apri incassi" }));
    resolveStatus({ should_show: true });
    await new Promise((resolve) => setTimeout(resolve, 750));
    expect(screen.getByLabelText("Pagina corrente")).toHaveTextContent("/org-admin/incassi");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onboardingApi.start).not.toHaveBeenCalled();
  });
});
