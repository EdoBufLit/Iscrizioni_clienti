import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../lib/api";
import SuperAdminCardCredits from "./SuperAdminCardCredits";

vi.mock("../../lib/api", async (original) => ({
  ...await original<typeof import("../../lib/api")>(),
  fetchSuperAdminRechargeCredits: vi.fn(),
  fetchSuperAdminOrganizations: vi.fn(),
  patchSuperAdminRechargeCreditAccounting: vi.fn(),
  retrySuperAdminRechargeCreditAllocation: vi.fn(),
  stepUpSuperAdmin: vi.fn(),
}));

const whatsapp = {
  id: 19, organization_id: 7, organization_name: "Club Roma", requested_cards: 250,
  requested_year: 2026, notes: null, allocation_status: "pending", card_batch_id: null,
  batch_range_start: null, batch_range_end: null, source: "whatsapp", unit_price_cents: 100,
  amount_due_cents: 25000, currency: "EUR", billing_status: "unpaid", paid_at: null,
  paid_by_admin_id: null, payment_reference: null, accounting_note: null,
  accounting_updated_at: null, super_admin_notified_at: null, created_at: "2026-09-12T10:00:00Z",
  updated_at: null, accounting_events: [],
} satisfies api.CardReplenishmentRequest;
const online = { ...whatsapp, id: 20, source: "org_admin_portal", requested_cards: 100, amount_due_cents: 10000 };
const initial = {
  items: [whatsapp, online], total: 2,
  summary: { total: 2, requested_cards: 350, whatsapp_cards: 250, unpaid: 2, paid: 0, outstanding_cents: 35000, paid_cents: 0 },
} satisfies api.SuperAdminRechargeCreditsResponse;
const organizations = [
  { id: 7, name: "Club Roma", is_active: true },
  { id: 8, name: "Associazione archiviata", is_archived: true, is_active: false },
] as api.SuperAdminOrganization[];

function showPage() {
  return render(<MemoryRouter><Routes><Route element={<Outlet context={{ profile: { id: 1 } }} />}>
    <Route index element={<SuperAdminCardCredits />} />
  </Route></Routes></MemoryRouter>);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function summaryCard(label: string) {
  const region = screen.getByRole("region", { name: "Riepilogo crediti filtrati" });
  return within(region).getByText(label).closest("article")!;
}

async function verifyMfa() {
  fireEvent.change(screen.getByLabelText("Codice MFA o di recupero"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verifica" }));
  await screen.findByText("Modifiche abilitate per questa sessione.");
}

describe("Crediti tessere online e WhatsApp", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.fetchSuperAdminRechargeCredits).mockResolvedValue(initial);
    vi.mocked(api.fetchSuperAdminOrganizations).mockResolvedValue({ items: organizations, page: 1, page_size: 100, total: 2, total_pages: 1 });
    vi.mocked(api.stepUpSuperAdmin).mockResolvedValue();
    vi.mocked(api.patchSuperAdminRechargeCreditAccounting).mockResolvedValue({ ok: true, item: { ...whatsapp, billing_status: "paid" } });
  });

  it("apre tutte le origini e usa quantità e importi dell'intero risultato filtrato", async () => {
    vi.mocked(api.fetchSuperAdminRechargeCredits).mockResolvedValue({
      ...initial, total: 102,
      summary: { ...initial.summary, total: 102, requested_cards: 5350, whatsapp_cards: 2250, unpaid: 101, paid: 1, outstanding_cents: 525000, paid_cents: 10000 },
    });
    showPage();
    await screen.findByText("#19");
    expect(api.fetchSuperAdminRechargeCredits).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "all", billing_status: "all", offset: 0, limit: 100 }));
    expect(screen.getByLabelText("Origine")).toHaveValue("all");
    const table = screen.getByRole("table");
    expect(within(table).getByText("Online")).toBeInTheDocument();
    expect(within(table).getByText("WhatsApp")).toBeInTheDocument();
    expect(summaryCard("Richieste")).toHaveTextContent("102");
    expect(summaryCard("Tessere richieste")).toHaveTextContent((5350).toLocaleString("it-IT"));
    expect(summaryCard("Da pagare")).toHaveTextContent(new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(5250).replace(/\s/g, " "));
    expect(summaryCard("Pagate")).toHaveTextContent("100,00");
    expect(screen.getByRole("button", { name: "Successiva" })).toBeEnabled();
  });

  it("carica tutte le pagine di associazioni, incluse le archiviate, e le ordina alfabeticamente", async () => {
    vi.mocked(api.fetchSuperAdminOrganizations).mockImplementation(async (params) => ({
      items: params?.page === 2 ? [organizations[1]] : [organizations[0]],
      page: params?.page ?? 1, page_size: 100, total: 101, total_pages: 2,
    }));
    showPage();
    await screen.findByRole("option", { name: "Associazione archiviata (archiviata)" });
    expect(api.fetchSuperAdminOrganizations).toHaveBeenCalledTimes(2);
    expect(api.fetchSuperAdminOrganizations).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, status: "all" }));
    expect(within(screen.getByLabelText("Associazione")).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Tutte le associazioni", "Associazione archiviata (archiviata)", "Club Roma",
    ]);
    fireEvent.change(screen.getByLabelText("Associazione"), { target: { value: "8" } });
    await waitFor(() => expect(api.fetchSuperAdminRechargeCredits).toHaveBeenLastCalledWith(expect.objectContaining({ org_id: 8, scope: "all", offset: 0 })));
  });

  it("pagina oltre 100 righe, combina i filtri e applica la ricerca solo al submit", async () => {
    vi.mocked(api.fetchSuperAdminRechargeCredits).mockResolvedValue({ ...initial, total: 202, summary: { ...initial.summary, total: 202 } });
    showPage();
    await screen.findByText("#19");
    fireEvent.click(screen.getByRole("button", { name: "Successiva" }));
    await waitFor(() => expect(api.fetchSuperAdminRechargeCredits).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 100 })));
    await screen.findByText("#19");
    fireEvent.change(screen.getByLabelText("Cerca associazione o numero richiesta"), { target: { value: "  Roma  " } });
    fireEvent.change(screen.getByLabelText("Origine"), { target: { value: "whatsapp" } });
    await waitFor(() => expect(api.fetchSuperAdminRechargeCredits).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "whatsapp", offset: 0, q: undefined })));
    fireEvent.change(screen.getByLabelText("Associazione"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Contabilità"), { target: { value: "unpaid" } });
    fireEvent.click(screen.getByRole("button", { name: "Cerca" }));
    await waitFor(() => expect(api.fetchSuperAdminRechargeCredits).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "whatsapp", billing_status: "unpaid", org_id: 7, q: "Roma", offset: 0 })));
    await screen.findByText("#19");
    fireEvent.click(screen.getByRole("button", { name: "Successiva" }));
    await waitFor(() => expect(api.fetchSuperAdminRechargeCredits).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "whatsapp", billing_status: "unpaid", org_id: 7, q: "Roma", offset: 100 })));
  });

  it("ignora risposte e errori delle ricerche precedenti", async () => {
    const old = deferred<api.SuperAdminRechargeCreditsResponse>();
    const middle = deferred<api.SuperAdminRechargeCreditsResponse>();
    vi.mocked(api.fetchSuperAdminRechargeCredits)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(middle.promise)
      .mockResolvedValue({ ...initial, items: [whatsapp], total: 1, summary: { ...initial.summary, total: 1, requested_cards: 250 } });
    showPage();
    fireEvent.change(screen.getByLabelText("Origine"), { target: { value: "portal" } });
    fireEvent.change(screen.getByLabelText("Origine"), { target: { value: "whatsapp" } });
    await screen.findByText("#19");
    await act(async () => { old.resolve(initial); middle.reject(new Error("Risposta precedente")); });
    expect(screen.queryByText("#20")).not.toBeInTheDocument();
    expect(summaryCard("Richieste")).toHaveTextContent("1");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(vi.mocked(api.fetchSuperAdminRechargeCredits).mock.calls[0][0]?.signal?.aborted).toBe(true);
  });

  it("registra il pagamento WhatsApp dopo MFA e ricarica importi e filtri senza duplicare il salvataggio", async () => {
    const saving = deferred<Awaited<ReturnType<typeof api.patchSuperAdminRechargeCreditAccounting>>>();
    vi.mocked(api.patchSuperAdminRechargeCreditAccounting).mockReturnValue(saving.promise);
    showPage();
    await screen.findByText("#19");
    fireEvent.change(screen.getByLabelText("Associazione"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Origine"), { target: { value: "whatsapp" } });
    await screen.findByText("#19");
    fireEvent.click(within(screen.getByText("#19").closest("tr")!).getByRole("button", { name: "Contabilità" }));
    expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled();
    await verifyMfa();
    fireEvent.change(screen.getByLabelText("Stato"), { target: { value: "paid" } });
    fireEvent.change(screen.getByLabelText("Riferimento"), { target: { value: " BON-19 " } });
    fireEvent.change(screen.getByLabelText("Nota contabile"), { target: { value: " Confermato " } });
    const save = screen.getByRole("button", { name: "Salva" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(api.patchSuperAdminRechargeCreditAccounting).toHaveBeenCalledTimes(1);
    expect(api.patchSuperAdminRechargeCreditAccounting).toHaveBeenCalledWith(19, { billing_status: "paid", payment_reference: "BON-19", accounting_note: "Confermato" });
    const paid = { ...whatsapp, billing_status: "paid" as const, paid_at: "2026-09-12T12:00:00Z", payment_reference: "BON-19" };
    vi.mocked(api.fetchSuperAdminRechargeCredits).mockResolvedValue({ items: [paid], total: 1, summary: { total: 1, requested_cards: 250, whatsapp_cards: 250, unpaid: 0, paid: 1, outstanding_cents: 0, paid_cents: 25000 } });
    await act(async () => saving.resolve({ ok: true, item: paid }));
    await screen.findByText("Rif. BON-19");
    expect(api.fetchSuperAdminRechargeCredits).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "whatsapp", org_id: 7, offset: 0 }));
    expect(summaryCard("Da pagare")).toHaveTextContent("0,00");
    expect(summaryCard("Pagate")).toHaveTextContent("250,00");
    expect(screen.queryByRole("button", { name: "Salva" })).not.toBeInTheDocument();
  });

  it("ricarica i filtri correnti quando cambiano durante un pagamento", async () => {
    const saving = deferred<Awaited<ReturnType<typeof api.patchSuperAdminRechargeCreditAccounting>>>();
    vi.mocked(api.patchSuperAdminRechargeCreditAccounting).mockReturnValue(saving.promise);
    showPage();
    await screen.findByText("#19");
    await verifyMfa();
    fireEvent.click(within(screen.getByText("#19").closest("tr")!).getByRole("button", { name: "Contabilità" }));
    fireEvent.change(screen.getByLabelText("Stato"), { target: { value: "paid" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    fireEvent.change(screen.getByLabelText("Origine"), { target: { value: "portal" } });
    fireEvent.change(screen.getByLabelText("Associazione"), { target: { value: "8" } });
    await waitFor(() => expect(api.fetchSuperAdminRechargeCredits).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "portal", org_id: 8 })));
    const requestsBeforeSave = vi.mocked(api.fetchSuperAdminRechargeCredits).mock.calls.length;
    await act(async () => saving.resolve({ ok: true, item: { ...whatsapp, billing_status: "paid" } }));
    await waitFor(() => expect(api.fetchSuperAdminRechargeCredits).toHaveBeenCalledTimes(requestsBeforeSave + 1));
    expect(api.fetchSuperAdminRechargeCredits).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "portal", org_id: 8, offset: 0 }));
  });

  it("torna all'ultima pagina disponibile se il pagamento rimuove l'ultima richiesta filtrata", async () => {
    let paid = false;
    vi.mocked(api.fetchSuperAdminRechargeCredits).mockImplementation(async (params) => ({
      ...initial, items: params?.offset === 100 && paid ? [] : [whatsapp], total: paid ? 100 : 101,
      summary: { ...initial.summary, total: paid ? 100 : 101 },
    }));
    vi.mocked(api.patchSuperAdminRechargeCreditAccounting).mockImplementation(async () => {
      paid = true;
      return { ok: true, item: { ...whatsapp, billing_status: "paid" } };
    });
    showPage();
    await screen.findByText("#19");
    fireEvent.change(screen.getByLabelText("Contabilità"), { target: { value: "unpaid" } });
    await screen.findByText("#19");
    fireEvent.click(screen.getByRole("button", { name: "Successiva" }));
    await screen.findByText("Pagina 2 di 2");
    await screen.findByText("#19");
    await verifyMfa();
    fireEvent.click(within(screen.getByText("#19").closest("tr")!).getByRole("button", { name: "Contabilità" }));
    fireEvent.change(screen.getByLabelText("Stato"), { target: { value: "paid" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await screen.findByText("Pagina 1 di 1");
    expect(api.fetchSuperAdminRechargeCredits).toHaveBeenLastCalledWith(expect.objectContaining({ billing_status: "unpaid", offset: 0 }));
    expect(screen.getByRole("button", { name: "Successiva" })).toBeDisabled();
  });

  it("mostra l'errore di pagamento senza perdere i dati e consente di ritentare il caricamento associazioni", async () => {
    vi.mocked(api.fetchSuperAdminOrganizations).mockRejectedValueOnce(new Error("Associazioni non disponibili"));
    vi.mocked(api.patchSuperAdminRechargeCreditAccounting).mockRejectedValueOnce(new Error("Pagamento non registrato"));
    showPage();
    await screen.findByText("Associazioni non disponibili");
    fireEvent.click(screen.getByRole("button", { name: "Riprova associazioni" }));
    await screen.findByRole("option", { name: "Club Roma" });
    await screen.findByText("#19");
    await verifyMfa();
    fireEvent.click(within(screen.getByText("#19").closest("tr")!).getByRole("button", { name: "Contabilità" }));
    fireEvent.change(screen.getByLabelText("Riferimento"), { target: { value: "Da controllare" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await screen.findByText("Pagamento non registrato");
    expect(screen.getByLabelText("Riferimento")).toHaveValue("Da controllare");
    expect(screen.getByRole("button", { name: "Salva" })).toBeEnabled();
  });
});
