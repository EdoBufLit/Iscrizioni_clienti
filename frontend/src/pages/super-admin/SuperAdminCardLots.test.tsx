import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../lib/api";
import SuperAdminCardLots from "./SuperAdminCardLots";

vi.mock("../../lib/api", async (original) => ({
  ...await original<typeof import("../../lib/api")>(),
  fetchCardLotRegistry: vi.fn(), fetchSuperAdminOrganizations: vi.fn(),
  previewAutomaticCardLot: vi.fn(), createAutomaticCardLot: vi.fn(), stepUpSuperAdmin: vi.fn(),
}));

const row = {
  id: 1, batch_id: 1, organization_id: 1, organization_name: "Club esistente",
  numbering_scope_id: 1, numbering_scope_name: "ASSONAM_CENTRAL", year: 2026,
  range_start: 100, range_end: 199, range_start_label: "100", range_end_label: "199",
  quantity: 100, status_label: "Attivo", next_no: 200,
  assigned: 60, reserved: 5, remaining: 35,
  recharge_request_id: null, created_at: null, released_at: null, notes: null,
} satisfies api.CardLotRegistryItem;
const organizations = [
  { id: 1, name: "Club esistente", numbering_mode: "shared_assonam" },
  { id: 2, name: "Associazione senza lotti", numbering_mode: "dedicated" },
] as api.SuperAdminOrganization[];
const newRow = { ...row, id: 2, batch_id: 2, organization_id: 2, organization_name: "Associazione senza lotti",
  range_start: 401, range_end: 700, range_start_label: "401", range_end_label: "700", quantity: 300,
  next_no: 401, assigned: 0, reserved: 0, remaining: 300 };

function showPage() {
  render(<MemoryRouter><Routes><Route element={<Outlet context={{ profile: { id: 1 } }} />}>
    <Route index element={<SuperAdminCardLots />} />
  </Route></Routes></MemoryRouter>);
}

async function openAndSelect() {
  fireEvent.click(await screen.findByRole("button", { name: "Nuovo lotto" }));
  await screen.findByRole("option", { name: "Associazione senza lotti" });
  fireEvent.change(screen.getByLabelText("Associazione"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Numero di tessere"), { target: { value: "300" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Crea lotto" })).toBeEnabled());
}

describe("Registro lotti automatici", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchCardLotRegistry).mockResolvedValue({ items: [row], total: 1 });
    vi.mocked(api.fetchSuperAdminOrganizations).mockResolvedValue({ items: organizations, page: 1, page_size: 100, total: 2, total_pages: 1 });
    vi.mocked(api.previewAutomaticCardLot).mockImplementation(async (organization_id, quantity) => ({
      organization_id, organization_name: organizations.find((org) => org.id === organization_id)!.name,
      quantity, year: 2026, numbering_scope_id: 2, numbering_scope_name: "ORG_2",
      range_start: 201, range_end: 200 + quantity, range_start_label: "201", range_end_label: String(200 + quantity),
    }));
    vi.mocked(api.createAutomaticCardLot).mockResolvedValue({ ok: true, item: newRow, reused: false });
    vi.mocked(api.stepUpSuperAdmin).mockResolvedValue();
  });

  it("mostra disponibilità e prenotazioni reali anche con next_no oltre fine", async () => {
    showPage();
    expect(await screen.findByText("35 disponibili")).toBeInTheDocument();
    expect(screen.getByText("5 prenotate")).toBeInTheDocument();
  });

  it("crea anche per un'associazione senza lotti e mostra l'intervallo definitivo del server", async () => {
    showPage();
    await openAndSelect();
    const dialog = screen.getByRole("dialog", { name: "Nuovo lotto" });
    expect(within(dialog).getByText((_, element) => element?.tagName === "P" && element.textContent === "201 – 500")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crea lotto" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createAutomaticCardLot).toHaveBeenCalledWith({ organization_id: 2, quantity: 300, year: 2026, idempotency_key: expect.any(String) });
    expect(screen.getByRole("status")).toHaveTextContent("da 401 a 700");
    expect(screen.getByText("300 disponibili")).toBeInTheDocument();
  });

  it("conserva i dati e la stessa chiave quando ritenta dopo una risposta incerta", async () => {
    vi.mocked(api.createAutomaticCardLot).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    showPage();
    await openAndSelect();
    fireEvent.click(screen.getByRole("button", { name: "Crea lotto" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connessione interrotta");
    expect(screen.getByLabelText("Numero di tessere")).toHaveValue(300);
    expect(screen.getByLabelText("Associazione")).toHaveValue("2");
    fireEvent.click(screen.getByRole("button", { name: "Crea lotto" }));
    await waitFor(() => expect(api.createAutomaticCardLot).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.createAutomaticCardLot).mock.calls[0][0]).toEqual(vi.mocked(api.createAutomaticCardLot).mock.calls[1][0]);
  });

  it("blocca doppio invio e quantità non valide", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof api.createAutomaticCardLot>>) => void;
    vi.mocked(api.createAutomaticCardLot).mockImplementation(() => new Promise((done) => { resolve = done; }));
    showPage();
    await openAndSelect();
    fireEvent.change(screen.getByLabelText("Numero di tessere"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Crea lotto" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Numero di tessere"), { target: { value: "300" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Crea lotto" })).toBeEnabled());
    const button = screen.getByRole("button", { name: "Crea lotto" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.createAutomaticCardLot).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Annulla" })).toBeDisabled();
    resolve({ ok: true, item: newRow, reused: false });
    await screen.findByRole("status");
  });

  it("richiede MFA solo quando necessario e poi riprende la creazione", async () => {
    vi.mocked(api.createAutomaticCardLot).mockRejectedValueOnce(new api.CardLotStepUpRequiredError("Conferma il codice di autenticazione"));
    showPage();
    await openAndSelect();
    fireEvent.click(screen.getByRole("button", { name: "Crea lotto" }));
    fireEvent.change(await screen.findByLabelText("Codice di autenticazione"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verifica e crea lotto" }));
    await screen.findByRole("status");
    expect(api.stepUpSuperAdmin).toHaveBeenCalledWith("123456");
    expect(api.createAutomaticCardLot).toHaveBeenCalledTimes(2);
  });
});
