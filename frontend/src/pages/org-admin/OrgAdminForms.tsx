import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  buildOrgAdminFormSubmissionsExportUrl,
  createOrgAdminForm,
  createOrgAdminFormField,
  deleteOrgAdminForm,
  deleteOrgAdminFormField,
  fetchOrgAdminForm,
  fetchOrgAdminForms,
  fetchOrgAdminFormSubmission,
  fetchOrgAdminFormSubmissions,
  setOrgAdminFormActive,
  updateOrgAdminFormSubmissionStatus,
  updateOrgAdminForm,
  updateOrgAdminFormField,
  type AssociationForm,
  type AssociationFormField,
  type AssociationFormFieldType,
  type AssociationFormType,
  type AssociationFormSubmission,
  type AssociationFormVisibility,
  type OrgAdminEmailTemplate,
} from "../../lib/api";
import { applySeo } from "../../lib/seo";
import { useToast } from "../../components/ui/ToastProvider";
import { useOrgAdmin } from "./OrgAdminLayout";
import { FormBuilder } from "../../components/forms/builder/FormBuilder";
import { decodeField, encodeField, type BuilderField } from "../../components/forms/builder/utils";
import { FormPublicCanvas } from "../../components/forms/FormPublicCanvas";
import { ImageUpload } from "../../components/forms/builder/ImageUpload";
import ConfirmModal from "../../components/ui/ConfirmModal";
import SubmissionDecisionModal from "../../components/ui/SubmissionDecisionModal";
import Skeleton from "../../components/ui/Skeleton";
import { EmptyState, KpiCard, SectionPanel, StatusChip } from "./components/OrgAdminPrimitives";

const inputClass =
  "mt-1 w-full rounded-[1.1rem] border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-neutral-900/40 focus:ring-2 focus:ring-neutral-900/10";
const labelClass = "block text-sm font-medium text-neutral-700";

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

function defaultWhatsAppConfirmationTemplate(formType: AssociationFormType, bookingEnabled: boolean): string {
  if (bookingEnabled || formType === "booking") {
    return "Ciao {{nome_contatto}}, la tua prenotazione per {{nome_associazione}} e stata confermata. Dettagli: {{riepilogo_prenotazione}}.";
  }
  return "Ciao {{nome_contatto}}, la tua richiesta per {{titolo_form}} e stata confermata. Ti ricontatteremo se serviranno altri dettagli.";
}

function defaultWhatsAppRejectionTemplate(formType: AssociationFormType, bookingEnabled: boolean): string {
  if (bookingEnabled || formType === "booking") {
    return "Ciao {{nome_contatto}}, la tua prenotazione per {{nome_associazione}} non puo essere confermata. {{motivo_rigetto}}";
  }
  return "Ciao {{nome_contatto}}, la tua richiesta per {{titolo_form}} e stata rigettata. {{motivo_rigetto}}";
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
    booking_auto_assign_enabled: false,
    booking_field_mapping: {} as Record<string, string>,
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

function createSeededFormDraft() {
  const defaultTitle = "Nuovo form";
  return {
    ...emptyFormDraft(),
    title: defaultTitle,
    public_slug: derivePublicSlug(defaultTitle),
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
};

export function OrgAdminFormsWorkspace({
  embedded = false,
  locked = false,
  lockedMessage = "I Form richiedono il modulo Comunicazioni attivo.",
  availableTemplates = [],
}: OrgAdminFormsWorkspaceProps) {
  const { admin, loading: adminLoading } = useOrgAdmin();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forms, setForms] = useState<AssociationForm[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);
  const [isCreatingForm, setIsCreatingForm] = useState(false);
  const [selectedForm, setSelectedForm] = useState<AssociationForm | null>(null);
  const [builderDraftFields, setBuilderDraftFields] = useState<BuilderField[]>([]);
  const [formDraft, setFormDraft] = useState(emptyFormDraft());
  const [savingForm, setSavingForm] = useState(false);

  const [realPreviewOpen, setRealPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");

  const [deleteArmed, setDeleteArmed] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("builder");

  const [fieldDraft, setFieldDraft] = useState(emptyFieldDraft(null));
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [fieldKeyManual, setFieldKeyManual] = useState(false);
  const [, setSavingField] = useState(false);
  const [deleteFieldArmed, setDeleteFieldArmed] = useState<number | null>(null);
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
    setFormDraft({
      title: selectedForm.title || "",
      description: selectedForm.description || "",
      accent_color: selectedForm.accent_color || "#0f766e",
      submit_button_text: selectedForm.submit_button_text || "Invia richiesta",
      show_logo: Boolean(selectedForm.show_logo),
      cover_image_url: selectedForm.cover_image_url || "",
      page_style: (selectedForm.page_style as PageStyleOption) || "editorial",
      public_slug: selectedForm.public_slug || "",
      is_active: Boolean(selectedForm.is_active),
      visibility: selectedForm.visibility,
      success_message: selectedForm.success_message || "",
      notification_email: selectedForm.notification_email || "",
      allow_multiple_submissions: Boolean(selectedForm.allow_multiple_submissions),
      form_type: selectedForm.form_type || "generic",
      booking_enabled: Boolean(selectedForm.booking_enabled || selectedForm.create_booking),
      booking_requires_manual_confirmation: Boolean(selectedForm.booking_requires_manual_confirmation),
      booking_success_message_override: selectedForm.booking_success_message_override || "",
      booking_notification_enabled: Boolean(selectedForm.booking_notification_enabled),
      booking_auto_assign_enabled: Boolean(selectedForm.booking_auto_assign_enabled),
      booking_field_mapping: selectedForm.booking_field_mapping || {},
      notify_admin_on_submit: Boolean(selectedForm.notify_admin_on_submit),
      send_user_confirmation: Boolean(selectedForm.send_user_confirmation),
      whatsapp_auto_reply_enabled: Boolean(selectedForm.whatsapp_auto_reply_enabled),
      whatsapp_auto_reply_template: selectedForm.whatsapp_auto_reply_template || "",
      whatsapp_confirmation_template: selectedForm.whatsapp_confirmation_template || "",
      whatsapp_rejection_template: selectedForm.whatsapp_rejection_template || "",
      admin_notification_template_id: selectedForm.admin_notification_template_id,
      user_confirmation_template_id: selectedForm.user_confirmation_template_id,
      create_internal_request: Boolean(selectedForm.create_internal_request),
      create_booking: Boolean(selectedForm.create_booking),
    });
    const firstField = selectedForm.fields[0] || null;
    if (firstField) {
      handleEditField(firstField);
    } else {
      setFieldDraft(emptyFieldDraft(selectedForm));
      setEditingFieldId(null);
      setFieldKeyManual(false);
    }
    setDeleteArmed(false);
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
      sortedFields.map((field) => ({
        value: field.field_key,
        label: `${field.label} (${field.field_key})`,
      })),
    [sortedFields],
  );
  const previewValues = useMemo(
    () => buildPreviewValues(previewFields),
    [previewFields],
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
  const selectedSubmissionStatus = submissionStatusLabel(selectedSubmission?.status);

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
    setDeleteArmed(false);
    setDeleteFieldArmed(null);
    setSubmissions([]);
    setSelectedSubmission(null);
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
    setDeleteArmed(false);
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
    setFormDraft((current) => ({
      ...current,
      booking_field_mapping: {
        ...current.booking_field_mapping,
        [target]: fieldKey,
      },
    }));
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
      const payload = {
        ...formDraft,
        title: normalizedTitle,
        description: formDraft.description || null,
        accent_color: formDraft.accent_color || null,
        submit_button_text: formDraft.submit_button_text || null,
        cover_image_url: formDraft.cover_image_url || null,
        public_slug: formDraft.public_slug || null,
        success_message: formDraft.success_message || null,
        notification_email: formDraft.notification_email || null,
        booking_enabled: bookingEnabled,
        booking_success_message_override: formDraft.booking_success_message_override || null,
        booking_auto_assign_enabled: formDraft.booking_auto_assign_enabled,
        booking_field_mapping: formDraft.booking_field_mapping || {},
        admin_notification_template_id: formDraft.admin_notification_template_id || null,
        user_confirmation_template_id: formDraft.user_confirmation_template_id || null,
        whatsapp_auto_reply_enabled: formDraft.whatsapp_auto_reply_enabled,
        whatsapp_auto_reply_template: formDraft.whatsapp_auto_reply_template || null,
        whatsapp_confirmation_template: formDraft.whatsapp_confirmation_template || null,
        whatsapp_rejection_template: formDraft.whatsapp_rejection_template || null,
        create_booking: bookingEnabled,
      };
      const response = selectedFormId
        ? await updateOrgAdminForm(selectedFormId, payload)
        : await createOrgAdminForm(payload);
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
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    try {
      await deleteOrgAdminForm(selectedFormId);
      showToast({
        tone: "success",
        title: "Form eliminato",
        message: "La pagina pubblica è stata rimossa.",
      });
      resetEditorState();
      await loadForms();
    } catch (err) {
      showToast({
        tone: "error",
        title: "Eliminazione non riuscita",
        message: err instanceof Error ? err.message : "Errore eliminazione form.",
      });
    }
  }

  function handleEditField(field: AssociationFormField) {
    setEditingFieldId(field.id);
    setDeleteFieldArmed(null);
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
    setDeleteFieldArmed(null);
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
    if (deleteFieldArmed !== editingFieldId) {
      setDeleteFieldArmed(editingFieldId);
      return;
    }
    try {
      await deleteOrgAdminFormField(selectedFormId, editingFieldId);
      const detail = await fetchOrgAdminForm(selectedFormId);
      setSelectedForm(detail.form);
      setForms((current) => current.map((item) => (item.id === detail.form.id ? detail.form : item)));
      startNewField();
      showToast({
        tone: "success",
        title: "Campo eliminato",
        message: "La struttura del form è stata aggiornata.",
      });
    } catch (err) {
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
    whatsappMessage?: string,
  ) {
    if (!selectedFormId || !selectedSubmission) return;
    setSubmissionActionState("loading");
    setSubmissionActionError(null);
    try {
      const response = await updateOrgAdminFormSubmissionStatus(selectedFormId, selectedSubmission.id, {
        status: nextStatus,
        reason: reason?.trim() || null,
        whatsapp_message: whatsappMessage?.trim() || null,
      });
      syncSubmissionState(response.submission);
      setSubmissionActionState("success");
      setConfirmActionOpen(false);
      setRejectActionOpen(false);

      let message = "Lo stato della richiesta e stato aggiornato.";
      if (response.whatsapp_result?.sent) {
        message = "Richiesta aggiornata e messaggio WhatsApp inviato automaticamente.";
      } else if (response.whatsapp_result?.error) {
        message = "Richiesta aggiornata, ma il messaggio WhatsApp non e partito.";
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

  function resolveDecisionMessagePlaceholder(status: "confirmed" | "rejected") {
    const bookingEnabled = Boolean(
      selectedForm?.booking_enabled ||
      selectedForm?.create_booking ||
      formDraft.booking_enabled ||
      formDraft.create_booking,
    );
    if (status === "confirmed") {
      return (
        selectedForm?.whatsapp_confirmation_template ||
        formDraft.whatsapp_confirmation_template ||
        defaultWhatsAppConfirmationTemplate(formDraft.form_type, bookingEnabled)
      );
    }
    return (
      selectedForm?.whatsapp_rejection_template ||
      formDraft.whatsapp_rejection_template ||
      defaultWhatsAppRejectionTemplate(formDraft.form_type, bookingEnabled)
    );
  }

  function handleCreateNewForm() {
    syncWorkspaceQuery({ formId: null, formTab: null });
    setIsCreatingForm(true);
    setSelectedFormId(null);
    setSelectedForm(null);
    setSubmissions([]);
    setSelectedSubmission(null);
    setDeleteArmed(false);
    setActiveTab("design");
    setFormDraft(createSeededFormDraft());
    setBuilderDraftFields([]);
    setFieldDraft(emptyFieldDraft(null));
    setEditingFieldId(null);
    setFieldKeyManual(false);
  }

  const previewForm = useMemo(
    () => ({
      title: formDraft.title || "Titolo del form pubblico",
      description: formDraft.description || "Una breve descrizione aiuta a far capire subito perche qualcuno dovrebbe compilare il form.",
      accent_color: formDraft.accent_color || "#0f766e",
      submit_button_text: formDraft.submit_button_text || "Invia richiesta",
      show_logo: formDraft.show_logo,
      cover_image_url: formDraft.cover_image_url || null,
      page_style: formDraft.page_style,
      visibility: formDraft.visibility,
      is_active: formDraft.is_active,
      fields: previewFields,
      association: {
        name: admin?.organization?.name || "Associazione",
      },
    }),
    [admin?.organization?.name, formDraft, previewFields],
  );

  const builderTab = (
    <div className="h-[calc(100vh-210px)] overflow-hidden">
      <FormBuilder
        fields={builderDraftFields}
        onChange={setBuilderDraftFields}
        onSaveField={handleBuilderSaveField}
        onDeleteField={handleBuilderDeleteField}
        onReorder={handleBuilderReorder}
        locked={locked || !selectedFormId}
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
    <div className="space-y-5 overflow-y-auto custom-scrollbar pb-10">
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
              <div className="space-y-3 rounded-[1rem] border border-neutral-200 bg-neutral-50 p-4">
                {bookingMappingTargets.map((target) => (
                  <div key={target.key} className="grid gap-2 md:grid-cols-[170px_minmax(0,1fr)] md:items-center">
                    <span className="text-xs font-medium text-neutral-700">{target.label}</span>
                    <select
                      className={`${inputClass} !mt-0 !py-2`}
                      disabled={locked || bookingMappingFieldOptions.length === 0}
                      value={formDraft.booking_field_mapping[target.key] || ""}
                      onChange={(event) => syncBookingFieldMapping(target.key, event.target.value)}
                    >
                      <option value="">-- Non collegato --</option>
                      {bookingMappingFieldOptions.map((option) => (
                        <option key={`${target.key}-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-[1.35rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.16)]">
          <h3 className="text-sm font-semibold text-neutral-900">Notifiche email</h3>
          <div className="mt-4 space-y-4">
            <label className={labelClass}>
              Template notifica admin
              <select className={inputClass} disabled={locked} value={formDraft.admin_notification_template_id ?? ""} onChange={(event) => syncFormDraft("admin_notification_template_id", event.target.value ? Number(event.target.value) : null)}>
                <option value="">Riepilogo automatico standard</option>
                {availableTemplates.filter((item) => item.is_active).map((template) => (<option key={`admin-${template.id}`} value={template.id}>{template.name}</option>))}
              </select>
            </label>
            <label className={labelClass}>
              Template conferma utente
              <select className={inputClass} disabled={locked} value={formDraft.user_confirmation_template_id ?? ""} onChange={(event) => syncFormDraft("user_confirmation_template_id", event.target.value ? Number(event.target.value) : null)}>
                <option value="">Conferma automatica standard</option>
                {availableTemplates.filter((item) => item.is_active).map((template) => (<option key={`user-${template.id}`} value={template.id}>{template.name}</option>))}
              </select>
            </label>
          </div>
        </section>
      </div>
    </div>
  );
  const responsesTab = (
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

        {!isEditorOpen && !loading && !adminLoading && forms.length > 0 && (
          <section className="rounded-[1.25rem] bg-white p-8 ring-1 ring-inset ring-slate-200/60 shadow-sm">
            <div className="border-b border-slate-100 pb-6 mb-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Gestione Moduli</p>
                  <h2 className="mt-2 text-2xl font-light tracking-tight text-slate-900">Le tue pagine modulo</h2>
                  <p className="mt-1 text-sm text-slate-500">Seleziona una pagina esistente o creane una nuova.</p>
                </div>
                <button className="btn-primary !rounded-full !px-6" type="button" onClick={handleCreateNewForm} disabled={locked}>
                  {locked ? "Modulo richiesto" : "Nuovo form"}
                </button>
              </div>
            </div>
            <div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {forms.map((form) => (
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

        {!isEditorOpen && !loading && !adminLoading && forms.length === 0 && (
          <section className="rounded-[1.25rem] bg-white p-12 ring-1 ring-inset ring-slate-200/60 shadow-sm text-center">
            <div className="mx-auto max-w-xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Pagine e moduli</p>
              <h2 className="mt-4 text-3xl font-light tracking-tight text-slate-900">Nessun form creato</h2>
              <p className="mt-3 text-base text-slate-500">
                Crea il primo modulo pubblico per raccogliere iscrizioni, richieste o prenotazioni.
              </p>
              <button className="btn-primary !rounded-full !px-8 !py-3.5 text-sm font-medium mt-8" type="button" onClick={handleCreateNewForm} disabled={locked}>
                Crea un nuovo form
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
                          showToast({ title: "Link copiato", message: "Il link pubblico del modulo e stato copiato negli appunti.", tone: "success" });
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
                  {deleteArmed ? "Conferma elimina form" : "Elimina form"}
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
        description="La richiesta passera a confermata. Puoi lasciare il messaggio vuoto per usare il template configurato del form oppure personalizzarlo per questa sola risposta."
        confirmLabel="Conferma richiesta"
        confirmState={submissionActionState}
        defaultMessage={resolveDecisionMessagePlaceholder("confirmed")}
        error={submissionActionError}
        onClose={() => {
          if (submissionActionState === "loading") return;
          setConfirmActionOpen(false);
          setSubmissionActionError(null);
        }}
        onConfirm={(values) => void handleSubmissionDecision("confirmed", undefined, values.whatsappMessage)}
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
        description="Il motivo viene salvato nell'audit. Se vuoi, puoi anche personalizzare il messaggio WhatsApp di rigetto per questa singola risposta."
        confirmLabel="Rigetta richiesta"
        confirmState={submissionActionState}
        defaultMessage={resolveDecisionMessagePlaceholder("rejected")}
        error={submissionActionError}
        onClose={() => {
          if (submissionActionState === "loading") return;
          setRejectActionOpen(false);
          setSubmissionActionError(null);
        }}
        onConfirm={(values) => void handleSubmissionDecision("rejected", values.reason, values.whatsappMessage)}
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
