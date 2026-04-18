import { useEffect, useState } from "react";
import { useOrgAdmin } from "../../OrgAdminLayout";
import Skeleton from "../../../../components/ui/Skeleton";
import {
  fetchOrgAdminCommunicationSettings,
  fetchOrgAdminEmailCampaigns,
  fetchOrgAdminForms,
} from "../../../../lib/api";

type CommunicationsOverviewProps = {
  onTabChange: (tab: "panoramica" | "campagne" | "modelli" | "moduli" | "whatsapp" | "invii" | "impostazioni") => void;
  onQuickAction: (intent: "form_invite" | "general" | "renewal") => void;
  communicationsLocked: boolean;
  whatsappEnabled: boolean;
};

function StatCard(props: { label: string; value: string | number; detail: string }) {
  const { label, value, detail } = props;
  return (
    <div className="rounded-[1.25rem] bg-slate-50 p-6 ring-1 ring-inset ring-slate-200/60 transition-all hover:bg-slate-100/50">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-3 text-4xl font-light tracking-tight text-slate-900">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

function QuickActionCard(props: {
  title: string;
  description: string;
  cta: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { title, description, cta, onClick, disabled = false } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group rounded-[1.4rem] border border-slate-200 bg-white p-6 text-left transition-all duration-300 hover:border-slate-300 hover:shadow-[0_18px_32px_rgba(15,23,42,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-slate-900">{title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <span className="text-xl font-light text-slate-300 transition-transform group-hover:translate-x-1">&rarr;</span>
      </div>
      <div className="mt-5 inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
        {cta}
      </div>
    </button>
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
          return;
        }

        setSenderInfo({
          fromHeader: settingsData.system_email_sender?.from_header || settingsData.system_email_sender?.from_email || "noreply@assonam.it",
          replyTo: settingsData.system_email_sender?.reply_to || null,
          domainLabel: settingsData.mail_from_domain || "Mittente di sistema",
        });
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
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="max-w-3xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Panoramica comunicazioni</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Cosa fare adesso</h2>
          <p className="mt-2 text-sm text-slate-500">
            La home del workspace tiene insieme campagne, modelli, form pubblici, WhatsApp e configurazione mittente.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-secondary !rounded-full !px-5" onClick={() => onTabChange("campagne")}>
            Apri campagne
          </button>
          <button type="button" className="btn-secondary !rounded-full !px-5" onClick={() => onTabChange("impostazioni")}>
            Configura email
          </button>
        </div>
      </div>

      <section>
        <h3 className="mb-6 text-sm font-bold uppercase tracking-[0.15em] text-slate-400">Stato attuale</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Campagne inviate" value={stats.sentCampaigns} detail="Invii conclusi o parzialmente completati." />
          <StatCard label="Bozze aperte" value={stats.drafts} detail="Campagne ancora da rifinire o programmare." />
          <StatCard label="Form attivi" value={stats.activeForms} detail="Moduli pubblici disponibili alla compilazione." />
          <StatCard
            label="Stato WhatsApp"
            value={whatsappEnabled ? "Attivo" : "Non attivo"}
            detail={
              whatsappEnabled
                ? "Inbox e automazioni sono disponibili nel workspace."
                : "La sezione resta nascosta finché la funzione non viene abilitata."
            }
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h3 className="mb-6 text-sm font-bold uppercase tracking-[0.15em] text-slate-400">Da fare ora</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <QuickActionCard
              title="Invia un invito a un form"
              description="Crea una campagna collegata a un modulo pubblico già attivo o in preparazione."
              cta="Apri campagne"
              onClick={() => onQuickAction("form_invite")}
              disabled={communicationsLocked}
            />
            <QuickActionCard
              title="Comunica ai soci"
              description="Prepara un invio generale partendo da un modello o da una nuova bozza."
              cta="Nuova campagna"
              onClick={() => onQuickAction("general")}
              disabled={communicationsLocked}
            />
            <QuickActionCard
              title="Ricorda un rinnovo"
              description="Lancia una campagna di promemoria verso i soci con tessera da rinnovare."
              cta="Promemoria rinnovo"
              onClick={() => onQuickAction("renewal")}
              disabled={communicationsLocked}
            />
          </div>
        </div>

        <div className="rounded-[1.5rem] bg-slate-50 p-6 ring-1 ring-inset ring-slate-200/60">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Navigazione consigliata</p>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-[1rem] bg-white px-4 py-3 text-left ring-1 ring-inset ring-slate-200 transition hover:ring-slate-300"
              onClick={() => onTabChange("modelli")}
            >
              <span>Rivedi i modelli riusabili</span>
              <span className="font-semibold text-slate-900">Modelli</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-[1rem] bg-white px-4 py-3 text-left ring-1 ring-inset ring-slate-200 transition hover:ring-slate-300"
              onClick={() => onTabChange("moduli")}
            >
              <span>Gestisci link pubblici e notifiche</span>
              <span className="font-semibold text-slate-900">Form pubblici</span>
            </button>
            {whatsappEnabled ? (
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-[1rem] bg-white px-4 py-3 text-left ring-1 ring-inset ring-slate-200 transition hover:ring-slate-300"
                onClick={() => onTabChange("whatsapp")}
              >
                <span>Controlla inbox e regole collegate ai form</span>
                <span className="font-semibold text-slate-900">WhatsApp</span>
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {senderInfo ? (
        <section className="rounded-[1.5rem] bg-slate-50 p-6 ring-1 ring-inset ring-slate-200/60">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Mittente effettivo</p>
              <p className="mt-3 break-all text-base font-medium text-slate-900">{senderInfo.fromHeader}</p>
              <p className="mt-2 text-sm text-slate-500">
                Risposte: {senderInfo.replyTo || "stesso indirizzo mittente"} • Dominio: {senderInfo.domainLabel}
              </p>
            </div>
            <button type="button" className="btn-secondary !rounded-full !text-sm !px-5" onClick={() => onTabChange("impostazioni")}>
              Modifica impostazioni
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
