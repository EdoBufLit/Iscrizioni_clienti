import { useEffect, useState } from "react";
import { useOrgAdmin } from "../../OrgAdminLayout";
import Skeleton from "../../../../components/ui/Skeleton";
import {
  fetchOrgAdminCommunicationSettings,
  fetchOrgAdminEmailCampaigns,
  fetchOrgAdminForms,
} from "../../../../lib/api";

type CommunicationsOverviewProps = {
  onTabChange: (tab: "campagne" | "modelli" | "moduli" | "invii" | "impostazioni") => void;
  onQuickAction: (intent: "form_invite" | "general" | "renewal") => void;
  communicationsLocked: boolean;
};

function StatCard(props: { label: string; value: number }) {
  const { label, value } = props;
  return (
    <div className="rounded-[1.25rem] bg-slate-50 p-6 ring-1 ring-inset ring-slate-200/60 transition-all hover:bg-slate-100/50">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-3 text-4xl font-light tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function QuickActionCard(props: {
  title: string;
  tone: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { title, tone, onClick, disabled = false } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[1.25rem] p-6 text-left transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 ${tone}`}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-base font-medium">{title}</p>
        <span className="text-xl font-light opacity-50 transition-transform group-hover:translate-x-1">&rarr;</span>
      </div>
    </button>
  );
}

export function CommunicationsOverview({
  onTabChange,
  onQuickAction,
  communicationsLocked,
}: CommunicationsOverviewProps) {
  const { admin } = useOrgAdmin();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    sentCampaigns: 0,
    drafts: 0,
    activeForms: 0,
  });
  const [senderInfo, setSenderInfo] = useState<{
    fromHeader: string;
    replyTo: string | null;
    domainLabel: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchOrgAdminCommunicationSettings().catch(() => null),
      fetchOrgAdminEmailCampaigns().catch(() => ({ items: [] })),
      fetchOrgAdminForms().catch(() => ({ items: [] })),
    ])
      .then(([settingsData, campaignData, formData]) => {
        if (cancelled) return;

        const campaigns = campaignData.items || [];
        const forms = formData.items || [];

        setStats({
          sentCampaigns: campaigns.filter((item: any) => ["sent", "partial_failed"].includes(String(item.status || "").toLowerCase())).length,
          drafts: campaigns.filter((item: any) => String(item.status || "").toLowerCase() === "draft").length,
          activeForms: forms.filter((item: any) => item.is_active).length,
        });

        if (!settingsData) return;
        const domain = settingsData.mail_from_domain?.toLowerCase() || null;
        const fromName = settingsData.email_from_name_override || admin?.organization?.name || "ASSONAM";
        const localPart = settingsData.sender_email_local_part || `org-${admin?.organization?.id || "x"}`;
        const hasAssociationSender = Boolean(settingsData.communications_enabled && domain && localPart);

        if (hasAssociationSender) {
          const fromEmail = `${localPart}@${domain}`;
          setSenderInfo({
            fromHeader: `${fromName} <${fromEmail}>`,
            replyTo: settingsData.reply_to_email || null,
            domainLabel: domain || "Dominio configurato",
          });
        } else {
          setSenderInfo({
            fromHeader: settingsData.system_email_sender?.from_header || settingsData.system_email_sender?.from_email || "noreply@assonam.it",
            replyTo: settingsData.system_email_sender?.reply_to || null,
            domainLabel: settingsData.mail_from_domain || "Mittente di sistema",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [admin?.organization?.id, admin?.organization?.name]);

  if (loading) {
    return (
      <div className="grid gap-5">
        <Skeleton className="h-20 w-full rounded-[1.75rem]" />
        <Skeleton className="h-36 w-full rounded-[1.75rem]" />
        <Skeleton className="h-24 w-full rounded-[1.75rem]" />
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Communications Module</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Panoramica</h1>
        </div>
        <button type="button" className="btn-secondary !rounded-full !px-5" onClick={() => onTabChange("impostazioni")}>
          Impostazioni email
        </button>
      </div>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-400 mb-6">Stato attuale</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Campagne inviate" value={stats.sentCampaigns} />
          <StatCard label="Bozze in lavorazione" value={stats.drafts} />
          <StatCard label="Form pubblici attivi" value={stats.activeForms} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-400 mb-6">Azioni rapide</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <QuickActionCard
            title="Invita a compilare un modulo"
            tone="bg-emerald-50/50 hover:bg-emerald-50 ring-1 ring-inset ring-emerald-500/20 text-emerald-900"
            onClick={() => onQuickAction("form_invite")}
            disabled={communicationsLocked}
          />
          <QuickActionCard
            title="Invia comunicazione ai soci"
            tone="bg-sky-50/50 hover:bg-sky-50 ring-1 ring-inset ring-sky-500/20 text-sky-900"
            onClick={() => onQuickAction("general")}
            disabled={communicationsLocked}
          />
          <QuickActionCard
            title="Ricorda un rinnovo"
            tone="bg-amber-50/50 hover:bg-amber-50 ring-1 ring-inset ring-amber-500/20 text-amber-900"
            onClick={() => onQuickAction("renewal")}
            disabled={communicationsLocked}
          />
        </div>
      </section>

      {senderInfo ? (
        <section className="rounded-[1.5rem] bg-slate-50 p-6 ring-1 ring-inset ring-slate-200/60">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Stato invio email</p>
              <p className="mt-3 text-base font-medium text-slate-900 break-all">{senderInfo.fromHeader}</p>
              <p className="mt-1 text-sm text-slate-500">
                Reply-to: {senderInfo.replyTo || "Usa il mittente"} &bull; Dominio: {senderInfo.domainLabel}
              </p>
            </div>
            <button type="button" className="btn-secondary !rounded-full !text-sm !px-5" onClick={() => onTabChange("impostazioni")}>
              Modifica
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
