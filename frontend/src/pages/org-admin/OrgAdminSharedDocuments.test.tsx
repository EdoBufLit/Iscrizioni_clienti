import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrgAdminSharedDocuments from "./OrgAdminSharedDocuments";

const mocks = vi.hoisted(() => ({
  fetchDocs: vi.fn(),
  downloadDoc: vi.fn(),
  admin: {
    id: 1,
    email: "admin@club.it",
    org_id: 10,
    organization: { id: 10, name: "Golden Age Club", slug: "golden-age-club", accounting_enabled: true },
  },
}));

vi.mock("../../lib/api", () => ({
  AuthError: class AuthError extends Error {},
  fetchOrgAdminSharedDocuments: (...args: unknown[]) => mocks.fetchDocs(...args),
  downloadOrgAdminSharedDocument: (...args: unknown[]) => mocks.downloadDoc(...args),
}));

vi.mock("./OrgAdminLayout", () => ({
  useOrgAdmin: () => ({ admin: mocks.admin, loading: false }),
}));

const sampleDocuments = [
  {
    id: 1,
    title: "Convenzione Palestre 2026",
    description: "Accordo quadro per tutti i soci attivi.",
    kind: "general" as const,
    created_at: "2026-03-07T10:15:00Z",
    original_filename: "convenzione-2026.pdf",
    mime_type: "application/pdf",
    size_bytes: 245760,
    download_url: "/api/org-admin/shared-documents/1/download",
  },
  {
    id: 2,
    title: "Locandina Evento Primavera",
    description: null,
    kind: "general" as const,
    created_at: "2026-03-08T14:30:00Z",
    original_filename: "locandina-evento.png",
    mime_type: "image/png",
    size_bytes: 512000,
    download_url: "/api/org-admin/shared-documents/2/download",
  },
];

describe("OrgAdminSharedDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchDocs.mockResolvedValue({ items: sampleDocuments, total: 2 });
    mocks.downloadDoc.mockResolvedValue(undefined);
  });

  it("renders compact horizontal cards with file type badges, inline file metadata, and no filler description", async () => {
    render(
      <MemoryRouter initialEntries={["/org-admin/documenti"]}>
        <OrgAdminSharedDocuments />
      </MemoryRouter>,
    );

    const grid = await screen.findByTestId("shared-documents-grid");
    expect(within(grid).getByText("PDF")).toBeInTheDocument();
    expect(within(grid).getByText("IMG")).toBeInTheDocument();
    expect(within(grid).getByText("Convenzione Palestre 2026")).toBeInTheDocument();
    expect(within(grid).getByText("convenzione-2026.pdf")).toBeInTheDocument();
    expect(within(grid).getByText("240 KB")).toBeInTheDocument();
    expect(
      within(grid).queryByText("Documento caricato dal Super Admin senza descrizione aggiuntiva."),
    ).not.toBeInTheDocument();

    fireEvent.click(within(grid).getByRole("button", { name: "Scarica Convenzione Palestre 2026" }));
    await waitFor(() =>
      expect(mocks.downloadDoc).toHaveBeenCalledWith(expect.objectContaining({ id: 1 })),
    );
  });

  it("supports switching between Schede (grid) and Elenco (list/table) views and filtering by search", async () => {
    render(
      <MemoryRouter initialEntries={["/org-admin/documenti"]}>
        <OrgAdminSharedDocuments />
      </MemoryRouter>,
    );

    await screen.findByTestId("shared-documents-grid");

    fireEvent.click(screen.getByRole("button", { name: "Elenco" }));
    const listView = await screen.findByTestId("shared-documents-list");
    expect(within(listView).getAllByText("Convenzione Palestre 2026").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole("searchbox", { name: "Cerca documenti" }), {
      target: { value: "locandina" },
    });
    expect(within(listView).queryByText("Convenzione Palestre 2026")).not.toBeInTheDocument();
    expect(within(listView).getAllByText("Locandina Evento Primavera").length).toBeGreaterThan(0);
  });
});
