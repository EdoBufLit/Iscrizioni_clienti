import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardReplenishmentRequest, OrgAdminMembershipSettings } from "../../lib/api";
import { ToastProvider } from "../../components/ui/ToastProvider";
import OrgAdminCards from "./OrgAdminCards";

const mocks = vi.hoisted(() => ({
  stock: vi.fn(), metrics: vi.fn(), quotes: vi.fn(), replenishments: vi.fn(), settings: vi.fn(),
  patch: vi.fn(), upload: vi.fn(), create: vi.fn(), movements: vi.fn(), members: vi.fn(),
  admin: { id: 1, email: "admin@example.test", organization: { name: "Club Collaudo", slug: "club-collaudo" } },
}));
vi.mock("../../lib/api", async importOriginal => ({
  ...await importOriginal<typeof import("../../lib/api")>(),
  fetchCardStock: (...args: unknown[]) => mocks.stock(...args),
  fetchOrgAdminMetrics: (...args: unknown[]) => mocks.metrics(...args),
  fetchOrgAdminQuotes: (...args: unknown[]) => mocks.quotes(...args),
  fetchOrgAdminCardReplenishments: (...args: unknown[]) => mocks.replenishments(...args),
  fetchOrgAdminMembershipSettings: (...args: unknown[]) => mocks.settings(...args),
  patchOrgAdminMembershipSettings: (...args: unknown[]) => mocks.patch(...args),
  uploadOrgAdminCardAssets: (...args: unknown[]) => mocks.upload(...args),
  createOrgAdminCardReplenishment: (...args: unknown[]) => mocks.create(...args),
  fetchCardMovements: (...args: unknown[]) => mocks.movements(...args),
  fetchOrgAdminMembers: (...args: unknown[]) => mocks.members(...args),
}));
vi.mock("./OrgAdminLayout", () => ({ useOrgAdmin: () => ({ admin: mocks.admin, loading: false }) }));

const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Rome", year: "numeric" }).format(new Date()));
const capability = { can_auto_allocate: true, numbering_mode: "shared", blocked_reason: null, unit_price_cents: 100, currency: "EUR", min_quantity: 1, max_quantity: 5000, default_year: year, allowed_years: [year, year + 1] };
const settings: OrgAdminMembershipSettings = {
  custom_membership_types_enabled: true, membership_fee_amount: 30, temporary_membership_fee_amount: 5,
  membership_fee_currency: "EUR", temporary_membership_duration_value: 2, temporary_membership_duration_unit: "days",
  cash_only_signup_payment: true, online_payment_required: false, card_logo_url: null, card_style_locked: false,
  card_style: { primary_color: "#5A001F", secondary_color: "#2A0010", accent_color: "#D4B45C", text_color: "#FFFFFF", muted_text_color: "#F5D66D", font_family: "classic", surface_pattern: "geometric", logo_mode: "watermark", logo_position: "top-right", logo_opacity: .18, logo_blend: "normal", remove_logo_background: false, back_title: "Verifica tessera", back_body: "", back_show_member: true },
};
const createdRequest: CardReplenishmentRequest = {
  id: 77, organization_id: 1, organization_name: "Club Collaudo", requested_cards: 2, requested_year: year + 1,
  notes: null, allocation_status: "allocated", card_batch_id: 99, batch_range_start: 1000, batch_range_end: 1001,
  source: "org_admin_portal", unit_price_cents: 100, amount_due_cents: 200, currency: "EUR", billing_status: "unpaid",
  paid_at: null, paid_by_admin_id: null, payment_reference: null, accounting_note: null, accounting_updated_at: null,
  super_admin_notified_at: null, created_at: `${year}-10-29T10:00:00`, updated_at: null,
};
function orders(items: CardReplenishmentRequest[] = []) {
  return { items, total: items.length, summary: { total: items.length, unpaid: items.filter(item => item.billing_status === "unpaid").length, paid: items.filter(item => item.billing_status === "paid").length, outstanding_cents: items.filter(item => item.billing_status === "unpaid").reduce((sum, item) => sum + item.amount_due_cents, 0), paid_cents: items.filter(item => item.billing_status === "paid").reduce((sum, item) => sum + item.amount_due_cents, 0) }, capability, available_years: [year, year + 1], current_year: year, selected_year: year, lot_options: [{ id: 99, year: year + 1, range_start: 1000, range_end: 1001 }] };
}
function renderPage() {
  return render(<ToastProvider><MemoryRouter><OrgAdminCards /></MemoryRouter></ToastProvider>);
}
async function openDesign() {
  fireEvent.click(screen.getByRole("tab", { name: "Configurazione e design" }));
  await screen.findByRole("form", { name: "Design tessera" });
}
function openRules() {
  fireEvent.click(screen.getByText("Regole di emissione, prezzi e durata", { selector: "summary" }));
  return screen.getByRole("form", { name: "Regole di emissione" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stock.mockResolvedValue({ total: 53, used: 3, remaining: 47 });
  mocks.metrics.mockResolvedValue({ members_count: 6, active_members_count: 3, expiring_members_count: 1, expired_members_count: 2 });
  mocks.quotes.mockResolvedValue({ kpis: { currency: "EUR", collected_total: 9, expected_total: 9999 } });
  mocks.replenishments.mockResolvedValue(orders());
  mocks.settings.mockResolvedValue(settings);
  mocks.patch.mockImplementation(async payload => ({ ok: true, settings: { ...settings, ...payload } }));
  mocks.create.mockResolvedValue({ ok: true, created: true, item: createdRequest });
  mocks.movements.mockResolvedValue({ items: [], total: 0, current_year: year, selected_year: year, available_years: [year], lot_options: [] });
  mocks.members.mockResolvedValue({ summary: { total_theoretical_membership_fees: 9999 } });
});

describe("OrgAdminCards workspace", () => {
  it("opens only the operational overview with actual collections and accurate stock availability", async () => {
    renderPage();
    const progress = await screen.findByRole("progressbar", { name: "Tessere utilizzate o riservate" });
    expect(progress).toHaveAttribute("aria-valuenow", "11");
    expect(screen.getByText("47", { selector: ".cards-stock-available strong" })).toBeInTheDocument();
    expect(screen.getByText("Quote annuali incassate")).toBeInTheDocument();
    expect(screen.getByText(/9,00/)).toBeInTheDocument();
    expect(screen.queryByText(/9\.999,00/)).not.toBeInTheDocument();
    expect(mocks.members).not.toHaveBeenCalled();
    expect(mocks.quotes).toHaveBeenCalledExactlyOnceWith({ year, limit: 1, offset: 0 });
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.movements).not.toHaveBeenCalled();
    expect(mocks.replenishments).toHaveBeenCalledExactlyOnceWith({ limit: 1, offset: 0 });
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Stato e magazzino" })).toHaveAttribute("aria-selected", "true");
  });

  it("loads history and settings only when their tabs are selected, including keyboard navigation", async () => {
    renderPage();
    await screen.findByRole("progressbar");
    const stockTab = screen.getByRole("tab", { name: "Stato e magazzino" });
    stockTab.focus();
    fireEvent.keyDown(stockTab, { key: "ArrowRight" });
    const historyTab = screen.getByRole("tab", { name: "Movimenti e ordini" });
    expect(historyTab).toHaveFocus();
    await screen.findByRole("tab", { name: "Richieste" });
    await waitFor(() => expect(mocks.replenishments).toHaveBeenLastCalledWith({ year, limit: 20, offset: 0 }, expect.any(AbortSignal)));
    expect(mocks.settings).not.toHaveBeenCalled();
    fireEvent.keyDown(historyTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Configurazione e design" })).toHaveFocus();
    await screen.findByRole("form", { name: "Design tessera" });
    expect(mocks.settings).toHaveBeenCalledOnce();
  });

  it("preserves unsaved design and rule drafts across tabs without sending a save", async () => {
    renderPage();
    await screen.findByRole("progressbar");
    await openDesign();
    fireEvent.change(screen.getByLabelText("Sfondo"), { target: { value: "#123456" } });
    const rules = openRules();
    fireEvent.change(within(rules).getByLabelText("Prezzo annuale"), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("tab", { name: "Stato e magazzino" }));
    expect(screen.queryByRole("form", { name: "Design tessera" })).not.toBeInTheDocument();
    await openDesign();
    expect(screen.getByLabelText("Sfondo")).toHaveValue("#123456");
    expect(screen.getByLabelText("Prezzo annuale")).toHaveValue(42);
    expect(mocks.settings).toHaveBeenCalledOnce();
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it("preserves a disabled cash-only setting in a rules save and keeps its disclosure open", async () => {
    mocks.settings.mockResolvedValue({ ...settings, online_payment_required: true, cash_only_signup_payment: true });
    mocks.patch.mockImplementation(async payload => ({ ok: true, settings: { ...settings, ...payload, online_payment_required: true } }));
    renderPage();
    await screen.findByRole("progressbar");
    await openDesign();
    const rules = openRules();
    expect(within(rules).getByRole("checkbox", { name: "Solo contanti nel modulo di iscrizione" })).toBeDisabled();
    fireEvent.change(within(rules).getByLabelText("Prezzo annuale"), { target: { value: "42" } });
    const save = within(rules).getByRole("button", { name: "Salva regole" });
    save.focus();
    fireEvent.click(save);
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledExactlyOnceWith({ membership_fee_amount: 42, membership_fee_currency: "EUR", temporary_membership_fee_amount: 5, temporary_membership_duration_value: 2, temporary_membership_duration_unit: "days", cash_only_signup_payment: true }));
    await screen.findByText("Regole salvate");
    expect(screen.getByText("Regole di emissione, prezzi e durata", { selector: "summary" }).parentElement).toHaveAttribute("open");
    expect(screen.getByLabelText("Prezzo annuale")).toHaveValue(42);
    expect(screen.getByRole("checkbox", { name: "Solo contanti nel modulo di iscrizione" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Solo contanti nel modulo di iscrizione" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Salva regole" })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Salva regole" })).toHaveFocus());
  });

  it("does not pull focus back to a hidden rules form when the user changes tab during saving", async () => {
    let finish!: (value: { ok: boolean; settings: OrgAdminMembershipSettings }) => void;
    mocks.patch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    renderPage();
    await screen.findByRole("progressbar");
    await openDesign();
    const rules = openRules();
    const save = within(rules).getByRole("button", { name: "Salva regole" });
    save.focus();
    fireEvent.click(save);
    expect(save).toBeDisabled();
    const stock = screen.getByRole("tab", { name: "Stato e magazzino" });
    fireEvent.click(stock);
    stock.focus();
    await act(async () => finish({ ok: true, settings }));
    await screen.findByText("Regole salvate");
    await act(async () => new Promise<void>(resolve => window.requestAnimationFrame(() => resolve())));
    expect(stock).toHaveFocus();
    expect(screen.queryByRole("form", { name: "Regole di emissione" })).not.toBeInTheDocument();
  });

  it("keeps a confirmed replenishment accepted when subsequent stock refresh fails", async () => {
    mocks.stock.mockResolvedValueOnce({ total: 53, used: 3, remaining: 47 }).mockRejectedValue(new Error("Aggiornamento magazzino non disponibile"));
    mocks.replenishments.mockImplementation(async params => orders(params?.limit === 20 && params?.year === year + 1 ? [createdRequest] : []));
    renderPage();
    await screen.findByRole("progressbar");
    fireEvent.click(screen.getByRole("tab", { name: "Movimenti e ordini" }));
    await screen.findByText("Nessuna richiesta di rifornimento per quest'anno.");
    expect(mocks.replenishments.mock.calls.filter(([params]) => params?.limit === 20)).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: "Stato e magazzino" }));
    const open = screen.getByRole("button", { name: "+ Richiedi rifornimento tessere" });
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(open);
    const form = screen.getByRole("form", { name: "Richiesta rifornimento tessere" });
    fireEvent.change(within(form).getByLabelText("Quantità"), { target: { value: "2" } });
    fireEvent.change(within(form).getByLabelText("Anno"), { target: { value: String(year + 1) } });
    fireEvent.submit(form);
    await screen.findByText(new RegExp(`Richiesta #77: 2 tessere per il ${year + 1}`));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Rifornimento tessere" })).not.toBeInTheDocument());
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ requested_cards: 2, requested_year: year + 1, notes: null }, expect.any(String));
    expect(await screen.findByRole("alert")).toHaveTextContent("Alcuni dati non sono aggiornati");
    expect(screen.queryByText("Esito non confermato.")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.replenishments.mock.calls.filter(([params]) => params?.limit === 20)).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Stato e magazzino" })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Vedi richiesta →" }));
    await screen.findByRole("heading", { name: /Richiesta #77/ });
    expect(mocks.replenishments).toHaveBeenLastCalledWith({ year: year + 1, card_batch_id: 99, limit: 20, offset: 0 }, expect.any(AbortSignal));
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("does not crash or invent a missing balance with legacy currency or partial overview failure", async () => {
    mocks.quotes.mockResolvedValue({ kpis: { currency: "EURO", collected_total: 9 } });
    mocks.stock.mockRejectedValue(new Error("Magazzino non disponibile"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Alcuni dati non sono aggiornati");
    expect(screen.getByText("9,00 EURO")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("0 disponibili")).not.toBeInTheDocument();
  });
});
