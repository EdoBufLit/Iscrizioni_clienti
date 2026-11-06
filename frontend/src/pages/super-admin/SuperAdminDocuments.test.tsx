import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "../../lib/api";
import SuperAdminDocuments from "./SuperAdminDocuments";

const context = vi.hoisted(() => ({ profile: { id: 1, email: "qa@example.test" } }));
vi.mock("react-router-dom", async original => ({ ...await original<typeof import("react-router-dom")>(), useOutletContext: () => context }));
vi.mock("../../components/ui/ToastProvider", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../../lib/api", async original => ({ ...await original<typeof import("../../lib/api")>(), fetchSuperAdminDocumentTargets: vi.fn(), fetchSuperAdminSharedDocuments: vi.fn(), fetchSuperAdminSharedDocumentDetail: vi.fn(), createSuperAdminSharedDocument: vi.fn(), downloadSuperAdminSharedDocument: vi.fn(), fetchSuperAdminAccountingFolders: vi.fn(), fetchSuperAdminAccountingCategories: vi.fn(), fetchSuperAdminAccountingDocuments: vi.fn() }));

const filename = "rendiconto_annuale_con_allegati_e_nome_molto_lungo_".repeat(4) + ".pdf";
const target = { id: 4, name: "Associazione culturale con denominazione completa molto lunga", slug: "qa", is_active: true, accounting_enabled: true };
const document: api.SuperAdminSharedDocument = { id: 1, title: "Circolare operativa", description: "Descrizione completa", kind: "general", created_at: "2026-11-05T10:00:00Z", original_filename: filename, mime_type: "application/pdf", size_bytes: 1024, recipient_count: 1, recipient_preview: [], recipients: [{ ...target, assigned_at: null }], download_url: "/api/super-admin/documents/1/download", uploaded_by: null };
const secondDocument = { ...document, id: 2, title: "Seconda circolare", download_url: "/api/super-admin/documents/2/download" };
const accountingDocument: api.SuperAdminAccountingDocument = { ...document, file_size: 1024, updated_at: null, preview_enabled: true, preview_available: true, is_share_enabled: true, legacy_shared_document_id: null, organization: target, folder: null, category: null, preview_url: "/preview/1", open_url: "/open/1", share_links: [] };
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
  vi.mocked(api.fetchSuperAdminDocumentTargets).mockResolvedValue({ items: [target], total: 1 });
  vi.mocked(api.fetchSuperAdminSharedDocuments).mockResolvedValue({ items: [document, secondDocument], total: 2 });
  vi.mocked(api.fetchSuperAdminSharedDocumentDetail).mockImplementation(async id => id === 1 ? document : secondDocument);
  vi.mocked(api.fetchSuperAdminAccountingFolders).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(api.fetchSuperAdminAccountingCategories).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(api.fetchSuperAdminAccountingDocuments).mockResolvedValue({ items: [accountingDocument], total: 1 });
});
function mount() { return render(<MemoryRouter><SuperAdminDocuments /></MemoryRouter>); }

it("mantiene selezione accessibile e download corretto con nomi di file lunghi", async () => {
  mount();
  const archive = await screen.findByRole("table", { name: "Archivio invii" });
  const select = within(archive).getByRole("button", { name: "Seconda circolare" });
  fireEvent.click(select);
  await waitFor(() => expect(select).toHaveAttribute("aria-pressed", "true"));
  expect(within(archive).getAllByText(filename)).toHaveLength(2);
  fireEvent.click(within(archive).getByRole("button", { name: "Scarica Seconda circolare" }));
  expect(api.downloadSuperAdminSharedDocument).toHaveBeenCalledExactlyOnceWith(secondDocument);
});

it("non sostituisce il dettaglio selezionato con una risposta precedente fuori ordine", async () => {
  let completeFirst!: (value: api.SuperAdminSharedDocument) => void;
  vi.mocked(api.fetchSuperAdminSharedDocumentDetail).mockImplementation(id => id === 1 ? new Promise(resolve => { completeFirst = resolve; }) : Promise.resolve(secondDocument));
  mount();
  const archive = await screen.findByRole("table", { name: "Archivio invii" });
  fireEvent.click(within(archive).getByRole("button", { name: "Circolare operativa" }));
  await waitFor(() => expect(api.fetchSuperAdminSharedDocumentDetail).toHaveBeenCalledWith(1));
  fireEvent.click(within(archive).getByRole("button", { name: "Seconda circolare" }));
  await screen.findByRole("heading", { name: "Seconda circolare" });
  await act(async () => completeFirst(document));
  expect(screen.getByRole("heading", { name: "Seconda circolare" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Circolare operativa" })).not.toBeInTheDocument();
});

it("preserva destinatari, file e categoria dell'invio dal modulo etichettato", async () => {
  vi.mocked(api.createSuperAdminSharedDocument).mockResolvedValue({ ok: true, document });
  mount(); await screen.findByRole("table", { name: "Archivio invii" });
  fireEvent.click(screen.getByRole("button", { name: "Nuovo invio" }));
  const file = new File(["%PDF-QA"], filename, { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Titolo", { exact: true }), { target: { value: "Avviso soci" } });
  fireEvent.change(screen.getByLabelText("File Documento"), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText("Destinatari documento"), { target: { value: "multiple" } });
  fireEvent.click(screen.getByRole("checkbox", { name: target.name }));
  fireEvent.click(screen.getByRole("button", { name: "Invia Documento" }));
  await waitFor(() => expect(api.createSuperAdminSharedDocument).toHaveBeenCalledWith(expect.objectContaining({ title: "Avviso soci", file, kind: "general", targetMode: "multiple", associationIds: [4] })));
});

it("mantiene filtri e preview contabili utilizzabili con titoli e file lunghi", async () => {
  mount(); await screen.findByRole("table", { name: "Archivio invii" });
  expect(screen.getByRole("region", { name: "Riepilogo invii documenti" })).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Titolo" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Contabilità" }));
  const archive = await screen.findByRole("table", { name: "Archivio documenti contabili" });
  expect(screen.queryByRole("region", { name: "Riepilogo invii documenti" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Filtri" }));
  fireEvent.change(screen.getByLabelText("Filtra associazione"), { target: { value: "4" } });
  await waitFor(() => expect(api.fetchSuperAdminAccountingDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ orgId: 4 })));
  fireEvent.click(screen.getByRole("button", { name: "Mostra risultati" }));
  const currentArchive = await screen.findByRole("table", { name: "Archivio documenti contabili" });
  expect(archive).toBeDefined();
  fireEvent.click(within(currentArchive).getByRole("button", { name: "Preview" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(filename + " · PDF")).toBeVisible();
  fireEvent.click(within(dialog).getByRole("button", { name: "Scarica file" }));
  expect(api.downloadSuperAdminSharedDocument).toHaveBeenCalledWith(accountingDocument);
});


it("mantiene il nome file completo nel dettaglio e apre il nuovo documento contabile dall’intestazione", async () => {
  mount();
  const general = await screen.findByRole("table", { name: "Archivio invii" });
  fireEvent.click(within(general).getByRole("button", { name: "Circolare operativa" }));
  const detail = await screen.findByRole("dialog", { name: "Dettaglio invio" });
  expect(within(detail).getByText(filename)).toBeVisible();
  fireEvent.click(within(detail).getByRole("button", { name: "Chiudi finestra" }));
  fireEvent.click(screen.getByRole("tab", { name: "Contabilità" }));
  await screen.findByRole("table", { name: "Archivio documenti contabili" });
  fireEvent.click(screen.getByRole("button", { name: "Nuovo documento" }));
  const create = await screen.findByRole("dialog", { name: "Nuovo documento contabile" });
  expect(within(create).getByLabelText("Associazione del documento contabile")).toBeVisible();
});

it("le azioni contabili restano disponibili nel dettaglio compatto", async () => {
  mount(); await screen.findByRole("table", { name: "Archivio invii" });
  fireEvent.click(screen.getByRole("tab", { name: "Contabilità" }));
  const archive = await screen.findByRole("table", { name: "Archivio documenti contabili" });
  fireEvent.click(within(archive).getByRole("button", { name: /Circolare operativa/ }));
  const detail = await screen.findByRole("dialog", { name: "Dettaglio documento contabile" });
  expect(within(detail).getByText(filename)).toBeVisible();
  expect(within(detail).getByRole("button", { name: "Modifica" })).toBeEnabled();
  fireEvent.click(within(detail).getByRole("button", { name: "Elimina" }));
  expect(await screen.findByRole("dialog", { name: "Conferma eliminazione" })).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "Dettaglio documento contabile" })).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: "Escape" });
  const restored = await screen.findByRole("dialog", { name: "Dettaglio documento contabile" });
  expect(within(restored).getByText(filename)).toBeVisible();
  fireEvent.click(within(restored).getByRole("button", { name: "Modifica" }));
  const editor = await screen.findByRole("dialog", { name: "Modifica documento contabile" });
  expect(screen.queryByRole("dialog", { name: "Dettaglio documento contabile" })).not.toBeInTheDocument();
  fireEvent.click(within(editor).getByRole("button", { name: "Chiudi finestra" }));
  const afterEdit = await screen.findByRole("dialog", { name: "Dettaglio documento contabile" });
  fireEvent.click(within(afterEdit).getByRole("button", { name: "Preview" }));
  expect(screen.queryByRole("dialog", { name: "Dettaglio documento contabile" })).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(await screen.findByRole("dialog", { name: "Dettaglio documento contabile" })).toBeVisible();
});


it("mostra uno stato vuoto quando la ricerca non corrisponde agli invii esistenti", async () => {
  mount();
  await screen.findByRole("table", { name: "Archivio invii" });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nessun-risultato-sintetico" } });
  expect(await screen.findByText("Nessun documento corrisponde alla ricerca.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Circolare operativa" })).not.toBeInTheDocument();
});
