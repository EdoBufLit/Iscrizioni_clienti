import { FormEvent, useEffect, useState } from "react";
import {
  createOrgAdminForm,
  createOrgAdminFormField,
  deleteOrgAdminFormField,
  fetchOrgAdminForm,
  fetchOrgAdminForms,
  fetchOrgAdminFormSubmissions,
  updateOrgAdminForm,
  updateOrgAdminFormField,
  type AssociationForm,
  type AssociationFormFieldType,
  type AssociationFormSubmission,
  type AssociationFormVisibility,
} from "../../../../lib/api";
import Skeleton from "../../../../components/ui/Skeleton";
import { useToast } from "../../../../components/ui/ToastProvider";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const inputClass = "mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const labelClass = "block text-sm font-medium text-neutral-700";

type EditorTab = "contenuto" | "campi" | "automazioni" | "condivisione" | "risposte";
type PageStyleOption = "editorial" | "minimal" | "spotlight";

type DraftField = {
  id: string | number;
  is_new: boolean;
  field_key: string;
  field_type: AssociationFormFieldType;
  label: string;
  placeholder: string;
  help_text: string;
  is_required: boolean;
  sort_order: number;
  options_text: string;
};

// Helper functions (slugifyKey, derivePublicSlug, formatDateTime, stringifySubmissionValue)
function slugifyKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

function derivePublicSlug(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
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
    title: "", description: "", accent_color: "#0f766e", submit_button_text: "Invia", show_logo: true, cover_image_url: "", page_style: "editorial" as PageStyleOption,
    public_slug: "", is_active: false, visibility: "public" as AssociationFormVisibility, success_message: "Richiesta ricevuta.",
    notification_email: "", allow_multiple_submissions: true, notify_admin_on_submit: true, send_user_confirmation: true,
    admin_notification_template_id: null as number | null, user_confirmation_template_id: null as number | null,
    create_internal_request: false, create_booking: false,
  };
}

const fieldTypeOptions: Array<{ value: AssociationFormFieldType; label: string; icon: string; hint: string }> = [
  { value: "short_text", label: "Testo breve", icon: "Aa", hint: "Nome, titolo, ecc." },
  { value: "long_text", label: "Testo lungo", icon: "¶", hint: "Note o messaggi." },
  { value: "email", label: "Email", icon: "@", hint: "Richiesta e valida." },
  { value: "phone", label: "Telefono", icon: "☎", hint: "Numero di telefono." },
  { value: "number", label: "Numero", icon: "123", hint: "Quantità o valori." },
  { value: "date", label: "Data", icon: "◷", hint: "Appuntamenti o scadenze." },
  { value: "select", label: "Menu a tendina", icon: "▾", hint: "Una scelta su tante." },
  { value: "radio", label: "Scelta singola", icon: "◉", hint: "Poche opzioni visibili." },
  { value: "checkbox", label: "Scelta multipla", icon: "☑", hint: "Più opzioni selezionabili." },
  { value: "consent", label: "Consenso", icon: "✓", hint: "Privacy o termini." },
];

function emptyFieldDraft(fieldType: AssociationFormFieldType = "short_text") {
  const option = fieldTypeOptions.find((item) => item.value === fieldType);
  const label = option ? option.label : "Nuovo campo";
  return {
    field_key: slugifyKey(label), field_type: fieldType, label, placeholder: "", help_text: "",
    is_required: false, options_text: fieldType === "select" || fieldType === "radio" || fieldType === "checkbox" ? "Opzione 1, Opzione 2" : "",
  };
}

function SortableFieldItem({ f, editingFieldId, setEditingFieldId, setIsEditingFieldPanel, handleDeleteField }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: isDragging ? ("relative" as const) : ("static" as const),
  };
  return (
    <div ref={setNodeRef} style={style} className={`flex items-center justify-between rounded-xl border p-4 bg-white transition cursor-pointer ${editingFieldId === f.id ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-neutral-200 hover:border-brand/40"} ${isDragging ? "shadow-lg opacity-90" : ""}`} onClick={() => { setEditingFieldId(f.id); setIsEditingFieldPanel(true); }}>
      <div className="flex items-center gap-3">
        <div {...attributes} {...listeners} className="cursor-grab p-1 text-neutral-400 hover:text-neutral-600 active:cursor-grabbing" onClick={(e) => e.stopPropagation()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
        </div>
        <div>
          <p className="font-semibold text-sm">{f.label} {f.is_required && <span className="text-red-500">*</span>}</p>
          <p className="text-xs text-neutral-500">{fieldTypeOptions.find(o => o.value === f.field_type)?.label}</p>
        </div>
      </div>
      <button className="text-xs font-medium text-red-500 hover:underline hover:text-red-700" onClick={(e) => { e.stopPropagation(); handleDeleteField(f.id); }}>Elimina</button>
    </div>
  );
}

export function PublicFormsHub({ locked = false }: { locked?: boolean; }) {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<AssociationForm[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);
  const [selectedForm, setSelectedForm] = useState<AssociationForm | null>(null);
  
  const [activeTab, setActiveTab] = useState<EditorTab>("contenuto");
  const [formDraft, setFormDraft] = useState(emptyFormDraft());
  const [savingForm, setSavingForm] = useState(false);

  // Campi In-Memory State
  const [formFields, setFormFields] = useState<DraftField[]>([]);
  const [editingFieldId, setEditingFieldId] = useState<string | number | null>(null);
  const [isEditingFieldPanel, setIsEditingFieldPanel] = useState(false);

  const [submissions, setSubmissions] = useState<AssociationFormSubmission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<AssociationFormSubmission | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (locked) { setLoading(false); return; }
    fetchOrgAdminForms().then(res => setForms(res.items)).finally(() => setLoading(false));
  }, [locked]);

  useEffect(() => {
    if (!selectedForm) { 
      setFormDraft(emptyFormDraft()); 
      setFormFields([]);
      setEditingFieldId(null);
      setIsEditingFieldPanel(false);
      return; 
    }
    setFormDraft({
      title: selectedForm.title || "", description: selectedForm.description || "", accent_color: selectedForm.accent_color || "#0f766e",
      submit_button_text: selectedForm.submit_button_text || "Invia", show_logo: Boolean(selectedForm.show_logo), cover_image_url: selectedForm.cover_image_url || "",
      page_style: (selectedForm.page_style as PageStyleOption) || "editorial", public_slug: selectedForm.public_slug || "", is_active: Boolean(selectedForm.is_active),
      visibility: selectedForm.visibility, success_message: selectedForm.success_message || "", notification_email: selectedForm.notification_email || "",
      allow_multiple_submissions: Boolean(selectedForm.allow_multiple_submissions), notify_admin_on_submit: Boolean(selectedForm.notify_admin_on_submit),
      send_user_confirmation: Boolean(selectedForm.send_user_confirmation), admin_notification_template_id: selectedForm.admin_notification_template_id,
      user_confirmation_template_id: selectedForm.user_confirmation_template_id, create_internal_request: Boolean(selectedForm.create_internal_request), create_booking: Boolean(selectedForm.create_booking),
    });

    const loadedFields: DraftField[] = (selectedForm.fields || []).map(f => ({
      id: f.id,
      is_new: false,
      field_key: f.field_key || "",
      field_type: f.field_type,
      label: f.label,
      placeholder: f.placeholder || "",
      help_text: f.help_text || "",
      is_required: f.is_required,
      sort_order: f.sort_order,
      options_text: f.options?.join(", ") || "",
    })).sort((a, b) => a.sort_order - b.sort_order);
    
    setFormFields(loadedFields);
    setEditingFieldId(null);
    setIsEditingFieldPanel(false);
  }, [selectedForm]);

  useEffect(() => {
    if (!selectedFormId || selectedFormId === -1 || activeTab !== "risposte") return;
    fetchOrgAdminFormSubmissions(selectedFormId).then(res => setSubmissions(res.items));
  }, [selectedFormId, activeTab]);

  const handleSaveForm = async (e?: FormEvent) => {
    e?.preventDefault();
    if (locked || savingForm) return;
    setSavingForm(true);
    try {
      const payload = { ...formDraft, public_slug: formDraft.public_slug || derivePublicSlug(formDraft.title) };
      
      const response = selectedFormId && selectedFormId !== -1 
          ? await updateOrgAdminForm(selectedFormId, payload) 
          : await createOrgAdminForm(payload);
          
      const actualFormId = response.form.id;

      // Sincronizzazione campi (diffing)
      const originalFields = selectedForm?.fields || [];
      const originalIds = new Set(originalFields.map(f => f.id));
      
      const currentIds = new Set(formFields.filter(f => !f.is_new).map(f => f.id as number));
      const idsToDelete = [...originalIds].filter(id => !currentIds.has(id));

      for (const id of idsToDelete) {
         await deleteOrgAdminFormField(actualFormId, id).catch(() => {});
      }

      for (const f of formFields) {
        const fieldPayload = {
          field_key: f.field_key || null,
          field_type: f.field_type,
          label: f.label,
          placeholder: f.placeholder || null,
          help_text: f.help_text || null,
          is_required: f.is_required,
          sort_order: f.sort_order,
          options: f.options_text || null,
        };
        
        if (f.is_new) {
           await createOrgAdminFormField(actualFormId, fieldPayload);
        } else {
           await updateOrgAdminFormField(actualFormId, f.id as number, fieldPayload);
        }
      }

      showToast({ tone: "success", title: "Salvato", message: "Il modulo e i campi sono stati salvati." });
      
      const resList = await fetchOrgAdminForms();
      setForms(resList.items);
      
      const updatedFormDetail = await fetchOrgAdminForm(actualFormId);
      setSelectedForm(updatedFormDetail.form);
      setSelectedFormId(actualFormId);
      
    } catch (err) {
      showToast({ tone: "error", title: "Errore", message: "Impossibile salvare il modulo." });
    } finally {
      setSavingForm(false);
    }
  };

  const syncDraft = <K extends keyof ReturnType<typeof emptyFormDraft>>(key: K, val: any) => {
    setFormDraft(p => ({ ...p, [key]: val }));
  };

  const handleAddField = (fieldType: AssociationFormFieldType) => {
    const newId = `temp-${Date.now()}-${Math.random()}`;
    const base = emptyFieldDraft(fieldType);
    const maxSort = formFields.reduce((max, f) => Math.max(max, f.sort_order), 0);
    const newField: DraftField = {
      id: newId,
      is_new: true,
      field_key: base.field_key,
      field_type: base.field_type,
      label: base.label,
      placeholder: base.placeholder || "",
      help_text: base.help_text || "",
      is_required: base.is_required,
      sort_order: maxSort + 10,
      options_text: base.options_text
    };
    setFormFields(prev => [...prev, newField]);
    setEditingFieldId(newId);
    setIsEditingFieldPanel(true);
  };

  const handleUpdateEditingField = (changes: Partial<DraftField>) => {
    setFormFields(prev => prev.map(f => f.id === editingFieldId ? { ...f, ...changes } : f));
  };

  const handleDeleteDraftField = (id: string | number) => {
    setFormFields(prev => prev.filter(f => f.id !== id));
    if (editingFieldId === id) {
      setEditingFieldId(null);
      setIsEditingFieldPanel(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setFormFields((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over?.id);
        const reordered = arrayMove(items, oldIndex, newIndex);
        return reordered.map((item, index) => ({ ...item, sort_order: (index + 1) * 10 }));
      });
    }
  };

  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  if (!selectedFormId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Le tue pagine pubbliche</h2>
          <button className="btn-primary" disabled={locked} onClick={() => { setSelectedFormId(-1); setSelectedForm(null); setActiveTab("contenuto"); }}>Nuova pagina</button>
        </div>
        {forms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-10 text-center text-neutral-500">
            Nessuna pagina form creata. Inizia creandone una per raccogliere iscritti, richieste o contatti.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {forms.map(f => (
              <div key={f.id} className="cursor-pointer rounded-[1.5rem] border border-neutral-200 bg-white p-5 transition hover:shadow-md" onClick={() => { setSelectedFormId(f.id); setSelectedForm(f); }}>
                <span className={`inline-block rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${f.is_active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{f.is_active ? "Attiva" : "Bozza"}</span>
                <h3 className="mt-3 font-semibold text-neutral-900">{f.title}</h3>
                <p className="mt-1 text-xs text-neutral-500">/{f.public_slug}</p>
                <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-4 text-sm text-neutral-600">
                  <span>{f.field_count} campi</span>
                  <span>{f.submission_count} risposte</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const renderContenuto = () => (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="space-y-6">
        <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
          <label className={labelClass}>Titolo della pagina <input className={inputClass} value={formDraft.title} onChange={e => syncDraft("title", e.target.value)} placeholder="Es. Richiesta info" /></label>
          <label className={labelClass}>Sottotitolo <textarea className={`${inputClass} min-h-[80px]`} value={formDraft.description} onChange={e => syncDraft("description", e.target.value)} /></label>
          <label className={labelClass}>Messaggio di successo post-invio <textarea className={`${inputClass} min-h-[80px]`} value={formDraft.success_message} onChange={e => syncDraft("success_message", e.target.value)} /></label>
        </div>
        <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-sm font-semibold">Aspetto</p>
          <label className={labelClass}>Testo del bottone <input className={inputClass} value={formDraft.submit_button_text} onChange={e => syncDraft("submit_button_text", e.target.value)} /></label>
          <label className={labelClass}>Stile pagina 
            <select className={inputClass} value={formDraft.page_style} onChange={e => syncDraft("page_style", e.target.value)}>
              <option value="minimal">Minimal</option><option value="editorial">Editorial</option><option value="spotlight">Spotlight</option>
            </select>
          </label>
        </div>
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <p className="mb-2 text-xs font-bold uppercase text-neutral-500">Anteprima compatta</p>
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">{formDraft.title || "Titolo Pagina"}</h2>
          <p className="mt-2 text-neutral-600">{formDraft.description || "Descrizione della pagina..."}</p>
          <div className="mt-6 space-y-3 opacity-50">
            <div className="h-10 w-full rounded-md bg-neutral-100"></div>
            <div className="h-10 w-full rounded-md bg-neutral-100"></div>
          </div>
          <button className="mt-6 rounded-lg bg-neutral-900 px-6 py-2 text-white">{formDraft.submit_button_text || "Invia"}</button>
        </div>
      </div>
    </div>
  );

  const renderCampi = () => {
    const editingField = formFields.find(f => f.id === editingFieldId);

    return (
      <div className="grid gap-6 lg:grid-cols-[240px_1fr_300px]">
        <div className="space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-xs font-bold uppercase text-neutral-500">Aggiungi Campo</p>
          {fieldTypeOptions.map(opt => (
            <button key={opt.value} type="button" className="flex w-full items-center gap-2 rounded-lg border border-neutral-200 bg-white p-2 text-left text-sm hover:border-neutral-300" onClick={() => handleAddField(opt.value)}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-neutral-100 text-xs font-bold">{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {formFields.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500">Nessun campo presente. Aggiungi il primo campo dalla colonna di sinistra.</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={formFields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                {formFields.map((f) => (
                  <SortableFieldItem key={f.id} f={f} editingFieldId={editingFieldId} setEditingFieldId={setEditingFieldId} setIsEditingFieldPanel={setIsEditingFieldPanel} handleDeleteField={handleDeleteDraftField} />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
        <div>
          {!isEditingFieldPanel || !editingField ? (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-500">
              Seleziona un campo per modificarne le impostazioni.<br/><br/>
              Le modifiche verranno salvate cliccando <strong>"Salva il Form"</strong>.
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <p className="font-semibold text-brand">{editingField.is_new ? "Nuovo Campo" : "Modifica Campo"}</p>
              <label className={labelClass}>Etichetta <input className={inputClass} value={editingField.label} onChange={e => handleUpdateEditingField({ label: e.target.value })} required /></label>
              <label className={labelClass}>Placeholder <input className={inputClass} value={editingField.placeholder} onChange={e => handleUpdateEditingField({ placeholder: e.target.value })} /></label>
              {["select", "radio", "checkbox"].includes(editingField.field_type) && (
                <label className={labelClass}>Opzioni (separate da virgola) <input className={inputClass} value={editingField.options_text} onChange={e => handleUpdateEditingField({ options_text: e.target.value })} /></label>
              )}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editingField.is_required} onChange={e => handleUpdateEditingField({ is_required: e.target.checked })} /> Obbligatorio</label>
              <div className="pt-4 border-t border-neutral-100">
                <p className="text-xs text-neutral-500">Le modifiche ai campi sono in memoria. Ricordati di cliccare <strong>"Salva il Form"</strong> in alto a destra per applicarle definitivamente.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAutomazioni = () => (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6">
        <h3 className="font-semibold text-neutral-900">Azioni automatiche</h3>
        <label className="flex items-start gap-3 rounded-xl border border-neutral-200 p-4">
          <input type="checkbox" className="mt-1" checked={formDraft.notify_admin_on_submit} onChange={e => syncDraft("notify_admin_on_submit", e.target.checked)} />
          <div>
            <p className="font-medium">Avvisa la segreteria via email</p>
            <p className="text-sm text-neutral-500">Invia una notifica quando qualcuno compila il modulo.</p>
          </div>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-neutral-200 p-4">
          <input type="checkbox" className="mt-1" checked={formDraft.send_user_confirmation} onChange={e => syncDraft("send_user_confirmation", e.target.checked)} />
          <div>
            <p className="font-medium">Invia una conferma automatica all'utente</p>
            <p className="text-sm text-neutral-500">Manda un'email di ricevuta (richiede un campo email nel form).</p>
          </div>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-neutral-200 p-4">
          <input type="checkbox" className="mt-1" checked={formDraft.create_internal_request} onChange={e => syncDraft("create_internal_request", e.target.checked)} />
          <div>
            <p className="font-medium">Crea una richiesta interna da gestire</p>
            <p className="text-sm text-neutral-500">Aggiunge l'invio alla coda delle richieste da approvare.</p>
          </div>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-neutral-200 p-4">
          <input type="checkbox" className="mt-1" checked={formDraft.allow_multiple_submissions} onChange={e => syncDraft("allow_multiple_submissions", e.target.checked)} />
          <div>
            <p className="font-medium">Consenti più invii dallo stesso utente</p>
            <p className="text-sm text-neutral-500">Non bloccare chi ha già compilato il form in passato.</p>
          </div>
        </label>
      </div>
      <div className="space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
        <h3 className="font-semibold text-neutral-900">Cosa succede dopo l'invio</h3>
        <ol className="list-decimal space-y-2 pl-4 text-sm text-neutral-700">
          <li>I dati vengono salvati in "Risposte".</li>
          {formDraft.notify_admin_on_submit && <li>La segreteria riceve un'email.</li>}
          {formDraft.send_user_confirmation && <li>L'utente riceve la conferma.</li>}
          {formDraft.create_internal_request && <li>Viene creata una richiesta nel backoffice.</li>}
        </ol>
      </div>
    </div>
  );

  const renderCondivisione = () => (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-8">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Link pubblico</p>
          <a href={`${window.location.origin}/forms/${formDraft.public_slug}`} target="_blank" rel="noreferrer" className="mt-2 block break-all text-2xl font-bold text-brand hover:underline">
            {`${window.location.origin}/forms/${formDraft.public_slug}`}
          </a>
          <div className="mt-6 flex justify-center gap-3">
            <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/forms/${formDraft.public_slug}`)}>Copia link</button>
            <a className="btn-primary" href={`${window.location.origin}/forms/${formDraft.public_slug}`} target="_blank" rel="noreferrer">Apri pagina</a>
          </div>
        </div>
        <div className="grid gap-4 border-t border-neutral-100 pt-6 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-neutral-200 p-4">
            <input type="checkbox" className="h-5 w-5 rounded border-neutral-300 text-brand" checked={formDraft.is_active} onChange={e => syncDraft("is_active", e.target.checked)} />
            <div>
              <p className="font-medium">Pagina Attiva (Online)</p>
              <p className="text-xs text-neutral-500">Se disattivato, il link darà errore.</p>
            </div>
          </label>
        </div>
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
        <h3 className="font-semibold text-neutral-900">Checklist</h3>
        <ul className="mt-4 space-y-3 text-sm text-neutral-600">
          <li className="flex gap-2"><span>{formDraft.title ? "✅" : "❌"}</span> Titolo presente</li>
          <li className="flex gap-2"><span>{formFields.length > 0 ? "✅" : "❌"}</span> Almeno un campo</li>
          <li className="flex gap-2"><span>{formDraft.is_active ? "✅" : "❌"}</span> Pagina attiva</li>
        </ul>
      </div>
    </div>
  );

  const renderRisposte = () => (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr><th className="px-4 py-3 font-semibold">Data</th><th className="px-4 py-3 font-semibold">Utente</th></tr>
          </thead>
          <tbody>
            {submissions.length === 0 ? <tr><td colSpan={2} className="p-6 text-center text-neutral-500">Nessuna risposta.</td></tr> :
              submissions.map(sub => (
                <tr key={sub.id} className="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50" onClick={() => setSelectedSubmission(sub)}>
                  <td className="px-4 py-3">{formatDateTime(sub.submitted_at)}</td>
                  <td className="px-4 py-3 font-medium">{sub.submitted_by?.name || sub.submitted_by?.email || `ID: #${sub.id}`}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
        <h3 className="font-semibold text-neutral-900">Dettaglio</h3>
        {selectedSubmission ? (
          <div className="mt-4 space-y-3">
            {Object.entries(selectedSubmission.payload_json || {}).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-white p-3 shadow-sm text-sm">
                <p className="text-xs text-neutral-500 uppercase">{k}</p>
                <p className="mt-1 font-medium">{stringifySubmissionValue(v)}</p>
              </div>
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-neutral-500">Seleziona una risposta.</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button className="text-sm font-semibold text-neutral-500 hover:text-neutral-900" onClick={() => { setSelectedFormId(null); setSelectedForm(null); }}>← Torna all'elenco</button>
          <h2 className="mt-2 text-2xl font-bold">{formDraft.title || "Nuova Pagina Modulo"}</h2>
        </div>
        <button className="btn-primary" onClick={handleSaveForm} disabled={savingForm}>{savingForm ? "Salvataggio..." : "Salva il Form"}</button>
      </div>
      <div className="flex gap-2 border-b border-neutral-200 pb-4">
        {[
          { k: "contenuto", l: "Contenuto" }, { k: "campi", l: "Campi" }, { k: "automazioni", l: "Automazioni" }, { k: "condivisione", l: "Condivisione" }, { k: "risposte", l: "Risposte" }
        ].map(t => (
          <button key={t.k} className={`rounded-full px-5 py-2 text-sm font-semibold transition ${activeTab === t.k ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`} onClick={() => setActiveTab(t.k as EditorTab)}>
            {t.l}
          </button>
        ))}
      </div>
      {activeTab === "contenuto" && renderContenuto()}
      {activeTab === "campi" && renderCampi()}
      {activeTab === "automazioni" && renderAutomazioni()}
      {activeTab === "condivisione" && renderCondivisione()}
      {activeTab === "risposte" && renderRisposte()}
    </div>
  );
}
