import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrgAdminMember, OrgAdminMembersResponse } from "../../lib/api";
import OrgAdminMembers from "./OrgAdminMembers";

const mocks = vi.hoisted(() => ({
  fetchMembers: vi.fn(),
  fetchMetrics: vi.fn(),
  fetchSettings: vi.fn(),
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
});
