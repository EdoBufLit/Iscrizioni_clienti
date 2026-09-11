import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../lib/centralCommunications";
import * as notifications from "../../lib/api";
import OrgAdminCentralCommunications from "./OrgAdminCentralCommunications";
import OrgAdminNotificationBell from "./components/OrgAdminNotificationBell";

vi.mock("../../lib/centralCommunications", async (original) => ({
  ...await original<typeof import("../../lib/centralCommunications")>(),
  fetchReceivedCommunications: vi.fn(), fetchReceivedCommunication: vi.fn(), markCommunicationRead: vi.fn(),
}));
vi.mock("../../lib/api", async (original) => ({
  ...await original<typeof import("../../lib/api")>(),
  fetchOrgAdminUnreadNotificationCount: vi.fn(), fetchOrgAdminNotifications: vi.fn(),
  markOrgAdminNotificationRead: vi.fn(), markAllOrgAdminNotificationsRead: vi.fn(), deleteOrgAdminNotification: vi.fn(),
}));

const message: api.ReceivedCommunication = {
  id: 12, subject: "Nuova stagione", body: "Gentili associazioni,\n\n<script>testo semplice</script>",
  excerpt: "Gentili associazioni", created_at: "2026-09-11T10:00:00Z", is_read: false, read_at: null,
};
const secondMessage = { ...message, id: 14, subject: "Documenti da aggiornare", is_read: true };
const readMessage = { ...message, is_read: true, read_at: "2026-09-11T11:00:00Z" };
const inbox = (items = [message, secondMessage]): api.ReceivedCommunicationPage => ({
  items, total: items.length, total_pages: 1, page: 1, page_size: 15, unread_count: items.filter((item) => !item.is_read).length,
});
const notification: notifications.OrgAdminNotification = {
  id: 31, title: message.subject, body: "Aggiornamenti per gli amministratori", type: "central_communication",
  href: "/org-admin/comunicazioni-assonam?message=12", created_at: message.created_at, is_read: false, read_at: null,
};

function CurrentLocation() { return <output aria-label="Percorso corrente">{useLocation().search}</output>; }
function showPage(query = "", withBell = false) {
  render(<MemoryRouter initialEntries={[`/org-admin/comunicazioni-assonam${query}`]}>
    {withBell && <OrgAdminNotificationBell />}<OrgAdminCentralCommunications /><CurrentLocation />
  </MemoryRouter>);
}

describe("Comunicazioni ASSONAM nell'area associazione", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.fetchReceivedCommunications).mockResolvedValue(inbox());
    vi.mocked(api.fetchReceivedCommunication).mockImplementation(async (id) => ({ item: id === 12 ? message : secondMessage }));
    vi.mocked(api.markCommunicationRead).mockResolvedValue({ item: readMessage });
    vi.mocked(notifications.fetchOrgAdminUnreadNotificationCount).mockResolvedValue({ unread_count: 1 });
    vi.mocked(notifications.fetchOrgAdminNotifications).mockResolvedValue({ items: [notification], unread_count: 1 });
    vi.mocked(notifications.markOrgAdminNotificationRead).mockResolvedValue({ ok: true, notification: { ...notification, is_read: true } });
    vi.mocked(notifications.markAllOrgAdminNotificationsRead).mockResolvedValue({ ok: true, updated: 1 });
  });

  it("apre il deep link, tratta HTML come testo e aggiorna inbox e campanella dopo la lettura", async () => {
    vi.mocked(api.fetchReceivedCommunications).mockResolvedValueOnce(inbox()).mockResolvedValue(inbox([readMessage, secondMessage]));
    vi.mocked(notifications.fetchOrgAdminUnreadNotificationCount).mockResolvedValueOnce({ unread_count: 1 }).mockResolvedValue({ unread_count: 0 });
    showPage("?message=12", true);
    const detail = screen.getByRole("region", { name: "Dettaglio comunicazione" });
    expect(await within(detail).findByRole("heading", { name: "Nuova stagione" })).toBeInTheDocument();
    await waitFor(() => expect(api.markCommunicationRead).toHaveBeenCalledWith(12));
    expect(await within(detail).findByText("✓ Letta")).toBeInTheDocument();
    expect(within(detail).getByText(/<script>testo semplice<\/script>/)).toBeInTheDocument();
    expect(detail.querySelector("script")).toBeNull();
    await waitFor(() => expect(api.fetchReceivedCommunications).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(notifications.fetchOrgAdminUnreadNotificationCount).toHaveBeenCalledTimes(2));
    expect(screen.getByText("0 da leggere")).toBeInTheDocument();
  });

  it("non segna come letto una risposta di dettaglio diventata obsoleta", async () => {
    let resolve!: (value: { item: api.ReceivedCommunication }) => void;
    vi.mocked(api.fetchReceivedCommunication).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    showPage("?message=12");
    fireEvent.click(screen.getByRole("button", { name: "← Tutte le comunicazioni" }));
    await act(async () => resolve({ item: message }));
    expect(api.markCommunicationRead).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Percorso corrente")).toHaveTextContent("");
    expect(screen.queryByText(message.body)).not.toBeInTheDocument();
  });

  it("un retry di lettura non riapre il dettaglio chiuso, ma aggiorna comunque le notifiche", async () => {
    let resolve!: (value: { item: api.ReceivedCommunication }) => void;
    vi.mocked(api.markCommunicationRead).mockRejectedValueOnce(new Error("Non disponibile"))
      .mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    showPage("?message=12", true);
    expect(await screen.findByRole("alert")).toHaveTextContent("non è stato segnato come letto");
    const retry = screen.getByRole("button", { name: "Riprova" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(api.markCommunicationRead).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "← Tutte le comunicazioni" }));
    await act(async () => resolve({ item: readMessage }));
    expect(screen.queryByText("✓ Letta")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(notifications.fetchOrgAdminUnreadNotificationCount).toHaveBeenCalledTimes(2));
  });

  it("consente di riprovare un dettaglio fallito e non modifica messaggi già letti", async () => {
    vi.mocked(api.fetchReceivedCommunication).mockRejectedValueOnce(new Error("Errore temporaneo"))
      .mockResolvedValueOnce({ item: readMessage });
    showPage("?message=12");
    expect(await screen.findByRole("alert")).toHaveTextContent("Errore temporaneo");
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("✓ Letta")).toBeInTheDocument();
    expect(api.markCommunicationRead).not.toHaveBeenCalled();
  });

  it("distingue un errore di rete da una inbox vuota e permette di aggiornarla", async () => {
    vi.mocked(api.fetchReceivedCommunications).mockRejectedValueOnce(new Error("Rete non disponibile"))
      .mockResolvedValueOnce(inbox([]));
    showPage();
    await screen.findByRole("alert");
    expect(screen.queryByText("Nessuna comunicazione, per ora")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna" }));
    expect(await screen.findByText("Nessuna comunicazione, per ora")).toBeInTheDocument();
  });

  it("la campanella aggiorna la inbox già aperta quando si apre una comunicazione", async () => {
    vi.mocked(api.fetchReceivedCommunication).mockResolvedValue({ item: readMessage });
    vi.mocked(api.fetchReceivedCommunications).mockResolvedValueOnce(inbox()).mockResolvedValue(inbox([readMessage, secondMessage]));
    showPage("", true);
    await screen.findByText("1 da leggere");
    fireEvent.click(screen.getByRole("button", { name: "Apri notifiche" }));
    fireEvent.click(await screen.findByRole("button", { name: /Nuova stagione Aggiornamenti per gli amministratori/ }));
    await waitFor(() => expect(notifications.markOrgAdminNotificationRead).toHaveBeenCalledWith(31));
    await screen.findByText("0 da leggere");
    expect(screen.getByLabelText("Percorso corrente")).toHaveTextContent("?message=12");
    expect(api.markCommunicationRead).not.toHaveBeenCalled();
  });

  it("aggiorna anche il popover aperto quando arriva un evento di lettura dalla inbox", async () => {
    vi.mocked(notifications.fetchOrgAdminNotifications).mockResolvedValueOnce({ items: [notification], unread_count: 1 })
      .mockResolvedValue({ items: [{ ...notification, is_read: true }], unread_count: 0 });
    showPage("", true);
    fireEvent.click(screen.getByRole("button", { name: "Apri notifiche" }));
    await screen.findByText("Nuova");
    act(() => { api.notifyCommunicationRead(); });
    expect(await screen.findByText("Letta")).toBeInTheDocument();
    expect(screen.queryByText("Nuova")).not.toBeInTheDocument();
  });

  it("cambia pagina mantenendo lo stato letto e il conteggio globale", async () => {
    vi.mocked(api.fetchReceivedCommunications).mockResolvedValueOnce({ ...inbox([readMessage]), total: 16, total_pages: 2, unread_count: 3 })
      .mockResolvedValueOnce({ ...inbox([secondMessage]), page: 2, total: 16, total_pages: 2, unread_count: 3 });
    showPage();
    const next = await screen.findByRole("button", { name: "Successiva" });
    expect(screen.getByRole("button", { name: "Precedente" })).toBeDisabled();
    fireEvent.click(next);
    await screen.findByRole("button", { name: /Documenti da aggiornare/ });
    expect(api.fetchReceivedCommunications).toHaveBeenLastCalledWith(2);
    expect(screen.getByText("3 da leggere")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Successiva" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Precedente" })).toBeEnabled();
  });
});
