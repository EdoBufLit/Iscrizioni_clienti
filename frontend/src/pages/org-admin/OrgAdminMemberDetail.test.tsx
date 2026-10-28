import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManualPaymentResult, OrgAdminMemberDetail as MemberDetail } from "../../lib/api";

import { ToastProvider } from "../../components/ui/ToastProvider";
import OrgAdminMemberDetail from "./OrgAdminMemberDetail";

const apiMocks = vi.hoisted(() => ({
  fetchMember: vi.fn(),
  fetchMembershipSettings: vi.fn(),
  createManualPayment: vi.fn(),
  fetchAccounting: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  AuthError: class AuthError extends Error {},
  createManualPayment: (...args: unknown[]) => apiMocks.createManualPayment(...args),
  fetchOrgAdminMemberDetail: (...args: unknown[]) => apiMocks.fetchMember(...args),
  fetchOrgAdminMembershipSettings: (...args: unknown[]) =>
    apiMocks.fetchMembershipSettings(...args),
  sendOrgAdminMemberCardEmail: vi.fn(),
  updateOrgAdminMemberProfile: (...args: unknown[]) => apiMocks.updateProfile(...args),
}));

vi.mock("../../lib/accounting", () => ({
  fetchMemberAccounting: (...args: unknown[]) => apiMocks.fetchAccounting(...args),
}));
vi.mock("./components/TemporaryPurchasesPanel", () => ({ default: () => null }));

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

function renderDetail() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/org-admin/soci/42"]}>
        <Routes>
          <Route path="/org-admin/soci/:id" element={<OrgAdminMemberDetail />} />
          <Route path="/org-admin/soci" element={<p>Elenco soci</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

function makeMember(overrides: Partial<MemberDetail> = {}): MemberDetail {
  return {
    id: 42, first_name: "tizia", last_name: "caia", email: "tizia@example.com", phone: "+39 333 1234567",
    fiscal_code: null, status: "ACTIVE", workflow_status: "active", is_active: true,
    card_no: 1234, card_number: 1234, card_year: 2026, joined_at: "2026-07-25T10:00:00Z",
    document_status: "pending", payment_required: true, payment_status: "pending",
    documents: [{ id: 77, type: "identity", filename: "documento.pdf", mime_type: "application/pdf", size_bytes: 512, uploaded_at: "2026-07-25T10:00:00Z", status: "pending" }],
    payments: [], membership_payments: [], activities: [], ...overrides,
  };
}

function paymentResult(): ManualPaymentResult {
  return { ok: true, payment: { id: 900, amount_cents: 3000, amount: 30, method: "contanti", paid_at: "2026-10-28" }, member_status: "ACTIVE", card_assigned: false, membership_payment: { id: 901, status: "manual_completed", source: "manual", amount: 30, currency: "EUR", confirmed_at: "2026-10-28T10:00:00Z" } };
}

describe("OrgAdminMemberDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.createManualPayment.mockResolvedValue(paymentResult());
    apiMocks.fetchAccounting.mockResolvedValue({
      balance: { expected_cents: 3000, paid_cents: 0, outstanding_cents: 3000, currency: "EUR" }, receipts: [], events: [],
    });
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
    apiMocks.fetchMember.mockResolvedValue(makeMember());
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("lascia approvazione e rigetto disponibili anche per un socio già attivo", async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole("tab", { name: "Documenti e note" }));
    expect(screen.getByRole("button", { name: "Approva" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Rigetta" })).toBeEnabled();
    expect(screen.getByText("Iscrizione approvata")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("apre il Profilo senza form e formatta il nome soltanto per la visualizzazione", async () => {
    renderDetail();
    expect(await screen.findByRole("heading", { level: 1, name: "Tizia Caia" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Profilo" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Importo (EUR)")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chiama" })).toHaveAttribute("href", "tel:+393331234567");
    fireEvent.click(screen.getByRole("button", { name: "Modifica" }));
    expect(screen.getByRole("dialog", { name: "Modifica profilo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toHaveValue("tizia");
    expect(screen.getByLabelText("Cognome")).toHaveValue("caia");
    expect(apiMocks.updateProfile).not.toHaveBeenCalled();
  });

  it("consente la navigazione tra schede anche con la tastiera", async () => {
    renderDetail();
    const profile = await screen.findByRole("tab", { name: "Profilo" });
    profile.focus();
    fireEvent.keyDown(profile, { key: "End" });
    expect(screen.getByRole("tab", { name: "Attività" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Attività" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Attività" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Attività" }), { key: "Home" });
    expect(profile).toHaveAttribute("aria-selected", "true");
  });

  it("mantiene il pannello pagamento aperto dopo errore e lo chiude soltanto dopo salvataggio", async () => {
    let resolvePayment!: (result: ManualPaymentResult) => void;
    apiMocks.createManualPayment.mockRejectedValueOnce(new Error("Servizio temporaneamente non disponibile"))
      .mockImplementationOnce(() => new Promise<ManualPaymentResult>((resolve) => { resolvePayment = resolve; }));
    renderDetail();
    fireEvent.click(await screen.findByRole("tab", { name: "Pagamenti" }));
    fireEvent.click(await screen.findByRole("button", { name: "+ Registra pagamento" }));
    const dialog = screen.getByRole("dialog", { name: "Registra pagamento" });
    fireEvent.change(within(dialog).getByLabelText("Importo (EUR)"), { target: { value: "30" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Registra pagamento" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Servizio temporaneamente non disponibile");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Importo (EUR)")).toHaveValue(30);

    fireEvent.click(within(dialog).getByRole("button", { name: "Registra pagamento" }));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(dialog);
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Chiudi finestra" })).toBeDisabled();
    await act(async () => resolvePayment(paymentResult()));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Registra pagamento" })).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Pagamenti" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getByRole("tab", { name: "Pagamenti" })).toHaveFocus());
    expect(apiMocks.createManualPayment).toHaveBeenCalledTimes(2);
    expect(apiMocks.createManualPayment.mock.calls[1][0]).toBe(42);
  });

  it("non propone una nuova registrazione manuale per una quota già parzialmente riconciliata", async () => {
    apiMocks.fetchMember.mockResolvedValue(makeMember({ payment_status: "manual_partial" }));
    apiMocks.fetchAccounting.mockResolvedValue({ balance: { expected_cents: 3000, paid_cents: 1000, outstanding_cents: 2000, currency: "EUR" }, receipts: [], events: [] });
    renderDetail();
    fireEvent.click(await screen.findByRole("tab", { name: "Pagamenti" }));
    expect(await screen.findByRole("link", { name: "Completa saldo in Incassi" })).toHaveAttribute("href", "/org-admin/incassi?member_id=42&year=2026");
    expect(screen.queryByRole("button", { name: "+ Registra pagamento" })).not.toBeInTheDocument();
  });

  it("distingue il pagamento salvato da un errore successivo di aggiornamento", async () => {
    apiMocks.fetchMember.mockResolvedValueOnce(makeMember()).mockRejectedValueOnce(new Error("Connessione interrotta"));
    renderDetail();
    fireEvent.click(await screen.findByRole("tab", { name: "Pagamenti" }));
    fireEvent.click(await screen.findByRole("button", { name: "+ Registra pagamento" }));
    const dialog = screen.getByRole("dialog", { name: "Registra pagamento" });
    fireEvent.change(within(dialog).getByLabelText("Importo (EUR)"), { target: { value: "30" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Registra pagamento" }));
    expect(await screen.findByText(/Operazione salvata; non è stato possibile aggiornare i dati/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Registra pagamento" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("tabpanel", { name: "Pagamenti" })).getByText("Pagata")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Registra pagamento" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova aggiornamento" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Riprova aggiornamento" })).not.toBeInTheDocument());
    expect(apiMocks.createManualPayment).toHaveBeenCalledOnce();
  });

  it("apre la stampa PDF mantenendo il riferimento alla finestra e isolando opener", async () => {
    const printWindow = { opener: window, location: { href: "" }, focus: vi.fn(), print: vi.fn(), close: vi.fn() };
    const openWindow = vi.spyOn(window, "open").mockReturnValue(printWindow as unknown as Window);
    const request = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["%PDF-1.7"], { type: "application/pdf" }) });
    vi.stubGlobal("fetch", request);
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = vi.fn(() => "blob:synthetic-card");
      static revokeObjectURL = vi.fn();
    });
    renderDetail();
    const printButton = await screen.findByRole("button", { name: "Stampa" });
    vi.useFakeTimers();
    fireEvent.click(printButton);
    expect(openWindow).toHaveBeenCalledExactlyOnceWith("", "_blank");
    expect(printWindow.opener).toBeNull();
    await act(async () => {});
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/org-admin/members/42/card.pdf?disposition=inline");
    expect(printWindow.location.href).toBe("blob:synthetic-card");
    act(() => vi.advanceTimersByTime(700));
    expect(printWindow.print).toHaveBeenCalledOnce();
    expect(printWindow.close).not.toHaveBeenCalled();
  });

  it("raccoglie la decisione pendente nel pannello e chiede conferma prima di salvarla", async () => {
    apiMocks.fetchMember.mockResolvedValueOnce(makeMember({ status: "PENDING", workflow_status: "pending_docs", is_active: false }));
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", request);
    renderDetail();
    fireEvent.click(await screen.findByRole("tab", { name: "Documenti e note" }));
    expect(screen.queryByLabelText("Note decisione (opzionale)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Valuta iscrizione" }));
    const sheet = screen.getByRole("dialog", { name: "Valuta iscrizione" });
    fireEvent.change(within(sheet).getByLabelText("Note decisione (opzionale)"), { target: { value: "Iscrizione verificata" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Approva Iscrizione" }));
    const confirmation = screen.getByRole("dialog", { name: "Approva iscrizione" });
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Conferma approvazione" }));
    expect(request).toHaveBeenCalledWith("/api/org-admin/members/42/decision", expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "approve", notes: "Iscrizione verificata" }) }));
    expect(await screen.findByText("Iscrizione approvata")).toBeInTheDocument();
  });

  it("richiede la conferma esplicita prima dell'eliminazione", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", request);
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "Elimina socio" }));
    const dialog = screen.getByRole("dialog", { name: "Elimina socio" });
    const confirm = within(dialog).getByRole("button", { name: "Elimina socio" });
    expect(confirm).toBeDisabled();
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Confermo di voler eliminare questo socio" }));
    fireEvent.click(confirm);
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/org-admin/members/42", { method: "DELETE" });
    expect(await screen.findByText("Elenco soci")).toBeInTheDocument();
  });
});
