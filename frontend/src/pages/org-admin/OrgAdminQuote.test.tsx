import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import OrgAdminQuote from "./OrgAdminQuote";

const mocks = vi.hoisted(() => ({ quotes: vi.fn() }));
vi.mock("../../lib/api", async (original) => ({ ...await original<typeof import("../../lib/api")>(),
  fetchOrgAdminQuotes: (...args: unknown[]) => mocks.quotes(...args) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  mocks.quotes.mockReset().mockResolvedValue({ year: 2027, total: 26,
    kpis: { due: 25, renewed: 1, collected_total: 0, theoretical_total: 650, outstanding_total: 650,
      currency: "EUR", paid_waiting_card: 0, approved_waiting_card: 0 },
    items: [{ member_id: 1, first_name: "Anna", last_name: "Rossi", email: "anna@example.com", renewed: true,
      renewal_status: "active", payment_state: "unpaid", fee_amount: 25, currency: "EUR", new_card_no: 123,
      previous_valid_through: null, can_confirm_without_payment: true }],
  });
});
afterEach(() => vi.useRealTimers());

it("paginates by 25 and still allows payment registration after card issuance", async () => {
  render(<MemoryRouter><OrgAdminQuote /></MemoryRouter>);
  await screen.findByText("Anna Rossi");
  expect(mocks.quotes).toHaveBeenCalledWith(expect.objectContaining({ limit: 25, offset: 0 }));
  expect(screen.getByRole("button", { name: "Registra pagamento" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Successiva" }));
  await waitFor(() => expect(mocks.quotes).toHaveBeenCalledWith(expect.objectContaining({ limit: 25, offset: 25 })));
});

it("does not offer future-year reminders or reminder selection while still in 2026", async () => {
  render(<MemoryRouter><OrgAdminQuote /></MemoryRouter>);
  await screen.findByText("Anna Rossi");
  expect(screen.getByText(/I solleciti per il 2027 saranno disponibili a partire da gennaio 2027/)).toBeVisible();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Sollecita quote|Seleziona per sollecito/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Registra pagamento" })).toBeVisible();
});

it("defaults to the current year in 2027 and keeps the next year non-actionable", async () => {
  vi.setSystemTime(new Date("2027-06-01T12:00:00Z"));
  render(<MemoryRouter><OrgAdminQuote /></MemoryRouter>);
  await screen.findByText("Anna Rossi");
  expect(mocks.quotes).toHaveBeenCalledWith(expect.objectContaining({ year: 2027 }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona tutti i soci visibili" }));
  expect(screen.getByRole("button", { name: "Sollecita quote 2027" })).toBeVisible();
  fireEvent.change(screen.getByLabelText("Annualità"), { target: { value: "2028" } });
  await screen.findByText(/I solleciti per il 2028 saranno disponibili a partire da gennaio 2028/);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Sollecita quote|Seleziona per sollecito/ })).not.toBeInTheDocument();
});
