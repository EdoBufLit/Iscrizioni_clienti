import { useEffect, useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { applySeo } from "../lib/seo";

export default function StripeDemoStorefrontResultPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get("account_id");
  const sessionId = searchParams.get("session_id");
  const isSuccess = useMemo(() => location.pathname.endsWith("/success"), [location.pathname]);

  useEffect(() => {
    applySeo({
      title: isSuccess ? "Stripe Demo Success" : "Stripe Demo Cancel",
      description: "Esito demo storefront Stripe Connect.",
      noindex: true,
    });
  }, [isSuccess]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white">
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-white/10 bg-white/5 px-6 py-8 shadow-2xl backdrop-blur md:px-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-sky-200">Stripe Connect Demo</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight">
          {isSuccess ? "Checkout demo completato" : "Checkout demo annullato"}
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-200">
          {isSuccess
            ? "Il checkout demo è stato aperto e completato sul connected account. Usa questa pagina solo come feedback del sample."
            : "Hai interrotto il checkout demo. Nessun impatto sul flusso reale delle quote associative ASSONAM."}
        </p>

        <div className="mt-6 rounded-[1.4rem] border border-white/10 bg-slate-900/60 p-5 text-sm text-slate-200">
          <p>Session ID: {sessionId ?? "n/d"}</p>
          <p className="mt-2">Connected account: {accountId ?? "n/d"}</p>
        </div>

        {accountId ? (
          <Link
            to={`/stripe-demo/storefront/${accountId}`}
            className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950"
          >
            Torna allo storefront demo
          </Link>
        ) : null}
      </div>
    </main>
  );
}
