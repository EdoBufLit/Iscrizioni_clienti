import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgAdminMembershipSettings } from "../../../lib/api";
import CreateMemberModal from "./CreateMemberModal";

const mocks = vi.hoisted(() => ({ create: vi.fn(), close: vi.fn(), created: vi.fn() }));
vi.mock("../../../lib/api", () => ({ createOrgAdminMember: (...args: unknown[]) => mocks.create(...args) }));

const created = { id: 47, first_name: "Mario", last_name: "Giordano", email_sent: false, email_status: "not_requested" };
const props = { open: true, onClose: mocks.close, onCreated: mocks.created };
function fillMember() {
  fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: " Mario " } });
  fireEvent.change(screen.getByLabelText("Cognome *"), { target: { value: " Giordano " } });
  fireEvent.change(screen.getByLabelText("Email (opzionale)"), { target: { value: "mario@example.test" } });
}
function form() { return screen.getByRole("button", { name: "Crea socio" }).closest("form")!; }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockReset().mockResolvedValue(created);
});
afterEach(() => vi.useRealTimers());

describe("Creazione manuale socio", () => {
  it.each([
    ["2026-07-22T22:30:00Z", "2026-07-23"],
    ["2026-10-28T23:30:00Z", "2026-10-29"],
  ])("usa il giorno italiano a mezzanotte: %s", (instant, expected) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(instant));
    render(<CreateMemberModal {...props} />);
    expect(screen.getByLabelText("Data iscrizione")).toHaveValue(expected);
    expect(screen.getByText("Il socio viene creato in attesa di approvazione.")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Invia email per completare l’iscrizione" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Invia email per completare l’iscrizione" })).toBeDisabled();
  });

  it("invia nome, email e data scelti richiedendo subito l'invito di completamento", async () => {
    render(<CreateMemberModal {...props} />);
    fillMember();
    fireEvent.change(screen.getByLabelText("Data iscrizione"), { target: { value: "2026-07-23" } });
    fireEvent.submit(form());
    await waitFor(() => expect(mocks.created).toHaveBeenCalledExactlyOnceWith(created));
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({
      first_name: "Mario", last_name: "Giordano", email: "mario@example.test", joined_at: "2026-07-23",
      is_manual: true, send_access_email: true,
    });
    expect(mocks.close).not.toHaveBeenCalled();
    expect(screen.queryByText(/Accesso inviato|Email inviata/i)).not.toBeInTheDocument();
  });

  it("blocca doppi submit e chiusura durante il salvataggio senza perdere il payload", async () => {
    let finish!: (value: typeof created) => void;
    mocks.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<CreateMemberModal {...props} />);
    fillMember();
    const createForm = form();
    fireEvent.submit(createForm);
    fireEvent.submit(createForm);
    const dialog = screen.getByRole("dialog", { name: "Aggiungi socio" });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Nome *")).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Salvataggio..." })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Chiudi finestra" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Annulla" }));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(dialog);
    expect(mocks.close).not.toHaveBeenCalled();
    await act(async () => finish(created));
    expect(mocks.created).toHaveBeenCalledExactlyOnceWith(created);
    await waitFor(() => expect(screen.getByRole("button", { name: "Crea socio" })).toBeEnabled());
  });

  it("conserva i dati dopo un errore e permette di correggere e riprovare", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Email già presente"));
    render(<CreateMemberModal {...props} />);
    fillMember();
    fireEvent.change(screen.getByLabelText("Data iscrizione"), { target: { value: "2026-07-23" } });
    fireEvent.submit(form());
    expect(await screen.findByRole("alert")).toHaveTextContent("Email già presente");
    expect(screen.getByLabelText("Nome *")).toHaveValue(" Mario ");
    expect(screen.getByLabelText("Email (opzionale)")).toHaveValue("mario@example.test");
    expect(screen.getByLabelText("Data iscrizione")).toHaveValue("2026-07-23");
    expect(mocks.created).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Email (opzionale)"), { target: { value: "mario.nuovo@example.test" } });
    fireEvent.submit(form());
    await waitFor(() => expect(mocks.created).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[1][0]).toEqual(expect.objectContaining({ email: "mario.nuovo@example.test", joined_at: "2026-07-23" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("consente un'iscrizione senza email senza tentare invii e permette di rinunciare all'invito", async () => {
    render(<CreateMemberModal {...props} />);
    fillMember();
    const invite = screen.getByRole("checkbox", { name: "Invia email per completare l’iscrizione" });
    fireEvent.click(invite);
    fireEvent.submit(form());
    await waitFor(() => expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ send_access_email: false })));
    fireEvent.change(screen.getByLabelText("Email (opzionale)"), { target: { value: "" } });
    expect(invite).toBeDisabled();
    fireEvent.submit(form());
    await waitFor(() => expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ send_access_email: false })));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("preserva le regole annuale/temporanea e l'importo configurato", async () => {
    const settings = {
      custom_membership_types_enabled: true, membership_fee_amount: 30, temporary_membership_fee_amount: 5,
    } as OrgAdminMembershipSettings;
    render(<CreateMemberModal {...props} membershipSettings={settings} />);
    fillMember();
    expect(screen.getByLabelText("Importo tessera")).toHaveValue(30);
    fireEvent.change(screen.getByLabelText("Tipo tessera"), { target: { value: "temporary" } });
    expect(screen.getByLabelText("Importo tessera")).toHaveValue(5);
    fireEvent.submit(form());
    await waitFor(() => expect(mocks.created).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ membership_type: "temporary", membership_fee_snapshot: 5 }));
  });

  it("riaprendo il modulo usa la nuova data italiana e riparte da un form vuoto", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T22:30:00Z"));
    const view = render(<CreateMemberModal {...props} />);
    fillMember();
    view.rerender(<CreateMemberModal {...props} open={false} />);
    vi.setSystemTime(new Date("2026-10-28T23:30:00Z"));
    view.rerender(<CreateMemberModal {...props} />);
    expect(screen.getByLabelText("Data iscrizione")).toHaveValue("2026-10-29");
    expect(screen.getByLabelText("Nome *")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
});
