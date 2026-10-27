import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import ModalShell from "../../../../components/ui/ModalShell";
import {
  AccountingError,
  reverseReceiptAllocation,
  voidReceipt,
  type AccountingAllocation,
  type AccountingEvent,
  type ReceiptDetail,
} from "../../../../lib/accounting";
import {
  accountingInput,
  accountingLabel,
  formatCents,
  formatReceiptDate,
  mutationKey,
  receiptMethodLabels,
  receiptSourceLabels,
  receiptStatusLabels,
} from "./accountingUi";
import ReceiptAllocationModal from "./ReceiptAllocationModal";
import ReceiptFormModal from "./ReceiptFormModal";

const eventLabels: Record<string, string> = {
  created: "Incasso registrato",
  receipt_created: "Incasso registrato",
  imported: "Incasso importato",
  synced: "Pagamento precedente allineato",
  legacy_imported: "Pagamento precedente allineato",
  adjusted: "Incasso rettificato",
  adjustment: "Incasso rettificato",
  allocated: "Quota abbinata",
  allocation: "Quota abbinata",
  reversed: "Abbinamento stornato",
  allocation_reversed: "Abbinamento stornato",
  voided: "Incasso annullato",
};
const snapshotLabels: Record<string, string> = {
  amount_cents: "Importo",
  allocated_cents: "Abbinato",
  unallocated_cents: "Residuo",
  net_cents: "Importo netto",
  method: "Metodo",
  paid_on: "Data incasso",
  payer: "Pagante",
  reference: "Riferimento",
  description: "Descrizione",
  status: "Stato",
  member_id: "Socio",
  membership_year: "Annualità",
  target_key: "Quota",
  allocation_id: "Abbinamento",
};

function Snapshot({
  value,
  title,
}: {
  value: Record<string, unknown> | null;
  title: string;
}) {
  if (!value)
    return (
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-[var(--theme-text-muted)]">—</p>
      </div>
    );
  const receipt =
    value.receipt &&
    typeof value.receipt === "object" &&
    !Array.isArray(value.receipt)
      ? (value.receipt as Record<string, unknown>)
      : value;
  const pairs = Object.entries(receipt).filter(
    ([key, item]) =>
      key in snapshotLabels && (item == null || typeof item !== "object"),
  );
  const allocations = Array.isArray(value.allocations)
    ? value.allocations.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
  if (!pairs.length && !allocations.length) return null;
  return (
    <div className="min-w-0">
      <p className="font-semibold">{title}</p>
      <dl className="mt-2 space-y-1">
        {pairs.map(([key, item]) => {
          let label = item == null ? "—" : String(item);
          if (key.endsWith("_cents") && typeof item === "number")
            label = formatCents(item);
          else if (
            key === "method" &&
            typeof item === "string" &&
            item in receiptMethodLabels
          )
            label =
              receiptMethodLabels[item as keyof typeof receiptMethodLabels];
          else if (
            key === "status" &&
            typeof item === "string" &&
            item in receiptStatusLabels
          )
            label =
              receiptStatusLabels[item as keyof typeof receiptStatusLabels];
          else if (key === "paid_on" && typeof item === "string")
            label = formatReceiptDate(item);
          return (
            <div key={key} className="break-words">
              <dt className="inline text-[var(--theme-text-muted)]">
                {snapshotLabels[key]}:{" "}
              </dt>
              <dd className="inline">{label}</dd>
            </div>
          );
        })}
      </dl>
      {allocations.length ? (
        <ul
          className="mt-3 space-y-1 text-xs text-[var(--theme-text-muted)]"
          aria-label={`${title}: abbinamenti`}
        >
          {allocations.map((allocation, index) => (
            <li key={String(allocation.id ?? index)}>
              {String(allocation.member_name ?? "Quota")} ·{" "}
              {typeof allocation.amount_cents === "number"
                ? formatCents(allocation.amount_cents)
                : "—"}{" "}
              · {allocation.reversed_at ? "Stornato" : "Attivo"}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function AccountingHistory({ events }: { events: AccountingEvent[] }) {
  return (
    <section aria-label="Storico contabile" className="space-y-3">
      <h3 className="text-lg font-semibold">Storico delle operazioni</h3>
      <p className="text-sm text-[var(--theme-text-muted)]">
        Ogni modifica conserva l'originale, il motivo e l'amministratore che
        l'ha registrata.
      </p>
      {!events.length ? (
        <p className="text-sm text-[var(--theme-text-muted)]">
          Nessuna operazione disponibile.
        </p>
      ) : (
        <ol className="space-y-3">
          {events.map((event) => (
            <li
              key={event.id}
              className="rounded-xl border border-[var(--theme-border)] p-4 text-sm"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{eventLabels[event.action] ?? event.action}</strong>
                <span className="text-[var(--theme-text-muted)]">
                  {formatReceiptDate(event.created_at)}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
                {event.actor_admin_id
                  ? `Amministratore #${event.actor_admin_id}`
                  : "Sistema"}{" "}
                · Operazione #{event.id}
              </p>
              {event.reason ? (
                <p className="mt-3 break-words">Motivo: {event.reason}</p>
              ) : null}
              {event.before || event.after ? (
                <details className="mt-3">
                  <summary className="cursor-pointer font-semibold text-[var(--theme-link)]">
                    Valori prima e dopo
                  </summary>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Snapshot title="Prima" value={event.before} />
                    <Snapshot title="Dopo" value={event.after} />
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ReverseModal({
  detail,
  allocation,
  onClose,
  onSaved,
  onReload,
  onAuthError,
}: {
  detail: ReceiptDetail;
  allocation?: AccountingAllocation;
  onClose: () => void;
  onSaved: (detail: ReceiptDetail) => void;
  onReload: () => Promise<void>;
  onAuthError: (error: unknown) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const request = useRef<{ signature: string; key: string } | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || reason.trim().length < 3) return;
    const body = {
      expected_version: detail.receipt.version,
      reason: reason.trim(),
    };
    const signature = JSON.stringify(body);
    if (request.current?.signature !== signature)
      request.current = { signature, key: mutationKey() };
    setSaving(true);
    setError("");
    setConflict(false);
    try {
      const next = allocation
        ? await reverseReceiptAllocation(detail.receipt.id, allocation.id, {
            ...body,
            request_key: request.current.key,
          })
        : await voidReceipt(detail.receipt.id, {
            ...body,
            request_key: request.current.key,
          });
      onSaved(next);
    } catch (failure) {
      onAuthError(failure);
      setConflict(failure instanceof AccountingError && failure.status === 409);
      setError(
        failure instanceof Error
          ? failure.message
          : "Impossibile registrare lo storno.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModalShell
      open
      title={
        allocation ? "Storna abbinamento" : "Annulla incasso contabilmente"
      }
      description={
        allocation
          ? `${formatCents(allocation.net_cents)} · ${allocation.member_name}`
          : `Incasso #${detail.receipt.id} · ${formatCents(detail.receipt.amount_cents)}`
      }
      onClose={onClose}
      closeDisabled={saving}
      closeOnEscape={!saving}
      closeOnOverlay={!saving}
    >
      <form className="space-y-4" onSubmit={submit}>
        <p className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-4 text-sm">
          {allocation
            ? "L'importo tornerà disponibile sulla ricevuta e la quota tornerà da coprire."
            : "Tutti gli abbinamenti attivi verranno stornati e la ricevuta sarà annullata. Il movimento originale rimane nello storico."}{" "}
          Le tessere già emesse restano valide. Questa operazione non esegue
          alcun rimborso.
        </p>
        <label className={accountingLabel}>
          Motivo dello storno
          <textarea
            className={`${accountingInput} min-h-28`}
            required
            minLength={3}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={saving}
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-[var(--theme-danger)]">
            {error}
          </p>
        ) : null}
        {conflict ? (
          <button
            className="btn-secondary"
            disabled={saving}
            type="button"
            onClick={() => {
              void onReload()
                .then(onClose)
                .catch((failure) => {
                  onAuthError(failure);
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "Ricaricamento non riuscito.",
                  );
                });
            }}
          >
            Ricarica incasso prima di riprovare
          </button>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            className="btn-secondary"
            type="button"
            disabled={saving}
            onClick={onClose}
          >
            Indietro
          </button>
          <button
            className="btn-primary"
            type="submit"
            disabled={saving || conflict || reason.trim().length < 3}
          >
            {saving
              ? "Registrazione…"
              : allocation
                ? "Conferma storno abbinamento"
                : "Conferma annullamento contabile"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

type Props = {
  detail: ReceiptDetail;
  defaultYear?: number;
  onClose: () => void;
  onChanged: (detail: ReceiptDetail) => void;
  onReload: () => Promise<void>;
  onAuthError: (error: unknown) => void;
};

export default function ReceiptDetailPanel({
  detail,
  defaultYear,
  onClose,
  onChanged,
  onReload,
  onAuthError,
}: Props) {
  const { receipt, allocations, events } = detail;
  const [action, setAction] = useState<"edit" | "allocate" | "void" | null>(
    null,
  );
  const [reversing, setReversing] = useState<AccountingAllocation | null>(null);
  const changed = (next: ReceiptDetail) => {
    setAction(null);
    setReversing(null);
    onChanged(next);
  };
  const canAllocate =
    receipt.status !== "voided" &&
    receipt.unallocated_cents > 0 &&
    receipt.source !== "provider";

  return (
    <section
      className="space-y-6 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface-solid)] p-5 sm:p-6"
      aria-labelledby={`receipt-detail-${receipt.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--theme-text-muted)]">
            {receiptSourceLabels[receipt.source]} ·{" "}
            {receiptStatusLabels[receipt.status]}
          </p>
          <h2
            id={`receipt-detail-${receipt.id}`}
            className="mt-1 text-2xl font-semibold"
          >
            Incasso #{receipt.id} ·{" "}
            {formatCents(receipt.amount_cents, receipt.currency)}
          </h2>
        </div>
        <button className="btn-secondary" type="button" onClick={onClose}>
          Chiudi dettaglio incasso
        </button>
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Data incasso", formatReceiptDate(receipt.paid_on)],
          ["Metodo", receiptMethodLabels[receipt.method]],
          [
            "Già abbinato",
            formatCents(receipt.allocated_cents, receipt.currency),
          ],
          [
            "Da abbinare",
            formatCents(receipt.unallocated_cents, receipt.currency),
          ],
          ["Pagante", receipt.payer || "—"],
          ["Riferimento", receipt.reference || "—"],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[var(--theme-text-muted)]">{label}</dt>
            <dd className="mt-1 break-words font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {receipt.description ? (
        <p className="break-words text-sm">{receipt.description}</p>
      ) : null}
      {receipt.source === "provider" ? (
        <p className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-4 text-sm">
          Importo, data e stato di questo pagamento online provengono dal
          provider e non sono rettificabili da qui. Gli abbinamenti mostrano il
          collegamento già verificato dall'app.
        </p>
      ) : receipt.permissions.reason ? (
        <p className="text-sm text-[var(--theme-text-muted)]">
          {receipt.permissions.reason}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {canAllocate ? (
          <button
            className="btn-primary"
            type="button"
            onClick={() => setAction("allocate")}
          >
            Abbina alle quote
          </button>
        ) : null}
        {receipt.permissions.can_adjust ? (
          <button
            className="btn-secondary"
            type="button"
            onClick={() => setAction("edit")}
          >
            Rettifica incasso
          </button>
        ) : null}
        {receipt.permissions.can_void ? (
          <button
            className="btn-secondary"
            type="button"
            onClick={() => setAction("void")}
          >
            Annulla incasso contabilmente
          </button>
        ) : null}
      </div>
      <section aria-label="Abbinamenti ricevuta" className="space-y-3">
        <h3 className="text-lg font-semibold">Abbinamenti alle quote</h3>
        {!allocations.length ? (
          <p className="text-sm text-[var(--theme-text-muted)]">
            Nessuna quota abbinata a questo incasso.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--theme-border)]">
            {allocations.map((allocation) => (
              <li
                key={allocation.id}
                className="flex flex-wrap items-start justify-between gap-4 py-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{allocation.member_name}</p>
                  <p className="mt-1 text-sm text-[var(--theme-text-muted)]">
                    {allocation.kind === "initial"
                      ? "Prima iscrizione"
                      : allocation.kind === "renewal"
                        ? "Rinnovo"
                        : "Tessera temporanea"}
                    {allocation.membership_year
                      ? ` · ${allocation.membership_year}`
                      : ""}{" "}
                    · {formatCents(allocation.amount_cents)}
                  </p>
                  <p className="mt-1 text-sm">
                    {allocation.reversed_at
                      ? `Stornato il ${formatReceiptDate(allocation.reversed_at)}`
                      : `Abbinato: ${formatCents(allocation.net_cents)}`}
                  </p>
                  {allocation.member_id ? (
                    <Link
                      to={`/org-admin/soci/${allocation.member_id}`}
                      className="mt-2 inline-block text-sm font-semibold text-[var(--theme-link)] underline underline-offset-4"
                    >
                      Apri socio
                    </Link>
                  ) : null}
                </div>
                {allocation.net_cents > 0 &&
                !allocation.reversed_at &&
                receipt.permissions.can_adjust ? (
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => setReversing(allocation)}
                  >
                    Storna abbinamento
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <AccountingHistory events={events} />
      {action === "edit" ? (
        <ReceiptFormModal
          key={`${receipt.id}:${receipt.version}`}
          receipt={receipt}
          onClose={() => setAction(null)}
          onSaved={changed}
          onReload={onReload}
          onAuthError={onAuthError}
        />
      ) : null}
      {action === "allocate" ? (
        <ReceiptAllocationModal
          receipt={receipt}
          defaultYear={defaultYear}
          onClose={() => setAction(null)}
          onSaved={changed}
          onReload={onReload}
          onAuthError={onAuthError}
        />
      ) : null}
      {action === "void" || reversing ? (
        <ReverseModal
          key={`${receipt.id}:${receipt.version}:${reversing?.id ?? "void"}`}
          detail={detail}
          allocation={reversing ?? undefined}
          onClose={() => {
            setAction(null);
            setReversing(null);
          }}
          onSaved={changed}
          onReload={onReload}
          onAuthError={onAuthError}
        />
      ) : null}
    </section>
  );
}
