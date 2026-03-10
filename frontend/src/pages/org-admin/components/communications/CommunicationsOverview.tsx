import { useEffect, useState } from "react";
import { useOrgAdmin } from "../../OrgAdminLayout";
import Skeleton from "../../../../components/ui/Skeleton";
import {
  fetchOrgAdminCommunicationSettings,
  fetchOrgAdminEmailCampaigns,
  fetchOrgAdminEmailTemplates,
  fetchOrgAdminForms,
} from "../../../../lib/api";

type CommunicationsOverviewProps = {
  onTabChange: (tab: string) => void;
  communicationsLocked: boolean;
};

export function CommunicationsOverview({ onTabChange, communicationsLocked }: CommunicationsOverviewProps) {
  const { admin } = useOrgAdmin();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    campaigns: 0,
    templates: 0,
    forms: 0,
    responses: 0,
  });

  const [senderInfo, setSenderInfo] = useState<{
    fromHeader: string;
    replyTo: string | null;
    fallbackUsed: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchOrgAdminCommunicationSettings().catch(() => null),
      fetchOrgAdminEmailCampaigns().catch(() => ({ items: [] })),
      fetchOrgAdminEmailTemplates({ scope: "all", includeInactive: true }).catch(() => ({ items: [] })),
      fetchOrgAdminForms().catch(() => ({ items: [] })),
    ])
      .then(([settingsData, campaignData, templateData, formData]) => {
        if (cancelled) return;

        const forms = formData.items || [];
        setStats({
          campaigns: campaignData.items?.length || 0,
          templates: templateData.items?.filter((t: any) => t.is_active)?.length || 0,
          forms: forms.filter((f: any) => f.is_active).length,
          responses: forms.reduce((sum: number, f: any) => sum + (f.submission_count || 0), 0),
        });

        if (settingsData) {
          const domain = settingsData.mail_from_domain?.toLowerCase() || null;
          const systemEmail = settingsData.system_email_sender?.from_email || "noreply@assonam.it";
          const systemHeader = settingsData.system_email_sender?.from_header || systemEmail;
          const fromName = settingsData.email_from_name_override || admin?.organization?.name || "ASSONAM";
          
          let localPart = settingsData.sender_email_local_part;
          if (!localPart) {
            localPart = (admin?.organization?.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
          }
          if (!localPart) {
            localPart = `org-${admin?.organization?.id || "x"}`;
          }

          const hasAssociationSender = Boolean(settingsData.communications_enabled && domain && localPart);

          if (hasAssociationSender) {
            const fromEmail = `${localPart}@${domain}`;
            setSenderInfo({
              fromHeader: `${fromName} <${fromEmail}>`,
              replyTo: settingsData.reply_to_email || null,
              fallbackUsed: false,
            });
          } else {
            setSenderInfo({
              fromHeader: systemHeader,
              replyTo: settingsData.system_email_sender?.reply_to || null,
              fallbackUsed: true,
            });
          }
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
      <div className="grid gap-6">
        <Skeleton className="h-32 w-full rounded-[1.75rem]" />
        <Skeleton className="h-64 w-full rounded-[1.75rem]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm transition hover:shadow-md">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">Messaggi inviati</p>
          <p className="mt-3 text-4xl font-bold tracking-tight text-neutral-900">{stats.campaigns}</p>
        </div>
        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm transition hover:shadow-md">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">Modelli attivi</p>
          <p className="mt-3 text-4xl font-bold tracking-tight text-neutral-900">{stats.templates}</p>
        </div>
        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm transition hover:shadow-md">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">Pagine pubbliche</p>
          <p className="mt-3 text-4xl font-bold tracking-tight text-neutral-900">{stats.forms}</p>
        </div>
        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm transition hover:shadow-md">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">Risposte ricevute</p>
          <p className="mt-3 text-4xl font-bold tracking-tight text-neutral-900">{stats.responses}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">Azioni rapide</h2>
            <p className="mt-1 text-sm text-neutral-600">Scegli da dove iniziare per comunicare con i tuoi soci o il pubblico.</p>
            <div className="mt-6 flex flex-wrap gap-4">
              <button
                className="btn-primary py-3 px-6 text-base"
                onClick={() => onTabChange("messaggi")}
                disabled={communicationsLocked}
              >
                Crea messaggio
              </button>
              <button
                className="btn-secondary py-3 px-6 text-base"
                onClick={() => onTabChange("moduli")}
                disabled={communicationsLocked}
              >
                Crea pagina/modulo
              </button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-6">
            <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-neutral-500">Flusso consigliato</h3>
            <div className="mt-5 space-y-4">
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">1</div>
                <div>
                  <p className="font-semibold text-neutral-900">Prepara i tuoi Modelli</p>
                  <p className="mt-1 text-sm text-neutral-600">Crea dei modelli di base per le email, così non dovrai riscriverle ogni volta.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">2</div>
                <div>
                  <p className="font-semibold text-neutral-900">Usa le Pagine o invia Messaggi</p>
                  <p className="mt-1 text-sm text-neutral-600">Crea form per raccogliere dati, e usa i modelli per rispondere in automatico, oppure invia email massive ai soci.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">3</div>
                <div>
                  <p className="font-semibold text-neutral-900">Consulta le Risposte</p>
                  <p className="mt-1 text-sm text-neutral-600">Tieni traccia delle risposte ricevute dai tuoi moduli nella sezione apposita.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-900">Stato invio email</h3>
            {senderInfo ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs text-neutral-500">Mittente attuale</p>
                  <p className="mt-1 font-medium text-neutral-900 break-all">{senderInfo.fromHeader}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Indirizzo di risposta (Reply-To)</p>
                  <p className="mt-1 font-medium text-neutral-900 break-all">{senderInfo.replyTo || "Nessuno (usa mittente)"}</p>
                </div>
                {senderInfo.fallbackUsed ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Stai usando il mittente di sistema. Configura il tuo dominio per personalizzarlo.
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    Mittente personalizzato attivo.
                  </div>
                )}
                <button
                  className="mt-2 w-full rounded-xl border border-neutral-200 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                  onClick={() => onTabChange("impostazioni")}
                >
                  Modifica impostazioni
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-neutral-500">Caricamento impostazioni...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
