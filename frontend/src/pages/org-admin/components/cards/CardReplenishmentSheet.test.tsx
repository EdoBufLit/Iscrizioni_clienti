import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../../components/ui/ToastProvider";
import { AuthError, CardReplenishmentError, type CardReplenishmentCapability, type CardReplenishmentRequest } from "../../../../lib/api";
import CardReplenishmentSheet from "./CardReplenishmentSheet";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../../../../lib/api", async importOriginal => ({
  ...await importOriginal<typeof import("../../../../lib/api")>(),
  createOrgAdminCardReplenishment: (...args: unknown[]) => mocks.create(...args),
}));

const capability: CardReplenishmentCapability = {
  can_auto_allocate: true, numbering_mode: "global", blocked_reason: null, unit_price_cents: 165, currency: "EUR",
  min_quantity: 1, max_quantity: 5000, default_year: 2026, allowed_years: [2026, 2027],
};
const item = { id: 42, requested_cards: 12, requested_year: 2027, amount_due_cents: 1980, currency: "EUR" } as CardReplenishmentRequest;
const response = { ok: true, created: true, item };
type Props = React.ComponentProps<typeof CardReplenishmentSheet>;

function renderSheet(overrides: Partial<Props> = {}) {
  const props: Props = { open: true, capability, loading: false, onClose: vi.fn(), onCreated: vi.fn(), ...overrides };
  const view = (nextProps: Props) => <MemoryRouter initialEntries={["/org-admin/tessere"]}><ToastProvider><Routes>
    <Route path="/org-admin/tessere" element={<CardReplenishmentSheet {...nextProps} />} />
    <Route path="/org-admin/login" element={<p>Accedi nuovamente</p>} />
  </Routes></ToastProvider></MemoryRouter>;
  const result = render(view(props));
  return { ...result, props, rerenderSheet: (patch: Partial<Props>) => result.rerender(view({ ...props, ...patch })) };
}
function submit() {
  fireEvent.submit(screen.getByRole("form", { name: "Richiesta rifornimento tessere" }));
}

describe("Card replenishment bottom sheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue(response);
  });

  it("quotes the actual unit price and sends the selected year, quantity and trimmed notes", async () => {
    const { props } = renderSheet();
    expect(screen.getByText("1,65 € per tessera")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Quantità"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Anno"), { target: { value: "2027" } });
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "  Lotto di prova  " } });
    expect(screen.getByText("Totale 19,80 €")).toBeInTheDocument();
    submit();
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledExactlyOnceWith(item, true));
    expect(mocks.create).toHaveBeenCalledWith({ requested_cards: 12, requested_year: 2027, notes: "Lotto di prova" }, expect.any(String));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("blocks duplicate submissions and every close path while the POST is pending", async () => {
    let finish!: (value: typeof response) => void;
    mocks.create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { props } = renderSheet();
    submit();
    submit();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog", { name: "Rifornimento tessere" }));
    fireEvent.click(screen.getByRole("button", { name: "Chiudi finestra" }));
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Quantità")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Chiudi finestra" })).toBeDisabled();
    await act(async () => finish(response));
    expect(props.onCreated).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it.each([
    ["network", new TypeError("Connessione interrotta")],
    ["server", new CardReplenishmentError("Risposta non disponibile", 503)],
    ["processing", new CardReplenishmentError("Richiesta in elaborazione", 409)],
  ])("retries the exact same immutable request after an uncertain %s result, even after reopening", async (_, failure) => {
    mocks.create.mockRejectedValueOnce(failure).mockResolvedValueOnce({ ...response, created: false });
    const { props, rerenderSheet } = renderSheet();
    fireEvent.change(screen.getByLabelText("Quantità"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "Richiesta originale" } });
    submit();
    await screen.findByText("Esito non confermato.");
    const [originalPayload, originalKey] = mocks.create.mock.calls[0];
    expect(screen.getByLabelText("Quantità")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Quantità"), { target: { value: "99" } });
    expect(screen.getByLabelText("Quantità")).toHaveValue(12);
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    rerenderSheet({ open: false });
    rerenderSheet({ open: true, capability: { ...capability, unit_price_cents: 999, default_year: 2027, allowed_years: [2027] } });
    expect(screen.getByLabelText("Quantità")).toHaveValue(12);
    expect(screen.getByLabelText("Anno")).toHaveValue("2026");
    expect(screen.getByText("Totale 19,80 €")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova la stessa richiesta" }));
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledExactlyOnceWith(item, false));
    expect(mocks.create.mock.calls[1]).toEqual([originalPayload, originalKey]);
  });

  it("allows correcting a definitive validation failure with a new idempotency key", async () => {
    mocks.create.mockRejectedValueOnce(new CardReplenishmentError("Quantità non accettata", 422)).mockResolvedValueOnce(response);
    renderSheet();
    submit();
    await screen.findByText("Quantità non accettata");
    expect(screen.getByLabelText("Quantità")).toBeEnabled();
    expect(screen.queryByText("Esito non confermato.")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Quantità"), { target: { value: "5" } });
    submit();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1][0].requested_cards).toBe(5);
    expect(mocks.create.mock.calls[1][1]).not.toBe(mocks.create.mock.calls[0][1]);
  });

  it("uses the new capability year only after an uncertain request is definitively rejected", async () => {
    mocks.create.mockRejectedValueOnce(new TypeError("Risposta persa"))
      .mockRejectedValueOnce(new CardReplenishmentError("Anno non più disponibile", 422))
      .mockResolvedValueOnce(response);
    const { rerenderSheet } = renderSheet();
    submit();
    await screen.findByText("Esito non confermato.");
    const originalKey = mocks.create.mock.calls[0][1];
    rerenderSheet({ capability: { ...capability, allowed_years: [2027], default_year: 2027 } });
    submit();
    await screen.findByText("Anno non più disponibile");
    expect(screen.getByLabelText("Anno")).toBeEnabled();
    expect(screen.getByLabelText("Anno")).toHaveValue("2027");
    submit();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(3));
    expect(mocks.create.mock.calls[1][1]).toBe(originalKey);
    expect(mocks.create.mock.calls[2][1]).not.toBe(originalKey);
    expect(mocks.create.mock.calls[2][0].requested_year).toBe(2027);
  });

  it("never sends a blocked or invalid-capability request", () => {
    const { rerenderSheet } = renderSheet({ capability: { ...capability, can_auto_allocate: false, blocked_reason: "Numerazione manuale: contatta ASSONAM." } });
    expect(screen.getByRole("alert")).toHaveTextContent("Numerazione manuale");
    submit();
    expect(mocks.create).not.toHaveBeenCalled();
    rerenderSheet({ capability: { ...capability, max_quantity: 0 } });
    submit();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["", "0", "1.5", "21"])("validates quantity %s against the capability before sending", (quantity) => {
    renderSheet({ capability: { ...capability, max_quantity: 20 } });
    fireEvent.change(screen.getByLabelText("Quantità"), { target: { value: quantity } });
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("numero intero di tessere tra 1 e 20");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("validates the requested year before sending", () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("Anno"), { target: { value: "2099" } });
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Seleziona un anno disponibile");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps a confirmed POST successful when the parent refresh fails", async () => {
    const { props } = renderSheet({ onCreated: vi.fn().mockRejectedValue(new Error("Aggiornamento elenco fallito")) });
    submit();
    await screen.findByText("Richiesta #42 registrata");
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(screen.queryByText("Esito non confermato.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Quantità")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Riprova la stessa richiesta" })).not.toBeInTheDocument();
  });

  it("redirects an expired session without retrying the mutation", async () => {
    mocks.create.mockRejectedValueOnce(new AuthError("Sessione scaduta"));
    renderSheet();
    submit();
    expect(await screen.findByText("Accedi nuovamente")).toBeInTheDocument();
    expect(mocks.create).toHaveBeenCalledOnce();
  });
});
