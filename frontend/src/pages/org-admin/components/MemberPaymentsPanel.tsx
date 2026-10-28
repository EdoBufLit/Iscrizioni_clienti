import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthError, type OrgAdminMemberDetail } from "../../../lib/api";
import { fetchMemberAccounting, type MemberAccounting } from "../../../lib/accounting";
import { formatCents, receiptStatusLabels } from "./accounting/accountingUi";
import { formatMemberDate, paymentHistoryLabel, paymentMethodLabel } from "./memberDetailPresentation";

type Props = {
  member: OrgAdminMemberDetail;
  paymentStatus: { label: string; tone: string };
  onRegisterPayment: () => void;
  registering: boolean;
};

export default function MemberPaymentsPanel({ member, paymentStatus, onRegisterPayment, registering }: Props) {
  const navigate = useNavigate();
  const [account, setAccount] = useState<MemberAccounting | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const temporary = member.membership_type === "temporary";
  const year = member.card_year ?? Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Rome", year: "numeric" }).format(new Date()));

  useEffect(() => {
    setAccount(null);
    setError(null);
    if (temporary) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void fetchMemberAccounting(member.id, year, controller.signal)
      .then(result => { if (!controller.signal.aborted) setAccount(result); })
      .catch(reason => {
        if (controller.signal.aborted) return;
        if (reason instanceof AuthError) navigate("/org-admin/login", { replace: true });
        setError(reason instanceof Error ? reason.message : "Saldo non disponibile. Riprova.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [member.id, year, temporary, retry, navigate]);

  const balance = account?.balance;
  const partial = member.payment_status === "manual_partial" || Boolean(balance && balance.paid_cents > 0 && balance.paid_cents < balance.expected_cents);
  const reversed = member.payment_status === "manual_reversed";
  const paid = Boolean(member.card_is_paid || ["completed", "manual_completed"].includes(member.payment_status ?? "") || (balance && balance.expected_cents > 0 && balance.paid_cents >= balance.expected_cents));
  const quotaStatus = reversed ? paymentStatus : partial
    ? { label: "Parzialmente pagata", tone: "border-amber-200 bg-amber-50 text-amber-700" }
    : paid ? { label: "Pagata", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" }
      : balance && balance.outstanding_cents > 0 ? { label: "In attesa", tone: "border-amber-200 bg-amber-50 text-amber-700" }
        : paymentStatus;
  // payment_required governs online payment before card issue; cash-only clubs can still have a fee due.
  const hasUnpaidQuota = temporary
    ? member.payment_required || Number(member.membership_fee_snapshot) > 0
    : Boolean(balance && balance.paid_cents === 0 && balance.expected_cents > 0);
  const canRegister = Boolean(hasUnpaidQuota && !partial && !reversed && !paid && !member.deleted_at && member.status.toLowerCase() !== "deleted" && member.workflow_status?.toLowerCase() !== "rejected");
  const incassiUrl = `/org-admin/incassi?member_id=${member.id}&year=${year}`;
  const payments = member.membership_payments ?? [];
  const legacyPayments = payments.length ? [] : member.payments ?? [];

  return (
    <div className="member-detail-stack">
      <section className="member-detail-panel" aria-labelledby="member-payment-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="member-payment-title" className="text-lg font-semibold">{temporary ? "Quota tessera temporanea" : `Quota ${year}`}</h2>
          <span className={`member-detail-badge ${quotaStatus.tone}`}>{quotaStatus.label}</span>
        </div>
        {!temporary && (
          <div className="mt-4" aria-live="polite">
            {loading ? <p className="text-sm text-[var(--theme-text-muted)]" role="status">Caricamento saldo…</p> : error ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-[var(--theme-danger)]" role="alert">{error}</p>
                <button type="button" className="btn-ghost !px-3 !py-2" onClick={() => setRetry(value => value + 1)}>Riprova saldo</button>
              </div>
            ) : balance ? (
              <dl className="member-detail-balance grid grid-cols-3 gap-3">
                {[["Prevista", balance.expected_cents], ["Incassato netto", balance.paid_cents], ["Residuo", balance.outstanding_cents]].map(([label, amount]) => (
                  <div key={String(label)} className="min-w-0">
                    <dt className="text-xs text-[var(--theme-text-muted)]">{label}</dt>
                    <dd className="mt-1 break-words text-base font-semibold sm:text-xl">{formatCents(Number(amount), balance.currency)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        )}
        {partial && <p className="mt-4 text-sm text-[var(--theme-text-muted)]">Quota parzialmente riconciliata: registra il residuo in Incassi.</p>}
        {reversed && <p className="mt-4 text-sm text-[var(--theme-text-muted)]">Incasso stornato: verifica gli abbinamenti e le rettifiche in Incassi.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {canRegister && <button type="button" className="btn-primary !px-4 !py-3" disabled={registering} onClick={onRegisterPayment}>+ Registra pagamento</button>}
          <Link className="btn-ghost !px-4 !py-3" to={incassiUrl}>{partial ? "Completa saldo in Incassi" : paid || reversed ? "Verifica incassi e rettifiche" : "Apri incassi del socio"}</Link>
        </div>
      </section>

      <section className="member-detail-panel" aria-labelledby="member-payment-history-title">
        <h2 id="member-payment-history-title" className="text-lg font-semibold">Pagamenti registrati</h2>
        {payments.length || legacyPayments.length ? (
          <ul className="mt-3 divide-y divide-[var(--theme-border)]">
            {payments.map(payment => (
              <li key={`membership-${payment.id}`} className="py-4 first:pt-1 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{payment.payment_reason || "Quota associativa"}</p>
                    <p className="mt-1 text-sm">{payment.amount == null ? "Importo non indicato" : formatCents(Math.round(payment.amount * 100), payment.currency || "EUR")}</p>
                  </div>
                  <span className="member-detail-badge border-[var(--theme-border)] bg-[var(--theme-surface-muted)] text-[var(--theme-text)]">{paymentHistoryLabel(payment.status)}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--theme-text-muted)]">{payment.source === "manual" ? "Registrazione manuale" : payment.provider.toLowerCase() === "sumup" ? "SumUp" : "Pagamento online"} · {formatMemberDate(payment.confirmed_at || payment.created_at)}</p>
                {payment.notes && <p className="mt-2 whitespace-pre-line break-words text-sm text-[var(--theme-text-muted)]">{payment.notes}</p>}
              </li>
            ))}
            {legacyPayments.map(payment => (
              <li key={`legacy-${payment.id}`} className="py-4 first:pt-1 last:pb-0">
                <p className="font-semibold">{formatCents(payment.amount_cents)} · {paymentMethodLabel(payment.method)}</p>
                <p className="mt-1 text-sm text-[var(--theme-text-muted)]">{formatMemberDate(payment.paid_at)}</p>
                {payment.notes && <p className="mt-2 whitespace-pre-line break-words text-sm text-[var(--theme-text-muted)]">{payment.notes}</p>}
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-[var(--theme-text-muted)]">Nessun pagamento registrato.</p>}
      </section>

      {!temporary && account && (
        <section className="member-detail-panel" aria-labelledby="member-receipts-title">
          <h2 id="member-receipts-title" className="text-lg font-semibold">Incassi collegati</h2>
          {account.receipts.length ? (
            <ul className="mt-3 divide-y divide-[var(--theme-border)]">
              {account.receipts.map(receipt => (
                <li key={receipt.id} className="py-4 first:pt-1 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link className="font-semibold underline underline-offset-4" to={`${incassiUrl}&receipt_id=${receipt.id}`}>Incasso #{receipt.id}</Link>
                    <span className="member-detail-badge border-[var(--theme-border)] bg-[var(--theme-surface-muted)] text-[var(--theme-text)]">{receiptStatusLabels[receipt.status] ?? "Da verificare"}</span>
                  </div>
                  <p className="mt-2 text-sm">Importo incasso: {formatCents(receipt.amount_cents, receipt.currency)}</p>
                  <p className="mt-1 text-sm text-[var(--theme-text-muted)]">{paymentMethodLabel(receipt.method)} · {formatMemberDate(receipt.paid_on)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-[var(--theme-text-muted)]">Nessun incasso riconciliato collegato.</p>}
        </section>
      )}
    </div>
  );
}
