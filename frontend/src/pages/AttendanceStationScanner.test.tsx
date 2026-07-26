import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceStationAuthError } from "../lib/api";
import AttendanceStationScanner from "./AttendanceStationScanner";

const mocks = vi.hoisted(() => ({
  checkIn: vi.fn(),
  decodeFromStream: vi.fn(),
  fetchSession: vi.fn(),
  getUserMedia: vi.fn(),
  scannerStop: vi.fn(),
  trackStop: vi.fn(),
  vibrate: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  AttendanceStationAuthError: class AttendanceStationAuthError extends Error {},
  checkInAttendanceStation: mocks.checkIn,
  fetchAttendanceStationSession: mocks.fetchSession,
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

const session = {
  station: {
    id: 17,
    name: "Tablet reception",
    status: "active" as const,
    created_at: "2026-07-26T08:00:00Z",
    paired_at: "2026-07-26T08:02:00Z",
    last_used_at: "2026-07-26T08:03:00Z",
    revoked_at: null,
  },
  organization: { name: "Club Futura" },
};

const attendance = {
  id: 41,
  member_id: 9,
  member_name: "Tizio Caio",
  card_no: 800001,
  card_year: 2026,
  membership_type: "annual" as const,
  attendance_date: "2026-07-26",
  checked_in_at: "2026-07-26T19:15:00Z",
  source: "qr_station" as const,
  scanner_station_id: 17,
  scanner_station_name: "Tablet reception",
};

describe("AttendanceStationScanner", () => {
  beforeEach(() => {
    mocks.checkIn.mockReset();
    mocks.decodeFromStream.mockReset();
    mocks.fetchSession.mockReset();
    mocks.getUserMedia.mockReset();
    mocks.scannerStop.mockReset();
    mocks.trackStop.mockReset();
    mocks.vibrate.mockReset();

    mocks.fetchSession.mockResolvedValue(session);
    mocks.getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: mocks.trackStop }],
    });
    mocks.decodeFromStream.mockResolvedValue({ stop: mocks.scannerStop });
    mocks.checkIn.mockResolvedValue({ created: true, item: attendance });

    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: mocks.getUserMedia },
    });
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: mocks.vibrate,
    });
    setCameraPolicy(true);
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(document, "permissionsPolicy");
  });

  it("loads only its station identity and keeps scanning after a successful check-in", async () => {
    render(<AttendanceStationScanner />);

    expect(await screen.findByText("Club Futura")).toBeInTheDocument();
    expect(screen.getByText("Tablet reception")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Avvia scanner" }));

    await waitFor(() => expect(mocks.decodeFromStream).toHaveBeenCalledTimes(1));
    const callback = mocks.decodeFromStream.mock.calls[0][2] as (
      result: { getText: () => string },
    ) => void;
    callback({
      getText: () =>
        "https://assonam.it/api/cards/verify/member-token.signature",
    });

    await waitFor(() =>
      expect(mocks.checkIn).toHaveBeenCalledWith("member-token.signature"),
    );
    expect(await screen.findByText("Ingresso registrato")).toBeInTheDocument();
    expect(screen.getByText(/Tizio Caio/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ferma fotocamera" }),
    ).toBeInTheDocument();
    expect(mocks.scannerStop).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("attendance-station-scanner-frame"),
    ).toBeInTheDocument();

    callback({
      getText: () =>
        "https://assonam.it/api/cards/verify/member-token.signature",
    });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(mocks.checkIn).toHaveBeenCalledTimes(1);
  });

  it("stops immediately when the station is revoked", async () => {
    mocks.checkIn.mockRejectedValue(
      new AttendanceStationAuthError("Dispositivo non autorizzato"),
    );
    render(<AttendanceStationScanner />);

    await screen.findByText("Club Futura");
    fireEvent.click(screen.getByRole("button", { name: "Avvia scanner" }));
    await waitFor(() => expect(mocks.decodeFromStream).toHaveBeenCalledTimes(1));
    const callback = mocks.decodeFromStream.mock.calls[0][2] as (
      result: { getText: () => string },
    ) => void;
    callback({
      getText: () =>
        "https://assonam.it/api/cards/verify/member-token.signature",
    });

    expect(
      await screen.findByText(
        "La postazione è stata scollegata o revocata dall’associazione.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Dispositivo non collegato" }),
    ).toBeInTheDocument();
    expect(mocks.scannerStop).toHaveBeenCalledTimes(1);
  });

  it("preserves actionable first-party camera policy errors", async () => {
    setCameraPolicy(false);
    render(<AttendanceStationScanner />);

    await screen.findByText("Club Futura");
    fireEvent.click(screen.getByRole("button", { name: "Avvia scanner" }));

    expect(
      await screen.findByText(
        "La configurazione di sicurezza del sito sta bloccando la fotocamera. Ricarica la pagina e riprova.",
      ),
    ).toBeInTheDocument();
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
  });
});
