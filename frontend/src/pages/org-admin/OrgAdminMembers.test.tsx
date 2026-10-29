import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrgAdminMember, OrgAdminMembersResponse } from "../../lib/api";
import OrgAdminMembers from "./OrgAdminMembers";

const mocks = vi.hoisted(() => ({
  fetchMembers: vi.fn(),
  fetchMetrics: vi.fn(),
  fetchSettings: vi.fn(),
  showToast: vi.fn(),
  admin: { organization: { name: "Club Futura", slug: "club-futura" } },
}));

vi.mock("../../lib/api", () => ({
  AuthError: class AuthError extends Error {},
  fetchOrgAdminMembers: (...args: unknown[]) => mocks.fetchMembers(...args),
  fetchOrgAdminMetrics: () => mocks.fetchMetrics(),
  fetchOrgAdminMembershipSettings: () => mocks.fetchSettings(),
}));

vi.mock("./OrgAdminLayout", () => ({
  useOrgAdmin: () => ({ admin: mocks.admin, loading: false }),
}));

vi.mock("../../components/ui/ToastProvider", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));

vi.mock("./components/CreateMemberModal", () => ({ default: () => null }));
vi.mock("./components/MemberImportModal", () => ({ default: () => null }));

function member(id: number, name: string, match: "exact" | "similar"): OrgAdminMember {
  return {
    id,
    name,
    email: `${name.toLowerCase().replace(/ /g, ".")}@example.com`,
    search_match: match,
    status: "ACTIVE",
    is_active: true,
    deleted_at: null,
    card_no: id,
    card_number: id,
    joined_at: "2026-09-01T10:00:00Z",
    docs_count: 0,
  };
}

function response(...items: OrgAdminMember[]): OrgAdminMembersResponse {
  return { items, total: items.length };
}

function deferredResponse() {
  let resolve!: (value: OrgAdminMembersResponse) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<OrgAdminMembersResponse>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function renderMembers() {
  render(
    <MemoryRouter initialEntries={["/org-admin/soci"]}>
      <OrgAdminMembers />
    </MemoryRouter>,
  );
  await screen.findByText("Nessun risultato");
}

async function searchFor(value: string) {
  fireEvent.change(screen.getByRole("searchbox", { name: "Cerca soci" }), { target: { value } });
  await waitFor(() => expect(mocks.fetchMembers).toHaveBeenCalledWith(expect.objectContaining({ q: value })));
}

describe("OrgAdminMembers search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchMembers.mockReset().mockResolvedValue(response());
    mocks.fetchMetrics.mockResolvedValue(null);
    mocks.fetchSettings.mockResolvedValue(null);
  });

  it("uses global renewal metrics and does not display invented growth", async () => {
    mocks.fetchMetrics.mockResolvedValue({ active_members_count: 120, expiring_members_count: 88,
      pending_requests_count: 3, documents_pending_review: 2 });
    await renderMembers();
    expect(screen.getAllByText("88")).toHaveLength(2);
    expect(screen.queryByText("+3% questo mese")).not.toBeInTheDocument();
    expect(screen.getByText("Documenti da verificare")).toBeInTheDocument();
  });

  it("indica i risultati simili su desktop e mobile mantenendo visibile l'email registrata", async () => {
    await renderMembers();
    mocks.fetchMembers.mockResolvedValue(
      response(member(1, "Mario Rossi", "exact"), member(2, "Mariu Rossi", "similar")),
    );

    await searchFor("mario.rossi");

    const exactRow = await screen.findByRole("row", { name: /Mario Rossi/ });
    const similarRow = screen.getByRole("row", { name: /Mariu Rossi/ });
    expect(within(exactRow).queryByText("Corrispondenza simile")).not.toBeInTheDocument();
    expect(within(similarRow).getByText("Corrispondenza simile")).toBeInTheDocument();
    expect(within(similarRow).getByText("mariu.rossi@example.com")).toBeInTheDocument();
    const mobileCard = screen.getByRole("heading", { name: "Mariu Rossi" }).closest("article")!;
    expect(within(mobileCard).getByText("Corrispondenza simile")).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveAccessibleDescription(/piccoli errori di scrittura/);

    fireEvent.click(similarRow);
    expect(screen.getAllByText("Corrispondenza simile")).toHaveLength(3);
  });

  it.each(["success", "error"])("ignora una risposta obsoleta (%s) arrivata dopo quella aggiornata", async (outcome) => {
    await renderMembers();
    const older = deferredResponse();
    const current = deferredResponse();
    mocks.fetchMembers.mockReturnValueOnce(older.promise).mockReturnValueOnce(current.promise);

    await searchFor("mario");
    await searchFor("lucia");
    await act(async () => current.resolve(response(member(2, "Lucia Bianchi", "exact"))));
    expect(screen.getByRole("row", { name: /Lucia Bianchi/ })).toBeInTheDocument();

    await act(async () => {
      if (outcome === "success") older.resolve(response(member(1, "Mario Rossi", "similar")));
      else older.reject(new Error("Richiesta precedente fallita"));
    });

    expect(screen.getByRole("row", { name: /Lucia Bianchi/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Mario Rossi/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Impossibile caricare l'elenco dei soci")).not.toBeInTheDocument();
  });

  it("non termina il caricamento della ricerca nuova quando termina una richiesta precedente", async () => {
    await renderMembers();
    const older = deferredResponse();
    const current = deferredResponse();
    mocks.fetchMembers.mockReturnValueOnce(older.promise).mockReturnValueOnce(current.promise);

    await searchFor("mario");
    await searchFor("lucia");
    await act(async () => older.resolve(response(member(1, "Mario Rossi", "similar"))));

    expect(screen.queryByRole("row", { name: /Mario Rossi/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Nessuna corrispondenza/)).not.toBeInTheDocument();

    await act(async () => current.resolve(response(member(2, "Lucia Bianchi", "exact"))));
    expect(screen.getByRole("row", { name: /Lucia Bianchi/ })).toBeInTheDocument();
  });

  it("filtra la lista con i Quick Chips mobile e mostra le pill dei filtri avanzati dal Bottom Sheet", async () => {
    mocks.fetchMetrics.mockResolvedValue({
      active_members_count: 3,
      expiring_members_count: 0,
      pending_requests_count: 0,
      documents_pending_review: 2,
      members_to_review_count: 2,
    });
    mocks.fetchMembers.mockResolvedValue(
      response(
        { ...member(1, "Mario Rossi", "exact"), docs_count: 1, document_status: "approved", is_paid: true },
        { ...member(2, "Laura Bianchi", "exact"), docs_count: 1, document_status: "pending", is_paid: false, membership_fee_snapshot: 25 },
      ),
    );

    render(
      <MemoryRouter initialEntries={["/org-admin/soci"]}>
        <OrgAdminMembers />
      </MemoryRouter>,
    );

    const activeRow = await screen.findByTestId("member-mobile-row-1");
    expect(within(activeRow).queryByText("Attivo")).not.toBeInTheDocument();

    const mobileRow = await screen.findByTestId("member-mobile-row-2");
    expect(within(mobileRow).getByText("#2")).toBeInTheDocument();
    expect(within(mobileRow).getByText("Doc in verifica")).toBeInTheDocument();
    expect(within(mobileRow).queryByText("Quota da verificare")).not.toBeInTheDocument();

    const quickGroup = screen.getByRole("group", { name: "Filtri rapidi stato soci" });
    fireEvent.click(within(quickGroup).getByRole("button", { name: /Da verificare/ }));
    await waitFor(() =>
      expect(mocks.fetchMembers).toHaveBeenCalledWith(expect.objectContaining({ status: "review", docs: undefined })),
    );

    fireEvent.click(screen.getByRole("button", { name: /Filtri/ }));
    const sheet = await screen.findByRole("dialog", { name: "Filtri e ordinamento" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Con accesso" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Cognome A-Z" }));

    await waitFor(() =>
      expect(mocks.fetchMembers).toHaveBeenCalledWith(
        expect.objectContaining({ access: "with", order: "last_name_asc" }),
      ),
    );

    fireEvent.click(within(sheet).getByRole("button", { name: /Mostra 2 soci/ }));
    expect(screen.queryByRole("dialog", { name: "Filtri e ordinamento" })).not.toBeInTheDocument();

    const removeAccessPill = screen.getByRole("button", { name: "Rimuovi filtro Accesso: Con accesso" });
    fireEvent.click(removeAccessPill);
    await waitFor(() =>
      expect(mocks.fetchMembers).toHaveBeenCalledWith(expect.objectContaining({ access: undefined })),
    );

    fireEvent.click(screen.getByRole("button", { name: "Azioni secondarie" }));
    const actionsSheet = await screen.findByRole("dialog", { name: "Azioni secondarie soci" });
    expect(within(actionsSheet).getByRole("button", { name: "Importa CSV" })).toBeInTheDocument();
    expect(within(actionsSheet).getByRole("link", { name: "Esporta Excel" })).toHaveAttribute(
      "href",
      "/api/org-admin/members.xlsx",
    );
  });

  it("uses the real expiring filter and does not invent missing documents or debt badges", async () => {
    mocks.fetchMetrics.mockResolvedValue({ active_members_count: 2, expiring_members_count: 1, members_to_review_count: 0 });
    mocks.fetchMembers.mockResolvedValue(response({ ...member(1, "Anna Gratis", "exact"), is_paid: false, membership_fee_snapshot: 0 }));
    render(<MemoryRouter><OrgAdminMembers /></MemoryRouter>);
    const row = await screen.findByTestId("member-mobile-row-1");
    expect(within(row).queryByText(/Doc mancanti|Non pagato|Quota da verificare/)).not.toBeInTheDocument();
    const quickGroup = screen.getByRole("group", { name: "Filtri rapidi stato soci" });
    fireEvent.click(within(quickGroup).getByRole("button", { name: /In scadenza/ }));
    await waitFor(() => expect(mocks.fetchMembers).toHaveBeenLastCalledWith(expect.objectContaining({ status: "expiring" })));
  });

  it("locks the background while the filter sheet is open and closes it with Escape", async () => {
    await renderMembers();
    const trigger = screen.getByRole("button", { name: /Filtri/ });
    trigger.focus();
    fireEvent.click(trigger);
    const sheet = await screen.findByRole("dialog", { name: "Filtri e ordinamento" });
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(sheet).not.toBeInTheDocument());
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(trigger).toHaveFocus();
  });
});
