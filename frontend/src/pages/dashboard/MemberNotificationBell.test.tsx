import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../lib/api";
import MemberNotificationBell from "./MemberNotificationBell";
import MemberLogoutButton from "./MemberLogoutButton";
vi.mock("../../lib/api", async original => ({ ...await original<typeof import("../../lib/api")>(), fetchMemberNotifications: vi.fn(), markMemberNotificationRead: vi.fn(), apiLogout: vi.fn() }));
const notification: api.MemberAreaNotification = { id: 5, type: "document_rejected", title: "Documento da correggere", body: "Ricarica il retro leggibile.", href: "/dashboard/documenti?document_id=4", is_read: false, created_at: "2026-10-29T12:00:00Z" };
function Location() { const location = useLocation(); return <p>{location.pathname + location.search}</p>; }
function mount(element = <MemberNotificationBell />) { return render(<MemoryRouter><Routes><Route path="*" element={<>{element}<Location /></>} /></Routes></MemoryRouter>); }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(api.fetchMemberNotifications).mockResolvedValue({ items: [notification], unread_count: 1 }); });
describe("Campanello socio", () => {
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
