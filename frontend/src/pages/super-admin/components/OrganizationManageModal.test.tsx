import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../lib/api";
import OrganizationManageModal from "./OrganizationManageModal";

vi.mock("../../../lib/api", async original => ({
  ...await original<typeof import("../../../lib/api")>(),
  fetchOrgBatches: vi.fn(), patchOrgCardLot: vi.fn(), deleteOrgCardLot: vi.fn(),
}));

const closed: api.OrgBatch = {
  id: 10, start_no: 100, end_no: 199, next_no: 100, year: 2026,
  is_enabled: true, is_active: false, closed_by_year: true, status_label: "Chiuso per annualità",
  notes: "Acquisto conservato del 2026", total: 100, assigned: 0, remaining: 100, linked_members: 0,
  // Even a stale capability must not expose mutation controls for a closed year.
  range_editable: true, deletable: true,
};
const current: api.OrgBatch = { ...closed, id: 11, start_no: 200, end_no: 299, next_no: 200, year: 2027,
  is_active: true, closed_by_year: false, status_label: "Attivo", notes: null };

function show() {
  render(<OrganizationManageModal open modalType="view-batches" selectedOrg={{ id: 1, name: "Club collaudo" } as api.SuperAdminOrganization}
    onClose={vi.fn()} onSaved={vi.fn()} onSwitchToAddBatch={vi.fn()} />);
}

describe("Lotti annuali dell'associazione", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchOrgBatches).mockResolvedValue({ current_year: 2027, next_reset_at: "2028-01-01T00:00:00+01:00",
      batches: [closed, current], summary: { total: 200, assigned: 0, remaining: 100 } });
  });

  it("mostra i vecchi residui in sola lettura senza modifica, riattivazione o eliminazione", async () => {
    show();
    const row = (await screen.findByText("Acquisto conservato del 2026")).closest("tr")!;
    expect(within(row).getByText("2026")).toBeVisible();
    expect(within(row).getByText("Chiuso per annualità")).toBeVisible();
    expect(within(row).getByText("Storico, non utilizzabile")).toBeVisible();
    expect(within(row).getByText("Sola lettura")).toBeVisible();
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/Per il nuovo anno occorre un nuovo acquisto/)).toBeVisible();
    expect(api.patchOrgCardLot).not.toHaveBeenCalled();
    expect(api.deleteOrgCardLot).not.toHaveBeenCalled();
  });

  it("mantiene le azioni per il lotto corrente separato dallo storico", async () => {
    show();
    const row = (await screen.findByText("200 - 299")).closest("tr")!;
    expect(within(row).getByRole("button", { name: "Elimina" })).toBeEnabled();
    fireEvent.click(within(row).getByRole("button", { name: "Modifica" }));
    expect(screen.getByRole("heading", { name: /Modifica lotto/ })).toBeVisible();
    expect(screen.getByRole("option", { name: "Attivo" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("2027")).toBeDisabled();
    expect(api.patchOrgCardLot).not.toHaveBeenCalled();
  });

  it("non invia modifiche all'anno neanche per un lotto corrente mai utilizzato", async () => {
    vi.mocked(api.patchOrgCardLot).mockResolvedValue({ ok: true, item: { ...current, is_enabled: false } });
    show();
    const row = (await screen.findByText("200 - 299")).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Modifica" }));
    const year = screen.getByTitle("L'annualità di un lotto già creato non è modificabile");
    expect(year).toBeDisabled();
    expect(year).toHaveValue(2027);
    const status = screen.getByRole("option", { name: "Disattivo" }).closest("select")!;
    fireEvent.change(status, { target: { value: "inactive" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(api.patchOrgCardLot).toHaveBeenCalledExactlyOnceWith(1, 11, { status: "inactive" }));
  });
});
