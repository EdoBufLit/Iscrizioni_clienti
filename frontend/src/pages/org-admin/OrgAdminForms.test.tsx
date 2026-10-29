import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/ui/ToastProvider";
import type { AssociationFormSummary } from "../../lib/api";
import { OrgAdminFormsWorkspace } from "./OrgAdminForms";

const mocks = vi.hoisted(() => ({
  summaries: vi.fn(), duplicate: vi.fn(), active: vi.fn(), remove: vi.fn(),
  detail: vi.fn(), create: vi.fn(), createField: vi.fn(), clipboard: vi.fn(),
  admin: { id: 1, organization: { slug: "club-collaudo", name: "Club Collaudo" } },
}));
vi.mock("../../lib/api", async original => ({
  ...await original<typeof import("../../lib/api")>(),
  fetchOrgAdminFormSummaries: (...args: unknown[]) => mocks.summaries(...args),
  duplicateOrgAdminForm: (...args: unknown[]) => mocks.duplicate(...args),
  setOrgAdminFormActive: (...args: unknown[]) => mocks.active(...args),
  deleteOrgAdminForm: (...args: unknown[]) => mocks.remove(...args),
  fetchOrgAdminForm: (...args: unknown[]) => mocks.detail(...args),
  createOrgAdminForm: (...args: unknown[]) => mocks.create(...args),
  createOrgAdminFormField: (...args: unknown[]) => mocks.createField(...args),
  fetchOrgAdminBookingEventSeries: async () => ({ items: [] }),
}));
vi.mock("./OrgAdminLayout", () => ({ useOrgAdmin: () => ({ admin: mocks.admin, loading: false }) }));
vi.mock("../../hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
vi.mock("../../components/ui/UnsavedChangesProvider", () => ({ useUnsavedChangesGuard: () => undefined }));
vi.mock("../../components/forms/builder/FormBuilder", () => ({ FormBuilder: () => <div>Builder</div> }));
vi.mock("../../components/forms/FormPublicCanvas", () => ({ FormPublicCanvas: () => <div>Anteprima</div> }));
vi.mock("../../components/forms/builder/ImageUpload", () => ({ ImageUpload: () => null }));

const first: AssociationFormSummary = {
  id: 10, title: "Iscrizione evento", public_slug: "evento", public_path: "/forms/club-collaudo/evento",
  form_type: "generic", is_active: true, booking_enabled: false,
  created_at: "2026-10-29T10:00:00", updated_at: null, field_count: 3, submission_count: 8,
  submission_status_counts: { total: 8, pending: 3, confirmed: 4, rejected: 1 }, booking_count: 0,
};
const second: AssociationFormSummary = { ...first, id: 20, title: "Richiesta informazioni", public_slug: "informazioni", public_path: "/forms/club-collaudo/informazioni", is_active: false };
const templates: [] = [];
function showPage(locked = false) {
  return render(<MemoryRouter><ToastProvider><OrgAdminFormsWorkspace availableTemplates={templates} locked={locked} /></ToastProvider></MemoryRouter>);
}
async function menu(title = first.title) {
  fireEvent.click(await screen.findByRole("button", { name: `Azioni per ${title}` }));
  return screen.getByRole("menu", { name: `Menu opzioni ${title}` });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.summaries.mockResolvedValue({ items: [first, second], total: 2 });
  mocks.duplicate.mockResolvedValue({ form: { ...first, id: 30, title: "Iscrizione evento (copia)", is_active: false } });
  mocks.active.mockResolvedValue({ form: { ...second, is_active: true } });
  mocks.remove.mockResolvedValue({ ok: true });
  mocks.clipboard.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.clipboard } });
});

describe("Form pubblici: azioni delle schede", () => {
  it("carica l'elenco una sola volta anche senza availableTemplates esplicito", async () => {
    render(<MemoryRouter><ToastProvider><OrgAdminFormsWorkspace /></ToastProvider></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: first.title })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: `Azioni per ${second.title}` })).toBeEnabled());
    expect(mocks.summaries).toHaveBeenCalledOnce();
  });

  it("duplica tramite l'endpoint atomico senza ricreare campi o aprire il builder", async () => {
    showPage();
    fireEvent.click(within(await menu()).getByRole("menuitem", { name: "Duplica" }));
    expect(await screen.findByText("Form duplicato")).toBeInTheDocument();
    expect(mocks.duplicate).toHaveBeenCalledExactlyOnceWith(10);
    expect(mocks.detail).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.createField).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.summaries).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("heading", { name: first.title })).toBeInTheDocument();
  });

  it("conserva l'esito della duplicazione se il successivo aggiornamento elenco fallisce", async () => {
    mocks.summaries.mockResolvedValueOnce({ items: [first, second], total: 2 }).mockRejectedValueOnce(new Error("Rete non disponibile"));
    showPage();
    fireEvent.click(within(await menu()).getByRole("menuitem", { name: "Duplica" }));
    expect(await screen.findByText("Operazione salvata")).toBeInTheDocument();
    expect(screen.queryByText("Duplicazione non riuscita")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: first.title })).toBeInTheDocument();
    expect(mocks.duplicate).toHaveBeenCalledOnce();
  });

  it("blocca altre mutazioni mentre una duplicazione è in corso", async () => {
    let done!: (value: { form: { title: string } }) => void;
    mocks.duplicate.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    showPage();
    fireEvent.click(within(await menu()).getByRole("menuitem", { name: "Duplica" }));
    expect(screen.getByRole("button", { name: `Azioni per ${second.title}` })).toBeDisabled();
    expect(mocks.duplicate).toHaveBeenCalledOnce();
    await act(async () => done({ form: { title: "Copia" } }));
    await waitFor(() => expect(screen.getByRole("button", { name: `Azioni per ${second.title}` })).toBeEnabled());
  });

  it("attiva la scheda scelta e aggiorna il badge senza ricaricare l'editor", async () => {
    showPage();
    fireEvent.click(within(await menu(second.title)).getByRole("menuitem", { name: "Attiva" }));
    expect(await screen.findByText("Form attivato")).toBeInTheDocument();
    expect(mocks.active).toHaveBeenCalledExactlyOnceWith(20, true);
    const card = screen.getByRole("heading", { name: second.title }).closest("article")!;
    expect(within(card).getByText("Attivo")).toBeInTheDocument();
    expect(mocks.detail).not.toHaveBeenCalled();
    expect(mocks.summaries).toHaveBeenCalledOnce();
  });

  it("disattiva un modulo pubblicato e conserva lo stato se la richiesta fallisce", async () => {
    mocks.active.mockRejectedValueOnce(new Error("Riprova più tardi"));
    showPage();
    fireEvent.click(within(await menu()).getByRole("menuitem", { name: "Disattiva" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Stato non aggiornato");
    expect(mocks.active).toHaveBeenCalledExactlyOnceWith(10, false);
    const card = screen.getByRole("heading", { name: first.title }).closest("article")!;
    expect(within(card).getByText("Attivo")).toBeInTheDocument();
  });

  it("il menu gestisce tastiera ed Escape riporta il focus al pulsante originario", async () => {
    showPage();
    const actions = await menu();
    const duplicate = within(actions).getByRole("menuitem", { name: "Duplica" });
    await waitFor(() => expect(duplicate).toHaveFocus());
    fireEvent.keyDown(duplicate, { key: "ArrowDown" });
    expect(within(actions).getByRole("menuitem", { name: "Disattiva" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(within(actions).getByRole("menuitem", { name: "Elimina" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: `Azioni per ${first.title}` })).toHaveFocus());
  });

  it("segnala Copiato solo dopo la risoluzione della clipboard e usa il percorso pubblico", async () => {
    let done!: () => void;
    mocks.clipboard.mockImplementationOnce(() => new Promise<void>(resolve => { done = resolve; }));
    showPage();
    fireEvent.click(await screen.findByRole("button", { name: `Copia link di ${first.title}` }));
    expect(mocks.clipboard).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}${first.public_path}`);
    expect(screen.queryByText("Link copiato")).not.toBeInTheDocument();
    await act(async () => done());
    expect(await screen.findByText("Link copiato")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Copia link di ${first.title}` })).toHaveTextContent("Copiato");
  });

  it("mostra l'errore della clipboard senza dare un falso successo", async () => {
    mocks.clipboard.mockRejectedValueOnce(new Error("Permesso negato"));
    showPage();
    fireEvent.click(await screen.findByRole("button", { name: `Copia link di ${second.title}` }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Copia non riuscita");
    expect(screen.queryByText("Link copiato")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Copia link di ${second.title}` })).toHaveTextContent("Copia");
  });

  it("se la clipboard non è disponibile mostra istruzioni senza dichiarare una copia riuscita", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    showPage();
    fireEvent.click(await screen.findByRole("button", { name: `Copia link di ${first.title}` }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Copia automatica non disponibile");
    expect(screen.queryByText("Link copiato")).not.toBeInTheDocument();
  });

  it("la conferma di eliminazione mostra il modulo scelto e annullare non chiama l'API", async () => {
    showPage();
    fireEvent.click(within(await menu(second.title)).getByRole("menuitem", { name: "Elimina" }));
    const dialog = screen.getByRole("dialog", { name: "Eliminare questo modulo?" });
    expect(within(dialog).getByText(second.title)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Elimina modulo" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Annulla" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("elimina solo il modulo confermato dopo la checkbox di sicurezza", async () => {
    showPage();
    fireEvent.click(within(await menu(second.title)).getByRole("menuitem", { name: "Elimina" }));
    const dialog = screen.getByRole("dialog", { name: "Eliminare questo modulo?" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Confermo l'eliminazione del modulo" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Elimina modulo" }));
    expect(await screen.findByText("Form eliminato")).toBeInTheDocument();
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(20);
  });

  it("una nuova eliminazione non eredita lo stato Completato da quella precedente", async () => {
    mocks.summaries.mockResolvedValueOnce({ items: [first, second], total: 2 })
      .mockResolvedValue({ items: [second], total: 1 });
    showPage();
    fireEvent.click(within(await menu()).getByRole("menuitem", { name: "Elimina" }));
    const firstDialog = screen.getByRole("dialog", { name: "Eliminare questo modulo?" });
    fireEvent.click(within(firstDialog).getByRole("checkbox", { name: "Confermo l'eliminazione del modulo" }));
    fireEvent.click(within(firstDialog).getByRole("button", { name: "Elimina modulo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(mocks.summaries).toHaveBeenCalledTimes(2));
    fireEvent.click(within(await menu(second.title)).getByRole("menuitem", { name: "Elimina" }));
    const secondDialog = screen.getByRole("dialog", { name: "Eliminare questo modulo?" });
    expect(within(secondDialog).getByRole("button", { name: "Elimina modulo" })).toBeDisabled();
    expect(within(secondDialog).queryByRole("button", { name: "Completato" })).not.toBeInTheDocument();
    expect(within(secondDialog).getByRole("checkbox", { name: "Confermo l'eliminazione del modulo" })).not.toBeChecked();
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(10);
  });

  it("con il modulo Comunicazioni bloccato non carica né modifica form", async () => {
    showPage(true);
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Azioni per/ })).not.toBeInTheDocument());
    expect(mocks.summaries).not.toHaveBeenCalled();
    expect(mocks.duplicate).not.toHaveBeenCalled();
    expect(mocks.active).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
