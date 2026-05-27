import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { applySeo } from "../../lib/seo";
import { fetchOrgAdminCommunicationSettings } from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";

import { CommunicationsOverview } from "./components/communications/CommunicationsOverview";
import { MessagesHub } from "./components/communications/MessagesComposerHub";
import { PublicFormsHub } from "./components/communications/PublicFormsHub";
import { EmailSendingSettings } from "./components/communications/EmailSendingSettings";
import { WhatsAppHub } from "./components/communications/WhatsAppHub";
import { WhatsAppAutomationsHub } from "./components/communications/WhatsAppAutomationsHub";
import { PageHeader, StatusChip } from "./components/OrgAdminPrimitives";

type WhatsAppView = "inbox" | "automazioni";

const COMMUNICATIONS_LOCKED_MESSAGE = "Modulo Comunicazioni non attivo. Contatta ASSONAM per abilitarlo.";

type TabKey = "panoramica" | "campagne" | "modelli" | "moduli" | "sondaggi" | "whatsapp" | "email";

const communicationsTabs: Array<{
  key: TabKey;
  label: string;
}> = [
  { key: "panoramica", label: "Panoramica" },
  { key: "campagne", label: "Campagne" },
  { key: "modelli", label: "Modelli" },
  { key: "moduli", label: "Form pubblici" },
  { key: "sondaggi", label: "Sondaggi" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
];

function normalizeTab(value: string | null | undefined): TabKey {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "campagne") return "campagne";
  if (normalized === "modelli" || normalized === "messaggi") return "modelli";
  if (normalized === "moduli" || normalized === "form-pubblici" || normalized === "pagine-e-moduli") return "moduli";
  if (normalized === "sondaggi" || normalized === "survey" || normalized === "surveys") return "sondaggi";
  if (normalized === "invii" || normalized === "invii-statistiche" || normalized === "panoramica") return "panoramica";
  if (normalized === "impostazioni" || normalized === "invio-email" || normalized === "email") return "email";
  if (normalized === "whatsapp") return "whatsapp";
  return "panoramica";
}

function normalizeWhatsAppView(value: string | null | undefined, hasFormLink: boolean): WhatsAppView {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "automazioni" || normalized === "automation" || normalized === "rules") return "automazioni";
  if (normalized === "inbox" || normalized === "chat" || normalized === "qr") return "inbox";
  if (hasFormLink) return "automazioni";
  return "inbox";
}

export default function OrgAdminCommunications() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>(normalizeTab(searchParams.get("tab")));
  const [loading, setLoading] = useState(true);
  const [communicationsLocked, setCommunicationsLocked] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const activeWhatsAppView = normalizeWhatsAppView(
    searchParams.get("whatsappView"),
    Boolean(searchParams.get("formId")),
  );

  useEffect(() => {
    applySeo({
      title: "Comunicazioni Associazione",
      description: "Invia email ai soci, collega form pubblici e gestisci automazioni WhatsApp in modo guidato.",
      noindex: true,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchOrgAdminCommunicationSettings()
      .then((settings) => {
        if (!cancelled) {
          setCommunicationsLocked(!settings.communications_enabled);
          setWhatsappEnabled(Boolean(settings.whatsapp_evolution_enabled));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCommunicationsLocked(true);
          setWhatsappEnabled(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectTab = (tab: TabKey) => {
    setActiveTab(tab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", tab);
    nextParams.delete("mode");
    nextParams.delete("intent");
    if (tab !== "whatsapp") {
      nextParams.delete("whatsappView");
    }
    setSearchParams(nextParams, { replace: true });
  };

  const selectWhatsAppView = (view: WhatsAppView) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", "whatsapp");
    nextParams.set("whatsappView", view);
    if (view === "inbox") {
      nextParams.delete("formId");
    }
    setSearchParams(nextParams, { replace: true });
    setActiveTab("whatsapp");
  };

  const createActionLabel =
    activeTab === "modelli" ? "+ Modello"
    : activeTab === "moduli" ? "+ Form"
    : activeTab === "sondaggi" ? "+ Sondaggio"
    : activeTab === "whatsapp" ? "+ Regola"
    : "+ Campagna";

  const openContextualCreate = () => {
    if (communicationsLocked) return;
    const nextParams = new URLSearchParams(searchParams);
    if (activeTab === "modelli") {
      nextParams.set("tab", "modelli");
      nextParams.set("mode", "create-template");
      setSearchParams(nextParams, { replace: true });
      setActiveTab("modelli");
      return;
    }
    if (activeTab === "moduli" || activeTab === "sondaggi") {
      nextParams.set("tab", activeTab);
      nextParams.set("mode", "create");
      setSearchParams(nextParams, { replace: true });
      setActiveTab(activeTab);
      return;
    }
    if (activeTab === "whatsapp") {
      nextParams.set("tab", "whatsapp");
      nextParams.set("whatsappView", "automazioni");
      nextParams.set("mode", "create");
      setSearchParams(nextParams, { replace: true });
      setActiveTab("whatsapp");
      return;
    }
    nextParams.set("tab", "campagne");
    nextParams.set("mode", "create");
    setSearchParams(nextParams, { replace: true });
    setActiveTab("campagne");
  };

  useEffect(() => {
    const next = normalizeTab(searchParams.get("tab"));
    if (next !== activeTab) {
      setActiveTab(next);
    }
  }, [activeTab, searchParams]);

  if (loading) {
    return (
      <div className="container-shell py-8 space-y-5">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="org-admin-communications-page container-shell py-8 space-y-5">
      <div className="communications-mobile-head">
        <div>
          <p>Comunicazioni</p>
          <h1>{communicationsTabs.find((tab) => tab.key === activeTab)?.label || "Centro messaggi"}</h1>
        </div>
        <button
          type="button"
          disabled={communicationsLocked}
          onClick={openContextualCreate}
        >
          {createActionLabel}
        </button>
      </div>
      <PageHeader
        eyebrow="Comunicazioni"
        title="Centro messaggi"
        subtitle="Gestisci campagne, modelli, form pubblici e canali di comunicazione in un workspace operativo."
        actions={
          <>
            <button
              type="button"
              className="btn-primary"
              disabled={communicationsLocked}
              onClick={() => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set("tab", "campagne");
                nextParams.set("mode", "create");
                setSearchParams(nextParams, { replace: true });
                setActiveTab("campagne");
              }}
            >
              + Nuova campagna
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={communicationsLocked}
              onClick={() => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set("tab", "moduli");
                nextParams.set("mode", "create");
                setSearchParams(nextParams, { replace: true });
                setActiveTab("moduli");
              }}
            >
              + Nuovo form
            </button>
          </>
        }
      />

      <section className="communications-workspace overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        {communicationsLocked && (
          <div className="mx-6 mt-6 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 md:mx-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Modulo non attivo</p>
                <p className="mt-1">{COMMUNICATIONS_LOCKED_MESSAGE}</p>
              </div>
            </div>
          </div>
        )}

        <div className="px-5 pt-5 md:px-6">
          <div className="flex flex-col gap-4 border-b border-neutral-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <StatusChip tone={communicationsLocked ? "warning" : "success"}>
                  {communicationsLocked ? "Modulo bloccato" : "Modulo attivo"}
                </StatusChip>
                <StatusChip tone={whatsappEnabled ? "success" : "muted"}>
                  WhatsApp {whatsappEnabled ? "attivo" : "non attivo"}
                </StatusChip>
                <StatusChip tone="info">Email configurabile</StatusChip>
              </div>
            </div>
            <div className="overflow-x-auto pb-1">
              <div className="inline-flex min-w-max rounded-lg border border-neutral-200 bg-neutral-50 p-1">
                {communicationsTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                      activeTab === tab.key
                        ? "bg-brand text-white shadow-sm"
                        : "text-slate-600 hover:bg-white hover:text-slate-950"
                    }`}
                    onClick={() => selectTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-6 md:px-6">
          {activeTab === "panoramica" && (
            <CommunicationsOverview
              communicationsLocked={communicationsLocked}
              whatsappEnabled={whatsappEnabled}
              onQuickAction={(intent) => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set("tab", "campagne");
                nextParams.set("mode", "create");
                nextParams.set("intent", intent);
                setSearchParams(nextParams, { replace: true });
                setActiveTab("campagne");
              }}
              onTabChange={(tab) => {
                if (tab === "invii") {
                  selectTab("panoramica");
                  return;
                }
                if (tab === "impostazioni") {
                  selectTab("email");
                  return;
                }
                selectTab(tab);
              }}
            />
          )}
          {activeTab === "campagne" && (
            <MessagesHub communicationsLocked={communicationsLocked} forcedSubtab="campaigns" hideSubtabNav />
          )}
          {activeTab === "modelli" && (
            <MessagesHub communicationsLocked={communicationsLocked} forcedSubtab="templates" hideSubtabNav />
          )}
          {activeTab === "whatsapp" && (
            whatsappEnabled ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-4">
                  {([
                    { key: "inbox", label: "Chat e connessione", hint: "QR code, stato sessione e inbox." },
                    { key: "automazioni", label: "Automazioni", hint: "Regole collegate ai form." },
                  ] as const).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => selectWhatsAppView(item.key)}
                      className={`rounded-lg border px-4 py-2.5 text-left transition ${
                        activeWhatsAppView === item.key
                          ? "border-brand bg-brand text-white"
                          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:text-neutral-900"
                      }`}
                    >
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className={`mt-1 block text-[11px] ${activeWhatsAppView === item.key ? "text-white/70" : "text-neutral-500"}`}>
                        {item.hint}
                      </span>
                    </button>
                  ))}
                </div>

                {activeWhatsAppView === "inbox" ? (
                  <WhatsAppHub communicationsLocked={communicationsLocked} />
                ) : (
                  <WhatsAppAutomationsHub communicationsLocked={communicationsLocked} />
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-sm text-neutral-600">
                WhatsApp non è ancora attivo per questa associazione. Quando la connessione sarà disponibile, qui vedrai le automazioni collegate ai form pubblici.
              </div>
            )
          )}
          {activeTab === "moduli" && (
            <PublicFormsHub locked={communicationsLocked} />
          )}
          {activeTab === "sondaggi" && (
            <PublicFormsHub locked={communicationsLocked} mode="surveys" />
          )}
          {activeTab === "email" && (
            <EmailSendingSettings communicationsLocked={communicationsLocked} />
          )}
        </div>
      </section>
    </div>
  );
}
