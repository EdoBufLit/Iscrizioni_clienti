import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import MobileDashboardNav, { type MobileDashboardNavItem } from "./MobileDashboardNav";

const primaryItems: MobileDashboardNavItem[] = [
  { key: "overview", label: "Riepilogo", icon: "home", to: "/org-admin" },
  { key: "members", label: "Soci", icon: "users", to: "/org-admin/soci" },
  { key: "attendance", label: "Presenze", icon: "scan", to: "/org-admin/presenze" },
  { key: "bookings", label: "Prenotazioni", icon: "book", to: "/org-admin/prenotazioni" },
];

const moreItems: MobileDashboardNavItem[] = [
  { key: "settings", label: "Impostazioni", icon: "shield", to: "/org-admin/impostazioni" },
  { key: "documents", label: "Documenti", icon: "docs", to: "/org-admin/documenti" },
  { key: "cards", label: "Tessere", icon: "cards", to: "/org-admin/tessere" },
];

const renderNavigation = (initialPath = "/org-admin", desktopBreakpoint: "md" | "lg" = "lg") =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <MobileDashboardNav
        items={primaryItems}
        moreItems={moreItems}
        moreTitle="Altro"
        desktopBreakpoint={desktopBreakpoint}
      />
    </MemoryRouter>,
  );

describe("MobileDashboardNav", () => {
  it("mantiene il breakpoint md predefinito nelle altre aree riservate", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <MobileDashboardNav
          items={[
            { key: "home", label: "Home", icon: "home", to: "/dashboard" },
          ]}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("navigation", { name: "Navigazione dashboard mobile" }),
    ).toHaveClass("md:hidden");
  });

  it("mantiene Presenze visibile fino al breakpoint desktop dell'area Org Admin", () => {
    renderNavigation();

    const navigation = screen.getByRole("navigation", {
      name: "Navigazione dashboard mobile",
    });
    expect(navigation).toHaveClass("lg:hidden");
    expect(navigation).not.toHaveClass("md:hidden");
    expect(screen.getByRole("link", { name: "Presenze" })).toBeInTheDocument();
  });

  it("apre un pannello scorrevole, blocca lo sfondo e si chiude con Escape", async () => {
    renderNavigation();
    const moreButton = screen.getByRole("button", { name: "Altro" });

    moreButton.focus();
    fireEvent.click(moreButton);

    const dialog = screen.getByRole("dialog", { name: "Altro" });
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector(".mobile-dashboard-sheet__scroll")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe("");
    expect(moreButton).toHaveFocus();
  });

  it("chiude Altro anche quando si seleziona la sezione già attiva", async () => {
    renderNavigation("/org-admin/impostazioni");
    fireEvent.click(screen.getByRole("button", { name: "Altro" }));

    fireEvent.click(screen.getByRole("link", { name: "Impostazioni" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe("");
  });

  it("chiude Altro toccando lo sfondo", async () => {
    const { container } = renderNavigation();
    fireEvent.click(screen.getByRole("button", { name: "Altro" }));

    const backdrop = container.querySelector(".mobile-dashboard-sheet__backdrop");
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe("");
  });
});
