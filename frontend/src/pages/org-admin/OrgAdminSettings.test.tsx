import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrgAdminSettings from "./OrgAdminSettings";

const mocks = vi.hoisted(() => ({
  fetchOrg: vi.fn(),
  patchOrg: vi.fn(),
  putEmail: vi.fn(),
  uploadStatute: vi.fn(),
  uploadWalletAssets: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  AuthError: class AuthError extends Error {},
  fetchOrgAdminOrganization: () => mocks.fetchOrg(),
  patchOrgAdminOrganization: (...args: unknown[]) => mocks.patchOrg(...args),
  putOrgAdminCommunicationSettings: (...args: unknown[]) => mocks.putEmail(...args),
  uploadOrgAdminStatute: (...args: unknown[]) => mocks.uploadStatute(...args),
  uploadOrgAdminWalletAssets: (...args: unknown[]) => mocks.uploadWalletAssets(...args),
}));

vi.mock("../../components/ui/ToastProvider", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock("../../components/ui/UnsavedChangesProvider", () => ({
  useUnsavedChangesGuard: () => {},
}));

const baseOrg = {
  id: 10,
  name: "Golden Age Club",
  slug: "golden-age-club",
  description: "Circolo culturale",
  city: "Roma",
  province: "RM",
  email: "info@goldenage.it",
  phone: "3331234567",
  website: "https://goldenage.it",
  has_statute: true,
  statute_version: "v3",
  statute_updated_at: "2026-09-01T10:00:00Z",
  statute_url: "/api/organizations/golden-age-club/statute",
  communications_enabled: true,
  sender_email_local_part: "golden-age",
  email_from_name_override: "Golden Age Segreteria",
  reply_to_email: "reply@goldenage.it",
  mail_from_domain: "assonam.it",
  wallet_bg_color: "#3A0015",
  wallet_title_override: "Golden Age Club",
  wallet_is_test_prefix: false,
  wallet_logo_url: "/static/card-logos/golden-age.png",
  wallet_hero_image_url: null,
};

describe("OrgAdminSettings tabbed architecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchOrg.mockResolvedValue({ ...baseOrg });
    mocks.patchOrg.mockImplementation(async (payload: Record<string, unknown>) => ({
      organization: { ...baseOrg, ...payload },
    }));
    mocks.putEmail.mockImplementation(async (payload: Record<string, unknown>) => ({
      settings: {
        ...baseOrg,
        ...payload,
      },
    }));
    mocks.uploadStatute.mockResolvedValue({
      statute_version: "v4",
      updated_at: "2026-10-29T10:00:00Z",
    });
    mocks.uploadWalletAssets.mockResolvedValue({
      wallet_logo_url: "/uploads/new-logo.png",
      wallet_hero_image_url: null,
    });
  });

  it("renders Profilo tab by default and saves profile changes", async () => {
    render(
      <MemoryRouter initialEntries={["/org-admin/associazione"]}>
        <OrgAdminSettings />
      </MemoryRouter>,
    );

    const nameInput = await screen.findByLabelText("Nome");
    expect(nameInput).toHaveValue("Golden Age Club");
    expect(screen.getByLabelText("Città")).toHaveValue("Roma");
    expect(screen.getByLabelText("Provincia")).toHaveValue("RM");

    fireEvent.change(nameInput, { target: { value: "Golden Age Speakeasy" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() =>
      expect(mocks.patchOrg).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Golden Age Speakeasy", city: "Roma", province: "RM" }),
      ),
    );
    expect(await screen.findByText("Dati aggiornati correttamente.")).toBeInTheDocument();
  });

  it("switches to Documenti tab, shows current statute v3, and uploads a new PDF", async () => {
    render(
      <MemoryRouter initialEntries={["/org-admin/associazione"]}>
        <OrgAdminSettings />
      </MemoryRouter>,
    );

    await screen.findByLabelText("Nome");
    fireEvent.click(screen.getByRole("tab", { name: /Documenti/ }));

    expect(screen.getByText("Statuto attuale: v3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Scarica PDF/ })).toHaveAttribute(
      "href",
      "/api/organizations/golden-age-club/statute",
    );

    const fileInput = screen.getByLabelText("Seleziona file PDF dello statuto");
    const pdfFile = new File(["%PDF-1.4"], "statuto-2026.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    expect(screen.getByText("statuto-2026.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Carica" }));

    await waitFor(() => expect(mocks.uploadStatute).toHaveBeenCalledWith(pdfFile));
    expect(await screen.findByText("Statuto aggiornato (v4).")).toBeInTheDocument();
  });

  it("updates Email live preview in real time and saves communication settings", async () => {
    render(
      <MemoryRouter initialEntries={["/org-admin/associazione?tab=email"]}>
        <OrgAdminSettings />
      </MemoryRouter>,
    );

    const localPartInput = await screen.findByLabelText("Local part mittente");
    expect(screen.getByText(/Se la configurazione non è completa/)).toBeInTheDocument();
    expect(screen.getByText("Golden Age Segreteria <golden-age@assonam.it>")).toBeInTheDocument();

    fireEvent.change(localPartInput, { target: { value: "segreteria.club" } });
    expect(screen.getByText("Golden Age Segreteria <segreteria-club@assonam.it>")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni email" }));
    await waitFor(() =>
      expect(mocks.putEmail).toHaveBeenCalledWith(
        expect.objectContaining({ sender_email_local_part: "segreteria.club" }),
      ),
    );
  });

  it("unifies Google Wallet branding and asset upload into a single save action", async () => {
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview-logo");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={["/org-admin/associazione?tab=wallet"]}>
        <OrgAdminSettings />
      </MemoryRouter>,
    );

    const titleInput = await screen.findByLabelText("Titolo Wallet (override)");
    fireEvent.change(titleInput, { target: { value: "Golden Age VIP" } });

    const logoInput = screen.getByLabelText("Logo Wallet");
    const logoFile = new File(["png"], "wallet-logo.png", { type: "image/png" });
    fireEvent.change(logoInput, { target: { files: [logoFile] } });

    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche Wallet" }));

    await waitFor(() => {
      expect(mocks.patchOrg).toHaveBeenCalledWith(
        expect.objectContaining({ wallet_title_override: "Golden Age VIP" }),
      );
      expect(mocks.uploadWalletAssets).toHaveBeenCalledWith({
        logo: logoFile,
        heroImage: null,
      });
    });
    expect(await screen.findByText("Modifiche Google Wallet salvate correttamente.")).toBeInTheDocument();

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });
});
