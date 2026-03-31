import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchMembershipPaymentStatus,
  type MembershipPaymentStatusResponse,
} from "../lib/api";

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

  return (
    <section className="signup-wizard-shell py-16 md:py-20">
      <div className="container-shell max-w-3xl">
        <div className="signup-wizard-card mx-auto px-8 py-10 text-center md:px-12 md:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
            Esito pagamento quota
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
            {title}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-slate-500">
            {error ||
              (readyCardUrl
                ? "Pagamento confermato. Ti stiamo reindirizzando alla tua tessera."
                : status?.message || "Stiamo attendendo la conferma dal backend.")}
          </p>

          <div className="mt-8 rounded-[1.6rem] border border-slate-200 bg-slate-50/70 px-6 py-5 text-left">
            <p className="text-sm text-slate-500">Stato pagamento</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {status?.payment_status || (loadState === "loading" ? "pending" : "-")}
            </p>
            <p className="mt-4 text-sm text-slate-500">Stato tessera</p>
            <p className="mt-2 text-lg font-medium text-slate-900">
              {status?.card_status || "-"}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {readyCardUrl ? (
              <a className="btn-primary" href={readyCardUrl}>
                Apri la tua tessera
              </a>
            ) : null}
            {status?.can_retry ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => window.history.back()}
              >
                Riprova pagamento
              </button>
            ) : null}
            <Link className="btn-ghost" to="/associazioni">
              Torna alle associazioni
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
