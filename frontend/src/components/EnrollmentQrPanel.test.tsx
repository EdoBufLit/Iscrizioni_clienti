import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EnrollmentQrPanel, { buildEnrollmentPoster, type EnrollmentQr } from "./EnrollmentQrPanel";

const data: EnrollmentQr = {
  organization_name: "Jappa Club & amici <Roma>", organization_slug: "jappa-club",
  enrollment_url: "https://assonam.it/associazioni/jappa-club/iscrizione",
  qr_data_uri: "data:image/png;base64,aGVsbG8=",
};
const fetchMock = vi.fn();

describe("QR iscrizione", () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => data });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("mostra locandina sicura e copia il link canonico senza inviare mutazioni", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<EnrollmentQrPanel endpoint="/api/org-admin/organization/enrollment-qr" />);
    expect(await screen.findByLabelText("Link di iscrizione")).toHaveValue(data.enrollment_url);
    expect(screen.getByRole("img")).toHaveAttribute("src", expect.stringContaining("data:image/svg+xml"));
    fireEvent.click(screen.getByRole("button", { name: "Copia link" }));
    expect(await screen.findByText("Link copiato.")).toBeVisible();
    expect(writeText).toHaveBeenCalledWith(data.enrollment_url);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/org-admin/organization/enrollment-qr", expect.objectContaining({ credentials: "include" }));
  });

  it("scarica il PNG del codice originale con un nome riconoscibile", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function(this: HTMLAnchorElement) {
      expect(this.download).toBe("qr-iscrizione-jappa-club.png");
      expect(this.href).toBe(data.qr_data_uri);
    });
    render(<EnrollmentQrPanel endpoint="/qr" />);
    fireEvent.click(await screen.findByRole("button", { name: "Scarica solo QR" }));
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });

  it("gestisce l'errore e consente un nuovo tentativo", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    render(<EnrollmentQrPanel endpoint="/qr" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossibile creare il QR");
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByLabelText("Link di iscrizione")).toHaveValue(data.enrollment_url);
  });

  it("ignora risposte obsolete passando a un'altra associazione", async () => {
    let resolveFirst!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }));
    const { rerender } = render(<EnrollmentQrPanel endpoint="/organizations/1/qr" />);
    rerender(<EnrollmentQrPanel endpoint="/organizations/2/qr" />);
    await screen.findByLabelText("Link di iscrizione");
    resolveFirst({ ok: true, json: async () => ({ ...data, enrollment_url: "https://old.test" }) });
    await waitFor(() => expect(screen.getByLabelText("Link di iscrizione")).toHaveValue(data.enrollment_url));
  });

  it("mantiene nomi lunghi completi e testo XML escapato nella locandina", () => {
    const svg = buildEnrollmentPoster(data);
    expect(svg).toContain("&amp; amici &lt;Roma&gt;");
    const longName = "Associazione ".repeat(12).trim();
    const parsed = new DOMParser().parseFromString(buildEnrollmentPoster({ ...data, organization_name: longName }), "image/svg+xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    const names = Array.from(parsed.querySelectorAll("text")).slice(2, -2).map((node) => node.textContent).join(" ");
    expect(names).toBe(longName);
  });
});
