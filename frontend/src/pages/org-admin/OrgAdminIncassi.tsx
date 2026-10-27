import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthError } from "../../lib/api";
import {
  fetchMemberAccounting,
  fetchReceipt,
  fetchReceipts,
  syncReceipts,
  type MemberAccounting,
  type ReceiptDetail,
  type ReceiptList,
  type ReceiptStatus,
} from "../../lib/accounting";
import {
  EmptyState,
  KpiCard,
  PageHeader,
  SectionPanel,
} from "./components/OrgAdminPrimitives";
import ReceiptDetailPanel from "./components/accounting/ReceiptDetailPanel";
import ReceiptFormModal from "./components/accounting/ReceiptFormModal";
import ReceiptImportModal from "./components/accounting/ReceiptImportModal";
import {
  accountingInput,
  accountingLabel,
  formatCents,
  formatReceiptDate,
  mutationKey,
  receiptMethodLabels,
  receiptSourceLabels,
  receiptStatusLabels,
} from "./components/accounting/accountingUi";

const PAGE_SIZE = 25;

export default function OrgAdminIncassi() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawMemberId = Number(params.get("member_id"));
  const memberId =
    Number.isSafeInteger(rawMemberId) && rawMemberId > 0 ? rawMemberId : null;
  const initialReceiptId = Number(params.get("receipt_id"));
  const requestedYear = Number(params.get("year"));
  const initialYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2200 ? requestedYear : new Date().getFullYear();
  const [state, setState] = useState<ReceiptStatus | "">("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ReceiptList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(
    Number.isSafeInteger(initialReceiptId) && initialReceiptId > 0
      ? initialReceiptId
      : null,
  );
  const [detail, setDetail] = useState<ReceiptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [memberYear, setMemberYear] = useState(initialYear);
  const [memberAccount, setMemberAccount] = useState<MemberAccounting | null>(
    null,
  );
  const [memberError, setMemberError] = useState("");
  const [memberLoading, setMemberLoading] = useState(false);
  const listGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const syncKey = useRef<string | null>(null);
  const syncRunning = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setMemberYear(initialYear); }, [initialYear]);

  const authError = useCallback(
    (failure: unknown) => {
      if (failure instanceof AuthError)
        navigate("/org-admin/login", { replace: true });
    },
    [navigate],
  );

  useEffect(() => {
    const current = ++listGeneration.current;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      void fetchReceipts(
        { state, q: query.trim(), limit: PAGE_SIZE, offset: page * PAGE_SIZE },
        controller.signal,
      )
        .then((result) => {
          if (!controller.signal.aborted && current === listGeneration.current) {
            if (page > 0 && page * PAGE_SIZE >= result.total) {
              setPage(Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1));
              return;
            }
            setData(result);
          }
        })
        .catch((failure) => {
          if (
            !controller.signal.aborted &&
            current === listGeneration.current
          ) {
            authError(failure);
            setError(
              failure instanceof Error
                ? failure.message
                : "Impossibile caricare gli incassi.",
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted && current === listGeneration.current)
            setLoading(false);
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      listGeneration.current += 1;
    };
  }, [authError, page, query, refresh, state]);

  useEffect(() => {
    const current = ++detailGeneration.current;
    if (selectedId === null) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError("");
      return;
    }
    const controller = new AbortController();
    setDetail(null);
    setDetailLoading(true);
    setDetailError("");
    void fetchReceipt(selectedId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && current === detailGeneration.current)
          setDetail(result);
      })
      .catch((failure) => {
        if (
          !controller.signal.aborted &&
          current === detailGeneration.current
        ) {
          authError(failure);
          setDetailError(
            failure instanceof Error
              ? failure.message
              : "Impossibile caricare il dettaglio dell'incasso.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && current === detailGeneration.current)
          setDetailLoading(false);
      });
    return () => {
      controller.abort();
      detailGeneration.current += 1;
    };
  }, [authError, selectedId]);

  useEffect(() => {
    if (!memberId) {
      setMemberAccount(null);
      return;
    }
    const controller = new AbortController();
    setMemberLoading(true);
    setMemberError("");
    setMemberAccount(null);
    void fetchMemberAccounting(memberId, memberYear, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setMemberAccount(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          authError(failure);
          setMemberError(
            failure instanceof Error
              ? failure.message
              : "Impossibile caricare il saldo del socio.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setMemberLoading(false);
      });
    return () => controller.abort();
  }, [authError, memberId, memberYear, refresh]);

  const reloadDetail = useCallback(async () => {
    if (selectedId === null) return;
    const current = ++detailGeneration.current;
    setDetailLoading(true);
    try {
      const next = await fetchReceipt(selectedId);
      if (current === detailGeneration.current) {
        setDetail(next);
        setRefresh((value) => value + 1);
      }
    } finally {
      if (current === detailGeneration.current) setDetailLoading(false);
    }
  }, [selectedId]);

  const changed = useCallback((next: ReceiptDetail) => {
    setSelectedId(next.receipt.id);
    setDetail(next);
    setCreating(false);
    setNotice("Registro contabile aggiornato.");
    setRefresh((value) => value + 1);
  }, []);

  const sync = async () => {
    if (syncRunning.current) return;
    syncRunning.current = true;
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      let created = 0;
      let hasMore = false;
      // Bounded transactions keep large histories responsive. A subsequent
      // click resumes remaining records without importing anything twice.
      for (let batch = 0; batch < 10; batch += 1) {
        syncKey.current ??= mutationKey();
        const result = await syncReceipts(syncKey.current);
        syncKey.current = null;
        if (!alive.current) return;
        created += result.created;
        hasMore = result.has_more === true;
        setNotice(`${created} pagamenti allineati al registro…`);
        if (!hasMore) break;
      }
      setNotice(
        `${created} pagamenti precedenti aggiunti al registro. Nessun nuovo incasso o rimborso effettuato.${hasMore ? " Restano altri movimenti: premi Aggiorna pagamenti per continuare." : ""}`,
      );
      setRefresh((value) => value + 1);
      if (selectedId !== null) await reloadDetail();
    } catch (failure) {
      if (!alive.current) return;
      authError(failure);
      setError(
        failure instanceof Error
          ? failure.message
          : "Impossibile allineare i pagamenti. Puoi riprovare.",
      );
    } finally {
      syncRunning.current = false;
      if (alive.current) setSyncing(false);
    }
  };

  return (
    <div className="container-shell org-admin-mobile-page space-y-6 py-8">
      <PageHeader
        eyebrow="Contabilità"
        title="Incassi e riconciliazione"
        subtitle="Registra gli importi ricevuti, abbinali alle quote e conserva ogni rettifica nello storico."
        actions={
          <>
            <button
              className="btn-secondary"
              type="button"
              disabled={syncing}
              onClick={() => {
                void sync();
              }}
            >
              {syncing ? "Aggiornamento…" : "Aggiorna pagamenti"}
            </button>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => setImporting(true)}
            >
              Importa CSV
            </button>
            <button
              className="btn-primary"
              type="button"
              onClick={() => setCreating(true)}
            >
              Registra incasso
            </button>
          </>
        }
      />
      <p className="text-sm text-[var(--theme-text-muted)]">
        Aggiorna pagamenti allinea gli incassi già confermati dall'app, compresi
        quelli online. Le rettifiche sono contabili: non eseguono rimborsi e non
        revocano tessere già emesse.
      </p>
      {notice ? (
        <p
          role="status"
          className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-4 text-sm font-semibold text-[var(--theme-success)]"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--theme-border)] p-4 text-sm text-[var(--theme-danger)]"
        >
          {error}
        </p>
      ) : null}
      {memberId ? (
        <SectionPanel
          title={`Saldo del socio #${memberId}`}
          eyebrow="Contesto selezionato"
          action={
            <label className={accountingLabel}>
              Annualità saldo
              <select
                className={accountingInput}
                value={memberYear}
                onChange={(event) => setMemberYear(Number(event.target.value))}
              >
                {Array.from(
                  { length: 8 },
                  (_, index) => new Date().getFullYear() - 4 + index,
                ).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          }
        >
          {memberLoading ? (
            <p role="status" className="text-sm">
              Caricamento saldo…
            </p>
          ) : memberError ? (
            <p role="alert" className="text-sm text-[var(--theme-danger)]">
              {memberError}
            </p>
          ) : memberAccount ? (
            <>
              <dl className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Quota prevista", memberAccount.balance.expected_cents],
                  ["Incassato netto", memberAccount.balance.paid_cents],
                  ["Residuo quota", memberAccount.balance.outstanding_cents],
                ].map(([label, amount]) => (
                  <div key={String(label)}>
                    <dt className="text-sm text-[var(--theme-text-muted)]">
                      {label}
                    </dt>
                    <dd className="mt-1 text-xl font-semibold">
                      {formatCents(
                        Number(amount),
                        memberAccount.balance.currency,
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm text-[var(--theme-text-muted)]">
                Saldo annuale {memberYear}; gli acquisti temporanei sono
                separati.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {memberAccount.receipts.map((receipt) => (
                  <button
                    className="btn-secondary"
                    type="button"
                    key={receipt.id}
                    onClick={() => setSelectedId(receipt.id)}
                  >
                    Incasso #{receipt.id} · {formatCents(receipt.amount_cents)}
                  </button>
                ))}
                {!memberAccount.receipts.length ? (
                  <p className="text-sm text-[var(--theme-text-muted)]">
                    Nessun incasso collegato al socio per questa annualità.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </SectionPanel>
      ) : null}

      {data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Incassi registrati"
            value={formatCents(data.kpis.total_cents)}
            hint="Movimenti non annullati"
          />
          <KpiCard
            label="Abbinati alle quote"
            value={formatCents(data.kpis.allocated_cents)}
            tone="success"
          />
          <KpiCard
            label="Da abbinare"
            value={formatCents(data.kpis.unallocated_cents)}
            tone="warning"
          />
          <KpiCard
            label="Incassi con residuo"
            value={data.kpis.unmatched_count}
            tone="info"
          />
        </div>
      ) : null}

      <SectionPanel title="Registro incassi" eyebrow="Ricevute e movimenti">
        <div className="mb-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem]">
          <label className={accountingLabel}>
            Cerca incassi
            <input
              className={accountingInput}
              type="search"
              maxLength={160}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="Pagante, riferimento o descrizione"
            />
          </label>
          <label className={accountingLabel}>
            Stato abbinamento
            <select
              className={accountingInput}
              value={state}
              onChange={(event) => {
                setState(event.target.value as ReceiptStatus | "");
                setPage(0);
              }}
            >
              <option value="">Tutti gli stati</option>
              {Object.entries(receiptStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {loading ? (
          <p
            role="status"
            className="mb-4 text-sm text-[var(--theme-text-muted)]"
          >
            Caricamento incassi…
          </p>
        ) : null}
        {!loading && !data?.items.length ? (
          <EmptyState
            title="Nessun incasso in questo elenco"
            description="Modifica la ricerca oppure registra un incasso ricevuto. Aggiorna pagamenti per allineare lo storico già registrato nell'app."
          />
        ) : (
          <ul
            className="divide-y divide-[var(--theme-border)] rounded-xl border border-[var(--theme-border)]"
            aria-label="Elenco incassi"
          >
            {data?.items.map((receipt) => (
              <li key={receipt.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold">
                        {formatCents(receipt.amount_cents, receipt.currency)}
                      </h3>
                      <span className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-2 py-1 text-xs">
                        {receiptStatusLabels[receipt.status]}
                      </span>
                    </div>
                    <p className="mt-2 break-words text-sm">
                      {receipt.payer || "Pagante non indicato"}
                      {receipt.reference ? ` · ${receipt.reference}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-[var(--theme-text-muted)]">
                      {formatReceiptDate(receipt.paid_on)} ·{" "}
                      {receiptMethodLabels[receipt.method]} ·{" "}
                      {receiptSourceLabels[receipt.source]} · #{receipt.id}
                    </p>
                    <p className="mt-2 text-sm">
                      Abbinato {formatCents(receipt.allocated_cents)} · Da
                      abbinare {formatCents(receipt.unallocated_cents)}
                    </p>
                  </div>
                  <button
                    className={
                      selectedId === receipt.id
                        ? "btn-primary"
                        : "btn-secondary"
                    }
                    type="button"
                    onClick={() =>
                      setSelectedId((current) =>
                        current === receipt.id ? null : receipt.id,
                      )
                    }
                    aria-expanded={selectedId === receipt.id}
                    aria-label={`${selectedId === receipt.id ? "Chiudi" : "Apri"} incasso #${receipt.id}`}
                  >
                    {selectedId === receipt.id
                      ? "Chiudi dettaglio"
                      : "Apri incasso"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <nav
          className="mt-5 flex flex-wrap items-center justify-between gap-3"
          aria-label="Pagine incassi"
        >
          <span className="text-sm text-[var(--theme-text-muted)]">
            {data?.total ?? 0} incassi · Pagina {page + 1} di{" "}
            {Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))}
          </span>
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              disabled={loading || page === 0}
              type="button"
              onClick={() => setPage((value) => value - 1)}
            >
              Precedente
            </button>
            <button
              className="btn-secondary"
              disabled={loading || (page + 1) * PAGE_SIZE >= (data?.total ?? 0)}
              type="button"
              onClick={() => setPage((value) => value + 1)}
            >
              Successiva
            </button>
          </div>
        </nav>
      </SectionPanel>
      {selectedId !== null && detailLoading ? (
        <p role="status" className="text-sm">
          Caricamento dettaglio incasso…
        </p>
      ) : null}
      {selectedId !== null && detailError ? (
        <p role="alert" className="text-sm text-[var(--theme-danger)]">
          {detailError}
        </p>
      ) : null}
      {selectedId !== null && detail ? (
        <ReceiptDetailPanel
          key={detail.receipt.id}
          detail={detail}
          defaultYear={memberYear}
          onClose={() => setSelectedId(null)}
          onChanged={changed}
          onReload={reloadDetail}
          onAuthError={authError}
        />
      ) : null}
      {creating ? (
        <ReceiptFormModal
          onClose={() => setCreating(false)}
          onSaved={changed}
          onAuthError={authError}
        />
      ) : null}
      {importing ? (
        <ReceiptImportModal
          onClose={() => setImporting(false)}
          onImported={(created, duplicates) => {
            setImporting(false);
            setNotice(
              `${created} incassi importati; ${duplicates} duplicati saltati.`,
            );
            setRefresh((value) => value + 1);
          }}
          onAuthError={authError}
        />
      ) : null}
    </div>
  );
}
