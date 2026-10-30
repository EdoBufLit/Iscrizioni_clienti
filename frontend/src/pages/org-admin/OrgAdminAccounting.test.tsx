import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrgAdminAccounting from "./OrgAdminAccounting";
import type { OrgAdminAccountingArchiveResponse, OrgAdminAccountingDocument } from "../../lib/api";

const mocks = vi.hoisted(() => ({ archive: vi.fn(), download: vi.fn(), share: vi.fn(), links: vi.fn(), revoke: vi.fn(), toast: vi.fn(), mobile: false,
  admin: { id: 1, org_id: 10, organization: { accounting_enabled: true } },
}));
vi.mock("../../lib/api", async original => ({ ...await original<typeof import("../../lib/api")>(),
  fetchOrgAdminAccountingArchive: (...args: unknown[]) => mocks.archive(...args),
  downloadOrgAdminAccountingDocument: (...args: unknown[]) => mocks.download(...args),
  createOrgAdminAccountingShareLink: (...args: unknown[]) => mocks.share(...args),
  fetchOrgAdminAccountingShareLinks: (...args: unknown[]) => mocks.links(...args),
  revokeOrgAdminAccountingShareLink: (...args: unknown[]) => mocks.revoke(...args),
}));
vi.mock("./OrgAdminLayout", () => ({ useOrgAdmin: () => ({ admin: mocks.admin, loading: false }) }));
vi.mock("../../components/ui/ToastProvider", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock("../../hooks/useMediaQuery", () => ({ useMediaQuery: () => mocks.mobile }));

const document: OrgAdminAccountingDocument = { id: 71, title: "Rendiconto annuale con un titolo completo molto lungo", description: "Bilancio approvato e relazione sulla gestione.", original_filename: "rendiconto_annualita_2026_nome_completo_con_dettaglio_della_documentazione.pdf", mime_type: "application/pdf", file_size: 1048576,
  created_at: "2026-10-29T10:00:00Z", updated_at: null, preview_enabled: true, preview_available: true, is_share_enabled: true,
  folder: { id: 11, name: "Anno 2026", year: 2026, slug: "2026", sort_order: 0 }, category: { id: 22, code: "bilanci", name: "Bilanci", is_system: true, sort_order: 0 },
  preview_url: "/api/org-admin/accounting-documents/71/preview", download_url: "/api/org-admin/accounting-documents/71/download", open_url: "/api/org-admin/accounting-documents/71/open", share_links: [],
};
function payload(doc = document): OrgAdminAccountingArchiveResponse {
  return { total_documents: 1, items: [{ id: 11, name: "Anno 2026", year: 2026, slug: "2026", sort_order: 0, document_count: 1,
    categories: [{ id: 22, name: "Bilanci", code: "bilanci", is_system: true, sort_order: 0, documents: [doc] }] }],
    filters: { folders: [{ id: 11, name: "Anno 2026", year: 2026, slug: "2026" }], categories: [{ id: 22, name: "Bilanci", code: "bilanci", is_system: true }], selected_category_id: null, selected_folder_id: null, query: null } };
}
function mount() { return render(<MemoryRouter initialEntries={["/org-admin/contabilita"]}><Routes><Route path="/org-admin/contabilita" element={<OrgAdminAccounting />} /><Route path="/org-admin" element={<h1>Panoramica associazione</h1>} /></Routes></MemoryRouter>); }

beforeEach(() => {
  vi.clearAllMocks(); mocks.mobile = false; mocks.admin.organization.accounting_enabled = true;
  mocks.archive.mockResolvedValue(payload()); mocks.download.mockResolvedValue(undefined); mocks.links.mockResolvedValue({ items: [] });
});

describe("Archivio contabile responsive", () => {
  it("shows complete file details and accessible download, preview and share actions", async () => {
    mount();
    await screen.findByRole("heading", { name: "Archivio contabile" });
    const table = screen.getByRole("table", { name: "Documenti Bilanci" });
    expect(within(table).getByText(document.original_filename)).toBeVisible();
    expect(within(table).getByText(document.description!)).toBeVisible();
    fireEvent.click(within(table).getByRole("button", { name: `Scarica ${document.title}` }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledExactlyOnceWith(document));
    fireEvent.click(within(table).getByRole("button", { name: `Visualizza ${document.title}` }));
    expect(screen.getByRole("dialog", { name: document.title })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Chiudi finestra" }));
    fireEvent.click(within(table).getByRole("button", { name: `Condividi ${document.title}` }));
    expect(screen.getByRole("dialog", { name: document.title })).toBeVisible();
    expect(screen.getByRole("button", { name: "Crea link" })).toBeVisible();
    expect(mocks.share).not.toHaveBeenCalled();
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("uses mobile file cards and preserves document preview/share permissions", async () => {
    mocks.mobile = true;
    mocks.archive.mockResolvedValue(payload({ ...document, preview_available: false, is_share_enabled: false }));
    mount();
    const list = await screen.findByRole("list", { name: "Documenti Bilanci" });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(within(list).getByText(document.original_filename)).toBeVisible();
    expect(within(list).getByText(document.title)).toBeVisible();
    expect(within(list).getByRole("button", { name: `Scarica ${document.title}` })).toBeVisible();
    expect(within(list).queryByRole("button", { name: /Visualizza|Condividi/ })).not.toBeInTheDocument();
    expect(within(list).queryByText("Condivisibile")).not.toBeInTheDocument();
  });

  it("applies folder/category filters together and removes only the chosen pill", async () => {
    mount(); await screen.findByRole("heading", { name: "Archivio contabile" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filtri" }));
    const dialog = screen.getByRole("dialog", { name: "Filtri archivio contabile" });
    const calls = mocks.archive.mock.calls.length;
    fireEvent.change(within(dialog).getByLabelText("Anno o cartella"), { target: { value: "11" } });
    fireEvent.change(within(dialog).getByLabelText("Categoria"), { target: { value: "22" } });
    expect(mocks.archive).toHaveBeenCalledTimes(calls);
    fireEvent.click(within(dialog).getByRole("button", { name: "Applica filtri" }));
    await waitFor(() => expect(mocks.archive).toHaveBeenLastCalledWith({ q: undefined, folderId: 11, categoryId: 22 }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi filtro cartella" }));
    await waitFor(() => expect(mocks.archive).toHaveBeenLastCalledWith({ q: undefined, folderId: undefined, categoryId: 22 }));
    expect(screen.getByRole("button", { name: "Rimuovi filtro categoria" })).toBeVisible();
  });

  it("preserves input focus during reload and ignores older search responses", async () => {
    mount(); await screen.findByRole("heading", { name: "Archivio contabile" });
    let finishOld!: (value: OrgAdminAccountingArchiveResponse) => void;
    let finishNew!: (value: OrgAdminAccountingArchiveResponse) => void;
    mocks.archive.mockImplementation(({ q }) => new Promise<OrgAdminAccountingArchiveResponse>(resolve => { if (q === "primo") finishOld = resolve; else finishNew = resolve; }));
    const input = screen.getByRole("searchbox", { name: "Cerca documenti contabili" });
    input.focus(); fireEvent.change(input, { target: { value: "primo" } });
    await waitFor(() => expect(mocks.archive).toHaveBeenLastCalledWith(expect.objectContaining({ q: "primo" })));
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "ultimo" } });
    await waitFor(() => expect(mocks.archive).toHaveBeenLastCalledWith(expect.objectContaining({ q: "ultimo" })));
    expect(input).toHaveFocus();
    await act(async () => finishNew(payload({ ...document, title: "Risultato più recente" })));
    expect(screen.getByRole("button", { name: "Risultato più recente" })).toBeVisible();
    await act(async () => finishOld(payload({ ...document, title: "Risultato vecchio" })));
    expect(screen.queryByText("Risultato vecchio")).not.toBeInTheDocument();
    expect(input).toHaveValue("ultimo");
    expect(input).toHaveFocus();
  });

  it("discards draft filters with Escape and returns focus to the trigger", async () => {
    mount(); await screen.findByRole("heading", { name: "Archivio contabile" });
    const trigger = screen.getByRole("button", { name: "Filtri" });
    trigger.focus(); fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText("Anno o cartella"), { target: { value: "11" } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByLabelText("Anno o cartella")).toHaveValue("");
  });

  it("does not load accounting documents when the association lacks permission", async () => {
    mocks.admin.organization.accounting_enabled = false;
    mount();
    expect(await screen.findByRole("heading", { name: "Panoramica associazione" })).toBeVisible();
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
