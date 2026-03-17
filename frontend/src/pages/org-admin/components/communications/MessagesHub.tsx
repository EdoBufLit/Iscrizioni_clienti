import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  archiveOrgAdminEmailTemplate,
  AuthError,
  createOrgAdminEmailCampaign,
  createOrgAdminEmailTemplate,
  duplicateOrgAdminEmailTemplate,
  fetchOrgAdminCommunicationAudienceEstimate,
  fetchOrgAdminEmailCampaign,
  fetchOrgAdminEmailCampaigns,
  fetchOrgAdminEmailTemplate,
  fetchOrgAdminEmailTemplates,
  fetchOrgAdminEmailTemplateVariables,
  fetchOrgAdminForms,
  previewOrgAdminEmailTemplate,
  searchOrgAdminCommunicationMembers,
  sendOrgAdminEmailCampaign,
  updateOrgAdminEmailTemplate,
  type AssociationForm,
  type OrgAdminCampaignAudienceType,
  type OrgAdminCampaignRecipientMode,
  type OrgAdminEmailCampaign,
  type OrgAdminEmailCtaKind,
  type OrgAdminEmailDesign,
  type OrgAdminEmailLayoutKey,
  type OrgAdminEmailTemplate,
  type OrgAdminEmailTemplateVariable,
  type OrgAdminMember,
} from "../../../../lib/api";
import { useToast } from "../../../../components/ui/ToastProvider";
import Skeleton from "../../../../components/ui/Skeleton";
import { ImageUpload } from "../../../../components/forms/builder/ImageUpload";

type Section = "campaigns" | "templates" | "deliveries";
type LaunchIntent = "form_invite" | "general" | "renewal" | "custom" | "survey" | null;
type WizardStepKey = "type" | "audience" | "content" | "cta" | "appearance" | "preview" | "send";
type PreviewView = "desktop" | "mobile" | "text" | "mock";
type LogoMode = "association" | "upload" | "none";
type HeaderMode = "none" | "form" | "upload";
type DeliveryFilter = "sent" | "scheduled" | "draft" | "failed";

type MessagesHubProps = {
  section: Section;
  communicationsLocked: boolean;
  launchIntent: LaunchIntent;
  launchFormId: number | null;
  launchTemplateId: number | null;
  onConsumeLaunch: () => void;
};

type CampaignComposerState = {
  name: string;
  subject: string;
  audience_type: OrgAdminCampaignAudienceType;
  recipient_mode: OrgAdminCampaignRecipientMode;
  scheduled_at: string;
  linked_form_id: number | null;
  design: OrgAdminEmailDesign;
  communication_type: Exclude<LaunchIntent, null>;
  save_as_template: boolean;
  logo_mode: LogoMode;
  header_mode: HeaderMode;
  selected_template_id: number | null;
  body: string;
};

type TemplateEditorState = {
  id: number | null;
  name: string;
  category: string;
  subject: string;
  body: string;
  linked_form_id: number | null;
  is_active: boolean;
  is_system: boolean;
  design: OrgAdminEmailDesign;
  logo_mode: LogoMode;
  header_mode: HeaderMode;
};

type PreviewState = {
  subject: string;
  body_html: string | null;
  body_text: string | null;
  fake_context: Record<string, string>;
};

const inputClass =
  "mt-1 w-full rounded-[1.1rem] border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10";
const labelClass = "block text-sm font-medium text-neutral-700";
const panelClass = "rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm";
const baseButtonClass = "rounded-[1.2rem] border px-4 py-3 text-left transition";

const defaultDesign: OrgAdminEmailDesign = {
  accent_color: "#0f766e",
  button_color: "#0f766e",
  hide_logo: false,
  logo_url: "",
  hero_image_url: "",
  email_title: "",
  cta_label: "",
  cta_note: "",
  cta_kind: "none",
  cta_url: "",
  layout_key: "essential",
  show_association_name: true,
};

const wizardSteps: Array<{ key: WizardStepKey; title: string; eyebrow: string }> = [
  { key: "type", title: "Tipo di comunicazione", eyebrow: "Step 1" },
  { key: "audience", title: "Destinatari", eyebrow: "Step 2" },
  { key: "content", title: "Contenuto", eyebrow: "Step 3" },
  { key: "cta", title: "Azione del pulsante", eyebrow: "Step 4" },
  { key: "appearance", title: "Aspetto", eyebrow: "Step 5" },
  { key: "preview", title: "Anteprima", eyebrow: "Step 6" },
  { key: "send", title: "Invio", eyebrow: "Step 7" },
];

const audienceOptions: Array<{ value: OrgAdminCampaignAudienceType; label: string; description: string }> = [
  { value: "active_members", label: "Tutti i soci attivi", description: "Invia la campagna all'intera base soci attiva." },
  { value: "expired_members", label: "Soci scaduti", description: "Raggiunge chi deve riattivarsi o completare il rinnovo." },
  { value: "renewal_due_members", label: "Rinnovo in scadenza", description: "Filtra solo i soci con rinnovo vicino alla scadenza." },
];

const communicationTypes: Array<{
  value: Exclude<LaunchIntent, null>;
  title: string;
  description: string;
  icon: string;
  preset: Partial<CampaignComposerState>;
}> = [
  {
    value: "form_invite",
    title: "Invito a compilare un modulo",
    description: "Email con CTA chiara verso un modulo pubblico.",
    icon: "▣",
    preset: {
      communication_type: "form_invite",
      recipient_mode: "all_members",
      audience_type: "active_members",
      design: { ...defaultDesign, layout_key: "invitation", cta_kind: "form", cta_label: "Apri il modulo", cta_note: "Ti bastano pochi minuti per completarlo." },
    },
  },
  {
    value: "general",
    title: "Comunicazione generale",
    description: "Messaggio editoriale semplice, senza builder tecnico.",
    icon: "✦",
    preset: { communication_type: "general", recipient_mode: "all_members", audience_type: "active_members", design: { ...defaultDesign, layout_key: "institutional" } },
  },
  {
    value: "renewal",
    title: "Reminder rinnovo",
    description: "Promemoria con CTA orientata al rinnovo.",
    icon: "↻",
    preset: {
      communication_type: "renewal",
      recipient_mode: "all_members",
      audience_type: "renewal_due_members",
      design: { ...defaultDesign, layout_key: "renewal", cta_kind: "renewal", cta_label: "Rinnova ora", cta_note: "Usa il pulsante per completare il rinnovo online." },
    },
  },
  {
    value: "custom",
    title: "Messaggio personalizzato",
    description: "Base flessibile per comunicazioni particolari o one-shot.",
    icon: "◌",
    preset: { communication_type: "custom", recipient_mode: "selected_members", audience_type: "active_members", design: { ...defaultDesign, layout_key: "essential" } },
  },
  {
    value: "survey",
    title: "Sondaggio / feedback",
    description: "Invito leggero a raccogliere risposte o opinioni.",
    icon: "☰",
    preset: {
      communication_type: "survey",
      recipient_mode: "all_members",
      audience_type: "active_members",
      design: { ...defaultDesign, layout_key: "invitation", cta_kind: "form", cta_label: "Lascia il tuo feedback", cta_note: "Il modulo si apre in una pagina esterna nel browser." },
    },
  },
];

const layoutPresets: Array<{ key: OrgAdminEmailLayoutKey; title: string; description: string; accent: string; button: string; preview: string }> = [
  { key: "essential", title: "Essenziale", description: "Pulito, leggero, orientato alla leggibilità.", accent: "#0f766e", button: "#0f766e", preview: "bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)]" },
  { key: "institutional", title: "Istituzionale", description: "Più sobrio e coerente per comunicazioni ufficiali.", accent: "#334155", button: "#334155", preview: "bg-[linear-gradient(180deg,#eef2ff_0%,#ffffff_100%)]" },
  { key: "invitation", title: "Invito con bottone", description: "Più caldo e focalizzato sulla CTA principale.", accent: "#c2410c", button: "#c2410c", preview: "bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_100%)]" },
  { key: "renewal", title: "Reminder rinnovo", description: "Forte priorità sul richiamo all'azione.", accent: "#1d4ed8", button: "#1d4ed8", preview: "bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_100%)]" },
];

const templateStarterOptions: Array<{ name: string; category: string; description: string; typeLabel: string; preset: Partial<TemplateEditorState> }> = [
  { name: "Invito a modulo", category: "forms", description: "Perfetto per portare il socio su un modulo pubblico tramite pulsante.", typeLabel: "Invito modulo", preset: { subject: "Ti chiediamo un minuto per completare {{titolo_form}}", body: "Ciao {{nome_socio}},\n\nabbiamo preparato un modulo dedicato a {{titolo_form}}.\nUsa il pulsante qui sotto per aprirlo nel browser e completarlo in pochi minuti.", design: { ...defaultDesign, layout_key: "invitation", cta_kind: "form", cta_label: "Apri il modulo", cta_note: "Il modulo si apre fuori dall'email, in una pagina pubblica dedicata." } } },
  { name: "Reminder rinnovo", category: "renewal", description: "Microcopy già orientata al rinnovo con CTA esplicita.", typeLabel: "Reminder", preset: { subject: "Rinnovo in scadenza per {{nome_socio}}", body: "Ciao {{nome_socio}},\n\nla tua quota associativa per {{nome_associazione}} scade il {{data_scadenza}}.\nPer continuare a usare i servizi associativi puoi completare il rinnovo online.", design: { ...defaultDesign, layout_key: "renewal", cta_kind: "renewal", cta_label: "Rinnova ora", cta_note: "Il link ti porta direttamente alla pagina di rinnovo." } } },
  { name: "Comunicazione standard", category: "announcements", description: "Template semplice per aggiornamenti e comunicazioni generali.", typeLabel: "Standard", preset: { subject: "Aggiornamento da {{nome_associazione}}", body: "Ciao {{nome_socio}},\n\ncon questa email vogliamo condividere un aggiornamento importante relativo a {{nome_associazione}}.\nDi seguito trovi tutti i dettagli principali.", design: { ...defaultDesign, layout_key: "institutional" } } },
  { name: "Convocazione evento", category: "events", description: "Per eventi, assemblee o appuntamenti associativi.", typeLabel: "Evento", preset: { subject: "Convocazione evento {{nome_associazione}}", body: "Ciao {{nome_socio}},\n\nsei invitato a un appuntamento importante di {{nome_associazione}}.\nNella mail puoi inserire dettagli, data, luogo e informazioni operative.", design: { ...defaultDesign, layout_key: "institutional" } } },
  { name: "Sondaggio", category: "feedback", description: "Template per chiedere opinioni, feedback o valutazioni.", typeLabel: "Feedback", preset: { subject: "Ci aiuti con un feedback?", body: "Ciao {{nome_socio}},\n\nci farebbe piacere ricevere il tuo parere.\nApri il modulo e compila il breve sondaggio.", design: { ...defaultDesign, layout_key: "invitation", cta_kind: "form", cta_label: "Compila il sondaggio", cta_note: "Il sondaggio si apre in una pagina esterna nel browser." } } },
];

function normalizeDesign(value?: Partial<OrgAdminEmailDesign> | null): OrgAdminEmailDesign {
  return {
    ...defaultDesign,
    ...(value || {}),
    accent_color: value?.accent_color || defaultDesign.accent_color,
    button_color: value?.button_color || value?.accent_color || defaultDesign.button_color,
    hide_logo: Boolean(value?.hide_logo),
    logo_url: value?.logo_url || "",
    hero_image_url: value?.hero_image_url || "",
    email_title: value?.email_title || "",
    cta_label: value?.cta_label || "",
    cta_note: value?.cta_note || "",
    cta_kind: value?.cta_kind || "none",
    cta_url: value?.cta_url || "",
    layout_key: value?.layout_key || "essential",
    show_association_name: value?.show_association_name ?? true,
  };
}

function createEmptyCampaignForm(): CampaignComposerState {
  return { name: "", subject: "", audience_type: "active_members", recipient_mode: "all_members", scheduled_at: "", linked_form_id: null, design: normalizeDesign(defaultDesign), communication_type: "general", save_as_template: false, logo_mode: "association", header_mode: "none", selected_template_id: null, body: "" };
}

function createEmptyTemplateForm(): TemplateEditorState {
  return { id: null, name: "", category: "custom", subject: "", body: "", linked_form_id: null, is_active: true, is_system: false, design: normalizeDesign(defaultDesign), logo_mode: "association", header_mode: "none" };
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

function htmlToPlainText(value: string | null | undefined): string {
  if (!value) return "";
  if (typeof window === "undefined") return value.replace(/<[^>]+>/g, "");
  const doc = new DOMParser().parseFromString(value, "text/html");
  return (doc.body.textContent || "").trim();
}

function statusLabel(value: string | null | undefined): string {
  return ({ draft: "Bozza", scheduled: "Programmata", sending: "In invio", sent: "Inviata", failed: "Fallita", partial_failed: "Parziale" } as Record<string, string>)[String(value || "").toLowerCase()] || String(value || "-");
}

function deliveryBucket(status: string | null | undefined): DeliveryFilter {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "scheduled") return "scheduled";
  if (normalized === "draft") return "draft";
  if (normalized === "failed") return "failed";
  return "sent";
}

function getAudienceLabel(value: OrgAdminCampaignAudienceType): string {
  return audienceOptions.find((item) => item.value === value)?.label || "Tutti i soci attivi";
}

function getCtaLabel(value: OrgAdminEmailCtaKind): string {
  return ({ none: "Nessuna azione", form: "Apri un modulo pubblico", document: "Apri una pagina/documento", renewal: "Apri link rinnovo", custom: "Apri link personalizzato" } as Record<OrgAdminEmailCtaKind, string>)[value];
}

function resolveLogoMode(design: OrgAdminEmailDesign): LogoMode {
  if (design.hide_logo) return "none";
  if (design.logo_url) return "upload";
  return "association";
}

function resolveHeaderMode(design: OrgAdminEmailDesign, linkedForm?: AssociationForm | null): HeaderMode {
  if (!design.hero_image_url) return "none";
  if (linkedForm?.cover_image_url && design.hero_image_url === linkedForm.cover_image_url) return "form";
  return "upload";
}

function CommunicationTypeCard(props: { title: string; description: string; icon: string; active: boolean; onClick: () => void }) {
  const { title, description, icon, active, onClick } = props;
  return (
    <button type="button" onClick={onClick} className={`${baseButtonClass} ${active ? "border-brand bg-brand text-white shadow-sm" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"}`}>
      <div className="flex items-start gap-4">
        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl text-lg ${active ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-700"}`}>{icon}</span>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className={`mt-1 text-xs leading-5 ${active ? "text-white/80" : "text-neutral-500"}`}>{description}</p>
        </div>
      </div>
    </button>
  );
}

function AudienceSelector(props: {
  value: OrgAdminCampaignRecipientMode;
  audienceType: OrgAdminCampaignAudienceType;
  onModeChange: (next: OrgAdminCampaignRecipientMode) => void;
  onAudienceTypeChange: (next: OrgAdminCampaignAudienceType) => void;
  memberSearch: string;
  onMemberSearchChange: (next: string) => void;
  memberResults: OrgAdminMember[];
  selectedMembers: OrgAdminMember[];
  onAddMember: (member: OrgAdminMember) => void;
  onRemoveMember: (memberId: number) => void;
  estimate: number | null;
}) {
  const { value, audienceType, onModeChange, onAudienceTypeChange, memberSearch, onMemberSearchChange, memberResults, selectedMembers, onAddMember, onRemoveMember, estimate } = props;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {([
          { key: "all_members", title: "Tutti i soci attivi", description: "Usa il segmento definito sotto per filtrare automaticamente." },
          { key: "segment", title: "Segmento specifico", description: "Scegli un gruppo leggibile: attivi, scaduti o rinnovo in scadenza." },
          { key: "selected_members", title: "Soci selezionati manualmente", description: "Ricerca uno o più soci e costruisci una lista manuale." },
        ] as Array<{ key: string; title: string; description: string }>).map((option) => {
          const active = option.key === "selected_members" ? value === "selected_members" : value === "all_members";
          return (
            <button key={option.key} type="button" className={`${baseButtonClass} ${active ? "border-brand bg-brand/5 text-brand" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"}`} onClick={() => onModeChange(option.key === "selected_members" ? "selected_members" : "all_members")}>
              <p className="text-sm font-semibold">{option.title}</p>
              <p className="mt-1 text-xs leading-5 text-neutral-500">{option.description}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-[1.4rem] border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-neutral-900">Destinatari stimati</p>
            <p className="mt-1 text-sm text-neutral-500">Ti mostriamo il volume previsto prima dell'invio.</p>
          </div>
          <p className="text-3xl font-bold text-neutral-900">{estimate ?? "-"}</p>
        </div>
      </div>

      {value === "all_members" ? (
        <label className={labelClass}>
          Segmento specifico
          <select className={inputClass} value={audienceType} onChange={(event) => onAudienceTypeChange(event.target.value as OrgAdminCampaignAudienceType)}>
            {audienceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <span className="mt-2 block text-xs text-neutral-500">{audienceOptions.find((option) => option.value === audienceType)?.description}</span>
        </label>
      ) : (
        <div className="space-y-4 rounded-[1.4rem] border border-neutral-200 bg-white p-4">
          <label className={labelClass}>
            Cerca soci
            <input className={inputClass} value={memberSearch} onChange={(event) => onMemberSearchChange(event.target.value)} placeholder="Nome, cognome, email o numero tessera" />
          </label>
          <div className="rounded-[1.2rem] border border-neutral-200">
            {memberSearch.trim() && memberResults.length === 0 ? <div className="p-4 text-sm text-neutral-500">Nessun socio trovato.</div> : memberResults.map((member) => (
              <button key={member.id} type="button" className="flex w-full items-start justify-between gap-4 border-b border-neutral-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-neutral-50" onClick={() => onAddMember(member)}>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{member.name}</p>
                  <p className="mt-1 text-xs text-neutral-500">{[member.email || "Email non disponibile", member.card_number ? `Tessera ${member.card_number}` : null].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="text-xs font-semibold text-brand">Aggiungi</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedMembers.map((member) => (
              <span key={member.id} className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-700">
                <span>{member.name}</span>
                <button type="button" className="text-neutral-400 hover:text-neutral-700" onClick={() => onRemoveMember(member.id)}>×</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VariableInsertPanel(props: { variables: OrgAdminEmailTemplateVariable[]; activeFieldLabel: string; onInsert: (placeholder: string) => void }) {
  const { variables, activeFieldLabel, onInsert } = props;
  return (
    <div className={panelClass}>
      <div>
        <p className="text-sm font-semibold text-neutral-900">Variabili automatiche</p>
        <p className="mt-1 text-sm text-neutral-500">Clicca una variabile per inserirla nel campo attivo. Campo attuale: <span className="font-medium text-neutral-700">{activeFieldLabel}</span>.</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {variables.map((variable) => (
          <button key={variable.key} type="button" className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-brand hover:bg-brand/5 hover:text-brand" onClick={() => onInsert(variable.placeholder)} title={variable.description}>
            {variable.placeholder}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmailLayoutPicker(props: { value: OrgAdminEmailLayoutKey; onChange: (next: OrgAdminEmailLayoutKey) => void }) {
  const { value, onChange } = props;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {layoutPresets.map((preset) => (
        <button key={preset.key} type="button" className={`${baseButtonClass} ${value === preset.key ? "border-brand bg-brand/5 text-brand" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"}`} onClick={() => onChange(preset.key)}>
          <div className={`rounded-[1rem] border border-neutral-200 p-3 ${preset.preview}`}>
            <div className="space-y-2 rounded-[0.9rem] border border-white/80 bg-white/90 p-3 shadow-sm">
              <div className="h-3 w-16 rounded-full bg-neutral-200" />
              <div className="h-5 w-32 rounded-full" style={{ backgroundColor: preset.accent, opacity: 0.18 }} />
              <div className="h-2 w-full rounded-full bg-neutral-200" />
              <div className="h-2 w-5/6 rounded-full bg-neutral-200" />
              <div className="h-8 w-28 rounded-full" style={{ backgroundColor: preset.button }} />
            </div>
          </div>
          <p className="mt-3 text-sm font-semibold">{preset.title}</p>
          <p className="mt-1 text-xs leading-5 text-neutral-500">{preset.description}</p>
        </button>
      ))}
    </div>
  );
}

function CTAActionSelector(props: {
  value: OrgAdminEmailCtaKind;
  onChange: (next: OrgAdminEmailCtaKind) => void;
  linkedForm: AssociationForm | null;
  forms: AssociationForm[];
  ctaLabel: string;
  ctaNote: string;
  ctaUrl: string;
  onLinkedFormChange: (next: number | null) => void;
  onLabelChange: (next: string) => void;
  onNoteChange: (next: string) => void;
  onUrlChange: (next: string) => void;
  registerField: (key: string) => (node: HTMLInputElement | HTMLTextAreaElement | null) => void;
  onFocusField: (label: string) => void;
}) {
  const { value, onChange, linkedForm, forms, ctaLabel, ctaNote, ctaUrl, onLinkedFormChange, onLabelChange, onNoteChange, onUrlChange, registerField, onFocusField } = props;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(["none", "form", "document", "renewal", "custom"] as OrgAdminEmailCtaKind[]).map((option) => (
          <button key={option} type="button" className={`${baseButtonClass} ${value === option ? "border-brand bg-brand/5 text-brand" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"}`} onClick={() => onChange(option)}>
            <p className="text-sm font-semibold">{getCtaLabel(option)}</p>
          </button>
        ))}
      </div>

      {value === "form" && (
        <div className="space-y-4 rounded-[1.5rem] border border-brand/15 bg-brand/[0.04] p-5">
          <label className={labelClass}>
            Modulo collegato
            <select className={inputClass} value={linkedForm?.id ?? ""} onChange={(event) => onLinkedFormChange(event.target.value ? Number(event.target.value) : null)}>
              <option value="">Seleziona modulo pubblicato</option>
              {forms.map((form) => <option key={form.id} value={form.id}>{form.title}</option>)}
            </select>
          </label>
          <div className="rounded-[1.2rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            Il modulo non viene mostrato dentro l’email. Nella mail comparirà un pulsante che apre la pagina pubblica del modulo nel browser.
          </div>
          <div className="rounded-[1.2rem] border border-neutral-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Diagramma rapido</p>
            <div className="mt-3 flex items-center gap-3 text-sm font-semibold text-neutral-700">
              <span className="rounded-full bg-neutral-100 px-3 py-2">Email</span>
              <span>→</span>
              <span className="rounded-full bg-neutral-100 px-3 py-2">Pulsante</span>
              <span>→</span>
              <span className="rounded-full bg-neutral-100 px-3 py-2">Modulo pubblico</span>
            </div>
          </div>
        </div>
      )}

      {(value === "document" || value === "custom") && (
        <label className={labelClass}>
          {value === "document" ? "Pagina o documento da aprire" : "Link personalizzato"}
          <input ref={registerField("cta_url")} className={inputClass} value={ctaUrl} onFocus={() => onFocusField("Link CTA")} onChange={(event) => onUrlChange(event.target.value)} placeholder={value === "document" ? "{{link_documento}}" : "https://..."} />
        </label>
      )}

      {value === "renewal" && (
        <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Il pulsante userà il link rinnovo personalizzato disponibile per ogni socio.
        </div>
      )}

      {value !== "none" && (
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            Testo del pulsante
            <input ref={registerField("cta_label")} className={inputClass} value={ctaLabel} onFocus={() => onFocusField("Testo del pulsante")} onChange={(event) => onLabelChange(event.target.value)} placeholder="È l’azione principale che il destinatario vedrà nell’email." />
            <span className="mt-2 block text-xs text-neutral-500">È l’azione principale che il destinatario vedrà nell’email.</span>
          </label>
          <label className={labelClass}>
            Testo sotto il pulsante
            <textarea ref={registerField("cta_note")} className={`${inputClass} min-h-[110px]`} value={ctaNote} onFocus={() => onFocusField("Testo sotto il pulsante")} onChange={(event) => onNoteChange(event.target.value)} placeholder="Messaggio di rassicurazione o contesto aggiuntivo." />
          </label>
        </div>
      )}

      {value !== "none" && (
        <div className="rounded-[1.4rem] border border-neutral-200 bg-white p-5">
          <p className="text-sm font-semibold text-neutral-900">Mini anteprima CTA</p>
          <div className="mt-4 rounded-[1.25rem] border border-neutral-200 bg-neutral-50 p-5">
            <button type="button" className="rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white">{ctaLabel || "Testo del pulsante"}</button>
            {ctaNote ? <p className="mt-3 text-sm text-neutral-500">{ctaNote}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function EmailAppearancePanel(props: { draft: CampaignComposerState | TemplateEditorState; linkedForm: AssociationForm | null; onDesignChange: (next: OrgAdminEmailDesign) => void; onLogoModeChange: (next: LogoMode) => void; onHeaderModeChange: (next: HeaderMode) => void }) {
  const { draft, linkedForm, onDesignChange, onLogoModeChange, onHeaderModeChange } = props;
  function patchDesign(next: Partial<OrgAdminEmailDesign>) {
    onDesignChange(normalizeDesign({ ...draft.design, ...next }));
  }
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-neutral-900">Logo email</p>
            <p className="mt-1 text-xs text-neutral-500">Usato nella parte alta dell’email, sopra il contenuto principale.</p>
          </div>
          <div className="grid gap-2">
            {([{ key: "association", label: "Usa logo associazione" }, { key: "upload", label: "Carica nuovo logo" }, { key: "none", label: "Nessun logo" }] as Array<{ key: LogoMode; label: string }>).map((option) => (
              <button key={option.key} type="button" className={`${baseButtonClass} ${draft.logo_mode === option.key ? "border-brand bg-brand/5 text-brand" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"}`} onClick={() => { onLogoModeChange(option.key); if (option.key === "association") patchDesign({ hide_logo: false, logo_url: "" }); if (option.key === "none") patchDesign({ hide_logo: true, logo_url: "" }); }}>
                <p className="text-sm font-semibold">{option.label}</p>
              </button>
            ))}
          </div>
          {draft.logo_mode === "upload" && <ImageUpload label="Logo email" value={draft.design.logo_url || null} onChange={(base64) => patchDesign({ hide_logo: false, logo_url: base64 })} onRemove={() => patchDesign({ logo_url: "" })} />}
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-neutral-900">Immagine intestazione</p>
            <p className="mt-1 text-xs text-neutral-500">Immagine mostrata nella parte iniziale della mail per rendere la comunicazione più riconoscibile.</p>
          </div>
          <div className="grid gap-2">
            {([{ key: "none", label: "Nessuna" }, { key: "form", label: "Usa immagine del modulo" }, { key: "upload", label: "Carica immagine" }] as Array<{ key: HeaderMode; label: string }>).map((option) => (
              <button key={option.key} type="button" className={`${baseButtonClass} ${draft.header_mode === option.key ? "border-brand bg-brand/5 text-brand" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"}`} onClick={() => { onHeaderModeChange(option.key); if (option.key === "none") patchDesign({ hero_image_url: "" }); if (option.key === "form") patchDesign({ hero_image_url: linkedForm?.cover_image_url || "" }); }}>
                <p className="text-sm font-semibold">{option.label}</p>
              </button>
            ))}
          </div>
          {draft.header_mode === "form" && !linkedForm?.cover_image_url && <div className="rounded-[1rem] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Il modulo selezionato non ha un’immagine intestazione disponibile.</div>}
          {draft.header_mode === "upload" && <ImageUpload label="Immagine intestazione" value={draft.design.hero_image_url || null} onChange={(base64) => patchDesign({ hero_image_url: base64 })} onRemove={() => patchDesign({ hero_image_url: "" })} />}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Colore principale
          <input type="color" className={`${inputClass} h-12 p-2`} value={draft.design.accent_color} onChange={(event) => patchDesign({ accent_color: event.target.value })} />
        </label>
        <label className={labelClass}>
          Colore pulsante
          <input type="color" className={`${inputClass} h-12 p-2`} value={draft.design.button_color} onChange={(event) => patchDesign({ button_color: event.target.value })} />
        </label>
      </div>

      <div className="flex items-center gap-3 rounded-[1.2rem] border border-neutral-200 bg-white px-4 py-3">
        <input id="show-association-name" type="checkbox" className="rounded border-neutral-300 text-brand" checked={draft.design.show_association_name} onChange={(event) => patchDesign({ show_association_name: event.target.checked })} />
        <label htmlFor="show-association-name" className="text-sm font-medium text-neutral-700">Mostra nome associazione</label>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-neutral-900">Layout email</p>
          <p className="mt-1 text-sm text-neutral-500">Scegli una struttura già coerente e consistente.</p>
        </div>
        <EmailLayoutPicker value={draft.design.layout_key} onChange={(layoutKey) => { const preset = layoutPresets.find((item) => item.key === layoutKey); patchDesign({ layout_key: layoutKey, accent_color: preset?.accent || draft.design.accent_color, button_color: preset?.button || draft.design.button_color }); }} />
      </div>

      <details className="rounded-[1.4rem] border border-neutral-200 bg-neutral-50 px-5 py-4">
        <summary className="cursor-pointer text-sm font-semibold text-neutral-900">Opzioni avanzate</summary>
        <div className="mt-4 grid gap-4">
          <label className={labelClass}>
            URL immagine esterna
            <input className={inputClass} value={draft.design.hero_image_url} onChange={(event) => patchDesign({ hero_image_url: event.target.value })} placeholder="https://..." />
          </label>
          <div className="rounded-[1rem] border border-dashed border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-500">
            TODO backend: se servirà supportare asset remoti ottimizzati o HTML custom in modo robusto per tutti i client email, conviene introdurre un upload dedicato e un validatore server-side.
          </div>
        </div>
      </details>
    </div>
  );
}

function EmailPreview(props: { loading: boolean; preview: PreviewState | null; view: PreviewView; onViewChange: (next: PreviewView) => void }) {
  const { loading, preview, view, onViewChange } = props;
  const frameWidth = view === "mobile" ? "max-w-[390px]" : "max-w-full";
  return (
    <div className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-neutral-900">Anteprima reale della mail finale</p>
          <p className="mt-1 text-sm text-neutral-500">Desktop, mobile, testo semplice e dati mock usano il renderer email reale del backend.</p>
        </div>
        <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 p-1">
          {([{ key: "desktop", label: "Desktop" }, { key: "mobile", label: "Mobile" }, { key: "text", label: "Testo semplice" }, { key: "mock", label: "Con dati reali (mock)" }] as Array<{ key: PreviewView; label: string }>).map((option) => (
            <button key={option.key} type="button" className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${view === option.key ? "bg-neutral-900 text-white" : "text-neutral-600"}`} onClick={() => onViewChange(option.key)}>{option.label}</button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-[28rem] w-full rounded-[1.4rem]" />
          </div>
        ) : !preview ? (
          <div className="rounded-[1.4rem] border border-dashed border-neutral-200 bg-neutral-50 px-6 py-10 text-center text-sm text-neutral-500">Completa i campi principali per generare l’anteprima.</div>
        ) : view === "text" ? (
          <div className="rounded-[1.4rem] border border-neutral-200 bg-neutral-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Oggetto</p>
            <p className="mt-2 font-semibold text-neutral-900">{preview.subject}</p>
            <pre className="mt-4 whitespace-pre-wrap text-sm leading-7 text-neutral-700">{preview.body_text || "-"}</pre>
          </div>
        ) : view === "mock" ? (
          <div className="rounded-[1.4rem] border border-neutral-200 bg-neutral-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Dati mock usati nel rendering</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {Object.entries(preview.fake_context).map(([key, value]) => (
                <div key={key} className="rounded-[1rem] border border-neutral-200 bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">{key}</p>
                  <p className="mt-2 text-sm text-neutral-800 break-words">{value || "-"}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={`mx-auto ${frameWidth}`}>
            <div className="overflow-hidden rounded-[1.6rem] border border-neutral-200 bg-neutral-100 shadow-inner">
              <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2 text-xs text-neutral-500">
                <span>{view === "mobile" ? "Preview mobile" : "Preview desktop"}</span>
                <span>{preview.subject}</span>
              </div>
              <iframe title="Email preview" className={`w-full bg-white ${view === "mobile" ? "h-[720px]" : "h-[760px]"}`} srcDoc={preview.body_html || "<div></div>"} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignSummarySidebar(props: { draft: CampaignComposerState; linkedForm: AssociationForm | null; estimate: number | null; selectedMembersCount: number }) {
  const { draft, linkedForm, estimate, selectedMembersCount } = props;
  const sendMode = draft.scheduled_at ? `Programmato: ${formatDateTime(draft.scheduled_at)}` : "Invio ora o bozza";
  const audienceSummary = draft.recipient_mode === "selected_members" ? `${selectedMembersCount} soci selezionati` : getAudienceLabel(draft.audience_type);
  return (
    <div className="rounded-[1.6rem] border border-neutral-200 bg-neutral-50 p-5">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Riepilogo campagna</p>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex items-start justify-between gap-4"><dt className="text-neutral-500">Tipo comunicazione</dt><dd className="font-medium text-neutral-900">{communicationTypes.find((item) => item.value === draft.communication_type)?.title || "-"}</dd></div>
        <div className="flex items-start justify-between gap-4"><dt className="text-neutral-500">Destinatari</dt><dd className="font-medium text-neutral-900 text-right">{audienceSummary}</dd></div>
        <div className="flex items-start justify-between gap-4"><dt className="text-neutral-500">Stimati</dt><dd className="font-medium text-neutral-900">{estimate ?? "-"}</dd></div>
        <div className="flex items-start justify-between gap-4"><dt className="text-neutral-500">Azione pulsante</dt><dd className="font-medium text-neutral-900 text-right">{getCtaLabel(draft.design.cta_kind)}</dd></div>
        <div className="flex items-start justify-between gap-4"><dt className="text-neutral-500">Modulo collegato</dt><dd className="font-medium text-neutral-900 text-right">{linkedForm?.title || "Nessuno"}</dd></div>
        <div className="flex items-start justify-between gap-4"><dt className="text-neutral-500">Invio</dt><dd className="font-medium text-neutral-900 text-right">{sendMode}</dd></div>
      </dl>
    </div>
  );
}

function SendOptionsPanel(props: { scheduledAt: string; saveAsTemplate: boolean; onScheduledAtChange: (next: string) => void; onSaveAsTemplateChange: (next: boolean) => void; onSaveDraft: () => void; onSchedule: () => void; onSendNow: () => void; disabled?: boolean }) {
  const { scheduledAt, saveAsTemplate, onScheduledAtChange, onSaveAsTemplateChange, onSaveDraft, onSchedule, onSendNow, disabled = false } = props;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <button type="button" className="rounded-[1.4rem] border border-neutral-200 bg-white px-5 py-4 text-left hover:bg-neutral-50" onClick={onSendNow} disabled={disabled}><p className="text-sm font-semibold text-neutral-900">Invia subito</p><p className="mt-1 text-xs text-neutral-500">Accoda subito la campagna all’invio.</p></button>
        <button type="button" className="rounded-[1.4rem] border border-neutral-200 bg-white px-5 py-4 text-left hover:bg-neutral-50" onClick={onSchedule} disabled={disabled}><p className="text-sm font-semibold text-neutral-900">Programma invio</p><p className="mt-1 text-xs text-neutral-500">Usa data e ora di invio per schedulare.</p></button>
        <button type="button" className="rounded-[1.4rem] border border-neutral-200 bg-white px-5 py-4 text-left hover:bg-neutral-50" onClick={onSaveDraft} disabled={disabled}><p className="text-sm font-semibold text-neutral-900">Salva bozza</p><p className="mt-1 text-xs text-neutral-500">Mantieni la campagna nell’elenco bozze.</p></button>
      </div>
      <label className={labelClass}>Data e ora di invio<input type="datetime-local" className={inputClass} value={scheduledAt} onChange={(event) => onScheduledAtChange(event.target.value)} /></label>
      <label className="flex items-center gap-3 rounded-[1.2rem] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700"><input type="checkbox" className="rounded border-neutral-300 text-brand" checked={saveAsTemplate} onChange={(event) => onSaveAsTemplateChange(event.target.checked)} /><span>Salva come modello</span></label>
    </div>
  );
}

function TemplateCard(props: { template: OrgAdminEmailTemplate; onUse: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const { template, onUse, onEdit, onDuplicate, onDelete } = props;
  return (
    <div className="rounded-[1.6rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${template.is_system ? "bg-neutral-900 text-white" : "bg-brand/10 text-brand"}`}>{template.is_system ? "Sistema" : "Personalizzato"}</span>
            <span className="text-xs text-neutral-500">{template.category || "custom"}</span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-neutral-900">{template.name}</h3>
          <p className="mt-2 text-sm text-neutral-500">{template.subject}</p>
        </div>
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-700">{template.design.layout_key || "essential"}</span>
      </div>
      <div className={`mt-4 rounded-[1.2rem] border border-neutral-200 p-4 ${template.design.layout_key === "renewal" ? "bg-blue-50" : template.design.layout_key === "invitation" ? "bg-orange-50" : template.design.layout_key === "institutional" ? "bg-slate-50" : "bg-neutral-50"}`}>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500">Mini anteprima</p>
        <p className="mt-3 text-sm font-semibold text-neutral-900">{template.design.email_title || template.subject}</p>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-neutral-600">{template.body_text || htmlToPlainText(template.body_html)}</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn-primary !px-4 !py-2 !text-sm" onClick={onUse}>Usa</button>
        <button type="button" className="btn-secondary !px-4 !py-2 !text-sm" onClick={onDuplicate}>Duplica</button>
        <button type="button" className="btn-secondary !px-4 !py-2 !text-sm" onClick={onEdit}>Modifica</button>
        {!template.is_system && <button type="button" className="btn-secondary !px-4 !py-2 !text-sm" onClick={onDelete}>Elimina</button>}
      </div>
      <p className="mt-4 text-xs text-neutral-500">Ultima modifica: {formatDateTime(template.updated_at || template.created_at)}</p>
    </div>
  );
}

function DeliveryStatusCard(props: { campaign: OrgAdminEmailCampaign; active: boolean; onClick: () => void; onDuplicate: () => void; onReuseAsTemplate: () => void; onPreview: () => void }) {
  const { campaign, active, onClick, onDuplicate, onReuseAsTemplate, onPreview } = props;
  return (
    <div className={`rounded-[1.6rem] border p-5 shadow-sm transition ${active ? "border-brand bg-brand/[0.03]" : "border-neutral-200 bg-white"}`}>
      <button type="button" className="w-full text-left" onClick={onClick}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-neutral-900">{campaign.name || campaign.subject}</p>
            <p className="mt-2 text-sm text-neutral-500">{campaign.subject}</p>
          </div>
          <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-700">{statusLabel(campaign.status)}</span>
        </div>
        <div className="mt-4 grid gap-3 text-sm text-neutral-600 md:grid-cols-3">
          <p><span className="font-medium text-neutral-900">Tipo:</span> {campaign.design.layout_key || "Campagna"}</p>
          <p><span className="font-medium text-neutral-900">Destinatari:</span> {campaign.recipient_count || campaign.planned_recipient_count}</p>
          <p><span className="font-medium text-neutral-900">Data invio:</span> {formatDateTime(campaign.sent_at || campaign.scheduled_at || campaign.created_at)}</p>
        </div>
        <div className="mt-2 grid gap-3 text-sm text-neutral-600 md:grid-cols-3">
          <p><span className="font-medium text-neutral-900">Metriche:</span> Inviate {campaign.recipient_status_counts.sent} · Fallite {campaign.recipient_status_counts.failed}</p>
          <p><span className="font-medium text-neutral-900">Modulo collegato:</span> {campaign.linked_form ? "Sì" : "No"}</p>
          <p><span className="font-medium text-neutral-900">CTA:</span> {getCtaLabel(campaign.design.cta_kind)}</p>
        </div>
      </button>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary !px-4 !py-2 !text-sm" onClick={onClick}>Apri</button>
        <button type="button" className="btn-secondary !px-4 !py-2 !text-sm" onClick={onDuplicate}>Duplica</button>
        <button type="button" className="btn-secondary !px-4 !py-2 !text-sm" onClick={onReuseAsTemplate}>Riusa come modello</button>
        <button type="button" className="btn-secondary !px-4 !py-2 !text-sm" onClick={onPreview}>Visualizza anteprima</button>
      </div>
    </div>
  );
}

export function MessagesHub({ section, communicationsLocked, launchIntent, launchFormId, launchTemplateId, onConsumeLaunch }: MessagesHubProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<OrgAdminEmailCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<OrgAdminEmailCampaign | null>(null);
  const [templates, setTemplates] = useState<OrgAdminEmailTemplate[]>([]);
  const [variables, setVariables] = useState<OrgAdminEmailTemplateVariable[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<OrgAdminMember[]>([]);
  const [forms, setForms] = useState<AssociationForm[]>([]);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<OrgAdminMember[]>([]);
  const [composerOpen, setComposerOpen] = useState(section === "campaigns");
  const [activeFieldLabel, setActiveFieldLabel] = useState("Corpo messaggio");
  const [wizardStep, setWizardStep] = useState(0);
  const [campaignDraft, setCampaignDraft] = useState<CampaignComposerState>(createEmptyCampaignForm);
  const [templateEditor, setTemplateEditor] = useState<TemplateEditorState>(createEmptyTemplateForm);
  const [previewView, setPreviewView] = useState<PreviewView>("desktop");
  const [campaignPreview, setCampaignPreview] = useState<PreviewState | null>(null);
  const [campaignPreviewLoading, setCampaignPreviewLoading] = useState(false);
  const [deliveryPreview, setDeliveryPreview] = useState<PreviewState | null>(null);
  const [deliveryPreviewLoading, setDeliveryPreviewLoading] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("sent");

  const activeForms = useMemo(() => forms.filter((form) => form.is_active), [forms]);
  const activeTemplates = useMemo(() => templates.filter((template) => template.is_active), [templates]);
  const selectedLinkedForm = useMemo(() => activeForms.find((form) => form.id === campaignDraft.linked_form_id) ?? null, [activeForms, campaignDraft.linked_form_id]);
  const selectedTemplateLinkedForm = useMemo(() => activeForms.find((form) => form.id === templateEditor.linked_form_id) ?? null, [activeForms, templateEditor.linked_form_id]);
  const filteredCampaigns = useMemo(() => campaigns.filter((campaign) => deliveryBucket(campaign.status) === deliveryFilter), [campaigns, deliveryFilter]);

  function handleLoadError(err: unknown, fallback: string) {
    if (err instanceof AuthError) {
      navigate("/org-admin/login", { replace: true });
      return;
    }
    showToast({ title: "Errore", message: err instanceof Error ? err.message : fallback, tone: "error" });
  }

  async function loadAll() {
    const [campaignData, templateData, variableData, formData] = await Promise.all([
      fetchOrgAdminEmailCampaigns(),
      fetchOrgAdminEmailTemplates({ scope: "all", includeInactive: true }),
      fetchOrgAdminEmailTemplateVariables(),
      fetchOrgAdminForms(),
    ]);
    setCampaigns(campaignData.items);
    setSelectedCampaignId((current) => current ?? campaignData.items[0]?.id ?? null);
    setTemplates(templateData.items);
    setVariables(variableData.items);
    setForms(formData.items);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadAll().catch((err) => handleLoadError(err, "Impossibile caricare l'area comunicazioni.")).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) {
      setSelectedCampaign(null);
      return;
    }
    fetchOrgAdminEmailCampaign(selectedCampaignId).then(({ campaign }) => setSelectedCampaign(campaign)).catch((err) => handleLoadError(err, "Impossibile caricare il dettaglio campagna."));
  }, [selectedCampaignId]);

  useEffect(() => {
    if (campaignDraft.recipient_mode === "selected_members") {
      setEstimate(selectedMembers.length);
      return;
    }
    fetchOrgAdminCommunicationAudienceEstimate(campaignDraft.audience_type).then((data) => setEstimate(data.count)).catch(() => setEstimate(null));
  }, [campaignDraft.audience_type, campaignDraft.recipient_mode, selectedMembers.length]);

  useEffect(() => {
    const query = memberSearch.trim();
    if (campaignDraft.recipient_mode !== "selected_members" || !query) {
      setMemberResults([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      searchOrgAdminCommunicationMembers({ q: query, limit: 12 }).then((data) => setMemberResults(data.items)).catch(() => setMemberResults([]));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [campaignDraft.recipient_mode, memberSearch]);

  useEffect(() => {
    if (section !== "campaigns" || !composerOpen) return;
    if (!campaignDraft.subject.trim() && !campaignDraft.body.trim() && !campaignDraft.design.email_title.trim()) {
      setCampaignPreview(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      setCampaignPreviewLoading(true);
      previewOrgAdminEmailTemplate({
        subject: campaignDraft.subject || "Anteprima campagna",
        body_text: campaignDraft.body || "",
        design: campaignDraft.design,
        linked_form_id: campaignDraft.design.cta_kind === "form" ? campaignDraft.linked_form_id : null,
      }).then((data) => {
        setCampaignPreview({ ...data.preview, fake_context: data.fake_context });
      }).catch(() => setCampaignPreview(null)).finally(() => setCampaignPreviewLoading(false));
    }, 280);
    return () => window.clearTimeout(timeout);
  }, [section, composerOpen, campaignDraft]);

  useEffect(() => {
    if (section !== "deliveries" || !selectedCampaign) return;
    setDeliveryPreviewLoading(true);
    previewOrgAdminEmailTemplate({
      subject: selectedCampaign.subject,
      body_html: selectedCampaign.body_html,
      body_text: selectedCampaign.body_text,
      design: normalizeDesign(selectedCampaign.design),
      linked_form_id: selectedCampaign.design.cta_kind === "form" ? selectedCampaign.linked_form_id : null,
    }).then((data) => {
      setDeliveryPreview({ ...data.preview, fake_context: data.fake_context });
    }).catch(() => setDeliveryPreview(null)).finally(() => setDeliveryPreviewLoading(false));
  }, [section, selectedCampaign]);

  useEffect(() => {
    if (loading || section !== "campaigns") return;
    if (!launchIntent && !launchTemplateId && !launchFormId) return;
    if (launchTemplateId) {
      void fetchOrgAdminEmailTemplate(launchTemplateId).then(({ template }) => {
        const design = normalizeDesign(template.design);
        setCampaignDraft({
          ...createEmptyCampaignForm(),
          selected_template_id: template.id,
          subject: template.subject,
          body: template.body_text || htmlToPlainText(template.body_html),
          linked_form_id: template.linked_form_id,
          design,
          communication_type: design.cta_kind === "renewal" ? "renewal" : design.cta_kind === "form" ? "form_invite" : "general",
          logo_mode: resolveLogoMode(design),
          header_mode: resolveHeaderMode(design, activeForms.find((form) => form.id === template.linked_form_id) || null),
        });
        setComposerOpen(true);
        setWizardStep(2);
      }).finally(() => onConsumeLaunch());
      return;
    }
    const matchedType = communicationTypes.find((item) => item.value === (launchIntent || "general"));
    const next = createEmptyCampaignForm();
    const preset = matchedType?.preset;
    const selectedForm = activeForms.find((form) => form.id === launchFormId) ?? null;
    const nextDesign = normalizeDesign({ ...next.design, ...(preset?.design || {}), hero_image_url: preset?.design?.cta_kind === "form" && selectedForm?.cover_image_url ? selectedForm.cover_image_url : preset?.design?.hero_image_url || "" });
    setCampaignDraft({ ...next, ...preset, linked_form_id: launchFormId ?? preset?.linked_form_id ?? null, design: nextDesign, communication_type: matchedType?.value || "general", header_mode: selectedForm?.cover_image_url && nextDesign.hero_image_url === selectedForm.cover_image_url ? "form" : "none", logo_mode: resolveLogoMode(nextDesign) });
    setSelectedMembers([]);
    setMemberSearch("");
    setComposerOpen(true);
    setWizardStep(0);
    onConsumeLaunch();
  }, [loading, section, launchIntent, launchFormId, launchTemplateId, activeForms]);

  function registerField(key: string) {
    return (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      fieldRefs.current[key] = node;
    };
  }

  function patchCampaignDraft(next: Partial<CampaignComposerState>) {
    setCampaignDraft((current) => ({ ...current, ...next }));
  }

  function patchCampaignDesign(next: OrgAdminEmailDesign) {
    setCampaignDraft((current) => ({ ...current, design: normalizeDesign(next) }));
  }

  function patchTemplateDesign(next: OrgAdminEmailDesign) {
    setTemplateEditor((current) => ({ ...current, design: normalizeDesign(next) }));
  }

  function insertPlaceholder(placeholder: string) {
    const keysByLabel: Record<string, string> = { "Oggetto email": "subject", "Titolo della mail": "email_title", "Corpo messaggio": "body", "Testo del pulsante": "cta_label", "Testo sotto il pulsante": "cta_note", "Link CTA": "cta_url" };
    const currentKey = keysByLabel[activeFieldLabel] || "body";
    const node = fieldRefs.current[currentKey];
    if (!node) return;
    const start = node.selectionStart ?? node.value.length;
    const end = node.selectionEnd ?? node.value.length;
    const nextValue = `${node.value.slice(0, start)}${placeholder}${node.value.slice(end)}`;
    if (currentKey === "subject") patchCampaignDraft({ subject: nextValue });
    if (currentKey === "body") patchCampaignDraft({ body: nextValue });
    if (currentKey === "email_title") patchCampaignDesign({ ...campaignDraft.design, email_title: nextValue });
    if (currentKey === "cta_label") patchCampaignDesign({ ...campaignDraft.design, cta_label: nextValue });
    if (currentKey === "cta_note") patchCampaignDesign({ ...campaignDraft.design, cta_note: nextValue });
    if (currentKey === "cta_url") patchCampaignDesign({ ...campaignDraft.design, cta_url: nextValue });
    window.requestAnimationFrame(() => {
      node.focus();
      node.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  }

  async function refreshCampaigns(nextId?: number | null) {
    const data = await fetchOrgAdminEmailCampaigns();
    setCampaigns(data.items);
    setSelectedCampaignId(nextId ?? data.items[0]?.id ?? null);
  }

  async function refreshTemplates(nextId?: number | null) {
    const data = await fetchOrgAdminEmailTemplates({ scope: "all", includeInactive: true });
    setTemplates(data.items);
    if (!nextId) return;
    const { template } = await fetchOrgAdminEmailTemplate(nextId);
    const design = normalizeDesign(template.design);
    setTemplateEditor({ id: template.id, name: template.name, category: template.category || "custom", subject: template.subject, body: template.body_text || htmlToPlainText(template.body_html), linked_form_id: template.linked_form_id, is_active: template.is_active, is_system: template.is_system, design, logo_mode: resolveLogoMode(design), header_mode: resolveHeaderMode(design, activeForms.find((form) => form.id === template.linked_form_id) || null) });
  }

  async function saveCampaign(action: "draft" | "scheduled" | "send") {
    if (!campaignDraft.subject.trim()) {
      showToast({ title: "Oggetto email mancante", message: "Compila l’oggetto email prima di proseguire.", tone: "error" });
      return;
    }
    if (!campaignDraft.body.trim()) {
      showToast({ title: "Contenuto mancante", message: "Scrivi il corpo del messaggio prima di proseguire.", tone: "error" });
      return;
    }
    if (campaignDraft.recipient_mode === "selected_members" && selectedMembers.length === 0) {
      showToast({ title: "Destinatari mancanti", message: "Seleziona almeno un socio.", tone: "error" });
      return;
    }
    if (campaignDraft.design.cta_kind === "form" && !campaignDraft.linked_form_id) {
      showToast({ title: "Modulo collegato mancante", message: "Seleziona un modulo pubblico prima di continuare.", tone: "error" });
      return;
    }
    if ((campaignDraft.design.cta_kind === "document" || campaignDraft.design.cta_kind === "custom") && !campaignDraft.design.cta_url.trim()) {
      showToast({ title: "Link mancante", message: "Inserisci il link che il pulsante deve aprire.", tone: "error" });
      return;
    }
    if (action === "scheduled" && !campaignDraft.scheduled_at) {
      showToast({ title: "Data e ora di invio mancanti", message: "Scegli una data di programmazione.", tone: "error" });
      return;
    }

    try {
      setSavingCampaign(true);
      let campaign = (await createOrgAdminEmailCampaign({
        name: campaignDraft.name.trim() || null,
        subject: campaignDraft.subject.trim(),
        body_text: campaignDraft.body.trim(),
        audience_type: campaignDraft.audience_type,
        recipient_mode: campaignDraft.recipient_mode,
        member_ids: campaignDraft.recipient_mode === "selected_members" ? selectedMembers.map((member) => member.id) : [],
        scheduled_at: action === "scheduled" ? campaignDraft.scheduled_at : null,
        linked_form_id: campaignDraft.design.cta_kind === "form" ? campaignDraft.linked_form_id : null,
        design: campaignDraft.design,
      })).campaign;
      if (campaignDraft.save_as_template) {
        await createOrgAdminEmailTemplate({
          name: campaignDraft.name.trim() || campaignDraft.subject.trim(),
          category: campaignDraft.communication_type,
          subject: campaignDraft.subject.trim(),
          body_text: campaignDraft.body.trim(),
          linked_form_id: campaignDraft.design.cta_kind === "form" ? campaignDraft.linked_form_id : null,
          design: campaignDraft.design,
        });
        await refreshTemplates();
      }
      if (action === "send") {
        campaign = (await sendOrgAdminEmailCampaign(campaign.id)).campaign;
      }
      setCampaignDraft(createEmptyCampaignForm());
      setSelectedMembers([]);
      setMemberSearch("");
      setWizardStep(0);
      await refreshCampaigns(campaign.id);
      showToast({ title: action === "send" ? "Campagna inviata" : action === "scheduled" ? "Campagna programmata" : "Bozza salvata", message: action === "send" ? "La campagna è stata accodata correttamente." : "Operazione completata.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Errore durante il salvataggio della campagna.");
    } finally {
      setSavingCampaign(false);
    }
  }

  async function saveTemplate() {
    if (!templateEditor.name.trim() || !templateEditor.subject.trim() || !templateEditor.body.trim()) {
      showToast({ title: "Dati incompleti", message: "Nome, oggetto e contenuto sono obbligatori.", tone: "error" });
      return;
    }
    try {
      setSavingTemplate(true);
      const payload = { name: templateEditor.name.trim(), category: templateEditor.category.trim() || null, subject: templateEditor.subject.trim(), body_text: templateEditor.body.trim(), linked_form_id: templateEditor.design.cta_kind === "form" ? templateEditor.linked_form_id : null, design: templateEditor.design, is_active: templateEditor.is_active };
      const result = templateEditor.id ? await updateOrgAdminEmailTemplate(templateEditor.id, payload) : await createOrgAdminEmailTemplate(payload);
      await refreshTemplates(result.template.id);
      showToast({ title: templateEditor.id ? "Modello aggiornato" : "Modello creato", message: "Il modello è pronto per essere riusato nelle campagne.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Errore durante il salvataggio del modello.");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDuplicateTemplate(template: OrgAdminEmailTemplate) {
    try {
      const result = await duplicateOrgAdminEmailTemplate(template.id, `${template.name} (copia)`);
      await refreshTemplates(result.template.id);
      showToast({ title: "Modello duplicato", message: "La copia è pronta per essere personalizzata.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Impossibile duplicare il modello.");
    }
  }

  async function handleArchiveTemplate(template: OrgAdminEmailTemplate) {
    if (template.is_system) return;
    try {
      await archiveOrgAdminEmailTemplate(template.id);
      await refreshTemplates();
      if (templateEditor.id === template.id) setTemplateEditor(createEmptyTemplateForm());
      showToast({ title: "Modello archiviato", message: "Il modello non sarà più mostrato tra quelli attivi.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Impossibile eliminare il modello.");
    }
  }

  async function duplicateCampaign(campaign: OrgAdminEmailCampaign) {
    try {
      const created = await createOrgAdminEmailCampaign({ name: `${campaign.name || campaign.subject} (copia)`, subject: campaign.subject, body_text: campaign.body_text || htmlToPlainText(campaign.body_html), audience_type: campaign.audience_type, recipient_mode: campaign.recipient_mode, member_ids: campaign.selected_member_ids || [], linked_form_id: campaign.design.cta_kind === "form" ? campaign.linked_form_id : null, design: campaign.design });
      await refreshCampaigns(created.campaign.id);
      showToast({ title: "Campagna duplicata", message: "È stata creata una nuova bozza duplicata.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Impossibile duplicare la campagna.");
    }
  }

  async function reuseCampaignAsTemplate(campaign: OrgAdminEmailCampaign) {
    try {
      await createOrgAdminEmailTemplate({ name: campaign.name || campaign.subject, category: campaign.design.cta_kind === "renewal" ? "renewal" : "campaign", subject: campaign.subject, body_text: campaign.body_text || htmlToPlainText(campaign.body_html), linked_form_id: campaign.design.cta_kind === "form" ? campaign.linked_form_id : null, design: campaign.design });
      await refreshTemplates();
      showToast({ title: "Modello creato", message: "La campagna è stata salvata come modello.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Impossibile creare il modello dalla campagna.");
    }
  }

  function addSelectedMember(member: OrgAdminMember) {
    setSelectedMembers((current) => (current.some((item) => item.id === member.id) ? current : [...current, member]));
  }

  function removeSelectedMember(memberId: number) {
    setSelectedMembers((current) => current.filter((member) => member.id !== memberId));
  }

  if (loading) {
    return <Skeleton className="h-[34rem] w-full rounded-[2rem]" />;
  }

  if (section === "templates") {
    return (
      <div className="space-y-6">
        <section className="grid gap-4 rounded-[2rem] border border-neutral-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_50%,#f2f7ff_100%)] p-6 shadow-sm lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand">Modelli</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-neutral-900">Distingui chiaramente modelli di sistema e modelli personalizzati</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-600">Usa preset riusabili per inviti, reminder, comunicazioni standard, eventi e sondaggi, senza mischiarli con le campagne inviate.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {templateStarterOptions.map((starter) => (
              <button key={starter.name} type="button" className={`${baseButtonClass} border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50`} onClick={() => setTemplateEditor({ ...createEmptyTemplateForm(), name: starter.name, category: starter.category, subject: starter.preset.subject || "", body: starter.preset.body || "", design: normalizeDesign(starter.preset.design), logo_mode: resolveLogoMode(normalizeDesign(starter.preset.design)) })}>
                <p className="text-sm font-semibold">{starter.name}</p>
                <p className="mt-1 text-xs text-neutral-500">{starter.description}</p>
              </button>
            ))}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div><h3 className="text-lg font-semibold text-neutral-900">Libreria modelli</h3><p className="mt-1 text-sm text-neutral-500">Nome, tipo, ultima modifica, mini anteprima e azioni principali.</p></div>
              <button type="button" className="btn-secondary" onClick={() => setTemplateEditor(createEmptyTemplateForm())}>Nuovo modello</button>
            </div>
            <div className="grid gap-4">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onUse={() => {
                    const design = normalizeDesign(template.design);
                    setCampaignDraft({ ...createEmptyCampaignForm(), selected_template_id: template.id, subject: template.subject, body: template.body_text || htmlToPlainText(template.body_html), linked_form_id: template.linked_form_id, design, communication_type: design.cta_kind === "renewal" ? "renewal" : design.cta_kind === "form" ? "form_invite" : "general", logo_mode: resolveLogoMode(design), header_mode: resolveHeaderMode(design, activeForms.find((form) => form.id === template.linked_form_id) || null) });
                    showToast({ title: "Modello applicato", message: "Il modello è stato caricato nel composer campagne.", tone: "success" });
                  }}
                  onEdit={() => void fetchOrgAdminEmailTemplate(template.id).then(({ template: fullTemplate }) => refreshTemplates(fullTemplate.id)).catch((err) => handleLoadError(err, "Impossibile aprire il modello."))}
                  onDuplicate={() => void handleDuplicateTemplate(template)}
                  onDelete={() => void handleArchiveTemplate(template)}
                />
              ))}
            </div>
          </section>
          <section className="space-y-5">
            <div className={panelClass}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Editor modello</p>
                  <h3 className="mt-2 text-xl font-semibold text-neutral-900">{templateEditor.id ? templateEditor.name || "Modello" : "Nuovo modello"}</h3>
                  <p className="mt-2 text-sm text-neutral-500">Costruisci un modello riusabile separato dalle campagne inviate.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className={labelClass}>Nome modello<input className={inputClass} disabled={templateEditor.is_system} value={templateEditor.name} onChange={(event) => setTemplateEditor((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className={labelClass}>Tipo<input className={inputClass} disabled={templateEditor.is_system} value={templateEditor.category} onChange={(event) => setTemplateEditor((current) => ({ ...current, category: event.target.value }))} /></label>
              </div>
              <div className="mt-4 grid gap-4">
                <label className={labelClass}>Oggetto email<input className={inputClass} disabled={templateEditor.is_system} value={templateEditor.subject} onChange={(event) => setTemplateEditor((current) => ({ ...current, subject: event.target.value }))} /></label>
                <label className={labelClass}>Titolo della mail<input className={inputClass} disabled={templateEditor.is_system} value={templateEditor.design.email_title} onChange={(event) => patchTemplateDesign({ ...templateEditor.design, email_title: event.target.value })} /></label>
                <label className={labelClass}>Corpo messaggio<textarea className={`${inputClass} min-h-[220px]`} disabled={templateEditor.is_system} value={templateEditor.body} onChange={(event) => setTemplateEditor((current) => ({ ...current, body: event.target.value }))} /></label>
                <label className={labelClass}>Modulo collegato<select className={inputClass} disabled={templateEditor.is_system} value={templateEditor.linked_form_id ?? ""} onChange={(event) => setTemplateEditor((current) => ({ ...current, linked_form_id: event.target.value ? Number(event.target.value) : null }))}><option value="">Nessun modulo collegato</option>{activeForms.map((form) => <option key={form.id} value={form.id}>{form.title}</option>)}</select></label>
              </div>
            </div>

            <div className={panelClass}>
              <CTAActionSelector value={templateEditor.design.cta_kind} onChange={(next) => patchTemplateDesign({ ...templateEditor.design, cta_kind: next })} linkedForm={selectedTemplateLinkedForm} forms={activeForms} ctaLabel={templateEditor.design.cta_label} ctaNote={templateEditor.design.cta_note} ctaUrl={templateEditor.design.cta_url} onLinkedFormChange={(next) => setTemplateEditor((current) => ({ ...current, linked_form_id: next }))} onLabelChange={(next) => patchTemplateDesign({ ...templateEditor.design, cta_label: next })} onNoteChange={(next) => patchTemplateDesign({ ...templateEditor.design, cta_note: next })} onUrlChange={(next) => patchTemplateDesign({ ...templateEditor.design, cta_url: next })} registerField={registerField} onFocusField={setActiveFieldLabel} />
            </div>

            <div className={panelClass}>
              <EmailAppearancePanel draft={templateEditor} linkedForm={selectedTemplateLinkedForm} onDesignChange={patchTemplateDesign} onLogoModeChange={(next) => setTemplateEditor((current) => ({ ...current, logo_mode: next }))} onHeaderModeChange={(next) => setTemplateEditor((current) => ({ ...current, header_mode: next }))} />
            </div>

            <div className={panelClass}>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn-primary" disabled={templateEditor.is_system || savingTemplate} onClick={() => void saveTemplate()}>{savingTemplate ? "Salvataggio..." : templateEditor.id ? "Salva modello" : "Crea modello"}</button>
                {templateEditor.id != null && <button type="button" className="btn-secondary" onClick={() => void handleDuplicateTemplate(templates.find((item) => item.id === templateEditor.id)!)}>Duplica</button>}
                {templateEditor.id != null && !templateEditor.is_system && <button type="button" className="btn-secondary" onClick={() => void handleArchiveTemplate(templates.find((item) => item.id === templateEditor.id)!)}>Elimina</button>}
              </div>
              {templateEditor.is_system ? <p className="mt-3 text-sm text-neutral-500">Questo è un modello di sistema: duplicalo prima di modificarlo.</p> : null}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (section === "deliveries") {
    return (
      <div className="space-y-6">
        <section className="grid gap-4 rounded-[2rem] border border-neutral-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_45%,#eef6ff_100%)] p-6 shadow-sm lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand">Invii e statistiche</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-neutral-900">Separa la gestione contenuti dal controllo di stato delle campagne</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-600">Qui trovi inviate, programmate, bozze e fallite nello stesso elenco, con azioni rapide per duplicare, riusare come modello e verificare l’anteprima finale.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {([{ key: "sent", label: "Inviate", value: campaigns.filter((item) => deliveryBucket(item.status) === "sent").length }, { key: "scheduled", label: "Programmate", value: campaigns.filter((item) => deliveryBucket(item.status) === "scheduled").length }, { key: "draft", label: "Bozze", value: campaigns.filter((item) => deliveryBucket(item.status) === "draft").length }, { key: "failed", label: "Fallite", value: campaigns.filter((item) => deliveryBucket(item.status) === "failed").length }] as Array<{ key: DeliveryFilter; label: string; value: number }>).map((item) => (
              <button key={item.key} type="button" className={`${baseButtonClass} ${deliveryFilter === item.key ? "border-brand bg-brand/5 text-brand" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"}`} onClick={() => setDeliveryFilter(item.key)}><p className="text-sm font-semibold">{item.label}</p><p className="mt-2 text-3xl font-bold text-neutral-900">{item.value}</p></button>
            ))}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <section className="space-y-4">
            {filteredCampaigns.length === 0 ? <div className="rounded-[1.6rem] border border-dashed border-neutral-200 bg-neutral-50 px-6 py-10 text-center text-sm text-neutral-500">Nessuna campagna in questo stato.</div> : filteredCampaigns.map((campaign) => <DeliveryStatusCard key={campaign.id} campaign={campaign} active={selectedCampaignId === campaign.id} onClick={() => setSelectedCampaignId(campaign.id)} onDuplicate={() => void duplicateCampaign(campaign)} onReuseAsTemplate={() => void reuseCampaignAsTemplate(campaign)} onPreview={() => setSelectedCampaignId(campaign.id)} />)}
          </section>

          <section className="space-y-5">
            <div className={panelClass}>
              {selectedCampaign ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Dettaglio campagna</p><h3 className="mt-2 text-xl font-semibold text-neutral-900">{selectedCampaign.name || selectedCampaign.subject}</h3><p className="mt-2 text-sm text-neutral-500">{selectedCampaign.subject}</p></div>
                    <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-700">{statusLabel(selectedCampaign.status)}</span>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="rounded-[1.2rem] border border-neutral-200 bg-neutral-50 p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500">Destinatari</p><p className="mt-2 text-lg font-semibold text-neutral-900">{selectedCampaign.recipient_count || selectedCampaign.planned_recipient_count}</p><p className="mt-1 text-sm text-neutral-500">{selectedCampaign.target_summary}</p></div>
                    <div className="rounded-[1.2rem] border border-neutral-200 bg-neutral-50 p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500">Modulo collegato</p><p className="mt-2 text-lg font-semibold text-neutral-900">{selectedCampaign.linked_form?.title || "No"}</p><p className="mt-1 text-sm text-neutral-500">{selectedCampaign.linked_form ? "La CTA punta a un modulo pubblico." : "Nessun modulo collegato."}</p></div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {["draft", "scheduled"].includes(String(selectedCampaign.status || "").toLowerCase()) && <button type="button" className="btn-primary !text-sm" disabled={communicationsLocked} onClick={() => void sendOrgAdminEmailCampaign(selectedCampaign.id).then(() => refreshCampaigns(selectedCampaign.id)).catch((err) => handleLoadError(err, "Errore durante l'invio campagna."))}>Invia ora</button>}
                    <button type="button" className="btn-secondary !text-sm" onClick={() => { const design = normalizeDesign(selectedCampaign.design); setCampaignDraft({ name: selectedCampaign.name || "", subject: selectedCampaign.subject, audience_type: selectedCampaign.audience_type, recipient_mode: selectedCampaign.recipient_mode, scheduled_at: selectedCampaign.scheduled_at || "", linked_form_id: selectedCampaign.linked_form_id, design, communication_type: design.cta_kind === "renewal" ? "renewal" : design.cta_kind === "form" ? "form_invite" : "general", save_as_template: false, logo_mode: resolveLogoMode(design), header_mode: resolveHeaderMode(design, activeForms.find((form) => form.id === selectedCampaign.linked_form_id) || null), selected_template_id: null, body: selectedCampaign.body_text || htmlToPlainText(selectedCampaign.body_html) }); setComposerOpen(true); setWizardStep(2); }}>Apri come nuova bozza</button>
                    <button type="button" className="btn-secondary !text-sm" onClick={() => void duplicateCampaign(selectedCampaign)}>Duplica</button>
                    <button type="button" className="btn-secondary !text-sm" onClick={() => void reuseCampaignAsTemplate(selectedCampaign)}>Riusa come modello</button>
                  </div>
                </>
              ) : <div className="rounded-[1.6rem] border border-dashed border-neutral-200 bg-neutral-50 px-6 py-10 text-center text-sm text-neutral-500">Seleziona una campagna dall’elenco per vedere dettaglio, metriche e anteprima finale.</div>}
            </div>
            <EmailPreview loading={deliveryPreviewLoading} preview={deliveryPreview} view={previewView} onViewChange={setPreviewView} />
          </section>
        </div>
      </div>
    );
  }

  const currentStep = wizardSteps[wizardStep];
  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-[2rem] border border-neutral-200 bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.12),_transparent_38%),linear-gradient(135deg,#ffffff_0%,#f8fafc_48%,#eef6ff_100%)] p-6 shadow-sm lg:grid-cols-[1.05fr_0.95fr]">
        <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-brand">Campagne</p><h2 className="mt-3 text-2xl font-bold tracking-tight text-neutral-900">Wizard guidato per creare campagne più chiare, visuali e sicure prima dell’invio</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-600">Naming più chiaro, microcopy esplicite sul modulo collegato, preview reale desktop/mobile e controlli guidati al posto dei campi URL grezzi.</p></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.5rem] border border-neutral-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">Campagne</p><p className="mt-2 text-3xl font-bold text-neutral-900">{campaigns.length}</p></div>
          <div className="rounded-[1.5rem] border border-neutral-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">Modelli</p><p className="mt-2 text-3xl font-bold text-neutral-900">{templates.length}</p></div>
          <div className="rounded-[1.5rem] border border-neutral-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">Form attivi</p><p className="mt-2 text-3xl font-bold text-neutral-900">{activeForms.length}</p></div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-lg font-semibold text-neutral-900">Elenco campagne</h3><p className="mt-1 text-sm text-neutral-500">Messaggi rinominati in campagne per distinguere meglio contenuto, invio e storico.</p></div>
            <button type="button" className="btn-primary" onClick={() => { setComposerOpen(true); setCampaignDraft(createEmptyCampaignForm()); setSelectedMembers([]); setWizardStep(0); }}>Nuova campagna</button>
          </div>
          <div className={`${panelClass} p-0`}>
            {campaigns.length === 0 ? <div className="p-10 text-center text-sm text-neutral-500">Nessuna campagna trovata. Crea la prima bozza guidata.</div> : campaigns.map((campaign) => (
              <button key={campaign.id} type="button" className={`flex w-full items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4 text-left transition last:border-b-0 hover:bg-neutral-50 ${selectedCampaignId === campaign.id ? "bg-brand/[0.04]" : ""}`} onClick={() => setSelectedCampaignId(campaign.id)}>
                <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-700">{statusLabel(campaign.status)}</span><span className="text-xs text-neutral-500">{campaign.design.layout_key}</span></div><p className="mt-3 text-sm font-semibold text-neutral-900">{campaign.name || campaign.subject}</p><p className="mt-1 text-xs text-neutral-500">{campaign.target_summary}</p></div>
                <div className="text-right text-xs text-neutral-500"><p>{formatDateTime(campaign.sent_at || campaign.scheduled_at || campaign.created_at)}</p><p className="mt-1">{campaign.recipient_count || campaign.planned_recipient_count} destinatari</p></div>
              </button>
            ))}
          </div>
          {selectedCampaign ? <div className={panelClass}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Dettaglio rapido</p><h3 className="mt-2 text-xl font-semibold text-neutral-900">{selectedCampaign.name || selectedCampaign.subject}</h3><p className="mt-2 text-sm text-neutral-500">Oggetto: {selectedCampaign.subject}</p></div><div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary !text-sm" onClick={() => { const design = normalizeDesign(selectedCampaign.design); setCampaignDraft({ name: selectedCampaign.name || "", subject: selectedCampaign.subject, audience_type: selectedCampaign.audience_type, recipient_mode: selectedCampaign.recipient_mode, scheduled_at: selectedCampaign.scheduled_at || "", linked_form_id: selectedCampaign.linked_form_id, design, communication_type: design.cta_kind === "renewal" ? "renewal" : design.cta_kind === "form" ? "form_invite" : "general", save_as_template: false, logo_mode: resolveLogoMode(design), header_mode: resolveHeaderMode(design, activeForms.find((form) => form.id === selectedCampaign.linked_form_id) || null), selected_template_id: null, body: selectedCampaign.body_text || htmlToPlainText(selectedCampaign.body_html) }); setComposerOpen(true); setWizardStep(2); }}>Duplica in composer</button><button type="button" className="btn-secondary !text-sm" onClick={() => void reuseCampaignAsTemplate(selectedCampaign)}>Riusa come modello</button></div></div><div className="mt-5 grid gap-4 md:grid-cols-3"><div className="rounded-[1.2rem] border border-neutral-200 bg-neutral-50 p-4"><p className="text-xs text-neutral-500">Destinatari</p><p className="mt-2 text-xl font-semibold text-neutral-900">{selectedCampaign.recipient_count || selectedCampaign.planned_recipient_count}</p></div><div className="rounded-[1.2rem] border border-neutral-200 bg-neutral-50 p-4"><p className="text-xs text-neutral-500">Azione pulsante</p><p className="mt-2 text-xl font-semibold text-neutral-900">{getCtaLabel(selectedCampaign.design.cta_kind)}</p></div><div className="rounded-[1.2rem] border border-neutral-200 bg-neutral-50 p-4"><p className="text-xs text-neutral-500">Modulo collegato</p><p className="mt-2 text-xl font-semibold text-neutral-900">{selectedCampaign.linked_form?.title || "No"}</p></div></div></div> : null}
        </section>

        <section className="space-y-5">
          {composerOpen ? <><div className={panelClass}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">{currentStep.eyebrow}</p><h3 className="mt-2 text-xl font-semibold text-neutral-900">{currentStep.title}</h3><p className="mt-2 text-sm text-neutral-500">Composer guidato per ridurre ambiguità prima dell’invio.</p></div><button type="button" className="btn-secondary !text-sm" onClick={() => setComposerOpen(false)}>Chiudi wizard</button></div><div className="mt-5 grid gap-2 md:grid-cols-7">{wizardSteps.map((step, index) => <button key={step.key} type="button" className={`${baseButtonClass} px-3 py-3 ${wizardStep === index ? "border-brand bg-brand text-white" : index < wizardStep ? "border-brand/20 bg-brand/5 text-brand" : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"}`} onClick={() => setWizardStep(index)}><p className="text-[11px] font-bold uppercase tracking-[0.16em]">{index + 1}</p><p className="mt-1 text-xs font-semibold">{step.title}</p></button>)}</div></div>
          <div className={panelClass}>
            {currentStep.key === "type" && <div className="grid gap-3 md:grid-cols-2">{communicationTypes.map((type) => <CommunicationTypeCard key={type.value} title={type.title} description={type.description} icon={type.icon} active={campaignDraft.communication_type === type.value} onClick={() => setCampaignDraft({ ...campaignDraft, ...type.preset, design: normalizeDesign({ ...campaignDraft.design, ...(type.preset.design || {}) }), communication_type: type.value })} />)}</div>}
            {currentStep.key === "audience" && <AudienceSelector value={campaignDraft.recipient_mode} audienceType={campaignDraft.audience_type} onModeChange={(next) => patchCampaignDraft({ recipient_mode: next })} onAudienceTypeChange={(next) => patchCampaignDraft({ audience_type: next })} memberSearch={memberSearch} onMemberSearchChange={setMemberSearch} memberResults={memberResults} selectedMembers={selectedMembers} onAddMember={addSelectedMember} onRemoveMember={removeSelectedMember} estimate={estimate} />}
            {currentStep.key === "content" && <div className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><label className={labelClass}>Nome campagna<input className={inputClass} value={campaignDraft.name} onChange={(event) => patchCampaignDraft({ name: event.target.value })} placeholder="Serve solo a te per ritrovare questa comunicazione nell’elenco." /><span className="mt-2 block text-xs text-neutral-500">Serve solo a te per ritrovare questa comunicazione nell’elenco.</span></label><label className={labelClass}>Carica modello<select className={inputClass} value={campaignDraft.selected_template_id ?? ""} onChange={(event) => { const templateId = Number(event.target.value || 0); patchCampaignDraft({ selected_template_id: templateId || null }); if (templateId > 0) { void fetchOrgAdminEmailTemplate(templateId).then(({ template }) => { const design = normalizeDesign(template.design); setCampaignDraft((current) => ({ ...current, selected_template_id: template.id, subject: template.subject, body: template.body_text || htmlToPlainText(template.body_html), linked_form_id: template.linked_form_id, design, communication_type: design.cta_kind === "renewal" ? "renewal" : design.cta_kind === "form" ? "form_invite" : "general", logo_mode: resolveLogoMode(design), header_mode: resolveHeaderMode(design, activeForms.find((form) => form.id === template.linked_form_id) || null) })); }).catch((err) => handleLoadError(err, "Impossibile caricare il modello.")); } }}><option value="">Nessun modello</option>{activeTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label></div><div className="grid gap-4"><label className={labelClass}>Oggetto email<input ref={registerField("subject")} className={inputClass} value={campaignDraft.subject} onFocus={() => setActiveFieldLabel("Oggetto email")} onChange={(event) => patchCampaignDraft({ subject: event.target.value })} /></label><label className={labelClass}>Titolo della mail<input ref={registerField("email_title")} className={inputClass} value={campaignDraft.design.email_title} onFocus={() => setActiveFieldLabel("Titolo della mail")} onChange={(event) => patchCampaignDesign({ ...campaignDraft.design, email_title: event.target.value })} /></label><label className={labelClass}>Corpo messaggio<textarea ref={registerField("body")} className={`${inputClass} min-h-[220px]`} value={campaignDraft.body} onFocus={() => setActiveFieldLabel("Corpo messaggio")} onChange={(event) => patchCampaignDraft({ body: event.target.value })} /></label></div><VariableInsertPanel variables={variables} activeFieldLabel={activeFieldLabel} onInsert={insertPlaceholder} /></div>}
            {currentStep.key === "cta" && <CTAActionSelector value={campaignDraft.design.cta_kind} onChange={(next) => patchCampaignDesign({ ...campaignDraft.design, cta_kind: next })} linkedForm={selectedLinkedForm} forms={activeForms} ctaLabel={campaignDraft.design.cta_label} ctaNote={campaignDraft.design.cta_note} ctaUrl={campaignDraft.design.cta_url} onLinkedFormChange={(next) => patchCampaignDraft({ linked_form_id: next })} onLabelChange={(next) => patchCampaignDesign({ ...campaignDraft.design, cta_label: next })} onNoteChange={(next) => patchCampaignDesign({ ...campaignDraft.design, cta_note: next })} onUrlChange={(next) => patchCampaignDesign({ ...campaignDraft.design, cta_url: next })} registerField={registerField} onFocusField={setActiveFieldLabel} />}
            {currentStep.key === "appearance" && <EmailAppearancePanel draft={campaignDraft} linkedForm={selectedLinkedForm} onDesignChange={patchCampaignDesign} onLogoModeChange={(next) => patchCampaignDraft({ logo_mode: next })} onHeaderModeChange={(next) => patchCampaignDraft({ header_mode: next })} />}
            {currentStep.key === "preview" && <div className="space-y-5"><EmailPreview loading={campaignPreviewLoading} preview={campaignPreview} view={previewView} onViewChange={setPreviewView} /><div className="flex flex-wrap gap-3"><button type="button" className="btn-secondary" onClick={() => showToast({ title: "Invia anteprima a me", message: "TODO backend: serve un endpoint dedicato per inviare la preview della campagna corrente al mittente autenticato.", tone: "success" })}>Invia anteprima a me</button></div></div>}
            {currentStep.key === "send" && <SendOptionsPanel scheduledAt={campaignDraft.scheduled_at} saveAsTemplate={campaignDraft.save_as_template} onScheduledAtChange={(next) => patchCampaignDraft({ scheduled_at: next })} onSaveAsTemplateChange={(next) => patchCampaignDraft({ save_as_template: next })} onSaveDraft={() => void saveCampaign("draft")} onSchedule={() => void saveCampaign("scheduled")} onSendNow={() => void saveCampaign("send")} disabled={communicationsLocked || savingCampaign} />}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-5"><button type="button" className="btn-secondary" disabled={wizardStep === 0} onClick={() => setWizardStep((current) => Math.max(0, current - 1))}>Step precedente</button><div className="text-sm text-neutral-500">Step {wizardStep + 1} di {wizardSteps.length}</div><button type="button" className="btn-primary" disabled={wizardStep === wizardSteps.length - 1} onClick={() => setWizardStep((current) => Math.min(wizardSteps.length - 1, current + 1))}>Step successivo</button></div>
          </div></> : <div className={`${panelClass} space-y-4`}><p className="text-sm font-semibold text-neutral-900">Composer guidato non aperto</p><p className="text-sm text-neutral-500">Apri una nuova campagna o duplica una campagna esistente per usare il wizard step-by-step.</p><button type="button" className="btn-primary" onClick={() => setComposerOpen(true)}>Apri wizard campagne</button></div>}
          <CampaignSummarySidebar draft={campaignDraft} linkedForm={selectedLinkedForm} estimate={estimate} selectedMembersCount={selectedMembers.length} />
        </section>
      </div>
    </div>
  );
}
