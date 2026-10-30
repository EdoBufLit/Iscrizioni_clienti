import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import OrgAdminQuote from "./OrgAdminQuote";

const mocks = vi.hoisted(() => ({ quotes: vi.fn(), payment: vi.fn(), mobile: false }));
vi.mock("../../lib/api", async (original) => ({ ...await original<typeof import("../../lib/api")>(),
  fetchOrgAdminQuotes: (...args: unknown[]) => mocks.quotes(...args), recordOrgAdminRenewalPayment: (...args: unknown[]) => mocks.payment(...args) }));
vi.mock("../../hooks/useMediaQuery", () => ({ useMediaQuery: () => mocks.mobile }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  mocks.mobile = false;
  mocks.payment.mockReset().mockResolvedValue({ ok: true });
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
  fireEvent.click(screen.getByRole("button", { name: "Filtri" }));
  fireEvent.change(screen.getByLabelText("Annualità", { exact: true }), { target: { value: "2028" } });
  fireEvent.click(screen.getByRole("button", { name: "Applica filtri" }));
  await screen.findByText(/I solleciti per il 2028 saranno disponibili a partire da gennaio 2028/);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Sollecita quote|Seleziona per sollecito/ })).not.toBeInTheDocument();
});

it("keeps filters in a dialog and applies them together while preserving the search in export", async () => {
  render(<MemoryRouter><OrgAdminQuote /></MemoryRouter>);
  await screen.findByText("Anna Rossi");
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Successiva" }));
  await waitFor(() => expect(mocks.quotes).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })));
  fireEvent.change(screen.getByLabelText("Cerca socio"), { target: { value: "Anna & soci" } });
  await waitFor(() => expect(mocks.quotes).toHaveBeenLastCalledWith(expect.objectContaining({ q: "Anna & soci", offset: 0 })));
  const callsBefore = mocks.quotes.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Filtri" }));
  const dialog = screen.getByRole("dialog", { name: "Filtri quote e rinnovi" });
  fireEvent.change(within(dialog).getByLabelText("Annualità", { exact: true }), { target: { value: "2026" } });
  fireEvent.change(within(dialog).getByLabelText("Stato", { exact: true }), { target: { value: "paid_waiting_card" } });
  expect(mocks.quotes).toHaveBeenCalledTimes(callsBefore);
  fireEvent.click(within(dialog).getByRole("button", { name: "Applica filtri" }));
  await waitFor(() => expect(mocks.quotes).toHaveBeenLastCalledWith(expect.objectContaining({ year: 2026, status: "paid_waiting_card", q: "Anna & soci", offset: 0 })));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Esporta CSV" })).toHaveAttribute("href", "/api/org-admin/quotes.csv?year=2026&status=paid_waiting_card&q=Anna%20%26%20soci");
  fireEvent.click(screen.getByRole("button", { name: "Rimuovi filtro Stato: Pagati, attesa tessera" }));
  await waitFor(() => expect(mocks.quotes).toHaveBeenLastCalledWith(expect.objectContaining({ year: 2026, status: "", q: "Anna & soci" })));
});

it("discards unapplied filter edits on Escape and keeps the actual year visible", async () => {
  render(<MemoryRouter><OrgAdminQuote /></MemoryRouter>);
  await screen.findByText("Anna Rossi");
  const button = screen.getByRole("button", { name: "Annualità 2027, cambia filtri" });
  button.focus(); fireEvent.click(button);
  fireEvent.change(screen.getByLabelText("Annualità", { exact: true }), { target: { value: "2028" } });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(button).toHaveFocus();
  expect(screen.getByRole("button", { name: "Annualità 2027, cambia filtri" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Filtri" }));
  expect(screen.getByLabelText("Annualità", { exact: true })).toHaveValue("2027");
});

it("reveals the reminder toolbar only after selection and clears it when search changes", async () => {
  vi.setSystemTime(new Date("2027-06-01T12:00:00Z"));
  render(<MemoryRouter><OrgAdminQuote /></MemoryRouter>);
  await screen.findByText("Anna Rossi");
  expect(screen.queryByText("Nessun selezionato")).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Azioni sui soci selezionati" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cronologia operazioni" })).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona Anna Rossi" }));
  expect(screen.getByRole("button", { name: "Sollecita quote 2027" })).toBeVisible();
  fireEvent.change(screen.getByLabelText("Cerca socio"), { target: { value: "altro socio" } });
  expect(screen.queryByRole("group", { name: "Azioni sui soci selezionati" })).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Seleziona Anna Rossi" })).not.toBeChecked();
});

it("renders a compact mobile list with the same renewal and payment actions", async () => {
  mocks.mobile = true;
  render(<MemoryRouter><OrgAdminQuote /></MemoryRouter>);
  await screen.findByText("Anna Rossi");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Anna Rossi" })).toHaveAttribute("href", "/org-admin/soci/1");
  const row = screen.getByRole("listitem");
  expect(within(row).getByText("Rinnovato")).toBeVisible();
  expect(within(row).getByText("Da pagare")).toBeVisible();
  expect(within(row).getByText("#123")).toBeVisible();
  fireEvent.click(within(row).getByRole("button", { name: "Registra pagamento" }));
  expect(screen.getByRole("dialog", { name: "Registra pagamento rinnovo" })).toBeVisible();
  expect(screen.getByLabelText("Importo")).toHaveValue(25);
});

it("keeps partial payments on the accounting workflow on mobile", async () => {
  mocks.mobile = true;
  const response = await mocks.quotes();
  mocks.quotes.mockResolvedValue({ ...response, items: [{ ...response.items[0], payment_state: "partial", accounting_balance: { expected_cents: 2500, paid_cents: 1000, outstanding_cents: 1500, currency: "EUR" } }] });
  render(<MemoryRouter><OrgAdminQuote /></MemoryRouter>);
  await screen.findByText("Anna Rossi");
  expect(screen.getByText("Parzialmente pagato")).toBeVisible();
  expect(screen.getByText(/Residuo 15,00/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Completa saldo" })).toHaveAttribute("href", "/org-admin/incassi?member_id=1&year=2027");
  expect(screen.queryByRole("button", { name: "Registra pagamento" })).not.toBeInTheDocument();
});

it("prevents financial actions on stale rows while another membership year loads", async () => {
  render(<MemoryRouter><OrgAdminQuote /></MemoryRouter>);
  await screen.findByText("Anna Rossi");
  const initial = await mocks.quotes();
  let finish!: (value: unknown) => void;
  mocks.quotes.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole("button", { name: "Filtri" }));
  fireEvent.change(screen.getByLabelText("Annualità", { exact: true }), { target: { value: "2028" } });
  fireEvent.click(screen.getByRole("button", { name: "Applica filtri" }));
  expect(screen.getByRole("button", { name: "Registra pagamento" })).toBeDisabled();
  await waitFor(() => expect(mocks.quotes).toHaveBeenLastCalledWith(expect.objectContaining({ year: 2028 })));
  await act(async () => finish({ ...initial, year: 2028 }));
  expect(screen.getByRole("button", { name: "Registra pagamento" })).toBeEnabled();
});

it("keeps the payment membership year captured when its form was opened", async () => {
  render(<MemoryRouter><OrgAdminQuote /></MemoryRouter>);
  await screen.findByText("Anna Rossi");
  fireEvent.click(screen.getByRole("button", { name: "Registra pagamento" }));
  const payment = screen.getByRole("dialog", { name: "Registra pagamento rinnovo" });
  // Even a concurrent page state change must not redirect this form to a different year.
  fireEvent.click(screen.getByRole("button", { name: "Filtri" }));
  const filters = screen.getByRole("dialog", { name: "Filtri quote e rinnovi" });
  fireEvent.change(within(filters).getByLabelText("Annualità", { exact: true }), { target: { value: "2028" } });
  fireEvent.click(within(filters).getByRole("button", { name: "Applica filtri" }));
  fireEvent.submit(within(payment).getByRole("button", { name: "Registra e rinnova" }).closest("form")!);
  await waitFor(() => expect(mocks.payment).toHaveBeenCalledWith(1, expect.objectContaining({ membership_year: 2027, amount: 25 })));
});
