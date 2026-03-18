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
    <div className="rounded-[1.4rem] border border-neutral-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-neutral-900">{value}</p>
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
      className={`rounded-[1.5rem] border px-5 py-4 text-left shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${tone}`}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-neutral-900">{title}</p>
        <span className="text-lg text-neutral-500">→</span>
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Comunicazioni</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">Comunicazioni</h1>
        </div>
        <button type="button" className="btn-secondary" onClick={() => onTabChange("impostazioni")}>
          Impostazioni email
        </button>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Campagne inviate" value={stats.sentCampaigns} />
        <StatCard label="Bozze" value={stats.drafts} />
        <StatCard label="Form pubblici attivi" value={stats.activeForms} />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <QuickActionCard
          title="Invita a compilare un modulo"
          tone="border-emerald-200 bg-emerald-50/80"
          onClick={() => onQuickAction("form_invite")}
          disabled={communicationsLocked}
        />
        <QuickActionCard
          title="Invia comunicazione ai soci"
          tone="border-sky-200 bg-sky-50/80"
          onClick={() => onQuickAction("general")}
          disabled={communicationsLocked}
        />
        <QuickActionCard
          title="Ricorda un rinnovo"
          tone="border-amber-200 bg-amber-50/80"
          onClick={() => onQuickAction("renewal")}
          disabled={communicationsLocked}
        />
      </section>

      {senderInfo ? (
        <section className="rounded-[1.5rem] border border-neutral-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Stato invio email</p>
              <p className="mt-2 text-sm font-semibold text-neutral-900 break-all">{senderInfo.fromHeader}</p>
              <p className="mt-1 text-xs text-neutral-500">
                Reply-to: {senderInfo.replyTo || "Usa il mittente"} · Stato dominio: {senderInfo.domainLabel}
              </p>
            </div>
            <button type="button" className="btn-secondary !text-sm" onClick={() => onTabChange("impostazioni")}>
              Modifica
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
