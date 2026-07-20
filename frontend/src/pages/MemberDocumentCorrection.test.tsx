import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MemberDocumentCorrection from "./MemberDocumentCorrection";
import {
  fetchMemberDocumentCorrection,
  resubmitMemberDocumentCorrection,
} from "../lib/api";


vi.mock("../lib/api", () => ({
  establishMemberDocumentCorrectionSession: vi.fn(),
  fetchMemberDocumentCorrection: vi.fn(),
  resubmitMemberDocumentCorrection: vi.fn(),
}));


const correctionContext = {
  member: { display_name: "Ada Documento" },
  organization: { name: "Associazione Demo" },
  document: {
    id: 42,
    type: "identity",
    filename: "documento.pdf",
    mime_type: "application/pdf",
    size_bytes: 1234,
    rejection_note: "Il file non è leggibile.",
    reviewed_at: "2026-07-18T12:00:00",
  },
  session_expires_in_seconds: 3600,
};


describe("MemberDocumentCorrection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchMemberDocumentCorrection).mockResolvedValue(correctionContext);
    vi.mocked(resubmitMemberDocumentCorrection).mockResolvedValue({
      ok: true,
      id: 43,
      status: "pending",
    });
  });

  it("mostra solo il contesto di correzione e reinvia il file selezionato", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/documenti/correzione"]}>
        <MemberDocumentCorrection />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Correggi il documento" })).toBeInTheDocument();
    expect(screen.getByText("Ada Documento")).toBeInTheDocument();
    expect(screen.getByText("Associazione Demo")).toBeInTheDocument();
    expect(screen.getByText("Il file non è leggibile.")).toBeInTheDocument();
    expect(screen.getByText(/permette esclusivamente/i)).toBeInTheDocument();

    const upload = screen.getByLabelText("Nuova versione del documento");
    const file = new File(["%PDF-1.4 corrected"], "corretto.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(upload, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Invia nuova versione" }));

    await waitFor(() => {
      expect(resubmitMemberDocumentCorrection).toHaveBeenCalledWith(42, file);
    });
    expect(await screen.findByRole("heading", { name: "Nuova versione ricevuta" })).toBeInTheDocument();
  });
});
