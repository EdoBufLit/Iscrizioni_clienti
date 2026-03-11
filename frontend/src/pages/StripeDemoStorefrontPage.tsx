import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  createStripeDemoStorefrontCheckout,
  fetchStripeDemoStorefrontProducts,
  type StripeDemoProduct,
} from "../lib/api";
import { applySeo } from "../lib/seo";

function formatAmount(unitAmount: number | null, currency: string | null) {
  if (unitAmount == null || !currency) return "Prezzo non disponibile";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(unitAmount / 100);
}

export default function StripeDemoStorefrontPage() {
  const { accountId = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<StripeDemoProduct[]>([]);
  const [buyingProductId, setBuyingProductId] = useState<string | null>(null);

  useEffect(() => {
    applySeo({
      title: "Stripe Demo Storefront",
      description: "Storefront demo Stripe Connect collegato a un connected account di esempio.",
      noindex: true,
    });
  }, []);

  useEffect(() => {
    if (!accountId) {
      setError("Connected account non valido.");
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchStripeDemoStorefrontProducts(accountId)
      .then((payload) => {
        setItems(payload.items);
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Errore caricamento storefront demo."))
      .finally(() => setLoading(false));
  }, [accountId]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe_0%,#f8fafc_48%,#e2e8f0_100%)] px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white/85 px-6 py-8 shadow-2xl backdrop-blur md:px-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-sky-700">Stripe Connect Demo</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950">Storefront demo sul connected account</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
            Questo storefront è solo un sample tecnico. Serve a dimostrare prodotti creati sul connected account e direct
            charge Checkout con application fee piattaforma. Non è il futuro flusso quota associativa reale ASSONAM.
          </p>
          <div className="mt-4 inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
            Connected account: {accountId}
          </div>
        </section>

        {loading ? (
          <section className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-64 animate-pulse rounded-[1.8rem] border border-slate-200 bg-white/70" />
            ))}
          </section>
        ) : error ? (
          <section className="mt-6 rounded-[1.8rem] border border-rose-200 bg-rose-50 px-6 py-8 text-sm text-rose-800">
            {error}
          </section>
        ) : (
          <section className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article key={item.id} className="rounded-[1.8rem] border border-slate-200 bg-white px-6 py-6 shadow-lg">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-sky-50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700">
                    Demo product
                  </span>
                  <span className="text-sm font-bold text-slate-500">
                    {formatAmount(item.default_price.unit_amount, item.default_price.currency)}
                  </span>
                </div>
                <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">{item.name ?? "Prodotto demo"}</h2>
                <p className="mt-3 min-h-[5rem] text-sm leading-6 text-slate-500">
                  {item.description ?? "Nessuna descrizione disponibile."}
                </p>
                <button
                  type="button"
                  className="mt-6 w-full rounded-[1.1rem] bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={buyingProductId !== null}
                  onClick={() => {
                    setBuyingProductId(item.id);
                    createStripeDemoStorefrontCheckout(accountId, {
                      productId: item.id,
                      quantity: 1,
                    })
                      .then((payload) => {
                        window.location.href = payload.url;
                      })
                      .catch((err) => {
                        setError(err instanceof Error ? err.message : "Errore apertura checkout demo.");
                        setBuyingProductId(null);
                      });
                  }}
                >
                  {buyingProductId === item.id ? "Apertura checkout..." : "Buy with direct charge"}
                </button>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
