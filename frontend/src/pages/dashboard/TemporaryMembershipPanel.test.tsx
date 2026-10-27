import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TemporaryMembershipPanel from "./TemporaryMembershipPanel";
import * as api from "../../lib/temporaryMemberships";

vi.mock("../../lib/temporaryMemberships", async importOriginal => ({
  ...await importOriginal<typeof import("../../lib/temporaryMemberships")>(),
  fetchTemporaryOffer: vi.fn(), createTemporaryPurchase: vi.fn(), fetchTemporaryPurchase: vi.fn(), cancelTemporaryPurchase: vi.fn(),
}));

const offer: api.TemporaryOffer = { enabled: true, eligible: true, reason: null,
  offer: { amount: 10, currency: "EUR", duration_value: 4, duration_unit: "hours", duration_label: "4 ore", methods: ["contanti", "bonifico"] }, current_purchase: null };
const purchase: api.TemporaryPurchase = { id: 7, member_id: 1, org_id: 1, member_name: "Mario Prova", email: null, status: "manual_pending", method: "contanti", amount: 10, currency: "EUR", duration_value: 4, duration_unit: "hours", created_at: "2026-10-17T12:00:00Z", issued_at: null, valid_from: null, valid_until: null, card_no: null, card_year: null, payment_status: null, hosted_checkout_url: null, issue_reason: null };

beforeEach(() => { vi.resetAllMocks(); vi.mocked(api.fetchTemporaryOffer).mockResolvedValue(offer); });
afterEach(cleanup);

describe("acquisto temporanea", () => {
  it("crea una sola richiesta manuale e mostra che l'incasso deve essere confermato", async () => {
    vi.mocked(api.createTemporaryPurchase).mockResolvedValue({ purchase });
    render(<TemporaryMembershipPanel onIssued={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Richiedi temporanea" }));
    await screen.findByText("In attesa di conferma dell'incasso");
    expect(api.createTemporaryPurchase).toHaveBeenCalledExactlyOnceWith("contanti");
    expect(screen.queryByRole("button", { name: "Richiedi temporanea" })).not.toBeInTheDocument();
    expect(screen.getByText(/La tessera verrà emessa dopo la conferma/)).toBeVisible();
  });

  it("non propone acquisti se il socio ha già una tessera valida", async () => {
    vi.mocked(api.fetchTemporaryOffer).mockResolvedValue({ ...offer, eligible: false, reason: "Hai già una tessera valida." });
    render(<TemporaryMembershipPanel onIssued={vi.fn()} />);
    await screen.findByText("Hai già una tessera valida.");
    expect(screen.queryByRole("button", { name: /Acquista|Richiedi temporanea/ })).not.toBeInTheDocument();
    expect(api.createTemporaryPurchase).not.toHaveBeenCalled();
  });

  it("dopo una risposta persa recupera l'ordine persistito senza un secondo invio", async () => {
    vi.mocked(api.createTemporaryPurchase).mockRejectedValue(new Error("Connessione interrotta"));
    vi.mocked(api.fetchTemporaryOffer).mockResolvedValueOnce(offer).mockResolvedValue({ ...offer, eligible: false, current_purchase: purchase });
    render(<TemporaryMembershipPanel onIssued={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Richiedi temporanea" }));
    await screen.findByText("In attesa di conferma dell'incasso");
    expect(api.createTemporaryPurchase).toHaveBeenCalledTimes(1);
  });

  it("permette di annullare una richiesta non pagata e ricarica l'offerta", async () => {
    vi.mocked(api.fetchTemporaryOffer).mockResolvedValueOnce({ ...offer, eligible: false, current_purchase: purchase }).mockResolvedValue(offer);
    vi.mocked(api.cancelTemporaryPurchase).mockResolvedValue({ purchase: { ...purchase, status: "cancelled" } });
    render(<TemporaryMembershipPanel onIssued={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Annulla richiesta" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(dialog.querySelector<HTMLButtonElement>(".async-action-button") ?? [...dialog.querySelectorAll("button")].find(button => button.textContent?.includes("Annulla richiesta"))!);
    await waitFor(() => expect(api.cancelTemporaryPurchase).toHaveBeenCalledWith(7));
    await screen.findByRole("button", { name: "Richiedi temporanea" });
  });
});
