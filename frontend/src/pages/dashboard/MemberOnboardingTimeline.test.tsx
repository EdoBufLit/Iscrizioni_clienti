import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "../../lib/api";
import MemberOnboardingTimeline from "./MemberOnboardingTimeline";

vi.mock("../../lib/api", () => ({ fetchMemberDocuments: vi.fn() }));
const member = { id: 1, status: "pending_docs" } as api.MemberProfile;
beforeEach(() => vi.resetAllMocks());
it("mostra l'azione mancante per un documento rigettato", async () => {
  vi.mocked(api.fetchMemberDocuments).mockResolvedValue({ required_types: ["identity"], items: [{ id: 1, type: "identity", status: "rejected" }] } as api.MemberDocumentsResponse);
  render(<MemoryRouter><MemberOnboardingTimeline user={member} /></MemoryRouter>);
  expect(await screen.findByRole("link", { name: /Carica i documenti richiesti/ })).toHaveAttribute("href", "/dashboard/documenti");
  expect(screen.getByText("2. Documenti caricati").closest("li")).toHaveAttribute("aria-current", "step");
});
it("distingue documenti ricevuti da approvazione del circolo", async () => {
  vi.mocked(api.fetchMemberDocuments).mockResolvedValue({ required_types: ["identity"], items: [{ id: 2, type: "identity", status: "pending", uploaded_at: "2026-11-04" }, { id: 1, type: "identity", status: "rejected", uploaded_at: "2026-11-03" }] } as api.MemberDocumentsResponse);
  render(<MemoryRouter><MemberOnboardingTimeline user={member} /></MemoryRouter>);
  expect(await screen.findByText("Documentazione ricevuta dall'associazione.")).toBeVisible();
  expect(screen.getByText("3. Approvazione del circolo").closest("li")).toHaveAttribute("aria-current", "step");
});
