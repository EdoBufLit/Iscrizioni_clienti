import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BulkRun } from "../../../lib/memberBulk";
import MemberBulkActions from "./MemberBulkActions";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), read: vi.fn(), recent: vi.fn(), execute: vi.fn(), retry: vi.fn(), download: vi.fn(), sequence: 0 }));
vi.mock("../../../lib/memberBulk", () => ({
  bulkRequestKey: () => `request-key-${++mocks.sequence}`,
  previewMemberBulk: (...args: unknown[]) => mocks.preview(...args),
  fetchMemberBulk: (...args: unknown[]) => mocks.read(...args),
  fetchRecentMemberBulk: (...args: unknown[]) => mocks.recent(...args),
  executeMemberBulk: (...args: unknown[]) => mocks.execute(...args),
  retryMemberBulk: (...args: unknown[]) => mocks.retry(...args),
  downloadMemberBulk: (...args: unknown[]) => mocks.download(...args),
}));

function run(changes: Partial<BulkRun> = {}): BulkRun {
  return {
    id: "run-a", action: "send_access", action_label: "Invia accesso", status: "preview",
    selection_mode: "ids", membership_year: null, selected_count: 3, eligible_count: 2,
    counts: { pending: 2, succeeded: 0, skipped: 1, failed: 0 }, reason_counts: { access_already_active: 1 },
    created_at: "2026-10-26T10:00:00Z", expires_at: "2026-10-26T10:30:00Z", started_at: null, completed_at: null,
    items: [
      { member_id: 1, name: "Anna Locale", status: "pending", detail: null, reason_code: null, attempts: 0, delivery_status: null },
      { member_id: 2, name: "Mario Locale", status: "pending", detail: null, reason_code: null, attempts: 0, delivery_status: null },
      { member_id: 3, name: "Lucia Locale", status: "skipped", detail: "Il socio ha già un accesso attivo.", reason_code: "access_already_active", attempts: 0, delivery_status: null },
    ],
    offset: 0, limit: 50, total: 3, has_more: false, can_execute: true, can_retry_failed: false, can_download: false,
    ...changes,
  };
}
function completed(changes: Partial<BulkRun> = {}) {
  const initial = run();
  return run({ status: "completed", counts: { pending: 0, succeeded: 2, skipped: 1, failed: 0 },
    started_at: "2026-10-26T10:01:00Z", completed_at: "2026-10-26T10:02:00Z", can_execute: false,
    items: initial.items.map((item) => item.status === "pending" ? { ...item, status: "succeeded", attempts: 1, delivery_status: "queued" } : item),
    ...changes,
  });
}
const props = {
  selection: { mode: "ids" as const, member_ids: [1, 2, 3] }, count: 3, total: 40, pageCount: 3,
  allPageChecked: true, disabled: false, storageKey: "bulk-test", onTogglePage: vi.fn(), onSelectAll: vi.fn(), onClear: vi.fn(),
};
function mount(overrides: Partial<Parameters<typeof MemberBulkActions>[0]> = {}) { return render(<MemoryRouter><MemberBulkActions {...props} {...overrides} /></MemoryRouter>); }
async function accessPreview() {
  fireEvent.click(screen.getByRole("button", { name: "Invia accesso ai selezionati" }));
  return screen.findByRole("dialog");
}

describe("explicit member bulk workflows", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.clearAllMocks(); sessionStorage.clear(); mocks.sequence = 0;
    mocks.preview.mockReset().mockResolvedValue(run());
    mocks.execute.mockReset().mockResolvedValue(completed());
    mocks.read.mockReset().mockResolvedValue(run());
    mocks.retry.mockReset(); mocks.recent.mockReset().mockResolvedValue({ items: [], total: 0 }); mocks.download.mockReset();
  });

  it("shows eligibility before confirmation and processes distinct chunks without claiming delivery", async () => {
    mocks.execute.mockResolvedValueOnce(run({ status: "running", started_at: "2026-10-26T10:01:00Z", counts: { pending: 1, succeeded: 1, skipped: 1, failed: 0 } })).mockResolvedValueOnce(completed());
    mount();
    const dialog = await accessPreview();
    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ action: "send_access", selection: props.selection }));
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Il socio ha già un accesso attivo.")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Conferma e accoda 2 accessi" }));
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2));
    await screen.findByText("Esiti aggiornati. Le email sono accodate; la consegna è gestita dal sistema.");
    expect(mocks.execute.mock.calls[0][1]).not.toBe(mocks.execute.mock.calls[1][1]);
    expect(within(dialog).getAllByText("Accodato")).toHaveLength(2);
    expect(within(dialog).queryByText("Inviato")).not.toBeInTheDocument();
  });

  it("reuses the batch request key if the response was lost", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("Connessione interrotta")).mockResolvedValueOnce(completed());
    mount(); const dialog = await accessPreview();
    fireEvent.click(within(dialog).getByRole("button", { name: "Conferma e accoda 2 accessi" }));
    await screen.findByRole("alert");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Conferma e accoda 2 accessi" })).toBeEnabled());
    fireEvent.click(within(dialog).getByRole("button", { name: "Conferma e accoda 2 accessi" }));
    await screen.findByText("Esiti aggiornati. Le email sono accodate; la consegna è gestita dal sistema.");
    expect(mocks.execute.mock.calls[0]).toEqual(mocks.execute.mock.calls[1]);
  });

  it("can pause after an in-flight chunk and resume only pending records", async () => {
    let resolve!: (value: BulkRun) => void;
    mocks.execute.mockImplementationOnce(() => new Promise<BulkRun>((done) => { resolve = done; })).mockResolvedValueOnce(completed());
    mount(); const dialog = await accessPreview();
    fireEvent.click(within(dialog).getByRole("button", { name: "Conferma e accoda 2 accessi" }));
    fireEvent.click(await screen.findByRole("button", { name: "Pausa dopo il blocco corrente" }));
    await act(async () => resolve(run({ status: "running", started_at: "2026-10-26T10:01:00Z", counts: { pending: 1, succeeded: 1, skipped: 1, failed: 0 } })));
    await screen.findByText(/Elaborazione in pausa/);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Riprendi elaborazione" }));
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2));
    expect(mocks.execute.mock.calls[0][1]).not.toBe(mocks.execute.mock.calls[1][1]);
  });

  it("retries failed records in an existing run without creating a new selection", async () => {
    sessionStorage.setItem(props.storageKey, "run-a");
    mocks.read.mockResolvedValue(completed({ counts: { pending: 0, succeeded: 1, skipped: 1, failed: 1 }, can_retry_failed: true }));
    mocks.retry.mockResolvedValue(run({ status: "running", started_at: "2026-10-26T10:01:00Z", counts: { pending: 1, succeeded: 1, skipped: 1, failed: 0 } }));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Cronologia operazioni" }));
    fireEvent.click(await screen.findByRole("button", { name: "Riprendi ultima operazione" }));
    fireEvent.click(await screen.findByRole("button", { name: "Riprova solo i 1 falliti" }));
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    expect(mocks.retry).toHaveBeenCalledTimes(1);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("never leaves an old operation confirmable when another operation fails to load", async () => {
    mocks.recent.mockResolvedValue({ items: [{ ...run({ id: "run-b", action: "export", action_label: "Esporta soci" }) }], total: 1 });
    mount(); const dialog = await accessPreview();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Chiudi$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cronologia operazioni" }));
    mocks.read.mockRejectedValueOnce(new Error("Operazione non trovata"));
    fireEvent.click(await screen.findByRole("button", { name: /Esporta soci ·/ }));
    await screen.findByText("Operazione non trovata");
    expect(screen.queryByRole("button", { name: "Conferma e accoda 2 accessi" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Conferma esportazione" })).not.toBeInTheDocument();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("requires confirmation before selected exports can be downloaded", async () => {
    mocks.preview.mockResolvedValue(run({ action: "export", action_label: "Esporta soci" }));
    mocks.execute.mockResolvedValue(completed({ action: "export", action_label: "Esporta soci", can_download: true }));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Esporta selezionati" }));
    const dialog = await screen.findByRole("dialog");
    expect(mocks.download).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Scarica Excel selezionati" })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Conferma esportazione" }));
    await screen.findByRole("button", { name: "Scarica Excel selezionati" });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(screen.queryByText(/Le email sono accodate/)).not.toBeInTheDocument();
  });

  it("keeps the empty toolbar focused on selection and history, without reminders", () => {
    mount({ count: 0, allPageChecked: false, selection: { mode: "ids", member_ids: [] } });
    expect(screen.getByRole("checkbox", { name: "Seleziona pagina (3)" })).toBeVisible();
    expect(screen.getByText("Nessun selezionato")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Esporta selezionati" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invia accesso ai selezionati" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Sollecita quote|Annualità da sollecitare/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cronologia operazioni" })).toHaveAttribute("aria-expanded", "false");
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("does not repeat select-all when the whole result already fits on the page", () => {
    mount({ total: 3 });
    expect(screen.getByRole("button", { name: "Esporta selezionati" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Seleziona tutti i/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Azzera selezione" }));
    expect(props.onClear).toHaveBeenCalledOnce();
  });

  it("keeps selection across pages available without running an action", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Seleziona tutti i 40 risultati" }));
    expect(props.onSelectAll).toHaveBeenCalledOnce();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(screen.queryByText(/Sollecita quote|Annualità da sollecitare/)).not.toBeInTheDocument();
  });

  it("cannot execute a saved future-year reminder, even if an old response permits it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    sessionStorage.setItem(props.storageKey, "run-a");
    mocks.read.mockResolvedValue(run({ action: "quote_reminder", action_label: "Sollecita quota 2027", membership_year: 2027, can_execute: true, can_retry_failed: true }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Cronologia operazioni" }));
    fireEvent.click(await screen.findByRole("button", { name: "Riprendi ultima operazione" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("I solleciti sono disponibili dal 2027 e soltanto per annualità già iniziate.")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: /Conferma e accoda|Riprendi elaborazione|Riprova solo/ })).not.toBeInTheDocument();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("uses the current quote year only when explicitly enabled in the quote center", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-02T12:00:00Z"));
    mocks.preview.mockResolvedValue(run({ action: "quote_reminder", action_label: "Sollecita quota 2027", membership_year: 2027 }));
    mount({ actions: ["quote_reminder"], membershipYear: 2027 });
    fireEvent.click(screen.getByRole("button", { name: "Sollecita quote 2027" }));
    await screen.findByRole("dialog");
    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ action: "quote_reminder", membership_year: 2027 }));
  });

  it("keeps a saved quote reminder read-only in the members page even after 2027 starts", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-06-01T12:00:00Z"));
    sessionStorage.setItem(props.storageKey, "run-a");
    mocks.read.mockResolvedValue(run({ action: "quote_reminder", action_label: "Sollecita quota 2027", membership_year: 2027, can_execute: true, can_retry_failed: true }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Cronologia operazioni" }));
    fireEvent.click(await screen.findByRole("button", { name: "Riprendi ultima operazione" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/I solleciti si gestiscono da Quote e rinnovi/)).toBeVisible();
    expect(within(dialog).getByRole("link", { name: "Apri Quote e rinnovi" })).toHaveAttribute("href", "/org-admin/quote");
    expect(within(dialog).queryByRole("button", { name: /Conferma e accoda|Riprendi elaborazione|Riprova solo/ })).not.toBeInTheDocument();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
