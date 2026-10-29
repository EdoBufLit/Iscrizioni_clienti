import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgAdminMember } from "../../lib/api";
import OrgAdminMembers from "./OrgAdminMembers";
import { ToastProvider } from "../../components/ui/ToastProvider";

const mocks = vi.hoisted(() => ({
  members: vi.fn(), metrics: vi.fn(), settings: vi.fn(), history: vi.fn(), preview: vi.fn(),
  execute: vi.fn(), retry: vi.fn(), read: vi.fn(), download: vi.fn(),
  admin: { id: 3, org_id: 7, organization: { name: "Club Collaudo", slug: "club-collaudo" } },
}));

vi.mock("../../lib/api", async original => ({
  ...await original<typeof import("../../lib/api")>(),
  fetchOrgAdminMembers: (...args: unknown[]) => mocks.members(...args),
  fetchOrgAdminMetrics: (...args: unknown[]) => mocks.metrics(...args),
  fetchOrgAdminMembershipSettings: (...args: unknown[]) => mocks.settings(...args),
}));
vi.mock("./OrgAdminLayout", () => ({ useOrgAdmin: () => ({ admin: mocks.admin, loading: false }) }));
vi.mock("./components/CreateMemberModal", () => ({ default: ({ open, onCreated }: { open: boolean; onCreated: (created: { id: number; first_name: string; last_name: string }) => void }) => open
  ? <button type="button" onClick={() => onCreated({ id: 77, first_name: "Anna", last_name: "Storica" })}>Completa inserimento sintetico</button>
  : null }));
vi.mock("./components/MemberImportModal", () => ({ default: () => null }));
vi.mock("../../lib/memberBulk", () => ({
  bulkRequestKey: () => "synthetic-key",
  previewMemberBulk: (...args: unknown[]) => mocks.preview(...args),
  fetchRecentMemberBulk: (...args: unknown[]) => mocks.history(...args),
  fetchMemberBulk: (...args: unknown[]) => mocks.read(...args),
  executeMemberBulk: (...args: unknown[]) => mocks.execute(...args),
  retryMemberBulk: (...args: unknown[]) => mocks.retry(...args),
  downloadMemberBulk: (...args: unknown[]) => mocks.download(...args),
}));

const firstMember: OrgAdminMember = {
  id: 1, name: "Mario Giordano", email: "mario@example.test", status: "ACTIVE", workflow_status: "active",
  is_active: true, deleted_at: null, card_no: 2, card_number: 2, card_year: 2026,
  joined_at: "2026-07-23", docs_count: 2, has_access: true, is_paid: true,
};
const secondMember: OrgAdminMember = { ...firstMember, id: 2, name: "Anna Rossi", email: "anna@example.test" };
let viewportWidth = 1366;
type MediaRecord = { mql: MediaQueryList; listeners: Set<(event: MediaQueryListEvent) => void> };
const mediaQueries = new Map<string, MediaRecord>();

function matches(query: string) {
  const min = /min-width:\s*(\d+)px/.exec(query);
  const max = /max-width:\s*(\d+)px/.exec(query);
  return Boolean(min || max) && (!min || viewportWidth >= Number(min[1])) && (!max || viewportWidth <= Number(max[1]));
}
function setViewport(width: number) {
  const previous = viewportWidth;
  viewportWidth = width;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  for (const [query, { listeners }] of mediaQueries) {
    viewportWidth = previous;
    const before = matches(query);
    viewportWidth = width;
    if (before !== matches(query)) {
      const event = { matches: matches(query), media: query } as MediaQueryListEvent;
      listeners.forEach(listener => listener(event));
    }
  }
}
function ProfileRoute() {
  const location = useLocation();
  return <><h1>Profilo completo</h1><p data-testid="profile-path">{location.pathname}</p><p data-testid="profile-state">{JSON.stringify(location.state)}</p></>;
}
function mount(url = "/org-admin/soci") {
  return render(<ToastProvider><MemoryRouter initialEntries={[url]}><Routes>
    <Route path="/org-admin/soci" element={<OrgAdminMembers />} />
    <Route path="/org-admin/soci/:id" element={<ProfileRoute />} />
  </Routes></MemoryRouter></ToastProvider>);
}
async function ready() {
  await screen.findByTestId("member-row-1");
  await waitFor(() => expect(screen.getByRole("button", { name: "Documenti da verificare: 2 soci" })).toBeEnabled());
}
async function showQuickProfile() {
  const row = screen.getByTestId("member-row-1");
  row.focus();
  fireEvent.keyDown(row, { key: "Enter" });
  return screen.findByRole("dialog", { name: "Profilo rapido" });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mediaQueries.clear();
  setViewport(1366);
  Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => {
    if (!mediaQueries.has(query)) {
      const listeners = new Set<(event: MediaQueryListEvent) => void>();
      const mql = {
        get matches() { return matches(query); }, media: query, onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
        addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
        removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
        dispatchEvent: () => true,
      } as MediaQueryList;
      mediaQueries.set(query, { mql, listeners });
    }
    return mediaQueries.get(query)!.mql;
  } });
  mocks.members.mockReset().mockResolvedValue({ items: [firstMember, secondMember], total: 52 });
  mocks.metrics.mockReset().mockResolvedValue({ active_members_count: 12, pending_requests_count: 3,
    documents_pending_review: 99, members_pending_documents_review_count: 2, members_to_review_count: 4, expiring_members_count: 1 });
  mocks.settings.mockReset().mockResolvedValue(null);
  mocks.history.mockReset().mockResolvedValue({ items: [], total: 0 });
});

describe("Soci desktop: scorciatoie e profilo contestuale", () => {
  it.each([
    ["Soci attivi: 12 soci", "active", undefined],
    ["Da approvare: 3 soci", "pending", undefined],
    ["Documenti da verificare: 2 soci", "review", "pending"],
    ["Rinnovi in scadenza: 1 soci", "expiring", undefined],
  ])("%s applica il criterio globale e rimuove ricerca/filtri incompatibili", async (name, status, docs) => {
    mount("/org-admin/soci?q=anna&access=without&source=online&docs=rejected&status=expired&order=last_name_desc&page=2");
    await ready();
    expect(mocks.members).toHaveBeenLastCalledWith(expect.objectContaining({ q: "anna", offset: 25 }));
    const kpi = screen.getByRole("button", { name });
    fireEvent.click(kpi);
    await waitFor(() => expect(mocks.members).toHaveBeenLastCalledWith({
      q: undefined, status, docs, access: undefined, source: undefined,
      order: "joined_at_desc", limit: 25, offset: 0,
    }));
    expect(screen.getByRole("searchbox", { name: "Cerca soci" })).toHaveValue("");
    expect(kpi).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("dialog", { name: "Profilo rapido" })).not.toBeInTheDocument();
  });

  it("usa il numero di soci con documenti da verificare invece del numero di file", async () => {
    mount(); await ready();
    const group = screen.getByRole("group", { name: "Scorciatoie elenco soci" });
    expect(within(group).getByRole("button", { name: "Documenti da verificare: 2 soci" })).toHaveTextContent("2");
    expect(within(group).queryByText("99")).not.toBeInTheDocument();
  });

  it.each(["Escape", "X"])("apre il drawer su portatile e lo chiude con %s ripristinando il focus", async closeMethod => {
    mount(); await ready();
    expect(screen.queryByRole("dialog", { name: "Profilo rapido" })).not.toBeInTheDocument();
    expect(document.querySelector(".org-admin-members-quick-profile")).not.toBeInTheDocument();
    const drawer = await showQuickProfile();
    expect(document.body.style.overflow).toBe("hidden");
    await waitFor(() => expect(within(drawer).getByRole("button", { name: "Chiudi finestra" })).toHaveFocus());
    if (closeMethod === "Escape") fireEvent.keyDown(window, { key: "Escape" });
    else fireEvent.click(within(drawer).getByRole("button", { name: "Chiudi finestra" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Profilo rapido" })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("member-row-1")).toHaveFocus());
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("mostra stato italiano, date e un export limitato al socio selezionato", async () => {
    mount(); await ready();
    const drawer = await showQuickProfile();
    expect(within(drawer).getByText("Attivo", { exact: true })).toBeInTheDocument();
    expect(within(drawer).queryByText("active", { exact: true })).not.toBeInTheDocument();
    expect(within(drawer).getByText("23/07/2026")).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "Esporta scheda socio" })).toHaveAttribute("href", "/api/org-admin/members.xlsx?member_id=1");
    expect(within(drawer).queryByRole("link", { name: "Esporta Excel" })).not.toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Vedi profilo completo" })).toBeInTheDocument();
  });

  it.each(["expired", "pending", "active"])("mostra Scaduto anche con workflow %s", async workflow => {
    mocks.members.mockResolvedValue({ items: [{ ...firstMember, status: "EXPIRED", workflow_status: workflow, is_active: false }], total: 1 });
    mount("/org-admin/soci?status=expired"); await ready();
    const drawer = await showQuickProfile();
    expect(within(drawer).getByText("Scaduto", { selector: ".org-status-chip" })).toBeInTheDocument();
    expect(within(drawer).queryByText(workflow, { exact: true })).not.toBeInTheDocument();
    expect(within(drawer).queryByText("Stato non disponibile", { exact: true })).not.toBeInTheDocument();
  });

  it.each([
    { status: "DELETED", workflow: "active", deletedAt: null },
    { status: "PENDING", workflow: "pending", deletedAt: "2026-10-29T12:00:00Z" },
  ])("mostra Eliminato senza export per stato $status e workflow $workflow", async ({ status, workflow, deletedAt }) => {
    mocks.members.mockResolvedValue({ items: [{ ...firstMember, status, workflow_status: workflow, deleted_at: deletedAt, is_active: false }], total: 1 });
    mount("/org-admin/soci?status=deleted"); await ready();
    const drawer = await showQuickProfile();
    expect(within(drawer).getByText("Eliminato", { selector: ".org-status-chip" })).toBeInTheDocument();
    expect(within(drawer).queryByText(workflow, { exact: true })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole("link", { name: "Esporta scheda socio" })).not.toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Vedi profilo completo" })).toBeInTheDocument();
  });

  it("mantiene il pannello affiancato richiudibile da1440px senza riaprirlo al cambio pagina", async () => {
    setViewport(1440);
    mount(); await ready();
    fireEvent.click(screen.getByTestId("member-row-1"));
    const panel = document.querySelector<HTMLElement>("aside.org-admin-members-quick-profile")!;
    expect(panel).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Profilo rapido" })).not.toBeInTheDocument();
    const close = within(panel).getByRole("button", { name: "Chiudi profilo rapido" });
    close.focus(); fireEvent.click(close);
    await waitFor(() => expect(document.querySelector(".org-admin-members-quick-profile")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("member-row-1")).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Successiva" }));
    await waitFor(() => expect(mocks.members).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })));
    await screen.findByTestId("member-row-1");
    expect(document.querySelector(".org-admin-members-quick-profile")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Profilo rapido" })).not.toBeInTheDocument();
  });

  it("trasforma il pannello in drawer sotto1440px senza perdere il socio selezionato", async () => {
    setViewport(1600);
    mount(); await ready();
    fireEvent.click(screen.getByTestId("member-row-1"));
    expect(document.querySelector("aside.org-admin-members-quick-profile")).toBeInTheDocument();
    act(() => setViewport(1366));
    const drawer = await screen.findByRole("dialog", { name: "Profilo rapido" });
    expect(within(drawer).getByRole("heading", { name: "Mario Giordano" })).toBeInTheDocument();
    expect(document.querySelector("aside.org-admin-members-quick-profile")).not.toBeInTheDocument();
    act(() => setViewport(1600));
    expect(screen.queryByRole("dialog", { name: "Profilo rapido" })).not.toBeInTheDocument();
    expect(document.querySelector("aside.org-admin-members-quick-profile")).toBeInTheDocument();
  });

  it("mantiene solo cronologia a selezione vuota e rivela le azioni dopo la checkbox", async () => {
    mount(); await ready();
    expect(screen.queryByText("Nessun selezionato")).not.toBeInTheDocument();
    expect(screen.queryByText("Seleziona pagina")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Azioni sui soci selezionati" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Seleziona tutti i soci della pagina" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cronologia operazioni" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("member-row-1")).getByRole("checkbox", { name: "Seleziona Mario Giordano" }));
    expect(screen.getByText("1 selezionato")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Azioni sui soci selezionati" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Profilo rapido" })).not.toBeInTheDocument();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Azzera selezione" }));
    expect(screen.queryByRole("group", { name: "Azioni sui soci selezionati" })).not.toBeInTheDocument();
  });

  it("apre la cronologia senza selezionare soci o avviare invii", async () => {
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Cronologia operazioni" }));
    const history = await screen.findByRole("dialog", { name: "Operazioni recenti" });
    expect(await within(history).findByText("Nessuna operazione precedente.")).toBeInTheDocument();
    expect(mocks.history).toHaveBeenCalledExactlyOnceWith(0);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("il comando Profilo porta direttamente alla pagina completa", async () => {
    mount(); await ready();
    fireEvent.click(within(screen.getByTestId("member-row-1")).getByRole("button", { name: "Apri profilo completo di Mario Giordano" }));
    expect(await screen.findByRole("heading", { name: "Profilo completo" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Profilo rapido" })).not.toBeInTheDocument();
  });

  it("dopo un inserimento manuale apre il nuovo profilo anche con ricerca e filtri precedenti", async () => {
    mount("/org-admin/soci?q=un-altro-socio&status=expired&source=online&page=2");
    await ready();
    const listRequests = mocks.members.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi socio/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Completa inserimento sintetico" }));
    expect(await screen.findByRole("heading", { name: "Profilo completo" })).toBeInTheDocument();
    expect(screen.getByTestId("profile-path")).toHaveTextContent("/org-admin/soci/77");
    expect(screen.getByTestId("profile-state")).toHaveTextContent('"memberCreated":true');
    expect(mocks.members).toHaveBeenCalledTimes(listRequests);
  });
});
