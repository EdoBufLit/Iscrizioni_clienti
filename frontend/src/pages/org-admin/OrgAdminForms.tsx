import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  buildOrgAdminFormSubmissionsExportUrl,
  createOrgAdminEmailTemplate,
  createOrgAdminForm,
  createOrgAdminFormField,
  deleteOrgAdminForm,
  deleteOrgAdminFormField,
  fetchOrgAdminBookingEventSeries,
  fetchOrgAdminForm,
  fetchOrgAdminForms,
  fetchOrgAdminFormSubmission,
  fetchOrgAdminFormSubmissions,
  setOrgAdminFormActive,
  previewOrgAdminEmailTemplate,
  updateOrgAdminFormSubmissionStatus,
  updateOrgAdminEmailTemplate,
  updateOrgAdminForm,
  updateOrgAdminFormField,
  type AssociationForm,
  type AssociationFormField,
  type AssociationFormFieldType,
  type AssociationFormType,
  type AssociationFormSubmission,
  type AssociationFormVisibility,
  type OrgAdminBookingEventSeries,
  type OrgAdminEmailTemplate,
} from "../../lib/api";
import { applySeo } from "../../lib/seo";
import { DESTRUCTIVE_ACTION_COPY, formatActionObject } from "../../lib/statusLabels";
import { useToast } from "../../components/ui/ToastProvider";
import { useOrgAdmin } from "./OrgAdminLayout";
import { FormBuilder } from "../../components/forms/builder/FormBuilder";
import {
  createFieldFromPaletteItem,
  decodeField,
  encodeField,
  isBookingBlockField,
  type BuilderField,
} from "../../components/forms/builder/utils";
import { FormPublicCanvas } from "../../components/forms/FormPublicCanvas";
import { ImageUpload } from "../../components/forms/builder/ImageUpload";
import ConfirmModal from "../../components/ui/ConfirmModal";
import SubmissionDecisionModal from "../../components/ui/SubmissionDecisionModal";
import Skeleton from "../../components/ui/Skeleton";
import { useUnsavedChangesGuard } from "../../components/ui/UnsavedChangesProvider";
import { EmptyState, KpiCard, SectionPanel, StatusChip } from "./components/OrgAdminPrimitives";

const inputClass =
  "mt-1 w-full rounded-[1.1rem] border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-neutral-900/40 focus:ring-2 focus:ring-neutral-900/10";
const labelClass = "block text-sm font-medium text-neutral-700";
const BOOKING_BLOCK_MAPPING_VALUE = "__booking_block";

type EditorTab = "builder" | "design" | "settings" | "responses";
type PageStyleOption = "editorial" | "minimal" | "spotlight";
type BookingMappingTarget =
  | "customer_name"
  | "customer_email"
  | "customer_phone"
  | "booking_date"
  | "booking_time"
  | "party_size"
  | "notes";

const editorTabs: Array<{ key: EditorTab; label: string; hint: string }> = [
  { key: "builder", label: "Struttura", hint: "Campi e layout" },
  { key: "design", label: "Stile", hint: "Testi, colori, immagini" },
  { key: "settings", label: "Impostazioni", hint: "Notifiche e accesso" },
  { key: "responses", label: "Risposte", hint: "Invii ricevuti" },
];

function editorTabIcon(tab: EditorTab) {
  if (tab === "builder") {
    return (
      <svg className="h-[1.05rem] w-[1.05rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="5" width="16" height="14" rx="2.5" />
        <path d="M9 5v14M4 10.5h16" />
      </svg>
    );
  }
  if (tab === "design") {
    return (
      <svg className="h-[1.05rem] w-[1.05rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 20h4l10-10-4-4L4 16v4Z" />
        <path d="m12.5 7.5 4 4" />
      </svg>
    );
  }
  if (tab === "settings") {
    return (
      <svg className="h-[1.05rem] w-[1.05rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Z" />
        <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1.2 1.2a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.7a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1.2-1.2a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.7a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1.2-1.2a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.7a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1.2 1.2a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1 1 0 0 1 1 1v1.7a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6Z" />
      </svg>
    );
  }
  return (
    <svg className="h-[1.05rem] w-[1.05rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 7.5h12M6 12h12M6 16.5h8" />
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    </svg>
  );
}

const pageStyleOptions: Array<{
  value: PageStyleOption;
  label: string;
  hint: string;
}> = [
  { value: "editorial", label: "Editorial", hint: "Look premium da pagina evento o richiesta." },
  { value: "minimal", label: "Minimal", hint: "Pulito, leggero e immediato." },
  { value: "spotlight", label: "Spotlight", hint: "Più scenografico, con hero forte." },
];

const fontPresetOptions: Array<{
  value: "classic" | "modern" | "serif";
  label: string;
  hint: string;
}> = [
  { value: "classic", label: "Classico", hint: "Titoli editoriali e testo morbido." },
  { value: "modern", label: "Moderno", hint: "Sans pulito, piu compatto e operativo." },
  { value: "serif", label: "Elegante", hint: "Serif piu marcato per eventi premium." },
];

const fieldTypeOptions: Array<{
  value: AssociationFormFieldType;
  label: string;
  icon: string;
  hint: string;
}> = [
  { value: "short_text", label: "Testo breve", icon: "Aa", hint: "Per nome, titolo, codice o risposta corta." },
  { value: "long_text", label: "Testo lungo", icon: "¶", hint: "Per note, richieste o messaggi più lunghi." },
  { value: "email", label: "Email", icon: "@", hint: "Raccoglie email valida e abilita conferme utente." },
  { value: "phone", label: "Telefono", icon: "☎", hint: "Numero di contatto rapido." },
  { value: "number", label: "Numero", icon: "123", hint: "Quantità, posti o valori numerici." },
  { value: "date", label: "Data", icon: "◷", hint: "Per appuntamenti, scadenze o disponibilità." },
  { value: "time", label: "Orario", icon: "00", hint: "Ora e minuti, ad esempio 20:30." },
  { value: "select", label: "Select", icon: "▾", hint: "Una scelta da menu." },
  { value: "radio", label: "Radio", icon: "◉", hint: "Una scelta tra poche opzioni visibili." },
  { value: "checkbox", label: "Checkbox", icon: "☑", hint: "Più opzioni selezionabili." },
  { value: "consent", label: "Consenso", icon: "✓", hint: "Privacy, termini o autorizzazioni." },
];

// formTypeOptions removed

const bookingMappingTargets: Array<{ key: BookingMappingTarget; label: string; hint: string }> = [
  { key: "customer_name", label: "Nome cliente", hint: "Nome mostrato nella prenotazione." },
  { key: "customer_email", label: "Email cliente", hint: "Serve per conferme e aggiornamenti." },
  { key: "customer_phone", label: "Telefono cliente", hint: "Contatto rapido." },
  { key: "booking_date", label: "Data prenotazione", hint: "Campo data da usare in agenda." },
  { key: "booking_time", label: "Orario prenotazione", hint: "Campo orario della prenotazione." },
  { key: "party_size", label: "Numero persone", hint: "Dimensione gruppo o coperti." },
  { key: "notes", label: "Note", hint: "Richieste speciali o dettagli utili." },
];

const weekdayLabels = ["Lunedi", "Martedi", "Mercoledi", "Giovedi", "Venerdi", "Sabato", "Domenica"];

function formatBookingSeriesWhen(series: OrgAdminBookingEventSeries): string {
  if (series.recurrence_type === "weekly" && series.weekday !== null && series.weekday !== undefined) {
    return weekdayLabels[Number(series.weekday)] || `Giorno ${Number(series.weekday) + 1}`;
  }
  if (series.specific_date || series.event_date) {
    const rawDate = series.specific_date || series.event_date || "";
    const parsedDate = new Date(`${rawDate}T00:00:00`);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
    return rawDate;
  }
  return "Regola";
}

function formatBookingSeriesSlots(series: OrgAdminBookingEventSeries): string {
  if (series.is_closed) return "Chiusura";
  const slots = (series.time_slots || [])
    .map((slot) => String(slot.time || slot.start_time || "").slice(0, 5))
    .filter(Boolean);
  return slots.length ? slots.join(", ") : "Nessuno slot";
}

const submissionStatusMeta: Record<string, { label: string; className: string }> = {
  pending: { label: "In attesa", className: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200" },
  confirmed: { label: "Confermata", className: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200" },
  rejected: { label: "Rigettata", className: "bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200" },
};

function normalizeEditorTab(value: string | null | undefined): EditorTab {
  if (value === "builder" || value === "design" || value === "settings" || value === "responses") {
    return value;
  }
  return "builder";
}

function submissionStatusLabel(status: string | null | undefined) {
  return submissionStatusMeta[(status || "").toLowerCase()] ?? {
    label: status || "Sconosciuto",
    className: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200",
  };
}

function submissionTone(status: string | null | undefined): "success" | "warning" | "danger" | "muted" {
  const normalized = (status || "pending").toLowerCase();
  if (normalized === "confirmed") return "success";
  if (normalized === "rejected") return "danger";
  if (normalized === "pending") return "warning";
  return "muted";
}

function slugifyKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function derivePublicSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

function stringifySubmissionValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => stringifySubmissionValue(item)).join(", ");
  if (typeof value === "boolean") return value ? "Si" : "No";
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const label = record.name || record.filename || record.file_name || record.original_name || record.download_url || record.url;
    if (label) return String(label);
    return JSON.stringify(record);
  }
  return String(value);
}

function emptyFormDraft() {
  return {
    title: "",
    description: "",
    accent_color: "#0f766e",
    submit_button_text: "Invia richiesta",
    show_logo: true,
    cover_image_url: "",
    page_style: "editorial" as PageStyleOption,
    font_preset: "classic" as "classic" | "modern" | "serif" | string,
    public_slug: "",
    is_active: false,
    visibility: "public" as AssociationFormVisibility,
    success_message: "Richiesta inviata correttamente.",
    notification_email: "",
    allow_multiple_submissions: true,
    form_type: "generic" as AssociationFormType,
    booking_enabled: false,
    booking_requires_manual_confirmation: true,
    booking_success_message_override: "",
    booking_notification_enabled: true,
    booking_admin_confirmation_email_enabled: true,
    booking_admin_confirmation_email_subject: "",
    booking_admin_confirmation_email_body: "",
    booking_auto_assign_enabled: false,
    booking_field_mapping: {} as Record<string, string>,
    booking_event_date: "",
    booking_event_time: "",
    booking_event_details: "",
    booking_dynamic_events_enabled: false,
    booking_availability_mode: "all" as "all" | "selected" | string,
    booking_event_series_ids: [] as number[],
    survey_post_event_enabled: false,
    survey_post_event_delay_hours: 2,
    survey_post_event_message_template: "",
    notify_admin_on_submit: true,
    send_user_confirmation: true,
    whatsapp_auto_reply_enabled: false,
    whatsapp_auto_reply_template: "",
    whatsapp_confirmation_template: "",
    whatsapp_rejection_template: "",
    admin_notification_template_id: null as number | null,
    user_confirmation_template_id: null as number | null,
    create_internal_request: false,
    create_booking: false,
  };
}

function createSeededFormDraft(mode: "forms" | "surveys" = "forms") {
  const defaultTitle = mode === "surveys" ? "Nuovo sondaggio" : "Nuovo form";
  return {
    ...emptyFormDraft(),
    title: defaultTitle,
    submit_button_text: mode === "surveys" ? "Invia sondaggio" : "Invia richiesta",
    success_message: mode === "surveys" ? "Grazie, risposta registrata." : "Richiesta inviata correttamente.",
    form_type: mode === "surveys" ? ("survey" as AssociationFormType) : ("generic" as AssociationFormType),
    public_slug: derivePublicSlug(defaultTitle),
  };
}

function draftFromAssociationForm(form: AssociationForm) {
  return {
    ...emptyFormDraft(),
    title: form.title || "",
    description: form.description || "",
    accent_color: form.accent_color || "#0f766e",
    submit_button_text: form.submit_button_text || "Invia richiesta",
    show_logo: Boolean(form.show_logo),
    cover_image_url: form.cover_image_url || "",
    page_style: (form.page_style as PageStyleOption) || "editorial",
    font_preset: form.font_preset || form.design?.font_preset || "classic",
    public_slug: form.public_slug || "",
    is_active: Boolean(form.is_active),
    visibility: form.visibility,
    success_message: form.success_message || "",
    notification_email: form.notification_email || "",
    allow_multiple_submissions: Boolean(form.allow_multiple_submissions),
    form_type: form.form_type || "generic",
    booking_enabled: Boolean(form.booking_enabled || form.create_booking),
    booking_requires_manual_confirmation: Boolean(form.booking_requires_manual_confirmation),
    booking_success_message_override: form.booking_success_message_override || "",
    booking_notification_enabled: Boolean(form.booking_notification_enabled),
    booking_admin_confirmation_email_enabled: form.booking_admin_confirmation_email_enabled !== false,
    booking_admin_confirmation_email_subject: form.booking_admin_confirmation_email_subject || "",
    booking_admin_confirmation_email_body: form.booking_admin_confirmation_email_body || "",
    booking_auto_assign_enabled: Boolean(form.booking_auto_assign_enabled),
    booking_field_mapping: form.booking_field_mapping || {},
    booking_event_date: form.booking_event_date || "",
    booking_event_time: form.booking_event_time || "",
    booking_event_details: form.booking_event_details || "",
    booking_dynamic_events_enabled: Boolean(form.booking_dynamic_events_enabled),
    booking_availability_mode: form.booking_availability_mode || form.actions?.booking_availability_mode || "all",
    booking_event_series_ids: Array.isArray(form.booking_event_series_ids)
      ? form.booking_event_series_ids
      : Array.isArray(form.actions?.booking_event_series_ids)
        ? form.actions.booking_event_series_ids
        : [],
    survey_post_event_enabled: Boolean(form.survey_post_event_enabled),
    survey_post_event_delay_hours: form.survey_post_event_delay_hours || 2,
    survey_post_event_message_template: form.survey_post_event_message_template || "",
    notify_admin_on_submit: Boolean(form.notify_admin_on_submit),
    send_user_confirmation: Boolean(form.send_user_confirmation),
    whatsapp_auto_reply_enabled: Boolean(form.whatsapp_auto_reply_enabled),
    whatsapp_auto_reply_template: form.whatsapp_auto_reply_template || "",
    whatsapp_confirmation_template: form.whatsapp_confirmation_template || "",
    whatsapp_rejection_template: form.whatsapp_rejection_template || "",
    admin_notification_template_id: form.admin_notification_template_id,
    user_confirmation_template_id: form.user_confirmation_template_id,
    create_internal_request: Boolean(form.create_internal_request),
    create_booking: Boolean(form.create_booking),
  };
}

function serializeFormDraft(value: ReturnType<typeof emptyFormDraft>) {
  return JSON.stringify(value);
}

function serializeBuilderFields(fields: BuilderField[]) {
  return JSON.stringify(
    fields.map((field, index) => ({
      id: field.id > 0 ? field.id : null,
      index,
      type: field.type,
      key: field.key,
      label: field.label,
      placeholder: field.placeholder,
      helpText: field.helpText,
      required: field.required,
      optionsText: field.optionsText,
      width: field.width,
      hideLabel: field.hideLabel,
      surveyKind: field.surveyKind || null,
    })),
  );
}

type UserConfirmationEmailDraft = {
  id: number | null;
  sourceTemplateId: number | null;
  isSystemSource: boolean;
  name: string;
  subject: string;
  bodyText: string;
};

type UserConfirmationPreview = {
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
};

function stripHtmlToText(value: string | null | undefined): string {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function defaultUserConfirmationEmailDraft(formTitle: string): UserConfirmationEmailDraft {
  const title = formTitle.trim() || "{{titolo_form}}";
  return {
    id: null,
    sourceTemplateId: null,
    isSystemSource: false,
    name: `${title} - conferma utente`,
    subject: `Conferma invio: ${title}`,
    bodyText:
      "Ciao {{nome_socio}},\n\n" +
      "abbiamo ricevuto la tua richiesta per {{titolo_form}}.\n\n" +
      "Ti ricontatteremo se serviranno altri dettagli.\n\n" +
      "{{nome_associazione}}",
  };
}

function buildUserConfirmationEmailDraft(
  template: OrgAdminEmailTemplate | null | undefined,
  formTitle: string,
): UserConfirmationEmailDraft {
  if (!template) {
    return defaultUserConfirmationEmailDraft(formTitle);
  }
  const fallback = defaultUserConfirmationEmailDraft(formTitle);
  return {
    id: template.is_system ? null : template.id,
    sourceTemplateId: template.id,
    isSystemSource: Boolean(template.is_system),
    name: template.is_system ? `${formTitle || "Form"} - conferma utente` : template.name,
    subject: template.subject || fallback.subject,
    bodyText: template.body_text || stripHtmlToText(template.compiled_html || template.body_html) || fallback.bodyText,
  };
}

function emptyFieldDraft(form?: AssociationForm | null, fieldType: AssociationFormFieldType = "short_text") {
  const option = fieldTypeOptions.find((item) => item.value === fieldType);
  const label = option ? option.label : "Nuovo campo";
  return {
    field_key: slugifyKey(label),
    field_type: fieldType,
    label,
    placeholder: "",
    help_text: "",
    is_required: false,
    sort_order: ((form?.fields?.length ?? 0) + 1) * 10,
    options_text: fieldType === "select" || fieldType === "radio" || fieldType === "checkbox" ? "Opzione 1, Opzione 2" : "",
  };
}

function buildPreviewValues(fields: AssociationFormField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.field_type === "checkbox") values[field.field_key] = [field.options[0]].filter(Boolean);
    else if (field.field_type === "consent") values[field.field_key] = true;
    else if (field.field_type === "select" || field.field_type === "radio") values[field.field_key] = field.options[0] || "";
    else if (field.field_type === "email") values[field.field_key] = "mario@example.com";
    else if (field.field_type === "phone") values[field.field_key] = "+39 333 1234567";
    else if (field.field_type === "date") values[field.field_key] = "2026-03-20";
    else if (field.field_type === "time") values[field.field_key] = "20:30";
    else if (field.field_type === "number") values[field.field_key] = "2";
    else values[field.field_key] = "Anteprima contenuto";
  }
  return values;
}

function builderFieldToPreviewField(
  field: BuilderField,
  formId: number,
  sortOrder: number,
): AssociationFormField {
  const payload = encodeField(field, sortOrder);
  return {
    id: field.id,
    form_id: formId,
    field_key: payload.field_key || field.key,
    field_type: payload.field_type,
    label: payload.label,
    placeholder: payload.placeholder,
    help_text: payload.help_text,
    is_required: payload.is_required,
    sort_order: payload.sort_order,
    options: (payload.options || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

function buildPreviewFields(fields: BuilderField[], formId: number): AssociationFormField[] {
  return fields.map((field, index) => builderFieldToPreviewField(field, formId, (index + 1) * 10));
}

function decodeBuilderFields(form: AssociationForm | null | undefined): BuilderField[] {
  return [...(form?.fields || [])]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map(decodeField);
}

function upsertAssociationFormField(
  fields: AssociationFormField[],
  field: AssociationFormField,
): AssociationFormField[] {
  const next = fields.filter((item) => item.id !== field.id && item.field_key !== field.field_key);
  next.push(field);
  return next.sort((left, right) => left.sort_order - right.sort_order);
}

function removeAssociationFormField(
  fields: AssociationFormField[],
  fieldId: number,
): AssociationFormField[] {
  return fields.filter((item) => item.id !== fieldId);
}

function buildFieldPayload(draft: ReturnType<typeof emptyFieldDraft>) {
  return {
    field_key: draft.field_key || null,
    field_type: draft.field_type,
    label: draft.label,
    placeholder: draft.placeholder || null,
    help_text: draft.help_text || null,
    is_required: draft.is_required,
    sort_order: Number(draft.sort_order || 0),
    options: draft.options_text || null,
  };
}

type OrgAdminFormsWorkspaceProps = {
  embedded?: boolean;
  locked?: boolean;
  lockedMessage?: string;
  availableTemplates?: OrgAdminEmailTemplate[];
  mode?: "forms" | "surveys";
};

export function OrgAdminFormsWorkspace({
  embedded = false,
  locked = false,
  lockedMessage = "I Form richiedono il modulo Comunicazioni attivo.",
  availableTemplates = [],
  mode = "forms",
}: OrgAdminFormsWorkspaceProps) {
  const { admin, loading: adminLoading } = useOrgAdmin();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forms, setForms] = useState<AssociationForm[]>([]);
  const [localTemplates, setLocalTemplates] = useState<OrgAdminEmailTemplate[]>(availableTemplates);
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);
  const [isCreatingForm, setIsCreatingForm] = useState(false);
  const [selectedForm, setSelectedForm] = useState<AssociationForm | null>(null);
  const [builderDraftFields, setBuilderDraftFields] = useState<BuilderField[]>([]);
  const [formDraft, setFormDraft] = useState(emptyFormDraft());
  const [savingForm, setSavingForm] = useState(false);
  const [bookingEventSeries, setBookingEventSeries] = useState<OrgAdminBookingEventSeries[]>([]);
  const [bookingEventSeriesLoading, setBookingEventSeriesLoading] = useState(false);
  const [bookingEventSeriesError, setBookingEventSeriesError] = useState("");

  const [realPreviewOpen, setRealPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");

  const [deleteFormOpen, setDeleteFormOpen] = useState(false);
  const [deleteActionState, setDeleteActionState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [activeTab, setActiveTab] = useState<EditorTab>("builder");
  const [userEmailDraft, setUserEmailDraft] = useState<UserConfirmationEmailDraft>(() =>
    defaultUserConfirmationEmailDraft(""),
  );
  const [userEmailPreview, setUserEmailPreview] = useState<UserConfirmationPreview | null>(null);
  const [userEmailPreviewLoading, setUserEmailPreviewLoading] = useState(false);
  const [savingUserEmailTemplate, setSavingUserEmailTemplate] = useState(false);

  const [fieldDraft, setFieldDraft] = useState(emptyFieldDraft(null));
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [fieldKeyManual, setFieldKeyManual] = useState(false);
  const [, setSavingField] = useState(false);
  const [deleteFieldConfirmId, setDeleteFieldConfirmId] = useState<number | null>(null);
  const [draggingFieldId, setDraggingFieldId] = useState<number | null>(null);
  const [, setReorderingFields] = useState(false);

  const [submissions, setSubmissions] = useState<AssociationFormSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<AssociationFormSubmission | null>(null);
  const [submissionActionState, setSubmissionActionState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [submissionActionError, setSubmissionActionError] = useState<string | null>(null);
  const [confirmActionOpen, setConfirmActionOpen] = useState<false | "confirmed" | "pending">(false);
  const [rejectActionOpen, setRejectActionOpen] = useState(false);

  const requestedFormId = useMemo(() => {
    const rawValue = searchParams.get("formId");
    if (!rawValue) return null;
    const parsedValue = Number(rawValue);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
  }, [searchParams]);
  const requestedFormTab = useMemo(
    () => normalizeEditorTab(searchParams.get("formTab")),
    [searchParams],
  );

  useEffect(() => {
    if (embedded) return;
    applySeo({
      title: "Form Studio",
      description: "Builder visuale per pagine form pubbliche nell'area org admin.",
      noindex: true,
    });
  }, [embedded]);

  useEffect(() => {
    setLocalTemplates(availableTemplates);
  }, [availableTemplates]);

  useEffect(() => {
    if (adminLoading || !admin) return;
    if (locked) {
      setLoading(false);
      setForms([]);
      setIsCreatingForm(false);
      setSelectedFormId(null);
      setSelectedForm(null);
      return;
    }
    void loadForms();
  }, [adminLoading, admin, locked]);

  useEffect(() => {
    if (adminLoading || !admin || locked) {
      setBookingEventSeries([]);
      setBookingEventSeriesError("");
      setBookingEventSeriesLoading(false);
      return;
    }
    setBookingEventSeriesLoading(true);
    setBookingEventSeriesError("");
    fetchOrgAdminBookingEventSeries()
      .then((response) => {
        setBookingEventSeries(response.items || []);
      })
      .catch((err) => {
        setBookingEventSeries([]);
        setBookingEventSeriesError(err instanceof Error ? err.message : "Errore caricamento serate.");
      })
      .finally(() => setBookingEventSeriesLoading(false));
  }, [adminLoading, admin, locked]);

  useEffect(() => {
    if (adminLoading || loading || locked || !requestedFormId) return;
    if (!forms.some((item) => item.id === requestedFormId)) return;
    if (selectedFormId !== requestedFormId) {
      void openFormEditor(requestedFormId, { initialTab: requestedFormTab, syncQuery: false });
      return;
    }
    if (activeTab !== requestedFormTab) {
      setActiveTab(requestedFormTab);
    }
  }, [
    activeTab,
    adminLoading,
    forms,
    loading,
    locked,
    requestedFormId,
    requestedFormTab,
    selectedFormId,
  ]);

  useEffect(() => {
    if (!selectedForm) {
      if (!isCreatingForm) {
        setFormDraft(emptyFormDraft());
      }
      setBuilderDraftFields([]);
      setFieldDraft(emptyFieldDraft(null));
      setEditingFieldId(null);
      setFieldKeyManual(false);
      return;
    }
    setFormDraft(draftFromAssociationForm(selectedForm));
    const firstField = selectedForm.fields[0] || null;
    if (firstField) {
      handleEditField(firstField);
    } else {
      setFieldDraft(emptyFieldDraft(selectedForm));
      setEditingFieldId(null);
      setFieldKeyManual(false);
    }
    setDeleteFormOpen(false);
  }, [isCreatingForm, selectedForm]);

  useEffect(() => {
    if (!selectedFormId || activeTab !== "responses") {
      if (!selectedFormId) {
        setSubmissions([]);
        setSelectedSubmission(null);
      }
      return;
    }
    void loadSubmissions(selectedFormId);
  }, [activeTab, selectedFormId]);

  const orgSlug = admin?.organization?.slug || "";
  const publicPath = useMemo(() => {
    const slug = formDraft.public_slug || derivePublicSlug(formDraft.title) || selectedForm?.public_slug;
    if (!slug) return "";
    return orgSlug ? `/forms/${orgSlug}/${slug}` : `/forms/${slug}`;
  }, [formDraft.public_slug, formDraft.title, orgSlug, selectedForm?.public_slug]);
  const publicUrl = useMemo(() => {
    if (!publicPath) return "";
    return `${window.location.origin}${publicPath}`;
  }, [publicPath]);
  const selectedFormUrl = useMemo(() => {
    const path = selectedForm?.public_path || publicPath;
    if (!path) return "";
    return `${window.location.origin}${path}`;
  }, [publicPath, selectedForm?.public_path]);
  const isEditorOpen = isCreatingForm || selectedFormId !== null;
  const visibleForms = useMemo(
    () => forms.filter((form) => (mode === "surveys" ? form.form_type === "survey" : form.form_type !== "survey")),
    [forms, mode],
  );
  const previewFields = useMemo(
    () => buildPreviewFields(builderDraftFields, selectedForm?.id ?? selectedFormId ?? 0),
    [builderDraftFields, selectedForm?.id, selectedFormId],
  );
  const sortedFields = useMemo(
    () => [...previewFields].sort((left, right) => left.sort_order - right.sort_order),
    [previewFields],
  );
  const bookingMappingFieldOptions = useMemo(
    () =>
      sortedFields
        .filter((field) => !isBookingBlockField(field))
        .map((field) => ({
          value: field.field_key,
          label: `${field.label} (${field.field_key})`,
          fieldType: field.field_type,
        })),
    [sortedFields],
  );
  const hasBookingBlockField = useMemo(
    () => sortedFields.some((field) => isBookingBlockField(field)),
    [sortedFields],
  );
  const bookingBlockMappingActive = useMemo(
    () =>
      formDraft.booking_field_mapping?.booking_date === BOOKING_BLOCK_MAPPING_VALUE
      || formDraft.booking_field_mapping?.booking_time === BOOKING_BLOCK_MAPPING_VALUE,
    [formDraft.booking_field_mapping],
  );
  const bookingSelectableSeries = useMemo(
    () => bookingEventSeries.filter((item) => item.is_active !== false && !item.is_closed),
    [bookingEventSeries],
  );
  const selectedBookingSeriesIds = useMemo(
    () => new Set((formDraft.booking_event_series_ids || []).map((value) => Number(value)).filter((value) => Number.isFinite(value))),
    [formDraft.booking_event_series_ids],
  );
  const selectedBookingSeriesCount = useMemo(
    () => bookingSelectableSeries.filter((item) => selectedBookingSeriesIds.has(item.id)).length,
    [bookingSelectableSeries, selectedBookingSeriesIds],
  );
  useEffect(() => {
    if (!formDraft.booking_enabled || (bookingMappingFieldOptions.length === 0 && !hasBookingBlockField)) return;
    const byType = (fieldType: AssociationFormFieldType) =>
      bookingMappingFieldOptions.find((option) => option.fieldType === fieldType)?.value || "";
    const validKeys = new Set(bookingMappingFieldOptions.map((option) => option.value));
    if (hasBookingBlockField) validKeys.add(BOOKING_BLOCK_MAPPING_VALUE);
    setFormDraft((current) => {
      const currentMapping = current.booking_field_mapping || {};
      const nextMapping = { ...currentMapping };
      let nextDynamicEventsEnabled = current.booking_dynamic_events_enabled;
      let changed = false;
      if (current.booking_dynamic_events_enabled && hasBookingBlockField) {
        if (nextMapping.booking_date !== BOOKING_BLOCK_MAPPING_VALUE) {
          nextMapping.booking_date = BOOKING_BLOCK_MAPPING_VALUE;
          changed = true;
        }
        if (nextMapping.booking_time !== BOOKING_BLOCK_MAPPING_VALUE) {
          nextMapping.booking_time = BOOKING_BLOCK_MAPPING_VALUE;
          changed = true;
        }
        nextDynamicEventsEnabled = false;
        changed = true;
      }
      const setIfMissingOrDeleted = (target: BookingMappingTarget, value: string) => {
        if (!value) return;
        const currentValue = nextMapping[target] || "";
        if (!currentValue || !validKeys.has(currentValue)) {
          nextMapping[target] = value;
          changed = true;
        }
      };
      setIfMissingOrDeleted("customer_email", byType("email"));
      setIfMissingOrDeleted("customer_phone", byType("phone"));
      setIfMissingOrDeleted("booking_date", byType("date"));
      setIfMissingOrDeleted("booking_time", byType("time"));
      return changed ? { ...current, booking_field_mapping: nextMapping, booking_dynamic_events_enabled: nextDynamicEventsEnabled } : current;
    });
  }, [bookingMappingFieldOptions, formDraft.booking_enabled, hasBookingBlockField]);
  const activeTemplates = useMemo(
    () => localTemplates.filter((item) => item.is_active),
    [localTemplates],
  );
  const selectedUserConfirmationTemplate = useMemo(
    () => activeTemplates.find((item) => item.id === formDraft.user_confirmation_template_id) || null,
    [activeTemplates, formDraft.user_confirmation_template_id],
  );
  useEffect(() => {
    setUserEmailDraft(buildUserConfirmationEmailDraft(selectedUserConfirmationTemplate, formDraft.title));
  }, [formDraft.user_confirmation_template_id, selectedUserConfirmationTemplate, selectedForm?.id]);

  useEffect(() => {
    if (!formDraft.send_user_confirmation) {
      setUserEmailPreview(null);
      setUserEmailPreviewLoading(false);
      return;
    }
    const previewDraft = userEmailDraft;
    const timer = window.setTimeout(() => {
      setUserEmailPreviewLoading(true);
      previewOrgAdminEmailTemplate({
        template_id: previewDraft.sourceTemplateId || undefined,
        subject: previewDraft.subject,
        body_text: previewDraft.bodyText,
        body_html: null,
        compiled_html: null,
        linked_form_id: selectedFormId || undefined,
      })
        .then((response) => {
          setUserEmailPreview({
            subject: response.preview.subject,
            bodyHtml: response.preview.body_html,
            bodyText: response.preview.body_text,
          });
        })
        .catch(() => {
          setUserEmailPreview({
            subject: previewDraft.subject,
            bodyHtml: null,
            bodyText: previewDraft.bodyText,
          });
        })
        .finally(() => setUserEmailPreviewLoading(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [formDraft.send_user_confirmation, selectedFormId, userEmailDraft]);
  const previewValues = useMemo(
    () => {
      const values = buildPreviewValues(previewFields);
      if (formDraft.booking_dynamic_events_enabled || previewFields.some((field) => isBookingBlockField(field))) {
        values.__booking_date = "2026-03-20";
        values.__booking_event_time = "20:30";
        values.__booking_event_series_id = "";
      }
      return values;
    },
    [formDraft.booking_dynamic_events_enabled, previewFields],
  );
  const selectedSubmissionEntries = useMemo(() => {
    const fieldMap = new Map((selectedForm?.fields || []).map((field) => [field.field_key, field.label]));
    return Object.entries(selectedSubmission?.payload_json || {}).map(([key, value]) => ({
      key,
      label: fieldMap.get(key) || key,
      value,
    }));
  }, [selectedForm?.fields, selectedSubmission?.payload_json]);
  const selectedSubmissionAttachmentEntries = useMemo(
    () =>
      selectedSubmissionEntries.filter((entry) => {
        const value = entry.value;
        if (typeof value === "string") return /\.(pdf|png|jpe?g|docx?|xlsx?)($|\?)/i.test(value);
        if (Array.isArray(value)) return value.some((item) => typeof item === "object" && item !== null);
        if (typeof value === "object" && value !== null) return "name" in value || "filename" in value || "download_url" in value || "url" in value;
        return false;
      }),
    [selectedSubmissionEntries],
  );
  const submissionSummary = useMemo(
    () =>
      submissions.reduce(
        (accumulator, submission) => {
          const status = (submission.status || "pending").toLowerCase();
          accumulator.total += 1;
          if (status === "confirmed") accumulator.confirmed += 1;
          else if (status === "rejected") accumulator.rejected += 1;
          else accumulator.pending += 1;
          if (submission.booking) accumulator.booking += 1;
          return accumulator;
        },
        { total: 0, pending: 0, confirmed: 0, rejected: 0, booking: 0 },
      ),
    [submissions],
  );
  const surveyStats = useMemo(() => {
    const fields = selectedForm?.fields || [];
    const decodedFields = fields.map((field) => ({ raw: field, decoded: decodeField(field) }));
    const scaleFields = decodedFields.filter(
      (item) => item.decoded.type === "rating_1_5" || item.decoded.type === "nps_0_10",
    );
    const choiceFields = decodedFields.filter((item) => ["radio", "checkbox", "select"].includes(item.decoded.type));
    const textFields = decodedFields.filter((item) => item.decoded.type === "long_text" || item.decoded.type === "short_text");
    const numericValues = (kind: "rating_1_5" | "nps_0_10") =>
      scaleFields
        .filter((item) => item.decoded.type === kind)
        .flatMap((item) =>
          submissions
            .map((submission) => Number(submission.payload_json?.[item.raw.field_key]))
            .filter((value) => Number.isFinite(value)),
        );
    const average = (values: number[]) =>
      values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const scaleStats = scaleFields.map((item) => {
      const options = item.decoded.optionsText.split(",").map((option) => option.trim()).filter(Boolean);
      const counts = new Map(options.map((option) => [option, 0]));
      let total = 0;
      for (const submission of submissions) {
        const value = submission.payload_json?.[item.raw.field_key];
        if (value == null || value === "") continue;
        const key = String(value);
        counts.set(key, (counts.get(key) || 0) + 1);
        total += 1;
      }
      const values = Array.from(counts.values());
      const max = values.length ? Math.max(...values) : 0;
      return { key: item.raw.field_key, label: item.raw.label, options, counts, total, max };
    });
    const choiceStats = choiceFields.map((item) => {
      const options = item.decoded.optionsText.split(",").map((option) => option.trim()).filter(Boolean);
      const counts = new Map(options.map((option) => [option, 0]));
      for (const submission of submissions) {
        const value = submission.payload_json?.[item.raw.field_key];
        const values = Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
        for (const option of values) counts.set(option, (counts.get(option) || 0) + 1);
      }
      const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
      const max = Math.max(0, ...Array.from(counts.values()));
      return { key: item.raw.field_key, label: item.raw.label, options, counts, total, max };
    });
    const comments = submissions.flatMap((submission) =>
      textFields
        .map((item) => ({
          key: `${submission.id}-${item.raw.field_key}`,
          label: item.raw.label,
          value: String(submission.payload_json?.[item.raw.field_key] || "").trim(),
          submittedAt: submission.submitted_at,
        }))
        .filter((item) => item.value.length > 0),
    );
    const ratingValues = numericValues("rating_1_5");
    const npsValues = numericValues("nps_0_10");
    return {
      total: submissions.length,
      ratingAverage: average(ratingValues),
      npsAverage: average(npsValues),
      scaleStats,
      choiceStats,
      comments,
      responseRateLabel: submissions.length === 1 ? "1 risposta ricevuta" : `${submissions.length} risposte ricevute`,
    };
  }, [selectedForm?.fields, submissions]);
  const selectedSubmissionStatus = submissionStatusLabel(selectedSubmission?.status);
  const deleteFieldTarget = selectedForm?.fields.find((field) => field.id === deleteFieldConfirmId) || null;
  const hasUnsavedFormWorkspaceChanges = useMemo(() => {
    if (loading || savingForm || locked || activeTab === "responses") return false;
    if (isCreatingForm) {
      return (
        serializeFormDraft(formDraft) !== serializeFormDraft(createSeededFormDraft(mode))
        || builderDraftFields.length > 0
      );
    }
    if (!selectedForm) return false;
    return (
      serializeFormDraft(formDraft) !== serializeFormDraft(draftFromAssociationForm(selectedForm))
      || serializeBuilderFields(builderDraftFields) !== serializeBuilderFields(decodeBuilderFields(selectedForm))
    );
  }, [activeTab, builderDraftFields, formDraft, isCreatingForm, loading, locked, mode, savingForm, selectedForm]);

  useUnsavedChangesGuard({
    when: hasUnsavedFormWorkspaceChanges,
    title: mode === "surveys" ? "Sondaggio non salvato" : "Form non salvato",
    message:
      mode === "surveys"
        ? "Hai modifiche al sondaggio non ancora salvate. Se esci ora, le perderai."
        : "Hai modifiche al form non ancora salvate. Se esci ora, le perderai.",
    blockOnSearchChange: false,
  });

  function resetEditorState() {
    syncWorkspaceQuery({ formId: null, formTab: null });
    setIsCreatingForm(false);
    setSelectedFormId(null);
    setSelectedForm(null);
    setBuilderDraftFields([]);
    setFormDraft(emptyFormDraft());
    setFieldDraft(emptyFieldDraft(null));
    setEditingFieldId(null);
    setFieldKeyManual(false);
    setDeleteFormOpen(false);
    setDeleteFieldConfirmId(null);
    setSubmissions([]);
    setSelectedSubmission(null);
    setUserEmailDraft(defaultUserConfirmationEmailDraft(""));
    setUserEmailPreview(null);
    setActiveTab("builder");
    setRealPreviewOpen(false);
  }

  function syncWorkspaceQuery({
    formId,
    formTab,
  }: {
    formId?: number | null;
    formTab?: EditorTab | null;
  }) {
    const nextParams = new URLSearchParams(searchParams);
    if (typeof formId === "number" && formId > 0) nextParams.set("formId", String(formId));
    else nextParams.delete("formId");
    if (formTab) nextParams.set("formTab", formTab);
    else nextParams.delete("formTab");
    setSearchParams(nextParams, { replace: true });
  }

  function handleEditorTabChange(nextTab: EditorTab) {
    setActiveTab(nextTab);
    if (selectedFormId) {
      syncWorkspaceQuery({ formId: selectedFormId, formTab: nextTab });
    }
  }

  async function openFormEditor(
    formId: number,
    options?: { initialTab?: EditorTab; syncQuery?: boolean },
  ) {
    const detail = await fetchOrgAdminForm(formId);
    const initialTab = options?.initialTab ?? "builder";
    setIsCreatingForm(false);
    setSelectedFormId(detail.form.id);
    setSelectedForm(detail.form);
    setBuilderDraftFields(decodeBuilderFields(detail.form));
    setForms((current) => current.map((item) => (item.id === detail.form.id ? detail.form : item)));
    setDeleteFormOpen(false);
    setActiveTab(initialTab);
    if (options?.syncQuery !== false) {
      syncWorkspaceQuery({ formId: detail.form.id, formTab: initialTab });
    }
    return detail.form;
  }

  async function loadForms(nextSelectedId?: number | null) {
    if (locked) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetchOrgAdminForms();
      setForms(response.items);
      if (typeof nextSelectedId === "number") {
        await openFormEditor(nextSelectedId);
      } else if (nextSelectedId === null) {
        resetEditorState();
      } else if (!isEditorOpen && !requestedFormId) {
        resetEditorState();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento form.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSubmissions(formId: number) {
    setSubmissionsLoading(true);
    try {
      const response = await fetchOrgAdminFormSubmissions(formId);
      setSubmissions(response.items);
      setSelectedForm(response.form);
      setBuilderDraftFields(decodeBuilderFields(response.form));
      setForms((current) => current.map((item) => (item.id === response.form.id ? response.form : item)));
      if (response.items.length > 0) {
        const preferredSubmission =
          response.items.find((item) => item.id === selectedSubmission?.id) || response.items[0];
        const detail = await fetchOrgAdminFormSubmission(formId, preferredSubmission.id).catch(() => ({
          submission: preferredSubmission,
        }));
        setSelectedSubmission(detail.submission);
      } else {
        setSelectedSubmission(null);
      }
    } catch (err) {
      showToast({
        tone: "error",
        title: "Risposte non disponibili",
        message: err instanceof Error ? err.message : "Errore caricamento risposte.",
      });
    } finally {
      setSubmissionsLoading(false);
    }
  }

  function syncFormDraft<K extends keyof ReturnType<typeof emptyFormDraft>>(key: K, value: ReturnType<typeof emptyFormDraft>[K]) {
    setFormDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "title" && !current.public_slug) {
        next.public_slug = derivePublicSlug(String(value || ""));
      }
      if (key === "booking_enabled") {
        next.create_booking = Boolean(value);
        if (value && next.form_type === "generic") {
          next.form_type = "booking";
        }
      }
      if (key === "form_type" && value === "booking") {
        next.booking_enabled = true;
        next.create_booking = true;
      }
      return next;
    });
  }

  function syncBookingFieldMapping(target: BookingMappingTarget, fieldKey: string) {
    setFormDraft((current) => {
      const nextMapping = { ...current.booking_field_mapping };
      const isDateOrTime = target === "booking_date" || target === "booking_time";
      if (isDateOrTime && fieldKey === BOOKING_BLOCK_MAPPING_VALUE) {
        nextMapping.booking_date = BOOKING_BLOCK_MAPPING_VALUE;
        nextMapping.booking_time = BOOKING_BLOCK_MAPPING_VALUE;
      } else {
        nextMapping[target] = fieldKey;
        if (isDateOrTime) {
          const sibling = target === "booking_date" ? "booking_time" : "booking_date";
          if (nextMapping[sibling] === BOOKING_BLOCK_MAPPING_VALUE) {
            nextMapping[sibling] = "";
          }
        }
      }
      return {
        ...current,
        booking_field_mapping: nextMapping,
      };
    });
  }

  function toggleBookingSeriesSelection(seriesId: number, checked: boolean) {
    setFormDraft((current) => {
      const currentIds = (current.booking_event_series_ids || [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
      const nextIds = checked
        ? Array.from(new Set([...currentIds, seriesId]))
        : currentIds.filter((value) => value !== seriesId);
      return {
        ...current,
        booking_event_series_ids: nextIds,
      };
    });
  }

  function ensureBookingBlockInDraft() {
    setBuilderDraftFields((current) => {
      if (current.some((field) => isBookingBlockField(field))) return current;
      return [...current, createFieldFromPaletteItem("booking_block", "Prenotazione")];
    });
  }

  async function handleSaveUserConfirmationTemplate() {
    if (locked) {
      showToast({ tone: "error", title: "Form bloccati", message: lockedMessage });
      return;
    }
    const subject = userEmailDraft.subject.trim();
    const bodyText = userEmailDraft.bodyText.trim();
    if (!subject || !bodyText) {
      showToast({
        tone: "error",
        title: "Mail incompleta",
        message: "Oggetto e contenuto della conferma utente sono obbligatori.",
      });
      return;
    }

    setSavingUserEmailTemplate(true);
    try {
      const payload = {
        name: userEmailDraft.name.trim() || `${formDraft.title || "Form"} - conferma utente`,
        category: "forms",
        template_type: "generic_notice" as const,
        subject,
        body_text: bodyText,
        body_html: null,
        compiled_html: null,
        mjml_source: null,
        grapesjs_project_json: null,
        channel: "email",
        is_active: true,
        editor_status: "ready" as const,
        linked_form_id: selectedFormId || null,
      };
      const response =
        userEmailDraft.id && !userEmailDraft.isSystemSource
          ? await updateOrgAdminEmailTemplate(userEmailDraft.id, payload)
          : await createOrgAdminEmailTemplate(payload);
      setLocalTemplates((current) => {
        const others = current.filter((item) => item.id !== response.template.id);
        return [...others, response.template].sort((left, right) => left.name.localeCompare(right.name));
      });
      syncFormDraft("user_confirmation_template_id", response.template.id);
      setUserEmailDraft(buildUserConfirmationEmailDraft(response.template, formDraft.title));
      showToast({
        tone: "success",
        title: "Mail conferma salvata",
        message: "Il modello è selezionato per questo form. Salva il form per rendere definitiva l'associazione.",
      });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Mail non salvata",
        message: err instanceof Error ? err.message : "Errore salvataggio modello email.",
      });
    } finally {
      setSavingUserEmailTemplate(false);
    }
  }

  async function handleSaveForm(event?: FormEvent) {
    event?.preventDefault();
    if (locked) {
      showToast({ tone: "error", title: "Form bloccati", message: lockedMessage });
      return;
    }
    const normalizedTitle = formDraft.title.trim();
    if (!normalizedTitle) {
      setActiveTab("design");
      showToast({
        tone: "error",
        title: "Titolo richiesto",
        message: "Inserisci almeno un titolo per creare la pagina modulo.",
      });
      return;
    }
    setSavingForm(true);
    try {
      const bookingEnabled = Boolean(formDraft.booking_enabled || formDraft.create_booking);
      const bookingFieldMapping = { ...(formDraft.booking_field_mapping || {}) };
      const usesBookingBlockMapping =
        bookingFieldMapping.booking_date === BOOKING_BLOCK_MAPPING_VALUE
        || bookingFieldMapping.booking_time === BOOKING_BLOCK_MAPPING_VALUE;
      const bookingBlockEventsEnabled = Boolean(hasBookingBlockField && usesBookingBlockMapping);
      const bookingAvailabilityMode = formDraft.booking_availability_mode === "selected" ? "selected" : "all";
      const selectableSeriesIds = new Set(bookingSelectableSeries.map((item) => item.id));
      const selectedSeriesIds = (formDraft.booking_event_series_ids || [])
        .map((value) => Number(value))
        .filter((value) => selectableSeriesIds.has(value));
      if (bookingBlockEventsEnabled && bookingAvailabilityMode === "selected" && selectedSeriesIds.length === 0) {
        setActiveTab("settings");
        showToast({
          tone: "error",
          title: "Serate richieste",
          message: "Se scegli solo serate selezionate, seleziona almeno una serata prenotabile.",
        });
        return;
      }
      const payload = {
        ...formDraft,
        title: normalizedTitle,
        description: formDraft.description || null,
        accent_color: formDraft.accent_color || null,
        submit_button_text: formDraft.submit_button_text || null,
        cover_image_url: formDraft.cover_image_url || null,
        font_preset: formDraft.font_preset || "classic",
        public_slug: formDraft.public_slug || null,
        success_message: formDraft.success_message || null,
        notification_email: formDraft.notification_email || null,
        booking_enabled: bookingEnabled,
        booking_success_message_override: formDraft.booking_success_message_override || null,
        booking_admin_confirmation_email_enabled: formDraft.booking_admin_confirmation_email_enabled,
        booking_admin_confirmation_email_subject: formDraft.booking_admin_confirmation_email_subject || null,
        booking_admin_confirmation_email_body: formDraft.booking_admin_confirmation_email_body || null,
        booking_auto_assign_enabled: formDraft.booking_auto_assign_enabled,
        booking_field_mapping: bookingFieldMapping,
        booking_event_date: null,
        booking_event_time: null,
        booking_event_details: null,
        booking_dynamic_events_enabled: bookingBlockEventsEnabled,
        booking_availability_mode: bookingBlockEventsEnabled ? bookingAvailabilityMode : "all",
        booking_event_series_ids: bookingBlockEventsEnabled && bookingAvailabilityMode === "selected" ? selectedSeriesIds : [],
        form_type: mode === "surveys" ? "survey" : formDraft.form_type,
        survey_post_event_enabled: formDraft.survey_post_event_enabled,
        survey_post_event_delay_hours: formDraft.survey_post_event_delay_hours,
        survey_post_event_message_template: formDraft.survey_post_event_message_template || null,
        admin_notification_template_id: formDraft.admin_notification_template_id || null,
        user_confirmation_template_id: formDraft.user_confirmation_template_id || null,
        whatsapp_auto_reply_enabled: formDraft.whatsapp_auto_reply_enabled,
        whatsapp_auto_reply_template: formDraft.whatsapp_auto_reply_template || null,
        whatsapp_confirmation_template: formDraft.whatsapp_confirmation_template || null,
        whatsapp_rejection_template: formDraft.whatsapp_rejection_template || null,
        create_booking: bookingEnabled,
      };
      const wasCreatingNewForm = !selectedFormId;
      const draftFieldsToPersist = wasCreatingNewForm ? [...builderDraftFields] : [];
      const response = selectedFormId
        ? await updateOrgAdminForm(selectedFormId, payload)
        : await createOrgAdminForm(payload);
      if (wasCreatingNewForm && draftFieldsToPersist.length > 0) {
        for (const [index, builderField] of draftFieldsToPersist.entries()) {
          await createOrgAdminFormField(response.form.id, encodeField(builderField, (index + 1) * 10));
        }
      }
      setIsCreatingForm(false);
      setSelectedFormId(response.form.id);
      setSelectedForm(response.form);
      showToast({
        tone: "success",
        title: selectedFormId ? "Form aggiornato" : "Form creato",
        message: "La pagina pubblica è pronta per essere rifinita e condivisa.",
      });
      await loadForms(response.form.id);
    } catch (err) {
      showToast({
        tone: "error",
        title: "Salvataggio non riuscito",
        message: err instanceof Error ? err.message : "Errore salvataggio form.",
      });
    } finally {
      setSavingForm(false);
    }
  }

  async function handleToggleActive() {
    if (!selectedFormId || !selectedForm) return;
    if (locked) {
      showToast({ tone: "error", title: "Form bloccati", message: lockedMessage });
      return;
    }
    try {
      const response = await setOrgAdminFormActive(selectedFormId, !selectedForm.is_active);
      setSelectedForm(response.form);
      setForms((current) => current.map((item) => (item.id === response.form.id ? response.form : item)));
      showToast({
        tone: "success",
        title: response.form.is_active ? "Form attivato" : "Form disattivato",
        message: response.form.is_active ? "Il link pubblico è ora online." : "Il link pubblico è stato chiuso.",
      });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Stato non aggiornato",
        message: err instanceof Error ? err.message : "Errore aggiornamento stato.",
      });
    }
  }

  async function handleDeleteForm() {
    if (!selectedFormId) return;
    if (locked) {
      showToast({ tone: "error", title: "Form bloccati", message: lockedMessage });
      return;
    }
    setDeleteFormOpen(true);
    return;
  }

  async function confirmDeleteForm() {
    if (!selectedFormId) return;
    setDeleteActionState("loading");
    try {
      await deleteOrgAdminForm(selectedFormId);
      showToast({
        tone: "success",
        title: "Form eliminato",
        message: "La pagina pubblica è stata rimossa.",
      });
      setDeleteActionState("success");
      setDeleteFormOpen(false);
      resetEditorState();
      await loadForms();
    } catch (err) {
      setDeleteActionState("error");
      showToast({
        tone: "error",
        title: "Eliminazione non riuscita",
        message: err instanceof Error ? err.message : "Errore eliminazione form.",
      });
    }
  }

  function handleEditField(field: AssociationFormField) {
    setEditingFieldId(field.id);
    setDeleteFieldConfirmId(null);
    setFieldKeyManual(slugifyKey(field.label) !== field.field_key);
    setFieldDraft({
      field_key: field.field_key,
      field_type: field.field_type,
      label: field.label,
      placeholder: field.placeholder || "",
      help_text: field.help_text || "",
      is_required: field.is_required,
      sort_order: field.sort_order,
      options_text: (field.options || []).join(", "),
    });
  }

  function startNewField(fieldType: AssociationFormFieldType = "short_text") {
    setActiveTab("builder");
    setEditingFieldId(null);
    setDeleteFieldConfirmId(null);
    setFieldKeyManual(false);
    setFieldDraft(emptyFieldDraft(selectedForm, fieldType));
  }

  function handleFieldLabelChange(nextLabel: string) {
    setFieldDraft((current) => ({
      ...current,
      label: nextLabel,
      field_key: fieldKeyManual ? current.field_key : slugifyKey(nextLabel),
    }));
  }

  async function handleSaveField(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedFormId) {
      showToast({
        tone: "error",
        title: "Salva prima il form",
        message: "Per aggiungere campi serve prima creare il form e ottenere il link pubblico.",
      });
      return;
    }
    if (locked) {
      showToast({ tone: "error", title: "Form bloccati", message: lockedMessage });
      return;
    }
    setSavingField(true);
    try {
      const payload = buildFieldPayload(fieldDraft);
      if (editingFieldId) {
        await updateOrgAdminFormField(selectedFormId, editingFieldId, payload);
      } else {
        await createOrgAdminFormField(selectedFormId, payload);
      }
      const detail = await fetchOrgAdminForm(selectedFormId);
      setSelectedForm(detail.form);
      setForms((current) => current.map((item) => (item.id === detail.form.id ? detail.form : item)));
      const justSavedField =
        detail.form.fields.find((field) => field.field_key === (payload.field_key || slugifyKey(payload.label)))
        || detail.form.fields[detail.form.fields.length - 1]
        || null;
      if (justSavedField) {
        handleEditField(justSavedField);
      } else {
        startNewField();
      }
      showToast({
        tone: "success",
        title: editingFieldId ? "Campo aggiornato" : "Campo aggiunto",
        message: "Il canvas del form è stato aggiornato.",
      });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Campo non salvato",
        message: err instanceof Error ? err.message : "Errore salvataggio campo.",
      });
    } finally {
      setSavingField(false);
    }
  }

  async function handleDeleteField() {
    if (!selectedFormId || !editingFieldId) return;
    if (locked) {
      showToast({ tone: "error", title: "Form bloccati", message: lockedMessage });
      return;
    }
    setDeleteFieldConfirmId(editingFieldId);
    return;
  }

  async function confirmDeleteField() {
    if (!selectedFormId || !deleteFieldConfirmId) return;
    setDeleteActionState("loading");
    try {
      await deleteOrgAdminFormField(selectedFormId, deleteFieldConfirmId);
      const detail = await fetchOrgAdminForm(selectedFormId);
      setSelectedForm(detail.form);
      setForms((current) => current.map((item) => (item.id === detail.form.id ? detail.form : item)));
      setDeleteFieldConfirmId(null);
      startNewField();
      setDeleteActionState("success");
      showToast({
        tone: "success",
        title: "Campo eliminato",
        message: "La struttura del form è stata aggiornata.",
      });
    } catch (err) {
      setDeleteActionState("error");
      showToast({
        tone: "error",
        title: "Eliminazione non riuscita",
        message: err instanceof Error ? err.message : "Errore eliminazione campo.",
      });
    }
  }

  async function persistFieldOrder(nextFields: AssociationFormField[]) {
    if (!selectedFormId || locked) return;
    setReorderingFields(true);
    try {
      await Promise.all(
        nextFields.map((field, index) =>
          updateOrgAdminFormField(selectedFormId, field.id, {
            field_key: field.field_key,
            field_type: field.field_type,
            label: field.label,
            placeholder: field.placeholder,
            help_text: field.help_text,
            is_required: field.is_required,
            sort_order: (index + 1) * 10,
            options: field.options,
          }),
        ),
      );
      const detail = await fetchOrgAdminForm(selectedFormId);
      setSelectedForm(detail.form);
      setForms((current) => current.map((item) => (item.id === detail.form.id ? detail.form : item)));
      showToast({
        tone: "success",
        title: "Ordine aggiornato",
        message: "Il canvas ora riflette il nuovo ordine dei campi.",
      });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Riordino non riuscito",
        message: err instanceof Error ? err.message : "Errore durante il riordino campi.",
      });
    } finally {
      setReorderingFields(false);
      setDraggingFieldId(null);
    }
  }

  async function handleFieldDrop(targetFieldId: number | null) {
    if (draggingFieldId == null || !selectedForm) return;
    const ordered = [...sortedFields];
    const sourceIndex = ordered.findIndex((field) => field.id === draggingFieldId);
    if (sourceIndex === -1) return;
    const [dragged] = ordered.splice(sourceIndex, 1);
    const targetIndex = targetFieldId == null ? ordered.length : ordered.findIndex((field) => field.id === targetFieldId);
    const insertionIndex = targetIndex < 0 ? ordered.length : targetIndex;
    ordered.splice(insertionIndex, 0, dragged);
    await persistFieldOrder(ordered);
  }

  async function copyPublicLink(link: string) {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      showToast({
        tone: "success",
        title: "Link copiato",
        message: "URL pubblico copiato negli appunti.",
      });
    } catch {
      showToast({
        tone: "error",
        title: "Copia non riuscita",
        message: "Impossibile copiare il link in questo browser.",
      });
    }
  }

  async function handleBuilderSaveField(builderField: BuilderField, nextBuilderFields: BuilderField[]) {
    if (!selectedFormId || locked) return;
    const isNew = builderField.id < 0;
    const currentFields = nextBuilderFields;
    const index = currentFields.findIndex(
      (field) => field.key === builderField.key || (builderField.id > 0 && field.id === builderField.id),
    );
    const orderIndex = index >= 0 ? index : currentFields.length;
    const sortOrder = (orderIndex + 1) * 10;

    const payload = encodeField(builderField, sortOrder);

    try {
      const response = isNew
        ? await createOrgAdminFormField(selectedFormId, payload)
        : await updateOrgAdminFormField(selectedFormId, builderField.id, payload);

      if (isNew) {
        const savedBuilderField = decodeField(response.field);
        setBuilderDraftFields((current) =>
          current.map((field) =>
            field.key === builderField.key
              ? {
                  ...field,
                  id: savedBuilderField.id,
                  key: savedBuilderField.key,
                  type: savedBuilderField.type,
                }
              : field,
          ),
        );
      }

      setSelectedForm((current) => {
        if (!current || current.id !== selectedFormId) return current;
        return {
          ...current,
          fields: upsertAssociationFormField(current.fields || [], response.field),
        };
      });

      setForms((current) =>
        current.map((item) =>
          item.id === selectedFormId
            ? {
                ...item,
                fields: upsertAssociationFormField(item.fields || [], response.field),
              }
            : item,
        ),
      );

    } catch (err) {
      showToast({ tone: "error", title: "Errore salvataggio", message: err instanceof Error ? err.message : "Impossibile salvare il campo" });
    }
  }

  async function handleBuilderDeleteField(id: number) {
    if (!selectedFormId || locked || id < 0) return;
    try {
      await deleteOrgAdminFormField(selectedFormId, id);
      setBuilderDraftFields((current) => current.filter((field) => field.id !== id));
      setSelectedForm((current) => {
        if (!current || current.id !== selectedFormId) return current;
        return {
          ...current,
          fields: removeAssociationFormField(current.fields || [], id),
        };
      });
      setForms((current) =>
        current.map((item) =>
          item.id === selectedFormId
            ? {
                ...item,
                fields: removeAssociationFormField(item.fields || [], id),
              }
            : item,
        ),
      );
    } catch (err) {
      showToast({ tone: "error", title: "Errore eliminazione", message: err instanceof Error ? err.message : "Impossibile eliminare il campo" });
    }
  }

  async function handleBuilderReorder(builderFields: BuilderField[]) {
    if (!selectedFormId || locked) return;
    try {
      await Promise.all(
        builderFields.map((bf, index) => {
          if (bf.id < 0) return Promise.resolve(); // Should not happen during reorder of existing
          const payload = encodeField(bf, (index + 1) * 10);
          return updateOrgAdminFormField(selectedFormId!, bf.id, payload);
        })
      );
      const detail = await fetchOrgAdminForm(selectedFormId);
      setSelectedForm(detail.form);
      setBuilderDraftFields(decodeBuilderFields(detail.form));
      setForms((current) => current.map((item) => (item.id === detail.form.id ? detail.form : item)));
    } catch (err) {
      showToast({ tone: "error", title: "Errore riordino", message: err instanceof Error ? err.message : "Impossibile riordinare i campi" });
    }
  }

  const legacyFieldEditorHandlers = {
    handleDeleteField,
    handleFieldDrop,
    handleFieldLabelChange,
    handleSaveField,
    handleToggleActive,
  };
  void legacyFieldEditorHandlers;

  function syncSubmissionState(nextSubmission: AssociationFormSubmission) {
    setSubmissions((current) =>
      current.map((item) => (item.id === nextSubmission.id ? { ...item, ...nextSubmission } : item)),
    );
    setSelectedSubmission(nextSubmission);
  }

  async function openSubmissionDetail(submission: AssociationFormSubmission) {
    if (!selectedFormId) return;
    setSelectedSubmission(submission);
    try {
      const response = await fetchOrgAdminFormSubmission(selectedFormId, submission.id);
      syncSubmissionState(response.submission);
    } catch {
      setSelectedSubmission(submission);
    }
  }

  async function handleSubmissionDecision(
    nextStatus: "pending" | "confirmed" | "rejected",
    reason?: string,
  ) {
    if (!selectedFormId || !selectedSubmission) return;
    setSubmissionActionState("loading");
    setSubmissionActionError(null);
    try {
      const response = await updateOrgAdminFormSubmissionStatus(selectedFormId, selectedSubmission.id, {
        status: nextStatus,
        reason: reason?.trim() || null,
        whatsapp_message: null,
      });
      syncSubmissionState(response.submission);
      setSubmissionActionState("success");
      setConfirmActionOpen(false);
      setRejectActionOpen(false);

      let message = "Lo stato della richiesta è stato aggiornato.";
      if (response.whatsapp_result?.sent) {
        message = "Richiesta aggiornata e messaggio WhatsApp inviato automaticamente.";
      } else if (response.whatsapp_result?.error) {
        message = "Richiesta aggiornata, ma il messaggio WhatsApp non ? partito.";
      } else if (response.whatsapp_result?.reason === "missing_phone") {
        message = "Richiesta aggiornata. Nessun WhatsApp inviato: numero non disponibile.";
      }

      showToast({
        tone: response.whatsapp_result?.error ? "info" : "success",
        title:
          nextStatus === "confirmed"
            ? "Richiesta confermata"
            : nextStatus === "rejected"
              ? "Richiesta rigettata"
              : "Richiesta riportata in attesa",
        message,
      });
      void loadSubmissions(selectedFormId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore aggiornamento richiesta.";
      setSubmissionActionError(message);
      setSubmissionActionState("error");
      showToast({
        tone: "error",
        title: "Aggiornamento non riuscito",
        message,
      });
    } finally {
      window.setTimeout(() => setSubmissionActionState("idle"), 1200);
    }
  }

  function handleCreateNewForm() {
    syncWorkspaceQuery({ formId: null, formTab: null });
    setIsCreatingForm(true);
    setSelectedFormId(null);
    setSelectedForm(null);
    setSubmissions([]);
    setSelectedSubmission(null);
    setDeleteFormOpen(false);
    setActiveTab("design");
    setFormDraft(createSeededFormDraft(mode));
    setBuilderDraftFields([]);
    setFieldDraft(emptyFieldDraft(null));
    setEditingFieldId(null);
    setFieldKeyManual(false);
  }

  useEffect(() => {
    if (!embedded || locked || loading || adminLoading) return;
    if (searchParams.get("mode") !== "create") return;
    handleCreateNewForm();
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("mode");
    setSearchParams(nextParams, { replace: true });
  }, [adminLoading, embedded, loading, locked, mode, searchParams, setSearchParams]);

  const previewForm = useMemo(
    () => ({
      title: formDraft.title || "Titolo del form pubblico",
      description: formDraft.description || "Una breve descrizione aiuta a far capire subito perché qualcuno dovrebbe compilare il form.",
      accent_color: formDraft.accent_color || "#0f766e",
      submit_button_text: formDraft.submit_button_text || "Invia richiesta",
      show_logo: formDraft.show_logo,
      cover_image_url: formDraft.cover_image_url || null,
      page_style: formDraft.page_style,
      font_preset: formDraft.font_preset || "classic",
      visibility: formDraft.visibility,
      is_active: formDraft.is_active,
      booking_dynamic_events_enabled: Boolean(hasBookingBlockField && bookingBlockMappingActive),
      booking_availability_mode: formDraft.booking_availability_mode || "all",
      booking_event_series_ids: formDraft.booking_event_series_ids || [],
      booking_enabled: formDraft.booking_enabled,
      create_booking: formDraft.create_booking,
      form_type: formDraft.form_type,
      fields: previewFields,
      association: {
        name: admin?.organization?.name || "Associazione",
      },
    }),
    [admin?.organization?.name, bookingBlockMappingActive, formDraft, hasBookingBlockField, previewFields],
  );

  const builderTab = (
    <div className="min-h-[calc(100vh-210px)] overflow-visible">
      <FormBuilder
        fields={builderDraftFields}
        onChange={setBuilderDraftFields}
        onSaveField={handleBuilderSaveField}
        onDeleteField={handleBuilderDeleteField}
        onReorder={handleBuilderReorder}
        locked={locked}
        persistEnabled={Boolean(selectedFormId)}
        mode={mode}
        bookingEnabled={formDraft.booking_enabled}
      />
    </div>
  );

  const designTab = (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr] h-[calc(100vh-280px)]">
      <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar pb-10">
        <div className="rounded-[1.25rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Contenuto hero</h3>
          <div className="space-y-4">
            <label className={labelClass}>
              Titolo principale
              <input
                className={inputClass}
                disabled={locked}
                value={formDraft.title}
                onChange={(event) => syncFormDraft("title", event.target.value)}
                placeholder="Titolo della pagina"
              />
            </label>
            <label className={labelClass}>
              Sottotitolo / descrizione
              <textarea
                className={`${inputClass} min-h-[100px] resize-none`}
                disabled={locked}
                value={formDraft.description}
                onChange={(event) => syncFormDraft("description", event.target.value)}
                placeholder="Descrizione o istruzioni..."
              />
            </label>
            <label className={labelClass}>
              Messaggio di successo
              <textarea
                className={`${inputClass} min-h-[80px] resize-none`}
                disabled={locked}
                value={formDraft.success_message}
                onChange={(event) => syncFormDraft("success_message", event.target.value)}
                placeholder="Messaggio mostrato dopo l'invio"
              />
            </label>
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Branding e Immagini</h3>
          <div className="space-y-6">
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-sm font-medium text-neutral-800">Mostra nome associazione/logo</span>
              <div className="relative flex items-center justify-center">
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={formDraft.show_logo}
                  onChange={(event) => syncFormDraft("show_logo", event.target.checked)}
                  className="peer sr-only"
                />
                <div className="w-10 h-6 bg-neutral-200 rounded-full peer-checked:bg-brand transition-colors"></div>
                <div className="absolute left-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
              </div>
            </label>

            <ImageUpload 
               label="Immagine di sfondo (Cover)"
               value={formDraft.cover_image_url}
               onChange={(base64) => syncFormDraft("cover_image_url", base64)}
               onRemove={() => syncFormDraft("cover_image_url", "")}
               disabled={locked}
            />
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Stile visivo</h3>
          <div className="space-y-6">
            <label className={labelClass}>
              Colore accento principale
              <div className="mt-2 flex items-center gap-3 p-1 rounded-2xl border border-neutral-200 bg-neutral-50/50">
                <input
                  className="h-10 w-16 cursor-pointer rounded-xl border border-neutral-200 bg-white p-1 shadow-sm"
                  type="color"
                  disabled={locked}
                  value={formDraft.accent_color || "#0f766e"}
                  onChange={(event) => syncFormDraft("accent_color", event.target.value)}
                />
                <input
                  className="flex-1 bg-transparent border-none text-sm text-neutral-700 outline-none font-medium uppercase tracking-widest px-2"
                  disabled={locked}
                  value={formDraft.accent_color || "#0f766e"}
                  onChange={(event) => syncFormDraft("accent_color", event.target.value)}
                />
              </div>
            </label>
            
            <label className={labelClass}>
              Testo pulsante di invio
              <input
                className={inputClass}
                disabled={locked}
                value={formDraft.submit_button_text}
                onChange={(event) => syncFormDraft("submit_button_text", event.target.value)}
              />
            </label>

            <div>
              <label className={labelClass}>Layout Pagina</label>
              <div className="grid gap-2 mt-2">
                {pageStyleOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                      formDraft.page_style === option.value
                        ? "border-brand bg-brand/5 ring-1 ring-brand/20"
                        : "border-neutral-200 bg-white hover:bg-neutral-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="page_style"
                      value={option.value}
                      checked={formDraft.page_style === option.value}
                      onChange={() => syncFormDraft("page_style", option.value)}
                      className="border-neutral-300 text-brand focus:ring-brand"
                      disabled={locked}
                    />
                    <div>
                      <div className="text-sm font-semibold text-neutral-900">{option.label}</div>
                      <div className="text-[11px] font-medium text-neutral-500 mt-0.5">{option.hint}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass}>Font</label>
              <div className="grid gap-2 mt-2">
                {fontPresetOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                      formDraft.font_preset === option.value
                        ? "border-brand bg-brand/5 ring-1 ring-brand/20"
                        : "border-neutral-200 bg-white hover:bg-neutral-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="font_preset"
                      value={option.value}
                      checked={formDraft.font_preset === option.value}
                      onChange={() => syncFormDraft("font_preset", option.value)}
                      className="border-neutral-300 text-brand focus:ring-brand"
                      disabled={locked}
                    />
                    <div>
                      <div className="text-sm font-semibold text-neutral-900">{option.label}</div>
                      <div className="mt-0.5 text-[11px] font-medium text-neutral-500">{option.hint}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[1.25rem] border border-neutral-200 bg-neutral-100 overflow-hidden shadow-inner flex flex-col h-full">
        <div className="bg-white/80 px-4 py-2 border-b border-neutral-200 backdrop-blur-md flex items-center justify-between z-10 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Anteprima live</span>
          <div className="flex gap-1.5">
             <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
             <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
             <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <FormPublicCanvas form={previewForm} values={previewValues} />
        </div>
      </div>
    </div>
  );

  const automationsTab = (
    <div className="form-settings-tab space-y-5 overflow-y-auto custom-scrollbar pb-10">
      <div>
        <section className="rounded-[1.45rem] border border-[#e6dccb] bg-white p-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.18)]">
          <div className="border-b border-[#efe8db] pb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8a948d]">Accesso e notifiche</p>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5f6b72]">Link pubblico</label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="h-11 flex-1 rounded-[0.95rem] border border-[#ddd5c9] bg-white px-4 text-sm text-[#182126] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/12"
                  readOnly
                  value={selectedFormUrl || publicUrl || ""}
                  placeholder="Salva per generare il link"
                />
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center rounded-[0.95rem] bg-[#0f5e5d] px-4 text-sm font-semibold text-white transition hover:bg-[#0c4d4d] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void copyPublicLink(selectedFormUrl || publicUrl)}
                  disabled={!selectedFormUrl && !publicUrl}
                >
                  Copia
                </button>
              </div>
            </div>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5f6b72]">Personalizza URL</span>
              <input
                className="mt-2 h-11 w-full rounded-[0.95rem] border border-[#ddd5c9] bg-white px-4 text-sm text-[#182126] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/12"
                disabled={locked}
                value={formDraft.public_slug}
                onChange={(event) => syncFormDraft("public_slug", derivePublicSlug(event.target.value))}
                placeholder="iscrizione-corso"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5f6b72]">Visibilità</span>
                <select
                  className="mt-2 h-11 w-full rounded-[0.95rem] border border-[#ddd5c9] bg-white px-4 text-sm text-[#182126] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/12"
                  disabled={locked}
                  value={formDraft.visibility}
                  onChange={(event) => syncFormDraft("visibility", event.target.value as AssociationFormVisibility)}
                >
                  <option value="public">Pubblico</option>
                  <option value="members_only">Solo soci</option>
                </select>
              </label>

              <div className="rounded-[1rem] border border-[#ece5d8] bg-[#fcfbf7] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5f6b72]">Pagina attiva</p>
                    <p className="mt-1 text-sm font-medium text-[#182126]">{formDraft.is_active ? "Attiva" : "Disattiva"}</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={formDraft.is_active}
                      onChange={(event) => syncFormDraft("is_active", event.target.checked)}
                      className="peer sr-only"
                    />
                    <span className="h-6 w-11 rounded-full bg-[#d6d6d6] transition peer-checked:bg-[#0f5e5d]" />
                    <span className="absolute left-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5f6b72]">Email notifiche</label>
              <input
                className="mt-2 h-11 w-full rounded-[0.95rem] border border-[#ddd5c9] bg-white px-4 text-sm text-[#182126] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/12"
                type="email"
                disabled={locked}
                value={formDraft.notification_email}
                onChange={(event) => syncFormDraft("notification_email", event.target.value)}
                placeholder="Es. segreteria@associazione.it"
              />
            </div>

            <div className="rounded-[1rem] border border-[#ece5d8] bg-[#fcfbf7] px-4 py-4">
              <div className="grid gap-2 text-sm text-[#182126]">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" disabled={locked} checked={formDraft.notify_admin_on_submit} onChange={(event) => syncFormDraft("notify_admin_on_submit", event.target.checked)} className="rounded border-neutral-300 text-brand" />
                  Notifica segreteria
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" disabled={locked} checked={formDraft.send_user_confirmation} onChange={(event) => syncFormDraft("send_user_confirmation", event.target.checked)} className="rounded border-neutral-300 text-brand" />
                  Conferma utente
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" disabled={locked} checked={formDraft.allow_multiple_submissions} onChange={(event) => syncFormDraft("allow_multiple_submissions", event.target.checked)} className="rounded border-neutral-300 text-brand" />
                  Invii multipli
                </label>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-[1.35rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.16)]">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold text-neutral-900">Prenotazioni</h3>
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" disabled={locked} checked={formDraft.booking_enabled} onChange={(event) => syncFormDraft("booking_enabled", event.target.checked)} className="peer sr-only" />
              <span className="h-6 w-11 rounded-full bg-neutral-200 transition peer-checked:bg-brand" />
              <span className="absolute left-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
            </label>
          </div>
          {formDraft.booking_enabled ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-2 text-sm text-neutral-700">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" disabled={locked} checked={formDraft.booking_requires_manual_confirmation} onChange={(event) => syncFormDraft("booking_requires_manual_confirmation", event.target.checked)} className="rounded border-neutral-300 text-brand" />
                  Richiede conferma manuale
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" disabled={locked} checked={formDraft.booking_notification_enabled} onChange={(event) => syncFormDraft("booking_notification_enabled", event.target.checked)} className="rounded border-neutral-300 text-brand" />
                  Invia email stato booking
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" disabled={locked} checked={formDraft.booking_auto_assign_enabled} onChange={(event) => syncFormDraft("booking_auto_assign_enabled", event.target.checked)} className="rounded border-neutral-300 text-brand" />
                  Auto assegna tavolo
                </label>
              </div>
              <div className="space-y-3 rounded-[1rem] border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="rounded-xl border border-emerald-200 bg-white/70 p-3 text-sm text-neutral-700">
                  <p className="font-semibold text-neutral-900">Serate e orari dal blocco prenotazione</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-neutral-500">
                    Inserisci il blocco Prenotazione nel builder e seleziona "Blocco prenotazione (serate)" nei menu Data/Ora. Il form utilizza le serate configurate quando disponibili, altrimenti la prenotazione libera.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex rounded-xl bg-white px-3 py-2 text-sm font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={locked || hasBookingBlockField}
                  onClick={ensureBookingBlockInDraft}
                >
                  {hasBookingBlockField ? "Blocco inserito" : "Inserisci blocco"}
                </button>
                <a
                  className="inline-flex rounded-xl bg-white px-3 py-2 text-sm font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200 transition hover:bg-emerald-50"
                  href="/org-admin/prenotazioni?section=events"
                >
                  Gestisci serate e default
                </a>
              </div>
              <div className="space-y-3 rounded-[1rem] border border-neutral-200 bg-white p-4">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Disponibilita del form</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-neutral-500">
                    Le chiusure configurate in Prenotazioni restano sempre rispettate.
                  </p>
                </div>
                <div className="grid gap-2">
                  {[
                    {
                      value: "all",
                      label: "Usa tutte le serate/default disponibili",
                      hint: "Il form segue il default orario e le serate aperte.",
                    },
                    {
                      value: "selected",
                      label: "Usa solo serate selezionate",
                      hint: "Per offerte dedicate a un giorno o evento specifico.",
                    },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                        formDraft.booking_availability_mode === option.value
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-neutral-200 bg-neutral-50 hover:bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name="booking_availability_mode"
                        value={option.value}
                        checked={formDraft.booking_availability_mode === option.value}
                        onChange={() => syncFormDraft("booking_availability_mode", option.value)}
                        disabled={locked}
                        className="mt-1 border-neutral-300 text-emerald-700 focus:ring-emerald-700"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-neutral-900">{option.label}</span>
                        <span className="mt-1 block text-xs font-medium leading-5 text-neutral-500">{option.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {formDraft.booking_availability_mode === "selected" ? (
                  <div className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">Serate selezionate</span>
                      <span className="text-xs font-semibold text-neutral-500">
                        {selectedBookingSeriesCount}/{bookingSelectableSeries.length}
                      </span>
                    </div>
                    {bookingEventSeriesLoading ? (
                      <p className="text-xs font-medium text-neutral-500">Caricamento serate...</p>
                    ) : bookingEventSeriesError ? (
                      <p className="text-xs font-semibold text-rose-700">{bookingEventSeriesError}</p>
                    ) : bookingSelectableSeries.length === 0 ? (
                      <p className="text-xs font-medium text-neutral-500">Nessuna serata prenotabile attiva. Aggiungila da Prenotazioni.</p>
                    ) : (
                      <div className="grid max-h-64 gap-2 overflow-y-auto pr-1">
                        {bookingSelectableSeries.map((series) => (
                          <label
                            key={series.id}
                            className="flex cursor-pointer gap-3 rounded-xl border border-neutral-200 bg-white p-3 transition hover:border-emerald-200 hover:bg-emerald-50/40"
                          >
                            <input
                              type="checkbox"
                              disabled={locked}
                              checked={selectedBookingSeriesIds.has(series.id)}
                              onChange={(event) => toggleBookingSeriesSelection(series.id, event.target.checked)}
                              className="mt-1 rounded border-neutral-300 text-emerald-700 focus:ring-emerald-700"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-neutral-900">
                                {series.title || series.name || `Serata ${series.id}`}
                              </span>
                              <span className="mt-1 block text-xs font-medium leading-5 text-neutral-500">
                                {formatBookingSeriesWhen(series)} - {formatBookingSeriesSlots(series)}
                                {series.is_default ? " - Default" : ""}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="space-y-3 rounded-[1rem] border border-neutral-200 bg-neutral-50 p-4">
                {bookingMappingTargets.map((target) => {
                  const canUseBookingBlock = hasBookingBlockField && (target.key === "booking_date" || target.key === "booking_time");
                  return (
                    <div key={target.key} className="grid gap-2 md:grid-cols-[170px_minmax(0,1fr)] md:items-center">
                      <span className="text-xs font-medium text-neutral-700">{target.label}</span>
                      <select
                        className={`${inputClass} !mt-0 !py-2`}
                        disabled={locked || (bookingMappingFieldOptions.length === 0 && !canUseBookingBlock)}
                        value={formDraft.booking_field_mapping[target.key] || ""}
                        onChange={(event) => syncBookingFieldMapping(target.key, event.target.value)}
                      >
                        <option value="">-- Non collegato --</option>
                        {canUseBookingBlock ? (
                          <option value={BOOKING_BLOCK_MAPPING_VALUE}>Blocco prenotazione (serate)</option>
                        ) : null}
                        {bookingMappingFieldOptions.map((option) => (
                          <option key={`${target.key}-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>

        {mode === "surveys" ? (
          <section className="rounded-[1.35rem] border border-emerald-200 bg-emerald-50/60 p-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.12)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Invio post evento</h3>
                <p className="mt-1 text-xs leading-5 text-neutral-600">
                  Invia automaticamente questo sondaggio via email alle prenotazioni segnate come presenti in agenda.
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={formDraft.survey_post_event_enabled}
                  onChange={(event) => syncFormDraft("survey_post_event_enabled", event.target.checked)}
                  className="peer sr-only"
                />
                <span className="h-6 w-11 rounded-full bg-neutral-200 transition peer-checked:bg-brand" />
                <span className="absolute left-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
              </label>
            </div>
            <div className="mt-4 grid gap-4">
              <label className={labelClass}>
                Ore dopo l'evento
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  max={336}
                  disabled={locked}
                  value={formDraft.survey_post_event_delay_hours}
                  onChange={(event) => syncFormDraft("survey_post_event_delay_hours", Number(event.target.value || 2))}
                />
              </label>
              <label className={labelClass}>
                Messaggio email
                <textarea
                  className={`${inputClass} min-h-[96px] resize-none`}
                  disabled={locked}
                  value={formDraft.survey_post_event_message_template}
                  onChange={(event) => syncFormDraft("survey_post_event_message_template", event.target.value)}
                  placeholder="Ciao {{nome_contatto}}, grazie per aver partecipato. Ci aiuti con un breve sondaggio? {{link_sondaggio}}"
                />
              </label>
            </div>
          </section>
        ) : null}

        <section className="rounded-[1.35rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.16)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">Notifiche email</h3>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                Seleziona, modifica e controlla la mail che riceve chi compila il form.
              </p>
            </div>
            {formDraft.send_user_confirmation ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                Conferma attiva
              </span>
            ) : (
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">
                Conferma disattiva
              </span>
            )}
          </div>
          <div className="mt-4 space-y-4">
            <label className={labelClass}>
              Template notifica admin
              <select className={inputClass} disabled={locked} value={formDraft.admin_notification_template_id ?? ""} onChange={(event) => syncFormDraft("admin_notification_template_id", event.target.value ? Number(event.target.value) : null)}>
                <option value="">Riepilogo automatico standard</option>
                {activeTemplates.map((template) => (<option key={`admin-${template.id}`} value={template.id}>{template.name}</option>))}
              </select>
            </label>
            <label className={labelClass}>
              Template conferma utente
              <select className={inputClass} disabled={locked} value={formDraft.user_confirmation_template_id ?? ""} onChange={(event) => syncFormDraft("user_confirmation_template_id", event.target.value ? Number(event.target.value) : null)}>
                <option value="">Conferma automatica standard</option>
                {activeTemplates.map((template) => (<option key={`user-${template.id}`} value={template.id}>{template.name}</option>))}
              </select>
            </label>
            {formDraft.booking_enabled ? (
              <div className="rounded-[1.1rem] border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800">Email dopo conferma admin</p>
                    <p className="mt-1 text-xs leading-5 text-emerald-900/75">
                      Questa e separata dalla conferma di invio form e dai sondaggi. Disattivala se vuoi usare solo WhatsApp.
                    </p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={formDraft.booking_admin_confirmation_email_enabled}
                      onChange={(event) => syncFormDraft("booking_admin_confirmation_email_enabled", event.target.checked)}
                      className="peer sr-only"
                    />
                    <span className="h-6 w-11 rounded-full bg-emerald-100 transition peer-checked:bg-brand" />
                    <span className="absolute left-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
                  </label>
                </div>
                {formDraft.booking_admin_confirmation_email_enabled ? (
                  <div className="mt-4 grid gap-3">
                    <label className={labelClass}>
                      Oggetto
                      <input
                        className={inputClass}
                        disabled={locked}
                        value={formDraft.booking_admin_confirmation_email_subject}
                        onChange={(event) => syncFormDraft("booking_admin_confirmation_email_subject", event.target.value)}
                        placeholder="Prenotazione confermata: {{titolo_form}}"
                      />
                    </label>
                    <label className={labelClass}>
                      Testo email
                      <textarea
                        className={`${inputClass} min-h-[132px] resize-y leading-6`}
                        disabled={locked}
                        value={formDraft.booking_admin_confirmation_email_body}
                        onChange={(event) => syncFormDraft("booking_admin_confirmation_email_body", event.target.value)}
                        placeholder={"La tua prenotazione e stata confermata.\n\nNome: {{nome_contatto}}\nData: {{data_prenotazione}}\nOrario: {{orario_prenotazione}}\nPersone: {{numero_persone}}\n\nTi aspettiamo all'orario indicato."}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {["{{nome_contatto}}", "{{data_prenotazione}}", "{{orario_prenotazione}}", "{{numero_persone}}", "{{riepilogo_prenotazione}}"].map((placeholder) => (
                        <button
                          key={`booking-confirm-${placeholder}`}
                          type="button"
                          className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300"
                          disabled={locked}
                          onClick={() => syncFormDraft("booking_admin_confirmation_email_body", `${formDraft.booking_admin_confirmation_email_body}${formDraft.booking_admin_confirmation_email_body.endsWith(" ") || formDraft.booking_admin_confirmation_email_body.endsWith("\n") ? "" : " "}${placeholder}`)}
                        >
                          {placeholder}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="form-settings-mail-editor grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.2fr)]">
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">Editor rapido conferma utente</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    I template di sistema vengono salvati come copia modificabile dell'associazione.
                  </p>
                </div>
                <label className={labelClass}>
                  Nome modello
                  <input
                    className={inputClass}
                    disabled={locked}
                    value={userEmailDraft.name}
                    onChange={(event) => setUserEmailDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <label className={labelClass}>
                  Oggetto
                  <input
                    className={inputClass}
                    disabled={locked}
                    value={userEmailDraft.subject}
                    onChange={(event) => setUserEmailDraft((current) => ({ ...current, subject: event.target.value }))}
                  />
                </label>
                <label className={labelClass}>
                  Testo email
                  <textarea
                    className={`${inputClass} min-h-[180px] resize-y leading-6`}
                    disabled={locked}
                    value={userEmailDraft.bodyText}
                    onChange={(event) => setUserEmailDraft((current) => ({ ...current, bodyText: event.target.value }))}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {["{{nome_socio}}", "{{titolo_form}}", "{{nome_associazione}}", "{{email_destinatario}}"].map((placeholder) => (
                    <button
                      key={placeholder}
                      type="button"
                      className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                      disabled={locked}
                      onClick={() => setUserEmailDraft((current) => ({ ...current, bodyText: `${current.bodyText}${current.bodyText.endsWith(" ") || current.bodyText.endsWith("\n") ? "" : " "}${placeholder}` }))}
                    >
                      {placeholder}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-primary w-full justify-center py-2.5 text-sm disabled:opacity-60"
                  disabled={locked || savingUserEmailTemplate}
                  onClick={() => void handleSaveUserConfirmationTemplate()}
                >
                  {savingUserEmailTemplate ? "Salvataggio..." : userEmailDraft.id ? "Salva modifiche mail" : "Crea mail modificabile"}
                </button>
              </div>
              <div className="form-settings-mail-preview">
                <div className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">Anteprima reale</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-950">
                      {userEmailPreview?.subject || userEmailDraft.subject || "Oggetto email"}
                    </p>
                  </div>
                  {userEmailPreviewLoading ? <span className="text-xs font-semibold text-neutral-400">Aggiorno...</span> : null}
                </div>
                <div className="form-settings-mail-preview__frame">
                  {userEmailPreview?.bodyHtml ? (
                    <iframe
                      title="Anteprima mail conferma utente"
                      className="h-full w-full bg-white"
                      sandbox=""
                      srcDoc={userEmailPreview.bodyHtml}
                    />
                  ) : (
                    <div className="h-full overflow-auto whitespace-pre-wrap p-4 text-sm leading-6 text-neutral-700">
                      {userEmailPreview?.bodyText || userEmailDraft.bodyText || "Compila il testo per vedere la preview."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
  const surveyResponsesTab = (
    <div className="space-y-6">
      <SectionPanel className="p-5">
        <div>
          <p className="admin-eyebrow">Statistiche sondaggio</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">Gradimento e risposte</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Lettura aggregata delle valutazioni, delle preferenze e dei commenti inviati.
          </p>
        </div>
        {selectedFormId && submissions.length > 0 ? (
          <a className="btn-secondary" href={buildOrgAdminFormSubmissionsExportUrl(selectedFormId)}>
            Scarica CSV
          </a>
        ) : null}
      </SectionPanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Risposte" value={surveyStats.total} hint={surveyStats.responseRateLabel} tone="info" />
        <KpiCard
          label="Media 1-5"
          value={surveyStats.ratingAverage === null ? "-" : surveyStats.ratingAverage.toFixed(1)}
          hint="Domande valutazione"
          tone="success"
        />
        <KpiCard
          label="NPS medio"
          value={surveyStats.npsAverage === null ? "-" : surveyStats.npsAverage.toFixed(1)}
          hint="Scala 0-10"
          tone="warning"
        />
        <KpiCard label="Scale attive" value={surveyStats.scaleStats.length} hint="Rating e NPS nel builder" tone="muted" />
        <KpiCard label="Commenti" value={surveyStats.comments.length} hint="Risposte testuali compilate" tone="info" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] xl:items-start">
        <div className="space-y-5">
          <SectionPanel className="p-5" title="Apprezzamento" eyebrow="Scale e valutazioni">
            {surveyStats.scaleStats.length === 0 ? (
              <EmptyState
                title="Nessuna domanda di gradimento"
                description="Aggiungi una valutazione 1-5 o un NPS 0-10 nel builder per vedere le statistiche aggregate."
              />
            ) : (
              <div className="space-y-5">
                {surveyStats.scaleStats.map((stat) => (
                  <div key={stat.key} className="rounded-[1rem] border border-neutral-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-neutral-950">{stat.label}</h4>
                        <p className="mt-1 text-xs text-neutral-500">{stat.total} risposte valide</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2">
                      {stat.options.map((option) => {
                        const count = stat.counts.get(option) || 0;
                        const width = stat.max > 0 ? Math.max(7, Math.round((count / stat.max) * 100)) : 0;
                        return (
                          <div key={option} className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm">
                            <span className="font-semibold text-neutral-700">{option}</span>
                            <span className="h-2.5 overflow-hidden rounded-full bg-neutral-100">
                              <span className="block h-full rounded-full bg-[#0f6b5f]" style={{ width: `${width}%` }} />
                            </span>
                            <span className="text-right font-semibold text-neutral-700">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionPanel>

          <SectionPanel className="p-5" title="Preferenze" eyebrow="Scelte aggregate">
            {surveyStats.choiceStats.length === 0 ? (
              <EmptyState
                title="Nessuna domanda a scelta"
                description="Le risposte a scelta multipla, checkbox e menu appariranno qui in forma aggregata."
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {surveyStats.choiceStats.map((stat) => (
                  <div key={stat.key} className="rounded-[1rem] border border-neutral-200 bg-white p-4">
                    <h4 className="text-sm font-semibold text-neutral-950">{stat.label}</h4>
                    <div className="mt-4 space-y-3">
                      {stat.options.map((option) => {
                        const count = stat.counts.get(option) || 0;
                        const percent = stat.total > 0 ? Math.round((count / stat.total) * 100) : 0;
                        return (
                          <div key={option}>
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <span className="font-medium text-neutral-700">{option}</span>
                              <span className="font-semibold text-neutral-900">{count} ({percent}%)</span>
                            </div>
                            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
                              <div className="h-full rounded-full bg-neutral-900" style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionPanel>

          <SectionPanel className="p-5" title="Commenti aperti" eyebrow="Risposte testuali">
            {surveyStats.comments.length === 0 ? (
              <EmptyState title="Nessun commento ricevuto" description="I suggerimenti e le risposte aperte compilate verranno raccolti qui." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {surveyStats.comments.slice(0, 12).map((comment) => (
                  <article key={comment.key} className="rounded-[1rem] border border-neutral-200 bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">{comment.label}</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-800">{comment.value}</p>
                    <p className="mt-3 text-xs text-neutral-400">{formatDateTime(comment.submittedAt)}</p>
                  </article>
                ))}
              </div>
            )}
          </SectionPanel>
        </div>

        <SectionPanel className="sticky top-6 min-h-[34rem] overflow-hidden p-0">
          <div className="admin-panel__header">
            <div>
              <p className="admin-eyebrow">Invii ricevuti</p>
              <h4 className="mt-2 text-lg font-semibold text-neutral-950">Dettaglio risposta</h4>
            </div>
          </div>
          <div className="grid max-h-[70vh] overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="border-b border-neutral-200 lg:border-b-0 lg:border-r">
              <div className="max-h-[70vh] overflow-y-auto">
                {submissionsLoading ? (
                  <div className="space-y-3 p-4">
                    <Skeleton className="h-20 w-full rounded-xl" />
                    <Skeleton className="h-20 w-full rounded-xl" />
                    <Skeleton className="h-20 w-full rounded-xl" />
                  </div>
                ) : submissions.length === 0 ? (
                  <EmptyState title="Nessuna risposta ricevuta" description="Le risposte al sondaggio appariranno qui appena inviate." />
                ) : (
                  <div className="divide-y divide-neutral-200">
                    {submissions.map((submission) => {
                      const isSelected = selectedSubmission?.id === submission.id;
                      return (
                        <button
                          key={submission.id}
                          type="button"
                          onClick={() => void openSubmissionDetail(submission)}
                          className={`w-full px-4 py-4 text-left transition ${
                            isSelected ? "bg-neutral-950 text-white" : "bg-white hover:bg-neutral-50"
                          }`}
                        >
                          <p className={`truncate text-sm font-semibold ${isSelected ? "text-white" : "text-neutral-900"}`}>
                            {submission.submitted_by?.name || submission.submitted_by?.email || `Risposta #${submission.id}`}
                          </p>
                          <p className={`mt-1 text-xs ${isSelected ? "text-white/70" : "text-neutral-500"}`}>
                            {formatDateTime(submission.submitted_at)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="min-h-[28rem] overflow-y-auto p-5">
              {selectedSubmission ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Risposta selezionata</p>
                    <h4 className="mt-2 text-base font-semibold text-neutral-950">
                      {selectedSubmission.submitted_by?.name || selectedSubmission.submitted_by?.email || `Risposta #${selectedSubmission.id}`}
                    </h4>
                    <p className="mt-1 text-sm text-neutral-500">{formatDateTime(selectedSubmission.submitted_at)}</p>
                  </div>
                  <div className="grid gap-3">
                    {selectedSubmissionEntries.map((entry) => (
                      <div key={entry.key} className="rounded-xl border border-neutral-200 bg-white p-4">
                        <div className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">{entry.label}</div>
                        <div className="mt-2 break-words text-sm font-medium text-neutral-900">
                          {stringifySubmissionValue(entry.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState title="Seleziona una risposta" description="Apri un invio per leggere tutti i dati compilati nel sondaggio." />
              )}
            </div>
          </div>
        </SectionPanel>
      </div>
    </div>
  );

  const formResponsesTab = (
    <div className="space-y-6">
      <SectionPanel className="p-5">
        <div>
          <p className="admin-eyebrow">Workflow richieste</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">Risposte e decisioni</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Ogni richiesta ha uno stato esplicito, audit chiaro e feedback immediato per la segreteria.
          </p>
        </div>
        {selectedFormId && submissions.length > 0 ? (
          <a className="btn-secondary" href={buildOrgAdminFormSubmissionsExportUrl(selectedFormId)}>
            Scarica CSV
          </a>
        ) : null}
      </SectionPanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Totale richieste" value={submissionSummary.total} hint="Tutte le risposte ricevute" tone="info" />
        <KpiCard label="In attesa" value={submissionSummary.pending} hint="Da decidere" tone="warning" />
        <KpiCard label="Confermate" value={submissionSummary.confirmed} hint="Richieste approvate" tone="success" />
        <KpiCard label="Rigettate" value={submissionSummary.rejected} hint="Non accettate" tone="danger" />
        <KpiCard label="Con booking" value={submissionSummary.booking} hint="Prenotazioni collegate" tone="info" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)_320px] xl:items-start">
        <SectionPanel className="min-h-[36rem] overflow-hidden p-0">
          <div className="admin-panel__header">
            <div>
              <p className="admin-eyebrow">Lista richieste</p>
              <h4 className="mt-2 text-lg font-semibold text-neutral-950">Inbox form</h4>
            </div>
            <StatusChip tone="warning">{submissionSummary.pending} in attesa</StatusChip>
          </div>
          <div className="max-h-[58vh] overflow-y-auto">
            {submissionsLoading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : submissions.length === 0 ? (
              <EmptyState
                title="Nessuna risposta ricevuta"
                description="Quando arriveranno nuove richieste le vedrai qui con stato, audit e azioni rapide."
              />
            ) : (
              <div className="divide-y divide-neutral-200">
                {submissions.map((submission) => {
                  const status = submissionStatusLabel(submission.status);
                  const isSelected = selectedSubmission?.id === submission.id;
                  return (
                    <button
                      key={submission.id}
                      type="button"
                      onClick={() => void openSubmissionDetail(submission)}
                      className={`w-full px-4 py-4 text-left transition ${
                        isSelected ? "bg-neutral-950 text-white" : "bg-white hover:bg-neutral-50"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-semibold ${isSelected ? "text-white" : "text-neutral-900"}`}>
                            {submission.submitted_by?.name || submission.submitted_by?.email || `Richiesta #${submission.id}`}
                          </p>
                          <p className={`mt-1 text-xs ${isSelected ? "text-white/70" : "text-neutral-500"}`}>
                            {formatDateTime(submission.submitted_at)}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                            isSelected ? "bg-white/10 text-white" : status.className
                          }`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {submission.booking ? (
                          <span className={`rounded-full px-2.5 py-1 ${isSelected ? "bg-white/10 text-white/80" : "bg-neutral-100 text-neutral-700"}`}>
                            Booking {submission.booking.status}
                          </span>
                        ) : null}
                        {submission.reviewed_by ? (
                          <span className={`rounded-full px-2.5 py-1 ${isSelected ? "bg-white/10 text-white/80" : "bg-neutral-100 text-neutral-700"}`}>
                            Gestita da {submission.reviewed_by.email || `#${submission.reviewed_by.id}`}
                          </span>
                        ) : (
                          <span className={`rounded-full px-2.5 py-1 ${isSelected ? "bg-white/10 text-white/80" : "bg-neutral-100 text-neutral-700"}`}>
                            In attesa di review
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </SectionPanel>

        <SectionPanel className="sticky top-6">
          <div className="admin-panel__header">
            <div>
              <p className="admin-eyebrow">Dettaglio risposta</p>
              <h4 className="mt-2 text-lg font-semibold text-neutral-950">Dati, stato e audit</h4>
            </div>
            {selectedSubmission ? (
              <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${selectedSubmissionStatus.className}`}>
                {selectedSubmissionStatus.label}
              </span>
            ) : null}
          </div>
          {selectedSubmission ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Mittente</p>
                  <p className="mt-2 text-sm font-semibold text-neutral-900">
                    {selectedSubmission.submitted_by?.name || selectedSubmission.submitted_by?.email || `Richiesta #${selectedSubmission.id}`}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">{formatDateTime(selectedSubmission.submitted_at)}</p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Review</p>
                  <p className="mt-2 text-sm font-semibold text-neutral-900">
                    {selectedSubmission.reviewed_by?.email || "Non ancora gestita"}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {selectedSubmission.reviewed_at ? formatDateTime(selectedSubmission.reviewed_at) : "Nessuna review registrata"}
                  </p>
                </div>
              </div>

              {selectedSubmission.booking ? (
                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Prenotazione collegata</p>
                      <p className="mt-2 text-sm font-semibold text-neutral-900">{selectedSubmission.booking.customer_name}</p>
                      <p className="mt-1 text-sm text-neutral-500">
                        {selectedSubmission.booking.booking_date || "Data da definire"}
                        {selectedSubmission.booking.booking_time ? ` · ${selectedSubmission.booking.booking_time}` : ""}
                        {selectedSubmission.booking.party_size ? ` · ${selectedSubmission.booking.party_size} persone` : ""}
                      </p>
                    </div>
                    <span className="status-badge status-badge--info">{selectedSubmission.booking.status}</span>
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Documenti allegati</p>
                {selectedSubmissionAttachmentEntries.length ? (
                  <div className="mt-3 grid gap-2">
                    {selectedSubmissionAttachmentEntries.map((entry) => (
                      <div key={entry.key} className="rounded-[0.8rem] border border-dashed border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-xs font-semibold text-slate-900">{entry.label}</p>
                        <p className="mt-1 break-words text-xs text-slate-500">{stringifySubmissionValue(entry.value)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-neutral-500">Nessun allegato rilevato in questa risposta.</p>
                )}
              </div>

              {selectedSubmission.review_reason ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-rose-700">Motivo rigetto</p>
                  <p className="mt-2 leading-6">{selectedSubmission.review_reason}</p>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                {selectedSubmissionEntries.map((entry) => (
                  <div key={entry.key} className="rounded-xl border border-neutral-200 bg-white p-4">
                    <div className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">{entry.label}</div>
                    <div className="mt-2 break-words text-sm font-medium text-neutral-900">
                      {stringifySubmissionValue(entry.value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Seleziona una richiesta"
              description="Nel dettaglio vedrai dati inviati, stato corrente, documenti e booking collegato."
            />
          )}
        </SectionPanel>

        <SectionPanel className="sticky top-6" title="Audit e azioni" eyebrow="Controllo operativo">
          {selectedSubmission ? (
            <div className="space-y-5">
              <div className="rounded-[0.85rem] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">Stato richiesta</span>
                  <StatusChip tone={submissionTone(selectedSubmission.status)}>{selectedSubmissionStatus.label}</StatusChip>
                </div>
                <div className="mt-4 space-y-3 border-l border-slate-200 pl-4 text-sm">
                  <div>
                    <p className="font-semibold text-slate-900">Richiesta ricevuta</p>
                    <p className="text-slate-500">{formatDateTime(selectedSubmission.submitted_at)}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Review</p>
                    <p className="text-slate-500">
                      {selectedSubmission.reviewed_by?.email || "In attesa di decisione"}
                      {selectedSubmission.reviewed_at ? ` - ${formatDateTime(selectedSubmission.reviewed_at)}` : ""}
                    </p>
                  </div>
                  {selectedSubmission.booking ? (
                    <div>
                      <p className="font-semibold text-slate-900">Booking collegato</p>
                      <p className="text-slate-500">
                        {selectedSubmission.booking.booking_date || "Data da definire"}
                        {selectedSubmission.booking.booking_time ? ` - ${selectedSubmission.booking.booking_time}` : ""}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[0.85rem] border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Azioni rapide</p>
                <div className="mt-4 grid gap-2">
                  {selectedSubmission.available_actions.confirm ? (
                    <button
                      type="button"
                      className="btn-success w-full justify-center"
                      disabled={submissionActionState === "loading"}
                      onClick={() => {
                        setSubmissionActionError(null);
                        setConfirmActionOpen("confirmed");
                      }}
                    >
                      Conferma richiesta
                    </button>
                  ) : null}
                  {selectedSubmission.available_actions.reject ? (
                    <button
                      type="button"
                      className="btn-danger w-full justify-center"
                      disabled={submissionActionState === "loading"}
                      onClick={() => {
                        setSubmissionActionError(null);
                        setRejectActionOpen(true);
                      }}
                    >
                      Rigetta richiesta
                    </button>
                  ) : null}
                  {selectedSubmission.available_actions.set_pending ? (
                    <button
                      type="button"
                      className="btn-secondary w-full justify-center"
                      disabled={submissionActionState === "loading"}
                      onClick={() => {
                        setSubmissionActionError(null);
                        setConfirmActionOpen("pending");
                      }}
                    >
                      Riporta in attesa
                    </button>
                  ) : null}
                  {submissionActionState === "loading" ? (
                    <p className="text-center text-xs font-semibold text-slate-500">Aggiornamento in corso...</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="Nessuna richiesta selezionata" description="Seleziona una risposta dall'inbox per vedere audit e decisioni disponibili." />
          )}
        </SectionPanel>
      </div>
    </div>
  );

  const responsesTab = mode === "surveys" ? surveyResponsesTab : formResponsesTab;

  return (
    <div className={embedded ? "" : (isEditorOpen ? "w-full" : "container-shell py-8 md:py-10")}>
      <div className={`${embedded ? "space-y-6" : (isEditorOpen ? "w-full" : "mx-auto max-w-[92rem] space-y-6")}`}>
        {error ? (
          <div className="rounded-[1.25rem] bg-rose-50/50 p-4 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-500/20">{error}</div>
        ) : null}
        {locked ? (
          <div className="rounded-[1.25rem] bg-amber-50/50 p-5 text-sm text-amber-900 ring-1 ring-inset ring-amber-500/20">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Workflow bloccato</p>
            <p className="mt-1.5 font-medium">{lockedMessage}</p>
          </div>
        ) : null}

        {!isEditorOpen && !loading && !adminLoading && visibleForms.length > 0 && (
          <section className="rounded-[1.25rem] bg-white p-8 ring-1 ring-inset ring-slate-200/60 shadow-sm">
            <div className="border-b border-slate-100 pb-6 mb-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Gestione Moduli</p>
                  <h2 className="mt-2 text-2xl font-light tracking-tight text-slate-900">Le tue pagine modulo</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {mode === "surveys" ? "Seleziona un sondaggio esistente o creane uno nuovo." : "Seleziona una pagina esistente o creane una nuova."}
                  </p>
                </div>
                <button className="btn-primary !rounded-full !px-6" type="button" onClick={handleCreateNewForm} disabled={locked}>
                  {locked ? "Modulo richiesto" : mode === "surveys" ? "Nuovo sondaggio" : "Nuovo form"}
                </button>
              </div>
            </div>
            <div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleForms.map((form) => (
                  <div
                    key={form.id}
                    onClick={() => {
                      void openFormEditor(form.id);
                    }}
                    className="group cursor-pointer rounded-[1.25rem] bg-white p-5 ring-1 ring-inset ring-slate-200/60 transition-all hover:-translate-y-1 hover:shadow-sm hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-medium tracking-tight text-slate-900">{form.title}</h3>
                        <p className="mt-1 text-sm text-slate-400">/{form.public_slug}</p>
                      </div>
                      <span className={`inline-flex rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] ${form.is_active ? 'bg-emerald-100/50 text-emerald-700 ring-1 ring-inset ring-emerald-500/20' : 'bg-slate-100/80 text-slate-600'}`}>
                        {form.is_active ? 'Attivo' : 'Bozza'}
                      </span>
                    </div>
                    <div className="mt-6 space-y-3 border-t border-slate-100 pt-4">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
                        <span>{form.submission_status_counts?.total ?? form.submission_count} risposte</span>
                        <span>{form.field_count} campi</span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                          {form.submission_status_counts?.pending ?? 0} in attesa
                        </span>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                          {form.submission_status_counts?.confirmed ?? 0} confermate
                        </span>
                        <span className="rounded-full bg-rose-50 px-2.5 py-1 font-semibold text-rose-800 ring-1 ring-inset ring-rose-200">
                          {form.submission_status_counts?.rejected ?? 0} rigettate
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-primary !px-4 !py-2 !text-sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openFormEditor(form.id, { initialTab: "responses" });
                          }}
                        >
                          Gestisci risposte
                        </button>
                        <button
                          type="button"
                          className="btn-secondary !px-4 !py-2 !text-sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openFormEditor(form.id, { initialTab: "builder" });
                          }}
                        >
                          Apri builder
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {!isEditorOpen && !loading && !adminLoading && visibleForms.length === 0 && (
          <section className="rounded-[1.25rem] bg-white p-12 ring-1 ring-inset ring-slate-200/60 shadow-sm text-center">
            <div className="mx-auto max-w-xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                {mode === "surveys" ? "Sondaggi" : "Pagine e moduli"}
              </p>
              <h2 className="mt-4 text-3xl font-light tracking-tight text-slate-900">
                {mode === "surveys" ? "Nessun sondaggio creato" : "Nessun form creato"}
              </h2>
              <p className="mt-3 text-base text-slate-500">
                {mode === "surveys"
                  ? "Crea un sondaggio pubblico e, se vuoi, invialo automaticamente ai partecipanti segnati come presenti in agenda."
                  : "Crea il primo modulo pubblico per raccogliere iscrizioni, richieste o prenotazioni."}
              </p>
              <button className="btn-primary !rounded-full !px-8 !py-3.5 text-sm font-medium mt-8" type="button" onClick={handleCreateNewForm} disabled={locked}>
                {mode === "surveys" ? "Crea un sondaggio" : "Crea un nuovo form"}
              </button>
            </div>
          </section>
        )}

        {isEditorOpen && (
          <section className="space-y-5 rounded-[1.7rem] border border-[#e7dfd1] bg-[#fbf8f2] p-4 md:p-6">
            <div className="rounded-[1.5rem] border border-[#eadfce] bg-white px-5 py-4 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.18)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3">
                  <button
                    onClick={resetEditorState}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-[1rem] border border-[#ded5c8] bg-[#faf7ef] text-[#5d6a70] transition hover:border-[#c7baa8] hover:text-[#182126]"
                    title="Torna alla lista"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[1.35rem] font-semibold tracking-tight text-[#182126]">
                        {selectedFormId ? formDraft.title || selectedForm?.title || "Senza titolo" : "Nuovo form"}
                      </h2>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${formDraft.is_active ? "bg-[#edf9ef] text-[#137847]" : "bg-[#f7f0da] text-[#9b6b09]"}`}>
                        {formDraft.is_active ? "Pubblicato" : "Bozza"}
                      </span>
                    </div>
                    {selectedFormUrl ? (
                      <a
                        href={selectedFormUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#0f5e5d] hover:underline"
                      >
                        {selectedFormUrl}
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[0.95rem] border border-[#d9d2c6] bg-white px-4 text-sm font-medium text-[#182126] transition hover:border-[#c4b9a8] hover:bg-[#faf7ef]"
                    onClick={() => setRealPreviewOpen(true)}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <path d="M1.5 12S5.5 5.5 12 5.5 22.5 12 22.5 12 18.5 18.5 12 18.5 1.5 12 1.5 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    Anteprima
                  </button>
                  <button
                    className="inline-flex h-10 items-center justify-center rounded-[0.95rem] bg-[#0f5e5d] px-4 text-sm font-semibold text-white transition hover:bg-[#0c4d4d] disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => void handleSaveForm()}
                    disabled={savingForm || locked}
                  >
                    {savingForm ? "Salvataggio..." : "Salva modifiche"}
                  </button>
                </div>
              </div>

              {selectedFormId ? (
                <div className="mt-4 border-t border-[#eee7db] pt-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a948d]">Integrazioni campagne</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[0.95rem] border border-[#d9d2c6] bg-white px-4 text-sm font-medium text-[#182126] transition hover:border-[#c4b9a8] hover:bg-[#faf7ef]"
                        href={`/org-admin/communications?tab=campagne&mode=create&intent=form_invite&formId=${selectedFormId}`}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                          <rect x="3.75" y="6" width="16.5" height="12" rx="2.25" />
                          <path d="M4.5 7l7.05 5.1a.75.75 0 00.9 0L19.5 7" />
                        </svg>
                        Crea invito email
                      </a>
                      <button
                        type="button"
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[0.95rem] border border-[#d9d2c6] bg-white px-4 text-sm font-medium text-[#182126] transition hover:border-[#c4b9a8] hover:bg-[#faf7ef]"
                        onClick={() => {
                          if (!selectedFormUrl) return;
                          navigator.clipboard.writeText(selectedFormUrl);
                          showToast({ title: "Link copiato", message: "Il link pubblico del modulo è stato copiato negli appunti.", tone: "success" });
                        }}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                          <rect x="9" y="9" width="10" height="10" rx="2" />
                          <rect x="5" y="5" width="10" height="10" rx="2" />
                        </svg>
                        Copia link pubblico
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {editorTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleEditorTabChange(tab.key)}
                  className={`rounded-[1.15rem] border px-4 py-4 text-left transition ${
                    activeTab === tab.key
                      ? "border-[#0f5e5d] bg-[#0f5e5d] text-white shadow-[0_18px_36px_-24px_rgba(15,94,93,0.45)]"
                      : "border-[#e5dccd] bg-white text-[#182126] hover:border-[#cdbfa8] hover:bg-[#faf7ef]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-[0.95rem] ${activeTab === tab.key ? "bg-white/12 text-white" : "bg-[#f4efe4] text-[#425359]"}`}>
                      {editorTabIcon(tab.key)}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{tab.label}</p>
                      <p className={`mt-1 text-[11px] ${activeTab === tab.key ? "text-white/72" : "text-[#7a8485]"}`}>{tab.hint}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end">
              {selectedForm ? (
                <button
                  className="rounded-[0.95rem] border border-rose-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-rose-600 transition hover:bg-rose-50"
                  type="button"
                  onClick={handleDeleteForm}
                  disabled={locked}
                >
                  Elimina form
                </button>
              ) : null}
            </div>

            <div className="overflow-hidden">
              {activeTab === "builder" ? builderTab : null}
              {activeTab === "design" ? designTab : null}
              {activeTab === "settings" ? automationsTab : null}
              {activeTab === "responses" ? responsesTab : null}
            </div>
          </section>
        )}
{/* Real Preview Modal */}
      {realPreviewOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-neutral-900/90 backdrop-blur-sm">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-neutral-950 px-4 md:px-6">
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white transition"
                onClick={() => setRealPreviewOpen(false)}
                title="Chiudi anteprima"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="h-4 w-[1px] bg-white/20"></div>
              <span className="text-xs font-bold uppercase tracking-widest text-white/50">Anteprima Pubblica</span>
            </div>
            
            <div className="flex items-center gap-1 rounded-lg bg-black/50 p-1 ring-1 ring-white/10">
              <button
                type="button"
                onClick={() => setPreviewMode("desktop")}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                  previewMode === "desktop" ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white/80"
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("mobile")}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                  previewMode === "mobile" ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white/80"
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                Mobile
              </button>
            </div>
            
            <div className="w-10"></div> {/* Spacer for balance */}
          </div>
          
          <div className="flex-1 overflow-auto p-4 md:p-8 flex justify-center items-start custom-scrollbar">
            <div 
               className={`bg-white rounded-[1.25rem] overflow-hidden shadow-2xl transition-all duration-300 ring-4 ring-white/5 ${previewMode === "mobile" ? "w-[375px] min-h-[812px]" : "w-full max-w-[1440px] min-h-[800px]"}`}
            >
              <FormPublicCanvas form={previewForm} values={previewValues} interactive />
            </div>
          </div>
        </div>
      )}
      <SubmissionDecisionModal
        open={confirmActionOpen === "confirmed"}
        mode="confirmed"
        title="Confermare la richiesta?"
        description="La richiesta passa a confermata. Gli eventuali WhatsApp al socio partono solo dalle regole configurate in WhatsApp > Automazioni."
        confirmLabel="Conferma richiesta"
        confirmState={submissionActionState}
        error={submissionActionError}
        onClose={() => {
          if (submissionActionState === "loading") return;
          setConfirmActionOpen(false);
          setSubmissionActionError(null);
        }}
        onConfirm={() => void handleSubmissionDecision("confirmed")}
      />
      <ConfirmModal
        open={confirmActionOpen === "pending"}
        title="Riportare la richiesta in attesa?"
        description="La review verrà azzerata e la richiesta tornerà nello stato in attesa."
        confirmLabel="Riporta in attesa"
        confirmState={submissionActionState}
        onClose={() => {
          if (submissionActionState === "loading") return;
          setConfirmActionOpen(false);
          setSubmissionActionError(null);
        }}
        onConfirm={() => void handleSubmissionDecision("pending")}
      />
      <SubmissionDecisionModal
        open={rejectActionOpen}
        mode="rejected"
        title="Rigettare la richiesta?"
        description="Il motivo viene salvato nell'audit. Gli eventuali WhatsApp di rigetto partono solo dalle regole configurate in WhatsApp > Automazioni."
        confirmLabel="Rigetta richiesta"
        confirmState={submissionActionState}
        error={submissionActionError}
        onClose={() => {
          if (submissionActionState === "loading") return;
          setRejectActionOpen(false);
          setSubmissionActionError(null);
        }}
        onConfirm={(values) => void handleSubmissionDecision("rejected", values.reason)}
      />
      <ConfirmModal
        open={deleteFormOpen}
        title={DESTRUCTIVE_ACTION_COPY.deleteForm.title}
        description="Il link pubblico verrà chiuso e le risposte non saranno più consultabili da questa pagina."
        objectName={formatActionObject(selectedForm?.title, "Modulo selezionato")}
        impact="Usa questa azione solo se il modulo non serve più. L'operazione non ? pensata come archiviazione temporanea."
        confirmLabel={DESTRUCTIVE_ACTION_COPY.deleteForm.confirmLabel}
        tone="danger"
        confirmState={deleteActionState}
        requireCheckbox
        checkboxLabel="Confermo l'eliminazione del modulo"
        onClose={() => {
          if (deleteActionState === "loading") return;
          setDeleteFormOpen(false);
          setDeleteActionState("idle");
        }}
        onConfirm={() => void confirmDeleteForm()}
      />
      <ConfirmModal
        open={deleteFieldConfirmId !== null}
        title={DESTRUCTIVE_ACTION_COPY.deleteField.title}
        description="Il campo verrà rimosso dalla struttura del modulo e dalla preview pubblica."
        objectName={formatActionObject(deleteFieldTarget?.label, "Campo selezionato")}
        impact="Prima di procedere verifica che il campo non sia necessario per automazioni o prenotazioni collegate."
        confirmLabel={DESTRUCTIVE_ACTION_COPY.deleteField.confirmLabel}
        tone="danger"
        confirmState={deleteActionState}
        onClose={() => {
          if (deleteActionState === "loading") return;
          setDeleteFieldConfirmId(null);
          setDeleteActionState("idle");
        }}
        onConfirm={() => void confirmDeleteField()}
      />
      </div>
    </div>
  );
}

const OrgAdminForms = () => (
  <div className="bg-[#f8f9fa] min-h-screen pb-10">
    <OrgAdminFormsWorkspace />
  </div>
);

export default OrgAdminForms;
