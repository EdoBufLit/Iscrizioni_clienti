import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../lib/api";
import * as cardsApi from "../../lib/memberCards";
import type { DashboardContext } from "./DashboardLayout";
import DashboardCards from "./DashboardCards";

vi.mock("../../lib/memberCards", async original => ({ ...await original<typeof import("../../lib/memberCards")>(), fetchMemberCards: vi.fn(), selectMemberCard: vi.fn(), linkMemberCard: vi.fn(), openSelectedMemberCard: vi.fn() }));
vi.mock("../../lib/api", async original => ({ ...await original<typeof import("../../lib/api")>(), fetchOrganizations: vi.fn() }));
const member: cardsApi.MemberCardItem = { id: 1, first_name: "Anna", last_name: "Collaudo", email: "anna@example.test", phone: null, fiscal_code: null, status: "active", card_no: 123, card_status: "attiva", card_year: 2026, membership_type: "annual", joined_at: "2026-07-01", valid_until: "2027-01-01T22:59:59Z", organization: { id: 2, name: "Club Uno", slug: "club-uno" }, can_select: true };
const other: cardsApi.MemberCardItem = { ...member, id: 2, card_no: 456, organization: { id: 3, name: "Nome legale", club_display_name: "Club Due", slug: "club-due" } };
const response: cardsApi.MemberCardsResponse = { account: { id: 9, email: "anna@example.test" }, selected_member_id: 1, items: [member, other] };
function mount(offline = false) {
  const context: DashboardContext = { user: member, loading: false, profileError: null, reloadProfile: vi.fn(), offline };
  return render(<MemoryRouter><Routes><Route element={<Outlet context={context} />}><Route path="*" element={<DashboardCards />} /></Route></Routes></MemoryRouter>);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
  vi.mocked(cardsApi.fetchMemberCards).mockResolvedValue(response);
  vi.mocked(api.fetchOrganizations).mockResolvedValue([{ id: 3, name: "Club Due", slug: "club-due", city: null, province: null, description_short: null, logo_url: null }]);
});
afterEach(() => vi.useRealTimers());

describe("Le mie tessere", () => {
  it("elenca tutte le iscrizioni con numero, club, stato e club selezionato", async () => {
    mount();
    const list = await screen.findByRole("list", { name: "Tessere collegate" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Club Due" })).toBeVisible();
    expect(screen.getByText("Tessera 456 · 2026")).toBeVisible();
    expect(screen.getByText("Club selezionato")).toBeVisible();
    expect(screen.getByRole("link", { name: "Mostra tessera Club Uno" })).toHaveAttribute("href", "/dashboard");
  });
  it("attende la selezione server prima di aprire il nuovo contesto e impedisce doppi click", async () => {
    let resolve!: () => void;
    vi.mocked(cardsApi.selectMemberCard).mockReturnValue(new Promise<void>(done => { resolve = done; }));
    mount();
    const button = await screen.findByRole("button", { name: "Apri tessera Club Due" });
    fireEvent.click(button); fireEvent.click(button);
    expect(cardsApi.selectMemberCard).toHaveBeenCalledExactlyOnceWith(2);
    expect(cardsApi.openSelectedMemberCard).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
    resolve();
    await waitFor(() => expect(cardsApi.openSelectedMemberCard).toHaveBeenCalledOnce());
  });
  it("mantiene il club corrente se il server rifiuta il cambio", async () => {
    vi.mocked(cardsApi.selectMemberCard).mockRejectedValue(new Error("Tessera non collegata al tuo account."));
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Apri tessera Club Due" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tessera non collegata al tuo account.");
    expect(cardsApi.openSelectedMemberCard).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Apri tessera Club Due" })).toBeEnabled();
  });
  it("supporta molte iscrizioni e mostra quelle in verifica senza abilitarne l’accesso", async () => {
    vi.mocked(cardsApi.fetchMemberCards).mockResolvedValue({ ...response, items: Array.from({ length: 20 }, (_, index) => ({ ...member, id: index + 1, organization: { id: index + 1, name: `Club ${index + 1}`, slug: `club-${index + 1}` }, ...(index === 19 ? { status: "pending_verification", card_no: null, can_select: false } : {}) })) });
    mount();
    const list = await screen.findByRole("list", { name: "Tessere collegate" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(20);
    expect(screen.getByRole("heading", { name: "Club 20" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Apri tessera Club 20" })).not.toBeInTheDocument();
    expect(screen.getByText("In verifica")).toBeVisible();
  });
  it("collega solo dopo invio esplicito delle credenziali dell’altra iscrizione", async () => {
    vi.mocked(cardsApi.linkMemberCard).mockResolvedValue();
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Collega una tessera" }));
    const dialog = screen.getByRole("dialog");
    await within(dialog).findByRole("option", { name: "Club Due" });
    fireEvent.change(within(dialog).getByLabelText("Associazione"), { target: { value: "club-due" } });
    fireEvent.change(within(dialog).getByLabelText("Numero tessera"), { target: { value: "000456" } });
    fireEvent.change(within(dialog).getByLabelText("Password dell’altra iscrizione"), { target: { value: "PasswordOther123!" } });
    expect(cardsApi.linkMemberCard).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Collega al mio account" }));
    await waitFor(() => expect(cardsApi.linkMemberCard).toHaveBeenCalledExactlyOnceWith({ org_slug: "club-due", card_number: "000456", password: "PasswordOther123!" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Tessera collegata al tuo account.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("mostra l’errore di collegamento e cancella la password al fallimento", async () => {
    vi.mocked(cardsApi.linkMemberCard).mockRejectedValue(new Error("Credenziali non valide."));
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Collega una tessera" }));
    const dialog = screen.getByRole("dialog");
    await within(dialog).findByRole("option", { name: "Club Due" });
    fireEvent.change(within(dialog).getByLabelText("Associazione"), { target: { value: "club-due" } });
    fireEvent.change(within(dialog).getByLabelText("Numero tessera"), { target: { value: "456" } });
    fireEvent.change(within(dialog).getByLabelText("Password dell’altra iscrizione"), { target: { value: "wrong" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Collega al mio account" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Credenziali non valide.");
    expect(within(dialog).getByLabelText("Password dell’altra iscrizione")).toHaveValue("");
  });
  it("offline mostra soltanto la tessera salvata e non propone collegamenti", async () => {
    mount(true);
    expect(screen.getByText("Tessera 123 · 2026")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Collega una tessera" })).not.toBeInTheDocument();
    expect(cardsApi.fetchMemberCards).not.toHaveBeenCalled();
  });
  it("un accesso riservato al club non propone collegamenti personali", async () => {
    vi.mocked(cardsApi.fetchMemberCards).mockResolvedValue({ ...response, account: null, items: [member] });
    mount();
    expect(await screen.findByRole("link", { name: "Accedi al tuo account personale" })).toHaveAttribute("href", "/login?personal=1");
    expect(screen.queryByRole("button", { name: "Collega una tessera" })).not.toBeInTheDocument();
  });
  it("mostra il riferimento cartaceo con asterisco distinto dalla tessera digitale", async () => {
    vi.mocked(cardsApi.fetchMemberCards).mockResolvedValue({ ...response, items: [{ ...member, card_no: 28696, card_namespace: "digital" }, { ...other, card_no: 28696, card_namespace: "paper_exception", card_number_label: "28696*" }] });
    mount();
    expect(await screen.findByText("Tessera 28696* · 2026")).toBeVisible();
    expect(screen.getByText("Tessera 28696 · 2026")).toBeVisible();
    expect(screen.getByText(/Tessera cartacea collegata in via eccezionale/)).toBeVisible();
  });
});
