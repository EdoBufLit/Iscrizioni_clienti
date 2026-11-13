import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "../../lib/api";
import SuperAdminMemberDetailPage from "./SuperAdminMemberDetail";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  profile: { id: 1, email: "admin@example.test" },
  registry: vi.fn(),
  detail: vi.fn(),
  organizations: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useOutletContext: () => ({ profile: mocks.profile }),
}));

vi.mock("../../lib/api", () => ({
  AuthError: class AuthError extends Error {},
  fetchSuperAdminMemberRegistry: mocks.registry,
  fetchSuperAdminMemberDetail: mocks.detail,
  fetchSuperAdminOrganizations: mocks.organizations,
}));

const expiredMember = {
  id: 41,
  full_name: "Socio Collaudo Scaduto",
  first_name: "Socio",
  last_name: "Collaudo Scaduto",
  status: "expired",
  workflow_status: "active",
  organization_name: "Club Collaudo",
  organization: { name: "Club Collaudo", slug: "club-collaudo" },
  email: "expired@example.test",
  card_no: 123456,
  card_year: 2025,
};

const activeMember = {
  ...expiredMember,
  id: 42,
  full_name: "Altro Socio Collaudo",
  first_name: "Altro",
  last_name: "Socio Collaudo",
  status: "active",
  email: "active@example.test",
  card_no: 123457,
  card_year: 2026,
};

function registry(items = [expiredMember], total = items.length) {
  return { items, total, kpis: { total, active: 0, pending: 0, expired: total, rejected: 0 } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function flush() {
  await act(async () => {});
}

async function debounceSearch() {
  await act(async () => { vi.advanceTimersByTime(250); });
}

function search(value: string) {
  fireEvent.change(screen.getByPlaceholderText("Nome, email, CF o numero tessera"), { target: { value } });
}

function setStatus(value: string) {
  fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value } });
}

function table() {
  return within(screen.getByRole("table"));
}

describe("Super Admin member registry filters and requests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.navigate.mockReset();
    mocks.organizations.mockReset().mockResolvedValue({ items: [] });
    mocks.registry.mockReset().mockResolvedValue(registry());
    mocks.detail.mockReset().mockImplementation(async (id: number) => id === expiredMember.id ? expiredMember : activeMember);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each(["name-first", "status-first"])("keeps an expired member searchable when applying filters %s", async (order) => {
    render(<SuperAdminMemberDetailPage />);
    await flush();
    if (order === "name-first") {
      search("socio col");
      await debounceSearch();
      setStatus("expired");
      await flush();
    } else {
      setStatus("expired");
      await flush();
      search("socio col");
      await debounceSearch();
    }
    expect(mocks.registry).toHaveBeenLastCalledWith(expect.objectContaining({ q: "socio col", status: "expired", offset: 0 }));
    expect(table().getByText(expiredMember.full_name)).toBeInTheDocument();
    setStatus("");
    await flush();
    expect(mocks.registry).toHaveBeenLastCalledWith(expect.objectContaining({ q: "socio col", status: undefined }));
    expect(table().getByText(expiredMember.full_name)).toBeInTheDocument();
  });

  it("does not let a late all-status result erase the newer expired result", async () => {
    const previous = deferred<ReturnType<typeof registry>>();
    mocks.registry.mockResolvedValueOnce(registry([])).mockReturnValueOnce(previous.promise).mockResolvedValue(registry());
    render(<SuperAdminMemberDetailPage />);
    await flush();
    search("socio col");
    await debounceSearch();
    setStatus("expired");
    await flush();
    expect(table().getByText(expiredMember.full_name)).toBeInTheDocument();
    await act(async () => previous.resolve(registry([])));
    expect(table().getByText(expiredMember.full_name)).toBeInTheDocument();
    expect(table().queryByText("Nessun socio trovato con i filtri selezionati.")).not.toBeInTheDocument();
  });

  it("keeps the latest request loading when the previous request finishes", async () => {
    const previous = deferred<ReturnType<typeof registry>>();
    const current = deferred<ReturnType<typeof registry>>();
    mocks.registry.mockResolvedValueOnce(registry([])).mockReturnValueOnce(previous.promise).mockReturnValueOnce(current.promise);
    render(<SuperAdminMemberDetailPage />);
    await flush();
    search("socio col");
    await debounceSearch();
    setStatus("expired");
    await flush();
    await act(async () => previous.resolve(registry([])));
    expect(table().getByText("Caricamento libro soci...")).toBeInTheDocument();
    expect(table().queryByText("Nessun socio trovato con i filtri selezionati.")).not.toBeInTheDocument();
    await act(async () => current.resolve(registry()));
    expect(table().getByText(expiredMember.full_name)).toBeInTheDocument();
  });

  it.each([new Error("Errore richiesta precedente"), new AuthError("Sessione precedente")])("ignores an outdated registry failure: %s", async (error) => {
    const previous = deferred<ReturnType<typeof registry>>();
    mocks.registry.mockResolvedValueOnce(registry([])).mockReturnValueOnce(previous.promise).mockResolvedValue(registry());
    render(<SuperAdminMemberDetailPage />);
    await flush();
    search("socio col");
    await debounceSearch();
    setStatus("expired");
    await flush();
    await act(async () => previous.reject(error));
    expect(table().getByText(expiredMember.full_name)).toBeInTheDocument();
    expect(screen.queryByText(error.message)).not.toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("waits for the current search text before combining it with a changed status", async () => {
    render(<SuperAdminMemberDetailPage />);
    await flush();
    search("socio col");
    setStatus("expired");
    await flush();
    expect(mocks.registry).toHaveBeenCalledTimes(1);
    expect(table().getByText("Caricamento libro soci...")).toBeInTheDocument();
    await debounceSearch();
    expect(mocks.registry).toHaveBeenCalledTimes(2);
    expect(mocks.registry).toHaveBeenLastCalledWith(expect.objectContaining({ q: "socio col", status: "expired" }));
    expect(table().getByText(expiredMember.full_name)).toBeInTheDocument();
  });

  it("does not restore an old member detail after selecting another member", async () => {
    const previousDetail = deferred<typeof expiredMember>();
    mocks.registry.mockResolvedValue(registry([expiredMember, activeMember]));
    mocks.detail.mockReturnValueOnce(previousDetail.promise).mockResolvedValue(activeMember);
    render(<SuperAdminMemberDetailPage />);
    await flush();
    fireEvent.click(table().getAllByRole("button", { name: "Visualizza dettaglio" })[1]);
    await flush();
    expect(screen.getByRole("heading", { name: activeMember.full_name })).toBeInTheDocument();
    await act(async () => previousDetail.resolve(expiredMember));
    expect(screen.getByRole("heading", { name: activeMember.full_name })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: expiredMember.full_name })).not.toBeInTheDocument();
  });

  it("clears a pending detail when the filtered registry is empty", async () => {
    const previousDetail = deferred<typeof expiredMember>();
    mocks.registry.mockResolvedValueOnce(registry()).mockResolvedValue(registry([]));
    mocks.detail.mockReturnValue(previousDetail.promise);
    render(<SuperAdminMemberDetailPage />);
    await flush();
    search("nessun risultato");
    await debounceSearch();
    expect(table().getByText("Nessun socio trovato con i filtri selezionati.")).toBeInTheDocument();
    expect(screen.queryByText("Caricamento")).not.toBeInTheDocument();
    await act(async () => previousDetail.resolve(expiredMember));
    expect(screen.queryByRole("heading", { name: expiredMember.full_name })).not.toBeInTheDocument();
  });
});
