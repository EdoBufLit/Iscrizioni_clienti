import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  archiveOrgAdminEmailTemplate,
  AuthError,
  createOrgAdminEmailCampaign,
  createOrgAdminEmailTemplate,
  deleteOrgAdminEmailTemplate,
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
  type OrgAdminEmailSectionKey,
  type OrgAdminEmailTemplate,
  type OrgAdminEmailTemplateVariable,
  type OrgAdminMember,
} from "../../../../lib/api";
import Skeleton from "../../../../components/ui/Skeleton";
import { useToast } from "../../../../components/ui/ToastProvider";
import ConfirmModal from "../../../../components/ui/ConfirmModal";

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

type CampaignWizardStep = "brief" | "message" | "audience" | "review";
type TemplateWizardStep = "essentials" | "message" | "review";

const inputClass =
  "mt-2 w-full rounded-[1.1rem] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/15";
const labelClass = "block text-sm font-semibold text-neutral-800";
const sectionCardClass = "rounded-[1.8rem] border border-neutral-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]";
const wizardCardClass =
  "rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-[0_22px_60px_rgba(15,23,42,0.06)] md:p-6";
const wizardPrimaryActionClass =
  "signup-wizard-primary inline-flex min-h-[3.5rem] items-center justify-center gap-2 rounded-[1.2rem] px-6 py-3 text-sm font-semibold";
const wizardSecondaryActionClass =
  "signup-wizard-secondary inline-flex min-h-[3.5rem] items-center justify-center gap-2 rounded-[1.2rem] px-5 py-3 text-sm font-medium";
const wizardGhostActionClass =
  "inline-flex min-h-[3.5rem] items-center justify-center gap-2 rounded-[1.2rem] border border-transparent px-4 py-3 text-sm font-medium text-slate-500 transition hover:bg-white/70 hover:text-slate-900";

const emailSectionCatalog: Array<{
  key: OrgAdminEmailSectionKey;
  label: string;
  kicker: string;
  description: string;
  required?: boolean;
}> = [
  { key: "hero", label: "Hero", kicker: "Apertura", description: "Titolo, kicker e immagini di apertura." },
  { key: "body", label: "Corpo", kicker: "Obbligatorio", description: "Testo principale del messaggio.", required: true },
  { key: "cta", label: "CTA", kicker: "Azione", description: "Pulsante, nota e collegamento al form o link." },
  { key: "highlight", label: "Highlight", kicker: "Supporto", description: "Messaggio in evidenza o box riassuntivo." },
  { key: "event", label: "Dettagli", kicker: "Contesto", description: "Informazioni evento, agenda o istruzioni operative." },
  { key: "signature", label: "Firma", kicker: "Chiusura", description: "Firma libera o firma nome/ruolo." },
  { key: "final_note", label: "Nota finale", kicker: "Post scriptum", description: "Richiamo finale o nota di servizio." },
];
const defaultSectionOrder: OrgAdminEmailSectionKey[] = emailSectionCatalog.map((section) => section.key);
const campaignWizardSteps: Array<{ key: CampaignWizardStep; label: string; hint: string }> = [
  { key: "brief", label: "Brief", hint: "Oggetto, template e programma invio." },
  { key: "message", label: "Messaggio", hint: "Blocchi, contenuto e ordine del messaggio." },
  { key: "audience", label: "Destinatari", hint: "Segmento, soci selezionati e CTA." },
  { key: "review", label: "Review", hint: "Stile, anteprima grande e azione finale." },
];

function SandboxedEmailPreview({ html, title }: { html: string; title: string }) {
  return (
    <iframe
      title={title}
      srcDoc={html}
      sandbox=""
      referrerPolicy="no-referrer"
      className="min-h-[36rem] w-full border-0 bg-white"
    />
  );
}
const templateWizardSteps: Array<{ key: TemplateWizardStep; label: string; hint: string }> = [
  { key: "essentials", label: "Essentials", hint: "Nome, categoria, oggetto e collegamenti." },
  { key: "message", label: "Messaggio", hint: "Blocchi riordinabili e contenuto." },
  { key: "review", label: "Review", hint: "Stile, anteprima ampia e salvataggio." },
];

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
    section_order: [...defaultSectionOrder],
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

function normalizeSectionOrder(order?: OrgAdminEmailSectionKey[] | null): OrgAdminEmailSectionKey[] {
  const next: OrgAdminEmailSectionKey[] = [];
  for (const key of order || []) {
    if (emailSectionCatalog.some((section) => section.key === key) && !next.includes(key)) {
      next.push(key);
    }
  }
  for (const fallback of defaultSectionOrder) {
    if (!next.includes(fallback)) {
      next.push(fallback);
    }
  }
  return next;
}

function StepRail<T extends string>(props: {
  steps: Array<{ key: T; label: string; hint: string }>;
  active: T;
  onSelect: (step: T) => void;
}) {
  const activeIndex = props.steps.findIndex((step) => step.key === props.active);
  return (
    <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="rounded-[1.75rem] border border-neutral-200 bg-[#f6f5f1] p-3">
        <div className="grid gap-2">
          {props.steps.map((step, index) => {
            const isActive = step.key === props.active;
            const isDone = index < activeIndex;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => props.onSelect(step.key)}
                className={`rounded-[1.2rem] px-4 py-3 text-left transition ${
                  isActive
                    ? "bg-neutral-900 text-white shadow-[0_18px_30px_rgba(15,23,42,0.16)]"
                    : "bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      isActive
                        ? "bg-white/14 text-white"
                        : isDone
                          ? "bg-brand/10 text-brand"
                          : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {isDone && !isActive ? "✓" : index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{step.label}</p>
                    <p className={`mt-1 text-xs leading-5 ${isActive ? "text-white/72" : "text-neutral-500"}`}>{step.hint}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="rounded-[1.75rem] border border-neutral-200 bg-[#fbfaf6] px-5 py-4 text-sm text-neutral-600">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Percorso guidato</p>
        <p className="mt-2 text-sm leading-6">
          Un passo alla volta: definisci prima la struttura, poi il contenuto, poi la distribuzione. L'obiettivo è ridurre errori e far leggere subito il messaggio finale.
        </p>
      </div>
    </div>
  );
}

function SignupStepRail<T extends string>(props: {
  steps: Array<{ key: T; label: string; hint: string }>;
  active: T;
  onSelect: (step: T) => void;
}) {
  const activeIndex = props.steps.findIndex((step) => step.key === props.active);
  const progress = props.steps.length > 1 ? (activeIndex / (props.steps.length - 1)) * 100 : 0;
  return (
    <div className="mx-auto max-w-4xl px-2">
      <div className={`grid gap-4 ${props.steps.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
        {props.steps.map((step, index) => {
          const isActive = step.key === props.active;
          const isDone = index < activeIndex;
          const segmentProgress = Math.max(
            Math.min(
              (progress - index * (100 / Math.max(props.steps.length - 1, 1))) * Math.max(props.steps.length - 1, 1),
              100,
            ),
            0,
          );
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => props.onSelect(step.key)}
              className="group relative flex flex-col items-center text-center"
            >
              {index < props.steps.length - 1 ? (
                <span className="absolute left-1/2 top-6 hidden h-px w-full bg-slate-200 sm:block" aria-hidden="true">
                  <span
                    className="block h-full bg-[#c7d2fe] transition-[width] duration-300"
                    style={{ width: index < activeIndex ? "100%" : isActive ? `${segmentProgress}%` : "0%" }}
                  />
                </span>
              ) : null}
              <span
                className={`relative z-10 inline-flex h-12 w-12 items-center justify-center rounded-full border text-base font-semibold transition ${
                  isActive
                    ? "border-[#7c6cf6] bg-[#6d5ef4] text-white shadow-[0_24px_48px_-26px_rgba(109,94,244,0.68)]"
                    : isDone
                      ? "border-[#c7d2fe] bg-[#eef2ff] text-[#4f46e5]"
                      : "border-slate-200 bg-white text-slate-400"
                }`}
              >
                {isDone && !isActive ? "✓" : index + 1}
              </span>
              <span className={`mt-4 text-base font-semibold ${isActive ? "text-slate-950" : "text-slate-400 group-hover:text-slate-700"}`}>
                {step.label}
              </span>
              <span className={`mt-1 hidden max-w-[12rem] text-sm leading-6 md:block ${isActive ? "text-slate-500" : "text-slate-400"}`}>
                {step.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WizardShell<T extends string>(props: {
  breadcrumb: string;
  sectionLabel: string;
  title: string;
  description: string;
  onBack: () => void;
  steps: Array<{ key: T; label: string; hint: string }>;
  active: T;
  onSelect: (step: T) => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="signup-wizard-shell py-10 md:py-16">
      <div className="container-shell max-w-[1180px]">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex flex-wrap items-center justify-center gap-2 text-sm font-medium text-slate-400">
            <button type="button" onClick={props.onBack} className="transition hover:text-slate-700">
              Comunicazioni
            </button>
            <span>/</span>
            <span className="text-slate-500">{props.breadcrumb}</span>
          </div>

          <header className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#0f766e]">{props.sectionLabel}</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">{props.title}</h1>
            <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-slate-500 md:text-[1.7rem] md:leading-10">
              {props.description}
            </p>
          </header>

          <div className="mt-12 md:mt-14">
            <SignupStepRail steps={props.steps} active={props.active} onSelect={props.onSelect} />
          </div>

          <div className="mt-10 space-y-6 md:mt-14">{props.children}</div>

          <div className="mt-10 border-t border-slate-200 px-1 pt-8">{props.footer}</div>
        </div>
      </div>
    </section>
  );
}

function SortableSectionCard(props: {
  sectionKey: OrgAdminEmailSectionKey;
  selected: boolean;
  onSelect: () => void;
}) {
  const item = emailSectionCatalog.find((section) => section.key === props.sectionKey)!;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.sectionKey });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={props.onSelect}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex w-full items-start gap-4 rounded-[1.3rem] border px-4 py-4 text-left transition ${
        props.selected
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50"
      } ${isDragging ? "opacity-70 shadow-xl" : ""}`}
    >
      <span
        {...attributes}
        {...listeners}
        onClick={(event) => event.stopPropagation()}
        className={`mt-1 inline-flex h-10 w-10 shrink-0 cursor-grab items-center justify-center rounded-[1rem] border ${
          props.selected ? "border-white/16 bg-white/10 text-white/80" : "border-neutral-200 bg-neutral-50 text-neutral-500"
        }`}
        aria-label={`Riordina ${item.label}`}
      >
        ⋮⋮
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{item.label}</p>
          {item.required ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${props.selected ? "bg-white/12 text-white/72" : "bg-brand/10 text-brand"}`}>
              Base
            </span>
          ) : null}
        </div>
        <p className={`mt-1 text-[11px] font-bold uppercase tracking-[0.14em] ${props.selected ? "text-white/60" : "text-neutral-500"}`}>{item.kicker}</p>
        <p className={`mt-2 text-sm leading-6 ${props.selected ? "text-white/74" : "text-neutral-600"}`}>{item.description}</p>
      </div>
    </button>
  );
}

function SectionPlanner(props: {
  order: OrgAdminEmailSectionKey[];
  selected: OrgAdminEmailSectionKey;
  onSelect: (key: OrgAdminEmailSectionKey) => void;
  onChange: (next: OrgAdminEmailSectionKey[]) => void;
  title: string;
  description: string;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  return (
    <section className={wizardCardClass}>
      <div className="flex flex-col gap-3 border-b border-neutral-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600">{props.description}</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-600">
          Drag & drop attivo
        </span>
      </div>
      <div className="mt-5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const oldIndex = props.order.findIndex((key) => key === active.id);
            const newIndex = props.order.findIndex((key) => key === over.id);
            if (oldIndex < 0 || newIndex < 0) return;
            props.onChange(arrayMove(props.order, oldIndex, newIndex));
          }}
        >
          <SortableContext items={props.order} strategy={verticalListSortingStrategy}>
            <div className="grid gap-3">
              {props.order.map((sectionKey) => (
                <SortableSectionCard
                  key={sectionKey}
                  sectionKey={sectionKey}
                  selected={props.selected === sectionKey}
                  onSelect={() => props.onSelect(sectionKey)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </section>
  );
}

function PreviewCanvas(props: {
  eyebrow: string;
  title: string;
  subject: string;
  linkedFormLabel: string;
  previewHtml: string | null | undefined;
  fallbackText: string;
  sidebarNote?: ReactNode;
}) {
  return (
    <section className={`${wizardCardClass} overflow-hidden`}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">{props.eyebrow}</p>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl font-semibold tracking-tight text-neutral-900">{props.title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-600">{props.subject}</p>
            </div>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-600">
              {props.linkedFormLabel}
            </span>
          </div>
          <div className="mt-6 rounded-[1.8rem] border border-neutral-200 bg-[#f4f1ea] p-3 md:p-5">
            <div className="mx-auto min-h-[38rem] max-w-[860px] overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white shadow-[0_30px_70px_rgba(15,23,42,0.08)]">
              <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#e76f51]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#f4a261]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#2a9d8f]" />
                <span className="ml-3 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Preview email</span>
              </div>
              <div className="max-h-[44rem] overflow-auto bg-white p-3 md:p-5">
                {props.previewHtml ? (
                  <SandboxedEmailPreview html={props.previewHtml} title={`Anteprima email ${props.title}`} />
                ) : (
                  <div className="rounded-[1.4rem] border border-dashed border-neutral-200 bg-neutral-50 px-6 py-10 text-sm leading-7 text-neutral-500">
                    {props.fallbackText}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <aside className="space-y-4">
          {props.sidebarNote}
          <div className="rounded-[1.5rem] border border-neutral-200 bg-[#fbfaf6] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">Nota UX</p>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              L'anteprima è ampia e leggibile perché qui la decisione non è “scrivere testo”, ma valutare ritmo, CTA e resa finale del messaggio.
            </p>
          </div>
        </aside>
      </div>
    </section>
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
  const [campaignStep, setCampaignStep] = useState<CampaignWizardStep>("brief");
  const [templateStep, setTemplateStep] = useState<TemplateWizardStep>("essentials");
  const [selectedCampaignSection, setSelectedCampaignSection] = useState<OrgAdminEmailSectionKey>("body");
  const [selectedTemplateSection, setSelectedTemplateSection] = useState<OrgAdminEmailSectionKey>("body");
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(createEmptyCampaignForm);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(createEmptyTemplateForm);
  const [selectedMembers, setSelectedMembers] = useState<OrgAdminMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<OrgAdminMember[]>([]);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [sendingExisting, setSendingExisting] = useState(false);
  const [templatePendingDelete, setTemplatePendingDelete] = useState<OrgAdminEmailTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);

  const activeForms = useMemo(() => forms.filter((form) => form.is_active), [forms]);
  const activeTemplates = useMemo(() => templates.filter((template) => template.is_active), [templates]);
  const campaignSectionOrder = useMemo(
    () => normalizeSectionOrder(campaignForm.design.section_order),
    [campaignForm.design.section_order],
  );
  const templateSectionOrder = useMemo(
    () => normalizeSectionOrder(templateForm.design.section_order),
    [templateForm.design.section_order],
  );
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
    const nextDesign = {
      ...createDefaultDesign(),
      ...template.design,
      section_order: normalizeSectionOrder(template.design.section_order),
    };
    setTemplateForm({
      id: template.id,
      name: template.name,
      category: template.category || "custom",
      subject: template.subject,
      body: template.body_html || template.body_text || "",
      linked_form_id: template.linked_form_id,
      is_active: template.is_active,
      is_system: template.is_system,
      design: nextDesign,
    });
    setTemplateStep("essentials");
    setSelectedTemplateSection("body");
    setTemplateMode(template.body_html && template.body_html.trim() ? "html" : "text");
  }

  function applyCampaignToEditor(template: OrgAdminEmailTemplate) {
    setCampaignForm((prev) => ({
      ...prev,
      subject: template.subject,
      body: template.body_html || template.body_text || "",
      linked_form_id: template.linked_form_id,
      design: {
        ...createDefaultDesign(),
        ...template.design,
        section_order: normalizeSectionOrder(template.design.section_order),
      },
    }));
    setCampaignStep("message");
    setSelectedCampaignSection("body");
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
    setTemplateStep("essentials");
    setSelectedTemplateSection("body");
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
    setCampaignStep("brief");
    setSelectedCampaignSection("body");
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

  async function handleDeleteTemplate() {
    if (!templatePendingDelete || templatePendingDelete.is_system || deletingTemplate) return;
    setDeletingTemplate(true);
    try {
      await deleteOrgAdminEmailTemplate(templatePendingDelete.id);
      await refreshTemplates();
      if (screen.type === "template-editor" && templateForm.id === templatePendingDelete.id) {
        setScreen({ type: "library" });
        setMainTab("modelli");
      }
      showToast({
        title: "Modello eliminato",
        message: "Il modello è stato rimosso definitivamente dalla libreria.",
        tone: "success",
      });
      setTemplatePendingDelete(null);
    } catch (err) {
      handleLoadError(err, "Impossibile eliminare il modello.");
    } finally {
      setDeletingTemplate(false);
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

  const selectedCampaignSectionMeta = emailSectionCatalog.find((section) => section.key === selectedCampaignSection)!;

  const renderCampaignSectionEditor = () => {
    switch (selectedCampaignSection) {
      case "hero":
        return (
          <section className={wizardCardClass}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
              Blocco {selectedCampaignSectionMeta.label}
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-neutral-900">
              Definisci l'apertura del messaggio
            </h3>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className={labelClass}>
                Kicker
                <input
                  className={inputClass}
                  value={campaignForm.design.hero_kicker || ""}
                  onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, hero_kicker: event.target.value } }))}
                  placeholder="Es. Avviso ai soci"
                />
              </label>
              <label className={labelClass}>
                Titolo hero
                <input
                  className={inputClass}
                  value={campaignForm.design.hero_title || ""}
                  onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, hero_title: event.target.value } }))}
                  placeholder="Titolo principale dentro la mail"
                />
              </label>
              <label className={labelClass}>
                Hero image
                <input
                  className={inputClass}
                  value={campaignForm.design.hero_image_url || ""}
                  onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, hero_image_url: event.target.value } }))}
                  placeholder="URL immagine di apertura"
                />
              </label>
              <label className={labelClass}>
                Immagine contenuto
                <input
                  className={inputClass}
                  value={campaignForm.design.content_image_url || ""}
                  onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, content_image_url: event.target.value } }))}
                  placeholder="URL immagine nel corpo"
                />
              </label>
            </div>
          </section>
        );
      case "cta":
        return (
          <section className={wizardCardClass}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
              Blocco {selectedCampaignSectionMeta.label}
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-neutral-900">
              Guida l'azione successiva
            </h3>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className={labelClass}>
                Form collegato
                <select
                  className={inputClass}
                  value={campaignForm.linked_form_id ?? ""}
                  onChange={(event) => setCampaignForm((prev) => ({ ...prev, linked_form_id: event.target.value ? Number(event.target.value) : null }))}
                >
                  <option value="">Nessun form collegato</option>
                  {activeForms.map((form) => (
                    <option key={form.id} value={form.id}>
                      {form.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Etichetta CTA
                <input
                  className={inputClass}
                  value={campaignForm.design.cta_label || ""}
                  onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, cta_label: event.target.value } }))}
                  placeholder="Es. Compila il modulo"
                />
              </label>
              <label className={labelClass}>
                Link CTA
                <input
                  className={inputClass}
                  value={campaignForm.design.cta_url || ""}
                  onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, cta_url: event.target.value } }))}
                  placeholder="Se vuoto usa il form collegato"
                />
              </label>
              <label className={labelClass}>
                Nota CTA
                <textarea
                  className={`${inputClass} min-h-[96px]`}
                  value={campaignForm.design.cta_note || ""}
                  onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, cta_note: event.target.value } }))}
                  placeholder="Testo di supporto sotto il pulsante"
                />
              </label>
            </div>
          </section>
        );
      case "highlight":
        return (
          <section className={wizardCardClass}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Blocco Highlight</p>
            <textarea
              className={`${inputClass} mt-5 min-h-[180px]`}
              value={campaignForm.design.highlight_box || ""}
              onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, highlight_box: event.target.value } }))}
              placeholder="Scrivi qui il messaggio da mettere in evidenza."
            />
          </section>
        );
      case "event":
        return (
          <section className={wizardCardClass}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Blocco Dettagli</p>
            <textarea
              className={`${inputClass} mt-5 min-h-[180px]`}
              value={campaignForm.design.event_details || ""}
              onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, event_details: event.target.value } }))}
              placeholder="Agenda, luogo, orari o istruzioni operative."
            />
          </section>
        );
      case "signature":
        return (
          <section className={wizardCardClass}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Blocco Firma</p>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className={labelClass}>
                Firma libera
                <textarea
                  className={`${inputClass} min-h-[140px]`}
                  value={campaignForm.design.signature || ""}
                  onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, signature: event.target.value } }))}
                  placeholder="In alternativa a nome e ruolo."
                />
              </label>
              <div className="grid gap-5">
                <label className={labelClass}>
                  Nome firma
                  <input
                    className={inputClass}
                    value={campaignForm.design.signature_name || ""}
                    onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, signature_name: event.target.value } }))}
                  />
                </label>
                <label className={labelClass}>
                  Ruolo firma
                  <input
                    className={inputClass}
                    value={campaignForm.design.signature_role || ""}
                    onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, signature_role: event.target.value } }))}
                  />
                </label>
              </div>
            </div>
          </section>
        );
      case "final_note":
        return (
          <section className={wizardCardClass}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Blocco Nota finale</p>
            <textarea
              className={`${inputClass} mt-5 min-h-[140px]`}
              value={campaignForm.design.final_note || ""}
              onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, final_note: event.target.value } }))}
              placeholder="Chiusura breve, nota di servizio o post scriptum."
            />
          </section>
        );
      case "body":
      default:
        return (
          <section className={wizardCardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Blocco Corpo</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-neutral-900">Scrivi il messaggio principale</h3>
              </div>
              <ModeSwitch value={composerMode} onChange={setComposerMode} />
            </div>
            <label className={`${labelClass} mt-5 block`}>
              Contenuto
              <textarea
                className={`${inputClass} min-h-[280px]`}
                value={campaignForm.body}
                onChange={(event) => setCampaignForm((prev) => ({ ...prev, body: event.target.value }))}
                placeholder="Scrivi qui il corpo della campagna."
              />
            </label>
            <div className="mt-5">
              <p className="text-sm font-semibold text-neutral-900">Variabili disponibili</p>
              <div className="mt-3">
                <VariableCloud variables={variables} />
              </div>
            </div>
          </section>
        );
    }
  };

  const renderTemplateSectionEditor = () => {
    const disabled = templateForm.is_system;
    switch (selectedTemplateSection) {
      case "hero":
        return (
          <section className={wizardCardClass}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Blocco Hero</p>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className={labelClass}>
                Kicker
                <input className={inputClass} disabled={disabled} value={templateForm.design.hero_kicker || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, hero_kicker: event.target.value } }))} />
              </label>
              <label className={labelClass}>
                Titolo hero
                <input className={inputClass} disabled={disabled} value={templateForm.design.hero_title || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, hero_title: event.target.value } }))} />
              </label>
              <label className={labelClass}>
                Hero image
                <input className={inputClass} disabled={disabled} value={templateForm.design.hero_image_url || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, hero_image_url: event.target.value } }))} />
              </label>
              <label className={labelClass}>
                Immagine contenuto
                <input className={inputClass} disabled={disabled} value={templateForm.design.content_image_url || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, content_image_url: event.target.value } }))} />
              </label>
            </div>
          </section>
        );
      case "cta":
        return (
          <section className={wizardCardClass}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Blocco CTA</p>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className={labelClass}>
                Form collegato
                <select className={inputClass} disabled={disabled} value={templateForm.linked_form_id ?? ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, linked_form_id: event.target.value ? Number(event.target.value) : null }))}>
                  <option value="">Nessun form collegato</option>
                  {activeForms.map((form) => (
                    <option key={form.id} value={form.id}>{form.title}</option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Etichetta CTA
                <input className={inputClass} disabled={disabled} value={templateForm.design.cta_label || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, cta_label: event.target.value } }))} />
              </label>
              <label className={labelClass}>
                Link CTA
                <input className={inputClass} disabled={disabled} value={templateForm.design.cta_url || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, cta_url: event.target.value } }))} />
              </label>
              <label className={labelClass}>
                Nota CTA
                <textarea className={`${inputClass} min-h-[96px]`} disabled={disabled} value={templateForm.design.cta_note || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, cta_note: event.target.value } }))} />
              </label>
            </div>
          </section>
        );
      case "highlight":
        return (
          <section className={wizardCardClass}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Blocco Highlight</p>
            <textarea className={`${inputClass} mt-5 min-h-[180px]`} disabled={disabled} value={templateForm.design.highlight_box || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, highlight_box: event.target.value } }))} />
          </section>
        );
      case "event":
        return (
          <section className={wizardCardClass}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Blocco Dettagli</p>
            <textarea className={`${inputClass} mt-5 min-h-[180px]`} disabled={disabled} value={templateForm.design.event_details || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, event_details: event.target.value } }))} />
          </section>
        );
      case "signature":
        return (
          <section className={wizardCardClass}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Blocco Firma</p>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className={labelClass}>
                Firma libera
                <textarea className={`${inputClass} min-h-[140px]`} disabled={disabled} value={templateForm.design.signature || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, signature: event.target.value } }))} />
              </label>
              <div className="grid gap-5">
                <label className={labelClass}>
                  Nome firma
                  <input className={inputClass} disabled={disabled} value={templateForm.design.signature_name || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, signature_name: event.target.value } }))} />
                </label>
                <label className={labelClass}>
                  Ruolo firma
                  <input className={inputClass} disabled={disabled} value={templateForm.design.signature_role || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, signature_role: event.target.value } }))} />
                </label>
              </div>
            </div>
          </section>
        );
      case "final_note":
        return (
          <section className={wizardCardClass}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Blocco Nota finale</p>
            <textarea className={`${inputClass} mt-5 min-h-[140px]`} disabled={disabled} value={templateForm.design.final_note || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, final_note: event.target.value } }))} />
          </section>
        );
      case "body":
      default:
        return (
          <section className={wizardCardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Blocco Corpo</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-neutral-900">Scrivi il template riusabile</h3>
              </div>
              <ModeSwitch value={templateMode} onChange={setTemplateMode} />
            </div>
            <label className={`${labelClass} mt-5 block`}>
              Contenuto
              <textarea className={`${inputClass} min-h-[280px]`} disabled={disabled} value={templateForm.body} onChange={(event) => setTemplateForm((prev) => ({ ...prev, body: event.target.value }))} />
            </label>
            <div className="mt-5">
              <p className="text-sm font-semibold text-neutral-900">Variabili disponibili</p>
              <div className="mt-3"><VariableCloud variables={variables} /></div>
            </div>
          </section>
        );
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-[2rem]" />
        <Skeleton className="h-96 w-full rounded-[2rem]" />
      </div>
    );
  }

  const deleteTemplateModal = (
    <ConfirmModal
      open={templatePendingDelete != null}
      title="Eliminare il modello?"
      description={
        templatePendingDelete
          ? `Il modello "${templatePendingDelete.name}" verrà rimosso definitivamente dalla libreria.`
          : ""
      }
      confirmLabel="Elimina modello"
      tone="danger"
      confirmState={deletingTemplate ? "loading" : "idle"}
      onClose={() => {
        if (!deletingTemplate) setTemplatePendingDelete(null);
      }}
      onConfirm={() => void handleDeleteTemplate()}
    />
  );

  const libraryView = (
    <>
      <div className="space-y-8">
        <section className="grid gap-6 rounded-[2rem] border border-neutral-200 bg-gradient-to-br from-brand/10 via-white to-white p-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand">Studio Comunicazioni</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-neutral-900">
              Campagne e modelli tornano in un flusso guidato, con preview leggibile e zero pannelli soffocati.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600">
              La libreria resta ordinata. Quando apri una campagna o un modello entri in un wizard ampio, con messaggio costruito per blocchi, drag and drop e anteprima finale davvero utile.
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
            <StatChip label="Campagne" value={campaigns.length} hint="Bozze, programmati e invii nello stesso storico." />
            <StatChip label="Modelli" value={templates.length} hint="Template sistema e personalizzati della tua associazione." />
            <StatChip label="Form attivi" value={activeForms.length} hint="CTA collegabili direttamente dentro il wizard." />
            <StatChip label="Variabili" value={variables.length} hint="Placeholder sempre visibili durante la scrittura." />
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
                <p className="mt-2 text-sm text-neutral-600">Apri il dettaglio di una campagna esistente oppure riparti dal wizard per crearne una nuova.</p>
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
                        Nessuna campagna disponibile. Il wizard ti guida da brief a invio finale senza appesantire la libreria.
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
                <p className="mt-2 text-sm text-neutral-600">Preview più ampia, azioni immediate e un wizard più corto per creare o correggere i modelli.</p>
              </div>
              <button className="btn-primary" type="button" disabled={communicationsLocked} onClick={() => void openTemplateEditor(null)}>
                Crea modello
              </button>
            </div>

            <div className="mt-6 grid gap-5 xl:grid-cols-2">
              {templates.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
                  Nessun modello creato. Apri il wizard breve e prepara un template riusabile per campagne, reminder o inviti.
                </div>
              ) : (
                templates.map((template) => (
                  <article key={template.id} className="rounded-[1.7rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-neutral-900">{template.name}</p>
                          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-700">
                            {template.is_active ? "Attivo" : "Archiviato"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-neutral-500">
                          {template.is_system ? "Template di sistema" : "Template associazione"}
                          {template.category ? ` • ${template.category}` : ""}
                          {template.linked_form?.title ? ` • ${template.linked_form.title}` : ""}
                        </p>
                      </div>
                      {!template.is_system ? (
                        <button type="button" className="btn-ghost text-red-600 hover:text-red-700" onClick={() => setTemplatePendingDelete(template)}>
                          Elimina
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-5 rounded-[1.5rem] border border-neutral-200 bg-[#f7f4ee] p-4">
                      <div className="mx-auto max-w-[720px] rounded-[1.35rem] border border-neutral-200 bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
                        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-neutral-900">{template.subject || "Oggetto non impostato"}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-neutral-500">
                              {template.design.style_preset || "istituzionale"} · {template.design.font_preset || "classic"}
                            </p>
                          </div>
                          <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-600">
                            Preview
                          </span>
                        </div>
                        <div className="mt-4 space-y-3">
                          <div className="rounded-[1rem] bg-neutral-50 px-4 py-3">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500">
                              {template.design.hero_kicker || "Hero"}
                            </p>
                            <p className="mt-2 text-lg font-semibold leading-7 text-neutral-900">
                              {template.design.hero_title || template.subject || "Titolo del modello"}
                            </p>
                          </div>
                          <div className="line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-neutral-600">
                            {template.body_text || template.body_html || "Nessun contenuto disponibile."}
                          </div>
                          {template.design.cta_label ? (
                            <div className="inline-flex rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white">
                              {template.design.cta_label}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button className="btn-primary" type="button" onClick={() => void openTemplateEditor(template.id)}>
                        Apri wizard
                      </button>
                      {!template.is_system ? (
                        <button className="btn-secondary" type="button" onClick={() => setTemplatePendingDelete(template)}>
                          Elimina
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        )}
      </div>
      {deleteTemplateModal}
    </>
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
                      <SandboxedEmailPreview html={selectedCampaign.body_html} title="Anteprima contenuto campagna" />
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
    const campaignStepIndex = campaignWizardSteps.findIndex((step) => step.key === campaignStep);
    const campaignStepMeta = campaignWizardSteps[campaignStepIndex] ?? campaignWizardSteps[0];
    return (
      <WizardShell
        breadcrumb="Campagne"
        sectionLabel="Studio campagne"
        title={campaignForm.name.trim() || "Nuova campagna"}
        description={`Passo ${campaignStepIndex + 1} di ${campaignWizardSteps.length}: ${campaignStepMeta.hint}`}
        onBack={() => setScreen({ type: "library" })}
        steps={campaignWizardSteps}
        active={campaignStep}
        onSelect={setCampaignStep}
        footer={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex justify-center sm:justify-start">
              {campaignStepIndex > 0 ? (
                <button className={wizardSecondaryActionClass} type="button" onClick={() => setCampaignStep(campaignWizardSteps[campaignStepIndex - 1].key)}>
                  Indietro
                </button>
              ) : (
                <button className={wizardGhostActionClass} type="button" onClick={() => setScreen({ type: "library" })}>
                  Torna alla libreria
                </button>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
              {campaignStepIndex < campaignWizardSteps.length - 1 ? (
                <button className={wizardPrimaryActionClass} type="button" onClick={() => setCampaignStep(campaignWizardSteps[campaignStepIndex + 1].key)}>
                  Continua
                </button>
              ) : (
                <>
                  <button className={wizardSecondaryActionClass} type="button" disabled={savingCampaign} onClick={() => void saveCampaign(false, false)}>
                    Salva bozza
                  </button>
                  <button className={wizardSecondaryActionClass} type="button" disabled={savingCampaign} onClick={() => void saveCampaign(false, true)}>
                    Programma
                  </button>
                  <button className={wizardPrimaryActionClass} type="button" disabled={savingCampaign || communicationsLocked} onClick={() => void saveCampaign(true, false)}>
                    Invia ora
                  </button>
                </>
              )}
            </div>
          </div>
        }
      >
        {campaignStep === "brief" ? (
          <>
            <section className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
              <div className="flex flex-col gap-6 border-b border-slate-100 pb-8 md:flex-row md:items-start md:justify-between">
                <div className="max-w-2xl">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6d5ef4]">Impostazione campagna</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Prima chiarisci obiettivo, oggetto e timing</h2>
                  <p className="mt-3 text-base leading-7 text-slate-500">
                    Questo passo serve a definire il contesto della campagna. Messaggio e pubblico li rifinisci subito dopo.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <StatChip label="Pubblico" value={campaignForm.recipient_mode === "selected_members" ? `${selectedMembers.length} soci` : "Segmento"} hint="Puoi cambiarlo nel passo destinatari." />
                  <StatChip label="Programmazione" value={campaignForm.scheduled_at ? "Pianificata" : "Manuale"} hint={campaignForm.scheduled_at ? formatDateTime(campaignForm.scheduled_at) : "Invio quando decidi tu."} />
                </div>
              </div>
              <div className="mt-8 grid gap-x-7 gap-y-8 md:grid-cols-2">
                <label className={labelClass}>
                  Nome interno
                  <input className={inputClass} value={campaignForm.name} onChange={(event) => setCampaignForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Es. Convocazione assemblea aprile" />
                </label>
                <label className={labelClass}>
                  Programma invio
                  <input type="datetime-local" className={inputClass} value={campaignForm.scheduled_at} onChange={(event) => setCampaignForm((prev) => ({ ...prev, scheduled_at: event.target.value }))} />
                </label>
                <label className={`${labelClass} md:col-span-2`}>
                  Oggetto email
                  <input className={inputClass} value={campaignForm.subject} onChange={(event) => setCampaignForm((prev) => ({ ...prev, subject: event.target.value }))} placeholder="Oggetto chiaro e leggibile già in inbox" />
                </label>
                <label className={`${labelClass} md:col-span-2`}>
                  Titolo principale
                  <input className={inputClass} value={campaignForm.design.hero_title || ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, hero_title: event.target.value } }))} placeholder="Titolo hero dentro il messaggio" />
                </label>
                <label className={`${labelClass} md:col-span-2`}>
                  Messaggio introduttivo
                  <textarea className={`${inputClass} min-h-[220px]`} value={campaignForm.body} onChange={(event) => setCampaignForm((prev) => ({ ...prev, body: event.target.value }))} placeholder="Apri con il contesto. I blocchi e la struttura li rifinisci nel prossimo passo." />
                </label>
              </div>
            </section>

            <section className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Scorciatoia utile</p>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Parti da un modello se vuoi accelerare</h3>
                  <p className="mt-3 text-base leading-7 text-slate-500">
                    Puoi precaricare soggetto, struttura e CTA da un modello esistente, poi personalizzare tutto nel passo messaggio.
                  </p>
                </div>
                <label className={labelClass}>
                  Carica modello
                  <select
                    className={inputClass}
                    onChange={(event) => {
                      const id = Number(event.target.value || 0);
                      const template = activeTemplates.find((item) => item.id === id);
                      if (template) applyCampaignToEditor(template);
                    }}
                  >
                    <option value="">Nessun modello</option>
                    {activeTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          </>
        ) : null}

        {campaignStep === "message" ? (
          <>
            <section className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6d5ef4]">Builder messaggio</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Ordina i blocchi e scrivi una sezione per volta</h2>
                <p className="mt-3 text-base leading-7 text-slate-500">
                  Il drag & drop resta, ma dentro un layout chiaro: struttura a sinistra, editor della sezione a destra, senza pannelli laterali compressi.
                </p>
              </div>
              <div className="mt-8 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                <SectionPlanner
                  order={campaignSectionOrder}
                  selected={selectedCampaignSection}
                  onSelect={setSelectedCampaignSection}
                  onChange={(next) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, section_order: next } }))}
                  title="Messaggio"
                  description="Trascina i blocchi come nel builder form e lavora sul blocco selezionato."
                />
                {renderCampaignSectionEditor()}
              </div>
            </section>

            <section className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Variabili rapide</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Placeholder sempre visibili mentre scrivi</h3>
              <p className="mt-3 text-base leading-7 text-slate-500">
                Inseriscili nel testo per personalizzare saluto, CTA e riferimenti al socio senza cambiare contesto.
              </p>
              <div className="mt-6">
                <VariableCloud variables={variables} />
              </div>
            </section>
          </>
        ) : null}

        {campaignStep === "audience" ? (
          <>
            <section className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6d5ef4]">Destinatari e CTA</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Definisci a chi scrivi e dove porti il click</h2>
                <p className="mt-3 text-base leading-7 text-slate-500">
                  Qui colleghi il form giusto, chiarisci la CTA e scegli se usare un segmento automatico o una lista manuale di soci.
                </p>
              </div>

              <div className="mt-8 grid gap-x-7 gap-y-8 md:grid-cols-2">
                <label className={labelClass}>
                  Form collegato
                  <select className={inputClass} value={campaignForm.linked_form_id ?? ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, linked_form_id: event.target.value ? Number(event.target.value) : null }))}>
                    <option value="">Nessun form collegato</option>
                    {activeForms.map((form) => (
                      <option key={form.id} value={form.id}>
                        {form.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  Etichetta CTA
                  <input className={inputClass} value={campaignForm.design.cta_label || ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, cta_label: event.target.value } }))} placeholder="Es. Compila il modulo" />
                </label>
                <label className={`${labelClass} md:col-span-2`}>
                  Link CTA
                  <input className={inputClass} value={campaignForm.design.cta_url || ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, cta_url: event.target.value } }))} placeholder="Se vuoto usa il form collegato" />
                </label>
              </div>

              <div className="mt-10 border-t border-slate-100 pt-8">
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["all_members", "selected_members"] as OrgAdminCampaignRecipientMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`rounded-[1.6rem] border px-5 py-5 text-left transition ${
                        campaignForm.recipient_mode === mode
                          ? "border-[#c7d2fe] bg-[#eef2ff] text-[#4338ca]"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                      onClick={() => setCampaignForm((prev) => ({ ...prev, recipient_mode: mode }))}
                    >
                      <p className="text-base font-semibold">{mode === "selected_members" ? "Soci selezionati" : "Segmento soci"}</p>
                      <p className="mt-2 text-sm leading-6">
                        {mode === "selected_members"
                          ? "Cerca persone specifiche e costruisci una lista manuale."
                          : "Usa una platea predefinita dell'associazione."}
                      </p>
                    </button>
                  ))}
                </div>

                {campaignForm.recipient_mode === "all_members" ? (
                  <label className={`${labelClass} mt-6 block`}>
                    Segmento soci
                    <select className={inputClass} value={campaignForm.audience_type} onChange={(event) => setCampaignForm((prev) => ({ ...prev, audience_type: event.target.value as OrgAdminCampaignAudienceType }))}>
                      {audienceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="mt-3 block text-sm leading-6 text-slate-500">{audienceOptions.find((option) => option.value === campaignForm.audience_type)?.description}</span>
                  </label>
                ) : (
                  <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-[#f8fafc] p-5">
                    <label className={labelClass}>
                      Cerca soci
                      <input className={inputClass} value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Nome, email o numero tessera" />
                    </label>
                    <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-white">
                      {memberSearch.trim() && memberResults.length === 0 ? (
                        <div className="p-4 text-sm text-slate-500">Nessun socio trovato.</div>
                      ) : (
                        memberResults.map((member) => (
                          <button key={member.id} type="button" className="flex w-full items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50" onClick={() => addSelectedMember(member)}>
                            <div>
                              <p className="font-semibold text-slate-900">{member.name}</p>
                              <p className="mt-1 text-xs text-slate-500">{[member.email || "Email non disponibile", member.card_number ? `Tessera ${member.card_number}` : null].filter(Boolean).join(" • ")}</p>
                            </div>
                            <span className="text-xs font-semibold text-[#4338ca]">Aggiungi</span>
                          </button>
                        ))
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedMembers.map((member) => (
                        <span key={member.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
                          {member.name}
                          <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => removeSelectedMember(member.id)}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
              <div className="grid gap-4 sm:grid-cols-2">
                <StatChip label="Stimati" value={estimate ?? "-"} hint="Conteggio previsto sul pubblico selezionato." />
                <StatChip label="Form collegato" value={selectedCampaignLinkedForm?.title || "Nessuno"} hint="La CTA può aprire questo form." />
              </div>
            </section>
          </>
        ) : null}

        {campaignStep === "review" ? (
          <>
            <section className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6d5ef4]">Review finale</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Rifinisci lo stile e controlla la resa finale</h2>
                <p className="mt-3 text-base leading-7 text-slate-500">
                  Qui decidi il tono visivo della campagna, sistemi gli ultimi blocchi opzionali e valuti l'anteprima in formato largo.
                </p>
              </div>

              <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-6">
                  <section className="rounded-[1.6rem] border border-slate-200 bg-[#fbfafc] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Stile del messaggio</p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">Preset, font e bottone senza opzioni sparse ovunque.</p>
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
                              ? "border-[#c7d2fe] bg-[#eef2ff]"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                          onClick={() => setCampaignForm((prev) => ({ ...prev, design: applyStylePreset(prev.design, preset) }))}
                        >
                          <div className="flex items-center gap-3">
                            <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: preset.accent }} />
                            <strong className="text-sm text-slate-900">{preset.label}</strong>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-500">{preset.note}</p>
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className={labelClass}>
                        Font preset
                        <select className={inputClass} value={campaignForm.design.font_preset || "classic"} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, font_preset: event.target.value as OrgAdminEmailFontPreset } }))}>
                          {fontPresetOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={labelClass}>
                        Button style
                        <select className={inputClass} value={campaignForm.design.button_style || "pill"} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, button_style: event.target.value } }))}>
                          {buttonStyleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </section>

                  <section className="rounded-[1.6rem] border border-slate-200 bg-[#fbfafc] p-5">
                    <p className="text-sm font-semibold text-slate-950">Branding essenziale</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                      <label className="flex items-center gap-3 pt-9 text-sm font-medium text-slate-700">
                        <input type="checkbox" className="rounded border-slate-300 text-brand" checked={campaignForm.design.show_association_name} onChange={(event) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, show_association_name: event.target.checked } }))} />
                        Mostra il nome associazione
                      </label>
                    </div>
                  </section>
                </div>

                <section className="rounded-[1.6rem] border border-slate-200 bg-[#fbfafc] p-5">
                  <p className="text-sm font-semibold text-slate-950">Blocchi opzionali</p>
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
                    <details className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-800">Opzioni avanzate</summary>
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
              </div>
            </section>

            <PreviewCanvas
              eyebrow="Anteprima campagna"
              title={campaignForm.name.trim() || "Nuova campagna"}
              subject={campaignPreview?.subject || campaignForm.subject || "Compila oggetto e contenuto per attivare la preview."}
              linkedFormLabel={selectedCampaignLinkedForm ? `CTA collegata a ${selectedCampaignLinkedForm.title}` : "Nessun form collegato"}
              previewHtml={campaignPreview?.body_html}
              fallbackText={campaignForm.body || "Compila oggetto e contenuto per vedere l'anteprima."}
              sidebarNote={
                <div className="rounded-[1.5rem] border border-neutral-200 bg-[#fbfaf6] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">Stima invio</p>
                  <p className="mt-3 text-sm leading-6 text-neutral-600">
                    {estimate != null
                      ? `Pubblico stimato: ${estimate} destinatari.`
                      : "La stima si aggiorna in base al pubblico scelto nel passo precedente."}
                  </p>
                </div>
              }
            />
          </>
        ) : null}
      </WizardShell>
    );
  }

  if (false) {
    const campaignStepIndex = campaignWizardSteps.findIndex((step) => step.key === campaignStep);
    return (
      <div className="-mx-6 md:-mx-8">
        <EditorHeader
          title={campaignForm.name.trim() || "Nuova campagna"}
          subtitle="Wizard campagne ripristinato: brief, messaggio con drag and drop, destinatari e review finale."
          badge={campaignForm.scheduled_at ? "Programmazione" : "Wizard campagna"}
          onBack={() => setScreen({ type: "library" })}
          actions={
            <>
              {campaignStepIndex > 0 ? (
                <button className="btn-ghost" type="button" onClick={() => setCampaignStep(campaignWizardSteps[campaignStepIndex - 1].key)}>
                  Indietro
                </button>
              ) : null}
              {campaignStepIndex < campaignWizardSteps.length - 1 ? (
                <button className="btn-secondary" type="button" onClick={() => setCampaignStep(campaignWizardSteps[campaignStepIndex + 1].key)}>
                  Avanti
                </button>
              ) : (
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
              )}
            </>
          }
        />
        <div className="px-4 py-6 md:px-8">
          <div className="mb-6">
            <StepRail steps={campaignWizardSteps} active={campaignStep} onSelect={setCampaignStep} />
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
            <div className="space-y-6">
              {campaignStep === "brief" ? (
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
              ) : null}

              {campaignStep === "message" ? (
                <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                  <SectionPlanner
                    order={campaignSectionOrder}
                    selected={selectedCampaignSection}
                    onSelect={setSelectedCampaignSection}
                    onChange={(next) => setCampaignForm((prev) => ({ ...prev, design: { ...prev.design, section_order: next } }))}
                    title="Step 2 · Messaggio"
                    description="Riordina i blocchi come nel builder form e compila una sezione per volta."
                  />
                  {renderCampaignSectionEditor()}
                </div>
              ) : null}

              {campaignStep === "audience" ? (
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
              ) : null}

              {campaignStep === "message" ? (
              <section className={sectionCardClass}>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Variabili disponibili</p>
                <p className="mt-2 text-sm text-neutral-600">Usa i placeholder direttamente nel contenuto per personalizzare titolo, testo e CTA.</p>
                <div className="mt-4"><VariableCloud variables={variables} /></div>
              </section>
              ) : null}
            </div>
            <aside className="space-y-6 xl:sticky xl:top-28 xl:self-start">
              {campaignStep === "audience" ? (
                <section className={sectionCardClass}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Stima invio</p>
                  <div className="mt-4 grid gap-3">
                    <StatChip label="Stimati" value={estimate ?? "-"} hint="Conteggio previsto del pubblico scelto." />
                    <StatChip label="Form collegato" value={selectedCampaignLinkedForm?.title || "Nessuno"} hint="La CTA può aprire questo form." />
                  </div>
                </section>
              ) : null}

              {campaignStep === "review" ? (
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
              ) : null}

              {campaignStep === "review" ? (
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
              ) : null}

              {campaignStep === "review" ? (
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
              ) : null}

              {campaignStep === "review" ? (
              <section className={sectionCardClass}>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Sticky Preview</p>
                <div className="mt-4 rounded-[1.4rem] border border-neutral-200 bg-neutral-50 p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{campaignPreview?.subject || campaignForm.subject || "Anteprima campagna"}</p>
                      <p className="mt-1 text-xs text-neutral-500">{selectedCampaignLinkedForm ? `CTA collegata a ${selectedCampaignLinkedForm?.title}` : "Nessun form collegato"}</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-neutral-600 shadow-sm">{estimate ?? "-"} destinatari</span>
                  </div>
                  <div className="rounded-[1.2rem] bg-white p-3">
                    {campaignPreview?.body_html ? (
                      <SandboxedEmailPreview html={campaignPreview?.body_html || ""} title="Anteprima campagna" />
                    ) : (
                      <div className="whitespace-pre-wrap text-sm leading-6 text-neutral-600">{campaignForm.body || "Compila oggetto e contenuto per vedere l'anteprima."}</div>
                    )}
                  </div>
                </div>
              </section>
              ) : null}
            </aside>
          </div>
        </div>
      </div>
    );
  }

  if (screen.type === "template-editor") {
    const templateStepIndex = templateWizardSteps.findIndex((step) => step.key === templateStep);
    const templateStepMeta = templateWizardSteps[templateStepIndex] ?? templateWizardSteps[0];
    return (
      <>
        <WizardShell
          breadcrumb="Modelli"
          sectionLabel="Libreria modelli"
          title={templateForm.id ? templateForm.name || "Modello email" : "Nuovo modello"}
          description={`Passo ${templateStepIndex + 1} di ${templateWizardSteps.length}: ${templateStepMeta.hint}`}
          onBack={() => setScreen({ type: "library" })}
          steps={templateWizardSteps}
          active={templateStep}
          onSelect={setTemplateStep}
          footer={
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex justify-center sm:justify-start">
                {templateStepIndex > 0 ? (
                  <button className={wizardSecondaryActionClass} type="button" onClick={() => setTemplateStep(templateWizardSteps[templateStepIndex - 1].key)}>
                    Indietro
                  </button>
                ) : (
                  <button className={wizardGhostActionClass} type="button" onClick={() => setScreen({ type: "library" })}>
                    Torna alla libreria
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
                {templateStepIndex < templateWizardSteps.length - 1 ? (
                  <button className={wizardPrimaryActionClass} type="button" onClick={() => setTemplateStep(templateWizardSteps[templateStepIndex + 1].key)}>
                    Continua
                  </button>
                ) : (
                  <>
                    <button className={wizardSecondaryActionClass} type="button" onClick={() => void handleDuplicateTemplate()} disabled={templateForm.id == null}>
                      Duplica
                    </button>
                    {!templateForm.is_system ? (
                      <>
                        <button className={wizardSecondaryActionClass} type="button" onClick={() => void handleArchiveTemplate()} disabled={templateForm.id == null}>
                          Archivia
                        </button>
                        <button className={wizardSecondaryActionClass} type="button" onClick={() => setTemplatePendingDelete(templates.find((template) => template.id === templateForm.id) || null)} disabled={templateForm.id == null}>
                          Elimina
                        </button>
                      </>
                    ) : null}
                    <button className={wizardPrimaryActionClass} type="button" disabled={savingTemplate || templateForm.is_system} onClick={() => void saveTemplate()}>
                      {templateForm.id ? "Salva modello" : "Crea modello"}
                    </button>
                  </>
                )}
              </div>
            </div>
          }
        >
          {detailLoading ? (
            <Skeleton className="h-[720px] w-full rounded-[2rem]" />
          ) : (
            <>
              {templateStep === "essentials" ? (
                <>
                  <section className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
                    <div className="max-w-3xl">
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6d5ef4]">Fondamenta del modello</p>
                      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Imposta nome, oggetto e collegamenti principali</h2>
                      <p className="mt-3 text-base leading-7 text-slate-500">
                        Questo wizard ? più corto della campagna: prima definisci l'ossatura riusabile, poi sistemi i blocchi e chiudi con la review.
                      </p>
                    </div>
                    <div className="mt-8 grid gap-x-7 gap-y-8 md:grid-cols-2">
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
                        Titolo principale
                        <input className={inputClass} disabled={templateForm.is_system} value={templateForm.design.hero_title || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, hero_title: event.target.value } }))} />
                      </label>
                      <label className={`${labelClass} md:col-span-2`}>
                        Corpo base
                        <textarea className={`${inputClass} min-h-[220px]`} disabled={templateForm.is_system} value={templateForm.body} onChange={(event) => setTemplateForm((prev) => ({ ...prev, body: event.target.value }))} />
                      </label>
                    </div>
                  </section>

                  <section className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
                    <div className="grid gap-6 lg:grid-cols-2">
                      <label className={labelClass}>
                        Form collegato
                        <select className={inputClass} disabled={templateForm.is_system} value={templateForm.linked_form_id ?? ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, linked_form_id: event.target.value ? Number(event.target.value) : null }))}>
                          <option value="">Nessun form collegato</option>
                          {activeForms.map((form) => (
                            <option key={form.id} value={form.id}>
                              {form.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={labelClass}>
                        CTA label
                        <input className={inputClass} disabled={templateForm.is_system} value={templateForm.design.cta_label || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, cta_label: event.target.value } }))} />
                      </label>
                      <label className={`${labelClass} lg:col-span-2`}>
                        CTA link
                        <input className={inputClass} disabled={templateForm.is_system} value={templateForm.design.cta_url || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, cta_url: event.target.value } }))} />
                      </label>
                      <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                        <input type="checkbox" className="rounded border-slate-300 text-brand" disabled={templateForm.is_system} checked={templateForm.is_active} onChange={(event) => setTemplateForm((prev) => ({ ...prev, is_active: event.target.checked }))} />
                        Modello attivo
                      </label>
                    </div>
                  </section>
                </>
              ) : null}

              {templateStep === "message" ? (
                <>
                  <section className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
                    <div className="max-w-3xl">
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6d5ef4]">Builder del modello</p>
                      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Rendi riusabile il messaggio blocco per blocco</h2>
                      <p className="mt-3 text-base leading-7 text-slate-500">
                        Stessa logica del form builder: ordina i blocchi con drag & drop e compila il contenuto dal pannello principale.
                      </p>
                    </div>
                    <div className="mt-8 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                      <SectionPlanner
                        order={templateSectionOrder}
                        selected={selectedTemplateSection}
                        onSelect={setSelectedTemplateSection}
                        onChange={(next) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, section_order: next } }))}
                        title="Messaggio"
                        description="Riordina i blocchi del modello e modifica la sezione selezionata."
                      />
                      {renderTemplateSectionEditor()}
                    </div>
                  </section>

                  <section className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Variabili rapide</p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Placeholder disponibili nel template</h3>
                    <div className="mt-6">
                      <VariableCloud variables={variables} />
                    </div>
                  </section>
                </>
              ) : null}

              {templateStep === "review" ? (
                <>
                  <section className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
                    <div className="max-w-3xl">
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6d5ef4]">Review modello</p>
                      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Rifinisci stile, branding e stato del template</h2>
                      <p className="mt-3 text-base leading-7 text-slate-500">
                        L'anteprima resta ampia. Le opzioni di branding sono raccolte qui, senza il vecchio riquadro stretto e inutile.
                      </p>
                    </div>

                    <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="space-y-6">
                        <section className="rounded-[1.6rem] border border-slate-200 bg-[#fbfafc] p-5">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-950">Stile del modello</p>
                              <p className="mt-1 text-sm leading-6 text-slate-500">Preset compatti per mantenere coerenza visuale.</p>
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
                                    ? "border-[#c7d2fe] bg-[#eef2ff]"
                                    : "border-slate-200 bg-white hover:border-slate-300"
                                } ${templateForm.is_system ? "opacity-60" : ""}`}
                                onClick={() => setTemplateForm((prev) => ({ ...prev, design: applyStylePreset(prev.design, preset) }))}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: preset.accent }} />
                                  <strong className="text-sm text-slate-900">{preset.label}</strong>
                                </div>
                                <p className="mt-2 text-xs leading-5 text-slate-500">{preset.note}</p>
                              </button>
                            ))}
                          </div>
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <label className={labelClass}>
                              Font preset
                              <select className={inputClass} disabled={templateForm.is_system} value={templateForm.design.font_preset || "classic"} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, font_preset: event.target.value as OrgAdminEmailFontPreset } }))}>
                                {fontPresetOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className={labelClass}>
                              Button style
                              <select className={inputClass} disabled={templateForm.is_system} value={templateForm.design.button_style || "pill"} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, button_style: event.target.value } }))}>
                                {buttonStyleOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </section>

                        <section className="rounded-[1.6rem] border border-slate-200 bg-[#fbfafc] p-5">
                          <p className="text-sm font-semibold text-slate-950">Branding e blocchi</p>
                          <div className="mt-4 space-y-4">
                            {templateBrandingFields.map((item) => (
                              <label key={item.key} className={labelClass}>
                                {item.label}
                                <input className={inputClass} disabled={templateForm.is_system} value={templateForm.design[item.key] || ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, [item.key]: event.target.value } }))} />
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
                          </div>
                        </section>
                      </div>

                      <section className="rounded-[1.6rem] border border-slate-200 bg-[#fbfafc] p-5">
                        <p className="text-sm font-semibold text-slate-950">Opzioni finali</p>
                        <div className="mt-4 space-y-4">
                          <details className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Opzioni avanzate</summary>
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
                          <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Stato modello</p>
                            <p className="mt-3 text-sm leading-6 text-slate-600">
                              {templateForm.is_system
                                ? "Template di sistema: lo puoi ispezionare ma non salvare."
                                : templateForm.is_active
                                  ? "Modello attivo ? pronto per essere riusato nelle campagne."
                                  : "Modello archiviato: puoi riattivarlo o duplicarlo."}
                            </p>
                          </div>
                        </div>
                      </section>
                    </div>
                  </section>

                  <PreviewCanvas
                    eyebrow="Anteprima modello"
                    title={templateForm.name.trim() || "Nuovo modello"}
                    subject={templatePreview?.subject || templateForm.subject || "Compila oggetto e contenuto per attivare la preview."}
                    linkedFormLabel={selectedTemplateLinkedForm ? `Collegato al form ${selectedTemplateLinkedForm.title}` : "Nessun form collegato"}
                    previewHtml={templatePreview?.body_html}
                    fallbackText={templateForm.body || "Compila oggetto e contenuto per vedere l'anteprima."}
                    sidebarNote={
                      <div className="rounded-[1.5rem] border border-neutral-200 bg-[#fbfaf6] p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">Riutilizzo</p>
                        <p className="mt-3 text-sm leading-6 text-neutral-600">
                          Usa questo template come base nelle campagne, senza dover ricostruire struttura e stile ogni volta.
                        </p>
                      </div>
                    }
                  />
                </>
              ) : null}
            </>
          )}
        </WizardShell>
        {deleteTemplateModal}
      </>
    );
  }

  if (false) {
    const templateStepIndex = templateWizardSteps.findIndex((step) => step.key === templateStep);
    return (
      <>
      <div className="-mx-6 md:-mx-8">
        <EditorHeader
          title={templateForm.id ? templateForm.name || "Modello" : "Nuovo modello"}
          subtitle="Wizard modelli più corto: essentials, messaggio e review finale con preview ampia."
          badge={templateForm.is_system ? "Sistema" : templateForm.is_active ? "Attivo" : "Archiviato"}
          onBack={() => setScreen({ type: "library" })}
          actions={
            <>
              {templateStepIndex > 0 ? (
                <button className="btn-ghost" type="button" onClick={() => setTemplateStep(templateWizardSteps[templateStepIndex - 1].key)}>
                  Indietro
                </button>
              ) : null}
              {templateStepIndex < templateWizardSteps.length - 1 ? (
                <button className="btn-secondary" type="button" onClick={() => setTemplateStep(templateWizardSteps[templateStepIndex + 1].key)}>
                  Avanti
                </button>
              ) : (
                <>
                  <button className="btn-secondary" type="button" onClick={() => void handleDuplicateTemplate()} disabled={templateForm.id == null}>
                    Duplica
                  </button>
                  {!templateForm.is_system ? (
                    <>
                      <button className="btn-secondary" type="button" onClick={() => void handleArchiveTemplate()} disabled={templateForm.id == null}>
                        Archivia
                      </button>
                      <button className="btn-secondary text-red-600 hover:text-red-700" type="button" onClick={() => setTemplatePendingDelete(templates.find((template) => template.id === templateForm.id) || null)} disabled={templateForm.id == null}>
                        Elimina
                      </button>
                    </>
                  ) : null}
                  <button className="btn-primary" type="button" disabled={savingTemplate || templateForm.is_system} onClick={() => void saveTemplate()}>
                    {templateForm.id ? "Salva modello" : "Crea modello"}
                  </button>
                </>
              )}
            </>
          }
        />
        <div className="px-4 py-6 md:px-8">
          {detailLoading ? (
            <Skeleton className="h-[720px] w-full rounded-[1.8rem]" />
          ) : (
            <>
            <div className="mb-6">
              <StepRail steps={templateWizardSteps} active={templateStep} onSelect={setTemplateStep} />
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
              <div className="space-y-6">
                {templateStep === "essentials" ? (
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
                ) : null}

                {templateStep === "essentials" ? (
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
                ) : null}

                {templateStep === "message" ? (
                  <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                    <SectionPlanner
                      order={templateSectionOrder}
                      selected={selectedTemplateSection}
                      onSelect={setSelectedTemplateSection}
                      onChange={(next) => setTemplateForm((prev) => ({ ...prev, design: { ...prev.design, section_order: next } }))}
                      title="Step 2 · Messaggio"
                      description="Riordina i blocchi del modello con drag and drop e modifica una sezione per volta."
                    />
                    {renderTemplateSectionEditor()}
                  </div>
                ) : null}

                {templateStep !== "essentials" ? (
                <section className={sectionCardClass}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Variabili disponibili</p>
                  <p className="mt-2 text-sm text-neutral-600">I placeholder restano visibili nello stesso flusso di editing, senza pannelli stretti laterali.</p>
                  <div className="mt-4"><VariableCloud variables={variables} /></div>
                </section>
                ) : null}
              </div>

              <aside className="space-y-6 xl:sticky xl:top-28 xl:self-start">
                {templateStep === "review" ? (
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
                ) : null}

                {templateStep === "review" ? (
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
                ) : null}

                {templateStep === "review" ? (
                <section className={sectionCardClass}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Sticky Preview</p>
                  <div className="mt-4 rounded-[1.4rem] border border-neutral-200 bg-neutral-50 p-4">
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-neutral-900">{templatePreview?.subject || templateForm.subject || "Anteprima modello"}</p>
                      <p className="mt-1 text-xs text-neutral-500">{selectedTemplateLinkedForm ? `Collegato al form ${selectedTemplateLinkedForm?.title}` : "Nessun form collegato"}</p>
                    </div>
                    <div className="rounded-[1.2rem] bg-white p-3">
                      {templatePreview?.body_html ? (
                        <SandboxedEmailPreview html={templatePreview?.body_html || ""} title="Anteprima modello" />
                      ) : (
                        <div className="whitespace-pre-wrap text-sm leading-6 text-neutral-600">{templateForm.body || "Compila oggetto e contenuto per vedere l'anteprima."}</div>
                      )}
                    </div>
                  </div>
                </section>
                ) : null}
              </aside>
            </div>
            {templateStep === "review" ? (
              <div className="mt-6">
                <PreviewCanvas
                  eyebrow="Anteprima modello"
                  title={templateForm.name.trim() || "Nuovo modello"}
                  subject={templatePreview?.subject || templateForm.subject || "Compila oggetto e contenuto per attivare la preview."}
                  linkedFormLabel={selectedTemplateLinkedForm ? `Collegato al form ${selectedTemplateLinkedForm?.title}` : "Nessun form collegato"}
                  previewHtml={templatePreview?.body_html}
                  fallbackText={templateForm.body || "Compila oggetto e contenuto per vedere l'anteprima."}
                  sidebarNote={<div className="rounded-[1.5rem] border border-neutral-200 bg-[#fbfaf6] p-4"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">Stato modello</p><p className="mt-3 text-sm leading-6 text-neutral-600">{templateForm.is_system ? "Template di sistema: puoi ispezionarlo ma non salvarne modifiche." : templateForm.is_active ? "Modello attivo ? pronto per essere riusato nelle campagne." : "Modello archiviato: puoi riattivarlo o duplicarlo."}</p></div>}
                />
              </div>
            ) : null}
            </>
          )}
        </div>
      </div>
      {deleteTemplateModal}
      </>
    );
  }

  return libraryView;
}
