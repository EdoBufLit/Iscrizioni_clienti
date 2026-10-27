import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AttendanceMemberSearch from "./AttendanceMemberSearch";

const mocks = vi.hoisted(() => ({ search: vi.fn(), checkIn: vi.fn() }));
vi.mock("../../../lib/attendance", () => ({ searchAttendanceMembers: mocks.search, checkInAttendanceMember: mocks.checkIn }));
const member = { id: 42, name: "Tizia Caia", email: "tizia@example.com", card_no: 1234, card_year: 2026, membership_type: "annual", is_active: true, already_checked_in: false };
const item = { id: 7, member_id: 42, member_name: "Tizia Caia", card_no: 1234, card_year: 2026, membership_type: "annual", attendance_date: "2026-10-26", checked_in_at: "2026-10-26T10:00:00Z", source: "manual", scanner_station_id: null, scanner_station_name: null };
const query = () => screen.getByRole("searchbox", { name: "Cerca un socio da registrare" });

describe("AttendanceMemberSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search.mockResolvedValue({ items: [member], total: 1 });
    mocks.checkIn.mockResolvedValue({ created: true, item });
  });
  afterEach(cleanup);

  it("richiede una scelta e conferma esplicita, poi impedisce invii duplicati", async () => {
    const registered = vi.fn(), busy = vi.fn();
    render(<AttendanceMemberSearch onRegistered={registered} onBusyChange={busy} />);
    fireEvent.change(query(), { target: { value: "Tizia" } });
    fireEvent.click(await screen.findByRole("button", { name: "Seleziona Tizia Caia, tessera 1234" }));
    expect(mocks.checkIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Registra presenza" }));
    await screen.findByText("Presenza registrata per Tizia Caia.");
    expect(mocks.checkIn).toHaveBeenCalledTimes(1);
    expect(mocks.checkIn).toHaveBeenCalledWith(42);
    expect(registered).toHaveBeenCalledWith({ created: true, item });
    expect(busy.mock.calls).toEqual([[true], [false]]);
    expect(screen.getByRole("button", { name: "Già presente oggi" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cerca un altro socio" }));
    expect(query()).toHaveFocus();
    expect(query()).toHaveValue("");
  });

  it.each([
    [{ is_active: false }, "La tessera deve essere attiva"],
    [{ already_checked_in: true }, "Il primo ingresso di oggi è già registrato."],
  ])("blocca un socio non registrabile %j", async (overrides, message) => {
    mocks.search.mockResolvedValue({ items: [{ ...member, ...overrides }], total: 1 });
    render(<AttendanceMemberSearch onRegistered={vi.fn()} onBusyChange={vi.fn()} />);
    fireEvent.change(query(), { target: { value: "Tizia" } });
    fireEvent.click(await screen.findByRole("button", { name: "Seleziona Tizia Caia, tessera 1234" }));
    expect(screen.getByText(new RegExp(message))).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "already_checked_in" in overrides && overrides.already_checked_in ? "Già presente oggi" : "Registra presenza" });
    expect(save).toBeDisabled();
    expect(mocks.checkIn).not.toHaveBeenCalled();
  });

  it("annulla la ricerca precedente e ignora risultati arrivati fuori ordine", async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.search.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    mocks.search.mockResolvedValue({ items: [{ ...member, name: "Nuovo Socio" }], total: 1 });
    render(<AttendanceMemberSearch onRegistered={vi.fn()} onBusyChange={vi.fn()} />);
    fireEvent.change(query(), { target: { value: "Vecchio" } });
    await waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(1));
    const oldSignal = mocks.search.mock.calls[0][1] as AbortSignal;
    fireEvent.change(query(), { target: { value: "Nuovo" } });
    expect(oldSignal.aborted).toBe(true);
    await screen.findByRole("button", { name: "Seleziona Nuovo Socio, tessera 1234" });
    await act(async () => resolveOld({ items: [member], total: 1 }));
    expect(screen.queryByRole("button", { name: "Seleziona Tizia Caia, tessera 1234" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seleziona Nuovo Socio, tessera 1234" })).toBeInTheDocument();
  });

  it("rende recuperabili errori di ricerca e salvataggio senza registrazioni involontarie", async () => {
    mocks.search.mockRejectedValueOnce(new Error("Connessione interrotta"));
    mocks.checkIn.mockRejectedValueOnce(new Error("Tessera non attiva"));
    render(<AttendanceMemberSearch onRegistered={vi.fn()} onBusyChange={vi.fn()} />);
    fireEvent.change(query(), { target: { value: "Tizia" } });
    await screen.findByText("Connessione interrotta");
    fireEvent.click(screen.getByRole("button", { name: "Riprova ricerca" }));
    fireEvent.click(await screen.findByRole("button", { name: "Seleziona Tizia Caia, tessera 1234" }));
    fireEvent.click(screen.getByRole("button", { name: "Registra presenza" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tessera non attiva");
    expect(screen.getByRole("button", { name: "Registra presenza" })).toBeEnabled();
  });

  it("svuota scelta e risultati quando cambia ricerca e non cerca per un solo carattere", async () => {
    render(<AttendanceMemberSearch onRegistered={vi.fn()} onBusyChange={vi.fn()} />);
    fireEvent.change(query(), { target: { value: "Tizia" } });
    fireEvent.click(await screen.findByRole("button", { name: "Seleziona Tizia Caia, tessera 1234" }));
    fireEvent.change(query(), { target: { value: "T" } });
    expect(screen.queryByRole("button", { name: "Registra presenza" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Soci trovati" })).not.toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });
});
