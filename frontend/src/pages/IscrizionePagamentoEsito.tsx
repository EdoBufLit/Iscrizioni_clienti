import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchMembershipPaymentStatus,
  type MembershipPaymentStatusResponse,
} from "../lib/api";
import {
  affiliationPaymentStatusMeta,
  membershipCardStatusMeta,
  resolveStatusMeta,
} from "../lib/statusLabels";

type LoadState = "loading" | "success" | "error";

export default function IscrizionePagamentoEsito() {
  const [params] = useSearchParams();
  const paymentIdParam = params.get("payment_id");
  const paymentId = paymentIdParam ? Number(paymentIdParam) : NaN;
  const [status, setStatus] = useState<MembershipPaymentStatusResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const readyCardUrl =
    status?.is_paid && status.card_status === "issued" ? status.active_card_page_url : null;
  const paymentStatus = resolveStatusMeta(
    affiliationPaymentStatusMeta,
    status?.payment_status || (loadState === "loading" ? "pending" : null),
    "-",
  );
  const cardStatus = resolveStatusMeta(membershipCardStatusMeta, status?.card_status, "-");

  useEffect(() => {
    if (!Number.isFinite(paymentId) || paymentId <= 0) {
      setLoadState("error");
      setError("Pagamento non valido.");
      return;
    }

    let active = true;
    let timer: number | null = null;

    const load = async () => {
      try {
        const next = await fetchMembershipPaymentStatus(paymentId);
        if (!active) return;
        setStatus(next);
        setLoadState("success");
        setError(null);
        if (next.payment_status === "pending") {
          timer = window.setTimeout(load, 3000);
        }
      } catch (err) {
        if (!active) return;
        setLoadState("error");
        setError(err instanceof Error ? err.message : "Errore verifica pagamento.");
      }
    };

    void load();

    return () => {
      active = false;
      if (timer != null) {
        window.clearTimeout(timer);
      }
    };
  }, [paymentId]);

  useEffect(() => {
    if (!readyCardUrl) return;
    const timer = window.setTimeout(() => {
      window.location.replace(readyCardUrl);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [readyCardUrl]);

  let title = "Verifica pagamento in corso";
  if (loadState === "error") {
    title = "Verifica pagamento non disponibile";
  } else if (readyCardUrl) {
    title = "Tessera pronta";
  } else if (status?.is_paid) {
    title = "Pagamento riuscito";
  } else if (status?.payment_status === "failed") {
    title = "Pagamento non riuscito";
  } else if (status?.payment_status === "cancelled") {
    title = "Pagamento annullato";
  } else if (status?.payment_status === "expired") {
    title = "Checkout scaduto";
  }

  const isPolling = loadState !== "error" && (loadState === "loading" || status?.payment_status === "pending");

  return (
    <section className="signup-wizard-shell py-12 sm:py-16 md:py-20">
      <div className="container-shell max-w-3xl">
        <div
          className="signup-wizard-card surface mx-auto px-6 py-8 text-center sm:px-8 sm:py-10 md:px-12 md:py-14"
          aria-busy={isPolling}
        >
          {isPolling ? (
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--theme-brand-soft)] text-[var(--theme-brand)]">
              <svg className="h-7 w-7 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
                <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : null}

          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--theme-brand)]">
            Esito pagamento quota
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--theme-text)] sm:text-4xl">
            {title}
          </h1>
          <p
            className="mx-auto mt-4 max-w-2xl text-base leading-8 text-[var(--theme-text-muted)]"
            role={loadState === "error" ? "alert" : "status"}
            aria-live={loadState === "error" ? "assertive" : "polite"}
            aria-atomic="true"
          >
            {error ||
              (readyCardUrl
                ? "Pagamento confermato. Ti stiamo reindirizzando alla tua tessera."
                : status?.message || "Stiamo attendendo la conferma dal backend.")}
          </p>

          <dl className="mt-8 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface-2)] px-6 py-5 text-left">
            <dt className="text-sm text-[var(--theme-text-muted)]">Stato pagamento</dt>
            <dd className="mt-2 text-2xl font-semibold text-[var(--theme-text)]">
              {paymentStatus.label}
            </dd>
            <dt className="mt-4 text-sm text-[var(--theme-text-muted)]">Stato tessera</dt>
            <dd className="mt-2 text-lg font-medium text-[var(--theme-text)]">
              {cardStatus.label}
            </dd>
          </dl>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {readyCardUrl ? (
              <a className="btn-primary px-6 py-3" href={readyCardUrl}>
                Apri la tua tessera
              </a>
            ) : null}
            {status?.can_retry ? (
              (status.org_slug || params.get("org_slug")) ? (
                <Link
                  className="btn-primary px-6 py-3"
                  to={`/associazioni/${status.org_slug || params.get("org_slug")}/iscrizione`}
                >
                  Riprova pagamento
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn-primary px-6 py-3"
                  onClick={() => window.history.back()}
                >
                  Riprova pagamento
                </button>
              )
            ) : null}
            <Link className="btn-secondary px-5 py-3" to="/associazioni">
              Torna alle associazioni
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
