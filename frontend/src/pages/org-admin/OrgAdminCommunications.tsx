import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { applySeo } from "../../lib/seo";
import { fetchOrgAdminCommunicationSettings } from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";

import { CommunicationsOverview } from "./components/communications/CommunicationsOverview";
import { MessagesHub } from "./components/communications/MessagesHub";
import { PublicFormsHub } from "./components/communications/PublicFormsHub";
import { EmailSendingSettings } from "./components/communications/EmailSendingSettings";

type TabKey = "panoramica" | "messaggi" | "moduli" | "impostazioni";

const COMMUNICATIONS_LOCKED_MESSAGE = "Modulo Comunicazioni non attivo. Contatta ASSONAM per abilitarlo.";

export default function OrgAdminCommunications() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = (searchParams.get("tab") || "").trim().toLowerCase();
  const isValidTab = (value: string): value is TabKey =>
    value === "panoramica" || value === "messaggi" || value === "moduli" || value === "impostazioni";
  
  const [activeTab, setActiveTab] = useState<TabKey>(isValidTab(initialTab) ? initialTab : "panoramica");
  const [loading, setLoading] = useState(true);
  const [communicationsLocked, setCommunicationsLocked] = useState(true);

  useEffect(() => {
    applySeo({
      title: "Comunicazioni Associazione",
      description: "Gestione email associazione, campagne e storico invii.",
      noindex: true,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchOrgAdminCommunicationSettings()
      .then((settings) => {
        if (!cancelled) setCommunicationsLocked(!settings.communications_enabled);
      })
      .catch(() => {
        if (!cancelled) setCommunicationsLocked(true);
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

  useEffect(() => {
    const next = (searchParams.get("tab") || "").trim().toLowerCase();
    if (isValidTab(next) && next !== activeTab) {
      setActiveTab(next);
    }
  }, [activeTab, searchParams]);

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
          <div className="flex flex-wrap gap-2 border-b border-neutral-200">
            {[
              { key: "panoramica", label: "Panoramica" },
              { key: "messaggi", label: "Messaggi" },
              { key: "moduli", label: "Pagine e moduli" },
              { key: "impostazioni", label: "Invio email" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`rounded-t-2xl px-5 py-3 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? "bg-brand text-white shadow-sm"
                    : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                }`}
                onClick={() => selectTab(tab.key as TabKey)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-8 md:px-8">
          {activeTab === "panoramica" && (
            <CommunicationsOverview onTabChange={(tab) => selectTab(tab as TabKey)} communicationsLocked={communicationsLocked} />
          )}
          {activeTab === "messaggi" && (
            <MessagesHub communicationsLocked={communicationsLocked} />
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
