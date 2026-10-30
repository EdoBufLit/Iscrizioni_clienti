import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../lib/api";
import DashboardDocuments from "./DashboardDocuments";

vi.mock("../../lib/api", async original => ({ ...await original<typeof import("../../lib/api")>(), fetchMemberDocuments: vi.fn(), fetchMemberOrganizationStatute: vi.fn(), uploadMemberDocument: vi.fn(), downloadMemberOrganizationStatute: vi.fn() }));
vi.mock("../../components/ui/ToastProvider", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
const item: api.MemberDocumentItem = { id: 4, type: "identity", filename: "identita.pdf", status: "rejected", rejection_note: "Il retro non è leggibile.", uploaded_at: "2026-10-29T10:00:00Z", mime_type: "application/pdf", size_bytes: 1024, download_url: "/documenti/4" };
const missing: api.MemberDocumentsResponse = { required_types: ["identity"], allowed_types: ["identity", "fiscal_code"], uploadable_types: ["identity", "fiscal_code"], items: [] };
function mount(path = "/dashboard/documenti", strict = false) {
  const tree = <MemoryRouter initialEntries={[path]}><Routes><Route path="/dashboard/documenti" element={<DashboardDocuments />} /><Route path="/login" element={<p>Accesso socio</p>} /></Routes></MemoryRouter>;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}
function choose(file = new File(["%PDF-1.4\nfixture"], "identita.pdf", { type: "application/pdf" })) { fireEvent.change(screen.getAllByLabelText("Scegli il documento da inviare")[0], { target: { files: [file] } }); return file; }

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchMemberDocuments).mockResolvedValue(missing);
  vi.mocked(api.fetchMemberOrganizationStatute).mockResolvedValue({ available: true, filename: "statuto_club.pdf", size_bytes: 1258291, download_url: "/statuto.pdf" });
  vi.mocked(api.uploadMemberDocument).mockResolvedValue({ ok: true, id: 8, status: "pending", type: "identity" });
});

describe("Documentazione socio", () => {
  it("riapre il documento aggiornato da notifica anche se la pagina era già aperta", async () => {
    vi.mocked(api.fetchMemberDocuments).mockResolvedValueOnce({ ...missing, uploadable_types: ["fiscal_code"], items: [{ ...item, status: "pending" }] }).mockResolvedValue({ ...missing, items: [item] });
    render(<MemoryRouter initialEntries={["/dashboard/documenti"]}><Routes><Route path="/dashboard/documenti" element={<><Link to="/dashboard/documenti?document_id=4">Apri notifica rigetto</Link><DashboardDocuments /></>} /></Routes></MemoryRouter>);
    await screen.findByText("In verifica");
    fireEvent.click(screen.getByRole("link", { name: "Apri notifica rigetto" }));
    expect(await screen.findByLabelText("Scegli il documento corretto")).toBeVisible();
    expect(screen.getByText("Il retro non è leggibile.")).toBeVisible();
    expect(document.getElementById("member-document-identity")).toHaveFocus();
  });
  it("consente il primo caricamento ma invia solo dopo il comando esplicito", async () => {
    mount(); await screen.findByRole("heading", { name: "Documento di identità" });
    const file = choose();
    expect(api.uploadMemberDocument).not.toHaveBeenCalled();
    vi.mocked(api.fetchMemberDocuments).mockResolvedValue({ ...missing, uploadable_types: ["fiscal_code"], items: [{ ...item, id: 8, status: "pending", rejection_note: null }] });
    fireEvent.click(screen.getAllByRole("button", { name: "Invia documento" })[0]);
    await waitFor(() => expect(api.uploadMemberDocument).toHaveBeenCalledExactlyOnceWith("identity", file));
    expect(await screen.findByText("In verifica")).toBeVisible();
    expect(screen.getByText(/Documento inviato all'associazione/)).toBeVisible();
  });
  it("una risposta StrictMode precedente all'invio non ripristina il documento mancante", async () => {
    let finishOldLoad!: (response: api.MemberDocumentsResponse) => void;
    vi.mocked(api.fetchMemberDocuments)
      .mockImplementationOnce(() => new Promise(resolve => { finishOldLoad = resolve; }))
      .mockResolvedValueOnce(missing);
    mount("/dashboard/documenti", true);
    await screen.findByRole("heading", { name: "Documento di identità" });
    expect(api.fetchMemberDocuments).toHaveBeenCalledTimes(2);
    const file = choose();
    vi.mocked(api.fetchMemberDocuments).mockResolvedValue({ ...missing, uploadable_types: ["fiscal_code"],
      items: [{ ...item, id: 8, status: "pending", rejection_note: null }] });
    fireEvent.click(screen.getAllByRole("button", { name: "Invia documento" })[0]);
    expect(await screen.findByText("In verifica")).toBeVisible();
    expect(api.uploadMemberDocument).toHaveBeenCalledExactlyOnceWith("identity", file);

    await act(async () => { finishOldLoad(missing); });
    const identity = document.getElementById("member-document-identity")!;
    expect(within(identity).getByText("In verifica")).toBeVisible();
    expect(within(identity).getByText(/Documento inviato all'associazione/)).toBeVisible();
    expect(within(identity).queryByLabelText("Scegli il documento da inviare")).not.toBeInTheDocument();
    expect(within(identity).queryByRole("button", { name: "Invia documento" })).not.toBeInTheDocument();
    expect(api.uploadMemberDocument).toHaveBeenCalledTimes(1);
  });
  it("mostra note, evidenzia il documento dalla notifica e permette il reinvio", async () => {
    vi.mocked(api.fetchMemberDocuments).mockResolvedValue({ ...missing, items: [item] });
    mount("/dashboard/documenti?document_id=4");
    const label = await screen.findByLabelText("Scegli il documento corretto");
    expect(screen.getByText("Il retro non è leggibile.")).toBeVisible();
    expect(document.getElementById("member-document-identity")).toHaveFocus();
    const file = new File(["%PDF nuovo"], "corretto.pdf", { type: "application/pdf" });
    fireEvent.change(label, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Reinvia documento" }));
    await waitFor(() => expect(api.uploadMemberDocument).toHaveBeenCalledExactlyOnceWith("identity", file));
  });
  it.each(["approved", "pending"])("non offre sovrascrittura del documento %s", async status => {
    vi.mocked(api.fetchMemberDocuments).mockResolvedValue({ ...missing, uploadable_types: ["fiscal_code"], items: [{ ...item, status }] });
    mount(); await screen.findByRole("heading", { name: "Documento di identità" });
    const section = document.getElementById("member-document-identity")!;
    expect(within(section).queryByRole("button", { name: /Invia|Reinvia/ })).not.toBeInTheDocument();
    expect(within(section).queryByLabelText(/Scegli/)).not.toBeInTheDocument();
  });
  it("rifiuta formato non supportato prima dell'invio", async () => {
    mount(); await screen.findByRole("heading", { name: "Documento di identità" });
    choose(new File(["script"], "documento.html", { type: "text/html" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Formato non supportato");
    expect(api.uploadMemberDocument).not.toHaveBeenCalled();
  });
  it("mantiene il file per riprovare dopo un errore senza mostrare un falso esito", async () => {
    vi.mocked(api.uploadMemberDocument).mockRejectedValueOnce(new Error("Connessione interrotta"));
    mount(); await screen.findByRole("heading", { name: "Documento di identità" }); choose();
    const send = screen.getAllByRole("button", { name: "Invia documento" })[0];
    fireEvent.click(send); fireEvent.click(send);
    expect(await screen.findByRole("alert")).toHaveTextContent("Connessione interrotta");
    expect(api.uploadMemberDocument).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Pronto per l'invio: identita.pdf")).toBeVisible();
    expect(screen.queryByText(/Documento inviato all'associazione/)).not.toBeInTheDocument();
    expect(send).toBeEnabled();
  });
  it("statuto in una sola riga con dimensione reale e download", async () => {
    mount(); await screen.findByText(/statuto_club.pdf · 1.2 MB/);
    expect(screen.getAllByText(/statuto_club.pdf/)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Scarica statuto associativo" }));
    await waitFor(() => expect(api.downloadMemberOrganizationStatute).toHaveBeenCalledExactlyOnceWith({ url: "/statuto.pdf", filename: "statuto_club.pdf" }));
  });
  it("richiede un nuovo accesso se la sessione è scaduta", async () => {
    vi.mocked(api.fetchMemberDocuments).mockRejectedValue(new api.AuthError("Sessione scaduta"));
    mount(); expect(await screen.findByText("Accesso socio")).toBeVisible();
  });
});
