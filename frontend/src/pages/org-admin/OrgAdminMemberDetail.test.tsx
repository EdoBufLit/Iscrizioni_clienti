import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../../components/ui/ToastProvider";
import OrgAdminMemberDetail from "./OrgAdminMemberDetail";

const apiMocks = vi.hoisted(() => ({
  fetchMember: vi.fn(),
  fetchMembershipSettings: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  AuthError: class AuthError extends Error {},
  createManualPayment: vi.fn(),
  fetchOrgAdminMemberDetail: (...args: unknown[]) => apiMocks.fetchMember(...args),
  fetchOrgAdminMembershipSettings: (...args: unknown[]) =>
    apiMocks.fetchMembershipSettings(...args),
  sendOrgAdminMemberCardEmail: vi.fn(),
  updateOrgAdminMemberProfile: vi.fn(),
}));

vi.mock("./OrgAdminLayout", () => ({
  useOrgAdmin: () => ({
    admin: {
      organization: {
        name: "Club Futura",
        slug: "club-futura",
      },
    },
    loading: false,
  }),
}));

describe("OrgAdminMemberDetail document review", () => {
  beforeEach(() => {
    apiMocks.fetchMembershipSettings.mockResolvedValue({
      custom_membership_types_enabled: false,
      membership_fee_amount: null,
      temporary_membership_fee_amount: null,
      membership_fee_currency: "EUR",
      temporary_membership_duration_value: 1,
      temporary_membership_duration_unit: "days",
      cash_only_signup_payment: false,
      online_payment_required: false,
      card_style: {},
    });
    apiMocks.fetchMember.mockResolvedValue({
      id: 42,
      first_name: "Tizia",
      last_name: "Caia",
      email: "tizia@example.com",
      phone: null,
      fiscal_code: null,
      status: "active",
      workflow_status: "active",
      is_active: true,
      card_no: 1234,
      card_number: 1234,
      card_year: 2026,
      joined_at: "2026-07-25T10:00:00Z",
      document_status: "pending",
      documents: [
        {
          id: 77,
          type: "identity",
          filename: "documento.pdf",
          mime_type: "application/pdf",
          size_bytes: 512,
          uploaded_at: "2026-07-25T10:00:00Z",
          status: "pending",
        },
      ],
      payments: [],
      membership_payments: [],
      activities: [],
    });
  });

  it("lascia approvazione e rigetto disponibili anche per un socio già attivo", async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/org-admin/soci/42"]}>
          <Routes>
            <Route path="/org-admin/soci/:id" element={<OrgAdminMemberDetail />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(await screen.findByRole("button", { name: "Approva" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Rigetta" })).toBeEnabled();
  });
});
