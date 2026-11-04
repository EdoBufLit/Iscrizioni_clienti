import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "../../lib/api";
import OrgAdminBookings from "./OrgAdminBookings";

const showToast = vi.hoisted(() => vi.fn());
vi.mock("../../components/ui/ToastProvider", () => ({ useToast: () => ({ showToast }) }));
vi.mock("../../components/bookings/RoomFloorMap", () => ({ RoomFloorMap: () => null }));
vi.mock("../../lib/api", async original => ({ ...await original<typeof import("../../lib/api")>(), fetchOrgAdminFormSummaries: vi.fn(), fetchOrgAdminRooms: vi.fn(), fetchOrgAdminBookingEventSeries: vi.fn(), fetchOrgAdminBooking: vi.fn(), fetchOrgAdminBookingsAgendaDay: vi.fn(), fetchOrgAdminBookingSummary: vi.fn(), updateOrgAdminBooking: vi.fn() }));

const booking = { id: 1, customer_name: "Socio Test", customer_email: "test@example.test", status: "pending", booking_date: "2026-11-05", booking_time: "20:00", party_size: 2, room_id: null, table_id: null, room: null, table: null, form_id: null, submission_id: null, source_form: null, request_status: null, notes: null } as unknown as api.AssociationBooking;
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  vi.mocked(api.fetchOrgAdminFormSummaries).mockResolvedValue({ items: [], total: 0, field_types: [], visibility_options: [] });
  vi.mocked(api.fetchOrgAdminRooms).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(api.fetchOrgAdminBookingEventSeries).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(api.fetchOrgAdminBooking).mockResolvedValue({ booking });
  vi.mocked(api.fetchOrgAdminBookingsAgendaDay).mockResolvedValue({ items: [booking], total: 1, date: booking.booking_date!, limit: 100, offset: 0 } as Awaited<ReturnType<typeof api.fetchOrgAdminBookingsAgendaDay>>);
  vi.mocked(api.fetchOrgAdminBookingSummary).mockResolvedValue({ days: [] } as unknown as Awaited<ReturnType<typeof api.fetchOrgAdminBookingSummary>>);
});

it("aggiorna subito lo stato servizio, blocca doppi tap e ripristina solo la riga fallita", async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(api.updateOrgAdminBooking).mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  render(<MemoryRouter initialEntries={["/org-admin/prenotazioni?bookingId=1&date=2026-11-05"]}><OrgAdminBookings /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("tab", { name: /Tutte/ }));
  const candidates = await screen.findAllByRole("button", { name: "Seduta" });
  const buttons = candidates.filter(button => button.classList.contains("booking-service-status-button"));
  expect(buttons.length).toBeGreaterThan(0);
  fireEvent.click(buttons[0]);
  expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
  expect(buttons[0]).toBeDisabled();
  fireEvent.click(buttons[0]);
  expect(api.updateOrgAdminBooking).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("Connessione interrotta")));
  await waitFor(() => expect(buttons[0]).toHaveAttribute("aria-pressed", "false"));
  expect(buttons[0]).toBeEnabled();
  expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ tone: "error", message: "Connessione interrotta" }));
});

it.each(["confirmed", "seated"])("apre il deep link mobile di una prenotazione %s senza nasconderla nel filtro richieste", async status => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  const target = { ...booking, status };
  vi.mocked(api.fetchOrgAdminBooking).mockResolvedValue({ booking: target });
  vi.mocked(api.fetchOrgAdminBookingsAgendaDay).mockResolvedValue({ items: [target], total: 1, date: target.booking_date! });
  render(<MemoryRouter initialEntries={["/org-admin/prenotazioni?bookingId=1&date=2026-11-05"]}><OrgAdminBookings /></MemoryRouter>);
  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).getByText("Socio Test")).toBeVisible();
  expect(screen.getByRole("tab", { name: /Tutte/ })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(within(sheet).getByRole("button", { name: "Chiudi" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByText("Socio Test")).toBeVisible();
});

function OpenScannedBooking() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate("/org-admin/prenotazioni?bookingId=1&date=2026-11-05")}>Apri prenotazione scansionata</button>;
}

it("rivela il deep link ricevuto mentre l'agenda mobile è già aperta sulle richieste", async () => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  const target = { ...booking, status: "seated" };
  vi.mocked(api.fetchOrgAdminBooking).mockResolvedValue({ booking: target });
  vi.mocked(api.fetchOrgAdminBookingsAgendaDay).mockResolvedValue({ items: [target], total: 1, date: target.booking_date! });
  render(<MemoryRouter initialEntries={["/org-admin/prenotazioni?date=2026-11-05"]}><OpenScannedBooking /><OrgAdminBookings /></MemoryRouter>);
  await screen.findByText("Nessuna richiesta da confermare.");
  fireEvent.click(screen.getByRole("button", { name: "Apri prenotazione scansionata" }));
  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).getByText("Socio Test")).toBeVisible();
  expect(screen.getByRole("tab", { name: /Tutte/ })).toHaveAttribute("aria-selected", "true");
});
