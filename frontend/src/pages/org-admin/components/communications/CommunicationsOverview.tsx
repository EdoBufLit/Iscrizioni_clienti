import { useEffect, useState } from "react";
import { useOrgAdmin } from "../../OrgAdminLayout";
import Skeleton from "../../../../components/ui/Skeleton";
import {
  fetchOrgAdminCommunicationSettings,
  fetchOrgAdminEmailCampaigns,
  fetchOrgAdminForms,
  fetchOrgAdminEmailTemplates,
} from "../../../../lib/api";

type CommunicationsOverviewProps = {
  onTabChange: (tab: "campagne" | "modelli" | "moduli" | "invii" | "impostazioni") => void;
  onQuickAction: (intent: "form_invite" | "general" | "renewal" | "survey") => void;
  communicationsLocked: boolean;
};

function StatCard(props: { label: string; value: number; hint: string }) {
  const { label, value, hint } = props;
  return (
    <div className="rounded-[1.5rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">{label}</p>
      <p className="mt-3 text-4xl font-bold tracking-tight text-neutral-900">{value}</p>
      <p className="mt-2 text-sm text-neutral-500">{hint}</p>
    </div>
  );
}

function QuickActionCard(props: {
  title: string;
  description: string;
  tone: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { title, description, tone, onClick, disabled = false } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group rounded-[1.6rem] border p-5 text-left shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${tone}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-neutral-900">{title}</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p>
        </div>
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-xl shadow-sm">
          →
        </span>
      </div>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-neutral-500 group-hover:text-neutral-700">
        Apri workflow guidato
      </p>
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
    responses: 0,
  });
  const [senderInfo, setSenderInfo] = useState<{
    fromHeader: string;
    replyTo: string | null;
    fallbackUsed: boolean;
    domainLabel: string;
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
      .then(([settingsData, campaignData, , formData]) => {
        if (cancelled) return;

        const forms = formData.items || [];
        const campaigns = campaignData.items || [];
        setStats({
          sentCampaigns: campaigns.filter((item: any) => ["sent", "partial_failed"].includes(String(item.status || "").toLowerCase())).length,
          drafts: campaigns.filter((item: any) => String(item.status || "").toLowerCase() === "draft").length,
          activeForms: forms.filter((item: any) => item.is_active).length,
          responses: forms.reduce((sum: number, item: any) => sum + (item.submission_count || 0), 0),
        });

        if (!settingsData) return;
        const domain = settingsData.mail_from_domain?.toLowerCase() || null;
        const systemEmail = settingsData.system_email_sender?.from_email || "noreply@assonam.it";
        const systemHeader = settingsData.system_email_sender?.from_header || systemEmail;
        const fromName = settingsData.email_from_name_override || admin?.organization?.name || "ASSONAM";
        let localPart = settingsData.sender_email_local_part;
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
            domainLabel: domain || "Dominio configurato",
          });
        } else {
          setSenderInfo({
            fromHeader: systemHeader,
            replyTo: settingsData.system_email_sender?.reply_to || null,
            fallbackUsed: true,
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
      <div className="grid gap-6">
        <Skeleton className="h-40 w-full rounded-[2rem]" />
        <Skeleton className="h-56 w-full rounded-[2rem]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-6 rounded-[2rem] border border-neutral-200 bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.14),_transparent_38%),linear-gradient(135deg,#ffffff_0%,#f8fafc_48%,#eef6ff_100%)] p-7 shadow-sm lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand">Comunicazioni</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-neutral-900">Invia email ai soci, raccogli risposte tramite form pubblici e programma campagne in pochi passaggi.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600">
            La nuova area Comunicazioni ti guida dalla scelta del tipo di messaggio fino alla preview finale, mantenendo compatibilità con i flussi multi-tenant già attivi.
          </p>
        </div>
        <div className="rounded-[1.7rem] border border-neutral-200 bg-white/85 p-5 shadow-sm backdrop-blur">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Stato invio email</p>
          {senderInfo ? (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs text-neutral-500">Mittente attuale</p>
                <p className="mt-1 font-semibold text-neutral-900 break-all">{senderInfo.fromHeader}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-neutral-500">Reply-to</p>
                  <p className="mt-1 font-medium text-neutral-900 break-all">{senderInfo.replyTo || "Usa il mittente"}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Stato dominio / mittente</p>
                  <p className="mt-1 font-medium text-neutral-900">{senderInfo.domainLabel}</p>
                </div>
              </div>
              <div className={`rounded-2xl border px-4 py-3 text-sm ${senderInfo.fallbackUsed ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                {senderInfo.fallbackUsed
                  ? "Stai usando il mittente di sistema. Puoi personalizzare dominio e nome mittente da Impostazioni email."
                  : "Mittente personalizzato attivo. Le campagne useranno questa configurazione come default."}
              </div>
              <button type="button" className="btn-secondary w-full" onClick={() => onTabChange("impostazioni")}>
                Modifica impostazioni email
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-neutral-500">Impostazioni mittente non disponibili.</p>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Azioni rapide</p>
            <h2 className="mt-2 text-2xl font-semibold text-neutral-900">Scegli cosa vuoi creare</h2>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <QuickActionCard
            title="Invita a compilare un modulo"
            description="Crea una campagna con pulsante che apre un modulo pubblico nel browser."
            tone="border-emerald-200 bg-emerald-50/80"
            onClick={() => onQuickAction("form_invite")}
            disabled={communicationsLocked}
          />
          <QuickActionCard
            title="Invia comunicazione ai soci"
            description="Messaggio editoriale guidato per tutti i soci, segmenti o selezionati manualmente."
            tone="border-sky-200 bg-sky-50/80"
            onClick={() => onQuickAction("general")}
            disabled={communicationsLocked}
          />
          <QuickActionCard
            title="Ricorda un rinnovo"
            description="Imposta un reminder chiaro con CTA verso il rinnovo e anteprima finale."
            tone="border-amber-200 bg-amber-50/80"
            onClick={() => onQuickAction("renewal")}
            disabled={communicationsLocked}
          />
          <QuickActionCard
            title="Crea da modello"
            description="Apri la libreria modelli e riusa layout, microcopy e CTA già approvate."
            tone="border-violet-200 bg-violet-50/80"
            onClick={() => onTabChange("modelli")}
            disabled={communicationsLocked}
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Campagne inviate" value={stats.sentCampaigns} hint="Campagne già partite o concluse." />
        <StatCard label="Bozze" value={stats.drafts} hint="Campagne ancora da rifinire o programmare." />
        <StatCard label="Form pubblici attivi" value={stats.activeForms} hint="Moduli disponibili da collegare alle email." />
        <StatCard label="Risposte ricevute" value={stats.responses} hint="Somma delle risposte raccolte dai form." />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-[1.6rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-neutral-900">Campagne</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Usa il wizard step-by-step per scegliere tipo di comunicazione, destinatari, contenuto, azione del pulsante, aspetto, preview e invio finale.
          </p>
          <button type="button" className="btn-secondary mt-5" onClick={() => onTabChange("campagne")}>
            Apri campagne
          </button>
        </div>
        <div className="rounded-[1.6rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-neutral-900">Form pubblici</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Mantieni un collegamento mentale forte tra modulo pubblico e email: crea il form, copiane il link e trasformalo subito in invito email.
          </p>
          <button type="button" className="btn-secondary mt-5" onClick={() => onTabChange("moduli")}>
            Apri form pubblici
          </button>
        </div>
        <div className="rounded-[1.6rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-neutral-900">Invii e statistiche</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Controlla inviate, programmate, bozze e fallite nello stesso elenco senza confondere creazione contenuti e performance di invio.
          </p>
          <button type="button" className="btn-secondary mt-5" onClick={() => onTabChange("invii")}>
            Apri invii e statistiche
          </button>
        </div>
      </section>
    </div>
  );
}
