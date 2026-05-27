import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import ConfirmModal from "../../../../components/ui/ConfirmModal";
import PromptModal from "../../../../components/ui/PromptModal";
import Skeleton from "../../../../components/ui/Skeleton";
import { useToast } from "../../../../components/ui/ToastProvider";
import { useUnsavedChangesGuard } from "../../../../components/ui/UnsavedChangesProvider";
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
import { GrapesEmailBuilder, type GrapesEmailBuilderHandle } from "./GrapesEmailBuilder";
import { KpiCard, SectionPanel, StatusChip, Stepper } from "../OrgAdminPrimitives";
import {
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

type MessagesHubProps = {
  communicationsLocked: boolean;
  forcedSubtab?: Subtab | null;
  hideSubtabNav?: boolean;
};
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
  "mt-2 w-full rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#17494a] focus:ring-4 focus:ring-[#17494a]/10";
const labelClass = "block text-sm font-semibold text-slate-900";
const panelClass = "rounded-lg border border-neutral-200 bg-white p-4 shadow-none md:p-5";
const subtlePanelClass = "rounded-lg border border-neutral-200 bg-neutral-50 p-4";

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

function serializeTemplateDraft(draft: TemplateDraft) {
  return JSON.stringify({
    id: draft.id,
    sourceTemplateId: draft.sourceTemplateId,
    name: draft.name,
    subject: draft.subject,
    templateType: draft.templateType,
    linkedFormId: draft.linkedFormId,
    editorStatus: draft.editorStatus,
    isSystem: draft.isSystem,
    isActive: draft.isActive,
    compiledHtml: draft.compiledHtml,
    mjmlSource: draft.mjmlSource,
    bodyText: draft.bodyText,
    grapesjsProjectJson: draft.grapesjsProjectJson,
  });
}

function serializeCampaignDraft(draft: CampaignDraft, selectedMembers: OrgAdminMember[]) {
  const selectedMemberIds =
    draft.recipientMode === "selected_members"
      ? selectedMembers.map((member) => member.id).sort((left, right) => left - right)
      : [];
  return JSON.stringify({
    id: draft.id,
    sourceTemplateId: draft.sourceTemplateId,
    name: draft.name,
    subject: draft.subject,
    templateType: draft.templateType,
    linkedFormId: draft.linkedFormId,
    audienceType: draft.audienceType,
    recipientMode: draft.recipientMode,
    scheduledAt: draft.scheduledAt,
    editorStatus: draft.editorStatus,
    compiledHtml: draft.compiledHtml,
    mjmlSource: draft.mjmlSource,
    bodyText: draft.bodyText,
    grapesjsProjectJson: draft.grapesjsProjectJson,
    status: draft.status,
    memberIds: selectedMemberIds,
  });
}

function templateDraftHasMeaningfulContent(draft: TemplateDraft) {
  return Boolean(
    draft.name.trim()
      || draft.subject.trim()
      || draft.compiledHtml.trim()
      || draft.bodyText.trim()
      || draft.grapesjsProjectJson
      || draft.sourceTemplateId
      || draft.linkedFormId,
  );
}

function campaignDraftHasMeaningfulContent(draft: CampaignDraft, selectedMembers: OrgAdminMember[]) {
  return Boolean(
    draft.name.trim()
      || draft.subject.trim()
      || draft.compiledHtml.trim()
      || draft.bodyText.trim()
      || draft.grapesjsProjectJson
      || draft.sourceTemplateId
      || draft.linkedFormId
      || draft.scheduledAt
      || selectedMembers.length > 0,
  );
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

function CampaignTypeIcon({ value }: { value: OrgAdminEmailTemplateType }) {
  const icon =
    value === "event"
      ? "▣"
      : value === "renewal_reminder"
        ? "↻"
        : value === "booking_confirmation"
          ? "✓"
          : value === "generic_notice"
            ? "↗"
            : "✉";
  return <span className="text-lg">{icon}</span>;
}

function CampaignSummaryPanel({
  draft,
  audienceEstimate,
  selectedTemplateName,
  activeForms,
  onSave,
  onContinue,
  busy,
  disabled,
}: {
  draft: CampaignDraft;
  audienceEstimate: number | null;
  selectedTemplateName: string;
  activeForms: AssociationForm[];
  onSave: () => void;
  onContinue: () => void;
  busy: string | null;
  disabled: boolean;
}) {
  const linkedForm = activeForms.find((form) => form.id === draft.linkedFormId);
  return (
    <aside className="org-detail-panel sticky top-6 space-y-4">
      <div className="org-detail-panel__header">
        <div>
          <p className="org-eyebrow">Riepilogo campagna</p>
          <h3 className="org-detail-panel__title">{draft.name || "Nuova campagna"}</h3>
        </div>
        <StatusChip tone="warning">Bozza</StatusChip>
      </div>

      <KpiCard
        label="Stima destinatari"
        value={audienceEstimate ?? "-"}
        hint={draft.recipientMode === "selected_members" ? "Soci selezionati manualmente" : "Calcolata sul segmento scelto"}
        tone="success"
        icon="◎"
      />

      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        <div className="grid grid-cols-[2.4rem_minmax(0,1fr)] gap-3 p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-[#0f5e5d]">
            <CampaignTypeIcon value={draft.templateType} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">{getTemplateTypeLabel(draft.templateType)}</p>
            <p className="mt-0.5 text-xs text-slate-500">Tipo campagna</p>
          </div>
        </div>
        <div className="grid grid-cols-[2.4rem_minmax(0,1fr)] gap-3 p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700">▤</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">{selectedTemplateName}</p>
            <p className="mt-0.5 text-xs text-slate-500">Template selezionato</p>
          </div>
        </div>
        <div className="grid grid-cols-[2.4rem_minmax(0,1fr)] gap-3 p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">◴</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">{draft.scheduledAt ? "Programmata" : "Invio ora"}</p>
            <p className="mt-0.5 text-xs text-slate-500">{draft.scheduledAt || "La campagna verrà inviata manualmente."}</p>
          </div>
        </div>
        <div className="grid grid-cols-[2.4rem_minmax(0,1fr)] gap-3 p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-slate-600">▣</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">{linkedForm?.title || "Nessun form collegato"}</p>
            <p className="mt-0.5 text-xs text-slate-500">Form collegato</p>
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        <button className="btn-secondary w-full" type="button" disabled={disabled || busy === "save-campaign"} onClick={onSave}>
          {busy === "save-campaign" ? "Salvataggio..." : "Salva bozza"}
        </button>
        <button className="btn-primary w-full" type="button" onClick={onContinue}>
          Continua →
        </button>
      </div>
      <p className="text-center text-xs font-medium text-slate-500">Le modifiche restano nel wizard finche non salvi la bozza.</p>
    </aside>
  );
}

function WizardHero({
  eyebrow,
  title,
  description,
  steps,
  activeStep,
  onStepSelect,
}: {
  eyebrow: string;
  title: string;
  description: string;
  steps: Array<{ key: string; label: string }>;
  activeStep: string;
  onStepSelect?: (stepKey: string) => void;
}) {
  const activeIndex = Math.max(0, steps.findIndex((step) => step.key === activeStep));

  return (
    <section className="rounded-[1.6rem] border border-[#ddd4c3] bg-[#fbfaf6] px-4 py-5 md:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#7a6647]">{eyebrow}</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-slate-950 md:text-[2rem]">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500 md:text-[15px]">{description}</p>
        </div>
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
                <button
                  key={step.key}
                  type="button"
                  className="flex flex-col items-center text-center"
                  onClick={() => onStepSelect?.(step.key)}
                  disabled={!onStepSelect}
                >
                  <div
                    className={`relative z-[1] flex h-12 w-12 items-center justify-center rounded-full border text-base font-semibold transition ${
                      active || complete
                        ? "border-[#17494a] bg-[#17494a] text-white shadow-[0_16px_30px_rgba(23,73,74,0.18)]"
                        : "border-[#ded6c8] bg-white text-slate-400"
                    } ${onStepSelect ? "hover:-translate-y-0.5 hover:border-[#17494a] hover:text-[#17494a]" : ""}`}
                  >
                    {index + 1}
                  </div>
                  <p className={`mt-3 text-sm font-semibold transition ${active || complete ? "text-slate-900" : "text-slate-400"} ${onStepSelect ? "hover:text-slate-900" : ""}`}>
                    {step.label}
                  </p>
                </button>
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

function formatLibraryDate(value: string | null | undefined): string {
  if (!value) return "non disponibile";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessagesHub({
  communicationsLocked,
  forcedSubtab = null,
  hideSubtabNav = false,
}: MessagesHubProps) {
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const [subtab, setSubtab] = useState<Subtab>(() => {
    if (forcedSubtab) return forcedSubtab;
    return searchParams.get("tab") === "modelli" ? "templates" : "campaigns";
  });
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
  const [templateSavedSnapshot, setTemplateSavedSnapshot] = useState(() => serializeTemplateDraft(emptyTemplateDraft()));
  const [campaignSavedSnapshot, setCampaignSavedSnapshot] = useState(() => serializeCampaignDraft(emptyCampaignDraft(), []));
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
  const templateBuilderRef = useRef<GrapesEmailBuilderHandle | null>(null);
  const campaignBuilderRef = useRef<GrapesEmailBuilderHandle | null>(null);

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
    if (forcedSubtab) {
      setSubtab(forcedSubtab);
      return;
    }
  }, [forcedSubtab]);

  useEffect(() => {
    if (forcedSubtab) return;
    if (searchParams.get("tab") === "modelli") {
      setSubtab("templates");
      return;
    }
    if (searchParams.get("tab") === "campagne") {
      setSubtab("campaigns");
    }
  }, [forcedSubtab, searchParams]);

  useEffect(() => {
    if (loading) return;
    if (searchParams.get("mode") !== "create") return;
    const linkedFormId = searchParams.get("formId") ? Number(searchParams.get("formId")) : null;
    const nextDraft = emptyCampaignDraft(Number.isFinite(linkedFormId) ? linkedFormId : null);
    setSubtab(forcedSubtab ?? "campaigns");
    setCampaignStep("type");
    setCampaignDraft(nextDraft);
    setCampaignSavedSnapshot(serializeCampaignDraft(nextDraft, []));
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
  const selectedCampaignTemplateName = useMemo(() => {
    if (!campaignDraft.sourceTemplateId) return "Base vuota guidata";
    return templates.find((template) => template.id === campaignDraft.sourceTemplateId)?.name || "Template selezionato";
  }, [campaignDraft.sourceTemplateId, templates]);
  const hasUnsavedMessagesBuilderChanges = useMemo(() => {
    if (loading || busy) return false;
    if (view.kind === "template-builder") {
      if (templateDraft.isSystem) return false;
      if (templateDraft.id) return serializeTemplateDraft(templateDraft) !== templateSavedSnapshot;
      return templateDraftHasMeaningfulContent(templateDraft);
    }
    if (view.kind === "campaign-builder") {
      if (campaignDraft.id) return serializeCampaignDraft(campaignDraft, selectedMembers) !== campaignSavedSnapshot;
      return campaignDraftHasMeaningfulContent(campaignDraft, selectedMembers);
    }
    return false;
  }, [busy, campaignDraft, campaignSavedSnapshot, loading, selectedMembers, templateDraft, templateSavedSnapshot, view.kind]);

  useUnsavedChangesGuard({
    when: hasUnsavedMessagesBuilderChanges,
    title: view.kind === "template-builder" ? "Modello non salvato" : "Campagna non salvata",
    message:
      view.kind === "template-builder"
        ? "Hai modifiche al modello email non ancora salvate. Se esci ora, le perderai."
        : "Hai modifiche alla campagna non ancora salvate. Se esci ora, le perderai.",
  });

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

  function flushTemplateBuilderSnapshot() {
    const snapshot = templateBuilderRef.current?.flush();
    if (!snapshot) return templateDraft;
    const nextDraft = {
      ...templateDraft,
      compiledHtml: snapshot.compiledHtml,
      mjmlSource: snapshot.mjmlSource,
      bodyText: snapshot.bodyText,
      grapesjsProjectJson: snapshot.grapesjsProjectJson,
    };
    setTemplateDraft(nextDraft);
    return nextDraft;
  }

  function flushCampaignBuilderSnapshot() {
    const snapshot = campaignBuilderRef.current?.flush();
    if (!snapshot) return campaignDraft;
    const nextDraft = {
      ...campaignDraft,
      compiledHtml: snapshot.compiledHtml,
      mjmlSource: snapshot.mjmlSource,
      bodyText: snapshot.bodyText,
      grapesjsProjectJson: snapshot.grapesjsProjectJson,
    };
    setCampaignDraft(nextDraft);
    return nextDraft;
  }

  async function openTemplateBuilder(templateId: number | null) {
    setBusy("open-template");
    try {
      if (templateId == null) {
        const linkedFormId = searchParams.get("formId") ? Number(searchParams.get("formId")) : null;
        const draft = emptyTemplateDraft(Number.isFinite(linkedFormId) ? linkedFormId : null);
        setTemplateDraft(draft);
        setTemplateSavedSnapshot(serializeTemplateDraft(draft));
        setTemplateStep("type");
      } else {
        const res = await fetchOrgAdminEmailTemplate(templateId);
        const draft = mapTemplateToDraft(res.template);
        setTemplateDraft(draft);
        setTemplateSavedSnapshot(serializeTemplateDraft(draft));
        setTemplateStep("review");
      }
      setPreviewState(null);
      setView({ kind: "template-builder", templateId });
      setSubtab(forcedSubtab ?? "templates");
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
        const draft = emptyCampaignDraft(Number.isFinite(linkedFormId) ? linkedFormId : null);
        setCampaignDraft(draft);
        setCampaignSavedSnapshot(serializeCampaignDraft(draft, []));
        setCampaignStep("type");
        setSelectedMembers([]);
      } else {
        const res = await fetchOrgAdminEmailCampaign(campaignId);
        const draft = mapCampaignToDraft(res.campaign);
        setCampaignDraft(draft);
        setCampaignStep("preview");
        if (draft.recipientMode === "selected_members" && draft.memberIds.length) {
          const memberLookup = await searchOrgAdminCommunicationMembers({ limit: 25 });
          const members = memberLookup.items.filter((member) => draft.memberIds.includes(member.id));
          setSelectedMembers(members);
          setCampaignSavedSnapshot(serializeCampaignDraft(draft, members));
        } else {
          setSelectedMembers([]);
          setCampaignSavedSnapshot(serializeCampaignDraft(draft, []));
        }
      }
      setPreviewState(null);
      setView({ kind: "campaign-builder", campaignId });
      setSubtab(forcedSubtab ?? "campaigns");
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
    const currentDraft = flushTemplateBuilderSnapshot();
    if (communicationsLocked || !currentDraft.name.trim() || !currentDraft.subject.trim() || !currentDraft.compiledHtml.trim()) {
      showToast({ tone: "error", message: "Compila nome, oggetto e contenuto del modello." });
      return;
    }
    setBusy("save-template");
    try {
      const payload = {
        name: currentDraft.name.trim(),
        category: currentDraft.templateType,
        template_type: currentDraft.templateType,
        subject: currentDraft.subject.trim(),
        body_html: currentDraft.compiledHtml,
        body_text: currentDraft.bodyText,
        compiled_html: currentDraft.compiledHtml,
        mjml_source: currentDraft.mjmlSource,
        grapesjs_project_json: currentDraft.grapesjsProjectJson,
        editor_status: currentDraft.editorStatus,
        linked_form_id: currentDraft.linkedFormId,
      } as const;

      const response = currentDraft.id
        ? await updateOrgAdminEmailTemplate(currentDraft.id, payload)
        : await createOrgAdminEmailTemplate(payload);

      const saved = response.template;
      await refreshLibrary();
      const nextDraft = mapTemplateToDraft(saved);
      setTemplateDraft(nextDraft);
      setTemplateSavedSnapshot(serializeTemplateDraft(nextDraft));
      showToast({
        tone: "success",
        message: currentDraft.id ? "Modello aggiornato." : "Modello creato.",
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
    const currentDraft = flushCampaignBuilderSnapshot();
    if (communicationsLocked || !currentDraft.subject.trim() || !currentDraft.compiledHtml.trim()) {
      showToast({ tone: "error", message: "Compila oggetto e contenuto della campagna." });
      return;
    }
    setBusy(sendAfter ? "send-campaign" : "save-campaign");
    try {
      const memberIds =
        currentDraft.recipientMode === "selected_members"
          ? selectedMembers.map((member) => member.id)
          : [];

      const payload = {
        name: currentDraft.name.trim() || null,
        subject: currentDraft.subject.trim(),
        body_html: currentDraft.compiledHtml,
        body_text: currentDraft.bodyText,
        compiled_html: currentDraft.compiledHtml,
        mjml_source: currentDraft.mjmlSource,
        grapesjs_project_json: currentDraft.grapesjsProjectJson,
        audience_type: currentDraft.audienceType,
        recipient_mode: currentDraft.recipientMode,
        member_ids: memberIds,
        scheduled_at: currentDraft.scheduledAt ? new Date(currentDraft.scheduledAt).toISOString() : null,
        linked_form_id: currentDraft.linkedFormId,
        source_template_id: currentDraft.sourceTemplateId,
        editor_status: currentDraft.editorStatus,
      } as const;

      const response = currentDraft.id
        ? await updateOrgAdminEmailCampaign(currentDraft.id, payload)
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
          message: currentDraft.id ? "Campagna aggiornata." : "Bozza campagna salvata.",
        });
      }

      await refreshLibrary();
      const nextDraft = mapCampaignToDraft(savedCampaign);
      setCampaignDraft(nextDraft);
      setCampaignSavedSnapshot(serializeCampaignDraft(nextDraft, selectedMembers));
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
    const currentDraft = flushCampaignBuilderSnapshot();
    if (!currentDraft.subject.trim() || !currentDraft.compiledHtml.trim()) {
      setTestSendError("Completa oggetto e contenuto prima del test.");
      setTestSendState("error");
      return;
    }
    setTestSendState("loading");
    setTestSendError(null);
    try {
      await sendOrgAdminCommunicationBuilderTestEmail({
        to_email: value,
        subject: currentDraft.subject,
        compiled_html: currentDraft.compiledHtml,
        body_text: currentDraft.bodyText,
        linked_form_id: currentDraft.linkedFormId,
        message_name: currentDraft.name || undefined,
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
      description="Il modello verrà rimosso dalla libreria dell'organizzazione."
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
      description="La campagna verrà rimossa dalla libreria dell'organizzazione."
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
            onStepSelect={(stepKey) => setTemplateStep(stepKey as TemplateStep)}
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
              ref={templateBuilderRef}
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <button className="text-[#0f5e5d] hover:underline" type="button" onClick={backToLibrary}>
                  Comunicazioni
                </button>
                <span>›</span>
                <span>Campagne</span>
                <span>›</span>
                <span>{campaignDraft.id ? "Modifica campagna" : "Nuova campagna"}</span>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                {campaignDraft.id ? "Rifinisci campagna" : "Nuova campagna"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Crea una campagna email guidata in cinque passaggi, dal segmento fino all'invio.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="btn-secondary" type="button" onClick={backToLibrary}>
                Esci
              </button>
              {campaignDraft.id ? (
                <button
                  className="btn-ghost text-red-600"
                  type="button"
                  onClick={() => setDeleteCampaignTarget(campaigns.find((item) => item.id === campaignDraft.id) || null)}
                >
                  Elimina
                </button>
              ) : null}
              <button className="btn-ghost" type="button" disabled={communicationsLocked} onClick={() => setTestSendOpen(true)}>
                Invia test
              </button>
              <button className="btn-primary" type="button" disabled={communicationsLocked || busy === "save-campaign"} onClick={() => void saveCampaign(false)}>
                Salva bozza
              </button>
            </div>
          </div>

          <Stepper
            steps={[
              { key: "type", label: "Tipo", hint: "Scegli obiettivo e destinatari" },
              { key: "base", label: "Template", hint: "Scegli il modello" },
              { key: "editor", label: "Builder", hint: "Personalizza contenuti" },
              { key: "preview", label: "Anteprima", hint: "Verifica il risultato" },
              { key: "action", label: "Invio", hint: "Programma o invia" },
            ]}
            active={campaignStep}
            onSelect={(stepKey) => setCampaignStep(stepKey as CampaignStep)}
          />
          {campaignStep === "type" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-5">
                <SectionPanel title="Dettagli campagna">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className={labelClass}>
                      Nome interno campagna
                      <input className={inputClass} value={campaignDraft.name} onChange={(event) => setCampaignDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Es. Newsletter Aprile 2026" />
                    </label>
                    <label className={labelClass}>
                      Oggetto email
                      <input className={inputClass} value={campaignDraft.subject} onChange={(event) => setCampaignDraft((prev) => ({ ...prev, subject: event.target.value }))} placeholder="Es. Tutte le novita e gli appuntamenti di Aprile" />
                    </label>
                    <label className={labelClass}>
                      Form collegato <span className="font-normal text-slate-400">(opzionale)</span>
                      <select className={inputClass} value={campaignDraft.linkedFormId ?? ""} onChange={(event) => setCampaignDraft((prev) => ({ ...prev, linkedFormId: event.target.value ? Number(event.target.value) : null }))}>
                        <option value="">Seleziona un form</option>
                        {activeForms.map((form) => (
                          <option key={form.id} value={form.id}>{form.title}</option>
                        ))}
                      </select>
                    </label>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-950">Programmazione</p>
                      <div className="mt-3 grid gap-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <input type="radio" checked={!campaignDraft.scheduledAt} onChange={() => setCampaignDraft((prev) => ({ ...prev, scheduledAt: "" }))} className="text-[#0f5e5d]" />
                          Invia ora
                        </label>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <input type="radio" checked={Boolean(campaignDraft.scheduledAt)} onChange={() => setCampaignDraft((prev) => ({ ...prev, scheduledAt: prev.scheduledAt || new Date().toISOString().slice(0, 16) }))} className="text-[#0f5e5d]" />
                          Programma per dopo
                        </label>
                        <input type="datetime-local" className={inputClass} value={campaignDraft.scheduledAt} onChange={(event) => setCampaignDraft((prev) => ({ ...prev, scheduledAt: event.target.value }))} />
                      </div>
                    </div>
                  </div>
                </SectionPanel>

                <SectionPanel title="Tipo campagna" eyebrow="Scegli obiettivo principale">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {TEMPLATE_TYPE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`relative rounded-xl border p-4 text-center transition ${
                          campaignDraft.templateType === option.value
                            ? "border-[#0f5e5d] bg-[#eef8f5] shadow-[0_18px_36px_-30px_rgba(15,94,93,0.5)]"
                            : "border-slate-200 bg-white hover:border-[#a9bfbc]"
                        }`}
                        onClick={() => setCampaignDraft((prev) => ({ ...prev, templateType: option.value }))}
                      >
                        {campaignDraft.templateType === option.value ? (
                          <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#0f5e5d] text-xs text-white">✓</span>
                        ) : null}
                        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-[#0f5e5d]">
                          <CampaignTypeIcon value={option.value} />
                        </span>
                        <span className="mt-3 block text-sm font-semibold text-slate-950">{option.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span>
                      </button>
                    ))}
                  </div>
                </SectionPanel>

                <SectionPanel title="Destinatari" eyebrow="Seleziona pubblico">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      { key: "active", label: "Tutti i soci attivi", hint: "Invia a tutti i soci con tessera attiva.", audience: "active_members" as const, mode: "all_members" as const, badge: "Consigliato" },
                      { key: "expired", label: "Soci scaduti", hint: "Invia ai soci con tessera scaduta.", audience: "expired_members" as const, mode: "all_members" as const },
                      { key: "renewal", label: "Rinnovi in scadenza", hint: "Invia ai soci con rinnovo prossimo.", audience: "renewal_due_members" as const, mode: "all_members" as const },
                      { key: "custom", label: "Segmento personalizzato", hint: "Scegli un gruppo di soci personalizzato.", audience: campaignDraft.audienceType, mode: "selected_members" as const },
                    ].map((option) => {
                      const selected =
                        option.mode === "selected_members"
                          ? campaignDraft.recipientMode === "selected_members"
                          : campaignDraft.recipientMode === "all_members" && campaignDraft.audienceType === option.audience;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          className={`relative rounded-xl border p-4 text-center transition ${
                            selected
                              ? "border-[#0f5e5d] bg-[#eef8f5] shadow-[0_18px_36px_-30px_rgba(15,94,93,0.5)]"
                              : "border-slate-200 bg-white hover:border-[#a9bfbc]"
                          }`}
                          onClick={() =>
                            setCampaignDraft((prev) => ({
                              ...prev,
                              recipientMode: option.mode,
                              audienceType: option.mode === "selected_members" ? prev.audienceType : option.audience,
                            }))
                          }
                        >
                          {selected ? (
                            <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#0f5e5d] text-xs text-white">✓</span>
                          ) : null}
                          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-700">
                            {option.key === "custom" ? "▽" : option.key === "renewal" ? "◷" : option.key === "expired" ? "!" : "◎"}
                          </span>
                          <span className="mt-3 block text-sm font-semibold text-slate-950">{option.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">{option.hint}</span>
                          {"badge" in option ? <StatusChip tone="success">{option.badge}</StatusChip> : null}
                        </button>
                      );
                    })}
                  </div>
                </SectionPanel>
              </div>

              <CampaignSummaryPanel
                draft={campaignDraft}
                audienceEstimate={audienceEstimate}
                selectedTemplateName={selectedCampaignTemplateName}
                activeForms={activeForms}
                busy={busy}
                disabled={communicationsLocked}
                onSave={() => void saveCampaign(false)}
                onContinue={() => setCampaignStep("base")}
              />
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
                ref={campaignBuilderRef}
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
            <div className="flex justify-center">
              <section className={`${panelClass} w-full max-w-4xl space-y-4`}>
                <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
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
        {!hideSubtabNav ? (
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
        ) : null}

        {subtab === "templates" ? (
          <section className={`${panelClass} space-y-5`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7a6647]">Libreria modelli</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Modelli email riusabili</h3>
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
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7a6647]">Modelli visibili</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{templateOptions.length}</p>
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-[1.3rem] border border-[#e5dccd] bg-white">
              {templateOptions.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-slate-500">
                  Nessun modello trovato con questi filtri.
                </div>
              ) : (
                <div className="divide-y divide-[#eee7db]">
                  {templateOptions.map((template) => (
                    <div key={template.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <TemplateTypeBadge value={template.template_type} />
                          <StatusBadge value={template.editor_status} />
                          <span className="inline-flex rounded-full border border-[#dfd6c7] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                            {template.is_system ? "Sistema" : "Associazione"}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <h4 className="truncate text-base font-semibold text-slate-950">{template.name}</h4>
                            <p className="mt-1 truncate text-sm text-slate-500">{template.subject || "Oggetto non impostato"}</p>
                          </div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                            Aggiornato {formatLibraryDate(template.updated_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <button className="btn-secondary" type="button" onClick={() => void openTemplateBuilder(template.id)}>Apri</button>
                        <button className="btn-ghost" type="button" onClick={() => void handleDuplicateTemplate(template.id)}>Duplica</button>
                        {!template.is_system ? (
                          <button className="btn-ghost text-red-600" type="button" onClick={() => setDeleteTemplateTarget(template)}>
                            Elimina
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {subtab === "campaigns" ? (
          <section className={`${panelClass} space-y-5`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7a6647]">Campagne</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Invii, bozze e revisioni</h3>
              </div>
              <button className="btn-primary" type="button" disabled={communicationsLocked} onClick={() => void openCampaignBuilder(null)}>
                Nuova campagna
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className={subtlePanelClass}>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7a6647]">Coda campagne</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">Riapri una bozza, controlla un invio programmato o verifica una campagna già spedita.</p>
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
