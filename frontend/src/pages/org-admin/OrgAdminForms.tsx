import { FormEvent, useEffect, useState } from "react";
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
  type AssociationFormSubmission,
  type AssociationFormVisibility,
} from "../../lib/api";
import { applySeo } from "../../lib/seo";
import Skeleton from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/ToastProvider";
import { useOrgAdmin } from "./OrgAdminLayout";

const inputClass =
  "mt-1 w-full rounded-md border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const labelClass = "block text-sm font-medium text-neutral-700";

const fieldTypeOptions: Array<{ value: AssociationFormFieldType; label: string }> = [
  { value: "short_text", label: "Testo breve" },
  { value: "long_text", label: "Testo lungo" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefono" },
  { value: "number", label: "Numero" },
  { value: "date", label: "Data" },
  { value: "select", label: "Select" },
  { value: "radio", label: "Radio" },
  { value: "checkbox", label: "Checkbox" },
  { value: "consent", label: "Consenso privacy" },
];

function emptyFormDraft() {
  return {
    title: "",
    description: "",
    public_slug: "",
    is_active: false,
    visibility: "public" as AssociationFormVisibility,
    success_message: "Richiesta inviata correttamente.",
    notification_email: "",
    allow_multiple_submissions: true,
  };
}

function emptyFieldDraft(form?: AssociationForm | null) {
  return {
    field_key: "",
    field_type: "short_text" as AssociationFormFieldType,
    label: "",
    placeholder: "",
    help_text: "",
    is_required: false,
    sort_order: form?.fields?.length ?? 0,
    options_text: "",
  };
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

const OrgAdminForms = () => {
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

  const [fieldDraft, setFieldDraft] = useState(emptyFieldDraft(null));
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [savingField, setSavingField] = useState(false);
  const [fieldSaved, setFieldSaved] = useState(false);
  const [deleteFieldArmed, setDeleteFieldArmed] = useState<number | null>(null);

  const [submissions, setSubmissions] = useState<AssociationFormSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<AssociationFormSubmission | null>(null);

  useEffect(() => {
    applySeo({
      title: "Form associazione",
      description: "Builder form pubblico dinamico per l'area org admin ASSONAM.",
      noindex: true,
    });
  }, []);

  useEffect(() => {
    if (adminLoading || !admin) return;
    void loadForms();
  }, [adminLoading, admin]);

  useEffect(() => {
    if (!selectedForm) {
      setFormDraft(emptyFormDraft());
      setFieldDraft(emptyFieldDraft(null));
      setEditingFieldId(null);
      return;
    }
    setFormDraft({
      title: selectedForm.title || "",
      description: selectedForm.description || "",
      public_slug: selectedForm.public_slug || "",
      is_active: Boolean(selectedForm.is_active),
      visibility: selectedForm.visibility,
      success_message: selectedForm.success_message || "",
      notification_email: selectedForm.notification_email || "",
      allow_multiple_submissions: Boolean(selectedForm.allow_multiple_submissions),
    });
    setFieldDraft(emptyFieldDraft(selectedForm));
    setEditingFieldId(null);
    setDeleteArmed(false);
  }, [selectedForm]);

  useEffect(() => {
    if (!selectedFormId) {
      setSubmissions([]);
      setSelectedSubmission(null);
      return;
    }
    void loadSubmissions(selectedFormId);
  }, [selectedFormId]);

  async function loadForms(nextSelectedId?: number | null) {
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
        const detail = await fetchOrgAdminFormSubmission(formId, response.items[0].id).catch(() => ({
          submission: response.items[0],
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

  async function handleSaveForm(event: FormEvent) {
    event.preventDefault();
    setSavingForm(true);
    setFormSaved(false);
    try {
      const payload = {
        ...formDraft,
        description: formDraft.description || null,
        public_slug: formDraft.public_slug || null,
        success_message: formDraft.success_message || null,
        notification_email: formDraft.notification_email || null,
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
        message: `${response.form.title} e pronto.`,
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

  async function handleDuplicateForm() {
    if (!selectedFormId || !selectedForm) return;
    setDuplicating(true);
    try {
      const response = await duplicateOrgAdminForm(selectedFormId, {
        title: `${selectedForm.title} copia`,
      });
      showToast({
        tone: "success",
        title: "Form duplicato",
        message: "La copia e stata creata in stato non attivo.",
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
    try {
      const response = await setOrgAdminFormActive(selectedFormId, !selectedForm.is_active);
      setSelectedForm(response.form);
      setForms((current) => current.map((item) => (item.id === response.form.id ? response.form : item)));
      showToast({
        tone: "success",
        title: response.form.is_active ? "Form attivato" : "Form disattivato",
        message: response.form.is_active ? "Il link pubblico e online." : "Il link pubblico e stato chiuso.",
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
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    try {
      await deleteOrgAdminForm(selectedFormId);
      showToast({
        tone: "success",
        title: "Form eliminato",
        message: "Il form e stato rimosso.",
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

  async function handleSaveField(event: FormEvent) {
    event.preventDefault();
    if (!selectedFormId) return;
    setSavingField(true);
    setFieldSaved(false);
    try {
      const payload = {
        field_key: fieldDraft.field_key || null,
        field_type: fieldDraft.field_type,
        label: fieldDraft.label,
        placeholder: fieldDraft.placeholder || null,
        help_text: fieldDraft.help_text || null,
        is_required: fieldDraft.is_required,
        sort_order: Number(fieldDraft.sort_order || 0),
        options: fieldDraft.options_text || null,
      };
      if (editingFieldId) {
        await updateOrgAdminFormField(selectedFormId, editingFieldId, payload);
      } else {
        await createOrgAdminFormField(selectedFormId, payload);
      }
      const detail = await fetchOrgAdminForm(selectedFormId);
      setSelectedForm(detail.form);
      setForms((current) => current.map((item) => (item.id === detail.form.id ? detail.form : item)));
      setFieldDraft(emptyFieldDraft(detail.form));
      setEditingFieldId(null);
      setDeleteFieldArmed(null);
      setFieldSaved(true);
      showToast({
        tone: "success",
        title: editingFieldId ? "Campo aggiornato" : "Campo aggiunto",
        message: "Il builder e stato aggiornato.",
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
    if (deleteFieldArmed !== editingFieldId) {
      setDeleteFieldArmed(editingFieldId);
      return;
    }
    try {
      await deleteOrgAdminFormField(selectedFormId, editingFieldId);
      const detail = await fetchOrgAdminForm(selectedFormId);
      setSelectedForm(detail.form);
      setForms((current) => current.map((item) => (item.id === detail.form.id ? detail.form : item)));
      setFieldDraft(emptyFieldDraft(detail.form));
      setEditingFieldId(null);
      setDeleteFieldArmed(null);
      showToast({
        tone: "success",
        title: "Campo eliminato",
        message: "Il builder e stato aggiornato.",
      });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Eliminazione non riuscita",
        message: err instanceof Error ? err.message : "Errore eliminazione campo.",
      });
    }
  }

  function handleEditField(field: AssociationFormField) {
    setEditingFieldId(field.id);
    setDeleteFieldArmed(null);
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

  function handleCreateNewForm() {
    setSelectedFormId(null);
    setSelectedForm(null);
    setSubmissions([]);
    setSelectedSubmission(null);
    setDeleteArmed(false);
    setFormDraft(emptyFormDraft());
    setFieldDraft(emptyFieldDraft(null));
    setEditingFieldId(null);
  }

  const publicUrl = selectedForm?.public_slug ? `${window.location.origin}/forms/${selectedForm.public_slug}` : "";

  return (
    <div className="container-shell py-8 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand/70">Modulo Form</p>
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Builder form pubblico</h1>
            <p className="mt-2 max-w-3xl text-sm text-neutral-600">
              Crea moduli dinamici pubblici o riservati soci con una sola route frontend: <code>/forms/:slug</code>.
            </p>
          </div>
          <button className="btn-primary" type="button" onClick={handleCreateNewForm}>
            Nuovo form
          </button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">I tuoi form</h2>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
                {forms.length}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {loading || adminLoading ? (
                <>
                  <Skeleton className="h-24 w-full rounded-2xl" />
                  <Skeleton className="h-24 w-full rounded-2xl" />
                </>
              ) : forms.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-5 text-sm text-neutral-500">
                  Nessun form creato. Inizia da titolo, slug e campi base.
                </div>
              ) : (
                forms.map((form) => (
                  <button
                    key={form.id}
                    type="button"
                    onClick={() => {
                      setSelectedFormId(form.id);
                      setSelectedForm(form);
                    }}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                      selectedFormId === form.id
                        ? "border-brand bg-brand/5 shadow-sm"
                        : "border-neutral-200 bg-white hover:border-neutral-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">{form.title}</p>
                        <p className="mt-1 text-xs text-neutral-500">/{form.public_slug}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                          form.is_active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {form.is_active ? "Attivo" : "Bozza"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-500">
                      <span>{form.field_count} campi</span>
                      <span>{form.submission_count} risposte</span>
                      <span>{form.visibility === "members_only" ? "Solo soci" : "Pubblico"}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">
                    {selectedFormId ? "Configura form" : "Crea nuovo form"}
                  </h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    Gestisci metadati, visibilita, link pubblico e messaggi di conferma.
                  </p>
                </div>
                {selectedForm ? (
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary" type="button" onClick={handleDuplicateForm} disabled={duplicating}>
                      {duplicating ? "Duplicazione..." : "Duplica"}
                    </button>
                    <button className="btn-secondary" type="button" onClick={handleToggleActive}>
                      {selectedForm.is_active ? "Disattiva" : "Attiva"}
                    </button>
                    <button
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        deleteArmed
                          ? "bg-red-600 text-white hover:bg-red-700"
                          : "border border-red-200 bg-red-50 text-red-700 hover:border-red-300"
                      }`}
                      type="button"
                      onClick={handleDeleteForm}
                    >
                      {deleteArmed ? "Conferma eliminazione" : "Elimina"}
                    </button>
                  </div>
                ) : null}
              </div>

              <form className="mt-5 grid gap-4 lg:grid-cols-2" onSubmit={handleSaveForm}>
                <label className={labelClass}>
                  Titolo
                  <input
                    className={inputClass}
                    value={formDraft.title}
                    onChange={(event) => setFormDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Prenotazione tavolo"
                  />
                </label>
                <label className={labelClass}>
                  Slug pubblico
                  <input
                    className={inputClass}
                    value={formDraft.public_slug}
                    onChange={(event) => setFormDraft((current) => ({ ...current, public_slug: event.target.value }))}
                    placeholder="prenotazione-tavolo"
                  />
                </label>
                <label className={`${labelClass} lg:col-span-2`}>
                  Descrizione
                  <textarea
                    className={`${inputClass} min-h-[110px]`}
                    value={formDraft.description}
                    onChange={(event) => setFormDraft((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Spiega in poche righe a cosa serve il form."
                  />
                </label>
                <label className={labelClass}>
                  Visibilita
                  <select
                    className={inputClass}
                    value={formDraft.visibility}
                    onChange={(event) =>
                      setFormDraft((current) => ({ ...current, visibility: event.target.value as AssociationFormVisibility }))
                    }
                  >
                    <option value="public">Pubblico</option>
                    <option value="members_only">Solo soci</option>
                  </select>
                </label>
                <label className={labelClass}>
                  Email notifiche
                  <input
                    className={inputClass}
                    type="email"
                    value={formDraft.notification_email}
                    onChange={(event) =>
                      setFormDraft((current) => ({ ...current, notification_email: event.target.value }))
                    }
                    placeholder="segreteria@associazione.it"
                  />
                </label>
                <label className={`${labelClass} lg:col-span-2`}>
                  Messaggio di successo
                  <textarea
                    className={`${inputClass} min-h-[90px]`}
                    value={formDraft.success_message}
                    onChange={(event) =>
                      setFormDraft((current) => ({ ...current, success_message: event.target.value }))
                    }
                    placeholder="Abbiamo ricevuto la tua richiesta."
                  />
                </label>
                <div className="flex flex-wrap gap-5 lg:col-span-2">
                  <label className="flex items-center gap-3 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={formDraft.is_active}
                      onChange={(event) => setFormDraft((current) => ({ ...current, is_active: event.target.checked }))}
                    />
                    Form attivo
                  </label>
                  <label className="flex items-center gap-3 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={formDraft.allow_multiple_submissions}
                      onChange={(event) =>
                        setFormDraft((current) => ({ ...current, allow_multiple_submissions: event.target.checked }))
                      }
                    />
                    Consenti invii multipli
                  </label>
                </div>
                <div className="lg:col-span-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="text-xs text-neutral-500">
                    Link pubblico:
                    <span className="ml-2 rounded-full bg-neutral-100 px-2 py-1 font-medium text-neutral-700">
                      {publicUrl || "Salva il form per generare il link"}
                    </span>
                  </div>
                  <button className="btn-primary" disabled={savingForm} type="submit">
                    {savingForm ? "Salvataggio..." : formSaved ? "Salvato" : selectedFormId ? "Salva modifiche" : "Crea form"}
                  </button>
                </div>
              </form>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-900">Campi del form</h2>
                    <p className="mt-1 text-sm text-neutral-500">Aggiungi, ordina, modifica o elimina i campi del builder.</p>
                  </div>
                  {selectedForm ? (
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
                      {selectedForm.fields.length} campi
                    </span>
                  ) : null}
                </div>
                {!selectedFormId ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-5 text-sm text-neutral-500">
                    Salva prima il form per iniziare ad aggiungere campi.
                  </div>
                ) : selectedForm?.fields.length ? (
                  <div className="mt-5 grid gap-3">
                    {selectedForm.fields
                      .slice()
                      .sort((left, right) => left.sort_order - right.sort_order)
                      .map((field) => (
                        <button
                          key={field.id}
                          type="button"
                          onClick={() => handleEditField(field)}
                          className={`rounded-2xl border px-4 py-4 text-left transition ${
                            editingFieldId === field.id
                              ? "border-brand bg-brand/5"
                              : "border-neutral-200 bg-white hover:border-neutral-300"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-neutral-900">{field.label}</p>
                              <p className="mt-1 text-xs text-neutral-500">
                                {field.field_type} · key `{field.field_key}` · ordine {field.sort_order}
                              </p>
                            </div>
                            {field.is_required ? (
                              <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                Obbligatorio
                              </span>
                            ) : null}
                          </div>
                          {field.options.length > 0 ? (
                            <p className="mt-3 text-xs text-neutral-500">Opzioni: {field.options.join(", ")}</p>
                          ) : null}
                        </button>
                      ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-5 text-sm text-neutral-500">
                    Nessun campo configurato. Aggiungi il primo campo dal pannello qui a destra.
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-neutral-900">
                    {editingFieldId ? "Modifica campo" : "Nuovo campo"}
                  </h3>
                  {editingFieldId ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-neutral-500 hover:text-neutral-800"
                      onClick={() => {
                        setEditingFieldId(null);
                        setDeleteFieldArmed(null);
                        setFieldDraft(emptyFieldDraft(selectedForm));
                      }}
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
                <form className="mt-4 space-y-4" onSubmit={handleSaveField}>
                  <label className={labelClass}>
                    Etichetta
                    <input
                      className={inputClass}
                      value={fieldDraft.label}
                      onChange={(event) => setFieldDraft((current) => ({ ...current, label: event.target.value }))}
                      placeholder="Nome e cognome"
                    />
                  </label>
                  <label className={labelClass}>
                    Tipo campo
                    <select
                      className={inputClass}
                      value={fieldDraft.field_type}
                      onChange={(event) =>
                        setFieldDraft((current) => ({
                          ...current,
                          field_type: event.target.value as AssociationFormFieldType,
                        }))
                      }
                    >
                      {fieldTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClass}>
                    Chiave tecnica
                    <input
                      className={inputClass}
                      value={fieldDraft.field_key}
                      onChange={(event) => setFieldDraft((current) => ({ ...current, field_key: event.target.value }))}
                      placeholder="nome_socio"
                    />
                  </label>
                  <label className={labelClass}>
                    Placeholder
                    <input
                      className={inputClass}
                      value={fieldDraft.placeholder}
                      onChange={(event) =>
                        setFieldDraft((current) => ({ ...current, placeholder: event.target.value }))
                      }
                      placeholder="Scrivi qui"
                    />
                  </label>
                  <label className={labelClass}>
                    Help text
                    <textarea
                      className={`${inputClass} min-h-[80px]`}
                      value={fieldDraft.help_text}
                      onChange={(event) =>
                        setFieldDraft((current) => ({ ...current, help_text: event.target.value }))
                      }
                      placeholder="Testo di supporto sotto al campo"
                    />
                  </label>
                  {["select", "radio", "checkbox"].includes(fieldDraft.field_type) ? (
                    <label className={labelClass}>
                      Opzioni
                      <input
                        className={inputClass}
                        value={fieldDraft.options_text}
                        onChange={(event) =>
                          setFieldDraft((current) => ({ ...current, options_text: event.target.value }))
                        }
                        placeholder="Mattina, Pomeriggio, Sera"
                      />
                    </label>
                  ) : null}
                  <label className={labelClass}>
                    Ordine
                    <input
                      className={inputClass}
                      type="number"
                      value={fieldDraft.sort_order}
                      onChange={(event) =>
                        setFieldDraft((current) => ({ ...current, sort_order: Number(event.target.value || 0) }))
                      }
                    />
                  </label>
                  <label className="flex items-center gap-3 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={fieldDraft.is_required}
                      onChange={(event) =>
                        setFieldDraft((current) => ({ ...current, is_required: event.target.checked }))
                      }
                    />
                    Campo obbligatorio
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button className="btn-primary" disabled={savingField || !selectedFormId} type="submit">
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
                      >
                        {deleteFieldArmed === editingFieldId ? "Conferma eliminazione" : "Elimina campo"}
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>
            </section>

            <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">Risposte raccolte</h2>
                  <p className="mt-1 text-sm text-neutral-500">Consulta il dettaglio e scarica il CSV senza lasciare la pagina.</p>
                </div>
                {selectedFormId ? (
                  <a className="btn-secondary" href={buildOrgAdminFormSubmissionsExportUrl(selectedFormId)}>
                    Export CSV
                  </a>
                ) : null}
              </div>

              {!selectedFormId ? (
                <div className="mt-5 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-5 text-sm text-neutral-500">
                  Le risposte compariranno qui dopo il primo invio pubblico.
                </div>
              ) : (
                <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="overflow-hidden rounded-2xl border border-neutral-200">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-neutral-200 text-sm">
                        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Data</th>
                            <th className="px-4 py-3 font-semibold">Stato</th>
                            <th className="px-4 py-3 font-semibold">Identita</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 bg-white">
                          {submissionsLoading ? (
                            <tr>
                              <td className="px-4 py-4 text-neutral-500" colSpan={3}>
                                Caricamento risposte...
                              </td>
                            </tr>
                          ) : submissions.length === 0 ? (
                            <tr>
                              <td className="px-4 py-4 text-neutral-500" colSpan={3}>
                                Nessuna risposta ricevuta.
                              </td>
                            </tr>
                          ) : (
                            submissions.map((submission) => (
                              <tr
                                key={submission.id}
                                className={`cursor-pointer transition hover:bg-neutral-50 ${
                                  selectedSubmission?.id === submission.id ? "bg-brand/5" : ""
                                }`}
                                onClick={() => {
                                  fetchOrgAdminFormSubmission(selectedFormId, submission.id)
                                    .then((response) => setSelectedSubmission(response.submission))
                                    .catch(() => setSelectedSubmission(submission));
                                }}
                              >
                                <td className="px-4 py-3 text-neutral-700">{formatDateTime(submission.submitted_at)}</td>
                                <td className="px-4 py-3 text-neutral-600">{submission.status}</td>
                                <td className="px-4 py-3 text-neutral-600">
                                  {submission.submitted_by?.name || submission.submitted_by?.email || `#${submission.id}`}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <aside className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-600">Dettaglio risposta</h3>
                    {selectedSubmission ? (
                      <div className="mt-4 space-y-3">
                        <div className="text-xs text-neutral-500">
                          Ricevuta il {formatDateTime(selectedSubmission.submitted_at)}
                        </div>
                        {Object.entries(selectedSubmission.payload_json || {}).map(([key, value]) => (
                          <div key={key} className="rounded-2xl border border-white bg-white px-3 py-3 shadow-sm">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{key}</div>
                            <div className="mt-1 text-sm text-neutral-800">{stringifySubmissionValue(value)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-neutral-500">Seleziona una risposta dalla tabella per vedere il payload completo.</p>
                    )}
                  </aside>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrgAdminForms;
