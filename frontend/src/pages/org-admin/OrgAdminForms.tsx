import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  buildOrgAdminFormSubmissionsExportUrl,
  createOrgAdminForm,
  createOrgAdminFormField,
  deleteOrgAdminForm,
  deleteOrgAdminFormField,
  duplicateOrgAdminForm,
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
import Skeleton from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/ToastProvider";
import { useOrgAdmin } from "./OrgAdminLayout";
import { FormPublicCanvas } from "../../components/forms/FormPublicCanvas";

const inputClass =
  "mt-1 w-full rounded-[1.1rem] border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-neutral-900/40 focus:ring-2 focus:ring-neutral-900/10";
const labelClass = "block text-sm font-medium text-neutral-700";
const studioCardClass = "rounded-[1.85rem] border border-neutral-200 bg-white/92 shadow-[0_24px_80px_rgba(15,23,42,0.06)] backdrop-blur";

type EditorTab = "builder" | "design" | "automations" | "responses" | "share";
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
  { key: "builder", label: "Builder", hint: "Campi e struttura" },
  { key: "design", label: "Design", hint: "Look & feel pubblico" },
  { key: "automations", label: "Automazioni", hint: "Template e follow-up" },
  { key: "responses", label: "Risposte", hint: "Invii raccolti" },
  { key: "share", label: "Condividi", hint: "Link, stato e accesso" },
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

const formTypeOptions: Array<{ value: AssociationFormType; label: string; hint: string }> = [
  { value: "generic", label: "Generico", hint: "Modulo classico per contatti o richieste." },
  { value: "booking", label: "Prenotazione", hint: "Alla submit crea anche una prenotazione in agenda." },
  { value: "request", label: "Richiesta", hint: "Richieste strutturate gestite dalla segreteria." },
];

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

function buildPreviewValues(form: AssociationForm | null): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of form?.fields || []) {
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
  const [selectedForm, setSelectedForm] = useState<AssociationForm | null>(null);
  const [formDraft, setFormDraft] = useState(emptyFormDraft());
  const [savingForm, setSavingForm] = useState(false);
  const [formSaved, setFormSaved] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("builder");

  const [fieldDraft, setFieldDraft] = useState(emptyFieldDraft(null));
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [fieldKeyManual, setFieldKeyManual] = useState(false);
  const [savingField, setSavingField] = useState(false);
  const [fieldSaved, setFieldSaved] = useState(false);
  const [deleteFieldArmed, setDeleteFieldArmed] = useState<number | null>(null);
  const [draggingFieldId, setDraggingFieldId] = useState<number | null>(null);
  const [reorderingFields, setReorderingFields] = useState(false);

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
      setSelectedFormId(null);
      setSelectedForm(null);
      return;
    }
    void loadForms();
  }, [adminLoading, admin, locked]);

  useEffect(() => {
    if (!selectedForm) {
      setFormDraft(emptyFormDraft());
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
  }, [selectedForm]);

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

  const activeFormsCount = useMemo(() => forms.filter((form) => form.is_active).length, [forms]);
  const totalResponses = useMemo(() => forms.reduce((sum, form) => sum + form.submission_count, 0), [forms]);
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
  const sortedFields = useMemo(
    () => [...(selectedForm?.fields || [])].sort((left, right) => left.sort_order - right.sort_order),
    [selectedForm?.fields],
  );
  const bookingMappingFieldOptions = useMemo(
    () =>
      sortedFields.map((field) => ({
        value: field.field_key,
        label: `${field.label} (${field.field_key})`,
      })),
    [sortedFields],
  );
  const previewValues = useMemo(() => buildPreviewValues(selectedForm), [selectedForm]);
  const responseDestinationEmail = useMemo(
    () => formDraft.notification_email?.trim() || admin?.email || "",
    [admin?.email, formDraft.notification_email],
  );
  const selectedSubmissionEntries = useMemo(() => {
    const fieldMap = new Map((selectedForm?.fields || []).map((field) => [field.field_key, field.label]));
    return Object.entries(selectedSubmission?.payload_json || {}).map(([key, value]) => ({
      key,
      label: fieldMap.get(key) || key,
      value,
    }));
  }, [selectedForm?.fields, selectedSubmission?.payload_json]);

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
      const targetId = nextSelectedId ?? selectedFormId ?? response.items[0]?.id ?? null;
      if (targetId) {
        const detail = await fetchOrgAdminForm(targetId);
        setSelectedFormId(detail.form.id);
        setSelectedForm(detail.form);
      } else {
        setSelectedFormId(null);
        setSelectedForm(null);
        setFormDraft(emptyFormDraft());
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
    setFormSaved(false);
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
    setFormSaved(false);
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
    setSavingForm(true);
    setFormSaved(false);
    try {
      const bookingEnabled = Boolean(formDraft.booking_enabled || formDraft.create_booking);
      const payload = {
        ...formDraft,
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
      setSelectedFormId(response.form.id);
      setSelectedForm(response.form);
      setFormSaved(true);
      showToast({
        tone: "success",
        title: selectedFormId ? "Form aggiornato" : "Form creato",
        message: "La pagina pubblica è pronta per essere rifinita e condivisa.",
      });
      await loadForms(response.form.id);
      window.setTimeout(() => setFormSaved(false), 1600);
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

  async function handleDuplicateForm(form: AssociationForm) {
    if (locked) {
      showToast({ tone: "error", title: "Form bloccati", message: lockedMessage });
      return;
    }
    setDuplicating(true);
    try {
      const response = await duplicateOrgAdminForm(form.id, {
        title: `${form.title} copia`,
      });
      showToast({
        tone: "success",
        title: "Form duplicato",
        message: "La copia è stata creata in stato non attivo.",
      });
      await loadForms(response.form.id);
    } catch (err) {
      showToast({
        tone: "error",
        title: "Duplicazione non riuscita",
        message: err instanceof Error ? err.message : "Errore duplicazione form.",
      });
    } finally {
      setDuplicating(false);
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
      setDeleteArmed(false);
      await loadForms(null);
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
    setFieldSaved(false);
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
      setFieldSaved(true);
      showToast({
        tone: "success",
        title: editingFieldId ? "Campo aggiornato" : "Campo aggiunto",
        message: "Il canvas del form è stato aggiornato.",
      });
      window.setTimeout(() => setFieldSaved(false), 1600);
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

  function openPublicLink(link: string) {
    if (!link) return;
    window.open(link, "_blank", "noopener,noreferrer");
  }

  function handleCreateNewForm() {
    setSelectedFormId(null);
    setSelectedForm(null);
    setSubmissions([]);
    setSelectedSubmission(null);
    setDeleteArmed(false);
    setActiveTab("design");
    setFormDraft(emptyFormDraft());
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
      fields: selectedForm?.fields || [],
      association: {
        name: admin?.organization?.name || "Associazione",
      },
    }),
    [admin?.organization?.name, formDraft, selectedForm?.fields],
  );

  const builderTab = (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
        <div className="rounded-[1.6rem] border border-neutral-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Contenuto pagina</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-neutral-950">Testi e link del form pubblico</h3>
              <p className="mt-1 text-sm text-neutral-600">
                Qui costruisci la pagina vera e propria: titolo, descrizione, slug e messaggio finale restano nello stesso punto del builder.
              </p>
            </div>
            <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-semibold text-neutral-600">
              {sortedFields.length} campi
            </span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              Titolo pagina
              <input
                className={inputClass}
                disabled={locked}
                value={formDraft.title}
                onChange={(event) => syncFormDraft("title", event.target.value)}
                placeholder="Prenotazione tavolo"
              />
            </label>
            <label className={labelClass}>
              Slug pubblico
              <input
                className={inputClass}
                disabled={locked}
                value={formDraft.public_slug}
                onChange={(event) => syncFormDraft("public_slug", derivePublicSlug(event.target.value))}
                placeholder="prenotazione-tavolo"
              />
            </label>
            <label className={`${labelClass} md:col-span-2`}>
              Descrizione
              <textarea
                className={`${inputClass} min-h-[108px]`}
                disabled={locked}
                value={formDraft.description}
                onChange={(event) => syncFormDraft("description", event.target.value)}
                placeholder="Spiega subito a chi arriva il form e cosa succede dopo l'invio."
              />
            </label>
            <label className={labelClass}>
              Testo bottone
              <input
                className={inputClass}
                disabled={locked}
                value={formDraft.submit_button_text}
                onChange={(event) => syncFormDraft("submit_button_text", event.target.value)}
                placeholder="Invia richiesta"
              />
            </label>
            <label className={labelClass}>
              Messaggio post-invio
              <input
                className={inputClass}
                disabled={locked}
                value={formDraft.success_message}
                onChange={(event) => syncFormDraft("success_message", event.target.value)}
                placeholder="Richiesta inviata correttamente."
              />
            </label>
          </div>
          <div className="mt-4 rounded-[1.25rem] border border-neutral-200 bg-neutral-50 px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Link finale consigliato</p>
            <p className="mt-2 break-all text-sm font-semibold text-neutral-900">
              {publicUrl || "Salva il form per generare il link completo"}
            </p>
          </div>
        </div>

        <div className="rounded-[1.6rem] border border-neutral-200 bg-[linear-gradient(180deg,#f8fafc,#ffffff)] p-4">
          <div className="mb-3">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Anteprima finale</p>
            <p className="mt-1 text-sm text-neutral-600">Questa è la stessa resa finale che vedrà l’utente sul link pubblico.</p>
          </div>
          <FormPublicCanvas form={previewForm} values={previewValues} heroLabel="Preview pubblica" />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
      <aside className="space-y-4">
        <div className="rounded-[1.6rem] border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Field library</p>
          <p className="mt-2 text-sm text-neutral-600">
            Aggiungi nuovi blocchi al canvas. La chiave tecnica viene generata automaticamente.
          </p>
          <div className="mt-4 grid gap-2">
            {fieldTypeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={locked}
                onClick={() => startNewField(option.value)}
                className="rounded-[1.2rem] border border-neutral-200 bg-white px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-neutral-950 text-xs font-bold text-white">
                    {option.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{option.label}</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">{option.hint}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="space-y-4">
        <div className="rounded-[1.6rem] border border-neutral-200 bg-[linear-gradient(180deg,#f9fafb,#ffffff)] p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Canvas</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-neutral-950">Struttura del form</h3>
              <p className="mt-1 text-sm text-neutral-600">Trascina i blocchi per cambiare l'ordine e clicca un campo per modificarlo.</p>
            </div>
            <div className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-600">
              {sortedFields.length} campi
            </div>
          </div>
        </div>

        {!selectedFormId ? (
          <div className="rounded-[1.6rem] border border-dashed border-neutral-200 bg-neutral-50 px-5 py-10 text-center text-sm text-neutral-500">
            Salva prima la pagina form per iniziare a costruire il canvas e generare il link pubblico.
          </div>
        ) : sortedFields.length === 0 ? (
          <div className="rounded-[1.6rem] border border-dashed border-neutral-200 bg-neutral-50 px-5 py-10 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-400">Builder vuoto</p>
            <h3 className="mt-3 font-serif text-3xl tracking-tight text-neutral-950">Inizia dal primo campo</h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-neutral-600">
              Scegli un blocco dalla libreria a sinistra. Il canvas centrale mostrerà subito l'ordine reale della pagina pubblica.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {sortedFields.map((field) => {
              const meta = fieldTypeOptions.find((option) => option.value === field.field_type);
              const isSelected = editingFieldId === field.id;
              return (
                <button
                  key={field.id}
                  type="button"
                  draggable={!locked}
                  disabled={locked}
                  onDragStart={() => setDraggingFieldId(field.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void handleFieldDrop(field.id);
                  }}
                  onClick={() => handleEditField(field)}
                  className={`rounded-[1.5rem] border p-4 text-left transition ${
                    isSelected
                      ? "border-neutral-900 bg-neutral-950 text-white shadow-[0_18px_70px_rgba(15,23,42,0.24)]"
                      : "border-neutral-200 bg-white hover:-translate-y-0.5 hover:border-neutral-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl text-xs font-bold ${
                        isSelected ? "bg-white/12 text-white" : "bg-neutral-100 text-neutral-700"
                      }`}>
                        {meta?.icon || "Aa"}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold">{field.label}</p>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                            isSelected ? "bg-white/10 text-white/72" : "bg-neutral-100 text-neutral-500"
                          }`}>
                            {meta?.label || field.field_type}
                          </span>
                          {field.is_required ? (
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                              isSelected ? "bg-amber-300/16 text-amber-200" : "bg-amber-100 text-amber-700"
                            }`}>
                              Obbligatorio
                            </span>
                          ) : null}
                        </div>
                        <p className={`mt-2 text-sm ${isSelected ? "text-white/72" : "text-neutral-500"}`}>
                          {field.help_text || meta?.hint || "Campo configurabile dal pannello laterale."}
                        </p>
                        {field.options.length > 0 ? (
                          <p className={`mt-3 text-xs ${isSelected ? "text-white/60" : "text-neutral-400"}`}>
                            {field.options.join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      isSelected ? "bg-white/10 text-white/78" : "bg-neutral-100 text-neutral-500"
                    }`}>
                      #{field.sort_order}
                    </span>
                  </div>
                </button>
              );
            })}
            <div
              className="rounded-[1.4rem] border border-dashed border-neutral-200 bg-neutral-50 px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void handleFieldDrop(null);
              }}
            >
              {reorderingFields ? "Riordino..." : "Trascina qui per spostare il campo in fondo"}
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <div className="rounded-[1.6rem] border border-neutral-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Field settings</p>
              <h3 className="mt-2 text-lg font-semibold text-neutral-950">
                {editingFieldId ? "Modifica campo" : "Nuovo campo"}
              </h3>
            </div>
            {editingFieldId ? (
              <button
                type="button"
                className="text-xs font-semibold text-neutral-500 transition hover:text-neutral-900"
                disabled={locked}
                onClick={() => startNewField(fieldDraft.field_type)}
              >
                Nuovo
              </button>
            ) : null}
          </div>

          <form className="mt-5 space-y-4" onSubmit={(event) => void handleSaveField(event)}>
            <label className={labelClass}>
              Etichetta visibile
              <input
                className={inputClass}
                disabled={locked}
                value={fieldDraft.label}
                onChange={(event) => handleFieldLabelChange(event.target.value)}
                placeholder="Nome e cognome"
              />
            </label>

            <label className={labelClass}>
              Tipo campo
              <select
                className={inputClass}
                disabled={locked}
                value={fieldDraft.field_type}
                onChange={(event) => {
                  const nextType = event.target.value as AssociationFormFieldType;
                  const defaultDraft = emptyFieldDraft(selectedForm, nextType);
                  setFieldDraft((current) => ({
                    ...current,
                    field_type: nextType,
                    options_text: defaultDraft.options_text,
                  }));
                }}
              >
                {fieldTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={labelClass}>
              Placeholder
              <input
                className={inputClass}
                disabled={locked}
                value={fieldDraft.placeholder}
                onChange={(event) => setFieldDraft((current) => ({ ...current, placeholder: event.target.value }))}
                placeholder="Scrivi qui"
              />
            </label>

            <label className={labelClass}>
              Help text
              <textarea
                className={`${inputClass} min-h-[88px]`}
                disabled={locked}
                value={fieldDraft.help_text}
                onChange={(event) => setFieldDraft((current) => ({ ...current, help_text: event.target.value }))}
                placeholder="Micro-copy di supporto sotto al campo"
              />
            </label>

            {["select", "radio", "checkbox"].includes(fieldDraft.field_type) ? (
              <label className={labelClass}>
                Opzioni
                <input
                  className={inputClass}
                  disabled={locked}
                  value={fieldDraft.options_text}
                  onChange={(event) => setFieldDraft((current) => ({ ...current, options_text: event.target.value }))}
                  placeholder="Mattina, Pomeriggio, Sera"
                />
              </label>
            ) : null}

            <div className="rounded-[1.3rem] border border-neutral-200 bg-neutral-50 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Chiave tecnica</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    Di default viene derivata dall'etichetta. Modificala solo se ti serve una chiave stabile personalizzata.
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold text-neutral-500 transition hover:text-neutral-900"
                  disabled={locked}
                  onClick={() => {
                    setFieldKeyManual(false);
                    setFieldDraft((current) => ({ ...current, field_key: slugifyKey(current.label) }));
                  }}
                >
                  Rigenera
                </button>
              </div>
              <input
                className={inputClass}
                disabled={locked}
                value={fieldDraft.field_key}
                onChange={(event) => {
                  setFieldKeyManual(true);
                  setFieldDraft((current) => ({ ...current, field_key: slugifyKey(event.target.value) }));
                }}
                placeholder="nome_socio"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className={labelClass}>
                Ordine
                <input
                  className={inputClass}
                  type="number"
                  disabled={locked}
                  value={fieldDraft.sort_order}
                  onChange={(event) => setFieldDraft((current) => ({ ...current, sort_order: Number(event.target.value || 0) }))}
                />
              </label>
              <label className="flex items-center gap-3 rounded-[1.2rem] border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={fieldDraft.is_required}
                  onChange={(event) => setFieldDraft((current) => ({ ...current, is_required: event.target.checked }))}
                />
                Campo obbligatorio
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" disabled={savingField || !selectedFormId || locked} type="submit">
                {savingField ? "Salvataggio..." : fieldSaved ? "Salvato" : editingFieldId ? "Aggiorna campo" : "Aggiungi campo"}
              </button>
              {editingFieldId ? (
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    deleteFieldArmed === editingFieldId
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "border border-red-200 bg-red-50 text-red-700 hover:border-red-300"
                  }`}
                  onClick={handleDeleteField}
                  disabled={locked}
                >
                  {deleteFieldArmed === editingFieldId ? "Conferma eliminazione" : "Elimina campo"}
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </aside>
      </div>
    </div>
  );

  const designTab = (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="rounded-[1.6rem] border border-neutral-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Contenuto pagina</p>
          <div className="mt-4 space-y-4">
            <label className={labelClass}>
              Titolo
              <input
                className={inputClass}
                disabled={locked}
                value={formDraft.title}
                onChange={(event) => syncFormDraft("title", event.target.value)}
                placeholder="Prenotazione tavolo"
              />
            </label>
            <label className={labelClass}>
              Sottotitolo / descrizione
              <textarea
                className={`${inputClass} min-h-[120px]`}
                disabled={locked}
                value={formDraft.description}
                onChange={(event) => syncFormDraft("description", event.target.value)}
                placeholder="Spiega chiaramente a cosa serve la pagina e cosa succede dopo l'invio."
              />
            </label>
            <label className={labelClass}>
              Messaggio post-invio
              <textarea
                className={`${inputClass} min-h-[90px]`}
                disabled={locked}
                value={formDraft.success_message}
                onChange={(event) => syncFormDraft("success_message", event.target.value)}
                placeholder="Abbiamo ricevuto la tua richiesta."
              />
            </label>
          </div>
        </div>

        <div className="rounded-[1.6rem] border border-neutral-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Look & feel</p>
          <div className="mt-4 grid gap-4">
            <label className={labelClass}>
              Colore accento
              <div className="mt-2 flex items-center gap-3">
                <input
                  className="h-12 w-16 cursor-pointer rounded-2xl border border-neutral-200 bg-white p-1"
                  type="color"
                  disabled={locked}
                  value={formDraft.accent_color || "#0f766e"}
                  onChange={(event) => syncFormDraft("accent_color", event.target.value)}
                />
                <input
                  className={inputClass}
                  disabled={locked}
                  value={formDraft.accent_color}
                  onChange={(event) => syncFormDraft("accent_color", event.target.value)}
                  placeholder="#0f766e"
                />
              </div>
            </label>
            <label className={labelClass}>
              Testo bottone invio
              <input
                className={inputClass}
                disabled={locked}
                value={formDraft.submit_button_text}
                onChange={(event) => syncFormDraft("submit_button_text", event.target.value)}
                placeholder="Invia richiesta"
              />
            </label>
            <label className={labelClass}>
              Cover image URL
              <input
                className={inputClass}
                disabled={locked}
                value={formDraft.cover_image_url}
                onChange={(event) => syncFormDraft("cover_image_url", event.target.value)}
                placeholder="https://..."
              />
            </label>
            <label className="flex items-center gap-3 rounded-[1.2rem] border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-700">
              <input
                type="checkbox"
                disabled={locked}
                checked={formDraft.show_logo}
                onChange={(event) => syncFormDraft("show_logo", event.target.checked)}
              />
              Mostra badge/logo associazione nella hero pubblica
            </label>
          </div>
        </div>

        <div className="rounded-[1.6rem] border border-neutral-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Stile pagina</p>
          <div className="mt-4 grid gap-3">
            {pageStyleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={locked}
                onClick={() => syncFormDraft("page_style", option.value)}
                className={`rounded-[1.3rem] border px-4 py-4 text-left transition ${
                  formDraft.page_style === option.value
                    ? "border-neutral-900 bg-neutral-950 text-white"
                    : "border-neutral-200 bg-white hover:border-neutral-300"
                }`}
              >
                <p className="text-sm font-semibold">{option.label}</p>
                <p className={`mt-1 text-xs leading-5 ${formDraft.page_style === option.value ? "text-white/72" : "text-neutral-500"}`}>
                  {option.hint}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-[1.6rem] border border-neutral-200 bg-neutral-50 px-4 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Live preview</p>
          <p className="mt-2 text-sm text-neutral-600">
            Questa è la stessa resa usata dalla route pubblica `/forms/:orgSlug/:slug`, con i campi attualmente salvati nel form.
          </p>
        </div>
        <FormPublicCanvas form={previewForm} values={previewValues} heroLabel="Anteprima pagina pubblica" />
      </div>
    </div>
  );

  const automationsTab = (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="rounded-[1.6rem] border border-neutral-200 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Workflow post-submit</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className={labelClass}>
              Tipo form
              <select
                className={inputClass}
                disabled={locked}
                value={formDraft.form_type}
                onChange={(event) => syncFormDraft("form_type", event.target.value as AssociationFormType)}
              >
                {formTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-[1.2rem] border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-700">
              <input
                type="checkbox"
                disabled={locked}
                checked={formDraft.notify_admin_on_submit}
                onChange={(event) => syncFormDraft("notify_admin_on_submit", event.target.checked)}
              />
              Notifica admin via email
            </label>
            <label className="flex items-center gap-3 rounded-[1.2rem] border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-700">
              <input
                type="checkbox"
                disabled={locked}
                checked={formDraft.send_user_confirmation}
                onChange={(event) => syncFormDraft("send_user_confirmation", event.target.checked)}
              />
              Invia conferma utente
            </label>
            <label className="flex items-center gap-3 rounded-[1.2rem] border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-700">
              <input
                type="checkbox"
                disabled={locked}
                checked={formDraft.create_internal_request}
                onChange={(event) => syncFormDraft("create_internal_request", event.target.checked)}
              />
              Crea richiesta interna
            </label>
            <label className="flex items-center gap-3 rounded-[1.2rem] border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-700">
              <input
                type="checkbox"
                disabled={locked}
                checked={formDraft.booking_enabled}
                onChange={(event) => syncFormDraft("booking_enabled", event.target.checked)}
              />
              Crea prenotazione da questo form
            </label>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {formTypeOptions.map((option) => (
              <div
                key={option.value}
                className={`rounded-[1.2rem] border px-4 py-4 text-sm ${
                  formDraft.form_type === option.value
                    ? "border-neutral-900 bg-neutral-950 text-white"
                    : "border-neutral-200 bg-neutral-50 text-neutral-600"
                }`}
              >
                <p className="font-semibold">{option.label}</p>
                <p className={`mt-1 text-xs leading-5 ${formDraft.form_type === option.value ? "text-white/72" : "text-neutral-500"}`}>
                  {option.hint}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.6rem] border border-neutral-200 bg-white p-5">
            <label className={labelClass}>
              Email admin notifiche
              <input
                className={inputClass}
                type="email"
                disabled={locked}
                value={formDraft.notification_email}
                onChange={(event) => syncFormDraft("notification_email", event.target.value)}
                placeholder="segreteria@associazione.it"
              />
            </label>
            <label className={`${labelClass} mt-4`}>
              Template notifica admin
              <select
                className={inputClass}
                disabled={locked}
                value={formDraft.admin_notification_template_id ?? ""}
                onChange={(event) =>
                  syncFormDraft(
                    "admin_notification_template_id",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              >
                <option value="">Riepilogo automatico</option>
                {availableTemplates.filter((item) => item.is_active).map((template) => (
                  <option key={`admin-${template.id}`} value={template.id}>
                    {template.is_system ? "ASSONAM" : "Custom"} · {template.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-[1.6rem] border border-neutral-200 bg-white p-5">
            <label className={labelClass}>
              Template conferma utente
              <select
                className={inputClass}
                disabled={locked}
                value={formDraft.user_confirmation_template_id ?? ""}
                onChange={(event) =>
                  syncFormDraft(
                    "user_confirmation_template_id",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              >
                <option value="">Conferma automatica semplice</option>
                {availableTemplates.filter((item) => item.is_active).map((template) => (
                  <option key={`user-${template.id}`} value={template.id}>
                    {template.is_system ? "ASSONAM" : "Custom"} · {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 flex items-center gap-3 rounded-[1.2rem] border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-700">
              <input
                type="checkbox"
                disabled={locked}
                checked={formDraft.allow_multiple_submissions}
                onChange={(event) => syncFormDraft("allow_multiple_submissions", event.target.checked)}
              />
              Consenti invii multipli dallo stesso form
            </label>
          </div>
        </div>

        <div className="rounded-[1.6rem] border border-neutral-200 bg-white p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Prenotazioni & agenda</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-neutral-950">Estendi il form come booking</h3>
              <p className="mt-1 text-sm text-neutral-600">
                Il submit continua a salvare una risposta normale. Se il form è booking-enabled crea anche una prenotazione collegata.
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${formDraft.booking_enabled ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
              {formDraft.booking_enabled ? "Booking attivo" : "Form normale"}
            </span>
          </div>

          {formDraft.booking_enabled ? (
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="flex items-center gap-3 rounded-[1.2rem] border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={formDraft.booking_requires_manual_confirmation}
                    onChange={(event) => syncFormDraft("booking_requires_manual_confirmation", event.target.checked)}
                  />
                  Richiede conferma manuale prima di segnare la prenotazione come confermata
                </label>
                <label className="flex items-center gap-3 rounded-[1.2rem] border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={formDraft.booking_notification_enabled}
                    onChange={(event) => syncFormDraft("booking_notification_enabled", event.target.checked)}
                  />
                  Invia notifiche email legate allo stato prenotazione
                </label>
              </div>

              <label className={labelClass}>
                Messaggio finale dedicato alle prenotazioni
                <textarea
                  className={`${inputClass} min-h-[88px]`}
                  disabled={locked}
                  value={formDraft.booking_success_message_override}
                  onChange={(event) => syncFormDraft("booking_success_message_override", event.target.value)}
                  placeholder="Prenotazione ricevuta. Ti confermeremo data e tavolo al più presto."
                />
              </label>

              <div className="rounded-[1.3rem] border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-sm font-semibold text-neutral-900">Mappatura campi booking</p>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Seleziona quali campi del form alimentano nome, email, data, orario e note della prenotazione.
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {bookingMappingTargets.map((target) => (
                    <label key={target.key} className={labelClass}>
                      {target.label}
                      <select
                        className={inputClass}
                        disabled={locked || bookingMappingFieldOptions.length === 0}
                        value={formDraft.booking_field_mapping[target.key] || ""}
                        onChange={(event) => syncBookingFieldMapping(target.key, event.target.value)}
                      >
                        <option value="">Non collegato</option>
                        {bookingMappingFieldOptions.map((option) => (
                          <option key={`${target.key}-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-xs leading-5 text-neutral-500">{target.hint}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-[1.3rem] border border-dashed border-neutral-200 bg-neutral-50 px-4 py-5 text-sm text-neutral-600">
              Lascia disattivato se vuoi un form generico. Attivalo solo quando vuoi vedere ogni submit anche nella nuova agenda Prenotazioni.
            </div>
          )}
        </div>
      </div>

      <aside className="rounded-[1.6rem] border border-neutral-200 bg-neutral-50 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Scenario</p>
        <div className="mt-4 space-y-3 text-sm text-neutral-600">
          <div className="rounded-[1.2rem] border border-neutral-200 bg-white px-4 py-4">
            <p className="font-semibold text-neutral-900">Destinazione risposte</p>
            <p className="mt-1">Ogni invio viene sempre salvato nello storico interno del sito.</p>
            <p className="mt-2 text-xs text-neutral-500">
              {responseDestinationEmail
                ? `Email segreteria prevista: ${responseDestinationEmail}`
                : "Nessuna email segreteria configurata: le risposte restano comunque visibili nel sito."}
            </p>
          </div>
          <div className="rounded-[1.2rem] border border-neutral-200 bg-white px-4 py-4">
            <p className="font-semibold text-neutral-900">Admin</p>
            <p className="mt-1">
              {formDraft.notify_admin_on_submit
                ? `Riceve una notifica${formDraft.admin_notification_template_id ? " con template dedicato" : " con riepilogo automatico"}.`
                : "Nessuna email admin automatica."}
            </p>
          </div>
          <div className="rounded-[1.2rem] border border-neutral-200 bg-white px-4 py-4">
            <p className="font-semibold text-neutral-900">Utente</p>
            <p className="mt-1">
              {formDraft.send_user_confirmation
                ? `Riceve una conferma${formDraft.user_confirmation_template_id ? " personalizzata" : " semplice"}.`
                : "Nessuna conferma automatica."}
            </p>
          </div>
          <div className="rounded-[1.2rem] border border-neutral-200 bg-white px-4 py-4">
            <p className="font-semibold text-neutral-900">Processo interno</p>
            <p className="mt-1">
              {formDraft.create_internal_request
                ? "Viene anche creata una richiesta interna per l'org admin."
                : "Nessuna richiesta interna aggiuntiva."}
            </p>
          </div>
          <div className="rounded-[1.2rem] border border-neutral-200 bg-white px-4 py-4">
            <p className="font-semibold text-neutral-900">Prenotazione</p>
            <p className="mt-1">
              {formDraft.booking_enabled
                ? formDraft.booking_requires_manual_confirmation
                  ? "Ogni invio crea una prenotazione in stato pending."
                  : "Ogni invio crea subito una prenotazione confermata."
                : "Il form non crea prenotazioni: salva solo la submission."}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );

  const responsesTab = (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Risposte</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-neutral-950">Invii raccolti</h3>
            <p className="mt-1 text-sm text-neutral-600">Consulta il dettaglio e scarica il CSV in uno spazio separato dal builder.</p>
          </div>
          {selectedFormId ? (
            <a className="btn-secondary" href={buildOrgAdminFormSubmissionsExportUrl(selectedFormId)}>
              Export CSV
            </a>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-[1.3rem] border border-neutral-200 bg-white px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Totale invii</p>
            <p className="mt-2 text-2xl font-semibold text-neutral-950">{submissions.length}</p>
          </div>
          <div className="rounded-[1.3rem] border border-neutral-200 bg-white px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Con booking</p>
            <p className="mt-2 text-2xl font-semibold text-neutral-950">{submissions.filter((item) => item.booking).length}</p>
          </div>
          <div className="rounded-[1.3rem] border border-neutral-200 bg-white px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Uso consigliato</p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">Apri una riga per leggere il payload completo senza perdere il contesto del form.</p>
          </div>
          <div className="rounded-[1.3rem] border border-neutral-200 bg-white px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Destinazione</p>
            <p className="mt-2 text-sm font-semibold text-neutral-950">
              {responseDestinationEmail || "Solo backoffice"}
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Ogni invio viene salvato qui; se configurata, parte anche la notifica verso la segreteria.
            </p>
          </div>
        </div>

        {!selectedFormId ? (
          <div className="rounded-[1.6rem] border border-dashed border-neutral-200 bg-neutral-50 px-5 py-10 text-center text-sm text-neutral-500">
            Le risposte appariranno qui dopo il primo invio pubblico.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[1.6rem] border border-neutral-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Data</th>
                    <th className="px-4 py-3 font-semibold">Stato</th>
                    <th className="px-4 py-3 font-semibold">Prenotazione</th>
                    <th className="px-4 py-3 font-semibold">Identità</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {submissionsLoading ? (
                    <tr>
                      <td className="px-4 py-4 text-neutral-500" colSpan={4}>
                        Caricamento risposte...
                      </td>
                    </tr>
                  ) : submissions.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-neutral-500" colSpan={4}>
                        Nessuna risposta ricevuta.
                      </td>
                    </tr>
                  ) : (
                    submissions.map((submission) => (
                      <tr
                        key={submission.id}
                        className={`cursor-pointer transition hover:bg-neutral-50 ${
                          selectedSubmission?.id === submission.id ? "bg-neutral-950 text-white" : ""
                        }`}
                        onClick={() => {
                          fetchOrgAdminFormSubmission(selectedFormId, submission.id)
                            .then((response) => setSelectedSubmission(response.submission))
                            .catch(() => setSelectedSubmission(submission));
                        }}
                      >
                        <td className="px-4 py-3">{formatDateTime(submission.submitted_at)}</td>
                        <td className="px-4 py-3">{submission.status}</td>
                        <td className="px-4 py-3">
                          {submission.booking ? (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              {submission.booking.status}
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-400">Nessuna</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {submission.submitted_by?.name || submission.submitted_by?.email || `#${submission.id}`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <aside className="rounded-[1.6rem] border border-neutral-200 bg-neutral-50 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Dettaglio risposta</p>
        {selectedSubmission ? (
          <div className="mt-4 space-y-3">
            <div className="text-xs text-neutral-500">Ricevuta il {formatDateTime(selectedSubmission.submitted_at)}</div>
            <div className="rounded-[1.2rem] border border-white bg-white px-3 py-3 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Dove arriva</div>
              <div className="mt-2 text-sm text-neutral-800">
                {responseDestinationEmail
                  ? `Storico sito + notifica email a ${responseDestinationEmail}`
                  : "Storico sito visibile all'org admin. Nessuna mail segreteria configurata."}
              </div>
            </div>
            <div className="rounded-[1.2rem] border border-white bg-white px-3 py-3 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Prenotazione collegata</div>
              <div className="mt-2 text-sm text-neutral-800">
                {selectedSubmission.booking
                  ? `#${selectedSubmission.booking.id} - ${selectedSubmission.booking.status} - ${selectedSubmission.booking.booking_date || "data da definire"} ${selectedSubmission.booking.booking_time || ""}`.trim()
                  : "Nessuna prenotazione collegata a questa risposta."}
              </div>
            </div>
            {selectedSubmissionEntries.map((entry) => (
              <div key={entry.key} className="rounded-[1.2rem] border border-white bg-white px-3 py-3 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{entry.label}</div>
                <div className="mt-1 text-[11px] text-neutral-400">{entry.key}</div>
                <div className="mt-2 text-sm text-neutral-800">{stringifySubmissionValue(entry.value)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-neutral-500">Seleziona una risposta dalla tabella per vedere il payload completo.</p>
        )}
      </aside>
    </div>
  );

  const shareTab = (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-[1.9rem] border border-black/10 bg-[linear-gradient(135deg,#111827,#1f2937_58%,#4b3520)] p-5 text-white shadow-[0_30px_100px_rgba(15,23,42,0.2)]">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/55">Condivisione</p>
          <h3 className="mt-3 font-serif text-3xl tracking-tight">Il tuo link pubblico è qui.</h3>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-white/72">
            Quando il form è online puoi copiarlo, aprirlo e usarlo su sito, email, social o QR. La route finale resta sempre organizzata come pagina reale.
          </p>
          <div className="mt-5 rounded-[1.5rem] border border-white/12 bg-white/8 px-4 py-5">
            <p className="text-xs uppercase tracking-[0.18em] text-white/55">URL da condividere</p>
            <p className="mt-3 break-all font-mono text-sm leading-7 text-white">
              {selectedFormUrl || publicUrl || "Salva il form per generare il link pubblico"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${formDraft.is_active ? "bg-emerald-400/18 text-emerald-100" : "bg-white/10 text-white/70"}`}>
                {formDraft.is_active ? "Pagina online" : "Bozza offline"}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
                {formDraft.visibility === "members_only" ? "Solo soci" : "Pubblica"}
              </span>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="btn-secondary" type="button" onClick={() => void copyPublicLink(selectedFormUrl || publicUrl)} disabled={!selectedFormUrl && !publicUrl}>
              Copia link
            </button>
            <button className="btn-primary" type="button" onClick={() => openPublicLink(selectedFormUrl || publicUrl)} disabled={(!selectedFormUrl && !publicUrl) || !formDraft.is_active}>
              Apri pagina pubblica
            </button>
          </div>
          <p className="mt-4 text-xs text-white/55">
            Struttura consigliata: <span className="font-semibold text-white/80">/forms/{orgSlug || "{org-slug}"}/{formDraft.public_slug || "{nome-form}"}</span>
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.6rem] border border-neutral-200 bg-white p-5">
            <label className={labelClass}>
              Slug pubblico
              <input
                className={inputClass}
                disabled={locked}
                value={formDraft.public_slug}
                onChange={(event) => syncFormDraft("public_slug", derivePublicSlug(event.target.value))}
                placeholder="prenotazione-tavolo"
              />
            </label>
            <div className="mt-4 grid gap-3">
              <label className="flex items-center gap-3 rounded-[1.2rem] border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={formDraft.is_active}
                  onChange={(event) => syncFormDraft("is_active", event.target.checked)}
                />
                Pagina pubblica attiva
              </label>
              <label className={labelClass}>
                Visibilità
                <select
                  className={inputClass}
                  disabled={locked}
                  value={formDraft.visibility}
                  onChange={(event) => syncFormDraft("visibility", event.target.value as AssociationFormVisibility)}
                >
                  <option value="public">Pubblico</option>
                  <option value="members_only">Solo soci</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-neutral-200 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Stato attuale</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-[1.2rem] border border-neutral-200 bg-neutral-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Pubblicazione</p>
                <p className="mt-1 text-lg font-semibold text-neutral-950">{formDraft.is_active ? "Online" : "Bozza / offline"}</p>
              </div>
              <div className="rounded-[1.2rem] border border-neutral-200 bg-neutral-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Accesso</p>
                <p className="mt-1 text-lg font-semibold text-neutral-950">{formDraft.visibility === "members_only" ? "Solo soci" : "Pubblico"}</p>
              </div>
              <div className="rounded-[1.2rem] border border-neutral-200 bg-neutral-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Condivisione</p>
                <p className="mt-1 text-sm text-neutral-700">
                  {formDraft.is_active
                    ? "Il link può essere condiviso subito via email, sito o social."
                    : "Prima di condividerlo, salva e attiva il form."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="rounded-[1.6rem] border border-neutral-200 bg-neutral-50 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Checklist</p>
        <div className="mt-4 space-y-3 text-sm text-neutral-600">
          <div className="rounded-[1.2rem] border border-neutral-200 bg-white px-4 py-4">
            <p className="font-semibold text-neutral-900">1. Design</p>
            <p className="mt-1">Titolo, descrizione, hero e bottone sono pronti?</p>
          </div>
          <div className="rounded-[1.2rem] border border-neutral-200 bg-white px-4 py-4">
            <p className="font-semibold text-neutral-900">2. Builder</p>
            <p className="mt-1">Hai aggiunto e ordinato i campi che vuoi far compilare?</p>
          </div>
          <div className="rounded-[1.2rem] border border-neutral-200 bg-white px-4 py-4">
            <p className="font-semibold text-neutral-900">3. Condivisione</p>
            <p className="mt-1">Quando il form è attivo, copia il link e aprilo per un controllo finale.</p>
          </div>
        </div>
      </aside>
    </div>
  );

  return (
    <div className={embedded ? "" : "container-shell py-8 md:py-10"}>
      <div className={`${embedded ? "space-y-6" : "mx-auto max-w-7xl space-y-6"}`}>
        <section className="relative overflow-hidden rounded-[2.2rem] border border-black/10 bg-[linear-gradient(135deg,#0b1320,#141f34_55%,#1e3a36)] px-6 py-7 text-white shadow-[0_40px_140px_rgba(2,6,23,0.35)] md:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(15,118,110,0.44),transparent_28%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-white/55">
                {embedded ? "Forms & automations" : "Form Studio"}
              </p>
              <h1 className="mt-3 font-serif text-[clamp(2.1rem,4vw,4rem)] leading-[0.9] tracking-tight">
                Costruisci una vera pagina pubblica, non solo un modulo.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/72 md:text-base">
                Ogni form viene trattato come una mini landing page dell'associazione: builder visuale, design, automazioni, link pubblico e risposte in aree separate.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/50">Form</p>
                <p className="mt-2 text-3xl font-bold">{forms.length}</p>
              </div>
              <div className="rounded-[1.4rem] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/50">Attivi</p>
                <p className="mt-2 text-3xl font-bold">{activeFormsCount}</p>
              </div>
              <div className="rounded-[1.4rem] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/50">Risposte</p>
                <p className="mt-2 text-3xl font-bold">{totalResponses}</p>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}
        {locked ? (
          <div className="rounded-[1.9rem] border border-amber-200 bg-amber-50 px-5 py-5 text-sm text-amber-900 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-700">Workflow bloccato</p>
            <p className="mt-2">{lockedMessage}</p>
          </div>
        ) : null}

        <section className={`${studioCardClass} overflow-hidden`}>
          <div className="border-b border-neutral-200/80 px-5 py-5 md:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-neutral-500">Forms library</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">Le tue pagine modulo</h2>
                <p className="mt-2 text-sm text-neutral-600">
                  Seleziona una pagina esistente oppure crea un nuovo form con link pubblico dedicato.
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                  Ogni card rappresenta una vera pagina pubblica dell'associazione.
                </p>
              </div>
              <button className="btn-primary" type="button" onClick={handleCreateNewForm} disabled={locked}>
                {locked ? "Modulo richiesto" : "Nuovo form"}
              </button>
            </div>
          </div>

          <div className="px-5 py-5 md:px-6">
            {loading || adminLoading ? (
              <div className="grid gap-4 lg:grid-cols-3">
                <Skeleton className="h-44 w-full rounded-[1.5rem]" />
                <Skeleton className="h-44 w-full rounded-[1.5rem]" />
                <Skeleton className="h-44 w-full rounded-[1.5rem]" />
              </div>
            ) : forms.length === 0 ? (
              <div className="rounded-[1.7rem] border border-dashed border-neutral-200 bg-neutral-50 px-5 py-10 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-neutral-400">Empty state</p>
                <h3 className="mt-3 font-serif text-3xl tracking-tight text-neutral-950">Ancora nessuna pagina form</h3>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-neutral-600">
                  Parti da un form per richieste informazioni, iscrizioni eventi o prenotazioni. Ogni form avrà il suo link pubblico pronto da condividere.
                </p>
                <button className="btn-primary mt-6" type="button" onClick={handleCreateNewForm} disabled={locked}>
                  Crea il primo form
                </button>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {forms.map((form) => {
                  const isSelected = selectedFormId === form.id;
                  const formPath = form.public_path || (orgSlug ? `/forms/${orgSlug}/${form.public_slug}` : `/forms/${form.public_slug}`);
                  const formLink = `${window.location.origin}${formPath}`;
                  return (
                    <div
                      key={form.id}
                      onClick={() => {
                        setSelectedFormId(form.id);
                        setSelectedForm(form);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedFormId(form.id);
                          setSelectedForm(form);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={`group rounded-[1.6rem] border p-5 text-left transition ${
                        isSelected
                          ? "border-neutral-900 bg-neutral-950 text-white shadow-[0_28px_100px_rgba(15,23,42,0.26)]"
                          : "border-neutral-200 bg-white hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-[0_18px_60px_rgba(15,23,42,0.08)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                                form.is_active
                                  ? isSelected
                                    ? "bg-white/12 text-white"
                                    : "bg-emerald-100 text-emerald-700"
                                  : isSelected
                                    ? "bg-white/10 text-white/72"
                                    : "bg-neutral-100 text-neutral-600"
                              }`}
                            >
                              {form.is_active ? "Attivo" : "Bozza"}
                            </span>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                                isSelected ? "bg-white/10 text-white/72" : "bg-neutral-100 text-neutral-600"
                              }`}
                            >
                              {form.visibility === "members_only" ? "Solo soci" : "Pubblico"}
                            </span>
                            {form.booking_enabled ? (
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                                  isSelected ? "bg-emerald-400/18 text-emerald-100" : "bg-emerald-100 text-emerald-700"
                                }`}
                              >
                                Prenotazioni
                              </span>
                            ) : null}
                          </div>
                          <h3 className={`mt-4 text-xl font-semibold tracking-tight ${isSelected ? "text-white" : "text-neutral-950"}`}>
                            {form.title}
                          </h3>
                          <p className={`mt-2 text-sm ${isSelected ? "text-white/70" : "text-neutral-500"}`}>/{form.public_slug}</p>
                          <p className={`mt-2 line-clamp-2 text-sm leading-6 ${isSelected ? "text-white/62" : "text-neutral-600"}`}>
                            {form.description || "Pagina pronta per raccolta lead, iscrizioni, richieste o prenotazioni."}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            isSelected ? "bg-white/10 text-white/80" : "bg-neutral-100 text-neutral-600"
                          }`}
                        >
                          {form.submission_count} risposte
                        </span>
                      </div>

                      <div className={`mt-5 grid grid-cols-2 gap-3 rounded-[1.4rem] border px-3 py-3 text-sm ${
                        isSelected ? "border-white/10 bg-white/6 text-white/78" : "border-neutral-100 bg-neutral-50 text-neutral-600"
                      }`}>
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">Campi</p>
                          <p className="mt-1 font-semibold">{form.field_count}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">
                            {form.booking_enabled ? "Prenotazioni" : "Aggiornato"}
                          </p>
                          <p className="mt-1 font-semibold">
                            {form.booking_enabled ? form.booking_count : formatDateTime(form.updated_at)}
                          </p>
                        </div>
                      </div>

                      <div className={`mt-4 rounded-[1.2rem] border px-3 py-3 text-sm ${
                        isSelected ? "border-white/10 bg-white/6 text-white/72" : "border-neutral-100 bg-neutral-50 text-neutral-600"
                      }`}>
                        <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">URL pubblico</p>
                        <p className="mt-2 break-all font-mono text-xs">{formLink}</p>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedFormId(form.id);
                            setSelectedForm(form);
                          }}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                            isSelected ? "border-white/10 text-white/78 hover:bg-white/10" : "border-neutral-200 text-neutral-700 hover:bg-neutral-100"
                          }`}
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                            isSelected ? "border-white/12 text-white/80 hover:bg-white/10" : "border-neutral-200 text-neutral-700 hover:bg-neutral-100"
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openPublicLink(formLink);
                          }}
                          disabled={!form.is_active}
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                            isSelected ? "border-white/12 text-white/80 hover:bg-white/10" : "border-neutral-200 text-neutral-700 hover:bg-neutral-100"
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyPublicLink(formLink);
                          }}
                        >
                          Copia link
                        </button>
                        <button
                          type="button"
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                            isSelected ? "border-white/12 text-white/80 hover:bg-white/10" : "border-neutral-200 text-neutral-700 hover:bg-neutral-100"
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDuplicateForm(form);
                          }}
                          disabled={locked || duplicating}
                        >
                          Duplica
                        </button>
                        <button
                          type="button"
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                            isSelected ? "border-white/12 text-white/80 hover:bg-white/10" : "border-neutral-200 text-neutral-700 hover:bg-neutral-100"
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openPublicLink(formLink);
                          }}
                          disabled={!form.is_active}
                        >
                          Apri
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className={`${studioCardClass} overflow-hidden`}>
          <div className="border-b border-neutral-200/80 px-5 py-5 md:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-neutral-500">Form Studio</p>
                <h2 className="mt-2 font-serif text-3xl tracking-tight text-neutral-950">
                  {selectedFormId ? formDraft.title || selectedForm?.title || "Configura form" : "Nuova pagina form"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-neutral-600">
                  Ogni tab separa un compito preciso: costruzione campi, aspetto della pagina, automazioni, risposte e condivisione pubblica.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {selectedForm ? (
                  <>
                    <button className="btn-secondary" type="button" onClick={() => void handleDuplicateForm(selectedForm)} disabled={duplicating || locked}>
                      {duplicating ? "Duplicazione..." : "Duplica"}
                    </button>
                    <button className="btn-secondary" type="button" onClick={handleToggleActive} disabled={locked}>
                      {selectedForm.is_active ? "Disattiva" : "Attiva"}
                    </button>
                    <button
                      className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold transition ${
                        deleteArmed
                          ? "bg-red-600 text-white hover:bg-red-700"
                          : "border border-red-200 bg-red-50 text-red-700 hover:border-red-300"
                      }`}
                      type="button"
                      onClick={handleDeleteForm}
                      disabled={locked}
                      aria-label={deleteArmed ? "Conferma eliminazione form" : "Elimina form"}
                      title={deleteArmed ? "Conferma eliminazione" : "Elimina form"}
                    >
                      {deleteArmed ? "!" : "x"}
                    </button>
                  </>
                ) : null}
                <button className="btn-primary" type="button" onClick={() => void handleSaveForm()} disabled={savingForm || locked}>
                  {locked
                    ? "Modulo richiesto"
                    : savingForm
                      ? "Salvataggio..."
                      : formSaved
                        ? "Salvato"
                        : selectedFormId
                          ? "Salva il form"
                          : "Crea form"}
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 xl:grid-cols-[minmax(0,1.8fr)_repeat(3,minmax(0,1fr))]">
              <div className="rounded-[1.7rem] border border-black/10 bg-[linear-gradient(135deg,#111827,#1f2937_55%,#3f2d16)] px-5 py-5 text-white shadow-[0_24px_90px_rgba(15,23,42,0.22)]">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/55">Link pubblico</p>
                <p className="mt-3 max-w-3xl break-all font-mono text-sm leading-7 text-white/90">
                  {selectedFormUrl || publicUrl || "Salva il form per generare l'URL condivisibile"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${formDraft.is_active ? "bg-emerald-400/18 text-emerald-100" : "bg-white/10 text-white/72"}`}>
                    {formDraft.is_active ? "Online" : "Bozza"}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/72">
                    {formDraft.visibility === "members_only" ? "Solo soci" : "Pubblico"}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/72">
                    {sortedFields.length} campi
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:-translate-y-0.5"
                    type="button"
                    disabled={!selectedFormUrl && !publicUrl}
                    onClick={() => void copyPublicLink(selectedFormUrl || publicUrl)}
                  >
                    Copia link
                  </button>
                  <button
                    className="inline-flex rounded-full border border-white/16 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    disabled={!formDraft.is_active || (!selectedFormUrl && !publicUrl)}
                    onClick={() => openPublicLink(selectedFormUrl || publicUrl)}
                  >
                    Apri pagina pubblica
                  </button>
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-neutral-200 bg-neutral-50 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Builder</p>
                <p className="mt-2 text-lg font-semibold text-neutral-950">{sortedFields.length} blocchi</p>
                <p className="mt-2 text-sm text-neutral-600">Aggiungi, ordina e seleziona i campi come se stessi componendo una piccola landing page.</p>
              </div>

              <div className="rounded-[1.4rem] border border-neutral-200 bg-neutral-50 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Automazioni</p>
                <p className="mt-2 text-lg font-semibold text-neutral-950">
                  {formDraft.booking_enabled ? "Booking attivo" : "Follow-up base"}
                </p>
                <p className="mt-2 text-sm text-neutral-600">Notifiche, conferme utente, template e azioni post-submit vivono in un flusso dedicato.</p>
              </div>

              <div className="rounded-[1.4rem] border border-neutral-200 bg-neutral-50 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Risposte</p>
                <p className="mt-2 text-lg font-semibold text-neutral-950">{selectedForm?.submission_count || 0} invii</p>
                <p className="mt-2 text-sm text-neutral-600">Lo storico è separato dal builder, così costruzione e consultazione non si confondono.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-2 md:grid-cols-5">
              {editorTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-[1.2rem] border px-4 py-3 text-left transition ${
                    activeTab === tab.key
                      ? "border-neutral-950 bg-neutral-950 text-white shadow-[0_14px_50px_rgba(15,23,42,0.14)]"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-900"
                  }`}
                >
                  <p className="text-sm font-semibold">{tab.label}</p>
                  <p className={`mt-1 text-xs ${activeTab === tab.key ? "text-white/70" : "text-neutral-500"}`}>{tab.hint}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="px-5 py-5 md:px-6">
            {activeTab === "builder" ? builderTab : null}
            {activeTab === "design" ? designTab : null}
            {activeTab === "automations" ? automationsTab : null}
            {activeTab === "responses" ? responsesTab : null}
            {activeTab === "share" ? shareTab : null}
          </div>
        </section>
      </div>
    </div>
  );
}

const OrgAdminForms = () => (
  <div className="container-shell py-8 md:py-10">
    <div className="mx-auto max-w-7xl">
      <section className="rounded-[1.85rem] border border-neutral-200 bg-white/92 p-5 shadow-sm backdrop-blur md:p-8">
        <OrgAdminFormsWorkspace />
      </section>
    </div>
  </div>
);

export default OrgAdminForms;
