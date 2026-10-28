import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgAdminMemberDetail } from "../../../lib/api";
import type { MemberAccounting } from "../../../lib/accounting";
import MemberPaymentsPanel from "./MemberPaymentsPanel";

const mocks = vi.hoisted(() => ({ account: vi.fn(), register: vi.fn() }));
vi.mock("../../../lib/accounting", () => ({ fetchMemberAccounting: mocks.account }));

const member: OrgAdminMemberDetail = {
  id: 42,
  first_name: "Mario",
  last_name: "Rossi",
  email: "mario@example.com",
  phone: null,
  fiscal_code: null,
  status: "PENDING",
  workflow_status: "pending_cards",
  is_active: false,
  membership_type: "annual",
  card_year: 2026,
  payment_required: true,
  payment_status: "pending",
  documents: [],
  payments: [],
  membership_payments: [],
};
const account: MemberAccounting = {
  balance: { expected_cents: 3000, paid_cents: 0, outstanding_cents: 3000, currency: "EUR" },
  receipts: [],
  events: [],
};
function renderPanel(patch: Partial<OrgAdminMemberDetail> = {}) {
  return render(<MemoryRouter><MemberPaymentsPanel member={{ ...member, ...patch }} paymentStatus={{ label: "In attesa", tone: "" }} onRegisterPayment={mocks.register} registering={false} /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.account.mockResolvedValue(account);
});
afterEach(cleanup);

describe("MemberPaymentsPanel", () => {
  it("carica il saldo reale dell'annualità tessera e apre soltanto il form richiesto", async () => {
    renderPanel();
    const register = await screen.findByRole("button", { name: "+ Registra pagamento" });
    expect(mocks.account).toHaveBeenCalledWith(42, 2026, expect.any(AbortSignal));
    expect(screen.getByText("Incassato netto")).toBeInTheDocument();
    expect(screen.queryByLabelText("Importo")).not.toBeInTheDocument();
    fireEvent.click(register);
    expect(mocks.register).toHaveBeenCalledOnce();
  });

  it("protegge un saldo parziale anche quando il riepilogo socio non lo segnala", async () => {
    mocks.account.mockResolvedValue({ ...account, balance: { ...account.balance, paid_cents: 1000, outstanding_cents: 2000 } });
    renderPanel();
    expect(await screen.findByRole("link", { name: "Completa saldo in Incassi" })).toHaveAttribute("href", "/org-admin/incassi?member_id=42&year=2026");
    expect(screen.getByText("Parzialmente pagata")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Registra pagamento" })).not.toBeInTheDocument();
  });

  it("consente di registrare la quota in contanti anche senza obbligo di pagamento online", async () => {
    renderPanel({ payment_required: false, payment_status: "not_required", payment_method: "CASH" });
    expect(await screen.findByRole("button", { name: "+ Registra pagamento" })).toBeEnabled();
    expect(screen.getByText("In attesa")).toBeInTheDocument();
  });

  it.each(["manual_partial", "manual_reversed", "manual_completed", "completed"])("non registra nuovamente la quota con stato %s", async payment_status => {
    renderPanel({ payment_status });
    await screen.findByText("Incassato netto");
    expect(screen.queryByRole("button", { name: "+ Registra pagamento" })).not.toBeInTheDocument();
  });

  it("non espone un secondo pagamento quando il saldo è già coperto", async () => {
    mocks.account.mockResolvedValue({ ...account, balance: { ...account.balance, paid_cents: 3000, outstanding_cents: 0 } });
    renderPanel();
    await screen.findByText("Incassato netto");
    expect(screen.queryByRole("button", { name: "+ Registra pagamento" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Verifica incassi e rettifiche" })).toBeInTheDocument();
    expect(screen.getByText("Pagata")).toBeInTheDocument();
  });

  it("distingue l'importo di un incasso condiviso dal saldo personale", async () => {
    mocks.account.mockResolvedValue({
      ...account,
      balance: { ...account.balance, paid_cents: 1000, outstanding_cents: 2000 },
      receipts: [{ id: 9, version: 1, amount_cents: 6000, currency: "EUR", method: "bank_transfer", paid_on: "2026-10-28", payer: "Famiglia Rossi", reference: null, description: null, source: "manual", source_key: null, status: "partial", allocated_cents: 1000, unallocated_cents: 5000, created_at: "2026-10-28T10:00:00Z", permissions: { can_adjust: true, can_void: true, reason: null } }],
    });
    renderPanel();
    expect(await screen.findByRole("link", { name: "Incasso #9" })).toHaveAttribute("href", "/org-admin/incassi?member_id=42&year=2026&receipt_id=9");
    expect(screen.getByText("Parzialmente abbinato")).toBeInTheDocument();
    expect(screen.getByText(/Importo incasso: 60,00/)).toBeInTheDocument();
    expect(screen.getByText(/10,00/)).toBeInTheDocument();
  });

  it("permette il retry senza mostrare un saldo zero inventato dopo un errore", async () => {
    mocks.account.mockRejectedValueOnce(new Error("Servizio temporaneamente non disponibile")).mockResolvedValueOnce(account);
    renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent("Servizio temporaneamente non disponibile");
    expect(screen.queryByText("Incassato netto")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Registra pagamento" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova saldo" }));
    expect(await screen.findByRole("button", { name: "+ Registra pagamento" })).toBeEnabled();
    expect(mocks.account).toHaveBeenCalledTimes(2);
  });

  it("annulla il caricamento quando il pannello viene chiuso", async () => {
    let resolve: ((value: MemberAccounting) => void) | undefined;
    mocks.account.mockReturnValue(new Promise<MemberAccounting>(done => { resolve = done; }));
    const { unmount } = renderPanel();
    await waitFor(() => expect(mocks.account).toHaveBeenCalledOnce());
    const signal = mocks.account.mock.calls[0][2] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve?.(account); });
  });

  it("separa le temporanee dal saldo annuale e non duplica gli storici legacy", async () => {
    renderPanel({
      membership_type: "temporary",
      membership_payments: [{ id: 7, provider: "sumup", source: "manual", status: "manual_completed", amount: 30, currency: "EUR", notes: "Una sola registrazione", confirmed_at: "2026-10-28T10:00:00Z" }],
      payments: [{ id: 8, amount_cents: 3000, amount: 30, method: "contanti", paid_at: "2026-10-28", notes: "Legacy duplicato" }],
    });
    expect(screen.getByRole("heading", { name: "Quota tessera temporanea" })).toBeInTheDocument();
    expect(mocks.account).not.toHaveBeenCalled();
    expect(screen.queryByText("Incassato netto")).not.toBeInTheDocument();
    expect(screen.getByText("Pagato")).toBeInTheDocument();
    expect(screen.getByText("Una sola registrazione")).toBeInTheDocument();
    expect(screen.queryByText("Legacy duplicato")).not.toBeInTheDocument();
    expect(screen.queryByText("manual_completed")).not.toBeInTheDocument();
  });
});
