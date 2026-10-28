import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrgAdminAttendancePage from "./OrgAdminAttendance";

const mocks = vi.hoisted(() => ({
  decodeFromStream: vi.fn(),
  checkIn: vi.fn(),
  fetchAttendances: vi.fn(),
  fetchStations: vi.fn(),
  getUserMedia: vi.fn(),
  scannerStop: vi.fn(),
  trackStop: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  checkInOrgAdminAttendance: mocks.checkIn,
  fetchOrgAdminAttendances: mocks.fetchAttendances,
  fetchOrgAdminAttendanceStations: mocks.fetchStations,
  createOrgAdminAttendanceStation: vi.fn(),
  renewOrgAdminAttendanceStationPairing: vi.fn(),
  revokeOrgAdminAttendanceStation: vi.fn(),
}));

vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: class {
    decodeFromStream = mocks.decodeFromStream;
  },
}));

function setCameraPolicy(allowsCamera: boolean) {
  Object.defineProperty(document, "permissionsPolicy", {
    configurable: true,
    value: {
      allowsFeature: (feature: string) =>
        feature === "camera" ? allowsCamera : false,
    },
  });
}

describe("OrgAdminAttendance camera startup", () => {
  beforeEach(() => {
    mocks.decodeFromStream.mockReset();
    mocks.checkIn.mockReset();
    mocks.fetchAttendances.mockReset();
    mocks.fetchStations.mockReset();
    mocks.getUserMedia.mockReset();
    mocks.scannerStop.mockReset();
    mocks.trackStop.mockReset();

    mocks.fetchAttendances.mockResolvedValue({ items: [], total: 0 });
    mocks.fetchStations.mockResolvedValue({ items: [] });
    mocks.getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: mocks.trackStop }],
    });
    mocks.decodeFromStream.mockResolvedValue({ stop: mocks.scannerStop });

    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: mocks.getUserMedia },
    });
    setCameraPolicy(true);
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(document, "permissionsPolicy");
  });

  it("requests the native camera from the button and passes the stream to the QR reader", async () => {
    render(<OrgAdminAttendancePage />);

    fireEvent.click(screen.getByRole("button", { name: "Avvia fotocamera" }));

    await waitFor(() => expect(mocks.getUserMedia).toHaveBeenCalledTimes(1));
    expect(mocks.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    await waitFor(() => expect(mocks.decodeFromStream).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole("button", { name: "Ferma fotocamera" }),
    ).toBeInTheDocument();
    const scannerFrame = screen.getByTestId("attendance-scanner-frame");
    expect(scannerFrame).toHaveClass("attendance-scanner-frame");
    expect(scannerFrame.getAttribute("style")).toContain(
      "background-color: transparent",
    );
    expect(scannerFrame).not.toHaveClass("rounded-[1.4rem]");
  });

  it("explains a server policy block without pretending a prompt was rejected", async () => {
    setCameraPolicy(false);
    render(<OrgAdminAttendancePage />);

    fireEvent.click(screen.getByRole("button", { name: "Avvia fotocamera" }));

    expect(
      await screen.findByText(
        "La configurazione di sicurezza del sito sta bloccando la fotocamera. Ricarica la pagina e riprova.",
      ),
    ).toBeInTheDocument();
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
  });

  it("releases a pending camera request when switching to member search", async () => {
    let allowCamera!: (stream: unknown) => void;
    mocks.getUserMedia.mockReturnValue(new Promise(resolve => { allowCamera = resolve; }));
    render(<OrgAdminAttendancePage />);
    fireEvent.click(screen.getByRole("button", { name: "Avvia fotocamera" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerca socio" }));
    allowCamera({ getTracks: () => [{ stop: mocks.trackStop }] });
    await waitFor(() => expect(mocks.trackStop).toHaveBeenCalledTimes(1));
    expect(mocks.decodeFromStream).not.toHaveBeenCalled();
    expect(screen.getByRole("searchbox", { name: "Cerca un socio da registrare" })).toBeInTheDocument();
  });

  it("ignores a late QR callback after switching to member search", async () => {
    render(<OrgAdminAttendancePage />);
    fireEvent.click(screen.getByRole("button", { name: "Avvia fotocamera" }));
    await screen.findByRole("button", { name: "Ferma fotocamera" });
    const decoded = mocks.decodeFromStream.mock.calls[0][2];
    fireEvent.click(screen.getByRole("button", { name: "Cerca socio" }));
    decoded({ getText: () => "https://assonam.it/api/cards/verify/abcdefghijklmnopqrstuvwxyz1234567890" });
    expect(mocks.checkIn).not.toHaveBeenCalled();
    expect(mocks.scannerStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("gives actionable browser and phone guidance when access is not authorized", async () => {
    mocks.getUserMedia.mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError"),
    );
    render(<OrgAdminAttendancePage />);

    fireEvent.click(screen.getByRole("button", { name: "Avvia fotocamera" }));

    expect(
      await screen.findByText(/Il browser non ha autorizzato la fotocamera/),
    ).toBeInTheDocument();
    expect(screen.getByText(/impostazioni del telefono/)).toBeInTheDocument();
  });

  it("keeps hardware stations out of the Live flow until opened from settings and shows immediate scan outcome", async () => {
    mocks.fetchAttendances.mockResolvedValue({
      total: 2,
      items: [
        {
          id: 101,
          member_id: 1,
          member_name: "Mario Rossi",
          card_no: 42,
          card_year: 2026,
          membership_type: "annual",
          attendance_date: "2026-10-28",
          checked_in_at: "2026-10-28T20:15:00Z",
          source: "qr",
          scanner_station_id: null,
          scanner_station_name: null,
        },
      ],
    });
    mocks.checkIn.mockResolvedValue({
      created: true,
      item: {
        id: 102,
        member_id: 2,
        member_name: "Laura Bianchi",
        card_no: 43,
        card_year: 2026,
        membership_type: "annual",
        attendance_date: "2026-10-28",
        checked_in_at: "2026-10-28T20:41:00Z",
        source: "qr",
        scanner_station_id: null,
        scanner_station_name: null,
      },
    });

    render(<OrgAdminAttendancePage />);

    // Hardware station setup is not cluttering the main view
    expect(screen.queryByText("Nessuna postazione collegata")).not.toBeInTheDocument();
    expect(await screen.findByText("2 soci")).toBeInTheDocument();
    expect(screen.getByText("Mario Rossi")).toBeInTheDocument();

    // Scan QR and verify immediate feedback banner right below camera
    fireEvent.click(screen.getByRole("button", { name: "Avvia fotocamera" }));
    await screen.findByRole("button", { name: "Ferma fotocamera" });
    const decoded = mocks.decodeFromStream.mock.calls[0][2];
    await act(async () => {
      decoded({ getText: () => "https://assonam.it/api/cards/verify/abcdefghijklmnopqrstuvwxyz1234567890" });
    });

    expect(await screen.findByText("Ingresso registrato")).toBeInTheDocument();
    expect(screen.getByText("Laura Bianchi")).toBeInTheDocument();

    // Open hardware stations modal via gear button
    fireEvent.click(screen.getByRole("button", { name: "Postazioni scanner" }));
    expect(await screen.findByRole("dialog", { name: "Postazioni scanner" })).toBeInTheDocument();
  });
});
