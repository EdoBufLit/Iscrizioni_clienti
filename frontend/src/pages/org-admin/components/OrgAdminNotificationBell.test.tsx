import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "../../../lib/api";
import OrgAdminNotificationBell from "./OrgAdminNotificationBell";
import { invalidateSwrCache, withSwrCache } from "../../../lib/swrCache";

vi.mock("../../../lib/api", async original => ({ ...await original<typeof import("../../../lib/api")>(), fetchOrgAdminNotifications: vi.fn(), fetchOrgAdminUnreadNotificationCount: vi.fn(), markAllOrgAdminNotificationsRead: vi.fn(), deleteOrgAdminNotification: vi.fn() }));
const notification: api.OrgAdminNotification = { id: 7, type: "member_document", title: "Documento ricevuto", body: "Da verificare", href: "/org-admin/soci", is_read: false, created_at: null, read_at: null };
beforeEach(() => {
  invalidateSwrCache();
  vi.resetAllMocks();
  vi.mocked(api.fetchOrgAdminNotifications).mockResolvedValue({ items: [notification], unread_count: 1 });
  vi.mocked(api.fetchOrgAdminUnreadNotificationCount).mockResolvedValue({ unread_count: 1 });
});

it("aggiorna il badge quando termina la rivalidazione SWR del conteggio", async () => {
  await withSwrCache("org-admin:unread-count", 0, async () => ({ unread_count: 1 }));
  await mount();
  let finish!: (value: { unread_count: number }) => void;
  await act(async () => { await withSwrCache("org-admin:unread-count", 30000, () => new Promise(resolve => { finish = resolve; })); });
  await act(async () => finish({ unread_count: 3 }));
  expect(screen.getByText("3")).toBeVisible();
  await act(async () => { await withSwrCache("org-admin:notifications:20", 30000, async () => ({ items: [{ ...notification, title: "Nuovo documento aggiornato" }], unread_count: 2 })); });
  expect(screen.getByText("Nuovo documento aggiornato")).toBeVisible();
  expect(screen.getByText("2")).toBeVisible();
});
async function mount() {
  render(<MemoryRouter><OrgAdminNotificationBell /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Apri notifiche" }));
  await screen.findByText("Documento ricevuto");
}

it("segna subito tutte lette e ripristina il badge se il server rifiuta", async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(api.markAllOrgAdminNotificationsRead).mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  await mount();
  const button = screen.getByRole("button", { name: "Segna tutto letto" });
  fireEvent.click(button);
  expect(screen.getByText("Letta")).toBeVisible();
  expect(screen.queryByText("Nuova")).not.toBeInTheDocument();
  fireEvent.click(button);
  expect(api.markAllOrgAdminNotificationsRead).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("Rete non disponibile")));
  expect(screen.getByText("Nuova")).toBeVisible();
  expect(screen.getByText("Rete non disponibile")).toBeVisible();
  expect(screen.getByRole("button", { name: "Segna tutto letto" })).toBeEnabled();
});

it("rimuove subito una notifica e la ripristina se il salvataggio fallisce", async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(api.deleteOrgAdminNotification).mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Elimina notifica" }));
  expect(screen.queryByText("Documento ricevuto")).not.toBeInTheDocument();
  expect(api.deleteOrgAdminNotification).toHaveBeenCalledExactlyOnceWith(7);
  await act(async () => reject(new Error("Eliminazione non riuscita")));
  await waitFor(() => expect(screen.getByText("Documento ricevuto")).toBeVisible());
  expect(screen.getByText("Nuova")).toBeVisible();
  expect(screen.getByText("Eliminazione non riuscita")).toBeVisible();
});
