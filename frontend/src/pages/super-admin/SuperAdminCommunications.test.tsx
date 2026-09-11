import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../lib/centralCommunications";
import SuperAdminCommunications from "./SuperAdminCommunications";

vi.mock("../../lib/centralCommunications", async (original) => ({
  ...await original<typeof import("../../lib/centralCommunications")>(),
  fetchCommunicationRecipients: vi.fn(), previewCommunication: vi.fn(), sendCommunication: vi.fn(),
  fetchSentCommunications: vi.fn(), fetchSentCommunication: vi.fn(),
}));

const recipients: api.CommunicationRecipient[] = [
  { id: 2, name: "Club Aurora", slug: "aurora", admin_count: 1, email_count: 1 },
  { id: 5, name: "Circolo Lago", slug: "lago", admin_count: 0, email_count: 0 },
];
const sentItem: api.CentralCommunication = {
  id: 12, subject: "Nuova stagione", body: "Gentili associazioni,\n\nEcco gli aggiornamenti.",
  excerpt: "Gentili associazioni, Ecco gli aggiornamenti.", audience: "selected", created_at: "2026-09-11T10:00:00Z",
  recipient_count: 1, email_count: 1, notification_count: 1, created_by_email: "centrale@example.test",
};
function showPage() { render(<MemoryRouter><SuperAdminCommunications /></MemoryRouter>); }
async function fillDraft() {
  fireEvent.click(await screen.findByRole("checkbox", { name: "Club Aurora" }));
  fireEvent.change(screen.getByLabelText("Oggetto"), { target: { value: `  ${sentItem.subject}  ` } });
  fireEvent.change(screen.getByLabelText("Messaggio"), { target: { value: sentItem.body } });
}
async function reviewDraft() {
  await fillDraft();
  fireEvent.click(screen.getByRole("button", { name: "Rivedi e invia" }));
  await screen.findByRole("heading", { name: "Rivedi la comunicazione" });
}

describe("Comunicazioni del super admin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.fetchCommunicationRecipients).mockResolvedValue({ items: recipients, total: 2 });
    vi.mocked(api.previewCommunication).mockImplementation(async (draft) => {
      const selected = draft.audience === "all" ? recipients : recipients.filter((org) => draft.organization_ids.includes(org.id));
      return { recipients: selected, organization_count: selected.length, admin_count: 1, email_count: 1,
        without_admin_count: selected.filter((org) => !org.admin_count).length };
    });
    vi.mocked(api.sendCommunication).mockResolvedValue({ item: sentItem, replayed: false });
    vi.mocked(api.fetchSentCommunications).mockResolvedValue({ items: [sentItem], total: 1, total_pages: 1, page: 1, page_size: 10 });
    vi.mocked(api.fetchSentCommunication).mockResolvedValue({ item: sentItem });
  });

  it("richiede destinatari e testo, mantiene la selezione nella ricerca e invia solo dopo revisione", async () => {
    showPage();
    expect(screen.getByRole("button", { name: "Rivedi e invia" })).toBeDisabled();
    await fillDraft();
    fireEvent.change(screen.getByLabelText("Cerca associazione"), { target: { value: "lago" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Circolo Lago" }));
    fireEvent.click(screen.getByRole("button", { name: "Rivedi e invia" }));
    await screen.findByRole("heading", { name: "Rivedi la comunicazione" });
    expect(api.previewCommunication).toHaveBeenCalledWith({ subject: sentItem.subject, body: sentItem.body, audience: "selected", organization_ids: [2, 5] });
    expect(api.sendCommunication).not.toHaveBeenCalled();
    expect(screen.getByText(/associazioni senza amministratori attivi/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Destinatari confermati" })).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Invia a 2 associazioni" }));
    await waitFor(() => expect(api.sendCommunication).toHaveBeenCalledWith(expect.objectContaining({
      subject: sentItem.subject, organization_ids: [2, 5], expected_organization_ids: [2, 5], idempotency_key: expect.any(String),
    })));
    expect(await screen.findByText("Comunicazione pubblicata.")).toBeInTheDocument();
  });

  it("l'invio a tutte usa l'audience attiva e invalida l'anteprima dopo una modifica", async () => {
    showPage();
    await reviewDraft();
    fireEvent.click(screen.getByRole("button", { name: "Modifica messaggio o destinatari" }));
    fireEvent.click(screen.getByRole("radio", { name: /Tutte le affiliate attive/ }));
    fireEvent.change(screen.getByLabelText("Oggetto"), { target: { value: "Oggetto aggiornato" } });
    expect(screen.queryByRole("button", { name: /Invia a/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rivedi e invia" }));
    await screen.findByRole("heading", { name: "Rivedi la comunicazione" });
    expect(api.previewCommunication).toHaveBeenLastCalledWith(expect.objectContaining({ audience: "all", organization_ids: [], subject: "Oggetto aggiornato" }));
    expect(api.sendCommunication).not.toHaveBeenCalled();
  });

  it("blocca modifiche e doppio click mentre prepara l'anteprima", async () => {
    let resolve!: (value: api.CommunicationPreview) => void;
    vi.mocked(api.previewCommunication).mockImplementation(() => new Promise((done) => { resolve = done; }));
    showPage();
    await fillDraft();
    const button = screen.getByRole("button", { name: "Rivedi e invia" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.previewCommunication).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Oggetto")).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "Inviate" }));
    expect(screen.getByRole("tab", { name: "Nuova comunicazione" })).toHaveAttribute("aria-selected", "true");
    await act(async () => resolve({ recipients: [recipients[0]], organization_count: 1, admin_count: 1, email_count: 1, without_admin_count: 0 }));
    expect(screen.getByRole("heading", { name: "Rivedi la comunicazione" })).toHaveFocus();
  });

  it("riusa l'identico invio dopo una risposta incerta e impedisce i duplicati durante il retry", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof api.sendCommunication>>) => void;
    vi.mocked(api.sendCommunication).mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    showPage();
    await reviewDraft();
    fireEvent.click(screen.getByRole("button", { name: "Invia a 1 associazione" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("senza duplicare la comunicazione");
    const button = screen.getByRole("button", { name: "Invia a 1 associazione" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.sendCommunication).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.sendCommunication).mock.calls[0][0]).toEqual(vi.mocked(api.sendCommunication).mock.calls[1][0]);
    expect(screen.getByRole("button", { name: "Modifica messaggio o destinatari" })).toBeDisabled();
    await act(async () => resolve({ item: sentItem, replayed: true }));
    await screen.findByText("Comunicazione pubblicata.");
  });

  it("gestisce errori di caricamento con retry senza presentarli come archivio vuoto", async () => {
    vi.mocked(api.fetchCommunicationRecipients).mockRejectedValueOnce(new Error("Rete non disponibile"));
    vi.mocked(api.fetchSentCommunications).mockRejectedValueOnce(new Error("Archivio non disponibile"));
    showPage();
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Rivedi e invia" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    await screen.findByRole("checkbox", { name: "Club Aurora" });
    fireEvent.click(screen.getByRole("tab", { name: "Inviate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Archivio non disponibile");
    expect(screen.queryByText("La prima comunicazione parte da qui")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ricarica storico" }));
    expect(await screen.findByRole("button", { name: /Nuova stagione/ })).toBeInTheDocument();
  });

  it("non consente un invio a tutte se non ci sono affiliate attive", async () => {
    vi.mocked(api.fetchCommunicationRecipients).mockResolvedValue({ items: [], total: 0 });
    showPage();
    await screen.findByText(/Non ci sono associazioni affiliate attive/);
    fireEvent.click(screen.getByRole("radio", { name: /Tutte le affiliate attive/ }));
    fireEvent.change(screen.getByLabelText("Oggetto"), { target: { value: sentItem.subject } });
    fireEvent.change(screen.getByLabelText("Messaggio"), { target: { value: sentItem.body } });
    expect(screen.getByRole("button", { name: "Rivedi e invia" })).toBeDisabled();
    expect(api.previewCommunication).not.toHaveBeenCalled();
  });

  it("la chiusura del dettaglio annulla una risposta ancora in corso senza perdere i destinatari storici", async () => {
    let resolve!: (value: { item: api.CentralCommunication }) => void;
    vi.mocked(api.fetchSentCommunication).mockResolvedValueOnce({ item: { ...sentItem,
      recipients: [{ id: 1, organization_id: null, organization_name: "Associazione storica", admin_count: 1, email_count: 1 }] } })
      .mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    showPage();
    fireEvent.click(screen.getByRole("tab", { name: "Inviate" }));
    const row = await screen.findByRole("button", { name: /Nuova stagione/ });
    fireEvent.click(row);
    expect(await screen.findByText("Associazione storica")).toBeInTheDocument();
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: "Chiudi dettaglio" }));
    await act(async () => resolve({ item: sentItem }));
    expect(screen.queryByRole("button", { name: "Chiudi dettaglio" })).not.toBeInTheDocument();
  });
});
