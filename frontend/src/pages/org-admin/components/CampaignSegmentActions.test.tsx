import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CampaignSegmentActions, { CAMPAIGN_SEGMENT_KEY } from "./CampaignSegmentActions";
const toast = vi.hoisted(() => vi.fn());
vi.mock("../OrgAdminLayout", () => ({ useOrgAdmin: () => ({ admin: { id: 7, org_id: 3 } }) }));
vi.mock("../../../components/ui/ToastProvider", () => ({ useToast: () => ({ showToast: toast }) }));
function Location() { return <span>{useLocation().pathname}</span>; }
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); toast.mockClear(); });
afterEach(cleanup);
it("trasferisce tutto il segmento paginato come selezione senza inviare messaggi", async () => {
  const load = vi.fn().mockResolvedValueOnce({ ids: [1, 2], total: 3 }).mockResolvedValueOnce({ ids: [3], total: 3 });
  render(<MemoryRouter><CampaignSegmentActions source="soci" query="status=expired" loadPage={load} /><Location /></MemoryRouter>);
  fireEvent.click(screen.getByText("Segmenti e campagne"));
  fireEvent.click(screen.getByRole("button", { name: "Crea campagna dai filtri" }));
  await screen.findByText("/org-admin/comunicazioni");
  expect(load.mock.calls).toEqual([[0], [2]]);
  expect(JSON.parse(sessionStorage.getItem(CAMPAIGN_SEGMENT_KEY)!)).toMatchObject({ ids: [1, 2, 3], orgId: 3, adminId: 7 });
});
it("non trasferisce una selezione parziale quando una pagina fallisce", async () => {
  const load = vi.fn().mockResolvedValueOnce({ ids: [1], total: 2 }).mockRejectedValueOnce(new Error("Errore rete"));
  render(<MemoryRouter><CampaignSegmentActions source="quote" query="status=due" loadPage={load} /></MemoryRouter>);
  fireEvent.click(screen.getByText("Segmenti e campagne"));
  fireEvent.click(screen.getByRole("button", { name: "Crea campagna dai filtri" }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ tone: "error", message: "Errore rete" }));
  expect(sessionStorage.getItem(CAMPAIGN_SEGMENT_KEY)).toBeNull();
});
