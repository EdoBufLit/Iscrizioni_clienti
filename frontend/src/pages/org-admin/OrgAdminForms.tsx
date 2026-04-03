import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import PromptModal from "../../components/ui/PromptModal";
import Skeleton from "../../components/ui/Skeleton";

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

type WhatsAppAutomationVariable = {
  key: string;
  label: string;
  placeholder: string;
  hint: string;
};

const editorTabs: Array<{ key: EditorTab; label: string; hint: string }> = [
  { key: "builder", label: "Struttura", hint: "Campi e layout" },
  { key: "design", label: "Stile", hint: "Testi, colori, immagini" },
  { key: "settings", label: "Impostazioni", hint: "Notifiche e accesso" },
  { key: "responses", label: "Risposte", hint: "Invii ricevuti" },
];

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

const baseWhatsAppVariables: WhatsAppAutomationVariable[] = [
  { key: "nome_contatto", label: "Nome contatto", placeholder: "{{nome_contatto}}", hint: "Nome ricavato da form, prenotazione o socio associato." },
  { key: "nome_associazione", label: "Nome associazione", placeholder: "{{nome_associazione}}", hint: "Nome dell'associazione." },
  { key: "titolo_form", label: "Titolo form", placeholder: "{{titolo_form}}", hint: "Titolo del modulo che ha generato la richiesta." },
  { key: "id_richiesta", label: "ID richiesta", placeholder: "{{id_richiesta}}", hint: "ID interno della submission." },
  { key: "email_destinatario", label: "Email destinatario", placeholder: "{{email_destinatario}}", hint: "Email del submitter se disponibile." },
  { key: "numero_whatsapp", label: "Numero WhatsApp", placeholder: "{{numero_whatsapp}}", hint: "Numero a cui ASSONAM inviera il messaggio." },
  { key: "data_prenotazione", label: "Data prenotazione", placeholder: "{{data_prenotazione}}", hint: "Valorizzata quando il form genera una booking." },
  { key: "orario_prenotazione", label: "Orario prenotazione", placeholder: "{{orario_prenotazione}}", hint: "Valorizzata quando il form genera una booking." },
  { key: "numero_persone", label: "Numero persone", placeholder: "{{numero_persone}}", hint: "Party size della prenotazione se disponibile." },
];

function defaultWhatsAppTemplate(formType: AssociationFormType, bookingEnabled: boolean): string {
  if (bookingEnabled || formType === "booking") {
    return "Ciao {{nome_contatto}}, la tua richiesta di prenotazione per {{titolo_form}} e stata registrata correttamente. Ti ricontatteremo presto.";
  }
  return "Ciao {{nome_contatto}}, la tua richiesta tramite {{titolo_form}} e stata registrata correttamente. Ti ricontatteremo presto.";
}

function defaultWhatsAppConfirmationTemplate(formType: AssociationFormType, bookingEnabled: boolean): string {
  if (bookingEnabled || formType === "booking") {
    return "Ciao {{nome_contatto}}, la tua richiesta per {{titolo_form}} e stata confermata. Ti aspettiamo il {{data_prenotazione}} alle {{orario_prenotazione}}.";
  }
  return "Ciao {{nome_contatto}}, la tua richiesta per {{titolo_form}} e stata confermata. Ti ricontatteremo se serviranno altri dettagli.";
}

function defaultWhatsAppRejectionTemplate(formType: AssociationFormType, bookingEnabled: boolean): string {
  if (bookingEnabled || formType === "booking") {
    return "Ciao {{nome_contatto}}, la tua richiesta per {{titolo_form}} non puo essere confermata. {{motivo_rigetto}}";
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
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Si" : "No";
  if (value === null || value === undefined || value === "") return "-";
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
  const navigate = useNavigate();
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
  const whatsappAutomationVariables = useMemo<WhatsAppAutomationVariable[]>(
    () => [
      ...baseWhatsAppVariables,
      ...sortedFields.map((field) => ({
        key: field.field_key,
        label: field.label,
        placeholder: `{{${field.field_key}}}`,
        hint: "Valore inviato dall'utente in questo campo del form.",
      })),
    ],
    [sortedFields],
  );
  const connectedWhatsAppAutomations = useMemo(
    () => selectedForm?.whatsapp_automations || [],
    [selectedForm?.whatsapp_automations],
  );
  const automationConnectionRows = useMemo(() => {
    const rows = [
      {
        key: "email_confirmation",
        label: "Email confirmation",
        description: formDraft.send_user_confirmation
          ? "Conferma utente via email attiva."
          : "Nessuna conferma email utente attiva.",
        enabled: Boolean(formDraft.send_user_confirmation),
        action: () => setActiveTab("settings"),
      },
      {
        key: "whatsapp_confirmation",
        label: "WhatsApp confirmation",
        description: connectedWhatsAppAutomations.length
          ? connectedWhatsAppAutomations[0]
            ? `Regola attiva: ${connectedWhatsAppAutomations[0].template_name}.`
            : "Regola WhatsApp collegata."
          : "Nessuna regola WhatsApp collegata a questo form.",
        enabled: connectedWhatsAppAutomations.some((item) => item.is_active),
        action: () => navigate(`/org-admin/comunicazioni?tab=whatsapp&formId=${selectedFormId ?? ""}`),
      },
      {
        key: "admin_notification",
        label: "Admin notification",
        description: formDraft.notify_admin_on_submit
          ? "La segreteria riceve una notifica o un riepilogo."
          : "Nessuna notifica admin automatica.",
        enabled: Boolean(formDraft.notify_admin_on_submit),
        action: () => setActiveTab("settings"),
      },
      {
        key: "reminder",
        label: "Reminder",
        description: connectedWhatsAppAutomations.some((item) => item.trigger_event === "booking_created")
          ? "Esiste almeno una regola collegata al momento della prenotazione."
          : "Nessun reminder collegato.",
        enabled: connectedWhatsAppAutomations.some((item) => item.is_active && item.trigger_event === "booking_created"),
        action: () => navigate(`/org-admin/comunicazioni?tab=whatsapp&formId=${selectedFormId ?? ""}`),
      },
    ];
    return rows;
  }, [
    connectedWhatsAppAutomations,
    formDraft.notify_admin_on_submit,
    formDraft.send_user_confirmation,
    navigate,
    selectedFormId,
  ]);

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

  function toggleWhatsAppAutoReply(enabled: boolean) {
    setFormDraft((current) => ({
      ...current,
      whatsapp_auto_reply_enabled: enabled,
      whatsapp_auto_reply_template:
        enabled && !current.whatsapp_auto_reply_template.trim()
          ? defaultWhatsAppTemplate(current.form_type, Boolean(current.booking_enabled || current.create_booking))
          : current.whatsapp_auto_reply_template,
    }));
  }

  function insertWhatsAppVariable(placeholder: string) {
    setFormDraft((current) => ({
      ...current,
      whatsapp_auto_reply_template: current.whatsapp_auto_reply_template.trim()
        ? `${current.whatsapp_auto_reply_template} ${placeholder}`
        : placeholder,
    }));
  }

  function insertDecisionTemplateVariable(
    target: "whatsapp_confirmation_template" | "whatsapp_rejection_template",
    placeholder: string,
  ) {
    setFormDraft((current) => ({
      ...current,
      [target]: String(current[target] || "").trim()
        ? `${String(current[target] || "")} ${placeholder}`
        : placeholder,
    }));
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
  ) {
    if (!selectedFormId || !selectedSubmission) return;
    setSubmissionActionState("loading");
    setSubmissionActionError(null);
    try {
      const response = await updateOrgAdminFormSubmissionStatus(selectedFormId, selectedSubmission.id, {
        status: nextStatus,
        reason: reason?.trim() || null,
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
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Live Preview</span>
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
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr] h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar pb-10">
      <div className="space-y-6">
        <div className="rounded-[1.4rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-neutral-900 mb-1">Automazioni collegate</h3>
          <p className="text-xs text-neutral-500 mb-5">Qui vedi subito quali automazioni partono da questo form e dove configurarle.</p>
          <div className="space-y-3">
            {automationConnectionRows.map((row) => (
              <div key={row.key} className="rounded-[1.1rem] border border-neutral-200 bg-neutral-50 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{row.label}</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">{row.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${row.enabled ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>
                      {row.enabled ? "ON" : "OFF"}
                    </span>
                    <button type="button" className="btn-secondary !py-2 !px-3 !text-xs" onClick={row.action}>
                      Configura
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {connectedWhatsAppAutomations.length > 0 ? (
            <div className="mt-5 rounded-[1.1rem] border border-emerald-200 bg-emerald-50 px-4 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">Relazione WhatsApp</p>
              <div className="mt-3 space-y-2">
                {connectedWhatsAppAutomations.map((automation) => (
                  <p key={automation.id} className="text-sm leading-6 text-emerald-900">
                    Quando un utente invia il modulo "{selectedForm?.title || "modulo"}", ASSONAM invia automaticamente il template "{automation.template_name}" usando{" "}
                    {automation.phone_source === "custom"
                      ? `il numero ${automation.custom_phone || "manuale"}`
                      : automation.phone_source === "member_phone"
                        ? "il telefono socio già salvato"
                        : `il campo ${automation.phone_field_key || "Telefono"}`}.
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-[1.25rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-neutral-900 mb-1">Pubblicazione e Accesso</h3>
          <p className="text-xs text-neutral-500 mb-5">Gestisci la visibilità del form.</p>
          
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-neutral-50/50 border border-neutral-100">
               <label className={labelClass}>Link pubblico</label>
               <div className="flex items-center gap-2 mt-2">
                 <input className={inputClass} readOnly value={selectedFormUrl || publicUrl || ""} placeholder="Salva per generare il link" />
                 <button className="btn-secondary whitespace-nowrap !py-2.5" onClick={() => void copyPublicLink(selectedFormUrl || publicUrl)} disabled={!selectedFormUrl && !publicUrl}>Copia</button>
               </div>
            </div>
            
            <label className={labelClass}>
              Personalizza parte finale URL (Slug)
              <input className={inputClass} disabled={locked} value={formDraft.public_slug} onChange={(event) => syncFormDraft("public_slug", derivePublicSlug(event.target.value))} placeholder="es: iscrizione-corso" />
            </label>

            <div className="pt-2">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm font-medium text-neutral-800">Pagina pubblica attiva</span>
                <div className="relative flex items-center justify-center">
                  <input type="checkbox" disabled={locked} checked={formDraft.is_active} onChange={(event) => syncFormDraft("is_active", event.target.checked)} className="peer sr-only" />
                  <div className="w-10 h-6 bg-neutral-200 rounded-full peer-checked:bg-emerald-500 transition-colors"></div>
                  <div className="absolute left-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                </div>
              </label>
            </div>

            <div>
               <label className={labelClass}>
                 Visibilità: Chi può compilare?
                 <select className={inputClass} disabled={locked} value={formDraft.visibility} onChange={(event) => syncFormDraft("visibility", event.target.value as AssociationFormVisibility)}>
                   <option value="public">Pubblico (Tutti)</option>
                   <option value="members_only">Solo soci registrati</option>
                 </select>
               </label>
            </div>
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Comportamento invio</h3>
          <div className="space-y-4">
            <label className={labelClass}>
              Email segreteria per notifiche (opzionale)
              <input
                className={inputClass}
                type="email"
                disabled={locked}
                value={formDraft.notification_email}
                onChange={(event) => syncFormDraft("notification_email", event.target.value)}
              />
            </label>
            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" disabled={locked} checked={formDraft.notify_admin_on_submit} onChange={(event) => syncFormDraft("notify_admin_on_submit", event.target.checked)} className="rounded border-neutral-300 text-brand" />
                Invia notifica automatica admin
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" disabled={locked} checked={formDraft.send_user_confirmation} onChange={(event) => syncFormDraft("send_user_confirmation", event.target.checked)} className="rounded border-neutral-300 text-brand" />
                Invia email di conferma all'utente
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" disabled={locked} checked={formDraft.allow_multiple_submissions} onChange={(event) => syncFormDraft("allow_multiple_submissions", event.target.checked)} className="rounded border-neutral-300 text-brand" />
                Consenti invii multipli dallo stesso utente
              </label>
            </div>
          </div>
        </div>

        <div className="rounded-[1.4rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-neutral-900">WhatsApp automatico</h3>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                  Sperimentale
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Questa e la risposta rapida legacy del form. Le nuove regole in "Automazioni collegate" qui sopra vengono configurate in Comunicazioni {" > "} WhatsApp e usano il numero definito nella singola regola.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
              <div className="relative flex items-center justify-center">
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={formDraft.whatsapp_auto_reply_enabled}
                  onChange={(event) => toggleWhatsAppAutoReply(event.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-6 w-10 rounded-full bg-neutral-200 transition-colors peer-checked:bg-brand"></div>
                <div className="absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4"></div>
              </div>
            </label>
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4 text-xs text-amber-900">
              Questo invio rapido parte solo se `ENABLE_WHATSAPP_EVOLUTION` e attivo, l'associazione ha una sessione WhatsApp connessa e il form contiene un vero campo telefono compilato oppure il socio associato ha un telefono.
            </div>

            <label className={labelClass}>
              Template messaggio
              <textarea
                className={`${inputClass} min-h-[150px] resize-y`}
                disabled={locked || !formDraft.whatsapp_auto_reply_enabled}
                value={formDraft.whatsapp_auto_reply_template}
                onChange={(event) => syncFormDraft("whatsapp_auto_reply_template", event.target.value)}
                placeholder={defaultWhatsAppTemplate(formDraft.form_type, Boolean(formDraft.booking_enabled || formDraft.create_booking))}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary !px-4 !py-2 !text-sm"
                disabled={locked || !formDraft.whatsapp_auto_reply_enabled}
                onClick={() =>
                  syncFormDraft(
                    "whatsapp_auto_reply_template",
                    defaultWhatsAppTemplate(formDraft.form_type, Boolean(formDraft.booking_enabled || formDraft.create_booking)),
                  )
                }
              >
                Carica template base
              </button>
              <button
                type="button"
                className="btn-secondary !px-4 !py-2 !text-sm"
                disabled={locked || !formDraft.whatsapp_auto_reply_enabled}
                onClick={() => syncFormDraft("whatsapp_auto_reply_template", "")}
              >
                Svuota
              </button>
            </div>

            <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/70 p-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-500">Variabili rapide</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Puoi usare sia le variabili di sistema sia direttamente le `field_key` dei campi del form.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {whatsappAutomationVariables.map((variable) => (
                  <button
                    key={variable.placeholder}
                    type="button"
                    className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={locked || !formDraft.whatsapp_auto_reply_enabled}
                    onClick={() => insertWhatsAppVariable(variable.placeholder)}
                    title={variable.hint}
                  >
                    {variable.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[1.2rem] border border-neutral-200 bg-neutral-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Template WhatsApp decisione richiesta</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    Questi messaggi partono quando l'org admin conferma o rigetta una richiesta.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 ring-1 ring-inset ring-neutral-200">
                  Nuovo flusso
                </span>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="rounded-[1rem] border border-neutral-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">Messaggio conferma</p>
                      <p className="mt-1 text-xs text-neutral-500">Inviato quando la richiesta viene approvata.</p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={locked}
                      onClick={() =>
                        syncFormDraft(
                          "whatsapp_confirmation_template",
                          defaultWhatsAppConfirmationTemplate(
                            formDraft.form_type,
                            Boolean(formDraft.booking_enabled || formDraft.create_booking),
                          ),
                        )
                      }
                    >
                      Usa base
                    </button>
                  </div>
                  <textarea
                    className={`${inputClass} min-h-[160px] resize-y`}
                    disabled={locked}
                    value={formDraft.whatsapp_confirmation_template}
                    onChange={(event) => syncFormDraft("whatsapp_confirmation_template", event.target.value)}
                    placeholder={defaultWhatsAppConfirmationTemplate(
                      formDraft.form_type,
                      Boolean(formDraft.booking_enabled || formDraft.create_booking),
                    )}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {whatsappAutomationVariables.map((variable) => (
                      <button
                        key={`confirm-${variable.placeholder}`}
                        type="button"
                        className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100"
                        disabled={locked}
                        onClick={() => insertDecisionTemplateVariable("whatsapp_confirmation_template", variable.placeholder)}
                      >
                        {variable.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1rem] border border-neutral-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">Messaggio rigetto</p>
                      <p className="mt-1 text-xs text-neutral-500">Puoi usare anche la variabile <code>{"{{motivo_rigetto}}"}</code>.</p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={locked}
                      onClick={() =>
                        syncFormDraft(
                          "whatsapp_rejection_template",
                          defaultWhatsAppRejectionTemplate(
                            formDraft.form_type,
                            Boolean(formDraft.booking_enabled || formDraft.create_booking),
                          ),
                        )
                      }
                    >
                      Usa base
                    </button>
                  </div>
                  <textarea
                    className={`${inputClass} min-h-[160px] resize-y`}
                    disabled={locked}
                    value={formDraft.whatsapp_rejection_template}
                    onChange={(event) => syncFormDraft("whatsapp_rejection_template", event.target.value)}
                    placeholder={defaultWhatsAppRejectionTemplate(
                      formDraft.form_type,
                      Boolean(formDraft.booking_enabled || formDraft.create_booking),
                    )}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                      disabled={locked}
                      onClick={() => insertDecisionTemplateVariable("whatsapp_rejection_template", "{{motivo_rigetto}}")}
                    >
                      Motivo rigetto
                    </button>
                    {whatsappAutomationVariables.map((variable) => (
                      <button
                        key={`reject-${variable.placeholder}`}
                        type="button"
                        className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100"
                        disabled={locked}
                        onClick={() => insertDecisionTemplateVariable("whatsapp_rejection_template", variable.placeholder)}
                      >
                        {variable.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-[1.25rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-900">Integrazione Prenotazioni</h3>
            <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer group">
              <div className="relative flex items-center justify-center">
                <input type="checkbox" disabled={locked} checked={formDraft.booking_enabled} onChange={(event) => syncFormDraft("booking_enabled", event.target.checked)} className="peer sr-only" />
                <div className="w-10 h-6 bg-neutral-200 rounded-full peer-checked:bg-brand transition-colors"></div>
                <div className="absolute left-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
              </div>
            </label>
          </div>

          {formDraft.booking_enabled && (
            <div className="space-y-4 pt-4 border-t border-neutral-100">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" disabled={locked} checked={formDraft.booking_requires_manual_confirmation} onChange={(event) => syncFormDraft("booking_requires_manual_confirmation", event.target.checked)} className="rounded border-neutral-300 text-brand" />
                  Richiede conferma manuale prenotazione
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" disabled={locked} checked={formDraft.booking_notification_enabled} onChange={(event) => syncFormDraft("booking_notification_enabled", event.target.checked)} className="rounded border-neutral-300 text-brand" />
                  Invia email di stato booking
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" disabled={locked} checked={formDraft.booking_auto_assign_enabled} onChange={(event) => syncFormDraft("booking_auto_assign_enabled", event.target.checked)} className="rounded border-neutral-300 text-brand" />
                  Assegna automaticamente il primo tavolo libero compatibile
                </label>
              </div>

              <div className="space-y-3 bg-neutral-50/50 p-4 rounded-xl border border-neutral-100">
                <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3">Mappatura campi (Data, Ora, ecc.)</h4>
                {bookingMappingTargets.map((target) => (
                  <div key={target.key} className="flex flex-col xl:flex-row xl:items-center gap-2">
                    <span className="text-[13px] font-medium text-neutral-700 xl:w-1/3">{target.label}</span>
                    <select
                      className={`${inputClass} !py-2 !mt-0 xl:w-2/3`}
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
          )}
        </div>
        
        <div className="rounded-[1.25rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Personalizzazione Email (Avanzate)</h3>
          <div className="space-y-4">
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
        </div>
      </div>
    </div>
  );

  const responsesTab = (
    <div className="space-y-6">
      <div className="admin-toolbar">
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
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="admin-stat">
          <span className="admin-stat__label">Totale richieste</span>
          <span className="admin-stat__value">{submissionSummary.total}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__label">In attesa</span>
          <span className="admin-stat__value">{submissionSummary.pending}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__label">Confermate</span>
          <span className="admin-stat__value">{submissionSummary.confirmed}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__label">Rigettate</span>
          <span className="admin-stat__value">{submissionSummary.rejected}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__label">Con booking</span>
          <span className="admin-stat__value">{submissionSummary.booking}</span>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(340px,0.92fr)_minmax(0,1.35fr)] xl:items-start">
        <div className="admin-panel min-h-[36rem] overflow-hidden">
          <div className="admin-panel__header">
            <div>
              <p className="admin-eyebrow">Lista richieste</p>
              <h4 className="mt-2 text-lg font-semibold text-neutral-950">Inbox form</h4>
            </div>
            <span className="status-badge status-badge--pending">{submissionSummary.pending} pending</span>
          </div>
          <div className="max-h-[58vh] overflow-y-auto">
            {submissionsLoading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : submissions.length === 0 ? (
              <div className="admin-empty-state">
                <p className="text-base font-semibold text-neutral-900">Nessuna risposta ricevuta</p>
                <p className="mt-2 text-sm text-neutral-500">
                  Quando arriveranno nuove richieste le vedrai qui con stato, audit e azioni rapide.
                </p>
              </div>
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
        </div>

        <div className="admin-panel admin-panel--soft sticky top-6">
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Azioni rapide</p>
                    <p className="mt-1 text-sm text-neutral-500">
                      Conferma, rigetta o riporta la richiesta in attesa senza uscire dal dettaglio.
                    </p>
                  </div>
                  {submissionActionState === "loading" ? (
                    <span className="text-xs font-semibold text-neutral-500">Aggiornamento in corso...</span>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  {selectedSubmission.available_actions.confirm ? (
                    <button
                      type="button"
                      className="btn-success"
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
                      className="btn-danger"
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
                      className="btn-secondary"
                      disabled={submissionActionState === "loading"}
                      onClick={() => {
                        setSubmissionActionError(null);
                        setConfirmActionOpen("pending");
                      }}
                    >
                      Riporta a pending
                    </button>
                  ) : null}
                </div>
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
            <div className="admin-empty-state">
              <p className="text-base font-semibold text-neutral-900">Seleziona una richiesta</p>
              <p className="mt-2 text-sm text-neutral-500">
                A destra vedrai dati inviati, stato corrente, storico review e azioni disponibili.
              </p>
            </div>
          )}
        </div>
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
          <section className={`flex flex-col min-h-screen bg-neutral-50`}>
            {/* Header Moderno */}
            <div className="sticky top-0 z-50 bg-white border-b border-neutral-200 px-4 md:px-8 py-3 shrink-0 flex flex-col gap-4 md:flex-row md:items-center md:justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <button 
                  onClick={resetEditorState}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-50 border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                  title="Torna alla lista"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </button>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold tracking-tight text-neutral-900">
                      {selectedFormId ? formDraft.title || selectedForm?.title || "Senza titolo" : "Nuova pagina form"}
                    </h2>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest shadow-sm ring-1 ring-inset ${formDraft.is_active ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                      {formDraft.is_active ? 'Pubblicato' : 'Bozza'}
                    </span>
                  </div>
                  {selectedFormUrl && (
                    <a href={selectedFormUrl} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-brand hover:underline mt-0.5 inline-flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
                      {selectedFormUrl} <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <button className={`btn-ghost !px-4 !py-2 !text-sm ${formDraft.is_active ? '!text-neutral-600' : '!text-emerald-600 hover:!bg-emerald-50'}`} type="button" onClick={() => syncFormDraft('is_active', !formDraft.is_active)} disabled={locked}>
                  {formDraft.is_active ? "Sospendi (Rendi Bozza)" : "Pubblica Form"}
                </button>
                <button 
                  type="button"
                  className="btn-secondary !px-4 !py-2 !text-sm" 
                  onClick={() => setRealPreviewOpen(true)}
                >
                  Anteprima reale
                </button>
                <button className="btn-primary shadow-lg !px-6 !py-2" type="button" onClick={() => void handleSaveForm()} disabled={savingForm || locked}>
                  {savingForm ? "Salvataggio..." : "Salva Modifiche"}
                </button>
              </div>
            </div>

            {selectedFormId && (
              <div className="border-b border-neutral-200 bg-white px-4 md:px-8 py-4">
                <div className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 px-5 py-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Comunicazioni collegate</p>
                      <p className="mt-2 text-sm font-semibold text-neutral-900">Usa questo modulo in una campagna</p>
                      <p className="mt-1 text-sm text-neutral-500">Rafforza il collegamento mentale tra form pubblico e invito email: il pulsante nell’email aprirà questa pagina nel browser.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a className="btn-primary !px-4 !py-2 !text-sm" href={`/org-admin/communications?tab=campagne&mode=create&intent=form_invite&formId=${selectedFormId}`}>
                        Crea invito email
                      </a>
                      <button
                        type="button"
                        className="btn-secondary !px-4 !py-2 !text-sm"
                        onClick={() => {
                          if (!selectedFormUrl) return;
                          navigator.clipboard.writeText(selectedFormUrl);
                          showToast({ title: "Link copiato", message: "Il link pubblico del modulo è stato copiato negli appunti.", tone: "success" });
                        }}
                      >
                        Copia link pubblico
                      </button>
                      {selectedFormUrl && (
                        <a className="btn-secondary !px-4 !py-2 !text-sm" href={selectedFormUrl} target="_blank" rel="noreferrer">
                          Anteprima pagina pubblica
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Tabs */}
            <div className="border-b border-neutral-200 bg-white px-4 md:px-8 shrink-0 flex items-center justify-between shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] z-40">
              <div className="flex gap-6 overflow-x-auto no-scrollbar">
                {editorTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => handleEditorTabChange(tab.key)}
                    className={`relative py-4 text-sm font-bold transition-colors ${
                      activeTab === tab.key 
                        ? "text-brand" 
                        : "text-neutral-500 hover:text-neutral-800"
                    }`}
                  >
                    {tab.label}
                    {activeTab === tab.key && (
                      <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-brand rounded-t-full"></span>
                    )}
                  </button>
                ))}
              </div>
              {selectedForm && (
                <button
                  className="text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                  type="button"
                  onClick={handleDeleteForm}
                  disabled={locked}
                >
                  {deleteArmed ? "Clicca di nuovo per confermare eliminazione" : "Elimina form"}
                </button>
              )}
            </div>

            {/* Tab Content */}
            <div className="flex-1 p-4 md:p-8 overflow-hidden h-full">

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
      <ConfirmModal
        open={confirmActionOpen === "confirmed"}
        title="Confermare la richiesta?"
        description="La richiesta passera a confermata e, se disponibile, partira il messaggio WhatsApp automatico."
        confirmLabel="Conferma richiesta"
        confirmState={submissionActionState}
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
        description="La review verra azzerata e la richiesta tornera nello stato pending."
        confirmLabel="Riporta a pending"
        confirmState={submissionActionState}
        onClose={() => {
          if (submissionActionState === "loading") return;
          setConfirmActionOpen(false);
          setSubmissionActionError(null);
        }}
        onConfirm={() => void handleSubmissionDecision("pending")}
      />
      <PromptModal
        open={rejectActionOpen}
        title="Rigettare la richiesta?"
        description="Inserisci un motivo chiaro: verra salvato nell'audit e puo essere riusato nel messaggio WhatsApp automatico."
        label="Motivo del rigetto"
        placeholder="Es. posti esauriti, dati incompleti, richiesta fuori finestra utile."
        confirmLabel="Rigetta richiesta"
        confirmState={submissionActionState}
        error={submissionActionError}
        onClose={() => {
          if (submissionActionState === "loading") return;
          setRejectActionOpen(false);
          setSubmissionActionError(null);
        }}
        onConfirm={(value) => void handleSubmissionDecision("rejected", value)}
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
