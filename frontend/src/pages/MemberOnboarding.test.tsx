import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeMemberOnboarding, establishMemberOnboardingSession, fetchMemberOnboarding,
  MemberOnboardingError, type MemberOnboardingContext,
} from "../lib/api";
import MemberOnboarding from "./MemberOnboarding";

vi.mock("../lib/api", async original => ({
  ...await original<typeof import("../lib/api")>(),
  establishMemberOnboardingSession: vi.fn(), fetchMemberOnboarding: vi.fn(), completeMemberOnboarding: vi.fn(),
}));

const initial: MemberOnboardingContext = {
  member: { display_name: "Anna Collaudo", email: "anna@example.test", has_password: false, is_active: false, status: "pending_docs" },
  organization: { name: "Club Collaudo", require_identity_document: true }, documents: [], completed: false, session_expires_in_seconds: 3600,
};
function completed(changes: Partial<MemberOnboardingContext> = {}): MemberOnboardingContext & { ok: boolean } {
  return { ...initial, ...changes, member: { ...initial.member, has_password: true, ...changes.member },
    completed: true, ok: true, documents: [{ id: 4, type: "identity", filename: "identita.pdf", status: "pending", rejection_note: null }] };
}
function mount(strict = false) {
  const page = <MemoryRouter><MemberOnboarding /></MemoryRouter>;
  return render(strict ? <StrictMode>{page}</StrictMode> : page);
}
async function ready() { await screen.findByRole("heading", { name: "Completa la tua iscrizione" }); }
function fillPassword(password = "PasswordLocale123!", confirmation = password) {
  fireEvent.change(screen.getByLabelText("Nuova password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Conferma password"), { target: { value: confirmation } });
}
function uploadIdentity() {
  const file = new File(["%PDF synthetic"], "identita.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Documento di identità"), { target: { files: [file] } });
  return file;
}
function submit() { fireEvent.click(screen.getByRole("button", { name: "Completa iscrizione" })); }

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/completa-iscrizione");
  vi.mocked(establishMemberOnboardingSession).mockReset().mockResolvedValue(initial);
  vi.mocked(fetchMemberOnboarding).mockReset().mockResolvedValue(initial);
  vi.mocked(completeMemberOnboarding).mockReset().mockResolvedValue(completed());
});

describe("Completamento iscrizione limitato", () => {
  it("rimuove il fragment prima dell'exchange e condivide il bootstrap in StrictMode", async () => {
    window.history.replaceState({}, "", "/completa-iscrizione#token=synthetic-one-use");
    vi.mocked(establishMemberOnboardingSession).mockImplementation(async token => {
      expect(token).toBe("synthetic-one-use");
      expect(window.location.hash).toBe("");
      return initial;
    });
    mount(true); await ready();
    expect(establishMemberOnboardingSession).toHaveBeenCalledExactlyOnceWith("synthetic-one-use");
    expect(fetchMemberOnboarding).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent("synthetic-one-use");
    expect(screen.getByText("Anna Collaudo")).toBeInTheDocument();
  });

  it("riprende la sessione senza token e mostra il documento rigettato senza richiedere di nuovo la password", async () => {
    vi.mocked(fetchMemberOnboarding).mockResolvedValue({ ...initial, member: { ...initial.member, has_password: true },
      documents: [{ id: 3, type: "identity", filename: "vecchio.pdf", status: "rejected", rejection_note: "Immagine non leggibile" }] });
    mount(); await ready();
    expect(fetchMemberOnboarding).toHaveBeenCalledOnce();
    expect(establishMemberOnboardingSession).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nuova password")).not.toBeInTheDocument();
    expect(screen.getByText("Password già impostata")).toBeInTheDocument();
    expect(screen.getByText(/Immagine non leggibile/)).toBeInTheDocument();
    const file = uploadIdentity(); submit();
    await waitFor(() => expect(completeMemberOnboarding).toHaveBeenCalledWith({ identityDocument: file, fiscalCodeDocument: null }));
  });

  it("invia password e documenti nello stesso completamento e resta in attesa senza aprire la dashboard", async () => {
    mount(); await ready(); fillPassword();
    const identity = uploadIdentity();
    const fiscal = new File(["%PDF synthetic fiscal"], "codice-fiscale.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Documento del codice fiscale (facoltativo)"), { target: { files: [fiscal] } });
    submit();
    await waitFor(() => expect(completeMemberOnboarding).toHaveBeenCalledExactlyOnceWith({ newPassword: "PasswordLocale123!", identityDocument: identity, fiscalCodeDocument: fiscal }));
    expect(await screen.findByRole("heading", { name: "Completamento ricevuto" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("In attesa di verifica e attivazione");
    expect(screen.queryByRole("link", { name: "Accedi" })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/dashboard"]')).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nuova password")).not.toBeInTheDocument();
  });

  it("valida lunghezza, conferma e documento richiesto prima di salvare", async () => {
    mount(); await ready(); fillPassword("breve"); submit();
    expect(screen.getByRole("alert")).toHaveTextContent("almeno 8 caratteri");
    expect(screen.getByLabelText("Nuova password")).toHaveFocus();
    fillPassword("PasswordLocale123!", "AltraPassword123!"); submit();
    expect(screen.getByRole("alert")).toHaveTextContent("non coincidono");
    expect(screen.getByLabelText("Conferma password")).toHaveFocus();
    fillPassword(); submit();
    expect(screen.getByRole("alert")).toHaveTextContent("documento di identità richiesto");
    expect(screen.getByLabelText("Documento di identità")).toHaveFocus();
    expect(completeMemberOnboarding).not.toHaveBeenCalled();
  });

  it("rifiuta un formato non supportato e conserva la protezione lato form", async () => {
    mount(); await ready(); fillPassword();
    const file = new File(["not a document"], "script.exe", { type: "application/octet-stream" });
    fireEvent.change(screen.getByLabelText("Documento di identità"), { target: { files: [file] } });
    expect(screen.getByRole("alert")).toHaveTextContent("Formato non supportato");
    expect(screen.getByLabelText("Documento di identità")).toHaveAttribute("aria-invalid", "true");
    expect(completeMemberOnboarding).not.toHaveBeenCalled();
  });

  it("non impone allegati quando l'associazione non richiede il documento", async () => {
    vi.mocked(fetchMemberOnboarding).mockResolvedValue({ ...initial, organization: { ...initial.organization, require_identity_document: false } });
    mount(); await ready(); fillPassword();
    expect(screen.getByLabelText("Documento di identità (facoltativo)")).not.toBeRequired();
    submit();
    await waitFor(() => expect(completeMemberOnboarding).toHaveBeenCalledWith({ newPassword: "PasswordLocale123!", identityDocument: null, fiscalCodeDocument: null }));
  });

  it("mantiene i documenti già ricevuti in sola lettura mentre imposta la password iniziale", async () => {
    vi.mocked(fetchMemberOnboarding).mockResolvedValue({ ...initial,
      documents: [{ id: 4, type: "identity", filename: "già-approvato.pdf", status: "approved", rejection_note: null }] });
    mount(); await ready(); fillPassword();
    expect(screen.getByText("Approvato")).toBeInTheDocument();
    expect(screen.queryByLabelText("Documento di identità")).not.toBeInTheDocument();
    submit();
    await waitFor(() => expect(completeMemberOnboarding).toHaveBeenCalledWith(expect.objectContaining({ newPassword: "PasswordLocale123!", identityDocument: null })));
  });

  it("blocca due invii ravvicinati senza salvare due volte", async () => {
    let finish!: (value: ReturnType<typeof completed>) => void;
    vi.mocked(completeMemberOnboarding).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    mount(); await ready(); fillPassword(); uploadIdentity();
    const form = screen.getByRole("button", { name: "Completa iscrizione" }).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(completeMemberOnboarding).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Invio in corso…" })).toBeDisabled();
    await act(async () => finish(completed()));
    expect(await screen.findByRole("heading", { name: "Completamento ricevuto" })).toBeInTheDocument();
  });

  it("gestisce invito scaduto e retry della sessione senza ripetere il token consumato", async () => {
    window.history.replaceState({}, "", "/completa-iscrizione#token=synthetic-expired");
    vi.mocked(establishMemberOnboardingSession).mockRejectedValueOnce(new MemberOnboardingError("Il link è scaduto.", 401));
    mount();
    expect(await screen.findByRole("heading", { name: "Invito non disponibile" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Il link è scaduto.");
    expect(window.location.hash).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Riprova la sessione" }));
    await ready();
    expect(fetchMemberOnboarding).toHaveBeenCalledOnce();
    expect(establishMemberOnboardingSession).toHaveBeenCalledOnce();
  });

  it("recupera l'esito salvato dopo una risposta persa senza ripetere il POST", async () => {
    vi.mocked(completeMemberOnboarding).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.mocked(fetchMemberOnboarding).mockResolvedValueOnce(initial).mockResolvedValueOnce(completed());
    mount(); await ready(); fillPassword(); uploadIdentity(); submit();
    expect(await screen.findByRole("heading", { name: "Completamento ricevuto" })).toBeInTheDocument();
    expect(completeMemberOnboarding).toHaveBeenCalledOnce();
    expect(fetchMemberOnboarding).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mostra errori server conservando i dati inseriti quando la pratica non è completa", async () => {
    vi.mocked(completeMemberOnboarding).mockRejectedValueOnce(new MemberOnboardingError("Documento non leggibile.", 400));
    mount(); await ready(); fillPassword(); uploadIdentity(); submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Documento non leggibile.");
    expect(screen.getByLabelText("Nuova password")).toHaveValue("PasswordLocale123!");
    expect(screen.getByRole("button", { name: "Completa iscrizione" })).toBeEnabled();
  });

  it("offre il normale login soltanto quando il contesto è già attivo", async () => {
    vi.mocked(fetchMemberOnboarding).mockResolvedValue(completed({ member: { ...initial.member, has_password: true, is_active: true, status: "active" } }));
    mount();
    expect(await screen.findByRole("heading", { name: "Iscrizione attiva" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Accedi" })).toHaveAttribute("href", "/login");
    expect(completeMemberOnboarding).not.toHaveBeenCalled();
  });

  it("permette di gestire un documento facoltativo rigettato anche dopo il completamento senza cambiare password", async () => {
    const context: MemberOnboardingContext = { ...initial, completed: true,
      member: { ...initial.member, has_password: true }, organization: { ...initial.organization, require_identity_document: false },
      documents: [{ id: 3, type: "identity", filename: "vecchio.pdf", status: "rejected", rejection_note: "Carica un'immagine leggibile" }] };
    vi.mocked(fetchMemberOnboarding).mockResolvedValue(context);
    mount();
    expect(await screen.findByRole("heading", { name: "Completamento ricevuto" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gestisci documenti" }));
    expect(screen.getByRole("heading", { name: "Gestisci i documenti" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Nuova password")).not.toBeInTheDocument();
    expect(screen.getByText("Password già impostata")).toBeInTheDocument();
    expect(screen.getByText(/Carica un'immagine leggibile/)).toBeInTheDocument();
    const file = new File(["%PDF optional"], "corretto.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Documento di identità (facoltativo)"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Invia documenti" }));
    await waitFor(() => expect(completeMemberOnboarding).toHaveBeenCalledExactlyOnceWith({ identityDocument: file, fiscalCodeDocument: null }));
    expect(await screen.findByRole("heading", { name: "Completamento ricevuto" })).toBeInTheDocument();
  });

  it("non interpreta completed già vero come prova di un caricamento facoltativo riuscito", async () => {
    const context: MemberOnboardingContext = { ...initial, completed: true,
      member: { ...initial.member, has_password: true }, organization: { ...initial.organization, require_identity_document: false },
      documents: [{ id: 3, type: "identity", filename: "vecchio.pdf", status: "rejected", rejection_note: "File incompleto" }] };
    vi.mocked(fetchMemberOnboarding).mockResolvedValue(context);
    vi.mocked(completeMemberOnboarding).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    mount(); await screen.findByRole("heading", { name: "Completamento ricevuto" });
    fireEvent.click(screen.getByRole("button", { name: "Gestisci documenti" }));
    fireEvent.change(screen.getByLabelText("Documento di identità (facoltativo)"), { target: { files: [new File(["%PDF optional"], "corretto.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Invia documenti" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connessione interrotta");
    expect(screen.getByRole("heading", { name: "Gestisci i documenti" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Completamento ricevuto" })).not.toBeInTheDocument();
  });

  it("mostra i documenti ricevuti in sola lettura e consente il ritorno allo stato", async () => {
    vi.mocked(fetchMemberOnboarding).mockResolvedValue({ ...initial, completed: true, member: { ...initial.member, has_password: true },
      documents: [
        { id: 4, type: "identity", filename: "identita.pdf", status: "pending", rejection_note: null },
        { id: 5, type: "fiscal_code", filename: "fiscale.pdf", status: "approved", rejection_note: null },
      ] });
    mount(); await screen.findByRole("heading", { name: "Completamento ricevuto" });
    fireEvent.click(screen.getByRole("button", { name: "Gestisci documenti" }));
    expect(screen.getByText("In verifica")).toBeInTheDocument();
    expect(screen.getByText("Approvato")).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invia documenti" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Torna allo stato iscrizione" }));
    expect(screen.getByRole("heading", { name: "Completamento ricevuto" })).toBeInTheDocument();
    expect(completeMemberOnboarding).not.toHaveBeenCalled();
  });
});
