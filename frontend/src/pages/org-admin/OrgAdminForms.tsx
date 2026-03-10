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
  { key: "builder", label: "Campi", hint: "Libreria e canvas" },
  { key: "design", label: "Aspetto", hint: "Testi e colori" },
  { key: "automations", label: "Impostazioni", hint: "Notifiche e booking" },
  { key: "responses", label: "Risposte", hint: "Invii ricevuti" },
  { key: "share", label: "Condividi", hint: "Link e accesso" },
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
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("builder");

  const [fieldDraft, setFieldDraft] = useState(emptyFieldDraft(null));
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [fieldKeyManual, setFieldKeyManual] = useState(false);
  const [savingField, setSavingField] = useState(false);
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

  function handleCreateNewForm() {
    setSelectedFormId(null);
    setSelectedForm(null);
    setSubmissions([]);
    setSelectedSubmission(null);
    setDeleteArmed(false);
    setActiveTab("design");
    setFormDraft(createSeededFormDraft());
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
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[240px_1fr_320px]">
        {/* Left: Library */}
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-neutral-900 mb-3">Aggiungi campo</h3>
            <div className="grid gap-2">
              {fieldTypeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={locked}
                  onClick={() => startNewField(option.value)}
                  className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left transition hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-neutral-100 text-xs font-medium text-neutral-600">
                    {option.icon}
                  </span>
                  <span className="text-sm text-neutral-700">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center: Canvas */}
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-neutral-900">Canvas form</h3>
              <span className="text-xs text-neutral-500">{sortedFields.length} campi</span>
            </div>
            
            {!selectedFormId ? (
              <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 py-8 text-center text-sm text-neutral-500">
                Salva il form per iniziare.
              </div>
            ) : sortedFields.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 py-8 text-center">
                <p className="text-sm font-medium text-neutral-900">Nessun campo</p>
                <p className="mt-1 text-xs text-neutral-500">Aggiungi il primo campo dalla libreria.</p>
              </div>
            ) : (
              <div className="grid gap-2">
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
                      className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition ${
                        isSelected
                          ? "border-brand bg-brand/5 ring-1 ring-brand/20"
                          : "border-neutral-200 bg-white hover:border-neutral-300"
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-neutral-100 text-xs font-medium text-neutral-600">
                          {meta?.icon || "Aa"}
                        </span>
                        <div className="truncate">
                          <p className="truncate text-sm font-medium text-neutral-900">
                            {field.label} {field.is_required && <span className="text-red-500">*</span>}
                          </p>
                          <p className="truncate text-xs text-neutral-500">{meta?.label}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 cursor-grab px-1 text-neutral-400 hover:text-neutral-600">
                        ⋮⋮
                      </div>
                    </button>
                  );
                })}
                <div
                  className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 py-3 text-center text-xs text-neutral-500"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void handleFieldDrop(null);
                  }}
                >
                  {reorderingFields ? "Riordino in corso..." : "Trascina qui per spostare in fondo"}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Field Settings */}
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            {!editingFieldId && !fieldDraft.field_key && sortedFields.length > 0 ? (
              <div className="py-8 text-center text-sm text-neutral-500">
                Seleziona un campo dal canvas per modificarlo.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-neutral-900">
                    {editingFieldId ? "Impostazioni campo" : "Nuovo campo"}
                  </h3>
                  {editingFieldId && (
                    <button
                      type="button"
                      className="text-xs text-brand hover:underline"
                      onClick={() => startNewField(fieldDraft.field_type)}
                    >
                      Nuovo
                    </button>
                  )}
                </div>

                <form className="space-y-4" onSubmit={(event) => void handleSaveField(event)}>
                  <label className={labelClass}>
                    Etichetta
                    <input
                      className={inputClass}
                      disabled={locked}
                      value={fieldDraft.label}
                      onChange={(event) => handleFieldLabelChange(event.target.value)}
                    />
                  </label>

                  <label className={labelClass}>
                    Tipo
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
                    Placeholder (opzionale)
                    <input
                      className={inputClass}
                      disabled={locked}
                      value={fieldDraft.placeholder}
                      onChange={(event) => setFieldDraft((current) => ({ ...current, placeholder: event.target.value }))}
                    />
                  </label>

                  {["select", "radio", "checkbox"].includes(fieldDraft.field_type) && (
                    <label className={labelClass}>
                      Opzioni (separate da virgola)
                      <input
                        className={inputClass}
                        disabled={locked}
                        value={fieldDraft.options_text}
                        onChange={(event) => setFieldDraft((current) => ({ ...current, options_text: event.target.value }))}
                      />
                    </label>
                  )}

                  <label className="flex items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={fieldDraft.is_required}
                      onChange={(event) => setFieldDraft((current) => ({ ...current, is_required: event.target.checked }))}
                      className="rounded border-neutral-300"
                    />
                    Campo obbligatorio
                  </label>

                  <div className="pt-2 flex flex-wrap gap-2">
                    <button className="btn-primary !py-2 !px-3 !text-xs flex-1" disabled={savingField || !selectedFormId || locked} type="submit">
                      {savingField ? "..." : editingFieldId ? "Aggiorna" : "Aggiungi"}
                    </button>
                    {editingFieldId && (
                      <button
                        type="button"
                        className="btn-ghost !py-2 !px-3 !text-xs !text-red-600 hover:!bg-red-50"
                        onClick={handleDeleteField}
                        disabled={locked}
                      >
                        {deleteFieldArmed === editingFieldId ? "Conferma" : "Elimina"}
                      </button>
                    )}
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Preview Section */}
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-neutral-900 mb-4 px-2">Preview pubblica</h3>
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
          <FormPublicCanvas form={previewForm} values={previewValues} heroLabel="Anteprima live" />
        </div>
      </div>
    </div>
  );

  const designTab = (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Contenuto pagina</h3>
          <div className="space-y-4">
            <label className={labelClass}>
              Titolo
              <input
                className={inputClass}
                disabled={locked}
                value={formDraft.title}
                onChange={(event) => syncFormDraft("title", event.target.value)}
                placeholder="Titolo del form"
              />
            </label>
            <label className={labelClass}>
              Sottotitolo / descrizione
              <textarea
                className={`${inputClass} min-h-[100px]`}
                disabled={locked}
                value={formDraft.description}
                onChange={(event) => syncFormDraft("description", event.target.value)}
                placeholder="Breve descrizione o istruzioni..."
              />
            </label>
            <label className={labelClass}>
              Messaggio post-invio
              <textarea
                className={`${inputClass} min-h-[80px]`}
                disabled={locked}
                value={formDraft.success_message}
                onChange={(event) => syncFormDraft("success_message", event.target.value)}
                placeholder="Messaggio mostrato dopo l'invio"
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Look & feel</h3>
          <div className="space-y-4">
            <label className={labelClass}>
              Colore accento
              <div className="mt-2 flex items-center gap-3">
                <input
                  className="h-10 w-16 cursor-pointer rounded border border-neutral-200 bg-white p-1"
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
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                disabled={locked}
                checked={formDraft.show_logo}
                onChange={(event) => syncFormDraft("show_logo", event.target.checked)}
                className="rounded border-neutral-300"
              />
              Mostra logo associazione
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Layout</h3>
          <div className="grid gap-3">
            {pageStyleOptions.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  formDraft.page_style === option.value
                    ? "border-brand bg-brand/5 ring-1 ring-brand/20"
                    : "border-neutral-200 hover:bg-neutral-50"
                }`}
              >
                <input
                  type="radio"
                  name="page_style"
                  value={option.value}
                  checked={formDraft.page_style === option.value}
                  onChange={() => syncFormDraft("page_style", option.value)}
                  className="mt-1 border-neutral-300 text-brand focus:ring-brand"
                  disabled={locked}
                />
                <div>
                  <div className="text-sm font-medium text-neutral-900">{option.label}</div>
                  <div className="text-xs text-neutral-500">{option.hint}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
        
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200">
            <h3 className="text-sm font-semibold text-neutral-900">Anteprima</h3>
          </div>
          <div className="max-h-[500px] overflow-y-auto bg-neutral-100 p-4">
            <FormPublicCanvas form={previewForm} values={previewValues} heroLabel="Anteprima" />
          </div>
        </div>
      </div>
    </div>
  );

  const automationsTab = (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Comportamento invio</h3>
          <div className="space-y-4">
            <label className={labelClass}>
              Destinazione email notifiche (segreteria)
              <input
                className={inputClass}
                type="email"
                disabled={locked}
                value={formDraft.notification_email}
                onChange={(event) => syncFormDraft("notification_email", event.target.value)}
              />
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={formDraft.notify_admin_on_submit}
                  onChange={(event) => syncFormDraft("notify_admin_on_submit", event.target.checked)}
                  className="rounded border-neutral-300"
                />
                Invia notifica admin
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={formDraft.send_user_confirmation}
                  onChange={(event) => syncFormDraft("send_user_confirmation", event.target.checked)}
                  className="rounded border-neutral-300"
                />
                Invia conferma utente
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={formDraft.allow_multiple_submissions}
                  onChange={(event) => syncFormDraft("allow_multiple_submissions", event.target.checked)}
                  className="rounded border-neutral-300"
                />
                Consenti invii multipli
              </label>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Template email</h3>
          <div className="space-y-4">
            <label className={labelClass}>
              Template notifica admin
              <select
                className={inputClass}
                disabled={locked}
                value={formDraft.admin_notification_template_id ?? ""}
                onChange={(event) =>
                  syncFormDraft("admin_notification_template_id", event.target.value ? Number(event.target.value) : null)
                }
              >
                <option value="">Riepilogo automatico</option>
                {availableTemplates.filter((item) => item.is_active).map((template) => (
                  <option key={`admin-${template.id}`} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Template conferma utente
              <select
                className={inputClass}
                disabled={locked}
                value={formDraft.user_confirmation_template_id ?? ""}
                onChange={(event) =>
                  syncFormDraft("user_confirmation_template_id", event.target.value ? Number(event.target.value) : null)
                }
              >
                <option value="">Conferma automatica</option>
                {availableTemplates.filter((item) => item.is_active).map((template) => (
                  <option key={`user-${template.id}`} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-900">Integrazione Prenotazioni</h3>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                disabled={locked}
                checked={formDraft.booking_enabled}
                onChange={(event) => syncFormDraft("booking_enabled", event.target.checked)}
                className="rounded border-neutral-300"
              />
              Abilita
            </label>
          </div>

          {formDraft.booking_enabled && (
            <div className="space-y-4 pt-4 border-t border-neutral-100">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={formDraft.booking_requires_manual_confirmation}
                    onChange={(event) => syncFormDraft("booking_requires_manual_confirmation", event.target.checked)}
                    className="rounded border-neutral-300"
                  />
                  Richiede conferma manuale
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={formDraft.booking_notification_enabled}
                    onChange={(event) => syncFormDraft("booking_notification_enabled", event.target.checked)}
                    className="rounded border-neutral-300"
                  />
                  Invia email di stato
                </label>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-neutral-500 uppercase">Mappatura campi</h4>
                {bookingMappingTargets.map((target) => (
                  <div key={target.key} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-sm text-neutral-600 sm:w-1/3">{target.label}</span>
                    <select
                      className={`${inputClass} !mt-0 sm:w-2/3`}
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
                  </div>
                ))}
              </div>
            </div>
          )}
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

  const shareTab = (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-neutral-900 mb-4">Link pubblico</h3>
        
        <div className="flex items-center gap-2 mb-4">
          <input
            className={inputClass}
            readOnly
            value={selectedFormUrl || publicUrl || ""}
            placeholder="Salva per generare il link"
          />
          <button
            className="btn-secondary whitespace-nowrap !py-2.5"
            onClick={() => void copyPublicLink(selectedFormUrl || publicUrl)}
            disabled={!selectedFormUrl && !publicUrl}
          >
            Copia
          </button>
        </div>

        <div className="flex flex-wrap gap-4 pt-4 border-t border-neutral-100">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              disabled={locked}
              checked={formDraft.is_active}
              onChange={(event) => syncFormDraft("is_active", event.target.checked)}
              className="rounded border-neutral-300"
            />
            Pagina attiva (online)
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            Visibilità:
            <select
              className={`${inputClass} !mt-0 !w-auto !py-1`}
              disabled={locked}
              value={formDraft.visibility}
              onChange={(event) => syncFormDraft("visibility", event.target.value as AssociationFormVisibility)}
            >
              <option value="public">Tutti</option>
              <option value="members_only">Solo soci</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-neutral-900 mb-4">Personalizza URL</h3>
        <label className={labelClass}>
          Slug (parte finale del link)
          <input
            className={inputClass}
            disabled={locked}
            value={formDraft.public_slug}
            onChange={(event) => syncFormDraft("public_slug", derivePublicSlug(event.target.value))}
            placeholder="es: iscrizione-corso"
          />
        </label>
      </div>
    </div>
  );

  return (
    <div className={embedded ? "" : "container-shell py-6"}>
      <div className={`${embedded ? "space-y-6" : "mx-auto max-w-6xl space-y-6"}`}>
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}
        {locked ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-5 text-sm text-amber-900 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-700">Workflow bloccato</p>
            <p className="mt-2">{lockedMessage}</p>
          </div>
        ) : null}

        {!selectedFormId && !loading && !adminLoading && forms.length > 0 && (
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
                      setSelectedFormId(form.id);
                      setSelectedForm(form);
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

        {(selectedFormId || forms.length === 0) && (
          <section className={`${studioCardClass} overflow-hidden`}>
            <div className="border-b border-neutral-200/80 px-5 py-4 bg-neutral-50/50">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setSelectedFormId(null)}
                    className="p-2 hover:bg-neutral-200 rounded-lg transition-colors text-neutral-500"
                    title="Torna alla lista"
                  >
                    ←
                  </button>
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-neutral-900">
                      {selectedFormId ? formDraft.title || selectedForm?.title || "Configura form" : "Nuova pagina form"}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${formDraft.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
                        {formDraft.is_active ? 'Online' : 'Bozza'}
                      </span>
                      {selectedFormUrl || publicUrl ? (
                        <a href={selectedFormUrl || publicUrl} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline">
                          Vedi pagina ↗
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedForm ? (
                    <>
                      <button className="btn-ghost !px-3 !py-1.5 !text-xs" type="button" onClick={handleToggleActive} disabled={locked}>
                        {selectedForm.is_active ? "Disattiva" : "Attiva"}
                      </button>
                      <button
                        className="btn-ghost !px-3 !py-1.5 !text-xs !text-red-600 hover:!bg-red-50"
                        type="button"
                        onClick={handleDeleteForm}
                        disabled={locked}
                      >
                        {deleteArmed ? "Conferma elimina" : "Elimina"}
                      </button>
                    </>
                  ) : null}
                  <button className="btn-primary !px-4 !py-1.5" type="button" onClick={() => void handleSaveForm()} disabled={savingForm || locked}>
                    {savingForm ? "Salvataggio..." : "Salva"}
                  </button>
                </div>
              </div>
              <div className="mt-4 flex gap-1 overflow-x-auto no-scrollbar">
                {editorTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                      activeTab === tab.key 
                        ? "border-brand text-brand bg-white" 
                        : "border-transparent text-neutral-500 hover:bg-neutral-100/50 hover:text-neutral-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-5">
              {activeTab === "builder" ? builderTab : null}
              {activeTab === "design" ? designTab : null}
              {activeTab === "automations" ? automationsTab : null}
              {activeTab === "responses" ? responsesTab : null}
              {activeTab === "share" ? shareTab : null}
            </div>
          </section>
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
