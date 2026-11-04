import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import IscrizionePagamentoEsito from "./IscrizionePagamentoEsito";

const { fetchMembershipPaymentStatus } = vi.hoisted(() => ({ fetchMembershipPaymentStatus: vi.fn() }));
vi.mock("../lib/api", () => ({ fetchMembershipPaymentStatus }));

describe("IscrizionePagamentoEsito accessibility", () => {
  afterEach(() => vi.useRealTimers());

  it("termina lo stato occupato quando un pagamento in attesa incontra un errore di verifica", async () => {
    vi.useFakeTimers();
    fetchMembershipPaymentStatus
      .mockResolvedValueOnce({ payment_status: "pending", is_paid: false, card_status: "pending", message: "Pagamento in verifica.", can_retry: false })
      .mockRejectedValueOnce(new Error("Verifica temporaneamente non disponibile."));
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/iscrizione/pagamento/esito?payment_id=7"]}>
          <IscrizionePagamentoEsito />
        </MemoryRouter>,
      );
    });
    expect(screen.getByRole("status").closest("[aria-busy]")).toHaveAttribute("aria-busy", "true");
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Verifica temporaneamente non disponibile.");
    expect(alert.closest("[aria-busy]")).toHaveAttribute("aria-busy", "false");
    expect(fetchMembershipPaymentStatus).toHaveBeenCalledTimes(2);
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
  });
});
