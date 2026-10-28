import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OrgAdminMemberDetail } from "../../../lib/api";
import EditMemberProfileModal from "./EditMemberProfileModal";
import ManualPaymentForm from "./ManualPaymentForm";
import MemberDecisionPanel from "./MemberDecisionPanel";
import RejectDocumentModal from "./RejectDocumentModal";

vi.mock("../../../lib/api", () => ({
  AuthError: class AuthError extends Error {},
  searchMunicipalities: vi.fn().mockResolvedValue([]),
}));

describe("Member detail operational forms", () => {
  it("preserves an unchanged legacy birthplace when editing notes, and validates a changed birthplace", () => {
    const onSubmit = vi.fn();
    const member = { first_name: "Mario", last_name: "Giordano", birth_place: "Torino", birth_place_code: null, internal_notes: "Nota precedente" } as OrgAdminMemberDetail;
    render(<EditMemberProfileModal open member={member} saving={false} onClose={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Note interne"), { target: { value: "Nota aggiornata" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva anagrafica" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ birth_place: "Torino", birth_place_code: null, internal_notes: "Nota aggiornata" }));
    onSubmit.mockClear();
    fireEvent.change(screen.getByLabelText("Luogo di nascita"), { target: { value: "Comune inesistente" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva anagrafica" }));
    expect(screen.getByText("Seleziona un comune dall'elenco suggerito.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the manual payment once while pending, using the existing payload", async () => {
    let finish!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<ManualPaymentForm embedded paymentMethodLabel="Contanti" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Importo (EUR)"), { target: { value: "30.50" } });
    fireEvent.change(screen.getByLabelText("Metodo"), { target: { value: "bonifico" } });
    fireEvent.change(screen.getByLabelText("Data pagamento"), { target: { value: "2026-10-28" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "  Incasso in sede  " } });
    fireEvent.submit(screen.getByRole("form", { name: "Pagamento manuale" }));
    fireEvent.submit(screen.getByRole("form", { name: "Pagamento manuale" }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ amount: 30.5, method: "bonifico", paid_at: "2026-10-28", notes: "Incasso in sede" });
    expect(screen.getByLabelText("Importo (EUR)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvataggio..." })).toBeDisabled();
    await act(async () => finish());
    expect(await screen.findByRole("status")).toHaveTextContent("Pagamento registrato");
  });

  it("keeps values available after a failed payment and rejects invalid amounts locally", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Importo non accettato dal server"));
    render(<ManualPaymentForm embedded paymentMethodLabel="Contanti" onSubmit={onSubmit} />);
    const amount = screen.getByLabelText("Importo (EUR)");
    fireEvent.change(amount, { target: { value: "0" } });
    fireEvent.submit(screen.getByRole("form", { name: "Pagamento manuale" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Inserisci un importo valido");
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(amount, { target: { value: "30" } });
    fireEvent.submit(screen.getByRole("form", { name: "Pagamento manuale" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Importo non accettato dal server");
    expect(amount).toHaveValue(30);
    expect(screen.getByRole("button", { name: "Registra pagamento" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Pagamento manuale" })).not.toBeInTheDocument();
  });

  it.each([
    ["ACTIVE", undefined],
    ["pending_cards", "2026-10-28T09:30:00Z"],
  ])("shows an approved decision as readonly for %s", (status, decisionAt) => {
    render(<MemberDecisionPanel status={status} decisionAt={decisionAt} initialNotes="Verifica conclusa" isSubmitting={false} onSubmit={vi.fn()} />);
    expect(screen.getByText("Iscrizione approvata")).toBeInTheDocument();
    expect(screen.getByText("Verifica conclusa")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approva Iscrizione" })).not.toBeInTheDocument();
  });

  it("retains rejection and pending decision semantics", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<MemberDecisionPanel status="REJECTED" decisionAt="2026-10-28T09:30:00Z" isSubmitting={false} onSubmit={onSubmit} />);
    expect(screen.getByText("Iscrizione rifiutata")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    rerender(<MemberDecisionPanel status="pending_docs" isSubmitting={false} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Note decisione (opzionale)"), { target: { value: "Documenti verificati" } });
    fireEvent.click(screen.getByRole("button", { name: "Approva Iscrizione" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("approve", "Documenti verificati");
  });

  it("blocks every profile-sheet close path during saving and allows Escape afterwards", async () => {
    const onClose = vi.fn();
    const member = { first_name: "Anna", last_name: "Rossi", birth_place: null } as OrgAdminMemberDetail;
    const { rerender } = render(<EditMemberProfileModal open member={member} saving onClose={onClose} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Modifica profilo" });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(dialog);
    fireEvent.click(screen.getByRole("button", { name: "Chiudi finestra" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Chiudi finestra" })).toBeDisabled();

    rerender(<EditMemberProfileModal open member={member} saving={false} onClose={onClose} onSubmit={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(document.body.style.overflow).toBe("hidden"));
  });

  it("requires an accessible rejection reason and locks the document sheet during saving", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(<RejectDocumentModal open docLabel="Documento identità" isSubmitting={false} onClose={onClose} onConfirm={onConfirm} />);
    fireEvent.submit(screen.getByRole("form", { name: "Motivazione del rigetto" }));
    expect(screen.getByRole("alert")).toHaveTextContent("La motivazione è obbligatoria.");
    expect(onConfirm).not.toHaveBeenCalled();
    const reason = screen.getByLabelText("Motivazione / Note *");
    fireEvent.change(reason, { target: { value: "  Documento illeggibile  " } });
    fireEvent.submit(screen.getByRole("form", { name: "Motivazione del rigetto" }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith("Documento illeggibile");
    rerender(<RejectDocumentModal open docLabel="Documento identità" isSubmitting onClose={onClose} onConfirm={onConfirm} />);
    expect(reason).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog", { name: "Rigetta documento" }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
