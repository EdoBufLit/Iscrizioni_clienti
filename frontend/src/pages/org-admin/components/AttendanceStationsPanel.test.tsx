import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AttendanceStationsPanel from "./AttendanceStationsPanel";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  fetchStations: vi.fn(),
  renew: vi.fn(),
  revoke: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("../../../lib/api", () => ({
  createOrgAdminAttendanceStation: mocks.create,
  fetchOrgAdminAttendanceStations: mocks.fetchStations,
  renewOrgAdminAttendanceStationPairing: mocks.renew,
  revokeOrgAdminAttendanceStation: mocks.revoke,
}));

const activeStation = {
  id: 17,
  name: "Tablet reception",
  status: "active" as const,
  created_at: "2026-07-26T08:00:00Z",
  paired_at: "2026-07-26T08:02:00Z",
  last_used_at: "2026-07-26T08:03:00Z",
  revoked_at: null,
};

const pairing = {
  station: { ...activeStation, status: "pending_pairing" as const, paired_at: null },
  pairing_url:
    "https://assonam.it/api/attendance-stations/pair/one-time-token",
  pairing_qr_data_url: "data:image/png;base64,AAAA",
  pairing_expires_at: "2026-07-26T08:10:00Z",
};

describe("AttendanceStationsPanel", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.fetchStations.mockReset();
    mocks.renew.mockReset();
    mocks.revoke.mockReset();
    mocks.writeText.mockReset();
    mocks.fetchStations.mockResolvedValue({ items: [activeStation] });
    mocks.renew.mockResolvedValue(pairing);
    mocks.revoke.mockResolvedValue({
      station: { ...activeStation, status: "revoked", revoked_at: "2026-07-26T08:05:00Z" },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });

  afterEach(cleanup);

  it("requires confirmation before rotating an active device credential", async () => {
    render(<AttendanceStationsPanel />);

    expect(await screen.findByText("Tablet reception")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ricollega" }));
    expect(
      screen.getByText("Il dispositivo attuale verrà scollegato immediatamente."),
    ).toBeInTheDocument();
    expect(mocks.renew).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Conferma ricollega" }),
    );
    await waitFor(() => expect(mocks.renew).toHaveBeenCalledWith(17));
    expect(
      await screen.findByText("Pronto da collegare"),
    ).toBeInTheDocument();
    expect(
      screen.getByAltText("QR per collegare Tablet reception"),
    ).toBeInTheDocument();
  });

  it("creates a named station and exposes the one-time pairing link", async () => {
    mocks.fetchStations
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [pairing.station] });
    mocks.create.mockResolvedValue(pairing);
    render(<AttendanceStationsPanel />);

    await screen.findByText("Nessuna postazione collegata");
    fireEvent.change(screen.getByPlaceholderText("Es. Tablet reception"), {
      target: { value: "Ingresso palestra" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crea postazione" }));

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith("Ingresso palestra"),
    );
    expect(
      await screen.findByDisplayValue(pairing.pairing_url),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copia link" }));
    await waitFor(() =>
      expect(mocks.writeText).toHaveBeenCalledWith(pairing.pairing_url),
    );
  });
});
