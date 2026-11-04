import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../lib/api";
import MemberNotificationBell from "./MemberNotificationBell";
import MemberLogoutButton from "./MemberLogoutButton";
import { invalidateSwrCache, withSwrCache } from "../../lib/swrCache";
vi.mock("../../lib/api", async original => ({ ...await original<typeof import("../../lib/api")>(), fetchMemberNotifications: vi.fn(), markMemberNotificationRead: vi.fn(), apiLogout: vi.fn() }));
const notification: api.MemberAreaNotification = { id: 5, type: "document_rejected", title: "Documento da correggere", body: "Ricarica il retro leggibile.", href: "/dashboard/documenti?document_id=4", is_read: false, created_at: "2026-10-29T12:00:00Z" };
function Location() { const location = useLocation(); return <p>{location.pathname + location.search}</p>; }
function mount(element = <MemberNotificationBell />) { return render(<MemoryRouter><Routes><Route path="*" element={<>{element}<Location /></>} /></Routes></MemoryRouter>); }
beforeEach(() => { invalidateSwrCache(); vi.resetAllMocks(); vi.mocked(api.fetchMemberNotifications).mockResolvedValue({ items: [notification], unread_count: 1 }); });
describe("Campanello socio", () => {
  it("applica il risultato SWR in background senza aspettare il polling successivo", async () => {
    const key = "member:notifications:?limit=20";
    const previous = { items: [notification], unread_count: 1 };
    await withSwrCache(key, 0, async () => previous);
    mount(); await screen.findByRole("button", { name: "Notifiche: 1 da leggere" });
    let finish!: (value: typeof previous) => void;
    await act(async () => { await withSwrCache(key, 30000, () => new Promise(resolve => { finish = resolve; })); });
    await act(async () => finish({ items: [notification], unread_count: 2 }));
    expect(screen.getByRole("button", { name: "Notifiche: 2 da leggere" })).toBeVisible();
  });
  it("mostra motivo del rigetto e apre il documento dopo lettura", async () => {
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Notifiche: 1 da leggere" }));
    expect(await screen.findByText("Ricarica il retro leggibile.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Correggi e reinvia documento" }));
    await waitFor(() => expect(api.markMemberNotificationRead).toHaveBeenCalledExactlyOnceWith(5));
    expect(await screen.findByText("/dashboard/documenti?document_id=4")).toBeVisible();
  });
  it("mantiene l'errore visibile se non può aggiornare la notifica", async () => {
    vi.mocked(api.markMemberNotificationRead).mockRejectedValue(new Error("Riprova la connessione"));
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Notifiche: 1 da leggere" }));
    fireEvent.click(await screen.findByRole("button", { name: "Correggi e reinvia documento" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Riprova la connessione");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("button", { name: "Notifiche: 1 da leggere" })).toBeVisible();
    expect(screen.getByText("Da leggere")).toBeVisible();
  });
  it("segna subito letta e blocca doppi tap mentre il server risponde", async () => {
    let finish!: () => void;
    vi.mocked(api.markMemberNotificationRead).mockReturnValue(new Promise(resolve => { finish = () => resolve({ ok: true }); }));
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Notifiche: 1 da leggere" }));
    const action = await screen.findByRole("button", { name: "Correggi e reinvia documento" });
    fireEvent.click(action); fireEvent.click(action);
    expect(screen.queryByText("Da leggere")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifiche" })).toBeVisible();
    expect(api.markMemberNotificationRead).toHaveBeenCalledTimes(1);
    finish();
    expect(await screen.findByText("/dashboard/documenti?document_id=4")).toBeVisible();
  });
  it("non naviga a un indirizzo esterno ricevuto nel payload", async () => {
    vi.mocked(api.fetchMemberNotifications).mockResolvedValue({ items: [{ ...notification, href: "https://example.test/" }], unread_count: 1 });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Notifiche: 1 da leggere" }));
    fireEvent.click(await screen.findByRole("button", { name: "Correggi e reinvia documento" }));
    expect(await screen.findByText("/dashboard")).toBeVisible();
  });
});
describe("Uscita dal profilo", () => {
  it("blocca i doppi click e passa al login dopo logout riuscito", async () => {
    let finish!: () => void; vi.mocked(api.apiLogout).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    mount(<MemberLogoutButton />); const button = screen.getByRole("button", { name: "Esci dall'account" });
    fireEvent.click(button); fireEvent.click(button); expect(api.apiLogout).toHaveBeenCalledTimes(1);
    finish(); expect(await screen.findByText("/login")).toBeVisible();
  });
  it("resta nel profilo con un errore reale se logout fallisce", async () => {
    vi.mocked(api.apiLogout).mockRejectedValue(new Error("Uscita non riuscita"));
    mount(<MemberLogoutButton />); fireEvent.click(screen.getByRole("button", { name: "Esci dall'account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Uscita non riuscita");
    expect(screen.queryByText("/login")).not.toBeInTheDocument();
  });
});
