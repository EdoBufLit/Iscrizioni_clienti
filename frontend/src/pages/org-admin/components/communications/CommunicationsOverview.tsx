import { useEffect, useMemo, useState, type ReactNode } from "react";
import Skeleton from "../../../../components/ui/Skeleton";
import {
  fetchOrgAdminCommunicationSettings,
  fetchOrgAdminEmailCampaigns,
  fetchOrgAdminForms,
} from "../../../../lib/api";
import { useOrgAdmin } from "../../OrgAdminLayout";
import { ActionCard, SectionPanel, StatusChip } from "../OrgAdminPrimitives";

type CommunicationsOverviewProps = {
  onTabChange: (tab: "panoramica" | "campagne" | "modelli" | "moduli" | "whatsapp" | "invii" | "impostazioni") => void;
  onQuickAction: (intent: "form_invite" | "general" | "renewal") => void;
  communicationsLocked: boolean;
  whatsappEnabled: boolean;
};

type RecentActivity = {
  id: string;
  icon: string;
  title: string;
  meta: string;
  date?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatUpdatedAt() {
  return new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function KpiIcon({ name }: { name: "send" | "draft" | "form" | "whatsapp" | "mail" | "clock" | "check" }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "send") {
    return (
      <svg {...common}>
        <path d="M21 3 10 14" />
        <path d="m21 3-7 18-4-7-7-4 18-7Z" />
      </svg>
    );
  }
  if (name === "draft") {
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </svg>
    );
  }
  if (name === "form") {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="2.5" />
        <path d="M8 9h8" />
        <path d="M8 13h3" />
        <path d="M14 13h2" />
        <path d="M8 17h8" />
      </svg>
    );
  }
  if (name === "whatsapp") {
    return (
      <svg {...common}>
        <path d="M5.5 19.5 6.4 16A7.7 7.7 0 1 1 9 18.3Z" />
        <path d="M9.4 8.8c.2-.5.4-.5.7-.5h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .4-.1.6l-.4.5c.6 1 1.4 1.8 2.5 2.3l.5-.5c.2-.2.4-.2.7-.1l1.5.7c.3.1.4.3.4.6v.5c0 .4-.2.6-.5.8-.6.3-1.8.3-3.1-.3-1.8-.8-3.5-2.4-4.3-4.2-.6-1.3-.5-2.4-.1-3Z" />
      </svg>
    );
  }
  if (name === "mail") {
    return (
      <svg {...common}>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg {...common} width={16} height={16}>
        <path d="m4 12 4 4 12-12" />
      </svg>
    );
  }
  return (
    <svg {...common} width={16} height={16}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function CommunicationsKpiCard({
  label,
  value,
  description,
  icon,
  tone,
  footer,
  badge,
  badgeIcon,
}: {
  label: string;
  value: ReactNode;
  description: string;
  icon: "send" | "draft" | "form" | "whatsapp" | "mail";
  tone: "success" | "info" | "warning" | "muted";
  footer: string;
  badge?: string;
  badgeIcon?: "check";
}) {
  return (
    <article className={`comm-kpi-card comm-kpi-card--${tone}`}>
      <div className="comm-kpi-card__top">
        <span className="comm-kpi-card__icon">
          <KpiIcon name={icon} />
        </span>
        <div className="comm-kpi-card__content">
          <p className="comm-kpi-card__label">{label}</p>
          <div className="comm-kpi-card__value-row">
            <p className="comm-kpi-card__value">{value}</p>
            {badge ? (
              <span className="comm-kpi-card__badge">
                {badge}
                {badgeIcon ? <KpiIcon name={badgeIcon} /> : null}
              </span>
            ) : null}
          </div>
          <p className="comm-kpi-card__description">{description}</p>
        </div>
      </div>
      <div className="comm-kpi-card__footer">
        <span className="comm-kpi-card__updated">
          <KpiIcon name="clock" />
          {footer}
        </span>
      </div>
    </article>
  );
}

export function CommunicationsOverview({
  onTabChange,
  onQuickAction,
  communicationsLocked,
  whatsappEnabled,
}: CommunicationsOverviewProps) {
  const { admin } = useOrgAdmin();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    sentCampaigns: 0,
    drafts: 0,
    activeForms: 0,
    totalForms: 0,
    totalCampaigns: 0,
  });
  const [senderInfo, setSenderInfo] = useState<{
    fromHeader: string;
    replyTo: string | null;
    domainLabel: string;
    configured: boolean;
  } | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);

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
        const sentCampaigns = campaigns.filter((item: any) => ["sent", "partial_failed"].includes(String(item.status || "").toLowerCase()));
        const draftCampaigns = campaigns.filter((item: any) => String(item.status || "").toLowerCase() === "draft");
        const activeForms = forms.filter((item: any) => item.is_active);

        setStats({
          sentCampaigns: sentCampaigns.length,
          drafts: draftCampaigns.length,
          activeForms: activeForms.length,
          totalForms: forms.length,
          totalCampaigns: campaigns.length,
        });

        const activities: RecentActivity[] = [
          ...campaigns.slice(0, 3).map((item: any) => ({
            id: `campaign-${item.id}`,
            icon: "↗",
            title: item.name || item.subject || "Campagna senza nome",
            meta: `${item.status || "bozza"} · ${item.planned_recipient_count ?? item.recipient_count ?? 0} destinatari`,
            date: item.sent_at || item.scheduled_at || item.created_at,
          })),
          ...forms.slice(0, 3).map((item: any) => ({
            id: `form-${item.id}`,
            icon: "▣",
            title: item.title,
            meta: `${item.submission_status_counts?.total ?? item.submission_count ?? 0} risposte · ${item.field_count ?? 0} campi`,
            date: item.updated_at || item.created_at,
          })),
        ]
          .sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime())
          .slice(0, 5);
        setRecentActivities(activities);

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
            configured: true,
          });
          return;
        }

        setSenderInfo({
          fromHeader: settingsData.system_email_sender?.from_header || settingsData.system_email_sender?.from_email || "noreply@assonam.it",
          replyTo: settingsData.system_email_sender?.reply_to || null,
          domainLabel: settingsData.mail_from_domain || "Mittente di sistema",
          configured: Boolean(settingsData.system_email_sender?.from_email || settingsData.system_email_sender?.from_header),
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [admin?.organization?.id, admin?.organization?.name]);

  const integrationRows = useMemo(
    () => [
      { label: "Mail", detail: senderInfo?.domainLabel || "Mittente da configurare", status: senderInfo?.configured ? "Attiva" : "Da configurare", tone: senderInfo?.configured ? "success" : "warning" },
      { label: "WhatsApp", detail: whatsappEnabled ? "Canale connesso o configurabile" : "Modulo non abilitato", status: whatsappEnabled ? "Attivo" : "Non attivo", tone: whatsappEnabled ? "success" : "muted" },
      { label: "Automazioni", detail: `${stats.activeForms} form attivi disponibili`, status: stats.activeForms > 0 ? "Pronte" : "Nessun form", tone: stats.activeForms > 0 ? "info" : "muted" },
      { label: "Comunicazioni", detail: communicationsLocked ? "Modulo bloccato" : "Workspace operativo", status: communicationsLocked ? "Bloccato" : "Attivo", tone: communicationsLocked ? "warning" : "success" },
    ] as const,
    [communicationsLocked, senderInfo, stats.activeForms, whatsappEnabled],
  );

  const updatedAt = useMemo(() => formatUpdatedAt(), []);
  const sentArchiveShare = stats.totalCampaigns > 0 ? Math.round((stats.sentCampaigns / stats.totalCampaigns) * 100) : 0;
  const publishedFormsShare = stats.totalForms > 0 ? Math.round((stats.activeForms / stats.totalForms) * 100) : 0;

  if (loading) {
    return (
      <div className="grid gap-5">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-60 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="comm-kpi-grid">
        <CommunicationsKpiCard
          label="Campagne inviate"
          value={stats.sentCampaigns}
          description={`${stats.sentCampaigns} operative in archivio`}
          icon="send"
          tone="success"
          footer={`Aggiornato oggi, ${updatedAt}`}
          badge={sentArchiveShare > 0 ? `${sentArchiveShare}%` : undefined}
        />
        <CommunicationsKpiCard
          label="Bozze aperte"
          value={stats.drafts}
          description={stats.drafts ? `${stats.totalCampaigns} campagne totali` : "Nessuna bozza in lavorazione"}
          icon="draft"
          tone="info"
          footer={`Aggiornato oggi, ${updatedAt}`}
          badge={stats.drafts ? `${stats.drafts}` : "-"}
        />
        <CommunicationsKpiCard
          label="Form attivi"
          value={stats.activeForms}
          description={`${stats.totalForms} form creati`}
          icon="form"
          tone="success"
          footer={`Aggiornato oggi, ${updatedAt}`}
          badge={publishedFormsShare > 0 ? `${publishedFormsShare}% pubblicati` : undefined}
        />
        <CommunicationsKpiCard
          label="Stato WhatsApp"
          value={whatsappEnabled ? "Attivo" : "No"}
          description={whatsappEnabled ? "Connessione disponibile" : "Canale non attivo"}
          icon="whatsapp"
          tone={whatsappEnabled ? "success" : "muted"}
          footer={`Aggiornato oggi, ${updatedAt}`}
          badge={whatsappEnabled ? "Operativo" : "Non attivo"}
        />
        <CommunicationsKpiCard
          label="Email configurata"
          value={senderInfo?.configured ? "Sì" : "No"}
          description={senderInfo?.domainLabel || "Mittente da verificare"}
          icon="mail"
          tone={senderInfo?.configured ? "info" : "warning"}
          footer={`Aggiornato oggi, ${updatedAt}`}
          badge={senderInfo?.configured ? "Verificata" : "Da verificare"}
          badgeIcon={senderInfo?.configured ? "check" : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <SectionPanel title="Cosa fare adesso">
          <div className="grid gap-3 md:grid-cols-2">
            <ActionCard
              icon="↗"
              title="Invia ai soci"
              description="Crea una campagna per il segmento principale dei soci attivi."
              cta="Crea campagna"
              onClick={() => onQuickAction("general")}
              disabled={communicationsLocked}
            />
            <ActionCard
              icon="⏱"
              title="Promemoria rinnovo"
              description="Prepara un reminder verso chi deve rinnovare la tessera."
              cta="Crea promemoria"
              onClick={() => onQuickAction("renewal")}
              disabled={communicationsLocked}
            />
            <ActionCard
              icon="▣"
              title="Collega un form"
              description="Crea un invito email a un modulo pubblico e traccia le risposte."
              cta="Invito form"
              onClick={() => onQuickAction("form_invite")}
              disabled={communicationsLocked}
            />
            <ActionCard
              icon="✉"
              title="Configura mittente"
              description="Controlla nome mittente, dominio e email di risposta."
              cta="Apri email"
              onClick={() => onTabChange("impostazioni")}
            />
          </div>
        </SectionPanel>

        <SectionPanel title="Navigazione consigliata">
          <div className="grid gap-3">
            <ActionCard title="Modelli" description="Crea e gestisci messaggi riusabili." onClick={() => onTabChange("modelli")} />
            <ActionCard title="Form pubblici" description="Raccogli iscrizioni, richieste e prenotazioni." onClick={() => onTabChange("moduli")} />
            {whatsappEnabled ? (
              <ActionCard title="WhatsApp" description="Apri inbox e automazioni collegate ai form." onClick={() => onTabChange("whatsapp")} />
            ) : null}
            <ActionCard title="Email" description="Verifica mittente e invia una mail di test." onClick={() => onTabChange("impostazioni")} />
          </div>
        </SectionPanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <SectionPanel title="Attività recenti">
          {recentActivities.length ? (
            <div className="divide-y divide-slate-100">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 font-bold text-[#0f5e5d]">{activity.icon}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{activity.title}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{activity.meta}</p>
                  </div>
                  <span className="text-xs font-medium text-slate-400">{formatDate(activity.date)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="org-empty-state">
              <p className="org-empty-state__title">Nessuna attività recente</p>
              <p className="org-empty-state__description">Le campagne inviate e i form aggiornati comparirànno qui.</p>
            </div>
          )}
        </SectionPanel>

        <SectionPanel title="Stato integrazioni">
          <div className="divide-y divide-slate-100">
            {integrationRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{row.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{row.detail}</p>
                </div>
                <StatusChip tone={row.tone}>{row.status}</StatusChip>
              </div>
            ))}
          </div>
        </SectionPanel>
      </div>

      {senderInfo ? (
        <SectionPanel>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="org-eyebrow">Mittente effettivo</p>
              <p className="mt-2 break-all text-sm font-semibold text-slate-950">{senderInfo.fromHeader}</p>
              <p className="mt-1 text-sm text-slate-500">
                Risposte: {senderInfo.replyTo || "stesso indirizzo mittente"} · Dominio: {senderInfo.domainLabel}
              </p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => onTabChange("impostazioni")}>
              Modifica email
            </button>
          </div>
        </SectionPanel>
      ) : null}
    </div>
  );
}
