import { useEffect, useState, type ReactNode } from "react";
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

type TabKey = "panoramica" | "messaggi" | "whatsapp" | "moduli" | "impostazioni";
type WhatsAppView = "inbox" | "automazioni";

const COMMUNICATIONS_LOCKED_MESSAGE = "Modulo Comunicazioni non attivo. Contatta ASSONAM per abilitarlo.";

const communicationsTabs: Array<{
  key: TabKey;
  label: string;
  subtitle: string;
  icon: ReactNode;
}> = [
  {
    key: "messaggi",
    label: "Modelli",
    subtitle: "Libreria riusabile email.",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 3.75h7.5L20.25 9.5v10.75A1.5 1.5 0 0118.75 21h-11.5A1.5 1.5 0 015.75 19.5v-14A1.75 1.75 0 017.5 3.75z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3.75V9.5h5.75" />
      </svg>
    ),
  },
  {
    key: "moduli",
    label: "Form pubblici",
    subtitle: "Pagine e moduli collegabili.",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
        <rect x="3.75" y="4.75" width="16.5" height="14.5" rx="2.25" />
        <path strokeLinecap="round" d="M8 9.25h8M8 13h8M8 16.75h5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 2.75v4M16.5 2.75v4" />
      </svg>
    ),
  },
  {
    key: "panoramica",
    label: "Invii e statistiche",
    subtitle: "Bozze, programmate, inviate, fallite.",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 4.75L10.5 14.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 4.75L14.25 20.25l-3.75-6-6-3.75 15.75-5.75z" />
      </svg>
    ),
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    subtitle: "Chat, QR e regole collegate ai form.",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25a8.2 8.2 0 004.15-1.12l3.85.87-.96-3.68A8.25 8.25 0 1012 20.25z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.4 8.8c.15-.33.31-.34.47-.35h.4c.14 0 .33.05.51.44.19.39.64 1.56.69 1.67.05.11.09.24.02.39-.07.15-.1.24-.2.36-.1.12-.21.27-.3.36-.1.1-.21.2-.09.4.12.2.54.89 1.16 1.44.8.71 1.48.93 1.68 1.03.2.1.32.08.44-.05.12-.13.51-.6.65-.8.14-.2.27-.17.46-.1.19.07 1.19.56 1.39.66.2.1.33.15.38.24.05.09.05.53-.12 1.04-.17.51-1 .99-1.39 1.05-.36.05-.82.08-1.33-.08-.31-.1-.71-.23-1.21-.45-2.14-.93-3.54-3.11-3.65-3.26-.1-.15-.87-1.15-.87-2.2 0-1.05.55-1.56.74-1.78z" />
      </svg>
    ),
  },
  {
    key: "impostazioni",
    label: "Impostazioni email",
    subtitle: "Mittente, reply-to e branding.",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
        <rect x="3.75" y="6" width="16.5" height="12" rx="2.25" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 7l7.05 5.1a.75.75 0 00.9 0L19.5 7" />
      </svg>
    ),
  },
];

function normalizeTab(value: string | null | undefined): TabKey {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "campagne" || normalized === "modelli") return "messaggi";
  if (normalized === "moduli" || normalized === "form-pubblici" || normalized === "pagine-e-moduli") return "moduli";
  if (normalized === "invii" || normalized === "invii-statistiche" || normalized === "panoramica") return "panoramica";
  if (normalized === "impostazioni" || normalized === "invio-email") return "impostazioni";
  if (normalized === "whatsapp") return "whatsapp";
  if (normalized === "messaggi") return "messaggi";
  return "messaggi";
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

  useEffect(() => {
    const next = normalizeTab(searchParams.get("tab"));
    if (next !== activeTab) {
      setActiveTab(next);
    }
  }, [activeTab, searchParams]);

  useEffect(() => {
    if (!loading && !whatsappEnabled && activeTab === "whatsapp") {
      selectTab("messaggi");
    }
  }, [activeTab, loading, whatsappEnabled]);

  if (loading) {
    return (
      <div className="container-shell py-8 space-y-5">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full rounded-[2rem]" />
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
          <div className="overflow-hidden rounded-[1.7rem] border border-[#e4ded0] bg-[#f6f2e8] shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
              {communicationsTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`group flex min-h-[92px] items-start gap-3 border-b border-[#e8e1d3] px-5 py-5 text-left transition sm:min-h-[100px] xl:border-b-0 xl:border-r xl:last:border-r-0 ${
                    activeTab === tab.key
                      ? "bg-white text-neutral-950 shadow-[inset_0_-2px_0_0_#17494a]"
                      : "bg-transparent text-[#31484a] hover:bg-white/70"
                  }`}
                  onClick={() => selectTab(tab.key)}
                >
                  <span
                    className={`mt-0.5 shrink-0 transition ${
                      activeTab === tab.key ? "text-[#173f42]" : "text-[#274f52]/90 group-hover:text-[#173f42]"
                    }`}
                  >
                    {tab.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[17px] font-semibold leading-5">{tab.label}</span>
                    <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8a948d]">
                      {tab.subtitle}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-8 md:px-8">
          {activeTab === "panoramica" && (
            <CommunicationsOverview
              communicationsLocked={communicationsLocked}
              onQuickAction={() => selectTab("messaggi")}
              onTabChange={(tab) => {
                if (tab === "campagne" || tab === "modelli") {
                  selectTab("messaggi");
                  return;
                }
                if (tab === "moduli") {
                  selectTab("moduli");
                  return;
                }
                if (tab === "impostazioni") {
                  selectTab("impostazioni");
                  return;
                }
                selectTab("panoramica");
              }}
            />
          )}
          {activeTab === "messaggi" && (
            <MessagesHub communicationsLocked={communicationsLocked} />
          )}
          {activeTab === "whatsapp" && (
            whatsappEnabled ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 pb-4">
                  {([
                    { key: "inbox", label: "Chat e connessione", hint: "QR code, stato sessione e inbox." },
                    { key: "automazioni", label: "Automazioni", hint: "Regole collegate ai form." },
                  ] as const).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => selectWhatsAppView(item.key)}
                      className={`rounded-[1rem] border px-4 py-2.5 text-left transition ${
                        activeWhatsAppView === item.key
                          ? "border-neutral-900 bg-neutral-900 text-white"
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
              <div className="rounded-[1.75rem] border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-sm text-neutral-600">
                WhatsApp non è ancora attivo per questa associazione. Quando la connessione sarà disponibile, qui vedrai le automazioni collegate ai form pubblici.
              </div>
            )
          )}
          {activeTab === "moduli" && (
            <PublicFormsHub locked={communicationsLocked} />
          )}
          {activeTab === "impostazioni" && (
            <EmailSendingSettings communicationsLocked={communicationsLocked} />
          )}
        </div>
      </section>
    </div>
  );
}
