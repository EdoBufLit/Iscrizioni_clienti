import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Iscrizione from "./Iscrizione";

const fetchOrganizationDetail = vi.fn();

vi.mock("../lib/api", () => ({
  createMembershipPaymentCheckout: vi.fn(),
  fetchOrganizationDetail: (...args: unknown[]) => fetchOrganizationDetail(...args),
  joinOrganization: vi.fn(),
  registerMember: vi.fn(),
  searchMunicipalities: vi.fn().mockResolvedValue([]),
}));

describe("Iscrizione accessibility", () => {
  beforeEach(() => {
    fetchOrganizationDetail.mockResolvedValue({
      id: 1,
      name: "Associazione Demo",
      slug: "demo",
      description: null,
      address_line1: null,
      address_line2: null,
      city: null,
      province: null,
      postal_code: null,
      country: null,
      email: null,
      phone: null,
      website: null,
      logo_url: null,
      is_active: true,
      has_statute: false,
      require_membership_document: false,
      membership_payment: { enabled: false, required: false, label: null, amount: null, currency: "EUR", button_label: null },
    });
  });

  it("focalizza il riepilogo errori e collega ogni campo al proprio messaggio", async () => {
    render(
      <MemoryRouter initialEntries={["/associazioni/demo/iscrizione"]}>
        <Routes>
          <Route path="/associazioni/:slug/iscrizione" element={<Iscrizione />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Diventa socio" });
    fireEvent.click(screen.getByRole("button", { name: "Continua" }));

    const summary = await screen.findByRole("alert");
    await waitFor(() => expect(summary).toHaveFocus());
    expect(summary).toHaveTextContent("Correggi i campi indicati");

    const firstName = screen.getByRole("textbox", { name: "Nome" });
    expect(firstName).toHaveAttribute("aria-invalid", "true");
    expect(firstName).toHaveAttribute("aria-describedby", "nome-message");

    fireEvent.click(screen.getByRole("button", { name: /Nome:/ }));
    expect(firstName).toHaveFocus();
  });

  it("mostra Contanti come scelta fissa quando l'associazione attiva la modalità dedicata", async () => {
    fetchOrganizationDetail.mockResolvedValueOnce({
      id: 1,
      name: "Associazione Demo",
      slug: "demo",
      description: null,
      address_line1: null,
      address_line2: null,
      city: null,
      province: null,
      postal_code: null,
      country: null,
      email: null,
      phone: null,
      website: null,
      logo_url: null,
      is_active: true,
      has_statute: false,
      require_membership_document: false,
      cash_only_signup_payment: true,
      membership_payment: {
        enabled: false,
        required: false,
        label: null,
        amount: null,
        currency: "EUR",
        button_label: null,
      },
    });

    render(
      <MemoryRouter initialEntries={["/associazioni/demo/iscrizione"]}>
        <Routes>
          <Route path="/associazioni/:slug/iscrizione" element={<Iscrizione />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("status", {
        name: "Modalità di pagamento: Contanti",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Modalità di pagamento" }),
    ).not.toBeInTheDocument();
  });
});
