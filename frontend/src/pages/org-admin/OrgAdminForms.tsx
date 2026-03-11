import { FormEvent, useEffect, useMemo, useState } from "react";
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

const inputClass =
  "mt-1 w-full rounded-[1.1rem] border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-neutral-900/40 focus:ring-2 focus:ring-neutral-900/10";
const labelClass = "block text-sm font-medium text-neutral-700";
const studioCardClass = "rounded-[1.85rem] border border-neutral-200 bg-white/92 shadow-[0_24px_80px_rgba(15,23,42,0.06)] backdrop-blur";

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
    booking_field_mapping: {} as Record<string, string>,
    notify_admin_on_submit: true,
    send_user_confirmation: true,
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
      booking_field_mapping: selectedForm.booking_field_mapping || {},
      notify_admin_on_submit: Boolean(selectedForm.notify_admin_on_submit),
      send_user_confirmation: Boolean(selectedForm.send_user_confirmation),
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

  function resetEditorState() {
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

  async function openFormEditor(formId: number) {
    const detail = await fetchOrgAdminForm(formId);
    setIsCreatingForm(false);
    setSelectedFormId(detail.form.id);
    setSelectedForm(detail.form);
    setBuilderDraftFields(decodeBuilderFields(detail.form));
    setForms((current) => current.map((item) => (item.id === detail.form.id ? detail.form : item)));
    setDeleteArmed(false);
    setActiveTab("builder");
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
      } else if (!isEditorOpen) {
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
        booking_field_mapping: formDraft.booking_field_mapping || {},
        admin_notification_template_id: formDraft.admin_notification_template_id || null,
        user_confirmation_template_id: formDraft.user_confirmation_template_id || null,
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

  function handleCreateNewForm() {
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
        <div className="rounded-[1.4rem] border border-neutral-200 bg-white p-5 shadow-sm">
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

        <div className="rounded-[1.4rem] border border-neutral-200 bg-white p-5 shadow-sm">
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

        <div className="rounded-[1.4rem] border border-neutral-200 bg-white p-5 shadow-sm">
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

      <div className="rounded-[1.6rem] border border-neutral-200 bg-neutral-100 overflow-hidden shadow-inner flex flex-col h-full">
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

        <div className="rounded-[1.4rem] border border-neutral-200 bg-white p-6 shadow-sm">
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
      </div>

      <div className="space-y-6">
        <div className="rounded-[1.4rem] border border-neutral-200 bg-white p-6 shadow-sm">
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
        
        <div className="rounded-[1.4rem] border border-neutral-200 bg-white p-6 shadow-sm">
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          <div className="rounded-lg border border-neutral-200 bg-white px-4 py-2">
            <span className="text-xs text-neutral-500 block">Totale</span>
            <span className="text-lg font-semibold">{submissions.length}</span>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white px-4 py-2">
            <span className="text-xs text-neutral-500 block">Booking</span>
            <span className="text-lg font-semibold">{submissions.filter((item) => item.booking).length}</span>
          </div>
        </div>
        {selectedFormId && submissions.length > 0 && (
          <a className="btn-secondary !py-2" href={buildOrgAdminFormSubmissionsExportUrl(selectedFormId)}>
            Scarica CSV
          </a>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-neutral-500">Data</th>
                  <th className="px-4 py-3 text-left font-medium text-neutral-500">Stato</th>
                  <th className="px-4 py-3 text-left font-medium text-neutral-500">Mittente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {submissionsLoading ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-neutral-500">Caricamento...</td></tr>
                ) : submissions.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-neutral-500">Nessuna risposta</td></tr>
                ) : (
                  submissions.map((sub) => (
                    <tr
                      key={sub.id}
                      onClick={() => {
                        fetchOrgAdminFormSubmission(selectedFormId!, sub.id)
                          .then((r) => setSelectedSubmission(r.submission))
                          .catch(() => setSelectedSubmission(sub));
                      }}
                      className={`cursor-pointer transition-colors ${
                        selectedSubmission?.id === sub.id ? "bg-brand/5" : "hover:bg-neutral-50"
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(sub.submitted_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {sub.booking ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                            Booking: {sub.booking.status}
                          </span>
                        ) : (
                          <span className="text-neutral-500 text-xs">{sub.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 truncate max-w-[200px]">
                        {sub.submitted_by?.name || sub.submitted_by?.email || `#${sub.id}`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 h-fit sticky top-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Dettaglio risposta</h3>
          {selectedSubmission ? (
            <div className="space-y-3">
              {selectedSubmissionEntries.map((entry) => (
                <div key={entry.key} className="rounded-lg bg-white p-3 shadow-sm border border-neutral-100">
                  <div className="text-xs text-neutral-500">{entry.label}</div>
                  <div className="mt-1 text-sm text-neutral-900 font-medium break-words">
                    {stringifySubmissionValue(entry.value)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500 text-center py-4">Seleziona una riga per vedere i dettagli.</p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={embedded ? "" : (isEditorOpen ? "w-full" : "container-shell py-6")}>
      <div className={`${embedded ? "space-y-6" : (isEditorOpen ? "w-full" : "mx-auto max-w-6xl space-y-6")}`}>
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}
        {locked ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-5 text-sm text-amber-900 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-700">Workflow bloccato</p>
            <p className="mt-2">{lockedMessage}</p>
          </div>
        ) : null}

        {!isEditorOpen && !loading && !adminLoading && forms.length > 0 && (
          <section className={`${studioCardClass} overflow-hidden`}>
            <div className="border-b border-neutral-200/80 px-5 py-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-neutral-900">Le tue pagine modulo</h2>
                  <p className="mt-1 text-sm text-neutral-500">Seleziona una pagina esistente o creane una nuova.</p>
                </div>
                <button className="btn-primary" type="button" onClick={handleCreateNewForm} disabled={locked}>
                  {locked ? "Modulo richiesto" : "Nuovo form"}
                </button>
              </div>
            </div>
            <div className="px-5 py-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {forms.map((form) => (
                  <div
                    key={form.id}
                    onClick={() => {
                      void openFormEditor(form.id);
                    }}
                    className="group cursor-pointer rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-neutral-900">{form.title}</h3>
                        <p className="mt-1 text-xs text-neutral-500">/{form.public_slug}</p>
                      </div>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${form.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
                        {form.is_active ? 'Attivo' : 'Bozza'}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-neutral-500">
                      <span>{form.submission_count} risposte</span>
                      <span>{form.field_count} campi</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {!isEditorOpen && !loading && !adminLoading && forms.length === 0 && (
          <section className={`${studioCardClass} px-6 py-10 text-center`}>
            <div className="mx-auto max-w-xl">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-neutral-500">Pagine e moduli</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900">Nessun form creato</h2>
              <p className="mt-2 text-sm text-neutral-500">
                Crea il primo modulo pubblico per raccogliere iscrizioni, richieste o prenotazioni.
              </p>
              <button className="btn-primary mt-6" type="button" onClick={handleCreateNewForm} disabled={locked}>
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

            {/* Navigation Tabs */}
            <div className="border-b border-neutral-200 bg-white px-4 md:px-8 shrink-0 flex items-center justify-between shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] z-40">
              <div className="flex gap-6 overflow-x-auto no-scrollbar">
                {editorTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
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
               className={`bg-white rounded-[2rem] overflow-hidden shadow-2xl transition-all duration-300 ring-4 ring-white/5 ${previewMode === "mobile" ? "w-[375px] min-h-[812px]" : "w-full max-w-[1440px] min-h-[800px]"}`}
            >
              <FormPublicCanvas form={previewForm} values={previewValues} interactive />
            </div>
          </div>
        </div>
      )}
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
