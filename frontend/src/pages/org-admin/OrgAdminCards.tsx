import { lazy, Suspense, type FormEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AuthError, fetchCardStock, fetchOrgAdminCardReplenishments,
  fetchOrgAdminMembershipSettings, fetchOrgAdminMetrics, fetchOrgAdminQuotes,
  patchOrgAdminMembershipSettings, uploadOrgAdminCardAssets,
  type CardReplenishmentCapability, type CardReplenishmentRequest, type CardStock,
  type OrgAdminCardStyle, type OrgAdminMembershipSettings, type OrgAdminMetrics,
} from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/ToastProvider";
import { useOrgAdmin } from "./OrgAdminLayout";
import CardMembershipRules from "./components/cards/CardMembershipRules";
import CardReplenishmentSheet from "./components/cards/CardReplenishmentSheet";
import "./OrgAdminCards.css";

const CardDesignEditor = lazy(() => import("./components/cards/CardDesignEditor"));
const CardOrdersPanel = lazy(() => import("./components/cards/CardOrdersPanel"));
type CardsTab = "stock" | "history" | "design";
const tabs: Array<{id: CardsTab; label: string; short: string}> = [
  {id: "stock", label: "Stato e magazzino", short: "Magazzino"},
  {id: "history", label: "Movimenti e ordini", short: "Ordini"},
  {id: "design", label: "Configurazione e design", short: "Design"},
];
const formatMoney = (value: number, currency = "EUR") => {
  try { return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value); }
  catch { return `${value.toLocaleString("it-IT", {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${currency}`; }
};
const yearInRome = () => Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Rome", year: "numeric" }).format(new Date()));

const defaultCardStyle: OrgAdminCardStyle = {
  primary_color: "#5A001F",
  secondary_color: "#2A0010",
  accent_color: "#D4B45C",
  text_color: "#FFFFFF",
  muted_text_color: "#F5D66D",
  font_family: "classic",
  surface_pattern: "geometric",
  logo_mode: "watermark",
  logo_position: "top-right",
  logo_opacity: 0.18,
  logo_blend: "normal",
  remove_logo_background: false,
  back_title: "Verifica tessera",
  back_body: "",
  back_show_member: true,
};

function normalizeCardStyle(style?: Partial<OrgAdminCardStyle> | null): OrgAdminCardStyle {
  return { ...defaultCardStyle, ...(style || {}) };
}


export default function OrgAdminCards() {
  const { admin, loading: adminLoading } = useOrgAdmin();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const currentYear = yearInRome();
  const [activeTab, setActiveTab] = useState<CardsTab>("stock");
  const [visited, setVisited] = useState<Set<CardsTab>>(() => new Set(["stock"]));
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [stock, setStock] = useState<CardStock | null>(null);
  const [metrics, setMetrics] = useState<OrgAdminMetrics | null>(null);
  const [collected, setCollected] = useState<{amount: number; currency: string} | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");
  const overviewSequence = useRef(0);
  const [capability, setCapability] = useState<CardReplenishmentCapability | null>(null);
  const [capabilityLoading, setCapabilityLoading] = useState(true);
  const [capabilityError, setCapabilityError] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lastRequest, setLastRequest] = useState<CardReplenishmentRequest | null>(null);
  const [focusRequest, setFocusRequest] = useState<CardReplenishmentRequest | undefined>();
  const [ordersRevision, setOrdersRevision] = useState(0);
  const [requestMessage, setRequestMessage] = useState("");
  const [settings, setSettings] = useState<OrgAdminMembershipSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsLoadError, setSettingsLoadError] = useState("");
  const settingsLock = useRef(false);
  const [styleDraft, setStyleDraft] = useState<OrgAdminCardStyle>(defaultCardStyle);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [designSaving, setDesignSaving] = useState(false);
  const rulesLock = useRef(false);
  const designLock = useRef(false);
  const [rulesError, setRulesError] = useState("");
  const [designError, setDesignError] = useState("");

  const selectTab = useCallback((tab: CardsTab) => {
    setActiveTab(tab);
    setVisited(previous => previous.has(tab) ? previous : new Set([...previous, tab]));
  }, []);

  const loadOverview = useCallback(async () => {
    const sequence = ++overviewSequence.current;
    setOverviewLoading(true); setOverviewError("");
    const results = await Promise.allSettled([
      fetchCardStock(), fetchOrgAdminMetrics(), fetchOrgAdminQuotes({year: currentYear, limit: 1, offset: 0}),
    ]);
    if (sequence !== overviewSequence.current) return;
    if (results.some(result => result.status === "rejected" && result.reason instanceof AuthError)) {
      navigate("/org-admin/login", {replace: true}); return;
    }
    if (results[0].status === "fulfilled") setStock(results[0].value);
    if (results[1].status === "fulfilled") setMetrics(results[1].value);
    if (results[2].status === "fulfilled") setCollected({amount: results[2].value.kpis.collected_total, currency: results[2].value.kpis.currency});
    if (results.some(result => result.status === "rejected")) setOverviewError("Alcuni dati non sono aggiornati. Riprova il caricamento.");
    setOverviewLoading(false);
  }, [currentYear, navigate]);

  const loadCapability = useCallback(async () => {
    setCapabilityLoading(true); setCapabilityError("");
    try { setCapability((await fetchOrgAdminCardReplenishments({limit: 1, offset: 0})).capability); }
    catch (reason) {
      if (reason instanceof AuthError) navigate("/org-admin/login", {replace: true});
      else setCapabilityError("Rifornimento non disponibile. Riprova.");
    } finally { setCapabilityLoading(false); }
  }, [navigate]);

  useEffect(() => {
    if (adminLoading || !admin) return;
    void loadOverview(); void loadCapability();
    return () => { overviewSequence.current += 1; };
  }, [admin, adminLoading, loadOverview, loadCapability]);

  const loadSettings = useCallback(async () => {
    if (settingsLock.current) return;
    settingsLock.current = true; setSettingsLoading(true); setSettingsLoadError("");
    try {
      const data = await fetchOrgAdminMembershipSettings();
      setSettings(data); setStyleDraft(normalizeCardStyle(data.card_style));
    } catch (reason) {
      if (reason instanceof AuthError) navigate("/org-admin/login", {replace: true});
      else setSettingsLoadError("Impossibile caricare la configurazione delle tessere.");
    } finally { settingsLock.current = false; setSettingsLoading(false); }
  }, [navigate]);

  useEffect(() => { if (activeTab === "design" && !settings && !settingsLoadError) void loadSettings(); }, [activeTab, settings, settingsLoadError, loadSettings]);
  useEffect(() => {
    if (!logoFile) { setLogoPreview(settings?.card_logo_url || null); return; }
    const preview = URL.createObjectURL(logoFile);
    setLogoPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [logoFile, settings?.card_logo_url]);

  const handleRulesSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rulesLock.current || designLock.current || !settings) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    rulesLock.current = true; setRulesSaving(true); setRulesError("");
    try {
      const response = await patchOrgAdminMembershipSettings({
        membership_fee_amount: Number(data.get("membership_fee_amount") || 0) || undefined,
        membership_fee_currency: String(data.get("membership_fee_currency") || "").trim().toUpperCase() || undefined,
        temporary_membership_fee_amount: settings.custom_membership_types_enabled ? Number(data.get("temporary_membership_fee_amount") || 0) || undefined : undefined,
        temporary_membership_duration_value: settings.custom_membership_types_enabled ? Number(data.get("temporary_membership_duration_value") || 0) || undefined : undefined,
        temporary_membership_duration_unit: settings.custom_membership_types_enabled ? String(data.get("temporary_membership_duration_unit") || "days") as "hours" | "days" : undefined,
        cash_only_signup_payment: settings.online_payment_required ? settings.cash_only_signup_payment : data.get("cash_only_signup_payment") === "on",
      });
      setSettings(response.settings);
      showToast({tone: "success", title: "Regole salvate", message: "Prezzi e regole di emissione aggiornati."});
      void loadOverview();
    } catch (reason) {
      if (reason instanceof AuthError) navigate("/org-admin/login", {replace: true});
      else setRulesError(reason instanceof Error ? reason.message : "Impossibile salvare le regole.");
    } finally {
      rulesLock.current = false; setRulesSaving(false);
      window.requestAnimationFrame(() => {
        if (document.activeElement === document.body && form.isConnected && !form.closest("[hidden]")) form.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
      });
    }
  };

  const handleDesignSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (designLock.current || rulesLock.current || !settings || settings.card_style_locked) return;
    const form = event.currentTarget;
    designLock.current = true; setDesignSaving(true); setDesignError("");
    let logoUploaded = false;
    try {
      if (logoFile) {
        const uploaded = await uploadOrgAdminCardAssets({logo: logoFile, removeBackground: styleDraft.remove_logo_background});
        setSettings(uploaded.settings); setLogoFile(null); logoUploaded = true;
      }
      const response = await patchOrgAdminMembershipSettings({card_style: styleDraft});
      setSettings(response.settings); setStyleDraft(normalizeCardStyle(response.settings.card_style));
      showToast({tone: "success", title: "Design salvato", message: "La grafica della tessera è stata aggiornata."});
    } catch (reason) {
      if (reason instanceof AuthError) navigate("/org-admin/login", {replace: true});
      else setDesignError(`${logoUploaded ? "Logo caricato. " : ""}${reason instanceof Error ? reason.message : "Impossibile salvare il design. Riprova."}`);
    } finally {
      designLock.current = false; setDesignSaving(false);
      window.requestAnimationFrame(() => {
        if (document.activeElement === document.body && form.isConnected && !form.closest("[hidden]")) form.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
      });
    }
  };

  function onReplenishmentCreated(item: CardReplenishmentRequest, created: boolean) {
    setLastRequest(item); setOrdersRevision(value => value + 1);
    const amount = formatMoney(item.amount_due_cents / 100, item.currency);
    setRequestMessage(created
      ? `Richiesta #${item.id}: ${item.requested_cards} tessere per il ${item.requested_year}, ${amount} ${item.billing_status === "paid" ? "pagati" : "da pagare"}.`
      : `Richiesta #${item.id} già registrata. Nessun nuovo lotto creato.`);
    showToast({tone: "success", title: "Rifornimento registrato", message: `Lotto disponibile per il ${item.requested_year}.`});
    void loadOverview(); void loadCapability();
    window.requestAnimationFrame(() => document.getElementById("cards-tab-stock")?.focus());
  }

  function onTabKey(event: KeyboardEvent, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault(); selectTab(tabs[next].id); tabRefs.current[next]?.focus();
  }

  const total = stock?.total ?? 0;
  const remaining = stock?.remaining ?? 0;
  const usedPercent = total > 0 ? Math.min(100, Math.max(0, Math.round((total - remaining) / total * 100))) : 0;
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  return <div className="cards-workspace" data-tour="admin-cards">
    <header className="cards-header"><h1>Tessere</h1><details className="cards-header-menu"><summary aria-label="Azioni tessere"><span aria-hidden="true">⋮</span></summary><div><a href="/api/org-admin/members.xlsx">Esporta soci in Excel</a></div></details></header>
    <div role="tablist" aria-label="Sezioni tessere" className="cards-tabs">
      {tabs.map((tab, index) => <button type="button" role="tab" key={tab.id} id={`cards-tab-${tab.id}`} aria-label={tab.label} aria-controls={`cards-panel-${tab.id}`} aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} ref={node => { tabRefs.current[index] = node; }} onClick={() => selectTab(tab.id)} onKeyDown={event => onTabKey(event, index)}><span className="cards-tabs-full" aria-hidden="true">{tab.label}</span><span className="cards-tabs-short" aria-hidden="true">{tab.short}</span></button>)}
    </div>
    {requestMessage && <div className="cards-feedback" role="status"><p>{requestMessage}</p><button type="button" onClick={() => { setFocusRequest(lastRequest ? {...lastRequest} : undefined); selectTab("history"); }}>Vedi richiesta →</button></div>}
    <section role="tabpanel" id="cards-panel-stock" aria-labelledby="cards-tab-stock" hidden={activeTab !== "stock"} className="cards-tab-content" tabIndex={0}>
      {overviewError && <div role="alert" className="cards-load-error"><span>{overviewError}</span><button type="button" onClick={() => void loadOverview()}>Riprova dati</button></div>}
      {overviewLoading && !stock ? <div className="cards-kpis">{[0,1,2,3].map(index => <div className="cards-kpi" key={index}><Skeleton className="h-4 w-20" /><Skeleton className="mt-3 h-7 w-24" /></div>)}</div> : <div className="cards-kpis" aria-label={`Riepilogo tessere ${currentYear}`}>
        <div className="cards-kpi"><span>Attive</span><strong>{metrics?.active_members_count ?? "—"}</strong></div>
        <div className="cards-kpi"><span>In scadenza</span><strong>{metrics?.expiring_members_count ?? "—"}</strong><small>Entro 30 giorni</small></div>
        <div className="cards-kpi"><span>Scadute</span><strong>{metrics?.expired_members_count ?? "—"}</strong></div>
        <div className="cards-kpi cards-kpi-money"><span>Quote annuali incassate</span><strong>{collected ? formatMoney(collected.amount, collected.currency) : "—"}</strong><small>{currentYear}</small></div>
      </div>}
      {stock && <section className="cards-panel cards-stock" aria-labelledby="cards-stock-title"><div className="cards-stock-heading"><h2 id="cards-stock-title">Magazzino {currentYear}</h2><span>{remaining < 25 ? "Da rifornire" : "Disponibile"}</span></div><p className="cards-stock-available"><strong>{remaining.toLocaleString("it-IT")}</strong> disponibili <span>su {total.toLocaleString("it-IT")} tessere</span></p><div className="cards-stock-progress" role="progressbar" aria-label="Tessere utilizzate o riservate" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPercent}><span style={{width: `${usedPercent}%`}} /></div><p className="cards-hint">{usedPercent}% utilizzate o riservate</p></section>}
      <div className="cards-replenishment-action"><button type="button" className="btn-primary w-full justify-center" disabled={capabilityLoading || !capability?.can_auto_allocate} onClick={() => setSheetOpen(true)}>+ Richiedi rifornimento tessere</button>{capability?.blocked_reason && !capability.can_auto_allocate && <p className="cards-hint">{capability.blocked_reason}</p>}{capabilityError && <div className="cards-load-error" role="alert"><span>{capabilityError}</span><button type="button" onClick={() => void loadCapability()}>Riprova rifornimento</button></div>}</div>
    </section>
    <section role="tabpanel" id="cards-panel-history" aria-labelledby="cards-tab-history" hidden={activeTab !== "history"} className="cards-tab-content" tabIndex={0}>{visited.has("history") && <Suspense fallback={<p role="status">Caricamento ordini…</p>}><CardOrdersPanel currentYear={currentYear} revision={ordersRevision} focusRequest={focusRequest} /></Suspense>}</section>
    <section role="tabpanel" id="cards-panel-design" aria-labelledby="cards-tab-design" hidden={activeTab !== "design"} className="cards-tab-content" tabIndex={0}>{visited.has("design") && <>
      {settingsLoading && !settings && <p role="status">Caricamento configurazione…</p>}
      {settingsLoadError && <div role="alert" className="cards-load-error"><span>{settingsLoadError}</span><button type="button" onClick={() => void loadSettings()}>Riprova configurazione</button></div>}
      {settings && <><Suspense fallback={<p role="status">Caricamento anteprima…</p>}><CardDesignEditor style={styleDraft} logoUrl={logoPreview} orgName={admin?.organization?.name} orgSlug={admin?.organization?.slug} locked={Boolean(settings.card_style_locked)} saving={designSaving || rulesSaving} error={designError} onChange={(key, value) => setStyleDraft(current => ({...current, [key]: value}))} onLogoFileChange={setLogoFile} onSubmit={handleDesignSubmit} /></Suspense><CardMembershipRules settings={settings} saving={rulesSaving || designSaving} error={rulesError} onSubmit={handleRulesSubmit} /></>}
    </>}</section>
    <CardReplenishmentSheet open={sheetOpen} capability={capability} loading={capabilityLoading} onClose={closeSheet} onCreated={onReplenishmentCreated} />
  </div>;
}
