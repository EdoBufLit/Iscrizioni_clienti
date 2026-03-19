import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  fetchOrgAdminEmailTemplateVariables,
  fetchOrgAdminEmailTemplates,
  fetchOrgAdminForms,
  previewOrgAdminEmailTemplate,
  searchOrgAdminCommunicationMembers,
  sendOrgAdminEmailCampaign,
  updateOrgAdminEmailTemplate,
  type AssociationForm,
  type OrgAdminCampaignAudienceType,
  type OrgAdminCampaignRecipientMode,
  type OrgAdminEmailCampaign,
  type OrgAdminEmailDesign,
  type OrgAdminEmailFontPreset,
  type OrgAdminEmailTemplate,
  type OrgAdminEmailTemplateVariable,
  type OrgAdminMember,
} from "../../../../lib/api";
import Skeleton from "../../../../components/ui/Skeleton";
import { useToast } from "../../../../components/ui/ToastProvider";

type MessagesHubProps = { communicationsLocked: boolean };
type Mode = "text" | "html";
type MainTab = "campagne" | "modelli";
type Screen =
  | { type: "library" }
  | { type: "campaign-editor" }
  | { type: "campaign-detail"; campaignId: number }
  | { type: "template-editor"; templateId: number | null };

type CampaignFormState = {
  name: string;
  subject: string;
  body: string;
  audience_type: OrgAdminCampaignAudienceType;
  recipient_mode: OrgAdminCampaignRecipientMode;
  scheduled_at: string;
  linked_form_id: number | null;
  design: OrgAdminEmailDesign;
};

type TemplateFormState = {
  id: number | null;
  name: string;
  category: string;
  subject: string;
  body: string;
  linked_form_id: number | null;
  is_active: boolean;
  is_system: boolean;
  design: OrgAdminEmailDesign;
};

const inputClass =
  "mt-2 w-full rounded-[1.1rem] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/15";
const labelClass = "block text-sm font-semibold text-neutral-800";
const sectionCardClass = "rounded-[1.8rem] border border-neutral-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]";

const stylePresetCards = [
  { key: "istituzionale", label: "Istituzionale", accent: "#0f766e", note: "Pulito, affidabile, molto leggibile." },
  { key: "moderno", label: "Moderno", accent: "#0f766e", note: "Superfici più fresche e CTA nette." },
  { key: "elegante", label: "Elegante", accent: "#8b5e3c", note: "Più caldo e formale per inviti e comunicazioni premium." },
  { key: "evento", label: "Evento", accent: "#ea580c", note: "Più energico per appuntamenti e convocazioni." },
  { key: "reminder", label: "Reminder", accent: "#ca8a04", note: "Pensato per promemoria e richieste di risposta." },
] as const;

const fontPresetOptions = [
  { value: "classic", label: "Classico" },
  { value: "editorial", label: "Editoriale" },
  { value: "modern_sans", label: "Pulito" },
] as const;

const buttonStyleOptions = [
  { value: "pill", label: "Pill" },
  { value: "morbido", label: "Morbido" },
  { value: "solido", label: "Compatto" },
] as const;

const templateBrandingFields: Array<{
  key: "hero_kicker" | "logo_url" | "hero_image_url" | "content_image_url";
  label: string;
}> = [
  { key: "hero_kicker", label: "Hero kicker" },
  { key: "logo_url", label: "Logo URL" },
  { key: "hero_image_url", label: "Hero image" },
  { key: "content_image_url", label: "Content image" },
];

const audienceOptions: Array<{ value: OrgAdminCampaignAudienceType; label: string; description: string }> = [
  { value: "active_members", label: "Tutti i soci attivi", description: "Invia il messaggio all'intera base attiva dell'associazione." },
  { value: "expired_members", label: "Soci scaduti", description: "Raggiunge i soci che devono rinnovare o riattivarsi." },
  { value: "renewal_due_members", label: "Rinnovo in scadenza", description: "Filtra solo chi ha il rinnovo vicino alla scadenza." },
];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Non impostato";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Non impostato"
    : date.toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(value: string | null | undefined): string {
  return ({
    draft: "Bozza",
    scheduled: "Programmato",
    sending: "In invio",
    sent: "Inviata",
    failed: "Fallita",
    partial_failed: "Parziale",
  } as Record<string, string>)[String(value || "").toLowerCase()] || String(value || "-");
}

function createDefaultDesign(): OrgAdminEmailDesign {
  return {
    accent_color: "#0f766e",
    button_color: "#0f766e",
    hide_logo: false,
    logo_url: "",
    hero_image_url: "",
    email_title: "",
    content_image_url: "",
    cta_label: "",
    cta_url: "",
    cta_note: "",
    cta_kind: "custom",
    layout_key: "institutional",
    show_association_name: true,
    style_preset: "istituzionale",
    font_preset: "classic",
    cta_style: "solid",
    secondary_image_url: "",
    highlight_title: "",
    highlight_body: "",
    button_style: "pill",
    hero_kicker: "",
    hero_title: "",
    highlight_box: "",
    event_details: "",
    signature: "",
    signature_name: "",
    signature_role: "",
    final_note: "",
  };
}

function createEmptyCampaignForm(): CampaignFormState {
  return {
    name: "",
    subject: "",
    body: "",
    audience_type: "active_members",
    recipient_mode: "all_members",
    scheduled_at: "",
    linked_form_id: null,
    design: createDefaultDesign(),
  };
}

function createEmptyTemplateForm(): TemplateFormState {
  return {
    id: null,
    name: "",
    category: "custom",
    subject: "",
    body: "",
    linked_form_id: null,
    is_active: true,
    is_system: false,
    design: createDefaultDesign(),
  };
}

function ModeSwitch(props: { value: Mode; onChange: (next: Mode) => void }) {
  return (
    <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 p-1">
      {(["text", "html"] as Mode[]).map((mode) => (
        <button
          key={mode}
          type="button"
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            props.value === mode ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"
          }`}
          onClick={() => props.onChange(mode)}
        >
          {mode === "text" ? "Testo" : "HTML"}
        </button>
      ))}
    </div>
  );
}

function StatChip(props: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-[1.25rem] border border-neutral-200 bg-white px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">{props.label}</p>
      <p className="mt-2 text-xl font-bold text-neutral-900">{props.value}</p>
      {props.hint ? <p className="mt-1 text-xs text-neutral-500">{props.hint}</p> : null}
    </div>
  );
}

function VariableCloud(props: { variables: OrgAdminEmailTemplateVariable[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {props.variables.map((variable) => (
        <button
          key={variable.key}
          type="button"
          className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-700"
          title={variable.description}
        >
          {variable.placeholder}
        </button>
      ))}
    </div>
  );
}

function EditorHeader(props: {
  title: string;
  subtitle: string;
  badge: string;
  onBack: () => void;
  actions: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
      <div className="flex flex-col gap-4 px-4 py-4 md:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={props.onBack}
            className="mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-900"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-neutral-900">{props.title}</h2>
              <span className="rounded-full bg-brand/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-brand">
                {props.badge}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">{props.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">{props.actions}</div>
      </div>
    </div>
  );
}

function applyStylePreset(
  base: OrgAdminEmailDesign,
  preset: (typeof stylePresetCards)[number],
): OrgAdminEmailDesign {
  const next = { ...base };
  next.style_preset = preset.key;
  next.accent_color = preset.accent;
  if (!next.cta_note) next.cta_note = preset.note;
  return next;
}

export function MessagesHub({ communicationsLocked }: MessagesHubProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [mainTab, setMainTab] = useState<MainTab>("campagne");
  const [screen, setScreen] = useState<Screen>({ type: "library" });
  const [campaigns, setCampaigns] = useState<OrgAdminEmailCampaign[]>([]);
  const [templates, setTemplates] = useState<OrgAdminEmailTemplate[]>([]);
  const [variables, setVariables] = useState<OrgAdminEmailTemplateVariable[]>([]);
  const [forms, setForms] = useState<AssociationForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<OrgAdminEmailCampaign | null>(null);
  const [campaignPreview, setCampaignPreview] = useState<{ subject: string; body_html: string | null; body_text: string | null } | null>(null);
  const [templatePreview, setTemplatePreview] = useState<{ subject: string; body_html: string | null; body_text: string | null } | null>(null);
  const [composerMode, setComposerMode] = useState<Mode>("text");
  const [templateMode, setTemplateMode] = useState<Mode>("text");
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(createEmptyCampaignForm);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(createEmptyTemplateForm);
  const [selectedMembers, setSelectedMembers] = useState<OrgAdminMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<OrgAdminMember[]>([]);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [sendingExisting, setSendingExisting] = useState(false);

  const activeForms = useMemo(() => forms.filter((form) => form.is_active), [forms]);
  const activeTemplates = useMemo(() => templates.filter((template) => template.is_active), [templates]);
  const selectedCampaignLinkedForm = useMemo(
    () => activeForms.find((form) => form.id === campaignForm.linked_form_id) ?? null,
    [activeForms, campaignForm.linked_form_id],
  );
  const selectedTemplateLinkedForm = useMemo(
    () => activeForms.find((form) => form.id === templateForm.linked_form_id) ?? null,
    [activeForms, templateForm.linked_form_id],
  );

  function handleLoadError(err: unknown, fallback: string) {
    if (err instanceof AuthError) {
      navigate("/org-admin/login", { replace: true });
      return;
    }
    showToast({ title: "Errore", message: err instanceof Error ? err.message : fallback, tone: "error" });
  }

  function applyTemplateToEditor(template: OrgAdminEmailTemplate) {
    setTemplateForm({
      id: template.id,
      name: template.name,
      category: template.category || "custom",
      subject: template.subject,
      body: template.body_html || template.body_text || "",
      linked_form_id: template.linked_form_id,
      is_active: template.is_active,
      is_system: template.is_system,
      design: { ...createDefaultDesign(), ...template.design },
    });
    setTemplateMode(template.body_html && template.body_html.trim() ? "html" : "text");
  }

  function applyCampaignToEditor(template: OrgAdminEmailTemplate) {
    setCampaignForm((prev) => ({
      ...prev,
      subject: template.subject,
      body: template.body_html || template.body_text || "",
      linked_form_id: template.linked_form_id,
      design: { ...createDefaultDesign(), ...template.design },
    }));
    setComposerMode(template.body_html && template.body_html.trim() ? "html" : "text");
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [campaignData, templateData, variableData, formData] = await Promise.all([
        fetchOrgAdminEmailCampaigns(),
        fetchOrgAdminEmailTemplates({ scope: "all", includeInactive: true }),
        fetchOrgAdminEmailTemplateVariables(),
        fetchOrgAdminForms(),
      ]);
      setCampaigns(campaignData.items);
      setTemplates(templateData.items);
      setVariables(variableData.items);
      setForms(formData.items);
    } catch (err) {
      handleLoadError(err, "Impossibile caricare la sezione Comunicazioni.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (campaignForm.recipient_mode === "selected_members") {
      setEstimate(selectedMembers.length);
      return;
    }
    fetchOrgAdminCommunicationAudienceEstimate(campaignForm.audience_type)
      .then((data) => setEstimate(data.count))
      .catch(() => setEstimate(null));
  }, [campaignForm.audience_type, campaignForm.recipient_mode, selectedMembers.length]);

  useEffect(() => {
    const query = memberSearch.trim();
    if (campaignForm.recipient_mode !== "selected_members" || !query) {
      setMemberResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      searchOrgAdminCommunicationMembers({ q: query, limit: 12 })
        .then((data) => setMemberResults(data.items))
        .catch(() => setMemberResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [campaignForm.recipient_mode, memberSearch]);

  useEffect(() => {
    if (screen.type !== "campaign-editor") return;
    const timer = window.setTimeout(() => {
      if (!campaignForm.subject.trim() || !campaignForm.body.trim()) {
        setCampaignPreview(null);
        return;
      }
      previewOrgAdminEmailTemplate({
        subject: campaignForm.subject,
        body_html: composerMode === "html" ? campaignForm.body : null,
        body_text: composerMode === "text" ? campaignForm.body : null,
        design: campaignForm.design,
        linked_form_id: campaignForm.linked_form_id,
      })
        .then((result) => setCampaignPreview(result.preview))
        .catch(() => setCampaignPreview(null));
    }, 320);
    return () => window.clearTimeout(timer);
  }, [screen, campaignForm, composerMode]);

  useEffect(() => {
    if (screen.type !== "template-editor") return;
    const timer = window.setTimeout(() => {
      if (!templateForm.subject.trim() || !templateForm.body.trim()) {
        setTemplatePreview(null);
        return;
      }
      previewOrgAdminEmailTemplate({
        template_id: templateForm.id ?? undefined,
        subject: templateForm.subject,
        body_html: templateMode === "html" ? templateForm.body : null,
        body_text: templateMode === "text" ? templateForm.body : null,
        design: templateForm.design,
        linked_form_id: templateForm.linked_form_id,
      })
        .then((result) => setTemplatePreview(result.preview))
        .catch(() => setTemplatePreview(null));
    }, 320);
    return () => window.clearTimeout(timer);
  }, [screen, templateForm, templateMode]);

  async function openCampaignDetail(campaignId: number) {
    setDetailLoading(true);
    setScreen({ type: "campaign-detail", campaignId });
    try {
      const { campaign } = await fetchOrgAdminEmailCampaign(campaignId);
      setSelectedCampaign(campaign);
    } catch (err) {
      handleLoadError(err, "Impossibile caricare il dettaglio campagna.");
      setScreen({ type: "library" });
    } finally {
      setDetailLoading(false);
    }
  }

  async function openTemplateEditor(templateId: number | null) {
    setScreen({ type: "template-editor", templateId });
    if (templateId == null) {
      setTemplateForm(createEmptyTemplateForm());
      setTemplateMode("text");
      setTemplatePreview(null);
      return;
    }
    setDetailLoading(true);
    try {
      const { template } = await fetchOrgAdminEmailTemplate(templateId);
      applyTemplateToEditor(template);
    } catch (err) {
      handleLoadError(err, "Impossibile aprire il modello.");
      setScreen({ type: "library" });
    } finally {
      setDetailLoading(false);
    }
  }

  function openNewCampaignEditor() {
    setScreen({ type: "campaign-editor" });
    setCampaignForm(createEmptyCampaignForm());
    setComposerMode("text");
    setSelectedMembers([]);
    setMemberSearch("");
    setCampaignPreview(null);
  }

  async function refreshCampaigns() {
    const data = await fetchOrgAdminEmailCampaigns();
    setCampaigns(data.items);
  }

  async function refreshTemplates() {
    const data = await fetchOrgAdminEmailTemplates({ scope: "all", includeInactive: true });
    setTemplates(data.items);
  }

  async function saveCampaign(sendNow: boolean, schedule: boolean) {
    if (!campaignForm.subject.trim() || !campaignForm.body.trim()) {
      showToast({ title: "Contenuti mancanti", message: "Oggetto e contenuto sono obbligatori.", tone: "error" });
      return;
    }
    if (campaignForm.recipient_mode === "selected_members" && selectedMembers.length === 0) {
      showToast({ title: "Destinatari mancanti", message: "Seleziona almeno un socio.", tone: "error" });
      return;
    }
    if (schedule && !campaignForm.scheduled_at) {
      showToast({ title: "Programmazione mancante", message: "Scegli data e ora di invio.", tone: "error" });
      return;
    }
    setSavingCampaign(true);
    try {
      let campaign = (await createOrgAdminEmailCampaign({
        name: campaignForm.name.trim() || null,
        subject: campaignForm.subject.trim(),
        body_html: composerMode === "html" ? campaignForm.body : null,
        body_text: composerMode === "text" ? campaignForm.body : null,
        audience_type: campaignForm.audience_type,
        recipient_mode: campaignForm.recipient_mode,
        member_ids: campaignForm.recipient_mode === "selected_members" ? selectedMembers.map((member) => member.id) : [],
        scheduled_at: schedule ? campaignForm.scheduled_at : null,
        linked_form_id: campaignForm.linked_form_id,
        design: campaignForm.design,
      })).campaign;
      if (sendNow) {
        campaign = (await sendOrgAdminEmailCampaign(campaign.id)).campaign;
      }
      await refreshCampaigns();
      await openCampaignDetail(campaign.id);
      showToast({
        title: sendNow ? "Campagna inviata" : schedule ? "Campagna programmata" : "Bozza salvata",
        message: "Il messaggio è stato registrato correttamente.",
        tone: "success",
      });
    } catch (err) {
      handleLoadError(err, "Errore durante il salvataggio della campagna.");
    } finally {
      setSavingCampaign(false);
    }
  }

  async function saveTemplate() {
    if (!templateForm.name.trim() || !templateForm.subject.trim() || !templateForm.body.trim()) {
      showToast({ title: "Dati incompleti", message: "Nome, oggetto e contenuto sono obbligatori.", tone: "error" });
      return;
    }
    setSavingTemplate(true);
    try {
      const payload = {
        name: templateForm.name.trim(),
        category: templateForm.category.trim() || null,
        subject: templateForm.subject.trim(),
        body_html: templateMode === "html" ? templateForm.body : null,
        body_text: templateMode === "text" ? templateForm.body : null,
        linked_form_id: templateForm.linked_form_id,
        design: templateForm.design,
        is_active: templateForm.is_active,
      };
      const result = templateForm.id
        ? await updateOrgAdminEmailTemplate(templateForm.id, payload)
        : await createOrgAdminEmailTemplate(payload);
      await refreshTemplates();
      await openTemplateEditor(result.template.id);
      showToast({ title: templateForm.id ? "Modello aggiornato" : "Modello creato", message: "Il modello è pronto all'uso.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Errore durante il salvataggio del modello.");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDuplicateTemplate() {
    if (templateForm.id == null) return;
    try {
      const result = await duplicateOrgAdminEmailTemplate(templateForm.id, `${templateForm.name} (copia)`);
      await refreshTemplates();
      await openTemplateEditor(result.template.id);
      showToast({ title: "Modello duplicato", message: "La copia è pronta per essere adattata.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Impossibile duplicare il modello.");
    }
  }

  async function handleArchiveTemplate() {
    if (templateForm.id == null || templateForm.is_system) return;
    try {
      await archiveOrgAdminEmailTemplate(templateForm.id);
      await refreshTemplates();
      setScreen({ type: "library" });
      setMainTab("modelli");
      showToast({ title: "Modello archiviato", message: "Non verrà più proposto tra i modelli attivi.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Impossibile archiviare il modello.");
    }
  }

  async function handleSendExisting(campaignId: number) {
    if (sendingExisting) return;
    setSendingExisting(true);
    try {
      await sendOrgAdminEmailCampaign(campaignId);
      const { campaign } = await fetchOrgAdminEmailCampaign(campaignId);
      setSelectedCampaign(campaign);
      await refreshCampaigns();
      showToast({ title: "Campagna inviata", message: "L'invio è stato accodato correttamente.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Errore durante l'invio della campagna.");
    } finally {
      setSendingExisting(false);
    }
  }

  function addSelectedMember(member: OrgAdminMember) {
    setSelectedMembers((prev) => (prev.some((item) => item.id === member.id) ? prev : [...prev, member]));
  }

  function removeSelectedMember(memberId: number) {
    setSelectedMembers((prev) => prev.filter((member) => member.id !== memberId));
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-[2rem]" />
        <Skeleton className="h-96 w-full rounded-[2rem]" />
      </div>
    );
  }

  const libraryView = (
    <div className="space-y-8">
      <section className="grid gap-6 rounded-[2rem] border border-neutral-200 bg-gradient-to-br from-brand/10 via-white to-white p-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand">Studio Comunicazioni</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-neutral-900">
            Campagne e modelli respirano meglio quando editing e libreria non competono nello stesso pannello.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600">
            La libreria resta separata dal lavoro di scrittura. Quando apri un modello o una nuova campagna, entri in un editor a pagina intera con sezioni ampie, preview stabile e collegamenti ai form chiari.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="btn-primary" type="button" disabled={communicationsLocked} onClick={openNewCampaignEditor}>
              Nuova campagna
            </button>
            <button className="btn-secondary" type="button" disabled={communicationsLocked} onClick={() => void openTemplateEditor(null)}>
              Nuovo modello
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatChip label="Campagne" value={campaigns.length} hint="Storico completo di bozze, invii e programmati." />
          <StatChip label="Modelli" value={templates.length} hint="Template di sistema e personalizzati." />
          <StatChip label="Form attivi" value={activeForms.length} hint="Origini collegate disponibili per CTA e automazioni." />
          <StatChip label="Variabili" value={variables.length} hint="Placeholder cliccabili per personalizzare i contenuti." />
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        {([
          { key: "campagne", label: "Campagne" },
          { key: "modelli", label: "Modelli" },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setMainTab(tab.key)}
            className={`rounded-[1.2rem] px-5 py-3 text-sm font-semibold transition ${
              mainTab === tab.key
                ? "bg-neutral-900 text-white"
                : "border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:text-neutral-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mainTab === "campagne" ? (
        <section className={sectionCardClass}>
          <div className="flex flex-col gap-3 border-b border-neutral-200 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Library</p>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">Campagne e bozze</h3>
              <p className="mt-2 text-sm text-neutral-600">Seleziona una campagna per vedere il dettaglio o apri un nuovo editor full-width.</p>
            </div>
            <button className="btn-primary" type="button" disabled={communicationsLocked} onClick={openNewCampaignEditor}>
              Crea campagna
            </button>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-neutral-200 text-neutral-500">
                <tr>
                  <th className="px-2 py-3 font-semibold">Campagna</th>
                  <th className="px-2 py-3 font-semibold">Pubblico</th>
                  <th className="px-2 py-3 font-semibold">Stato</th>
                  <th className="px-2 py-3 font-semibold">Ultimo passaggio</th>
                  <th className="px-2 py-3 font-semibold">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-12 text-center text-neutral-500">
                      Nessuna campagna disponibile. Crea la prima bozza dal nuovo editor a pagina intera.
                    </td>
                  </tr>
                ) : (
                  campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-b border-neutral-100 last:border-b-0">
                      <td className="px-2 py-4">
                        <p className="font-semibold text-neutral-900">{campaign.name || campaign.subject}</p>
                        <p className="mt-1 text-xs text-neutral-500">{campaign.subject}</p>
                      </td>
                      <td className="px-2 py-4 text-neutral-600">{campaign.target_summary}</td>
                      <td className="px-2 py-4">
                        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-700">
                          {statusLabel(campaign.status)}
                        </span>
                      </td>
                      <td className="px-2 py-4 text-neutral-600">{formatDateTime(campaign.sent_at || campaign.scheduled_at || campaign.created_at)}</td>
                      <td className="px-2 py-4">
                        <button
                          type="button"
                          className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-900"
                          onClick={() => void openCampaignDetail(campaign.id)}
                        >
                          Apri dettaglio
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className={sectionCardClass}>
          <div className="flex flex-col gap-3 border-b border-neutral-200 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Library</p>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">Modelli salvati</h3>
              <p className="mt-2 text-sm text-neutral-600">Ogni modello apre un editor dedicato, senza comprimere branding, contenuto e collegamenti.</p>
            </div>
            <button className="btn-primary" type="button" disabled={communicationsLocked} onClick={() => void openTemplateEditor(null)}>
              Crea modello
            </button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {templates.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
                Nessun modello creato. Apri il nuovo editor per preparare template riusabili per campagne, reminder o inviti.
              </div>
            ) : (
              templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => void openTemplateEditor(template.id)}
                  className="rounded-[1.5rem] border border-neutral-200 bg-white p-5 text-left transition hover:border-neutral-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-neutral-900">{template.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {template.is_system ? "Template di sistema" : "Template associazione"}{template.category ? ` • ${template.category}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-700">
                      {template.is_active ? "Attivo" : "Archiviato"}
                    </span>
                  </div>
                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-neutral-600">{template.subject}</p>
                </button>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );

  if (screen.type === "campaign-detail") {
    return (
      <div className="-mx-6 md:-mx-8">
        <EditorHeader
          title={selectedCampaign?.name || selectedCampaign?.subject || "Dettaglio campagna"}
          subtitle="Vista ampia della campagna: destinatari, collegamento al form, programmazione e anteprima contenuto senza pannelli laterali stretti."
          badge={selectedCampaign ? statusLabel(selectedCampaign.status) : "Dettaglio"}
          onBack={() => setScreen({ type: "library" })}
          actions={
            ["draft", "scheduled"].includes((selectedCampaign?.status || "").toLowerCase()) ? (
              <button className="btn-primary" type="button" disabled={sendingExisting || communicationsLocked || !selectedCampaign} onClick={() => selectedCampaign && void handleSendExisting(selectedCampaign.id)}>
                {sendingExisting ? "Invio..." : "Invia ora"}
              </button>
            ) : null
          }
        />
        <div className="px-4 py-6 md:px-8">
          {detailLoading || !selectedCampaign ? (
            <div className="space-y-5">
              <Skeleton className="h-32 w-full rounded-[1.8rem]" />
              <Skeleton className="h-80 w-full rounded-[1.8rem]" />
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.8fr)]">
              <div className="space-y-6">
                <section className={sectionCardClass}>
                  <div className="grid gap-4 md:grid-cols-3">
                    <StatChip label="Destinatari" value={selectedCampaign.recipient_count || selectedCampaign.planned_recipient_count} hint={selectedCampaign.target_summary} />
                    <StatChip label="Form collegato" value={selectedCampaign.linked_form?.title || "Nessuno"} hint={selectedCampaign.linked_form ? "La CTA punta a questo form." : "Nessun form associato."} />
                    <StatChip label="Programmazione" value={formatDateTime(selectedCampaign.scheduled_at)} hint="Se vuoto, l'invio è stato manuale." />
                  </div>
                </section>
                <section className={sectionCardClass}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Contenuto</p>
                  <h3 className="mt-2 text-xl font-semibold text-neutral-900">{selectedCampaign.subject}</h3>
                  <div className="mt-5 rounded-[1.4rem] border border-neutral-200 bg-neutral-50 p-5 text-sm leading-7 text-neutral-700">
                    {selectedCampaign.body_html ? (
                      <div dangerouslySetInnerHTML={{ __html: selectedCampaign.body_html }} />
                    ) : (
                      <div className="whitespace-pre-wrap">{selectedCampaign.body_text || "-"}</div>
                    )}
                  </div>
                </section>
              </div>
              <aside className="space-y-6 xl:sticky xl:top-28 xl:self-start">
                <section className={sectionCardClass}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Branding attivo</p>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-sm text-neutral-600">
                      <span>Preset</span>
                      <strong className="text-neutral-900">{selectedCampaign.design.style_preset || "Istituzionale"}</strong>
                    </div>
                    <div className="flex items-center justify-between text-sm text-neutral-600">
                      <span>Colore CTA</span>
                      <span className="inline-flex items-center gap-2 font-medium text-neutral-900">
                        <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: selectedCampaign.design.accent_color }} />
                        {selectedCampaign.design.accent_color}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-neutral-600">
                      <span>Form collegato</span>
                      <strong className="text-neutral-900">{selectedCampaign.linked_form?.title || "Nessuno"}</strong>
                    </div>
                  </div>
                </section>
              </aside>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen.type === "campaign-editor") {
    return (
      <div className="-mx-6 md:-mx-8">
        <EditorHeader
          title={campaignForm.name.trim() || "Nuova campagna"}
          subtitle="Editor a pagina intera per definire contenuto, targeting, collegamento al form e branding senza comprimere i blocchi di personalizzazione."
          badge={campaignForm.scheduled_at ? "Programmazione" : "Bozza"}
          onBack={() => setScreen({ type: "library" })}
          actions={
            <>
              <button className="btn-secondary" type="button" disabled={savingCampaign} onClick={() => void saveCampaign(false, false)}>
                Salva bozza
              </button>
              <button className="btn-secondary" type="button" disabled={savingCampaign} onClick={() => void saveCampaign(false, true)}>
                Programma
              </button>
              <button className="btn-primary" type="button" disabled={savingCampaign || communicationsLocked} onClick={() => void saveCampaign(true, false)}>
                Invia ora
              </button>
            </>
          }
        />
        <div className="px-4 py-6 md:px-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
            <div className="space-y-6">
              <section className={sectionCardClass}>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Basic Info</p>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <label className={labelClass}>
                    Nome interno
                    <input className={inputClass} value={campaignForm.name} onChange={(event) => setCampaignForm((prev) => ({ ...prev, name: event.target.value }))} />
                  </label>
                  <label className={labelClass}>
                    Programma invio
                    <input type="datetime-local" className={inputClass} value={campaignForm.scheduled_at} onChange={(event) => setCampaignForm((prev) => ({ ...prev, scheduled_at: event.target.value }))} />
                  </label>
                  <label className={`${labelClass} md:col-span-2`}>
                    Oggetto email
                    <input className={inputClass} value={campaignForm.subject} onChange={(event) => setCampaignForm((prev) => ({ ...prev, subject: event.target.value }))} />
                  </label>
                  <label className={`${labelClass} md:col-span-2`}>
                    Main title
                    <input className={inputClass} value={campaignForm.design.hero_title || ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, hero_title: event.target.value } }))} placeholder="Titolo principale dentro il messaggio" />
                  </label>
                  <label className={`${labelClass} md:col-span-2`}>
                    Body message
                    <textarea className={`${inputClass} min-h-[240px]`} value={campaignForm.body} onChange={(event) => setCampaignForm((prev) => ({ ...prev, body: event.target.value }))} />
                  </label>
                </div>
              </section>

              <section className={sectionCardClass}>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Linking / Targeting</p>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <label className={labelClass}>
                    Carica modello
                    <select className={inputClass} onChange={(event) => { const id = Number(event.target.value || 0); const template = activeTemplates.find((item) => item.id === id); if (template) applyCampaignToEditor(template); }}>
                      <option value="">Nessun modello</option>
                      {activeTemplates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClass}>
                    Form collegato
                    <select className={inputClass} value={campaignForm.linked_form_id ?? ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, linked_form_id: event.target.value ? Number(event.target.value) : null }))}>
                      <option value="">Nessun form collegato</option>
                      {activeForms.map((form) => (
                        <option key={form.id} value={form.id}>{form.title}</option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClass}>
                    CTA label
                    <input className={inputClass} value={campaignForm.design.cta_label || ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, cta_label: event.target.value } }))} placeholder="Es. Compila il modulo" />
                  </label>
                  <label className={labelClass}>
                    CTA link
                    <input className={inputClass} value={campaignForm.design.cta_url || ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, cta_url: event.target.value } }))} placeholder="Se vuoto usa il form collegato" />
                  </label>
                </div>
                <div className="mt-5">
                  <p className="text-sm font-semibold text-neutral-900">Destinatari</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {(["all_members", "selected_members"] as OrgAdminCampaignRecipientMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`rounded-[1.4rem] border px-4 py-4 text-left transition ${
                          campaignForm.recipient_mode === mode
                            ? "border-brand bg-brand/6 text-brand"
                            : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
                        }`}
                        onClick={() => setCampaignForm((prev) => ({ ...prev, recipient_mode: mode }))}
                      >
                        <p className="font-semibold">{mode === "selected_members" ? "Soci selezionati" : "Segmento soci"}</p>
                        <p className="mt-1 text-xs">{mode === "selected_members" ? "Ricerca e aggiungi manualmente i destinatari." : "Usa l'audience predefinita dell'associazione."}</p>
                      </button>
                    ))}
                  </div>
                  {campaignForm.recipient_mode === "all_members" ? (
                    <label className={`${labelClass} mt-4`}>
                      Segmento soci
                      <select className={inputClass} value={campaignForm.audience_type} onChange={(event) => setCampaignForm((prev) => ({ ...prev, audience_type: event.target.value as OrgAdminCampaignAudienceType }))}>
                        {audienceOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <span className="mt-2 block text-xs text-neutral-500">{audienceOptions.find((option) => option.value === campaignForm.audience_type)?.description}</span>
                    </label>
                  ) : (
                    <div className="mt-4 rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4">
                      <label className={labelClass}>
                        Cerca soci
                        <input className={inputClass} value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Nome, email o numero tessera" />
                      </label>
                      <div className="mt-4 rounded-[1.2rem] border border-neutral-200 bg-white">
                        {memberSearch.trim() && memberResults.length === 0 ? (
                          <div className="p-4 text-sm text-neutral-500">Nessun socio trovato.</div>
                        ) : (
                          memberResults.map((member) => (
                            <button key={member.id} type="button" className="flex w-full items-start justify-between gap-4 border-b border-neutral-100 px-4 py-3 text-left last:border-b-0 hover:bg-neutral-50" onClick={() => addSelectedMember(member)}>
                              <div>
                                <p className="font-semibold text-neutral-900">{member.name}</p>
                                <p className="mt-1 text-xs text-neutral-500">{[member.email || "Email non disponibile", member.card_number ? `Tessera ${member.card_number}` : null].filter(Boolean).join(" • ")}</p>
                              </div>
                              <span className="text-xs font-semibold text-brand">Aggiungi</span>
                            </button>
                          ))
                        )}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedMembers.map((member) => (
                          <span key={member.id} className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700">
                            {member.name}
                            <button type="button" className="text-neutral-400 hover:text-neutral-700" onClick={() => removeSelectedMember(member.id)}>x</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className={sectionCardClass}>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Variabili disponibili</p>
                <p className="mt-2 text-sm text-neutral-600">Usa i placeholder direttamente nel contenuto per personalizzare titolo, testo e CTA.</p>
                <div className="mt-4"><VariableCloud variables={variables} /></div>
              </section>
            </div>
            <aside className="space-y-6 xl:sticky xl:top-28 xl:self-start">
              <section className={sectionCardClass}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Visual Style</p>
                    <p className="mt-2 text-sm text-neutral-600">Preset, font e tono del bottone per evitare impostazioni sparse.</p>
                  </div>
                  <ModeSwitch value={composerMode} onChange={setComposerMode} />
                </div>
                <div className="mt-4 grid gap-3">
                  {stylePresetCards.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      className={`rounded-[1.3rem] border p-4 text-left transition ${
                        campaignForm.design.style_preset === preset.key
                          ? "border-brand bg-brand/5"
                          : "border-neutral-200 hover:border-neutral-300"
                      }`}
                      onClick={() => setCampaignForm((prev) => ({ ...prev, design: applyStylePreset(prev.design, preset) }))}
                    >
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: preset.accent }} />
                        <strong className="text-sm text-neutral-900">{preset.label}</strong>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-neutral-500">{preset.note}</p>
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className={labelClass}>
                    Font preset
                    <select className={inputClass} value={campaignForm.design.font_preset || "classic"} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, font_preset: event.target.value as OrgAdminEmailFontPreset } }))}>
                      {fontPresetOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClass}>
                    Button style
                    <select className={inputClass} value={campaignForm.design.button_style || "pill"} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, button_style: event.target.value } }))}>
                      {buttonStyleOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <section className={sectionCardClass}>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Branding</p>
                <div className="mt-4 space-y-4">
                  <label className={labelClass}>
                    Hero kicker
                    <input className={inputClass} value={campaignForm.design.hero_kicker || ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, hero_kicker: event.target.value } }))} />
                  </label>
                  <label className={labelClass}>
                    Logo URL
                    <input className={inputClass} value={campaignForm.design.logo_url || ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, logo_url: event.target.value } }))} />
                  </label>
                  <label className={labelClass}>
                    Hero image
                    <input className={inputClass} value={campaignForm.design.hero_image_url || ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, hero_image_url: event.target.value } }))} />
                  </label>
                  <label className={labelClass}>
                    Content image
                    <input className={inputClass} value={campaignForm.design.content_image_url || ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, content_image_url: event.target.value } }))} />
                  </label>
                  <label className={labelClass}>
                    Colore principale
                    <input className={`${inputClass} h-12 p-2`} type="color" value={campaignForm.design.accent_color} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, accent_color: event.target.value } }))} />
                  </label>
                  <label className="flex items-center gap-3 text-sm font-medium text-neutral-700">
                    <input type="checkbox" className="rounded border-neutral-300 text-brand" checked={campaignForm.design.show_association_name} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, show_association_name: event.target.checked } }))} />
                    Mostra il nome associazione
                  </label>
                </div>
              </section>

              <section className={sectionCardClass}>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Optional Content Blocks</p>
                <div className="mt-4 space-y-4">
                  <label className={labelClass}>
                    Highlight box
                    <textarea className={`${inputClass} min-h-[88px]`} value={campaignForm.design.highlight_box || ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, highlight_box: event.target.value } }))} />
                  </label>
                  <label className={labelClass}>
                    Event details
                    <textarea className={`${inputClass} min-h-[88px]`} value={campaignForm.design.event_details || ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, event_details: event.target.value } }))} />
                  </label>
                  <label className={labelClass}>
                    Signature
                    <textarea className={`${inputClass} min-h-[74px]`} value={campaignForm.design.signature || ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, signature: event.target.value } }))} />
                  </label>
                  <details className="rounded-[1.2rem] border border-neutral-200 bg-neutral-50 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-neutral-800">Advanced options</summary>
                    <div className="mt-4 space-y-4">
                      <label className={labelClass}>
                        CTA note
                        <textarea className={`${inputClass} min-h-[70px]`} value={campaignForm.design.cta_note || ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, cta_note: event.target.value } }))} />
                      </label>
                      <label className={labelClass}>
                        Final note
                        <textarea className={`${inputClass} min-h-[70px]`} value={campaignForm.design.final_note || ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, final_note: event.target.value } }))} />
                      </label>
                    </div>
                  </details>
                </div>
              </section>

              <section className={sectionCardClass}>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Sticky Preview</p>
                <div className="mt-4 rounded-[1.4rem] border border-neutral-200 bg-neutral-50 p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{campaignPreview?.subject || campaignForm.subject || "Anteprima campagna"}</p>
                      <p className="mt-1 text-xs text-neutral-500">{selectedCampaignLinkedForm ? `CTA collegata a ${selectedCampaignLinkedForm.title}` : "Nessun form collegato"}</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-neutral-600 shadow-sm">{estimate ?? "-"} destinatari</span>
                  </div>
                  <div className="rounded-[1.2rem] bg-white p-3">
                    {campaignPreview?.body_html ? (
                      <div dangerouslySetInnerHTML={{ __html: campaignPreview.body_html }} />
                    ) : (
                      <div className="whitespace-pre-wrap text-sm leading-6 text-neutral-600">{campaignForm.body || "Compila oggetto e contenuto per vedere l'anteprima."}</div>
                    )}
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  if (screen.type === "template-editor") {
    return (
      <div className="-mx-6 md:-mx-8">
        <EditorHeader
          title={templateForm.id ? templateForm.name || "Modello" : "Nuovo modello"}
          subtitle="Editor full-page per i modelli riusabili: contenuto, form collegato, preset visuali e blocchi opzionali restano nello stesso flusso verticale."
          badge={templateForm.is_system ? "Sistema" : templateForm.is_active ? "Attivo" : "Archiviato"}
          onBack={() => setScreen({ type: "library" })}
          actions={
            <>
              <button className="btn-secondary" type="button" onClick={() => void handleDuplicateTemplate()} disabled={templateForm.id == null}>
                Duplica
              </button>
              {!templateForm.is_system ? (
                <button className="btn-secondary" type="button" onClick={() => void handleArchiveTemplate()} disabled={templateForm.id == null}>
                  Archivia
                </button>
              ) : null}
              <button className="btn-primary" type="button" disabled={savingTemplate || templateForm.is_system} onClick={() => void saveTemplate()}>
                {templateForm.id ? "Salva modello" : "Crea modello"}
              </button>
            </>
          }
        />
        <div className="px-4 py-6 md:px-8">
          {detailLoading ? (
            <Skeleton className="h-[720px] w-full rounded-[1.8rem]" />
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
              <div className="space-y-6">
                <section className={sectionCardClass}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Basic Info</p>
                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <label className={labelClass}>
                      Nome modello
                      <input className={inputClass} disabled={templateForm.is_system} value={templateForm.name} onChange={(event) => setTemplateForm((prev) => ({ ...prev, name: event.target.value }))} />
                    </label>
                    <label className={labelClass}>
                      Categoria
                      <input className={inputClass} disabled={templateForm.is_system} value={templateForm.category} onChange={(event) => setTemplateForm((prev) => ({ ...prev, category: event.target.value }))} />
                    </label>
                    <label className={`${labelClass} md:col-span-2`}>
                      Oggetto
                      <input className={inputClass} disabled={templateForm.is_system} value={templateForm.subject} onChange={(event) => setTemplateForm((prev) => ({ ...prev, subject: event.target.value }))} />
                    </label>
                    <label className={`${labelClass} md:col-span-2`}>
                      Main title
                      <input className={inputClass} disabled={templateForm.is_system} value={templateForm.design.hero_title || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, hero_title: event.target.value } }))} />
                    </label>
                    <label className={`${labelClass} md:col-span-2`}>
                      Body message
                      <textarea className={`${inputClass} min-h-[260px]`} disabled={templateForm.is_system} value={templateForm.body} onChange={(event) => setTemplateForm((prev) => ({ ...prev, body: event.target.value }))} />
                    </label>
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Linking / Preview</p>
                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <label className={labelClass}>
                      Form collegato
                      <select className={inputClass} disabled={templateForm.is_system} value={templateForm.linked_form_id ?? ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, linked_form_id: event.target.value ? Number(event.target.value) : null }))}>
                        <option value="">Nessun form collegato</option>
                        {activeForms.map((form) => (
                          <option key={form.id} value={form.id}>{form.title}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-3 pt-9 text-sm font-medium text-neutral-700">
                      <input type="checkbox" className="rounded border-neutral-300 text-brand" disabled={templateForm.is_system} checked={templateForm.is_active} onChange={(event) => setTemplateForm((prev) => ({ ...prev, is_active: event.target.checked }))} />
                      Modello attivo
                    </label>
                    <label className={labelClass}>
                      CTA label
                      <input className={inputClass} disabled={templateForm.is_system} value={templateForm.design.cta_label || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, cta_label: event.target.value } }))} />
                    </label>
                    <label className={labelClass}>
                      CTA link
                      <input className={inputClass} disabled={templateForm.is_system} value={templateForm.design.cta_url || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, cta_url: event.target.value } }))} />
                    </label>
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Variabili disponibili</p>
                  <p className="mt-2 text-sm text-neutral-600">I placeholder restano visibili nello stesso flusso di editing, senza pannelli stretti laterali.</p>
                  <div className="mt-4"><VariableCloud variables={variables} /></div>
                </section>
              </div>

              <aside className="space-y-6 xl:sticky xl:top-28 xl:self-start">
                <section className={sectionCardClass}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Visual Style</p>
                      <p className="mt-2 text-sm text-neutral-600">Preset compatti per guidare il linguaggio del modello.</p>
                    </div>
                    <ModeSwitch value={templateMode} onChange={setTemplateMode} />
                  </div>
                  <div className="mt-4 grid gap-3">
                    {stylePresetCards.map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        disabled={templateForm.is_system}
                        className={`rounded-[1.3rem] border p-4 text-left transition ${
                          templateForm.design.style_preset === preset.key
                            ? "border-brand bg-brand/5"
                            : "border-neutral-200 hover:border-neutral-300"
                        } ${templateForm.is_system ? "opacity-60" : ""}`}
                        onClick={() => setTemplateForm((prev) => ({ ...prev, design: applyStylePreset(prev.design, preset) }))}
                      >
                        <div className="flex items-center gap-3">
                          <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: preset.accent }} />
                          <strong className="text-sm text-neutral-900">{preset.label}</strong>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-neutral-500">{preset.note}</p>
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className={labelClass}>
                      Font preset
                      <select className={inputClass} disabled={templateForm.is_system} value={templateForm.design.font_preset || "classic"} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, font_preset: event.target.value as OrgAdminEmailFontPreset } }))}>
                        {fontPresetOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className={labelClass}>
                      Button style
                      <select className={inputClass} disabled={templateForm.is_system} value={templateForm.design.button_style || "pill"} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, button_style: event.target.value } }))}>
                        {buttonStyleOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Branding & Blocks</p>
                  <div className="mt-4 space-y-4">
                    {templateBrandingFields.map((item) => (
                      <label key={item.key} className={labelClass}>
                        {item.label}
                        <input
                          className={inputClass}
                          disabled={templateForm.is_system}
                          value={templateForm.design[item.key] || ""}
                          onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, [item.key]: event.target.value } }))}
                        />
                      </label>
                    ))}
                    <label className={labelClass}>
                      Highlight box
                      <textarea className={`${inputClass} min-h-[76px]`} disabled={templateForm.is_system} value={templateForm.design.highlight_box || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, highlight_box: event.target.value } }))} />
                    </label>
                    <label className={labelClass}>
                      Event details
                      <textarea className={`${inputClass} min-h-[76px]`} disabled={templateForm.is_system} value={templateForm.design.event_details || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, event_details: event.target.value } }))} />
                    </label>
                    <label className={labelClass}>
                      Signature
                      <textarea className={`${inputClass} min-h-[64px]`} disabled={templateForm.is_system} value={templateForm.design.signature || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, signature: event.target.value } }))} />
                    </label>
                    <details className="rounded-[1.2rem] border border-neutral-200 bg-neutral-50 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-neutral-800">Advanced options</summary>
                      <div className="mt-4 space-y-4">
                        <label className={labelClass}>
                          CTA note
                          <textarea className={`${inputClass} min-h-[64px]`} disabled={templateForm.is_system} value={templateForm.design.cta_note || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, cta_note: event.target.value } }))} />
                        </label>
                        <label className={labelClass}>
                          Final note
                          <textarea className={`${inputClass} min-h-[64px]`} disabled={templateForm.is_system} value={templateForm.design.final_note || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, final_note: event.target.value } }))} />
                        </label>
                      </div>
                    </details>
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Sticky Preview</p>
                  <div className="mt-4 rounded-[1.4rem] border border-neutral-200 bg-neutral-50 p-4">
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-neutral-900">{templatePreview?.subject || templateForm.subject || "Anteprima modello"}</p>
                      <p className="mt-1 text-xs text-neutral-500">{selectedTemplateLinkedForm ? `Collegato al form ${selectedTemplateLinkedForm.title}` : "Nessun form collegato"}</p>
                    </div>
                    <div className="rounded-[1.2rem] bg-white p-3">
                      {templatePreview?.body_html ? (
                        <div dangerouslySetInnerHTML={{ __html: templatePreview.body_html }} />
                      ) : (
                        <div className="whitespace-pre-wrap text-sm leading-6 text-neutral-600">{templateForm.body || "Compila oggetto e contenuto per vedere l'anteprima."}</div>
                      )}
                    </div>
                  </div>
                </section>
              </aside>
            </div>
          )}
        </div>
      </div>
    );
  }

  return libraryView;
}
