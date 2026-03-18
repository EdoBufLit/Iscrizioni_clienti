import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { applySeo } from "../../lib/seo";
import { fetchOrgAdminCommunicationSettings } from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";

import { CommunicationsOverview } from "./components/communications/CommunicationsOverview";
import { MessagesHub } from "./components/communications/MessagesHub";
import { PublicFormsHub } from "./components/communications/PublicFormsHub";
import { EmailSendingSettings } from "./components/communications/EmailSendingSettings";
import { WhatsAppHub } from "./components/communications/WhatsAppHub";

type TabKey =
  | "panoramica"
  | "campagne"
  | "modelli"
  | "moduli"
  | "invii"
  | "whatsapp"
  | "impostazioni";

type LaunchIntent =
  | "form_invite"
  | "general"
  | "renewal"
  | "custom"
  | "survey"
  | null;

type CampaignMode = "list" | "create" | "edit";

const COMMUNICATIONS_LOCKED_MESSAGE = "Modulo Comunicazioni non attivo. Contatta ASSONAM per abilitarlo.";

const tabDefinitions: Array<{ key: TabKey; label: string; hint: string }> = [
  { key: "panoramica", label: "Panoramica", hint: "Azioni rapide, KPI e stato invio." },
  { key: "campagne", label: "Campagne", hint: "Elenco, ricerca e accesso al composer dedicato." },
  { key: "modelli", label: "Modelli", hint: "Libreria riusabile email." },
  { key: "moduli", label: "Form pubblici", hint: "Pagine e moduli collegabili." },
  { key: "invii", label: "Invii e statistiche", hint: "Bozze, programmate, inviate, fallite." },
  { key: "whatsapp", label: "WhatsApp", hint: "Inbox sperimentale via Evolution Lite." },
  { key: "impostazioni", label: "Impostazioni email", hint: "Mittente, reply-to e branding." },
];

function normalizeTab(value: string | null | undefined): TabKey {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "messaggi") return "campagne";
  if (normalized === "form-pubblici") return "moduli";
  if (normalized === "pagine-e-moduli") return "moduli";
  if (normalized === "invio-email") return "impostazioni";
  if (normalized === "invii-statistiche") return "invii";
  if (normalized === "panoramica" || normalized === "campagne" || normalized === "modelli" || normalized === "moduli" || normalized === "invii" || normalized === "whatsapp" || normalized === "impostazioni") {
    return normalized;
  }
  return "panoramica";
}

function normalizeIntent(value: string | null | undefined): LaunchIntent {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "invite" || normalized === "form_invite") return "form_invite";
  if (normalized === "general" || normalized === "general_communication") return "general";
  if (normalized === "renewal" || normalized === "renewal_reminder") return "renewal";
  if (normalized === "custom" || normalized === "personalized") return "custom";
  if (normalized === "survey" || normalized === "feedback") return "survey";
  return null;
}

function normalizeCampaignMode(value: string | null | undefined, hasLaunchParams: boolean): CampaignMode {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "create" || normalized === "new") return "create";
  if (normalized === "edit" || normalized === "composer") return "edit";
  if (hasLaunchParams) return "create";
  return "list";
}

export default function OrgAdminCommunications() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [communicationsLocked, setCommunicationsLocked] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(normalizeTab(searchParams.get("tab")));

  const launchIntent = useMemo(
    () => normalizeIntent(searchParams.get("intent")),
    [searchParams],
  );
  const launchFormId = useMemo(() => {
    const raw = Number(searchParams.get("formId") || 0);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }, [searchParams]);
  const launchTemplateId = useMemo(() => {
    const raw = Number(searchParams.get("templateId") || 0);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }, [searchParams]);
  const launchCampaignId = useMemo(() => {
    const raw = Number(searchParams.get("campaignId") || 0);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }, [searchParams]);
  const campaignMode = useMemo(
    () => normalizeCampaignMode(searchParams.get("mode"), Boolean(launchIntent || launchFormId || launchTemplateId)),
    [launchFormId, launchIntent, launchTemplateId, searchParams],
  );
  const composerActive = activeTab === "campagne" && campaignMode !== "list";

  useEffect(() => {
    applySeo({
      title: "Comunicazioni Associazione",
      description: "Invia email ai soci, raccogli risposte con form pubblici e gestisci campagne in modo guidato.",
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

  useEffect(() => {
    const nextTab = normalizeTab(searchParams.get("tab"));
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, searchParams]);

  useEffect(() => {
    if (!whatsappEnabled && activeTab === "whatsapp") {
      updateQuery("panoramica");
    }
  }, [activeTab, whatsappEnabled]);

  function updateQuery(nextTab: TabKey, extras?: Record<string, string | number | null | undefined>) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", nextTab);
    if (extras) {
      Object.entries(extras).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") nextParams.delete(key);
        else nextParams.set(key, String(value));
      });
    }
    setSearchParams(nextParams, { replace: true });
    setActiveTab(nextTab);
  }

  function consumeLaunchParams() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("intent");
    nextParams.delete("formId");
    nextParams.delete("templateId");
    setSearchParams(nextParams, { replace: true });
  }

  if (loading) {
    return (
      <div className="container-shell py-8 space-y-5">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full rounded-[2rem]" />
      </div>
    );
  }

  const visibleTabs = tabDefinitions.filter((tab) => tab.key !== "whatsapp" || whatsappEnabled);

  if (composerActive) {
    return (
      <div className="container-shell py-8">
        {communicationsLocked && (
          <div className="mb-6 rounded-[1.75rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Modulo non attivo</p>
            <p className="mt-1">{COMMUNICATIONS_LOCKED_MESSAGE}</p>
          </div>
        )}
        <MessagesHub
          section="campaigns"
          communicationsLocked={communicationsLocked}
          launchIntent={launchIntent}
          launchFormId={launchFormId}
          launchTemplateId={launchTemplateId}
          onConsumeLaunch={consumeLaunchParams}
          campaignMode="composer"
          editingCampaignId={campaignMode === "edit" ? launchCampaignId : null}
          onCloseCampaignComposer={() =>
            updateQuery("campagne", {
              mode: null,
              campaignId: null,
              intent: null,
              formId: null,
              templateId: null,
            })
          }
        />
      </div>
    );
  }

  return (
    <div className="container-shell py-8 space-y-6">
      <section className="surface overflow-hidden">
        {communicationsLocked && (
          <div className="mx-6 mt-6 rounded-[1.75rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 md:mx-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Modulo non attivo</p>
                <p className="mt-1">{COMMUNICATIONS_LOCKED_MESSAGE}</p>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 pt-6 md:px-8">
          <div className="grid gap-2 border-b border-neutral-200 pb-4 md:grid-cols-3 xl:grid-cols-7">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`rounded-[1.35rem] border px-4 py-3 text-left transition ${
                  activeTab === tab.key
                    ? "border-brand bg-brand text-white shadow-sm"
                    : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
                }`}
                onClick={() => updateQuery(tab.key)}
              >
                <p className="text-sm font-semibold">{tab.label}</p>
                <p className={`mt-1 text-xs ${activeTab === tab.key ? "text-white/80" : "text-neutral-500"}`}>{tab.hint}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-8 md:px-8">
          {activeTab === "panoramica" && (
            <CommunicationsOverview
              communicationsLocked={communicationsLocked}
              onTabChange={(tab) => updateQuery(tab)}
              onQuickAction={(intent) => updateQuery("campagne", { mode: "create", intent })}
            />
          )}
          {activeTab === "campagne" && (
            <MessagesHub
              section="campaigns"
              communicationsLocked={communicationsLocked}
              launchIntent={launchIntent}
              launchFormId={launchFormId}
              launchTemplateId={launchTemplateId}
              onConsumeLaunch={consumeLaunchParams}
              campaignMode="list"
              onCreateCampaign={() =>
                updateQuery("campagne", {
                  mode: "create",
                  intent: null,
                  formId: null,
                  templateId: null,
                  campaignId: null,
                })
              }
              onEditCampaign={(campaignId) =>
                updateQuery("campagne", {
                  mode: "edit",
                  campaignId,
                  intent: null,
                  formId: null,
                  templateId: null,
                })
              }
            />
          )}
          {activeTab === "modelli" && (
            <MessagesHub
              section="templates"
              communicationsLocked={communicationsLocked}
              launchIntent={launchIntent}
              launchFormId={launchFormId}
              launchTemplateId={launchTemplateId}
              onConsumeLaunch={consumeLaunchParams}
            />
          )}
          {activeTab === "moduli" && (
            <PublicFormsHub locked={communicationsLocked} />
          )}
          {activeTab === "invii" && (
            <MessagesHub
              section="deliveries"
              communicationsLocked={communicationsLocked}
              launchIntent={launchIntent}
              launchFormId={launchFormId}
              launchTemplateId={launchTemplateId}
              onConsumeLaunch={consumeLaunchParams}
            />
          )}
          {activeTab === "whatsapp" && whatsappEnabled && (
            <WhatsAppHub communicationsLocked={communicationsLocked} />
          )}
          {activeTab === "impostazioni" && (
            <EmailSendingSettings communicationsLocked={communicationsLocked} />
          )}
        </div>
      </section>
    </div>
  );
}
