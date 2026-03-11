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
  "mt-1 w-full rounded-[1rem] border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-950/30 focus:ring-2 focus:ring-slate-950/10";

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
    const subscriptionSessionId = searchParams.get("session_id");
    const marker = `${onboardingState ?? ""}:${subscriptionSessionId ?? ""}`;
    if (handledSearchAction.current === marker) return;
    handledSearchAction.current = marker;

    if (onboardingState === "return") {
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
        tone: state.account.onboarding_complete ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
      },
      {
        label: state.account.ready_to_process_payments ? "Card payments attivi" : "Card payments non attivi",
        tone: state.account.ready_to_process_payments ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600",
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
        <Skeleton className="h-24 w-full rounded-[2rem]" />
        <Skeleton className="h-[28rem] w-full rounded-[2rem]" />
      </div>
    );
  }

  return (
    <div className="container-shell py-8 space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#111827_52%,#1f2937_100%)] px-6 py-7 text-white shadow-xl md:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-sky-200/80">Stripe Connect Demo</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">Connected account, storefront demo e subscription piattaforma</h1>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              Questa area è un sample isolato. Demo products e demo storefront restano separati dal futuro flusso reale
              della quota associativa socio ASSONAM.
            </p>
          </div>
          {storefrontAbsoluteUrl ? (
            <div className="rounded-[1.4rem] border border-white/15 bg-white/10 p-4 text-sm text-slate-100 backdrop-blur">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-sky-100/80">Link demo storefront</p>
              <p className="mt-2 break-all font-medium">{storefrontAbsoluteUrl}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-950"
                  onClick={() => navigator.clipboard.writeText(storefrontAbsoluteUrl).then(() => {
                    showToast({ title: "Stripe Demo", message: "Link storefront copiato.", tone: "success" });
                  }).catch(() => {
                    showToast({ title: "Stripe Demo", message: "Impossibile copiare il link.", tone: "error" });
                  })}
                >
                  Copia link
                </button>
                <a
                  href={storefrontPath ?? "#"}
                  className="rounded-full border border-white/20 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white"
                  target="_blank"
                  rel="noreferrer"
                >
                  Apri demo
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {!state?.enabled ? (
        <section className="surface rounded-[2rem] border border-amber-200 bg-amber-50 px-6 py-8 text-amber-900">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-700">Demo non attivo</p>
          <h2 className="mt-3 text-2xl font-bold">Stripe Connect demo disabilitato</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6">
            {state?.message ?? "Attiva ENABLE_STRIPE_CONNECT_DEMO nel backend per registrare le route e mostrare questa area."}
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="surface rounded-[2rem] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Stato account</p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-950">
                    {connectedAccountId ? "Connected account collegato" : "Nessun connected account demo"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                    Lo stato mostrato qui viene letto live dalle API Stripe, non da cache locale.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-700"
                  onClick={() => void loadState()}
                >
                  Aggiorna stato
                </button>
              </div>

              <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Connected account ID</p>
                <p className="mt-2 break-all text-sm font-semibold text-slate-900">{connectedAccountId ?? "Non ancora creato"}</p>
                {state.account ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.2rem] bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Display name</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{state.account.display_name ?? "-"}</p>
                    </div>
                    <div className="rounded-[1.2rem] bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Contact email</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{state.account.contact_email ?? "-"}</p>
                    </div>
                    <div className="rounded-[1.2rem] bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Country</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{state.account.country ?? "-"}</p>
                    </div>
                    <div className="rounded-[1.2rem] bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Requirements</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{state.account.requirements_status ?? "n/d"}</p>
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {statusChips.map((chip) => (
                    <span key={chip.label} className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] ${chip.tone}`}>
                      {chip.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-full bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busyAction !== null}
                  onClick={() =>
                    void runAction("connect", async () => {
                      await createOrgAdminStripeConnectedAccount();
                      showToast({ title: "Stripe Demo", message: "Connected account demo pronto.", tone: "success" });
                      await loadState();
                    })
                  }
                >
                  {busyAction === "connect" ? "Creazione..." : connectedAccountId ? "Rileggi account" : "Crea / collega account"}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busyAction !== null}
                  onClick={() =>
                    void runAction("onboard", async () => {
                      const payload = await createOrgAdminStripeOnboardingLink();
                      window.location.href = payload.url;
                    })
                  }
                >
                  {busyAction === "onboard" ? "Apertura..." : "Onboard to collect payments"}
                </button>
              </div>
            </div>

            <div className="surface rounded-[2rem] p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Subscription piattaforma</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">Piano demo per il connected account owner</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Checkout e billing portal restano sul platform account, ma mappano la subscription usando
                <code className="mx-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">customer_account = connected account id</code>.
              </p>

              <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Subscription status</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{state.subscription_status ?? "Non ancora attiva"}</p>
                <p className="mt-2 break-all text-xs text-slate-500">
                  Subscription ID: {state.subscription_id ?? "Nessuna subscription salvata"}
                </p>
              </div>

              <div className="mt-6 grid gap-3">
                <button
                  type="button"
                  className="rounded-[1rem] bg-sky-600 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busyAction !== null}
                  onClick={() =>
                    void runAction("subscribe", async () => {
                      const payload = await createOrgAdminStripePlatformSubscriptionCheckout();
                      window.location.href = payload.url;
                    })
                  }
                >
                  {busyAction === "subscribe" ? "Apertura checkout..." : "Subscribe to platform plan"}
                </button>
                <button
                  type="button"
                  className="rounded-[1rem] border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busyAction !== null}
                  onClick={() =>
                    void runAction("portal", async () => {
                      const payload = await createOrgAdminStripePlatformPortal();
                      window.location.href = payload.url;
                    })
                  }
                >
                  {busyAction === "portal" ? "Apertura portal..." : "Manage subscription"}
                </button>
              </div>
            </div>
          </section>

          <section className="surface rounded-[2rem] p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Demo products</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">Prodotti demo sul connected account</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  Questi prodotti sono solo per il sample Stripe Connect. Non rappresentano e non sostituiscono il futuro
                  flusso reale della quota associativa socio ASSONAM.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <form
                className="rounded-[1.6rem] border border-slate-200 bg-slate-50 p-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  const numericPrice = Number(form.price.replace(",", "."));
                  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
                    showToast({
                      title: "Stripe Demo",
                      message: "Inserisci un prezzo valido.",
                      tone: "error",
                    });
                    return;
                  }
                  void runAction("product", async () => {
                    await createOrgAdminStripeDemoProduct({
                      name: form.name.trim(),
                      description: form.description.trim() || null,
                      priceInCents: Math.round(numericPrice * 100),
                      currency: form.currency.trim().toLowerCase(),
                    });
                    showToast({
                      title: "Stripe Demo",
                      message: "Prodotto demo creato sul connected account.",
                      tone: "success",
                    });
                    setForm({ name: "", description: "", price: "19.90", currency: "eur" });
                    const result = await fetchOrgAdminStripeDemoProducts();
                    setProducts(result.items);
                  });
                }}
              >
                <p className="text-sm font-bold text-slate-900">Crea prodotto demo</p>
                <label className="mt-4 block text-sm font-medium text-slate-700">
                  Nome
                  <input
                    className={inputClass}
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Cena sociale demo"
                    required
                  />
                </label>
                <label className="mt-4 block text-sm font-medium text-slate-700">
                  Descrizione
                  <textarea
                    className={`${inputClass} min-h-[7rem]`}
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Prodotto demo per verificare la creazione sul connected account."
                  />
                </label>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Prezzo
                    <input
                      className={inputClass}
                      value={form.price}
                      onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                      inputMode="decimal"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Currency
                    <input
                      className={inputClass}
                      value={form.currency}
                      onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))}
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  className="mt-5 rounded-full bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busyAction !== null || !connectedAccountId}
                >
                  {busyAction === "product" ? "Creazione..." : "Crea prodotto demo"}
                </button>
              </form>

              <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-slate-900">Catalogo demo storefront</p>
                  {productsLoading ? <span className="text-xs text-slate-500">Aggiornamento...</span> : null}
                </div>
                {productsLoading ? (
                  <div className="mt-4 space-y-3">
                    <Skeleton className="h-24 w-full rounded-[1.2rem]" />
                    <Skeleton className="h-24 w-full rounded-[1.2rem]" />
                  </div>
                ) : products.length === 0 ? (
                  <div className="mt-4 rounded-[1.4rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    Nessun prodotto demo creato sul connected account.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {products.map((product) => (
                      <div key={product.id} className="rounded-[1.3rem] border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-bold text-slate-950">{product.name ?? "Prodotto demo"}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-500">{product.description ?? "Nessuna descrizione"}</p>
                          </div>
                          <div className="rounded-full bg-white px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-700">
                            {formatAmount(product.default_price.unit_amount, product.default_price.currency)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
