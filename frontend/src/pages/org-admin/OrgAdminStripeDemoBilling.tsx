import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  createOrgAdminStripeConnectedAccount,
  createOrgAdminStripeDemoProduct,
  createOrgAdminStripeOnboardingLink,
  createOrgAdminStripePlatformPortal,
  createOrgAdminStripePlatformSubscriptionCheckout,
  fetchOrgAdminStripeDemoProducts,
  fetchOrgAdminStripeDemoState,
  type OrgAdminStripeDemoState,
  type StripeDemoProduct,
} from "../../lib/api";
import { applySeo } from "../../lib/seo";
import Skeleton from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/ToastProvider";

const inputClass =
  "mt-1 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 focus:bg-white";

function formatAmount(unitAmount: number | null, currency: string | null) {
  if (unitAmount == null || !currency) return "Prezzo non disponibile";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(unitAmount / 100);
}

export default function OrgAdminStripeDemoBilling() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<OrgAdminStripeDemoState | null>(null);
  const [products, setProducts] = useState<StripeDemoProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "19.90",
    currency: "eur",
  });
  const handledSearchAction = useRef<string | null>(null);

  const connectedAccountId = state?.connected_account_id ?? null;
  const storefrontPath = connectedAccountId ? `/stripe-demo/storefront/${connectedAccountId}` : null;
  const storefrontAbsoluteUrl = storefrontPath ? `${window.location.origin}${storefrontPath}` : null;

  const loadState = async () => {
    setLoading(true);
    try {
      const nextState = await fetchOrgAdminStripeDemoState();
      setState(nextState);
      if (nextState.enabled && nextState.connected_account_id) {
        setProductsLoading(true);
        const result = await fetchOrgAdminStripeDemoProducts();
        setProducts(result.items);
      } else {
        setProducts([]);
      }
    } finally {
      setLoading(false);
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    applySeo({
      title: "Stripe Connect Demo",
      description: "Demo isolato Stripe Connect per connected account, onboarding e storefront.",
      noindex: true,
    });
  }, []);

  useEffect(() => {
    void loadState().catch((error) => {
      showToast({
        title: "Stripe Demo",
        message: error instanceof Error ? error.message : "Errore caricamento demo Stripe.",
        tone: "error",
      });
    });
  }, []);

  useEffect(() => {
    const onboardingState = searchParams.get("onboarding");
    const stripeReturn = searchParams.get("stripe_return");
    const subscriptionSessionId = searchParams.get("session_id");
    const marker = `${onboardingState ?? ""}:${stripeReturn ?? ""}:${subscriptionSessionId ?? ""}`;
    if (handledSearchAction.current === marker) return;
    handledSearchAction.current = marker;

    if (onboardingState === "return" || stripeReturn === "1") {
      showToast({
        title: "Stripe Demo",
        message: "Onboarding rientrato da Stripe. Ho aggiornato lo stato account in tempo reale.",
        tone: "success",
      });
      void loadState().catch(() => {});
    } else if (onboardingState === "refresh") {
      void (async () => {
        try {
          setBusyAction("onboard");
          const payload = await createOrgAdminStripeOnboardingLink();
          window.location.href = payload.url;
          return;
        } catch (error) {
          showToast({
            title: "Stripe Demo",
            message: error instanceof Error ? error.message : "Errore rigenerazione link onboarding.",
            tone: "error",
          });
        } finally {
          setBusyAction(null);
        }
        const next = new URLSearchParams(searchParams);
        next.delete("onboarding");
        setSearchParams(next, { replace: true });
      })();
    }

    if (subscriptionSessionId) {
      showToast({
        title: "Stripe Demo",
        message: "Checkout subscription completato. Verifica lo stato aggiornato sotto.",
        tone: "success",
      });
      void loadState().catch(() => {});
    }
  }, [searchParams, setSearchParams, showToast]);

  const statusChips = useMemo(() => {
    if (!state?.account) return [];
    return [
      {
        label: state.account.onboarding_complete ? "Onboarding completo" : "Onboarding incompleto",
        tone: state.account.onboarding_complete ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200",
      },
      {
        label: state.account.ready_to_process_payments ? "Card payments attivi" : "Card payments inattivi",
        tone: state.account.ready_to_process_payments ? "bg-sky-50 text-sky-700 ring-sky-200" : "bg-neutral-100 text-neutral-600 ring-neutral-200",
      },
    ];
  }, [state]);

  const runAction = async (action: string, callback: () => Promise<void>) => {
    setBusyAction(action);
    try {
      await callback();
    } catch (error) {
      showToast({
        title: "Stripe Demo",
        message: error instanceof Error ? error.message : "Operazione non completata.",
        tone: "error",
      });
    } finally {
      setBusyAction(null);
    }
  };

  if (loading) {
    return (
      <div className="container-shell py-8 space-y-6">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="container-shell py-8 space-y-8">
      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-[2rem] bg-neutral-900 px-8 py-10 shadow-xl">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f46e5_0%,#0ea5e9_100%)] opacity-10 mix-blend-overlay"></div>
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white ring-1 ring-white/20">
              <svg className="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Stripe Connect Demo
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Configurazione e Piattaforma
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-neutral-300">
              Area demo isolata per simulare il flusso Stripe Connect. Permette di testare onboarding di sub-account, 
              sottoscrizioni alla piattaforma e uno storefront prodotti virtuale, separato dal flusso reale delle quote associative.
            </p>
          </div>
          {storefrontAbsoluteUrl && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm lg:w-80 shrink-0">
              <p className="text-xs font-bold uppercase tracking-widest text-sky-400">Storefront pubblico</p>
              <p className="mt-2 text-sm font-medium text-white truncate opacity-90">{storefrontAbsoluteUrl}</p>
              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-neutral-900 transition hover:bg-neutral-100"
                  onClick={() => navigator.clipboard.writeText(storefrontAbsoluteUrl).then(() => showToast({ title: "Copiato", message: "Link copiato", tone: "success" }))}
                >
                  Copia Link
                </button>
                <a
                  href={storefrontPath ?? "#"}
                  className="flex-1 rounded-xl border border-white/20 bg-transparent px-4 py-2 text-center text-xs font-bold uppercase tracking-widest text-white transition hover:bg-white/10"
                  target="_blank"
                  rel="noreferrer"
                >
                  Visita
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      {!state?.enabled ? (
        <section className="rounded-[2rem] border border-amber-200 bg-amber-50 px-8 py-10 text-center">
          <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mb-4">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-amber-900">Demo Stripe Disabilitata</h2>
          <p className="mt-3 text-sm font-medium text-amber-700 max-w-xl mx-auto">
            {state?.message ?? "Attiva la variabile d'ambiente ENABLE_STRIPE_CONNECT_DEMO nel backend per sbloccare questa funzionalità."}
          </p>
        </section>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Step 1: Connected Account */}
          <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">1</span>
                  <h2 className="text-lg font-bold text-neutral-900">Connected Account</h2>
                </div>
                <p className="mt-1 text-sm font-medium text-neutral-500 pl-8">
                  Stato dell'account sub-merchant
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadState()}
                className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition"
                title="Aggiorna stato"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            <div className="flex-1 pt-6">
              {connectedAccountId ? (
                <div className="space-y-6">
                  <div className="rounded-2xl bg-neutral-50 p-5 border border-neutral-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Account ID</p>
                    <p className="mt-1 text-sm font-mono text-neutral-900">{connectedAccountId}</p>
                    
                    <div className="mt-4 flex flex-wrap gap-2">
                      {statusChips.map((chip) => (
                        <span key={chip.label} className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ring-1 ring-inset ${chip.tone}`}>
                          {chip.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {state.account && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Nome</p>
                        <p className="mt-1 text-sm font-semibold text-neutral-900">{state.account.display_name ?? "-"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Email</p>
                        <p className="mt-1 text-sm font-semibold text-neutral-900 truncate" title={state.account.contact_email ?? ""}>{state.account.contact_email ?? "-"}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-6 py-10 text-center">
                  <p className="text-sm font-bold text-neutral-900">Nessun account collegato</p>
                  <p className="mt-1 text-xs font-medium text-neutral-500">Crea un account per iniziare a ricevere pagamenti.</p>
                </div>
              )}
            </div>

            <div className="pt-6 mt-auto">
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-neutral-900 px-4 py-3 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:opacity-50"
                  disabled={busyAction !== null}
                  onClick={() =>
                    void runAction("connect", async () => {
                      await createOrgAdminStripeConnectedAccount();
                      showToast({ title: "Stripe Demo", message: "Connected account demo pronto.", tone: "success" });
                      await loadState();
                    })
                  }
                >
                  {busyAction === "connect" ? "Caricamento..." : connectedAccountId ? "Ricrea Account" : "Crea Account"}
                </button>
                {connectedAccountId && (
                  <button
                    type="button"
                    className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-widest text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
                    disabled={busyAction !== null}
                    onClick={() =>
                      void runAction("onboard", async () => {
                        const payload = await createOrgAdminStripeOnboardingLink();
                        window.location.href = payload.url;
                      })
                    }
                  >
                    {busyAction === "onboard" ? "Apertura..." : "Apri Onboarding"}
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Step 2: Subscription */}
          <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm flex flex-col">
            <div className="border-b border-neutral-100 pb-5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">2</span>
                <h2 className="text-lg font-bold text-neutral-900">Platform Subscription</h2>
              </div>
              <p className="mt-1 text-sm font-medium text-neutral-500 pl-8">
                Abbonamento ai servizi della piattaforma
              </p>
            </div>

            <div className="flex-1 pt-6">
              <div className="rounded-2xl bg-gradient-to-br from-brand/5 to-transparent p-6 border border-brand/10">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-brand">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-neutral-900">Stato attuale</p>
                    <p className="text-lg font-black text-brand mt-0.5">{state.subscription_status ?? "Nessun abbonamento"}</p>
                  </div>
                </div>
                {state.subscription_id && (
                  <div className="mt-5 pt-4 border-t border-brand/10">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">ID Sottoscrizione</p>
                    <p className="mt-1 text-xs font-mono text-neutral-700 truncate">{state.subscription_id}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-6 mt-auto">
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-brand px-4 py-3 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-brand/90 disabled:opacity-50"
                  disabled={busyAction !== null || !connectedAccountId}
                  onClick={() =>
                    void runAction("subscribe", async () => {
                      const payload = await createOrgAdminStripePlatformSubscriptionCheckout();
                      window.location.href = payload.url;
                    })
                  }
                >
                  {busyAction === "subscribe" ? "Apertura..." : "Checkout"}
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-widest text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
                  disabled={busyAction !== null || !connectedAccountId}
                  onClick={() =>
                    void runAction("portal", async () => {
                      const payload = await createOrgAdminStripePlatformPortal();
                      window.location.href = payload.url;
                    })
                  }
                >
                  {busyAction === "portal" ? "Apertura..." : "Gestisci Portal"}
                </button>
              </div>
              {!connectedAccountId && (
                <p className="text-center text-[10px] font-bold uppercase tracking-widest text-amber-600 mt-3">
                  Richiede Account Collegato (Step 1)
                </p>
              )}
            </div>
          </section>

          {/* Step 3: Demo Products */}
          <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm col-span-1 lg:col-span-2">
            <div className="border-b border-neutral-100 pb-5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">3</span>
                <h2 className="text-lg font-bold text-neutral-900">Prodotti Storefront</h2>
              </div>
              <p className="mt-1 text-sm font-medium text-neutral-500 pl-8">
                Crea prodotti demo per popolare lo storefront del tuo connected account.
              </p>
            </div>

            <div className="pt-6 grid gap-8 lg:grid-cols-2">
              {/* Product Form */}
              <form
                className="rounded-2xl border border-neutral-100 bg-neutral-50/50 p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  const numericPrice = Number(form.price.replace(",", "."));
                  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
                    showToast({ title: "Errore", message: "Inserisci un prezzo valido.", tone: "error" });
                    return;
                  }
                  void runAction("product", async () => {
                    await createOrgAdminStripeDemoProduct({
                      name: form.name.trim(),
                      description: form.description.trim() || null,
                      priceInCents: Math.round(numericPrice * 100),
                      currency: form.currency.trim().toLowerCase(),
                    });
                    showToast({ title: "Successo", message: "Prodotto demo creato.", tone: "success" });
                    setForm({ name: "", description: "", price: "19.90", currency: "eur" });
                    const result = await fetchOrgAdminStripeDemoProducts();
                    setProducts(result.items);
                  });
                }}
              >
                <h3 className="text-sm font-bold text-neutral-900 mb-5">Nuovo Prodotto</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-1">Nome prodotto</label>
                    <input
                      className={inputClass}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Esempio: Maglietta Associazione"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-1">Descrizione</label>
                    <textarea
                      className={`${inputClass} min-h-[80px] resize-none`}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Breve descrizione del prodotto demo..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-1">Prezzo</label>
                      <input
                        className={inputClass}
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                        inputMode="decimal"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-1">Valuta</label>
                      <input
                        className={inputClass}
                        value={form.currency}
                        onChange={(e) => setForm({ ...form, currency: e.target.value })}
                        maxLength={3}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:opacity-50 mt-2"
                    disabled={busyAction !== null || !connectedAccountId}
                  >
                    {busyAction === "product" ? "Creazione..." : "Crea Prodotto"}
                  </button>
                </div>
              </form>

              {/* Product List */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-bold text-neutral-900">Catalogo Attuale</h3>
                  {productsLoading && <span className="text-[10px] font-bold uppercase tracking-widest text-brand animate-pulse">Aggiornamento...</span>}
                </div>
                
                <div className="flex-1">
                  {productsLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-20 w-full rounded-xl" />
                      <Skeleton className="h-20 w-full rounded-xl" />
                    </div>
                  ) : products.length === 0 ? (
                    <div className="h-full rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/50 flex flex-col items-center justify-center p-6 text-center">
                      <p className="text-sm font-bold text-neutral-900">Catalogo vuoto</p>
                      <p className="mt-1 text-xs font-medium text-neutral-500">I prodotti creati appariranno qui.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {products.map((product) => (
                        <div key={product.id} className="group rounded-xl border border-neutral-200 bg-white p-4 hover:border-brand/30 hover:shadow-sm transition-all">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-neutral-900 truncate">{product.name}</p>
                              <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{product.description || "Nessuna descrizione"}</p>
                            </div>
                            <div className="shrink-0 rounded-lg bg-neutral-50 px-3 py-1.5 text-xs font-bold text-neutral-900 whitespace-nowrap group-hover:bg-brand/5 group-hover:text-brand transition-colors">
                              {formatAmount(product.default_price.unit_amount, product.default_price.currency)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
