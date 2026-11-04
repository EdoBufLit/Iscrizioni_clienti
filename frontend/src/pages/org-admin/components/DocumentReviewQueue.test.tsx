import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DocumentReviewQueue, { pendingReviewDocuments } from "./DocumentReviewQueue";
const mocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), mutate: vi.fn(), invalidate: vi.fn(), toast: vi.fn() }));
vi.mock("../../../lib/api", () => ({ fetchOrgAdminMembers: mocks.list, fetchOrgAdminMemberDetail: mocks.detail, apiFetch: mocks.mutate, invalidateSwrCache: mocks.invalidate }));
vi.mock("../../../components/ui/ToastProvider", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
const document = (id: number, overrides = {}) => ({ id, type: "identity", filename: `documento-${id}.png`, mime_type: "image/png", status: "pending", uploaded_at: "2026-11-04", ...overrides });
function mount() { const changed = vi.fn(); render(<MemoryRouter><DocumentReviewQueue onClose={vi.fn()} onChanged={changed} /></MemoryRouter>); return changed; }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ items: [{ id: 1 }], total: 1 });
  mocks.detail.mockResolvedValue({ id: 1, first_name: "Maria", last_name: "Rossi", documents: [document(10), document(11)] });
  mocks.mutate.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
});
afterEach(cleanup);
describe("DocumentReviewQueue", () => {
  it("esclude documenti sostituiti e decisioni già concluse", () => {
    expect(pendingReviewDocuments([document(1), document(2, { replaces_document_id: 1 }), document(3, { status: "approved" })]).map(doc => doc.id)).toEqual([2]);
  });
  it("approva una sola volta e passa al prossimo documento senza uscire dal socio", async () => {
    const changed = mount();
    const approve = await screen.findByRole("button", { name: "Approva e continua" });
    fireEvent.click(approve); fireEvent.click(approve);
    await screen.findByText("documento-11.png");
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate).toHaveBeenCalledWith("/api/org-admin/documents/10/approve", { method: "POST" });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).toHaveBeenCalledWith("org-admin:members:");
  });
  it("conserva documento e motivazione se il rigetto fallisce", async () => {
    mocks.mutate.mockResolvedValue({ ok: false, json: async () => ({ detail: "Rete non disponibile" }) });
    const changed = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Rigetta con motivazione" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Documento illeggibile" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma rigetto" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("/api/org-admin/documents/10/reject", expect.objectContaining({ body: JSON.stringify({ rejection_note: "Documento illeggibile" }) })));
    expect(await screen.findByRole("textbox")).toHaveValue("Documento illeggibile");
    expect(changed).not.toHaveBeenCalled();
  });
});


it("Escape chiude solo il rigetto e non abbandona la coda durante il salvataggio", async () => {
  const close = vi.fn();
  render(<MemoryRouter><DocumentReviewQueue onClose={close} onChanged={vi.fn()} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Rigetta con motivazione" }));
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  expect(close).not.toHaveBeenCalled();
  mocks.mutate.mockReturnValue(new Promise(() => {}));
  fireEvent.click(screen.getByRole("button", { name: "Approva e continua" }));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(close).not.toHaveBeenCalled();
});
