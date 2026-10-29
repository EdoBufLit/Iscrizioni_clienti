import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthError,
  type CardReplenishmentRequest,
  type CardReplenishmentsParams,
  type OrgAdminCardReplenishmentsResponse,
} from "../../../../lib/api";
import CardOrdersPanel from "./CardOrdersPanel";

const mocks = vi.hoisted(() => ({ orders: vi.fn(), movements: vi.fn() }));
vi.mock("../../../../lib/api", () => ({
  AuthError: class AuthError extends Error {},
  fetchOrgAdminCardReplenishments: (...args: unknown[]) => mocks.orders(...args),
  fetchCardMovements: (...args: unknown[]) => mocks.movements(...args),
}));

function request(id: number, patch: Partial<CardReplenishmentRequest> = {}): CardReplenishmentRequest {
  return {
    id, organization_id: 1, organization_name: "Club prova", requested_cards: 52, requested_year: 2026,
    notes: null, allocation_status: "allocated", card_batch_id: 9, batch_range_start: 1, batch_range_end: 52,
    source: "whatsapp", unit_price_cents: 100, amount_due_cents: 5200, currency: "EUR", billing_status: "unpaid",
    paid_at: null, paid_by_admin_id: null, payment_reference: null, accounting_note: null, accounting_updated_at: null,
    super_admin_notified_at: null, created_at: "2026-05-26T11:00:00", updated_at: null, ...patch,
  };
}
function result(items = [request(20)], total = items.length): OrgAdminCardReplenishmentsResponse {
  return {
    items, total, summary: { total, unpaid: 1, paid: 2, outstanding_cents: 5200, paid_cents: 4500 },
    capability: { can_auto_allocate: true, numbering_mode: "shared", blocked_reason: null, unit_price_cents: 100, currency: "EUR", min_quantity: 1, max_quantity: 5000, default_year: 2026, allowed_years: [2026, 2027] },
    available_years: [2025, 2026, 2027], current_year: 2026, selected_year: 2026,
    lot_options: [{ id: 9, year: 2026, range_start: 1, range_end: 52 }, { id: 99, year: 2026, range_start: 1000, range_end: 2000 }],
  };
}
function renderPanel(props: Partial<Parameters<typeof CardOrdersPanel>[0]> = {}) {
  return render(<MemoryRouter><Routes><Route path="/" element={<CardOrdersPanel currentYear={2026} revision={0} {...props} />} /><Route path="/org-admin/login" element={<p>Sessione da rinnovare</p>} /></Routes></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.orders.mockResolvedValue(result());
  mocks.movements.mockResolvedValue({ items: [{ id: 9, year: 2026, range_start: 1, range_end: 52, quantity: 52, status_label: "Esaurito", created_at: "2026-05-26T11:00:00" }], total: 1, current_year: 2026, selected_year: 2026, available_years: [2025, 2026], lot_options: result().lot_options });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("CardOrdersPanel", () => {
  it("keeps mobile filter drafts isolated and restores focus when canceled", async () => {
    renderPanel();
    await screen.findByRole("list", { name: "Richieste di rifornimento" });
    const trigger = screen.getByRole("button", { name: "Filtri (1 attivo)" });
    expect(screen.getByRole("button", { name: "Rimuovi filtro anno 2026" })).toHaveTextContent("Anno 2026");
    trigger.focus(); fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Filtri richieste" });
    await waitFor(() => expect(within(dialog).getByLabelText("Lotto")).toBeEnabled());
    expect(mocks.orders).toHaveBeenLastCalledWith({ all_years: true, limit: 1, offset: 0 }, expect.any(AbortSignal));
    expect(screen.getAllByLabelText("Anno tessere")).toHaveLength(1);
    const calls = mocks.orders.mock.calls.length;
    fireEvent.change(within(dialog).getByLabelText("Stato richieste"), { target: { value: "paid" } });
    fireEvent.change(within(dialog).getByLabelText("Anno tessere"), { target: { value: "2025" } });
    expect(mocks.orders).toHaveBeenCalledTimes(calls);
    expect(screen.getByRole("button", { name: "Rimuovi filtro anno 2026" })).toBeInTheDocument();
    const close = within(dialog).getByRole("button", { name: "Chiudi finestra" });
    await waitFor(() => expect(close).toHaveFocus());
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(within(dialog).getByRole("button", { name: "Applica filtri" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).not.toBe("hidden");
    fireEvent.click(trigger);
    const reopened = screen.getByRole("dialog", { name: "Filtri richieste" });
    expect(within(reopened).getByLabelText("Anno tessere")).toHaveValue("2026");
    expect(within(reopened).getByLabelText("Stato richieste")).toHaveValue("");
    await waitFor(() => expect(within(reopened).getByLabelText("Lotto")).toBeEnabled());
  });

  it("loads all-year lot options for a draft and applies year, lot and status together from page zero", async () => {
    mocks.orders.mockImplementation((params: CardReplenishmentsParams) => {
      const data = result([request(20 + (params.offset ?? 0))], params.limit === 1 || params.year === 2027 ? 1 : 41);
      if (params.all_years && params.limit === 1) {
        data.lot_options = [...data.lot_options!, { id: 77, year: 2027, range_start: 700, range_end: 800 }];
        data.summary.paid_cents = 999900;
      }
      return Promise.resolve(data);
    });
    renderPanel();
    await screen.findByRole("button", { name: "Successivi" });
    fireEvent.click(screen.getByRole("button", { name: "Successivi" }));
    await screen.findByRole("heading", { name: /Richiesta #40/ });
    fireEvent.click(screen.getByRole("button", { name: "Filtri (1 attivo)" }));
    const dialog = screen.getByRole("dialog", { name: "Filtri richieste" });
    await waitFor(() => expect(within(dialog).getByLabelText("Lotto")).toBeEnabled());
    fireEvent.change(within(dialog).getByLabelText("Anno tessere"), { target: { value: "2027" } });
    expect(within(dialog).getByRole("option", { name: "700–800 · 2027" })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Lotto"), { target: { value: "77" } });
    fireEvent.change(within(dialog).getByLabelText("Stato richieste"), { target: { value: "paid" } });
    expect(screen.getByLabelText("Totali delle richieste filtrate")).not.toHaveTextContent("9.999,00");
    fireEvent.click(within(dialog).getByRole("button", { name: "Applica filtri" }));
    await waitFor(() => expect(mocks.orders).toHaveBeenLastCalledWith({ year: 2027, card_batch_id: 77, billing_status: "paid", limit: 20, offset: 0 }, expect.any(AbortSignal)));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filtri (3 attivi)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rimuovi filtro anno 2027" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rimuovi filtro stato Pagate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rimuovi filtro lotto/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filtri (3 attivi)" }));
    const resetDialog = screen.getByRole("dialog", { name: "Filtri richieste" });
    fireEvent.click(within(resetDialog).getByRole("button", { name: "Reimposta" }));
    expect(within(resetDialog).getByLabelText("Anno tessere")).toHaveValue("2026");
    expect(within(resetDialog).getByLabelText("Stato richieste")).toHaveValue("");
    expect(within(resetDialog).getByLabelText("Lotto")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Rimuovi filtro anno 2027" })).toBeInTheDocument();
    fireEvent.click(within(resetDialog).getByRole("button", { name: "Applica filtri" }));
    await waitFor(() => expect(mocks.orders).toHaveBeenLastCalledWith({ year: 2026, limit: 20, offset: 0 }, expect.any(AbortSignal)));
    expect(screen.getByRole("button", { name: "Filtri (1 attivo)" })).toBeInTheDocument();
  });

  it("removes applied pills independently and clears the year to all years", async () => {
    renderPanel();
    await screen.findByRole("list", { name: "Richieste di rifornimento" });
    fireEvent.change(screen.getByLabelText("Stato richieste"), { target: { value: "paid" } });
    fireEvent.change(screen.getByLabelText("Lotto"), { target: { value: "99" } });
    await waitFor(() => expect(mocks.orders).toHaveBeenLastCalledWith(expect.objectContaining({ billing_status: "paid", card_batch_id: 99 }), expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi filtro stato Pagate" }));
    await waitFor(() => expect(mocks.orders).toHaveBeenLastCalledWith({ year: 2026, card_batch_id: 99, limit: 20, offset: 0 }, expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole("button", { name: /Rimuovi filtro lotto/ }));
    await waitFor(() => expect(mocks.orders).toHaveBeenLastCalledWith({ year: 2026, limit: 20, offset: 0 }, expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi filtro anno 2026" }));
    await waitFor(() => expect(mocks.orders).toHaveBeenLastCalledWith({ all_years: true, limit: 20, offset: 0 }, expect.any(AbortSignal)));
    expect(screen.getByRole("button", { name: "Filtri" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Filtri applicati")).not.toBeInTheDocument();
  });

  it("retries filter metadata without discarding the draft or altering displayed data", async () => {
    let metadataRequests = 0;
    mocks.orders.mockImplementation((params: CardReplenishmentsParams) => {
      if (params.all_years && params.limit === 1 && metadataRequests++ === 0) return Promise.reject(new Error("Metadata non disponibili"));
      return Promise.resolve(result());
    });
    renderPanel();
    await screen.findByRole("list", { name: "Richieste di rifornimento" });
    fireEvent.click(screen.getByRole("button", { name: "Filtri (1 attivo)" }));
    const dialog = screen.getByRole("dialog", { name: "Filtri richieste" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Impossibile caricare tutti i lotti");
    fireEvent.change(within(dialog).getByLabelText("Stato richieste"), { target: { value: "paid" } });
    fireEvent.change(within(dialog).getByLabelText("Anno tessere"), { target: { value: "2025" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Riprova lotti" }));
    await waitFor(() => expect(within(dialog).getByLabelText("Lotto")).toBeEnabled());
    expect(within(dialog).getByLabelText("Anno tessere")).toHaveValue("2025");
    expect(within(dialog).getByLabelText("Stato richieste")).toHaveValue("paid");
    expect(mocks.orders.mock.calls.filter(([params]) => params.limit === 20)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Rimuovi filtro anno 2026" })).toBeInTheDocument();
  });

  it("uses lot statuses in the filter sheet without mixing billing statuses", async () => {
    renderPanel();
    await screen.findByRole("list", { name: "Richieste di rifornimento" });
    fireEvent.click(screen.getByRole("tab", { name: "Lotti" }));
    await screen.findByRole("list", { name: "Lotti tessere" });
    fireEvent.click(screen.getByRole("button", { name: "Filtri (1 attivo)" }));
    const dialog = screen.getByRole("dialog", { name: "Filtri lotti" });
    expect(within(dialog).queryByLabelText("Stato richieste")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Stato lotti"), { target: { value: "Esaurito" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Applica filtri" }));
    await waitFor(() => expect(mocks.movements).toHaveBeenLastCalledWith({ year: 2026, status: "Esaurito", limit: 20, offset: 0 }, expect.any(AbortSignal)));
    expect(screen.getByRole("button", { name: "Rimuovi filtro stato Esaurito" })).toBeInTheDocument();
  });

  it("discards a small-screen draft on desktop resize and returns to the inline filters", async () => {
    let onResize!: () => void;
    const media = { matches: false, addEventListener: (_type: string, listener: () => void) => { onResize = listener; }, removeEventListener: vi.fn() };
    vi.stubGlobal("matchMedia", vi.fn(() => media));
    renderPanel();
    await screen.findByRole("list", { name: "Richieste di rifornimento" });
    fireEvent.click(screen.getByRole("button", { name: "Filtri (1 attivo)" }));
    fireEvent.change(screen.getByLabelText("Stato richieste"), { target: { value: "paid" } });
    act(() => { media.matches = true; onResize(); });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Stato richieste")).toHaveValue("");
    await waitFor(() => expect(screen.getByLabelText("Stato richieste")).toHaveFocus());
  });

  it("shows true money totals and readable request rows without treating historical records as debt", async () => {
    mocks.orders.mockResolvedValue(result([request(20), request(21, { billing_status: "not_applicable", amount_due_cents: 123456, source: "legacy" })]));
    renderPanel();
    const list = await screen.findByRole("list", { name: "Richieste di rifornimento" });
    expect(mocks.orders).toHaveBeenCalledWith({ year: 2026, limit: 20, offset: 0 }, expect.any(AbortSignal));
    expect(mocks.movements).not.toHaveBeenCalled();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const totals = screen.getByLabelText("Totali delle richieste filtrate");
    expect(within(totals).getByText(/45,00/)).toBeInTheDocument();
    expect(within(totals).getByText(/52,00/)).toBeInTheDocument();
    expect(within(list).getByText(/WhatsApp/)).toBeInTheDocument();
    const legacyRow = within(list).getByRole("heading", { name: /Richiesta #21/ }).closest("li")!;
    expect(within(legacyRow).getByText("Storico", { selector: ".cards-orders__badge" })).toBeInTheDocument();
    expect(legacyRow).not.toHaveTextContent("1.234,56");
    expect(within(legacyRow).queryByText("Da pagare")).not.toBeInTheDocument();
    expect(within(legacyRow).getByLabelText("Importo storico non contabilizzato")).toHaveTextContent("—");
  });

  it("keeps amounts in the compact row and opens notes only in a readonly sheet", async () => {
    mocks.orders.mockResolvedValue(result([request(20, { notes: "Indicazioni conservate\nSeconda riga della nota" })]));
    renderPanel();
    const list = await screen.findByRole("list", { name: "Richieste di rifornimento" });
    const row = within(list).getByRole("heading", { name: /Richiesta #20/ }).closest("li")!;
    const detail = row.querySelector(".cards-orders__row-detail") as HTMLElement;
    expect(within(detail).getByText(/52,00/)).toBeInTheDocument();
    expect(detail).not.toHaveTextContent("2026");
    expect(screen.queryByText(/Indicazioni conservate/)).not.toBeInTheDocument();
    const notes = screen.getByRole("button", { name: "Leggi note della richiesta #20" });
    notes.focus();
    fireEvent.click(notes);
    const dialog = screen.getByRole("dialog", { name: "Note richiesta #20" });
    expect(within(dialog).getByText(/Indicazioni conservate/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Chiudi finestra" })).toHaveFocus());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(notes).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Anno tessere"), { target: { value: "" } });
    await waitFor(() => expect(mocks.orders).toHaveBeenLastCalledWith({ all_years: true, limit: 20, offset: 0 }, expect.any(AbortSignal)));
    const allYearsRow = await screen.findByRole("heading", { name: /Richiesta #20/ });
    expect(allYearsRow.closest("li")?.querySelector(".cards-orders__row-detail")).toHaveTextContent("2026");
  });

  it("paginates requests and resets the offset when a real filter changes", async () => {
    mocks.orders.mockImplementation((params: CardReplenishmentsParams) => Promise.resolve(result([request(20 + (params.offset ?? 0))], 41)));
    renderPanel();
    await screen.findByRole("heading", { name: /Richiesta #20/ });
    fireEvent.click(screen.getByRole("button", { name: "Successivi" }));
    await screen.findByRole("heading", { name: /Richiesta #40/ });
    expect(screen.getByRole("tabpanel", { name: "Richieste" })).toHaveFocus();
    expect(mocks.orders).toHaveBeenLastCalledWith({ year: 2026, limit: 20, offset: 20 }, expect.any(AbortSignal));
    fireEvent.change(screen.getByLabelText("Stato richieste"), { target: { value: "paid" } });
    await waitFor(() => expect(mocks.orders).toHaveBeenLastCalledWith({ year: 2026, billing_status: "paid", limit: 20, offset: 0 }, expect.any(AbortSignal)));
    await screen.findByRole("heading", { name: /Richiesta #20/ });
    expect(screen.getByRole("button", { name: "Precedenti" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Lotto"), { target: { value: "99" } });
    await waitFor(() => expect(mocks.orders).toHaveBeenLastCalledWith(expect.objectContaining({ card_batch_id: 99, offset: 0 }), expect.any(AbortSignal)));
  });

  it("loads lots only on demand and applies year/status filters before pagination", async () => {
    renderPanel();
    await screen.findByRole("list", { name: "Richieste di rifornimento" });
    fireEvent.click(screen.getByRole("tab", { name: "Lotti" }));
    await screen.findByRole("list", { name: "Lotti tessere" });
    expect(mocks.movements).toHaveBeenLastCalledWith({ year: 2026, limit: 20, offset: 0 }, expect.any(AbortSignal));
    expect(screen.getByText("Esaurito")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Lotto #9/ })).not.toHaveTextContent("2026");
    fireEvent.change(screen.getByLabelText("Stato lotti"), { target: { value: "Esaurito" } });
    await waitFor(() => expect(mocks.movements).toHaveBeenLastCalledWith(expect.objectContaining({ year: 2026, status: "Esaurito" }), expect.any(AbortSignal)));
    fireEvent.change(screen.getByLabelText("Anno tessere"), { target: { value: "" } });
    await waitFor(() => expect(mocks.movements).toHaveBeenLastCalledWith({ all_years: true, status: "Esaurito", limit: 20, offset: 0 }, expect.any(AbortSignal)));
    await waitFor(() => expect(screen.getByRole("heading", { name: /Lotto #9/ })).toHaveTextContent("2026"));
  });

  it("ignores an obsolete response when the year changes", async () => {
    let finishFirst!: (value: OrgAdminCardReplenishmentsResponse) => void;
    mocks.orders.mockReturnValueOnce(new Promise<OrgAdminCardReplenishmentsResponse>(resolve => { finishFirst = resolve; })).mockResolvedValue(result([request(50, { requested_year: 2025 })]));
    renderPanel();
    const firstSignal = mocks.orders.mock.calls[0][1] as AbortSignal;
    fireEvent.change(screen.getByLabelText("Anno tessere"), { target: { value: "" } });
    await screen.findByRole("heading", { name: /Richiesta #50/ });
    expect(firstSignal.aborted).toBe(true);
    await act(async () => finishFirst(result([request(99)])));
    expect(screen.queryByRole("heading", { name: /Richiesta #99/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Richiesta #50/ })).toBeInTheDocument();
  });

  it("offers retry without inventing zero billing totals after an API failure", async () => {
    mocks.orders.mockRejectedValueOnce(new Error("Servizio non disponibile")).mockResolvedValueOnce(result());
    renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent("Servizio non disponibile");
    expect(screen.queryByLabelText("Totali delle richieste filtrate")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova storico" }));
    expect(await screen.findByRole("list", { name: "Richieste di rifornimento" })).toBeInTheDocument();
  });

  it("keeps historical amounts readable when a stored currency code is not ISO formatted", async () => {
    const legacy = result([request(21, { currency: "EURO" })]);
    legacy.capability.currency = "EURO";
    mocks.orders.mockResolvedValue(legacy);
    renderPanel();
    await screen.findByRole("list", { name: "Richieste di rifornimento" });
    expect(screen.getByText("45,00 EURO")).toBeInTheDocument();
    expect(screen.getAllByText("52,00 EURO")).toHaveLength(2);
  });

  it("focuses a created request in its actual year and reloads after revision changes", async () => {
    mocks.orders.mockImplementation((params: CardReplenishmentsParams) => Promise.resolve(result([request(params.year === 2027 ? 77 : 20, { requested_year: params.year ?? 2026 })])));
    const props = { currentYear: 2026, revision: 0, focusRequest: null as CardReplenishmentRequest | null };
    const view = render(<MemoryRouter><CardOrdersPanel {...props} /></MemoryRouter>);
    await screen.findByRole("heading", { name: /Richiesta #20/ });
    fireEvent.click(screen.getByRole("tab", { name: "Lotti" }));
    await screen.findByRole("list", { name: "Lotti tessere" });
    expect(mocks.movements).toHaveBeenCalledOnce();
    view.rerender(<MemoryRouter><CardOrdersPanel {...props} revision={1} focusRequest={request(77, { requested_year: 2027, card_batch_id: 99 })} /></MemoryRouter>);
    const heading = await screen.findByRole("heading", { name: /Richiesta #77/ });
    await waitFor(() => expect(heading.closest("li")).toHaveFocus());
    expect(screen.getByRole("tab", { name: "Richieste" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Anno tessere")).toHaveValue("2027");
    expect(screen.getByLabelText("Lotto")).toHaveValue("99");
    expect(mocks.orders).toHaveBeenLastCalledWith({ year: 2027, card_batch_id: 99, limit: 20, offset: 0 }, expect.any(AbortSignal));
    expect(mocks.orders).toHaveBeenCalledTimes(2);
    expect(mocks.movements).toHaveBeenCalledOnce();
  });

  it("makes one active-view request per year change and preserves the shared filters when switching view", async () => {
    renderPanel();
    await screen.findByRole("list", { name: "Richieste di rifornimento" });
    expect(mocks.orders).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("tab", { name: "Lotti" }));
    await screen.findByRole("list", { name: "Lotti tessere" });
    expect(mocks.movements).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText("Anno tessere"), { target: { value: "2025" } });
    await waitFor(() => expect(mocks.movements).toHaveBeenCalledTimes(2));
    await screen.findByRole("list", { name: "Lotti tessere" });
    expect(mocks.movements).toHaveBeenLastCalledWith({ year: 2025, limit: 20, offset: 0 }, expect.any(AbortSignal));
    expect(mocks.orders).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("tab", { name: "Richieste" }));
    await screen.findByRole("list", { name: "Richieste di rifornimento" });
    expect(mocks.orders).toHaveBeenCalledTimes(2);
    expect(mocks.orders).toHaveBeenLastCalledWith({ year: 2025, limit: 20, offset: 0 }, expect.any(AbortSignal));
    expect(mocks.movements).toHaveBeenCalledTimes(2);
  });

  it("can focus the same request again after the user changes filters", async () => {
    const focus = request(77, { requested_year: 2027, card_batch_id: 99 });
    mocks.orders.mockResolvedValue(result([focus]));
    const view = render(<MemoryRouter><CardOrdersPanel currentYear={2026} revision={1} focusRequest={focus} /></MemoryRouter>);
    await screen.findByRole("heading", { name: /Richiesta #77/ });
    const yearFilter = screen.getByLabelText("Anno tessere");
    yearFilter.focus();
    fireEvent.change(yearFilter, { target: { value: "2025" } });
    await waitFor(() => expect(mocks.orders).toHaveBeenLastCalledWith(expect.objectContaining({ year: 2025 }), expect.any(AbortSignal)));
    await act(async () => new Promise<void>(resolve => window.requestAnimationFrame(() => resolve())));
    expect(yearFilter).toHaveFocus();
    view.rerender(<MemoryRouter><CardOrdersPanel currentYear={2026} revision={1} focusRequest={{ ...focus }} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText("Anno tessere")).toHaveValue("2027"));
    expect(screen.getByLabelText("Lotto")).toHaveValue("99");
    expect(mocks.orders).toHaveBeenLastCalledWith(expect.objectContaining({ year: 2027, card_batch_id: 99 }), expect.any(AbortSignal));
    await waitFor(() => expect(screen.getByRole("heading", { name: /Richiesta #77/ }).closest("li")).toHaveFocus());
  });

  it("returns to an existing page when the filtered total shrinks after refresh", async () => {
    mocks.orders.mockImplementation((params: CardReplenishmentsParams) => Promise.resolve(result([request(20 + (params.offset ?? 0))], 21)));
    const view = render(<MemoryRouter><CardOrdersPanel currentYear={2026} revision={0} /></MemoryRouter>);
    await screen.findByRole("button", { name: "Successivi" });
    fireEvent.click(screen.getByRole("button", { name: "Successivi" }));
    await screen.findByRole("heading", { name: /Richiesta #40/ });
    mocks.orders.mockImplementation((_params: CardReplenishmentsParams) => Promise.resolve(result([request(80)], 1)));
    view.rerender(<MemoryRouter><CardOrdersPanel currentYear={2026} revision={1} /></MemoryRouter>);
    await screen.findByRole("heading", { name: /Richiesta #80/ });
    expect(mocks.orders).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }), expect.any(AbortSignal));
    expect(screen.queryByRole("navigation", { name: "Pagine dello storico" })).not.toBeInTheDocument();
  });

  it("redirects an expired session to login", async () => {
    mocks.orders.mockRejectedValue(new AuthError("Sessione scaduta"));
    renderPanel();
    expect(await screen.findByText("Sessione da rinnovare")).toBeInTheDocument();
  });
});
