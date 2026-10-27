import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrgAdminIncassi from "./OrgAdminIncassi";
import ReceiptAllocationModal from "./components/accounting/ReceiptAllocationModal";
import ReceiptDetailPanel, {
  AccountingHistory,
} from "./components/accounting/ReceiptDetailPanel";
import ReceiptFormModal from "./components/accounting/ReceiptFormModal";
import ReceiptImportModal from "./components/accounting/ReceiptImportModal";
import { parseCents } from "./components/accounting/accountingUi";
import {
  AccountingError,
  type AccountingReceipt,
  type AccountingTarget,
  type ReceiptDetail,
} from "../../lib/accounting";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
  sync: vi.fn(),
  targets: vi.fn(),
  allocate: vi.fn(),
  adjust: vi.fn(),
  reverse: vi.fn(),
  void: vi.fn(),
  preview: vi.fn(),
  import: vi.fn(),
  member: vi.fn(),
}));
vi.mock("../../lib/accounting", async (original) => ({
  ...(await original<typeof import("../../lib/accounting")>()),
  fetchReceipts: mocks.list,
  fetchReceipt: mocks.detail,
  createReceipt: mocks.create,
  syncReceipts: mocks.sync,
  fetchReceiptTargets: mocks.targets,
  allocateReceipt: mocks.allocate,
  adjustReceipt: mocks.adjust,
  reverseReceiptAllocation: mocks.reverse,
  voidReceipt: mocks.void,
  previewReceiptImport: mocks.preview,
  importReceipts: mocks.import,
  fetchMemberAccounting: mocks.member,
}));

const receipt: AccountingReceipt = {
  id: 7,
  version: 3,
  amount_cents: 6000,
  currency: "EUR",
  method: "bank_transfer",
  paid_on: "2026-10-26",
  payer: "Mario Rossi",
  reference: "BON-123",
  description: "Due quote",
  source: "manual",
  source_key: null,
  status: "unmatched",
  allocated_cents: 0,
  unallocated_cents: 6000,
  created_at: "2026-10-26T10:00:00Z",
  permissions: { can_adjust: true, can_void: true, reason: null },
};
const detail: ReceiptDetail = { receipt, allocations: [], events: [] };
const target = (id: number, name: string): AccountingTarget => ({
  target_key: `renewal:${id}:2026`,
  kind: "renewal",
  target_id: id,
  member_id: id,
  member_name: name,
  email: `${id}@example.test`,
  membership_year: 2026,
  label: "Quota annuale 2026",
  currency: "EUR",
  expected_cents: 3000,
  paid_cents: 0,
  outstanding_cents: 3000,
  already_paid: false,
  exact_match: false,
  reasons: ["Nome in causale"],
});
const listResult = (items = [receipt], total = items.length) => ({
  items,
  total,
  kpis: {
    total_cents: 6000,
    allocated_cents: 0,
    unallocated_cents: 6000,
    unmatched_count: total,
  },
});
const renderPage = (route = "/org-admin/incassi") =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <OrgAdminIncassi />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue(listResult());
  mocks.detail.mockResolvedValue(detail);
  mocks.create.mockResolvedValue(detail);
  mocks.sync.mockResolvedValue({ created: 0 });
  mocks.targets.mockResolvedValue({
    items: [target(1, "Anna Rossi"), target(2, "Luca Bianchi")],
    total: 2,
  });
  mocks.allocate.mockResolvedValue({
    ...detail,
    receipt: {
      ...receipt,
      version: 4,
      allocated_cents: 6000,
      unallocated_cents: 0,
      status: "matched",
    },
  });
  mocks.adjust.mockResolvedValue(detail);
  mocks.reverse.mockResolvedValue(detail);
  mocks.void.mockResolvedValue({
    ...detail,
    receipt: { ...receipt, status: "voided", version: 4 },
  });
  mocks.import.mockResolvedValue({
    created: 1,
    duplicates: 0,
    items: [receipt],
  });
  mocks.member.mockResolvedValue({
    balance: {
      expected_cents: 3000,
      paid_cents: 1000,
      outstanding_cents: 2000,
      currency: "EUR",
    },
    receipts: [receipt],
    events: [],
  });
});
afterEach(cleanup);

describe("Incassi e riconciliazione", () => {
  it("non seleziona implicitamente ricevute e rispetta la chiusura del dettaglio", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Apri incasso #7" });
    expect(mocks.detail).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apri incasso #7" }));
    await screen.findByRole("heading", { name: /Incasso #7/ });
    fireEvent.click(
      screen.getByRole("button", { name: "Chiudi dettaglio incasso" }),
    );
    expect(
      screen.queryByRole("heading", { name: /Incasso #7/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Apri incasso #7" }),
    ).toBeVisible();
  });

  it("registra in centesimi e non invia due volte durante il salvataggio", async () => {
    let finish: (value: ReceiptDetail) => void = () => {};
    mocks.create.mockReturnValue(
      new Promise<ReceiptDetail>((resolve) => {
        finish = resolve;
      }),
    );
    const onSaved = vi.fn();
    render(
      <ReceiptFormModal
        onClose={vi.fn()}
        onSaved={onSaved}
        onAuthError={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Importo ricevuto (EUR)"), {
      target: { value: "60,00" },
    });
    fireEvent.change(screen.getByLabelText("Riferimento del movimento"), {
      target: { value: "BON-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registra incasso" }));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_cents: 6000,
        reference: "BON-123",
        currency: "EUR",
        request_key: expect.any(String),
      }),
    );
    expect(screen.getByRole("button", { name: "Salvataggio…" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Chiudi finestra" }),
    ).toBeDisabled();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await act(async () => finish(detail));
    expect(onSaved).toHaveBeenCalledWith(detail);
  });

  it("richiede riepilogo e conferma esplicita prima di abbinare un bonifico a due soci", async () => {
    const onSaved = vi.fn();
    render(
      <ReceiptAllocationModal
        receipt={receipt}
        onClose={vi.fn()}
        onSaved={onSaved}
        onReload={vi.fn()}
        onAuthError={vi.fn()}
      />,
    );
    const first = await screen.findByRole("checkbox", {
      name: "Seleziona Anna Rossi, Quota annuale 2026",
    });
    fireEvent.click(first);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Seleziona Luca Bianchi, Quota annuale 2026",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Controlla abbinamenti" }),
    );
    expect(mocks.allocate).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Conferma gli abbinamenti qui sotto/),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma abbinamenti" }),
    );
    await waitFor(() =>
      expect(mocks.allocate).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          expected_version: 3,
          items: [
            { target_key: "renewal:1:2026", amount_cents: 3000 },
            { target_key: "renewal:2:2026", amount_cents: 3000 },
          ],
          request_key: expect.any(String),
        }),
      ),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("gestisce copertura parziale e impedisce di superare il residuo di una quota", async () => {
    render(
      <ReceiptAllocationModal
        receipt={receipt}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onReload={vi.fn()}
        onAuthError={vi.fn()}
      />,
    );
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: "Seleziona Anna Rossi, Quota annuale 2026",
      }),
    );
    const amount = screen.getByLabelText(
      "Importo da abbinare a Anna Rossi (EUR)",
    );
    fireEvent.change(amount, { target: { value: "40,00" } });
    expect(
      screen.getByRole("button", { name: "Controlla abbinamenti" }),
    ).toBeDisabled();
    fireEvent.change(amount, { target: { value: "10,00" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Controlla abbinamenti" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma abbinamenti" }),
    );
    await waitFor(() =>
      expect(mocks.allocate).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          items: [{ target_key: "renewal:1:2026", amount_cents: 1000 }],
        }),
      ),
    );
  });

  it("conserva il riepilogo dopo conflitto e richiede ricaricamento prima di riprovare", async () => {
    mocks.allocate.mockRejectedValue(
      new AccountingError(
        "Ricevuta modificata da un altro amministratore",
        409,
      ),
    );
    const onReload = vi.fn().mockResolvedValue(undefined);
    render(
      <ReceiptAllocationModal
        receipt={receipt}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onReload={onReload}
        onAuthError={vi.fn()}
      />,
    );
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: "Seleziona Anna Rossi, Quota annuale 2026",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Controlla abbinamenti" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma abbinamenti" }),
    );
    await screen.findByRole("alert");
    expect(
      screen.getByLabelText("Importo da abbinare a Anna Rossi (EUR)"),
    ).toHaveValue("30,00");
    expect(
      screen.getByRole("button", { name: "Conferma abbinamenti" }),
    ).toBeDisabled();
    expect(onReload).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Ricarica incasso e quote" }),
    );
    await waitFor(() => expect(onReload).toHaveBeenCalledOnce());
  });

  it("mantiene la bozza di rettifica quando la versione server è cambiata", async () => {
    mocks.adjust.mockRejectedValue(
      new AccountingError("Versione non aggiornata", 409),
    );
    const onReload = vi.fn().mockResolvedValue(undefined);
    render(
      <ReceiptFormModal
        receipt={receipt}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onAuthError={vi.fn()}
        onReload={onReload}
      />,
    );
    fireEvent.change(screen.getByLabelText("Motivo della rettifica"), {
      target: { value: "Metodo indicato per errore" },
    });
    fireEvent.change(screen.getByLabelText("Metodo"), {
      target: { value: "cash" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Registra rettifica" }));
    await screen.findByText("Versione non aggiornata");
    expect(mocks.adjust.mock.calls[0][1]).not.toHaveProperty("currency");
    expect(screen.getByLabelText("Motivo della rettifica")).toHaveValue(
      "Metodo indicato per errore",
    );
    expect(screen.getByLabelText("Metodo")).toHaveValue("cash");
    expect(onReload).not.toHaveBeenCalled();
  });

  it("mostra provider immutabile e non propone rettifiche o nuovi abbinamenti", () => {
    render(
      <MemoryRouter>
        <ReceiptDetailPanel
          detail={{
            ...detail,
            receipt: {
              ...receipt,
              source: "provider",
              method: "sumup",
              permissions: {
                can_adjust: false,
                can_void: false,
                reason: "Pagamento provider",
              },
            },
          }}
          onClose={vi.fn()}
          onChanged={vi.fn()}
          onReload={vi.fn()}
          onAuthError={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/provengono dal provider e non sono rettificabili/),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Rettifica incasso" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Abbina alle quote" }),
    ).not.toBeInTheDocument();
  });

  it("espone i valori originali e rettificati dai veri snapshot annidati dello storico", () => {
    render(
      <AccountingHistory
        events={[
          {
            id: 1,
            action: "adjusted",
            actor_admin_id: 4,
            created_at: "2026-10-26T10:00:00",
            reason: "Metodo corretto",
            before: {
              receipt: { amount_cents: 3000, method: "cash" },
              allocations: [],
            },
            after: {
              receipt: { amount_cents: 6000, method: "bank_transfer" },
              allocations: [],
            },
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByText("Valori prima e dopo"));
    expect(screen.getByText("Contanti")).toBeVisible();
    expect(screen.getByText("Bonifico")).toBeVisible();
    expect(screen.getByText("30,00 €")).toBeVisible();
    expect(screen.getByText("60,00 €")).toBeVisible();
  });

  it("annulla contabilmente con motivo obbligatorio senza promettere un rimborso", async () => {
    render(
      <MemoryRouter>
        <ReceiptDetailPanel
          detail={detail}
          onClose={vi.fn()}
          onChanged={vi.fn()}
          onReload={vi.fn()}
          onAuthError={vi.fn()}
        />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Annulla incasso contabilmente" }),
    );
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByText(/non esegue alcun rimborso/)).toBeVisible();
    expect(
      within(modal).getByRole("button", {
        name: "Conferma annullamento contabile",
      }),
    ).toBeDisabled();
    fireEvent.change(within(modal).getByLabelText("Motivo dello storno"), {
      target: { value: "Registrazione duplicata" },
    });
    fireEvent.click(
      within(modal).getByRole("button", {
        name: "Conferma annullamento contabile",
      }),
    );
    await waitFor(() =>
      expect(mocks.void).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          reason: "Registrazione duplicata",
          expected_version: 3,
        }),
      ),
    );
  });

  it("blocca tutto l'import CSV se una riga è invalida, senza registrare movimenti nell'anteprima", async () => {
    mocks.preview.mockResolvedValue({
      valid_count: 1,
      invalid_count: 1,
      duplicate_count: 0,
      rows: [
        {
          row_number: 2,
          valid: true,
          duplicate: false,
          errors: [],
          receipt: {
            amount_cents: 6000,
            currency: "EUR",
            paid_on: "2026-10-26",
            reference: "BON-123",
          },
        },
        {
          row_number: 3,
          valid: false,
          duplicate: false,
          errors: ["Importo non valido"],
          receipt: null,
        },
      ],
    });
    render(
      <ReceiptImportModal
        onClose={vi.fn()}
        onImported={vi.fn()}
        onAuthError={vi.fn()}
      />,
    );
    const file = Object.assign(
      new File(["date;amount\n2026-10-26;60,00"], "incassi.csv", {
        type: "text/csv",
      }),
      { text: async () => "date;amount\n2026-10-26;60,00" },
    );
    fireEvent.change(screen.getByLabelText("File CSV"), {
      target: { files: [file] },
    });
    await screen.findByText("Importo non valido");
    expect(
      screen.getByRole("button", {
        name: "Conferma importazione di 1 incassi",
      }),
    ).toBeDisabled();
    expect(mocks.import).not.toHaveBeenCalled();
  });

  it("salta duplicati CSV e riusa la chiave dopo una risposta persa", async () => {
    mocks.preview.mockResolvedValue({
      valid_count: 2,
      invalid_count: 0,
      duplicate_count: 1,
      rows: [
        {
          row_number: 2,
          valid: true,
          duplicate: false,
          errors: [],
          receipt: {
            amount_cents: 6000,
            currency: "EUR",
            paid_on: "2026-10-26",
            reference: "BON-123",
          },
        },
        {
          row_number: 3,
          valid: true,
          duplicate: true,
          errors: [],
          receipt: {
            amount_cents: 6000,
            currency: "EUR",
            paid_on: "2026-10-26",
            reference: "BON-123",
          },
        },
      ],
    });
    mocks.import
      .mockRejectedValueOnce(new Error("Risposta non ricevuta"))
      .mockResolvedValueOnce({ created: 1, duplicates: 1, items: [receipt] });
    const onImported = vi.fn();
    render(
      <ReceiptImportModal
        onClose={vi.fn()}
        onImported={onImported}
        onAuthError={vi.fn()}
      />,
    );
    const content = "date;amount\n2026-10-26;60,00";
    const file = Object.assign(new File([content], "incassi.csv"), {
      text: async () => content,
    });
    fireEvent.change(screen.getByLabelText("File CSV"), {
      target: { files: [file] },
    });
    await screen.findByText(/1 nuovi incassi, 1 duplicati/);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Conferma importazione di 1 incassi",
      }),
    );
    await screen.findByText("Risposta non ricevuta");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Conferma importazione di 1 incassi",
      }),
    );
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(1, 1));
    expect(mocks.import.mock.calls[0]).toEqual(mocks.import.mock.calls[1]);
  });

  it("non sostituisce una ricerca recente con una risposta precedente in ritardo", async () => {
    let resolveOld: (value: ReturnType<typeof listResult>) => void = () => {};
    let resolveNew: (value: ReturnType<typeof listResult>) => void = () => {};
    mocks.list
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNew = resolve;
        }),
      );
    renderPage();
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Cerca incassi"), {
      target: { value: "Luca" },
    });
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    await act(async () =>
      resolveNew(listResult([{ ...receipt, id: 8, payer: "Luca Bianchi" }])),
    );
    await screen.findByRole("button", { name: "Apri incasso #8" });
    await act(async () => resolveOld(listResult()));
    expect(
      screen.queryByRole("button", { name: "Apri incasso #7" }),
    ).not.toBeInTheDocument();
  });
});

it("legge gli importi italiani senza arrotondamenti o interpretazioni ambigue", () => {
  expect(parseCents("0,29")).toBe(29);
  expect(parseCents("30.1")).toBe(3010);
  expect(parseCents("0")).toBeNull();
  expect(parseCents("-30")).toBeNull();
  expect(parseCents("1.234,56")).toBeNull();
  expect(parseCents("30,001")).toBeNull();
});
