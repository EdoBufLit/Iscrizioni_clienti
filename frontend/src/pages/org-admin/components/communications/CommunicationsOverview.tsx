import { useEffect, useMemo, useState } from "react";
import Skeleton from "../../../../components/ui/Skeleton";
import {
  fetchOrgAdminCommunicationSettings,
  fetchOrgAdminEmailCampaigns,
  fetchOrgAdminForms,
} from "../../../../lib/api";
import { useOrgAdmin } from "../../OrgAdminLayout";
import { ActionCard, KpiCard, SectionPanel, StatusChip } from "../OrgAdminPrimitives";

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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Campagne inviate" value={stats.sentCampaigns} hint="+ operative in archivio" tone="success" icon="↗" />
        <KpiCard label="Bozze aperte" value={stats.drafts} hint={`${stats.totalCampaigns} campagne totali`} tone="info" icon="□" />
        <KpiCard label="Form attivi" value={stats.activeForms} hint={`${stats.totalForms} form creati`} tone="success" icon="▣" />
        <KpiCard label="Stato WhatsApp" value={whatsappEnabled ? "Attivo" : "No"} hint={whatsappEnabled ? "Connessione disponibile" : "Canale non attivo"} tone={whatsappEnabled ? "success" : "muted"} icon="◌" />
        <KpiCard label="Email configurata" value={senderInfo?.configured ? "Si" : "No"} hint={senderInfo?.domainLabel || "Mittente da verificare"} tone={senderInfo?.configured ? "success" : "warning"} icon="✉" />
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
              <p className="org-empty-state__description">Le campagne inviate e i form aggiornati compariranno qui.</p>
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
