import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../lib/api";
import type { DashboardContext } from "./DashboardLayout";
import DashboardHome from "./DashboardHome";

vi.mock("../../lib/api", async original => ({ ...await original<typeof import("../../lib/api")>(), fetchMemberMembership: vi.fn(), fetchMemberNotifications: vi.fn(), markMemberNotificationRead: vi.fn(), requestMemberRenewal: vi.fn(), createMemberRenewalCheckout: vi.fn() }));
vi.mock("./TemporaryMembershipPanel", () => ({ default: () => <section aria-label="Richiesta temporanea">Temporanea disponibile</section> }));
vi.mock("../../components/cards/MemberCardPreview", () => ({ isMemberCardPreviewData: () => true, MemberCardPreview: ({ flipped }: { flipped: boolean }) => <div data-testid="digital-card">{flipped ? "QR tessera" : "Fronte tessera"}</div> }));
const member: api.MemberProfile = { id: 1, first_name: "Anna", last_name: "Collaudo", email: "anna@example.test", phone: null, fiscal_code: null, status: "active", card_no: 123, card_status: "attiva", card_year: 2026, membership_type: "annual", joined_at: "2026-07-01", valid_until: "2027-01-01T00:00:00Z", card_verification_url: "https://assonam.it/v/fixture", organization: { id: 2, name: "Club Collaudo", slug: "club" } };
function mount(user = member) { const context: DashboardContext = { user, loading: false, profileError: null, reloadProfile: vi.fn() }; return render(<MemoryRouter><Routes><Route element={<Outlet context={context} />}><Route path="*" element={<DashboardHome />} /></Route></Routes></MemoryRouter>); }
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchMemberMembership).mockResolvedValue({ current: null, renewal: null, can_renew: false } as api.MemberMembershipResponse);
  vi.mocked(api.fetchMemberNotifications).mockResolvedValue({ items: [], unread_count: 0 });
});

describe("Riepilogo socio", () => {
  it("presenta per prima la tessera e nasconde temporanea e riepiloghi ripetuti se valida", async () => {
    mount(); await waitFor(() => expect(api.fetchMemberMembership).toHaveBeenCalled());
    expect(document.querySelector('[data-tour="member-dashboard-home"] section')?.getAttribute("aria-labelledby")).toBe("member-digital-card-title");
    expect(screen.getByTestId("digital-card")).toBeVisible();
    expect(screen.queryByLabelText("Richiesta temporanea")).not.toBeInTheDocument();
    expect(screen.queryByText("Stato iscrizione")).not.toBeInTheDocument();
    expect(screen.queryByText("Annualità associativa")).not.toBeInTheDocument();
    expect(screen.getByText("Scadenza 01/01/2027")).toBeVisible();
  });
  it("permette di mostrare subito il QR senza navigare altrove", () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Mostra QR" }));
    expect(screen.getByText("QR tessera")).toBeVisible();
    expect(screen.getByRole("button", { name: "Mostra fronte" })).toHaveAttribute("aria-pressed", "true");
  });
  it("conserva il percorso temporanea quando la tessera è scaduta", () => {
    mount({ ...member, status: "expired", card_status: "scaduta" });
    expect(screen.getByLabelText("Richiesta temporanea")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Aggiungi a Google Wallet" })).not.toBeInTheDocument();
  });
  it("rinnovo e notifiche restano successivi alla tessera", async () => {
    vi.mocked(api.fetchMemberMembership).mockResolvedValue({ current: { valid_through: "2027-01-01" }, renewal: null, can_renew: true } as api.MemberMembershipResponse);
    vi.mocked(api.fetchMemberNotifications).mockResolvedValue({ unread_count: 1, items: [{ id: 3, type: "document_rejected", title: "Documento da correggere", body: "Foto sfocata", href: "/dashboard/documenti?document_id=4", is_read: false, created_at: "2026-10-29" }] });
    mount(); await screen.findByRole("heading", { name: "Rinnova la tessera" });
    const card = screen.getByTestId("digital-card");
    expect(card.compareDocumentPosition(screen.getByRole("heading", { name: "Rinnova la tessera" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(screen.getByRole("heading", { name: "Comunicazioni" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: "Correggi e reinvia documento" })).toHaveAttribute("href", "/dashboard/documenti?document_id=4");
  });
  it("workflow active non nasconde la temporanea quando l'API segnala card non_attiva", () => {
    mount({ ...member, status: "active", card_status: "non_attiva", valid_until: "2020-01-01", card: { number: 123, status: "non_attiva", year: 2026, verification_url: "https://assonam.it/v/fixture" } });
    expect(screen.getByLabelText("Richiesta temporanea")).toBeVisible();
    expect(screen.getByText("Da rinnovare")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Aggiungi a Google Wallet" })).not.toBeInTheDocument();
  });
});
