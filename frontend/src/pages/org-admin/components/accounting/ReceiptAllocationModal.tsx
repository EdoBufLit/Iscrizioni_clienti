import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "../../../../components/ui/ModalShell";
import {
  AccountingError,
  allocateReceipt,
  fetchReceiptTargets,
  type AccountingReceipt,
  type AccountingTarget,
  type ReceiptDetail,
} from "../../../../lib/accounting";
import {
  accountingInput,
  accountingLabel,
  centsInput,
  formatCents,
  mutationKey,
  parseCents,
} from "./accountingUi";

type SelectedTarget = { target: AccountingTarget; amount: string };
type Props = {
  receipt: AccountingReceipt;
  defaultYear?: number;
  onClose: () => void;
  onSaved: (detail: ReceiptDetail) => void;
  onReload: () => Promise<void>;
  onAuthError: (error: unknown) => void;
};

export default function ReceiptAllocationModal({
  receipt,
  defaultYear,
  onClose,
  onSaved,
  onReload,
  onAuthError,
}: Props) {
  const [query, setQuery] = useState("");
  const [yearInput, setYearInput] = useState(String(defaultYear ?? new Date().getFullYear()));
  const year = Number(yearInput);
  const validYear =
    /^\d{4}$/.test(yearInput) &&
    Number.isInteger(year) &&
    year >= 2000 &&
    year <= 2200;
  const [page, setPage] = useState(0);
  const [targets, setTargets] = useState<AccountingTarget[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, SelectedTarget>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const generation = useRef(0);
  const request = useRef<{ signature: string; key: string } | null>(null);

  const load = useCallback(
    (signal: AbortSignal) => {
      const current = ++generation.current;
      if (!validYear) {
        setTargets([]);
        setTotal(0);
        setLoading(false);
        return;
      }
      setLoading(true);
      void fetchReceiptTargets(
        receipt.id,
        { query: query.trim(), year, limit: 25, offset: page * 25 },
        signal,
      )
        .then((result) => {
          if (!signal.aborted && current === generation.current) {
            setTargets(result.items);
            setTotal(result.total);
          }
        })
        .catch((failure) => {
          if (!signal.aborted && current === generation.current) {
            onAuthError(failure);
            setError(
              failure instanceof Error
                ? failure.message
                : "Impossibile cercare le quote.",
            );
          }
        })
        .finally(() => {
          if (!signal.aborted && current === generation.current)
            setLoading(false);
        });
    },
    [onAuthError, page, query, receipt.id, validYear, year],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => load(controller.signal), 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      generation.current += 1;
    };
  }, [load]);

  const chosen = Object.values(selected);
  const amounts = chosen.map((item) => parseCents(item.amount));
  const sum = amounts.reduce<number>(
    (value, amount) => value + (amount ?? 0),
    0,
  );
  const invalidSelection =
    chosen.length === 0 ||
    chosen.length > 100 ||
    amounts.some((value) => value === null) ||
    chosen.some(
      (item) =>
        (parseCents(item.amount) ?? 0) > item.target.outstanding_cents ||
        item.target.currency !== receipt.currency,
    ) ||
    sum > receipt.unallocated_cents;
  const kindLabel = useMemo(
    () => ({
      initial: "Prima iscrizione",
      renewal: "Rinnovo",
      temporary: "Temporanea",
    }),
    [],
  );

  const toggle = (target: AccountingTarget, checked: boolean) => {
    setConfirming(false);
    setSelected((previous) => {
      const next = { ...previous };
      if (checked)
        next[target.target_key] = {
          target,
          amount: centsInput(
            Math.min(target.outstanding_cents, receipt.unallocated_cents),
          ),
        };
      else delete next[target.target_key];
      return next;
    });
  };

  const submit = async () => {
    if (saving || invalidSelection) return;
    const body = {
      expected_version: receipt.version,
      items: chosen
        .map((item) => ({
          target_key: item.target.target_key,
          amount_cents: parseCents(item.amount)!,
        }))
        .sort((a, b) => a.target_key.localeCompare(b.target_key)),
    };
    const signature = JSON.stringify(body);
    if (request.current?.signature !== signature)
      request.current = { signature, key: mutationKey() };
    setSaving(true);
    setError("");
    setConflict(false);
    try {
      onSaved(
        await allocateReceipt(receipt.id, {
          ...body,
          request_key: request.current.key,
        }),
      );
    } catch (failure) {
      onAuthError(failure);
      setConflict(failure instanceof AccountingError && failure.status === 409);
      setError(
        failure instanceof Error
          ? failure.message
          : "Abbinamento non riuscito.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open
      title={`Abbina incasso #${receipt.id}`}
      description={`Disponibili ${formatCents(receipt.unallocated_cents, receipt.currency)}. Puoi suddividere l'incasso fra più soci o coprire solo una parte della quota.`}
      onClose={onClose}
      closeDisabled={saving}
      closeOnEscape={!saving}
      closeOnOverlay={!saving}
      sizeClassName="max-w-4xl"
    >
      <div className="space-y-5">
        <p className="text-sm text-[var(--theme-text-muted)]">
          I suggerimenti aiutano la ricerca e richiedono la tua scelta. La
          tessera viene emessa dai flussi esistenti soltanto quando la quota è
          interamente coperta e ne ricorrono i requisiti.
        </p>
        {!confirming ? (
          <>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <label className={accountingLabel}>
                Cerca socio
                <input
                  className={accountingInput}
                  value={query}
                  disabled={saving}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                  placeholder="Nome, email o codice fiscale"
                  maxLength={160}
                />
              </label>
              <label className={accountingLabel}>
                Annualità
                <input
                  className={accountingInput}
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={yearInput}
                  aria-invalid={!validYear}
                  disabled={saving}
                  onChange={(event) => {
                    setYearInput(event.target.value);
                    setPage(0);
                  }}
                />
              </label>
            </div>
            {!validYear ? (
              <p className="text-sm text-[var(--theme-danger)]">
                Inserisci un'annualità di quattro cifre tra 2000 e 2200.
              </p>
            ) : null}
            {loading ? (
              <p
                className="text-sm text-[var(--theme-text-muted)]"
                role="status"
              >
                Ricerca quote…
              </p>
            ) : !targets.length ? (
              <p className="rounded-lg border border-[var(--theme-border)] p-4 text-sm">
                Nessuna quota trovata. Prova un'altra annualità o un'altra
                ricerca.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--theme-border)] rounded-xl border border-[var(--theme-border)]">
                {targets.map((target) => {
                  const isSelected = Boolean(selected[target.target_key]);
                  const disabled =
                    saving ||
                    target.already_paid ||
                    target.outstanding_cents <= 0 ||
                    target.currency !== receipt.currency;
                  return (
                    <li key={target.target_key} className="p-4">
                      <label className="flex items-start gap-3">
                        <input
                          className="mt-1 h-5 w-5 shrink-0 accent-[var(--theme-brand)]"
                          type="checkbox"
                          disabled={disabled}
                          checked={isSelected}
                          aria-label={`Seleziona ${target.member_name}, ${target.label}`}
                          onChange={(event) =>
                            toggle(target, event.target.checked)
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="block text-[var(--theme-text)]">
                            {target.member_name}
                          </strong>
                          <span className="block break-words text-sm text-[var(--theme-text-muted)]">
                            {target.label} · {kindLabel[target.kind]}
                            {target.membership_year
                              ? ` ${target.membership_year}`
                              : ""}
                          </span>
                          <span className="mt-1 block text-sm">
                            Residuo quota:{" "}
                            <strong>
                              {formatCents(
                                target.outstanding_cents,
                                target.currency,
                              )}
                            </strong>
                            {target.already_paid ? " · Già pagata" : ""}
                          </span>
                          {target.reasons.length ? (
                            <span className="mt-1 block text-xs text-[var(--theme-text-muted)]">
                              {target.reasons.join(" · ")}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <nav
              className="flex flex-wrap items-center justify-between gap-3"
              aria-label="Pagine quote da abbinare"
            >
              <span className="text-sm text-[var(--theme-text-muted)]">
                Pagina {page + 1} di {Math.max(1, Math.ceil(total / 25))}
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-secondary"
                  disabled={loading || page === 0 || saving}
                  onClick={() => setPage((value) => value - 1)}
                  type="button"
                >
                  Precedente
                </button>
                <button
                  className="btn-secondary"
                  disabled={loading || (page + 1) * 25 >= total || saving}
                  onClick={() => setPage((value) => value + 1)}
                  type="button"
                >
                  Successiva
                </button>
              </div>
            </nav>
          </>
        ) : (
          <p className="rounded-xl border border-[var(--theme-border-strong)] bg-[var(--theme-surface-muted)] p-4 text-sm">
            <strong>Conferma gli abbinamenti qui sotto.</strong> Verranno
            registrati insieme: {formatCents(sum, receipt.currency)} su{" "}
            {chosen.length} quote. Il residuo dell'incasso sarà{" "}
            {formatCents(receipt.unallocated_cents - sum, receipt.currency)}.
          </p>
        )}

        <section aria-label="Quote selezionate" className="space-y-3">
          <h4 className="font-semibold">Quote selezionate ({chosen.length})</h4>
          {!chosen.length ? (
            <p className="text-sm text-[var(--theme-text-muted)]">
              Seleziona almeno una quota. La selezione resta visibile anche
              cambiando ricerca o pagina.
            </p>
          ) : (
            chosen.map((item) => (
              <div
                key={item.target.target_key}
                className="rounded-xl border border-[var(--theme-border)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{item.target.member_name}</p>
                    <p className="text-sm text-[var(--theme-text-muted)]">
                      {item.target.label}
                    </p>
                  </div>
                  {!confirming ? (
                    <button
                      className="btn-secondary !min-h-10"
                      type="button"
                      disabled={saving}
                      onClick={() => toggle(item.target, false)}
                    >
                      Rimuovi
                    </button>
                  ) : null}
                </div>
                <label className={`${accountingLabel} mt-3`}>
                  Importo da abbinare a {item.target.member_name} (EUR)
                  <input
                    className={accountingInput}
                    value={item.amount}
                    inputMode="decimal"
                    disabled={saving || confirming}
                    onChange={(event) =>
                      setSelected((previous) => ({
                        ...previous,
                        [item.target.target_key]: {
                          ...item,
                          amount: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
                  Massimo{" "}
                  {formatCents(
                    item.target.outstanding_cents,
                    item.target.currency,
                  )}{" "}
                  per questa quota.
                </p>
              </div>
            ))
          )}
          <p className="text-sm font-semibold">
            Totale scelto: {formatCents(sum, receipt.currency)} · Disponibile:{" "}
            {formatCents(receipt.unallocated_cents, receipt.currency)}
          </p>
          {chosen.length && invalidSelection ? (
            <p className="text-sm text-[var(--theme-danger)]" role="alert">
              Controlla gli importi: ogni quota deve ricevere un importo
              positivo entro il proprio residuo, senza superare il totale
              disponibile (massimo 100 quote).
            </p>
          ) : null}
        </section>
        {error ? (
          <p role="alert" className="text-sm text-[var(--theme-danger)]">
            {error}
          </p>
        ) : null}
        {conflict ? (
          <div className="text-sm">
            <p>
              La ricevuta o una quota è cambiata. Nessun abbinamento di questa
              richiesta è stato salvato. Ricaricando dovrai verificare
              nuovamente la selezione.
            </p>
            <button
              className="btn-secondary mt-3"
              type="button"
              disabled={saving}
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
              Ricarica incasso e quote
            </button>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            className="btn-secondary"
            type="button"
            disabled={saving}
            onClick={confirming ? () => setConfirming(false) : onClose}
          >
            {confirming ? "Modifica selezione" : "Annulla"}
          </button>
          <button
            className="btn-primary"
            type="button"
            disabled={saving || invalidSelection || conflict}
            onClick={() => {
              if (confirming) void submit();
              else {
                setError("");
                setConfirming(true);
              }
            }}
          >
            {saving
              ? "Registrazione…"
              : confirming
                ? "Conferma abbinamenti"
                : "Controlla abbinamenti"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
