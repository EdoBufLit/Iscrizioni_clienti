import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import ConfirmModal from "../../../../components/ui/ConfirmModal";
import PromptModal from "../../../../components/ui/PromptModal";
import Skeleton from "../../../../components/ui/Skeleton";
import { useToast } from "../../../../components/ui/ToastProvider";
import {
  AuthError,
  createOrgAdminEmailCampaign,
  createOrgAdminEmailTemplate,
  deleteOrgAdminCommunicationAsset,
  deleteOrgAdminEmailCampaign,
  deleteOrgAdminEmailTemplate,
  duplicateOrgAdminEmailTemplate,
  fetchOrgAdminCommunicationAssets,
  fetchOrgAdminCommunicationAudienceEstimate,
  fetchOrgAdminEmailCampaign,
  fetchOrgAdminEmailCampaigns,
  fetchOrgAdminEmailTemplate,
  fetchOrgAdminEmailTemplates,
  fetchOrgAdminEmailTemplateVariables,
  fetchOrgAdminForms,
  previewOrgAdminEmailTemplate,
  searchOrgAdminCommunicationMembers,
  sendOrgAdminCommunicationBuilderTestEmail,
  sendOrgAdminEmailCampaign,
  updateOrgAdminEmailCampaign,
  updateOrgAdminEmailTemplate,
  uploadOrgAdminCommunicationAsset,
  type AssociationForm,
  type OrgAdminCampaignAudienceType,
  type OrgAdminCampaignRecipientMode,
  type OrgAdminEmailBuilderAsset,
  type OrgAdminEmailCampaign,
  type OrgAdminEmailEditorStatus,
  type OrgAdminEmailTemplate,
  type OrgAdminEmailTemplateType,
  type OrgAdminEmailTemplateVariable,
  type OrgAdminMember,
} from "../../../../lib/api";
import { GrapesEmailBuilder } from "./GrapesEmailBuilder";
import {
  CAMPAIGN_AUDIENCE_OPTIONS,
  CAMPAIGN_RECIPIENT_MODE_OPTIONS,
  DEFAULT_CAMPAIGN_AUDIENCE,
  DEFAULT_EDITOR_STATUS,
  DEFAULT_RECIPIENT_MODE,
  DEFAULT_TEMPLATE_TYPE,
  TEMPLATE_STATUS_OPTIONS,
  TEMPLATE_TYPE_OPTIONS,
  ensureMjmlDocument,
  getBuilderInitialMjml,
  getCampaignAudienceLabel,
  getTemplateStatusLabel,
  getTemplateTypeLabel,
} from "./emailBuilder";

type MessagesHubProps = { communicationsLocked: boolean };
type Subtab = "campaigns" | "templates";
type ViewState =
  | { kind: "library" }
  | { kind: "template-builder"; templateId: number | null }
  | { kind: "campaign-builder"; campaignId: number | null };
type TemplateStep = "type" | "base" | "editor" | "review";
type CampaignStep = "type" | "base" | "editor" | "preview" | "action";

type BuilderSnapshot = {
  compiledHtml: string;
  mjmlSource: string;
  bodyText: string;
  grapesjsProjectJson: Record<string, unknown> | null;
};

type TemplateDraft = {
  id: number | null;
  sourceTemplateId: number | null;
  builderKey: string;
  name: string;
  subject: string;
  templateType: OrgAdminEmailTemplateType;
  linkedFormId: number | null;
  editorStatus: OrgAdminEmailEditorStatus;
  isSystem: boolean;
  isActive: boolean;
  compiledHtml: string;
  mjmlSource: string;
  bodyText: string;
  grapesjsProjectJson: Record<string, unknown> | null;
};

type CampaignDraft = {
  id: number | null;
  sourceTemplateId: number | null;
  builderKey: string;
  name: string;
  subject: string;
  templateType: OrgAdminEmailTemplateType;
  linkedFormId: number | null;
  audienceType: OrgAdminCampaignAudienceType;
  recipientMode: OrgAdminCampaignRecipientMode;
  memberIds: number[];
  scheduledAt: string;
  editorStatus: OrgAdminEmailEditorStatus;
  compiledHtml: string;
  mjmlSource: string;
  bodyText: string;
  grapesjsProjectJson: Record<string, unknown> | null;
  status: string | null;
};

type PreviewState = {
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
};

const inputClass =
  "mt-2 w-full rounded-2xl border border-[#ddd5c6] bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#17494a] focus:ring-4 focus:ring-[#17494a]/10";
const labelClass = "block text-sm font-semibold text-slate-900";
const panelClass = "rounded-[1.6rem] border border-[#ddd5c6] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] md:p-6";
const subtlePanelClass = "rounded-[1.2rem] border border-[#e6ddcf] bg-[#fbfaf6] p-4";

function createEditorKey() {
  return `${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

function emptyTemplateDraft(linkedFormId: number | null = null): TemplateDraft {
  const mjmlSource = getBuilderInitialMjml(DEFAULT_TEMPLATE_TYPE);
  return {
    id: null,
    sourceTemplateId: null,
    builderKey: createEditorKey(),
    name: "",
    subject: "",
    templateType: DEFAULT_TEMPLATE_TYPE,
    linkedFormId,
    editorStatus: DEFAULT_EDITOR_STATUS,
    isSystem: false,
    isActive: true,
    compiledHtml: "",
    mjmlSource,
    bodyText: "",
    grapesjsProjectJson: null,
  };
}

function emptyCampaignDraft(linkedFormId: number | null = null): CampaignDraft {
  const mjmlSource = getBuilderInitialMjml(DEFAULT_TEMPLATE_TYPE);
  return {
    id: null,
    sourceTemplateId: null,
    builderKey: createEditorKey(),
    name: "",
    subject: "",
    templateType: DEFAULT_TEMPLATE_TYPE,
    linkedFormId,
    audienceType: DEFAULT_CAMPAIGN_AUDIENCE,
    recipientMode: DEFAULT_RECIPIENT_MODE,
    memberIds: [],
    scheduledAt: "",
    editorStatus: DEFAULT_EDITOR_STATUS,
    compiledHtml: "",
    mjmlSource,
    bodyText: "",
    grapesjsProjectJson: null,
    status: "draft",
  };
}

function mapTemplateToDraft(template: OrgAdminEmailTemplate): TemplateDraft {
  return {
    id: template.id,
    sourceTemplateId: template.id,
    builderKey: createEditorKey(),
    name: template.name || "",
    subject: template.subject || "",
    templateType: template.template_type || DEFAULT_TEMPLATE_TYPE,
    linkedFormId: template.linked_form_id,
    editorStatus: template.editor_status || DEFAULT_EDITOR_STATUS,
    isSystem: Boolean(template.is_system),
    isActive: Boolean(template.is_active),
    compiledHtml: template.compiled_html || template.body_html || "",
    mjmlSource: ensureMjmlDocument(
      template.mjml_source || template.compiled_html || template.body_html || "",
      template.template_type || DEFAULT_TEMPLATE_TYPE,
    ),
    bodyText: template.body_text || "",
    grapesjsProjectJson: template.grapesjs_project_json || null,
  };
}

function mapCampaignToDraft(campaign: OrgAdminEmailCampaign): CampaignDraft {
  const templateType = campaign.source_template?.template_type || DEFAULT_TEMPLATE_TYPE;
  return {
    id: campaign.id,
    sourceTemplateId: campaign.source_template_id ?? campaign.source_template?.id ?? null,
    builderKey: createEditorKey(),
    name: campaign.name || "",
    subject: campaign.subject || "",
    templateType,
    linkedFormId: campaign.linked_form_id,
    audienceType: campaign.audience_type || DEFAULT_CAMPAIGN_AUDIENCE,
    recipientMode: campaign.recipient_mode || DEFAULT_RECIPIENT_MODE,
    memberIds: campaign.selected_member_ids || [],
    scheduledAt: campaign.scheduled_at ? campaign.scheduled_at.slice(0, 16) : "",
    editorStatus: campaign.editor_status || DEFAULT_EDITOR_STATUS,
    compiledHtml: campaign.compiled_html || campaign.body_html || "",
    mjmlSource: ensureMjmlDocument(
      campaign.mjml_source || campaign.compiled_html || campaign.body_html || "",
      templateType,
    ),
    bodyText: campaign.body_text || "",
    grapesjsProjectJson: campaign.grapesjs_project_json || null,
    status: campaign.status,
  };
}

function TemplateTypeBadge({ value }: { value: OrgAdminEmailTemplateType | string | null | undefined }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[#d6cec0] bg-[#f6f2e8] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#725f43]">
      {getTemplateTypeLabel(value)}
    </span>
  );
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  const normalized = String(value || "").toLowerCase();
  const className =
    normalized === "ready" || normalized === "sent"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "scheduled"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : normalized === "failed"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${className}`}>
      {normalized === "draft" || normalized === "ready" ? getTemplateStatusLabel(normalized) : normalized || "-"}
    </span>
  );
}

function WizardHero({
  steps,
  activeStep,
}: {
  eyebrow: string;
  title: string;
  description: string;
  steps: Array<{ key: string; label: string }>;
  activeStep: string;
}) {
  const activeIndex = Math.max(0, steps.findIndex((step) => step.key === activeStep));

  return (
    <section className="rounded-[1.6rem] border border-[#ddd4c3] bg-[#fbfaf6] px-4 py-5 md:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="relative px-2">
          <div className="absolute left-[10%] right-[10%] top-6 hidden h-[2px] rounded-full bg-[#e4dbc9] md:block" />
          <div
            className="absolute left-[10%] top-6 hidden h-[2px] rounded-full bg-[#17494a] transition-[width] duration-300 md:block"
            style={{
              width: steps.length > 1 ? `${(activeIndex / (steps.length - 1)) * 80}%` : "0%",
            }}
          />
          <div className="grid gap-4 md:grid-cols-[repeat(var(--wizard-cols),minmax(0,1fr))]" style={{ ["--wizard-cols" as string]: String(steps.length) }}>
            {steps.map((step, index) => {
              const active = index === activeIndex;
              const complete = index < activeIndex;
              return (
                <div key={step.key} className="flex flex-col items-center text-center">
                  <div
                    className={`relative z-[1] flex h-12 w-12 items-center justify-center rounded-full border text-base font-semibold ${
                      active || complete
                        ? "border-[#17494a] bg-[#17494a] text-white shadow-[0_16px_30px_rgba(23,73,74,0.18)]"
                        : "border-[#ded6c8] bg-white text-slate-400"
                    }`}
                  >
                    {index + 1}
                  </div>
                  <p className={`mt-3 text-sm font-semibold ${active || complete ? "text-slate-900" : "text-slate-400"}`}>
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewFrame({
  html,
  device,
  emptyMessage,
}: {
  html: string | null | undefined;
  device: "desktop" | "mobile";
  emptyMessage: string;
}) {
  if (!html) {
    return <div className={`${subtlePanelClass} text-sm leading-6 text-slate-500`}>{emptyMessage}</div>;
  }

  return (
    <div className="rounded-[1.4rem] border border-[#ddd5c6] bg-[#f8f4ec] p-4">
      <div className={`mx-auto overflow-hidden rounded-[1rem] border border-[#d8cebf] bg-white shadow-[0_22px_44px_rgba(15,23,42,0.08)] ${device === "mobile" ? "max-w-[390px]" : "max-w-full"}`}>
        <iframe title="Anteprima email" srcDoc={html} className="h-[680px] w-full bg-white" sandbox="allow-same-origin" />
      </div>
    </div>
  );
}

function MemberPicker({
  selectedMembers,
  results,
  query,
  onQueryChange,
  onToggle,
}: {
  selectedMembers: OrgAdminMember[];
  results: OrgAdminMember[];
  query: string;
  onQueryChange: (value: string) => void;
  onToggle: (member: OrgAdminMember) => void;
}) {
  const selectedIds = new Set(selectedMembers.map((member) => member.id));

  return (
    <div className={`${panelClass} space-y-4`}>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7a6647]">Selezione manuale</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Cerca e aggiungi solo i soci da includere nella campagna.
        </p>
      </div>
      <label className={labelClass}>
        Cerca soci
        <input
          className={inputClass}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Nome, cognome o email"
        />
      </label>
      {selectedMembers.length ? (
        <div className="flex flex-wrap gap-2">
          {selectedMembers.map((member) => (
            <button
              key={member.id}
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-[#d4c9b8] bg-[#fbfaf6] px-3 py-1.5 text-sm font-medium text-slate-700"
              onClick={() => onToggle(member)}
            >
              {member.name}
              <span className="text-slate-400">x</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid gap-2">
        {results.map((member) => (
          <button
            key={member.id}
            type="button"
            className={`flex items-center justify-between rounded-[1rem] border px-4 py-3 text-left transition ${
              selectedIds.has(member.id)
                ? "border-[#17494a] bg-[#ecf6f6]"
                : "border-[#e5ddcf] bg-white hover:border-[#cbbba0]"
            }`}
            onClick={() => onToggle(member)}
          >
            <span>
              <span className="block text-sm font-semibold text-slate-900">{member.name}</span>
              <span className="mt-1 block text-xs text-slate-500">{member.email || "Email non disponibile"}</span>
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
              {selectedIds.has(member.id) ? "Selezionato" : "Aggiungi"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function MessagesHub({ communicationsLocked }: MessagesHubProps) {
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const [subtab, setSubtab] = useState<Subtab>(searchParams.get("tab") === "modelli" ? "templates" : "campaigns");
  const [view, setView] = useState<ViewState>({ kind: "library" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [templates, setTemplates] = useState<OrgAdminEmailTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<OrgAdminEmailCampaign[]>([]);
  const [forms, setForms] = useState<AssociationForm[]>([]);
  const [variables, setVariables] = useState<OrgAdminEmailTemplateVariable[]>([]);
  const [assets, setAssets] = useState<OrgAdminEmailBuilderAsset[]>([]);
  const [templateFilterType, setTemplateFilterType] = useState<OrgAdminEmailTemplateType | "all">("all");
  const [templateFilterStatus, setTemplateFilterStatus] = useState<OrgAdminEmailEditorStatus | "all">("all");
  const [campaignFilterStatus, setCampaignFilterStatus] = useState<string>("all");
  const [templateStep, setTemplateStep] = useState<TemplateStep>("type");
  const [campaignStep, setCampaignStep] = useState<CampaignStep>("type");
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(() => emptyTemplateDraft());
  const [campaignDraft, setCampaignDraft] = useState<CampaignDraft>(() => emptyCampaignDraft());
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<OrgAdminEmailTemplate | null>(null);
  const [deleteCampaignTarget, setDeleteCampaignTarget] = useState<OrgAdminEmailCampaign | null>(null);
  const [testSendOpen, setTestSendOpen] = useState(false);
  const [testSendState, setTestSendState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [testSendError, setTestSendError] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<OrgAdminMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<OrgAdminMember[]>([]);
  const [audienceEstimate, setAudienceEstimate] = useState<number | null>(null);

  const templateSteps = [
    { key: "type", label: "Tipo" },
    { key: "base", label: "Base" },
    { key: "editor", label: "Editor" },
    { key: "review", label: "Salva" },
  ] as const;

  const campaignSteps = [
    { key: "type", label: "Tipo" },
    { key: "base", label: "Template" },
    { key: "editor", label: "Builder" },
    { key: "preview", label: "Preview" },
    { key: "action", label: "Invio" },
  ] as const;

  const refreshLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const [templatesRes, campaignsRes, formsRes, variablesRes, assetsRes] = await Promise.all([
        fetchOrgAdminEmailTemplates({ scope: "all", includeInactive: true }),
        fetchOrgAdminEmailCampaigns(),
        fetchOrgAdminForms(),
        fetchOrgAdminEmailTemplateVariables(),
        fetchOrgAdminCommunicationAssets(),
      ]);
      setTemplates(templatesRes.items);
      setCampaigns(campaignsRes.items);
      setForms(formsRes.items);
      setVariables(variablesRes.items);
      setAssets(assetsRes.items);
    } catch (error) {
      if (error instanceof AuthError) throw error;
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Errore caricamento comunicazioni",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    if (searchParams.get("tab") === "modelli") {
      setSubtab("templates");
      return;
    }
    if (searchParams.get("tab") === "campagne") {
      setSubtab("campaigns");
    }
  }, [searchParams]);

  useEffect(() => {
    if (loading) return;
    if (searchParams.get("mode") !== "create") return;
    const linkedFormId = searchParams.get("formId") ? Number(searchParams.get("formId")) : null;
    setSubtab("campaigns");
    setCampaignStep("type");
    setCampaignDraft(emptyCampaignDraft(Number.isFinite(linkedFormId) ? linkedFormId : null));
    setView({ kind: "campaign-builder", campaignId: null });
  }, [loading, searchParams]);

  useEffect(() => {
    if (view.kind !== "campaign-builder") return;
    if (campaignDraft.recipientMode !== "selected_members") return;
    const handle = window.setTimeout(() => {
      void searchOrgAdminCommunicationMembers({ q: memberQuery, limit: 8 })
        .then((res) => setMemberSearchResults(res.items))
        .catch(() => setMemberSearchResults([]));
    }, 220);
    return () => window.clearTimeout(handle);
  }, [campaignDraft.recipientMode, memberQuery, view.kind]);

  useEffect(() => {
    if (view.kind !== "campaign-builder") return;
    if (campaignDraft.recipientMode === "selected_members") {
      setAudienceEstimate(selectedMembers.length);
      return;
    }
    void fetchOrgAdminCommunicationAudienceEstimate(campaignDraft.audienceType)
      .then((res) => setAudienceEstimate(res.count))
      .catch(() => setAudienceEstimate(null));
  }, [campaignDraft.audienceType, campaignDraft.recipientMode, selectedMembers.length, view.kind]);

  useEffect(() => {
    if (
      view.kind === "template-builder" &&
      templateStep === "review" &&
      templateDraft.subject.trim() &&
      templateDraft.compiledHtml.trim()
    ) {
      const handle = window.setTimeout(() => {
        void refreshPreview({
          subject: templateDraft.subject,
          compiledHtml: templateDraft.compiledHtml,
          linkedFormId: templateDraft.linkedFormId,
        });
      }, 260);
      return () => window.clearTimeout(handle);
    }
    if (
      view.kind === "campaign-builder" &&
      (campaignStep === "preview" || campaignStep === "action") &&
      campaignDraft.subject.trim() &&
      campaignDraft.compiledHtml.trim()
    ) {
      const handle = window.setTimeout(() => {
        void refreshPreview({
          subject: campaignDraft.subject,
          compiledHtml: campaignDraft.compiledHtml,
          linkedFormId: campaignDraft.linkedFormId,
        });
      }, 260);
      return () => window.clearTimeout(handle);
    }
  }, [
    campaignDraft.compiledHtml,
    campaignDraft.linkedFormId,
    campaignDraft.subject,
    campaignStep,
    templateDraft.compiledHtml,
    templateDraft.linkedFormId,
    templateDraft.subject,
    templateStep,
    view.kind,
  ]);

  const templateOptions = useMemo(() => {
    return templates.filter((template) => {
      if (templateFilterType !== "all" && template.template_type !== templateFilterType) return false;
      if (templateFilterStatus !== "all" && template.editor_status !== templateFilterStatus) return false;
      return true;
    });
  }, [templateFilterStatus, templateFilterType, templates]);

  const campaignOptions = useMemo(() => {
    return campaigns.filter((campaign) => {
      if (campaignFilterStatus !== "all" && campaign.status !== campaignFilterStatus) return false;
      return true;
    });
  }, [campaignFilterStatus, campaigns]);

  const filteredBaseTemplates = useMemo(() => {
    const type = view.kind === "template-builder" ? templateDraft.templateType : campaignDraft.templateType;
    return templates.filter((template) => template.template_type === type && template.is_active);
  }, [campaignDraft.templateType, templateDraft.templateType, templates, view.kind]);

  const activeForms = useMemo(() => forms.filter((form) => form.is_active), [forms]);

  async function refreshPreview(input: { subject: string; compiledHtml: string; linkedFormId: number | null }) {
    setPreviewLoading(true);
    try {
      const res = await previewOrgAdminEmailTemplate({
        subject: input.subject,
        compiled_html: input.compiledHtml,
        linked_form_id: input.linkedFormId ?? undefined,
      });
      setPreviewState({
        subject: res.preview.subject,
        bodyHtml: res.preview.body_html,
        bodyText: res.preview.body_text,
      });
    } catch (error) {
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Errore aggiornamento preview",
      });
    } finally {
      setPreviewLoading(false);
    }
  }

  function syncTemplateSnapshot(snapshot: BuilderSnapshot) {
    setTemplateDraft((prev) => ({
      ...prev,
      compiledHtml: snapshot.compiledHtml,
      mjmlSource: snapshot.mjmlSource,
      bodyText: snapshot.bodyText,
      grapesjsProjectJson: snapshot.grapesjsProjectJson,
    }));
  }

  function syncCampaignSnapshot(snapshot: BuilderSnapshot) {
    setCampaignDraft((prev) => ({
      ...prev,
      compiledHtml: snapshot.compiledHtml,
      mjmlSource: snapshot.mjmlSource,
      bodyText: snapshot.bodyText,
      grapesjsProjectJson: snapshot.grapesjsProjectJson,
    }));
  }

  async function openTemplateBuilder(templateId: number | null) {
    setBusy("open-template");
    try {
      if (templateId == null) {
        const linkedFormId = searchParams.get("formId") ? Number(searchParams.get("formId")) : null;
        setTemplateDraft(emptyTemplateDraft(Number.isFinite(linkedFormId) ? linkedFormId : null));
        setTemplateStep("type");
      } else {
        const res = await fetchOrgAdminEmailTemplate(templateId);
        setTemplateDraft(mapTemplateToDraft(res.template));
        setTemplateStep("review");
      }
      setPreviewState(null);
      setView({ kind: "template-builder", templateId });
      setSubtab("templates");
    } catch (error) {
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Errore apertura modello",
      });
    } finally {
      setBusy(null);
    }
  }

  async function openCampaignBuilder(campaignId: number | null) {
    setBusy("open-campaign");
    try {
      if (campaignId == null) {
        const linkedFormId = searchParams.get("formId") ? Number(searchParams.get("formId")) : null;
        setCampaignDraft(emptyCampaignDraft(Number.isFinite(linkedFormId) ? linkedFormId : null));
        setCampaignStep("type");
        setSelectedMembers([]);
      } else {
        const res = await fetchOrgAdminEmailCampaign(campaignId);
        const draft = mapCampaignToDraft(res.campaign);
        setCampaignDraft(draft);
        setCampaignStep("preview");
        if (draft.recipientMode === "selected_members" && draft.memberIds.length) {
          const memberLookup = await searchOrgAdminCommunicationMembers({ limit: 25 });
          setSelectedMembers(memberLookup.items.filter((member) => draft.memberIds.includes(member.id)));
        } else {
          setSelectedMembers([]);
        }
      }
      setPreviewState(null);
      setView({ kind: "campaign-builder", campaignId });
      setSubtab("campaigns");
    } catch (error) {
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Errore apertura campagna",
      });
    } finally {
      setBusy(null);
    }
  }

  function backToLibrary() {
    setView({ kind: "library" });
    setPreviewState(null);
    setBusy(null);
  }

  function applyTemplateBase(template: OrgAdminEmailTemplate | null) {
    if (!template) {
      setTemplateDraft((prev) => ({
        ...prev,
        sourceTemplateId: null,
        builderKey: createEditorKey(),
        mjmlSource: getBuilderInitialMjml(prev.templateType),
        compiledHtml: "",
        bodyText: "",
        grapesjsProjectJson: null,
      }));
      setTemplateStep("editor");
      return;
    }
    const next = mapTemplateToDraft(template);
    setTemplateDraft((prev) => ({
      ...prev,
      sourceTemplateId: template.id,
      builderKey: createEditorKey(),
      subject: prev.subject || next.subject,
      linkedFormId: prev.linkedFormId ?? next.linkedFormId,
      compiledHtml: next.compiledHtml,
      mjmlSource: next.mjmlSource,
      bodyText: next.bodyText,
      grapesjsProjectJson: next.grapesjsProjectJson,
    }));
    setTemplateStep("editor");
  }

  function applyCampaignBase(template: OrgAdminEmailTemplate | null) {
    if (!template) {
      setCampaignDraft((prev) => ({
        ...prev,
        sourceTemplateId: null,
        builderKey: createEditorKey(),
        mjmlSource: getBuilderInitialMjml(prev.templateType),
        compiledHtml: "",
        bodyText: "",
        grapesjsProjectJson: null,
      }));
      setCampaignStep("editor");
      return;
    }
    const next = mapTemplateToDraft(template);
    setCampaignDraft((prev) => ({
      ...prev,
      sourceTemplateId: template.id,
      builderKey: createEditorKey(),
      subject: prev.subject || template.subject,
      templateType: template.template_type,
      linkedFormId: prev.linkedFormId ?? template.linked_form_id,
      compiledHtml: next.compiledHtml,
      mjmlSource: next.mjmlSource,
      bodyText: next.bodyText,
      grapesjsProjectJson: next.grapesjsProjectJson,
    }));
    setCampaignStep("editor");
  }

  async function saveTemplate(andClose = false) {
    if (communicationsLocked || !templateDraft.name.trim() || !templateDraft.subject.trim()) {
      showToast({ tone: "error", message: "Compila nome, oggetto e contenuto del modello." });
      return;
    }
    setBusy("save-template");
    try {
      const payload = {
        name: templateDraft.name.trim(),
        category: templateDraft.templateType,
        template_type: templateDraft.templateType,
        subject: templateDraft.subject.trim(),
        body_html: templateDraft.compiledHtml,
        body_text: templateDraft.bodyText,
        compiled_html: templateDraft.compiledHtml,
        mjml_source: templateDraft.mjmlSource,
        grapesjs_project_json: templateDraft.grapesjsProjectJson,
        editor_status: templateDraft.editorStatus,
        linked_form_id: templateDraft.linkedFormId,
      } as const;

      const response = templateDraft.id
        ? await updateOrgAdminEmailTemplate(templateDraft.id, payload)
        : await createOrgAdminEmailTemplate(payload);

      const saved = response.template;
      await refreshLibrary();
      setTemplateDraft(mapTemplateToDraft(saved));
      showToast({
        tone: "success",
        message: templateDraft.id ? "Modello aggiornato." : "Modello creato.",
      });
      if (andClose) {
        backToLibrary();
      }
    } catch (error) {
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Errore salvataggio modello",
      });
    } finally {
      setBusy(null);
    }
  }

  async function saveCampaign(sendAfter = false) {
    if (communicationsLocked || !campaignDraft.subject.trim()) {
      showToast({ tone: "error", message: "Compila oggetto e contenuto della campagna." });
      return;
    }
    setBusy(sendAfter ? "send-campaign" : "save-campaign");
    try {
      const memberIds =
        campaignDraft.recipientMode === "selected_members"
          ? selectedMembers.map((member) => member.id)
          : [];

      const payload = {
        name: campaignDraft.name.trim() || null,
        subject: campaignDraft.subject.trim(),
        body_html: campaignDraft.compiledHtml,
        body_text: campaignDraft.bodyText,
        compiled_html: campaignDraft.compiledHtml,
        mjml_source: campaignDraft.mjmlSource,
        grapesjs_project_json: campaignDraft.grapesjsProjectJson,
        audience_type: campaignDraft.audienceType,
        recipient_mode: campaignDraft.recipientMode,
        member_ids: memberIds,
        scheduled_at: campaignDraft.scheduledAt ? new Date(campaignDraft.scheduledAt).toISOString() : null,
        linked_form_id: campaignDraft.linkedFormId,
        source_template_id: campaignDraft.sourceTemplateId,
        editor_status: campaignDraft.editorStatus,
      } as const;

      const response = campaignDraft.id
        ? await updateOrgAdminEmailCampaign(campaignDraft.id, payload)
        : await createOrgAdminEmailCampaign(payload);

      let savedCampaign = response.campaign;
      if (sendAfter) {
        const sendRes = await sendOrgAdminEmailCampaign(savedCampaign.id);
        savedCampaign = sendRes.campaign;
        showToast({
          tone: "success",
          message: sendRes.message || "Campagna inviata correttamente.",
        });
      } else {
        showToast({
          tone: "success",
          message: campaignDraft.id ? "Campagna aggiornata." : "Bozza campagna salvata.",
        });
      }

      await refreshLibrary();
      setCampaignDraft(mapCampaignToDraft(savedCampaign));
      setView({ kind: "campaign-builder", campaignId: savedCampaign.id });
      if (sendAfter) {
        backToLibrary();
      }
    } catch (error) {
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Errore salvataggio campagna",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleDuplicateTemplate(templateId: number) {
    setBusy("duplicate-template");
    try {
      const response = await duplicateOrgAdminEmailTemplate(
        templateId,
        `${templates.find((template) => template.id === templateId)?.name || "Template"} copia`,
      );
      await refreshLibrary();
      showToast({ tone: "success", message: "Template duplicato." });
      await openTemplateBuilder(response.template.id);
    } catch (error) {
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Errore duplicazione template",
      });
    } finally {
      setBusy(null);
    }
  }

  async function confirmDeleteTemplate() {
    if (!deleteTemplateTarget) return;
    setBusy("delete-template");
    try {
      await deleteOrgAdminEmailTemplate(deleteTemplateTarget.id);
      setDeleteTemplateTarget(null);
      await refreshLibrary();
      showToast({ tone: "success", message: "Template eliminato." });
      if (view.kind === "template-builder" && templateDraft.id === deleteTemplateTarget.id) {
        backToLibrary();
      }
    } catch (error) {
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Errore eliminazione template",
      });
    } finally {
      setBusy(null);
    }
  }

  async function confirmDeleteCampaign() {
    if (!deleteCampaignTarget) return;
    setBusy("delete-campaign");
    try {
      await deleteOrgAdminEmailCampaign(deleteCampaignTarget.id);
      setDeleteCampaignTarget(null);
      await refreshLibrary();
      showToast({ tone: "success", message: "Campagna eliminata." });
      if (view.kind === "campaign-builder" && campaignDraft.id === deleteCampaignTarget.id) {
        backToLibrary();
      }
    } catch (error) {
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Errore eliminazione campagna",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleUploadAsset(file: File) {
    await uploadOrgAdminCommunicationAsset(file, file.name);
    const res = await fetchOrgAdminCommunicationAssets();
    setAssets(res.items);
  }

  async function handleDeleteAsset(assetId: number) {
    await deleteOrgAdminCommunicationAsset(assetId);
    const res = await fetchOrgAdminCommunicationAssets();
    setAssets(res.items);
  }

  async function handleTestSend(value: string) {
    if (!previewState || !campaignDraft.compiledHtml.trim()) return;
    setTestSendState("loading");
    setTestSendError(null);
    try {
      await sendOrgAdminCommunicationBuilderTestEmail({
        to_email: value,
        subject: campaignDraft.subject,
        compiled_html: campaignDraft.compiledHtml,
        body_text: campaignDraft.bodyText,
        linked_form_id: campaignDraft.linkedFormId,
        message_name: campaignDraft.name || undefined,
      });
      setTestSendState("success");
      showToast({ tone: "success", message: "Email di test inviata." });
      window.setTimeout(() => {
        setTestSendOpen(false);
        setTestSendState("idle");
      }, 500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore invio test";
      setTestSendError(message);
      setTestSendState("error");
      showToast({ tone: "error", message });
    }
  }

  function toggleSelectedMember(member: OrgAdminMember) {
    setSelectedMembers((prev) => {
      const exists = prev.some((item) => item.id === member.id);
      if (exists) return prev.filter((item) => item.id !== member.id);
      return [...prev, member];
    });
  }

  const templateDeleteModal = (
    <ConfirmModal
      open={Boolean(deleteTemplateTarget)}
      title="Eliminare il modello?"
      description="Il modello verra rimosso dalla libreria dell'organizzazione."
      confirmLabel="Elimina modello"
      tone="danger"
      confirmState={busy === "delete-template" ? "loading" : "idle"}
      onClose={() => setDeleteTemplateTarget(null)}
      onConfirm={() => void confirmDeleteTemplate()}
    />
  );

  const campaignDeleteModal = (
    <ConfirmModal
      open={Boolean(deleteCampaignTarget)}
      title="Eliminare la campagna?"
      description="La campagna verra rimossa dalla libreria dell'organizzazione."
      confirmLabel="Elimina campagna"
      tone="danger"
      confirmState={busy === "delete-campaign" ? "loading" : "idle"}
      onClose={() => setDeleteCampaignTarget(null)}
      onConfirm={() => void confirmDeleteCampaign()}
    />
  );

  const testSendModal = (
    <PromptModal
      open={testSendOpen}
      title="Invia email di test"
      description="Usa un indirizzo reale per verificare layout, merge tag e CTA prima dell'invio."
      label="Email destinatario"
      placeholder="nome@example.com"
      confirmLabel="Invia test"
      confirmState={testSendState}
      error={testSendError}
      onClose={() => {
        setTestSendOpen(false);
        setTestSendState("idle");
        setTestSendError(null);
      }}
      onConfirm={(value) => void handleTestSend(value)}
    />
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-full rounded-[1.5rem]" />
        <Skeleton className="h-[780px] w-full rounded-[2rem]" />
      </div>
    );
  }

  if (view.kind === "template-builder") {
    return (
      <>
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button className="btn-secondary" type="button" onClick={backToLibrary}>
              Torna alla libreria
            </button>
            <div className="flex flex-wrap gap-3">
              {!templateDraft.isSystem && templateDraft.id ? (
                <button className="btn-ghost" type="button" onClick={() => templateDraft.id && void handleDuplicateTemplate(templateDraft.id)}>
                  Duplica
                </button>
              ) : null}
              {!templateDraft.isSystem && templateDraft.id ? (
                <button className="btn-ghost text-red-600" type="button" onClick={() => setDeleteTemplateTarget(templateDraft.id ? templates.find((item) => item.id === templateDraft.id) || null : null)}>
                  Elimina
                </button>
              ) : null}
            </div>
          </div>

          <WizardHero
            eyebrow="Comunicazioni / Modelli"
            title={templateDraft.id ? "Rifinisci il modello" : "Crea un modello guidato"}
            description="Scegli il tipo, parti da una base sensata, lavora nel builder centrale e salva un template davvero riusabile."
            steps={templateSteps.map((step) => ({ key: step.key, label: step.label }))}
            activeStep={templateStep}
          />

          {templateStep === "type" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
              <section className={`${panelClass} space-y-6`}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7a6647]">Step 1</p>
                  <h3 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Contesto del modello</h3>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className={`${labelClass} md:col-span-2`}>
                    Nome modello
                    <input className={inputClass} value={templateDraft.name} onChange={(event) => setTemplateDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Es. Invito assemblea soci" />
                  </label>
                  <label className={`${labelClass} md:col-span-2`}>
                    Oggetto email
                    <input className={inputClass} value={templateDraft.subject} onChange={(event) => setTemplateDraft((prev) => ({ ...prev, subject: event.target.value }))} placeholder="Es. Ti aspettiamo alla prossima assemblea" />
                  </label>
                  <label className={labelClass}>
                    Stato editoriale
                    <select className={inputClass} value={templateDraft.editorStatus} onChange={(event) => setTemplateDraft((prev) => ({ ...prev, editorStatus: event.target.value as OrgAdminEmailEditorStatus }))}>
                      {TEMPLATE_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClass}>
                    Form collegato
                    <select className={inputClass} value={templateDraft.linkedFormId ?? ""} onChange={(event) => setTemplateDraft((prev) => ({ ...prev, linkedFormId: event.target.value ? Number(event.target.value) : null }))}>
                      <option value="">Nessun form</option>
                      {activeForms.map((form) => (
                        <option key={form.id} value={form.id}>{form.title}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {TEMPLATE_TYPE_OPTIONS.map((option) => (
                    <button key={option.value} type="button" className={`rounded-[1.25rem] border p-4 text-left transition ${templateDraft.templateType === option.value ? "border-[#17494a] bg-[#eef7f7]" : "border-[#e4dccd] bg-[#fbfaf6] hover:border-[#cdbca2]"}`} onClick={() => setTemplateDraft((prev) => ({ ...prev, templateType: option.value }))}>
                      <span className="text-sm font-semibold text-slate-950">{option.label}</span>
                      <span className="mt-2 block text-sm leading-6 text-slate-500">{option.description}</span>
                    </button>
                  ))}
                </div>
              </section>
              <aside className={`${panelClass} space-y-4`}>
                <div className={subtlePanelClass}>
                  <p className="text-sm font-semibold text-slate-900">Un modello, un compito</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Reminder, invito evento e conferma prenotazione devono partire da strutture diverse. Qui stai impostando quella grammatica.
                  </p>
                </div>
              </aside>
            </div>
          ) : null}

          {templateStep === "base" ? (
            <section className={`${panelClass} space-y-6`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7a6647]">Step 2</p>
                  <h3 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Base di partenza</h3>
                </div>
                <button className="btn-secondary" type="button" onClick={() => applyTemplateBase(null)}>
                  Parti da base vuota
                </button>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredBaseTemplates.map((template) => (
                  <button key={template.id} type="button" className="rounded-[1.3rem] border border-[#e5dccd] bg-[#fbfaf6] p-5 text-left transition hover:border-[#c8b79d] hover:bg-white" onClick={() => applyTemplateBase(template)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <TemplateTypeBadge value={template.template_type} />
                      <StatusBadge value={template.editor_status} />
                    </div>
                    <h4 className="mt-4 text-lg font-semibold text-slate-950">{template.name}</h4>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{template.subject}</p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {templateStep === "editor" ? (
            <GrapesEmailBuilder
              editorKey={templateDraft.builderKey}
              initialMjmlSource={templateDraft.mjmlSource}
              initialProjectData={templateDraft.grapesjsProjectJson}
              assets={assets}
              variables={variables}
              disabled={templateDraft.isSystem}
              onChange={syncTemplateSnapshot}
              onUploadAsset={handleUploadAsset}
              onDeleteAsset={handleDeleteAsset}
            />
          ) : null}

          {templateStep === "review" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_360px]">
              <section className={`${panelClass} space-y-5`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7a6647]">Step 4</p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Preview e salvataggio</h3>
                  </div>
                  <div className="inline-flex rounded-full border border-[#ddd5c6] bg-[#fbfaf6] p-1">
                    <button className={previewDevice === "desktop" ? "builder-device builder-device--active" : "builder-device"} type="button" onClick={() => setPreviewDevice("desktop")}>Desktop</button>
                    <button className={previewDevice === "mobile" ? "builder-device builder-device--active" : "builder-device"} type="button" onClick={() => setPreviewDevice("mobile")}>Mobile</button>
                  </div>
                </div>
                {previewLoading ? <Skeleton className="h-[720px] w-full rounded-[1.5rem]" /> : <PreviewFrame html={previewState?.bodyHtml} device={previewDevice} emptyMessage="Completa oggetto e builder per vedere la preview reale." />}
              </section>
              <aside className={`${panelClass} space-y-4`}>
                <div className={subtlePanelClass}>
                  <p className="text-lg font-semibold text-slate-950">{templateDraft.name || "Nuovo modello"}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{templateDraft.subject || "Oggetto non impostato"}</p>
                </div>
                <div className={subtlePanelClass}>
                  <div className="flex flex-wrap gap-2">
                    <TemplateTypeBadge value={templateDraft.templateType} />
                    <StatusBadge value={templateDraft.editorStatus} />
                  </div>
                </div>
                <button className="btn-primary w-full" type="button" disabled={communicationsLocked || templateDraft.isSystem || busy === "save-template"} onClick={() => void saveTemplate(false)}>
                  {busy === "save-template" ? "Salvataggio..." : templateDraft.id ? "Salva modifiche" : "Crea modello"}
                </button>
                <button className="btn-secondary w-full" type="button" disabled={communicationsLocked || templateDraft.isSystem || busy === "save-template"} onClick={() => void saveTemplate(true)}>
                  Salva e torna alla libreria
                </button>
                {templateDraft.isSystem ? (
                  <button className="btn-secondary w-full" type="button" onClick={() => templateDraft.id && void handleDuplicateTemplate(templateDraft.id)}>
                    Duplica questo modello
                  </button>
                ) : null}
              </aside>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-between gap-3">
            <button className="btn-secondary" type="button" disabled={templateStep === "type"} onClick={() => setTemplateStep(templateSteps[Math.max(0, templateSteps.findIndex((step) => step.key === templateStep) - 1)].key)}>
              Indietro
            </button>
            {templateStep !== "review" ? (
              <button className="btn-primary" type="button" onClick={() => setTemplateStep(templateSteps[Math.min(templateSteps.length - 1, templateSteps.findIndex((step) => step.key === templateStep) + 1)].key)}>
                Avanti
              </button>
            ) : null}
          </div>
        </div>
        {templateDeleteModal}
      </>
    );
  }

  if (view.kind === "campaign-builder") {
    return (
      <>
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button className="btn-secondary" type="button" onClick={backToLibrary}>
              Torna alla libreria
            </button>
            <div className="flex flex-wrap gap-3">
              {campaignDraft.id ? (
                <button
                  className="btn-ghost text-red-600"
                  type="button"
                  onClick={() => setDeleteCampaignTarget(campaigns.find((item) => item.id === campaignDraft.id) || null)}
                >
                  Elimina
                </button>
              ) : null}
              <button className="btn-ghost" type="button" disabled={!campaignDraft.compiledHtml.trim()} onClick={() => setTestSendOpen(true)}>
                Invia test
              </button>
              <button className="btn-primary" type="button" disabled={communicationsLocked || busy === "save-campaign"} onClick={() => void saveCampaign(false)}>
                Salva bozza
              </button>
            </div>
          </div>

          <WizardHero
            eyebrow="Comunicazioni / Campagne"
            title={campaignDraft.id ? "Rifinisci la campagna" : "Nuova campagna guidata"}
            description="Il flusso campagne torna ordinato: tipo messaggio, template di partenza, builder centrale, preview e azioni finali."
            steps={campaignSteps.map((step) => ({ key: step.key, label: step.label }))}
            activeStep={campaignStep}
          />
          {campaignStep === "type" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
              <section className={`${panelClass} space-y-6`}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className={`${labelClass} md:col-span-2`}>
                    Nome interno campagna
                    <input className={inputClass} value={campaignDraft.name} onChange={(event) => setCampaignDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Es. Reminder rinnovo aprile" />
                  </label>
                  <label className={`${labelClass} md:col-span-2`}>
                    Oggetto email
                    <input className={inputClass} value={campaignDraft.subject} onChange={(event) => setCampaignDraft((prev) => ({ ...prev, subject: event.target.value }))} placeholder="Es. Ti ricordiamo il rinnovo quota" />
                  </label>
                  <label className={labelClass}>
                    Form collegato
                    <select className={inputClass} value={campaignDraft.linkedFormId ?? ""} onChange={(event) => setCampaignDraft((prev) => ({ ...prev, linkedFormId: event.target.value ? Number(event.target.value) : null }))}>
                      <option value="">Nessun form</option>
                      {activeForms.map((form) => (
                        <option key={form.id} value={form.id}>{form.title}</option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClass}>
                    Programmazione
                    <input type="datetime-local" className={inputClass} value={campaignDraft.scheduledAt} onChange={(event) => setCampaignDraft((prev) => ({ ...prev, scheduledAt: event.target.value }))} />
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {TEMPLATE_TYPE_OPTIONS.map((option) => (
                    <button key={option.value} type="button" className={`rounded-[1.25rem] border p-4 text-left transition ${campaignDraft.templateType === option.value ? "border-[#17494a] bg-[#eef7f7]" : "border-[#e4dccd] bg-[#fbfaf6] hover:border-[#cdbca2]"}`} onClick={() => setCampaignDraft((prev) => ({ ...prev, templateType: option.value }))}>
                      <span className="text-sm font-semibold text-slate-950">{option.label}</span>
                      <span className="mt-2 block text-sm leading-6 text-slate-500">{option.description}</span>
                    </button>
                  ))}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {CAMPAIGN_AUDIENCE_OPTIONS.map((option) => (
                    <button key={option.value} type="button" className={`rounded-[1.2rem] border p-4 text-left transition ${campaignDraft.audienceType === option.value ? "border-[#17494a] bg-[#eef7f7]" : "border-[#e4dccd] bg-white hover:border-[#cdbca2]"}`} onClick={() => setCampaignDraft((prev) => ({ ...prev, audienceType: option.value }))}>
                      <span className="text-sm font-semibold text-slate-950">{option.label}</span>
                      <span className="mt-2 block text-sm leading-6 text-slate-500">{option.description}</span>
                    </button>
                  ))}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {CAMPAIGN_RECIPIENT_MODE_OPTIONS.map((option) => (
                    <button key={option.value} type="button" className={`rounded-[1.2rem] border p-4 text-left transition ${campaignDraft.recipientMode === option.value ? "border-[#17494a] bg-[#eef7f7]" : "border-[#e4dccd] bg-white hover:border-[#cdbca2]"}`} onClick={() => setCampaignDraft((prev) => ({ ...prev, recipientMode: option.value }))}>
                      <span className="text-sm font-semibold text-slate-950">{option.label}</span>
                    </button>
                  ))}
                </div>
              </section>
              <aside className={`${panelClass} space-y-4`}>
                <div className={subtlePanelClass}>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7a6647]">Stima audience</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-950">{audienceEstimate ?? "-"}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {campaignDraft.recipientMode === "selected_members" ? "Conteggio basato sui soci selezionati." : "Stima calcolata sul segmento scelto."}
                  </p>
                </div>
              </aside>
            </div>
          ) : null}

          {campaignStep === "base" ? (
            <section className={`${panelClass} space-y-6`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7a6647]">Step 2</p>
                  <h3 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Template di partenza</h3>
                </div>
                <button className="btn-secondary" type="button" onClick={() => applyCampaignBase(null)}>
                  Base vuota guidata
                </button>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredBaseTemplates.map((template) => (
                  <button key={template.id} type="button" className="rounded-[1.3rem] border border-[#e5dccd] bg-[#fbfaf6] p-5 text-left transition hover:border-[#c8b79d] hover:bg-white" onClick={() => applyCampaignBase(template)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <TemplateTypeBadge value={template.template_type} />
                      <StatusBadge value={template.editor_status} />
                    </div>
                    <h4 className="mt-4 text-lg font-semibold text-slate-950">{template.name}</h4>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{template.subject}</p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {campaignStep === "editor" ? (
            <div className="space-y-6">
              <GrapesEmailBuilder
                editorKey={campaignDraft.builderKey}
                initialMjmlSource={campaignDraft.mjmlSource}
                initialProjectData={campaignDraft.grapesjsProjectJson}
                assets={assets}
                variables={variables}
                onChange={syncCampaignSnapshot}
                onUploadAsset={handleUploadAsset}
                onDeleteAsset={handleDeleteAsset}
              />
              {campaignDraft.recipientMode === "selected_members" ? (
                <MemberPicker selectedMembers={selectedMembers} results={memberSearchResults} query={memberQuery} onQueryChange={setMemberQuery} onToggle={toggleSelectedMember} />
              ) : null}
            </div>
          ) : null}

          {campaignStep === "preview" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_360px]">
              <section className={`${panelClass} space-y-5`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7a6647]">Step 4</p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Preview desktop e mobile</h3>
                  </div>
                  <div className="inline-flex rounded-full border border-[#ddd5c6] bg-[#fbfaf6] p-1">
                    <button className={previewDevice === "desktop" ? "builder-device builder-device--active" : "builder-device"} type="button" onClick={() => setPreviewDevice("desktop")}>Desktop</button>
                    <button className={previewDevice === "mobile" ? "builder-device builder-device--active" : "builder-device"} type="button" onClick={() => setPreviewDevice("mobile")}>Mobile</button>
                  </div>
                </div>
                {previewLoading ? <Skeleton className="h-[720px] w-full rounded-[1.5rem]" /> : <PreviewFrame html={previewState?.bodyHtml} device={previewDevice} emptyMessage="Completa il builder per vedere la preview reale." />}
              </section>
              <aside className={`${panelClass} space-y-4`}>
                <div className={subtlePanelClass}>
                  <p className="text-lg font-semibold text-slate-950">{campaignDraft.name || "Nuova campagna"}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{campaignDraft.subject || "Oggetto non impostato"}</p>
                </div>
                <div className={subtlePanelClass}>
                  <div className="flex flex-wrap gap-2">
                    <TemplateTypeBadge value={campaignDraft.templateType} />
                    <StatusBadge value={campaignDraft.status || campaignDraft.editorStatus} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-500">Audience: {getCampaignAudienceLabel(campaignDraft.audienceType)} · destinatari stimati {audienceEstimate ?? "-"}</p>
                </div>
                <button className="btn-secondary w-full" type="button" onClick={() => setTestSendOpen(true)} disabled={!campaignDraft.compiledHtml.trim()}>
                  Invia email di test
                </button>
              </aside>
            </div>
          ) : null}

          {campaignStep === "action" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
              <section className={`${panelClass} space-y-4`}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className={subtlePanelClass}>
                    <p className="text-sm font-semibold text-slate-900">Bozza pronta</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Salva la campagna e torna in libreria.</p>
                    <button className="btn-primary mt-4 w-full" type="button" disabled={communicationsLocked || busy === "save-campaign"} onClick={() => void saveCampaign(false)}>
                      {busy === "save-campaign" ? "Salvataggio..." : "Salva bozza"}
                    </button>
                  </div>
                  <div className={subtlePanelClass}>
                    <p className="text-sm font-semibold text-slate-900">Invio immediato</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Salva e avvia l'invio verso il segmento selezionato.</p>
                    <button className="btn-primary mt-4 w-full" type="button" disabled={communicationsLocked || busy === "send-campaign"} onClick={() => void saveCampaign(true)}>
                      {busy === "send-campaign" ? "Invio..." : "Salva e invia"}
                    </button>
                  </div>
                </div>
              </section>
              <aside className={`${panelClass} space-y-4`}>
                <PreviewFrame html={previewState?.bodyHtml} device="mobile" emptyMessage="La mini preview finale compare qui dopo il render." />
              </aside>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-between gap-3">
            <button className="btn-secondary" type="button" disabled={campaignStep === "type"} onClick={() => setCampaignStep(campaignSteps[Math.max(0, campaignSteps.findIndex((step) => step.key === campaignStep) - 1)].key)}>
              Indietro
            </button>
            {campaignStep !== "action" ? (
              <button className="btn-primary" type="button" onClick={() => setCampaignStep(campaignSteps[Math.min(campaignSteps.length - 1, campaignSteps.findIndex((step) => step.key === campaignStep) + 1)].key)}>
                Avanti
              </button>
            ) : null}
          </div>
        </div>
        {testSendModal}
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap justify-end gap-3">
          <div className="inline-flex rounded-[1rem] border border-[#ddd4c3] bg-[#f6f2e8] p-1">
            <button
              className={`rounded-[0.8rem] px-4 py-2 text-sm font-semibold transition ${
                subtab === "campaigns" ? "bg-[#17494a] text-white shadow-sm" : "text-[#31484a] hover:bg-white"
              }`}
              type="button"
              onClick={() => setSubtab("campaigns")}
            >
              Campagne
            </button>
            <button
              className={`rounded-[0.8rem] px-4 py-2 text-sm font-semibold transition ${
                subtab === "templates" ? "bg-[#17494a] text-white shadow-sm" : "text-[#31484a] hover:bg-white"
              }`}
              type="button"
              onClick={() => setSubtab("templates")}
            >
              Modelli
            </button>
          </div>
        </div>

        {subtab === "templates" ? (
          <section className={`${panelClass} space-y-5`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7a6647]">Libreria modelli</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Template riusabili dell'organizzazione</h3>
              </div>
              <button className="btn-primary" type="button" disabled={communicationsLocked} onClick={() => void openTemplateBuilder(null)}>
                Nuovo modello
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className={labelClass}>
                Tipo
                <select className={inputClass} value={templateFilterType} onChange={(event) => setTemplateFilterType(event.target.value as OrgAdminEmailTemplateType | "all")}>
                  <option value="all">Tutti i tipi</option>
                  {TEMPLATE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Stato
                <select className={inputClass} value={templateFilterStatus} onChange={(event) => setTemplateFilterStatus(event.target.value as OrgAdminEmailEditorStatus | "all")}>
                  <option value="all">Tutti gli stati</option>
                  {TEMPLATE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <div className={`${subtlePanelClass} flex items-center justify-between`}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7a6647]">Totale</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{templateOptions.length}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-4">
              {templateOptions.map((template) => (
                <div key={template.id} className="rounded-[1.3rem] border border-[#e5dccd] bg-[#fbfaf6] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-2xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <TemplateTypeBadge value={template.template_type} />
                        <StatusBadge value={template.editor_status} />
                        <span className="inline-flex rounded-full border border-[#dfd6c7] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          {template.is_system ? "Sistema" : "Org"}
                        </span>
                      </div>
                      <h4 className="mt-4 text-lg font-semibold text-slate-950">{template.name}</h4>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{template.subject}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary" type="button" onClick={() => void openTemplateBuilder(template.id)}>Apri</button>
                      <button className="btn-ghost" type="button" onClick={() => void handleDuplicateTemplate(template.id)}>Duplica</button>
                      {!template.is_system ? <button className="btn-ghost text-red-600" type="button" onClick={() => setDeleteTemplateTarget(template)}>Elimina</button> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {subtab === "campaigns" ? (
          <section className={`${panelClass} space-y-5`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7a6647]">Campagne</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Bozze, invii e revisioni</h3>
              </div>
              <button className="btn-primary" type="button" disabled={communicationsLocked} onClick={() => void openCampaignBuilder(null)}>
                Nuova campagna
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className={subtlePanelClass}>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7a6647]">Stato invii</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">Riapri una bozza, controlla un invio programmato o verifica una campagna gia spedita.</p>
              </div>
              <label className={labelClass}>
                Filtro stato
                <select className={inputClass} value={campaignFilterStatus} onChange={(event) => setCampaignFilterStatus(event.target.value)}>
                  <option value="all">Tutti</option>
                  <option value="draft">Bozza</option>
                  <option value="scheduled">Programmato</option>
                  <option value="sent">Inviato</option>
                  <option value="failed">Fallito</option>
                </select>
              </label>
            </div>
            <div className="grid gap-4">
              {campaignOptions.map((campaign) => (
                <div key={campaign.id} className="rounded-[1.3rem] border border-[#e5dccd] bg-[#fbfaf6] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-2xl">
                      <div className="flex flex-wrap items-center gap-2">
                        {campaign.source_template?.template_type ? <TemplateTypeBadge value={campaign.source_template.template_type} /> : null}
                        <StatusBadge value={campaign.status} />
                      </div>
                      <h4 className="mt-4 text-lg font-semibold text-slate-950">{campaign.name || "Campagna senza nome"}</h4>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{campaign.subject}</p>
                      <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{getCampaignAudienceLabel(campaign.audience_type)} · {campaign.planned_recipient_count} destinatari</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary" type="button" onClick={() => void openCampaignBuilder(campaign.id)}>Apri</button>
                      {campaign.status === "draft" ? <button className="btn-primary" type="button" onClick={() => void openCampaignBuilder(campaign.id).then(() => setCampaignStep("action"))}>Invia</button> : null}
                      <button className="btn-ghost text-red-600" type="button" onClick={() => setDeleteCampaignTarget(campaign)}>Elimina</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      {templateDeleteModal}
      {campaignDeleteModal}
      {testSendModal}
    </>
  );
}
