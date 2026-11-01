import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicRenewal from "./PublicRenewal";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), request: vi.fn(), confirm: vi.fn(), checkout: vi.fn(), navigate: vi.fn() }));
vi.mock("../lib/publicRenewals", () => ({ fetchPublicRenewal: mocks.fetch, requestPublicRenewalLink: mocks.request, confirmPublicRenewal: mocks.confirm }));
vi.mock("../lib/api", () => ({ createMemberRenewalCheckout: mocks.checkout }));
vi.mock("react-router-dom", async importOriginal => ({ ...await importOriginal<typeof import("react-router-dom")>(), useNavigate: () => mocks.navigate }));

const term = { id: 27, membership_year: 2027, starts_on: "2027-01-01", valid_through: "2028-01-01", status: "due", fee_amount: 25, currency: "EUR", card_no: null, card_year: null, issued_at: null, payment: null };
const context = { first_name: "Anna", last_name: "Socio", fee_amount: 25, currency: "EUR", membership: { current: { ...term, id: 26, membership_year: 2026, valid_through: "2027-01-01", status: "expired", card_no: 10, card_year: 2026 }, renewal: null, renewal_year: 2027, renewal_opens_on: "2026-11-02", can_renew: true, is_account_only: true } };
const props = { slug: "demo", associationName: "Club Demo", onNewSignup: vi.fn() };
const ui = (slug = "demo") => <MemoryRouter><PublicRenewal {...props} slug={slug} /></MemoryRouter>;

describe("Rinnovo dal wizard pubblico", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockResolvedValue(null);
    mocks.request.mockResolvedValue(undefined);
    mocks.confirm.mockResolvedValue({ ok: true, action: "org_confirmation", checkout_required: false, term });
  });

  it("chiede soltanto l'email e attende la prova prima di rinnovare", async () => {
    render(ui());
    const email = await screen.findByRole("textbox", { name: "Email del tuo account" });
    fireEvent.change(email, { target: { value: "socio@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Ricevi link per rinnovare" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Se sei già socio di questa associazione");
    expect(mocks.request).toHaveBeenCalledWith("demo", "socio@example.com");
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("mostra quota e annualità del socio autenticato e conferma una sola richiesta", async () => {
    mocks.fetch.mockResolvedValue(context);
    let finish!: (value: unknown) => void;
    mocks.confirm.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(ui());
    const confirm = await screen.findByRole("button", { name: "Conferma rinnovo 2027" });
    expect(screen.getByRole("heading", { name: "Rinnova la tessera" })).toBeInTheDocument();
    const years = screen.getByRole("group", { name: "Annualità rinnovo" });
    expect(years).toHaveTextContent("2026");
    expect(years).toHaveTextContent("2027");
    expect(screen.getByText("Anna Socio")).toBeInTheDocument();
    expect(screen.getByText(/25,00\s+€/)).toBeInTheDocument();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, action: "org_confirmation", checkout_required: false, term }));
    expect(mocks.navigate).toHaveBeenCalledWith("/dashboard");
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("mostra l'attesa di pagamento manuale senza riproporre un rinnovo", async () => {
    mocks.fetch.mockResolvedValue({ ...context, membership: { ...context.membership, renewal: { ...term, status: "payment_pending" }, renewal_checkout_available: false } });
    render(ui());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("in attesa del pagamento"));
    expect(screen.queryByRole("button", { name: /Conferma rinnovo|Completa rinnovo/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vai alla tua area" })).toHaveAttribute("href", "/dashboard");
  });

  it("mostra l'attesa tessera invece di una data di apertura già trascorsa", async () => {
    mocks.fetch.mockResolvedValue({ ...context, membership: { ...context.membership, can_renew: false, renewal: { ...term, status: "paid_waiting_card" } } });
    render(ui());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("in attesa di assegnazione"));
    expect(screen.queryByText(/sarà disponibile dal/)).not.toBeInTheDocument();
  });

  it("non avvia checkout o navigazione se cambia associazione durante la conferma", async () => {
    mocks.fetch.mockResolvedValue(context);
    let finish!: (value: unknown) => void;
    mocks.confirm.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(ui());
    fireEvent.click(await screen.findByRole("button", { name: "Conferma rinnovo 2027" }));
    mocks.fetch.mockResolvedValue(null);
    view.rerender(ui("other"));
    await screen.findByRole("textbox", { name: "Email del tuo account" });
    await act(async () => finish({ ok: true, action: "online_payment", checkout_required: true, term }));
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("mantiene l'email e consente un nuovo tentativo dopo un errore di rete", async () => {
    mocks.request.mockRejectedValueOnce(new Error("Connessione interrotta"));
    render(ui());
    const email = await screen.findByRole("textbox", { name: "Email del tuo account" });
    fireEvent.change(email, { target: { value: "socio@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Ricevi link per rinnovare" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connessione interrotta");
    expect(email).toHaveValue("socio@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Ricevi link per rinnovare" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("status")).toHaveTextContent("link sicuro via email");
  });
});
