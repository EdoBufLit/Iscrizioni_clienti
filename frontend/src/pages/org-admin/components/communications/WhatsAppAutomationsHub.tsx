import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  createOrgAdminWhatsAppAutomation,
  deleteOrgAdminWhatsAppAutomation,
  fetchOrgAdminCommunicationSettings,
  fetchOrgAdminForms,
  fetchOrgAdminWhatsAppAutomations,
  putOrgAdminCommunicationSettings,
  updateOrgAdminWhatsAppAutomation,
  type AssociationForm,
  type OrgAdminCommunicationSettings,
  type OrgAdminWhatsAppAutomation,
} from "../../../../lib/api";
import ConfirmModal from "../../../../components/ui/ConfirmModal";
import Skeleton from "../../../../components/ui/Skeleton";
import { useToast } from "../../../../components/ui/ToastProvider";

type Props = { communicationsLocked: boolean };
type AutomationWizardStep = "origin" | "delivery" | "template";

const fieldClass =
  "theme-input mt-2 h-14 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand/60 focus:ring-4 focus:ring-brand/10 disabled:cursor-not-allowed disabled:opacity-60";
const textareaClass =
  "theme-input mt-2 min-h-[180px] w-full rounded-lg border border-neutral-200 bg-white px-4 py-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand/60 focus:ring-4 focus:ring-brand/10 disabled:cursor-not-allowed disabled:opacity-60";
const labelClass = "block text-sm font-medium text-slate-800";

const wizardSteps: Array<{ key: AutomationWizardStep; label: string }> = [
  { key: "origin", label: "Origine" },
  { key: "delivery", label: "Invio" },
  { key: "template", label: "Messaggio" },
];

const whatsappVariableGroups: Array<{
  title: string;
  description: string;
  items: Array<{ label: string; placeholder: string; hint: string }>;
}> = [
  {
    title: "Contatto",
    description: "Dati del socio o della persona che ha compilato.",
    items: [
      { label: "Nome socio", placeholder: "{{nome_socio}}", hint: "Alias del contatto quando disponibile" },
      { label: "Nome contatto", placeholder: "{{nome_contatto}}", hint: "Nome letto da socio, booking o form" },
      { label: "Email", placeholder: "{{email_destinatario}}", hint: "Email della richiesta" },
      { label: "WhatsApp", placeholder: "{{numero_whatsapp}}", hint: "Numero usato per l'invio" },
    ],
  },
  {
    title: "Prenotazione",
    description: "Valori calcolati da booking, configurazione form e campi compilati.",
    items: [
      { label: "Data", placeholder: "{{data_prenotazione}}", hint: "Giorno prenotato" },
      { label: "Orario", placeholder: "{{orario_prenotazione}}", hint: "Ora o fascia oraria" },
      { label: "Persone", placeholder: "{{numero_persone}}", hint: "Coperti/partecipanti" },
      { label: "Slot", placeholder: "{{slot_prenotazione}}", hint: "Data e ora insieme" },
      { label: "Riepilogo", placeholder: "{{riepilogo_prenotazione}}", hint: "Data, ora, persone e dettagli" },
      { label: "Dettagli evento", placeholder: "{{dettagli_evento}}", hint: "Dettagli configurati o compilati" },
    ],
  },
  {
    title: "Modulo",
    description: "Contesto generale della regola.",
    items: [
      { label: "Associazione", placeholder: "{{nome_associazione}}", hint: "Nome organizzazione" },
      { label: "Titolo form", placeholder: "{{titolo_form}}", hint: "Modulo collegato" },
      { label: "ID richiesta", placeholder: "{{id_richiesta}}", hint: "Submission interna" },
      { label: "Motivo rigetto", placeholder: "{{motivo_rigetto}}", hint: "Solo su rigetto admin" },
    ],
  },
];

const bookingActionVariables: Array<{ label: string; placeholder: string; hint: string }> = [
  { label: "Link conferma", placeholder: "{{link_conferma_prenotazione}}", hint: "Apre conferma rapida della prenotazione" },
  { label: "Link annulla", placeholder: "{{link_annulla_prenotazione}}", hint: "Permette al cliente di disdire" },
  { label: "Link note", placeholder: "{{link_note_prenotazione}}", hint: "Permette di inviare modifiche o note" },
];

function emptyAutomationDraft() {
  return {
    id: null as number | null,
    name: "",
    form_id: null as number | null,
    source_type: "public_form",
    trigger_event: "form_submitted",
    recipient_type: "submitter",
    phone_source: "form_field",
    phone_field_key: "",
    custom_phone: "",
    template_name: "",
    template_body: "",
    is_active: true,
  };
}

function triggerLabel(value: string): string {
  if (value === "booking_confirmed") return "Prenotazione confermata";
  if (value === "booking_rejected") return "Prenotazione rigettata";
  if (value === "booking_created") return "Prenotazione creata";
  if (value === "request_received") return "Richiesta ricevuta";
  return "Invio del modulo";
}

function recipientLabel(value: string): string {
  if (value === "member") return "Socio collegato";
  if (value === "admin") return "Segreteria";
  if (value === "custom") return "Numero manuale";
  return "Contatto che compila il form";
}

function phoneSourceLabel(value: string): string {
  if (value === "member_phone") return "Telefono socio salvato";
  if (value === "custom") return "Numero manuale";
  return "Campo telefono del form";
}

function buildAutomationSummary(
  automation: Pick<
    OrgAdminWhatsAppAutomation,
    "form" | "trigger_event" | "recipient_type" | "phone_source" | "phone_field_key" | "custom_phone" | "template_name"
  >,
): string {
  const formLabel = automation.form?.title || "questo flusso";
  const triggerCopy = (() => {
    if (automation.trigger_event === "booking_confirmed") return "l'admin conferma la prenotazione";
    if (automation.trigger_event === "booking_rejected") return "l'admin rigetta la prenotazione";
    if (automation.trigger_event === "booking_created") return "viene creata una prenotazione";
    if (automation.trigger_event === "request_received") return "arriva una richiesta";
    return "un utente invia il modulo";
  })();
  const recipientCopy =
    automation.recipient_type === "member"
      ? "al socio collegato"
      : automation.recipient_type === "admin"
        ? "alla segreteria"
        : automation.recipient_type === "custom"
          ? "al numero manuale"
          : "al contatto che compila il form";
  const phoneCopy =
    automation.phone_source === "member_phone"
      ? "usando il telefono già salvato"
      : automation.phone_source === "custom"
        ? `usando il numero ${automation.custom_phone || "manuale"}`
        : `usando il campo ${automation.phone_field_key || "Telefono"}`;
  return `Quando ${triggerCopy} per "${formLabel}", ASSONAM invia il template "${automation.template_name}" ${recipientCopy}, ${phoneCopy}.`;
}

function StepButton(props: {
  index: number;
  label: string;
  active: boolean;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`flex min-w-[140px] items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
        props.active
          ? "border-brand bg-brand text-white shadow-sm"
          : props.done
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-neutral-200 bg-white text-slate-500 hover:border-neutral-300 hover:bg-neutral-50 hover:text-slate-900"
      }`}
    >
      <span
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          props.active
            ? "bg-white/20 text-white"
            : props.done
              ? "bg-white text-emerald-700"
              : "bg-neutral-100 text-slate-500"
        }`}
      >
        {props.done && !props.active ? "✓" : props.index + 1}
      </span>
      <span className="text-sm font-semibold">{props.label}</span>
    </button>
  );
}

function RuleCard(props: {
  automation: OrgAdminWhatsAppAutomation;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={`min-h-[156px] rounded-lg border p-5 text-left transition ${
        props.selected
          ? "border-brand/35 bg-brand/5 text-slate-950"
          : "border-neutral-200 bg-white text-slate-900 hover:border-neutral-300 hover:bg-neutral-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`truncate text-lg font-semibold ${props.selected ? "text-slate-950" : "text-slate-900"}`}>{props.automation.name}</p>
          <p className={`mt-1 text-sm ${props.selected ? "text-slate-600" : "text-slate-500"}`}>
            {props.automation.form?.title || "Form non collegato"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
            props.automation.is_active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-neutral-100 text-neutral-600"
          }`}
        >
          {props.automation.is_active ? "Attiva" : "Bozza"}
        </span>
      </div>
      <div className="mt-6 grid gap-3 text-sm text-slate-700">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Evento</p>
          <p className="mt-1 font-medium">{triggerLabel(props.automation.trigger_event)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Template</p>
          <p className="mt-1 font-medium">{props.automation.template_name}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-neutral-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-neutral-300 hover:bg-neutral-50"
          onClick={props.onSelect}
        >
          Apri
        </button>
        <button
          type="button"
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50"
          onClick={props.onDelete}
        >
          Elimina
        </button>
      </div>
    </article>
  );
}

function NewRuleCard(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex min-h-[156px] flex-col justify-between rounded-lg border border-dashed border-neutral-200 bg-neutral-50 p-5 text-left text-slate-900 transition hover:border-neutral-300 hover:bg-white"
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-brand text-2xl text-white">+</span>
      <div>
        <p className="text-lg font-semibold">Nuova regola</p>
        <p className="mt-1 text-sm text-slate-500">Crea una nuova automazione WhatsApp.</p>
      </div>
    </button>
  );
}

export function WhatsAppAutomationsHub({ communicationsLocked }: Props) {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<AssociationForm[]>([]);
  const [automations, setAutomations] = useState<OrgAdminWhatsAppAutomation[]>([]);
  const [settings, setSettings] = useState<OrgAdminCommunicationSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [draft, setDraft] = useState(emptyAutomationDraft());
  const [activeStep, setActiveStep] = useState<AutomationWizardStep>("origin");
  const [deleteAutomationTarget, setDeleteAutomationTarget] = useState<OrgAdminWhatsAppAutomation | null>(null);
  const templateTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedForm = useMemo(
    () => forms.find((form) => form.id === draft.form_id) ?? null,
    [forms, draft.form_id],
  );
  const phoneFieldOptions = useMemo(
    () => (selectedForm?.fields || []).filter((field) => field.field_type === "phone"),
    [selectedForm],
  );
  const activeIndex = wizardSteps.findIndex((step) => step.key === activeStep);
  const selectedAutomationCount = automations.filter((item) => item.is_active).length;
  const visibleVariableGroups = useMemo(() => {
    const groups = [...whatsappVariableGroups];
    const formFields = (selectedForm?.fields || [])
      .filter((field) => field.field_key && !["section_title", "free_text", "divider", "spacer"].includes(field.field_type))
      .map((field) => ({
        label: field.label || field.field_key,
        placeholder: `{{${field.field_key}}}`,
        hint: "Campo compilato nel form",
      }));
    if (formFields.length > 0) {
      groups.push({
        title: "Campi form",
        description: "Variabili generate dai campi reali del modulo selezionato.",
        items: formFields,
      });
    }
    return groups;
  }, [selectedForm]);

  function insertTemplateVariable(placeholder: string) {
    setDraft((prev) => {
      const current = prev.template_body || "";
      const needsSpace = current.length > 0 && !/\s$/.test(current);
      return {
        ...prev,
        template_body: `${current}${needsSpace ? " " : ""}${placeholder}`,
      };
    });
    window.requestAnimationFrame(() => templateTextareaRef.current?.focus());
  }

  function insertReminderVariable(placeholder: string) {
    setSettings((current) => {
      if (!current) return current;
      const message = current.booking_whatsapp_reminder_template || "";
      const needsSpace = message.length > 0 && !/\s$/.test(message);
      return {
        ...current,
        booking_whatsapp_reminder_template: `${message}${needsSpace ? " " : ""}${placeholder}`,
      };
    });
  }

  async function loadData(preselectedFormId?: number | null) {
    setLoading(true);
    try {
      const [formsData, automationData] = await Promise.all([
        fetchOrgAdminForms(),
        fetchOrgAdminWhatsAppAutomations({ formId: preselectedFormId || undefined }),
      ]);
      setForms(formsData.items);
      setAutomations(automationData.items);
      if (preselectedFormId && formsData.items.some((form) => form.id === preselectedFormId)) {
        setDraft((prev) => ({ ...prev, form_id: preselectedFormId }));
      }
    } catch (err) {
      showToast({
        title: "Errore",
        message: err instanceof Error ? err.message : "Errore caricamento automazioni WhatsApp.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const formId = Number(searchParams.get("formId") || 0) || null;
    if (searchParams.get("mode") === "create") {
      setDraft({ ...emptyAutomationDraft(), form_id: formId });
      setActiveStep("origin");
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("mode");
      setSearchParams(nextParams, { replace: true });
    }
    void loadData(formId);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    fetchOrgAdminCommunicationSettings()
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (draft.phone_source !== "form_field") return;
    if (!draft.phone_field_key) return;
    if (phoneFieldOptions.some((field) => field.field_key === draft.phone_field_key)) return;
    setDraft((prev) => ({ ...prev, phone_field_key: "" }));
  }, [draft.phone_field_key, draft.phone_source, phoneFieldOptions]);

  function beginNewRule() {
    const formId = Number(searchParams.get("formId") || 0) || null;
    setDraft({
      ...emptyAutomationDraft(),
      form_id: formId || null,
    });
    setActiveStep("origin");
  }

  function hydrateFromAutomation(automation: OrgAdminWhatsAppAutomation) {
    setDraft({
      id: automation.id,
      name: automation.name,
      form_id: automation.form_id,
      source_type: automation.source_type,
      trigger_event: automation.trigger_event,
      recipient_type: automation.recipient_type,
      phone_source: automation.phone_source,
      phone_field_key: automation.phone_field_key || "",
      custom_phone: automation.custom_phone || "",
      template_name: automation.template_name,
      template_body: automation.template_body,
      is_active: automation.is_active,
    });
    setActiveStep("origin");
  }

  async function saveAutomation() {
    if (!isStepReady("origin") || !isStepReady("delivery") || !isStepReady("template")) {
      showToast({
        title: "Campi mancanti",
        message: "Completa tutti gli step prima di salvare la regola.",
        tone: "error",
      });
      return;
    }
    try {
      const payload = {
        name: draft.name.trim(),
        form_id: draft.form_id,
        source_type: draft.source_type,
        trigger_event: draft.trigger_event,
        recipient_type: draft.recipient_type,
        phone_source: draft.phone_source,
        phone_field_key: draft.phone_field_key || null,
        custom_phone: draft.custom_phone || null,
        template_name: draft.template_name.trim(),
        template_body: draft.template_body.trim(),
        is_active: draft.is_active,
      };
      const result = draft.id
        ? await updateOrgAdminWhatsAppAutomation(draft.id, payload)
        : await createOrgAdminWhatsAppAutomation(payload);
      await loadData(draft.form_id);
      hydrateFromAutomation(result.automation);
      setActiveStep("template");
      showToast({
        title: draft.id ? "Automazione aggiornata" : "Automazione creata",
        message: "La regola WhatsApp è stata salvata.",
        tone: "success",
      });
    } catch (err) {
      showToast({
        title: "Errore",
        message: err instanceof Error ? err.message : "Errore salvataggio automazione WhatsApp.",
        tone: "error",
      });
    }
  }

  function isStepReady(step: AutomationWizardStep): boolean {
    if (step === "origin") {
      return Boolean(draft.form_id) && Boolean(draft.name.trim());
    }
    if (step === "delivery") {
      if (!draft.recipient_type || !draft.phone_source) return false;
      if (draft.phone_source === "form_field" && !draft.phone_field_key) return false;
      if (draft.phone_source === "custom" && !draft.custom_phone.trim()) return false;
      return true;
    }
    if (step === "template") {
      return Boolean(draft.template_name.trim()) && Boolean(draft.template_body.trim());
    }
    return false;
  }

  function nextStep() {
    const current = wizardSteps[activeIndex];
    if (!current || !isStepReady(current.key)) {
      showToast({
        title: "Completa questo step",
        message: "Inserisci i dati richiesti prima di continuare.",
        tone: "error",
      });
      return;
    }
    const next = wizardSteps[Math.min(activeIndex + 1, wizardSteps.length - 1)];
    setActiveStep(next.key);
  }

  async function saveReminderSettings() {
    if (!settings || communicationsLocked) return;
    setSettingsSaving(true);
    try {
      const response = await putOrgAdminCommunicationSettings({
        booking_whatsapp_reminder_enabled: settings.booking_whatsapp_reminder_enabled,
        booking_whatsapp_reminder_hours_before: settings.booking_whatsapp_reminder_hours_before,
        booking_whatsapp_reminder_template: settings.booking_whatsapp_reminder_template || null,
      });
      setSettings(response.settings);
      showToast({
        title: "Reminder aggiornato",
        message: "Il promemoria WhatsApp verrà inviato automaticamente prima dell'evento.",
        tone: "success",
      });
    } catch (err) {
      showToast({
        title: "Errore",
        message: err instanceof Error ? err.message : "Errore salvataggio reminder WhatsApp.",
        tone: "error",
      });
    } finally {
      setSettingsSaving(false);
    }
  }

  async function confirmDeleteAutomation() {
    if (!deleteAutomationTarget || communicationsLocked) return;
    try {
      await deleteOrgAdminWhatsAppAutomation(deleteAutomationTarget.id);
      const deletedDraftWasOpen = draft.id === deleteAutomationTarget.id;
      setDeleteAutomationTarget(null);
      await loadData(draft.form_id);
      if (deletedDraftWasOpen) {
        beginNewRule();
      }
      showToast({
        title: "Automazione eliminata",
        message: "La regola WhatsApp è stata rimossa.",
        tone: "success",
      });
    } catch (err) {
      showToast({
        title: "Errore",
        message: err instanceof Error ? err.message : "Errore eliminazione automazione WhatsApp.",
        tone: "error",
      });
    }
  }

  function previousStep() {
    const next = wizardSteps[Math.max(activeIndex - 1, 0)];
    setActiveStep(next.key);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-[620px] w-full rounded-xl" />
      </div>
    );
  }

  const reviewSummary = buildAutomationSummary({
    form: selectedForm
      ? {
          id: selectedForm.id,
          title: selectedForm.title,
          public_slug: selectedForm.public_slug,
          public_path: selectedForm.public_path || "",
        }
      : null,
    trigger_event: draft.trigger_event,
    recipient_type: draft.recipient_type,
    phone_source: draft.phone_source,
    phone_field_key: draft.phone_field_key || null,
    custom_phone: draft.custom_phone || null,
    template_name: draft.template_name || "questo template",
  });

  return (
    <div className="whatsapp-automations-hub space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Automazioni WhatsApp</p>
          <h2 className="mt-2 text-[2rem] font-semibold tracking-tight text-slate-950">Regole collegate ai form</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-slate-500">
            <strong className="text-slate-900">{automations.length}</strong> regole
          </div>
          <div className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-slate-500">
            <strong className="text-slate-900">{selectedAutomationCount}</strong> attive
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(220px,0.86fr)]">
          {automations.map((automation) => (
            <RuleCard
              key={automation.id}
              automation={automation}
              selected={draft.id === automation.id}
              onSelect={() => hydrateFromAutomation(automation)}
              onDelete={() => setDeleteAutomationTarget(automation)}
            />
          ))}
          <NewRuleCard onClick={beginNewRule} />
        </div>
        {automations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-5 py-4 text-sm text-slate-500">
            Nessuna regola configurata.
          </div>
        ) : null}
      </section>

      {settings ? (
        <section className="whatsapp-reminder-panel rounded-lg border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Reminder prenotazioni</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Promemoria automatico prima dell'evento</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Quando una prenotazione e confermata, il worker invia da solo questo messaggio WhatsApp al contatto della prenotazione
                all'orario configurato. L'org admin non deve inviarlo manualmente.
              </p>
            </div>
            <label className="inline-flex items-center gap-3 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300 text-brand"
                checked={settings.booking_whatsapp_reminder_enabled}
                disabled={communicationsLocked}
                onChange={(event) =>
                  setSettings((current) =>
                    current ? { ...current, booking_whatsapp_reminder_enabled: event.target.checked } : current,
                  )
                }
              />
              Attivo
            </label>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-end">
            <label className={labelClass}>
              Ore prima
              <input
                className={fieldClass}
                type="number"
                min={1}
                max={336}
                disabled={communicationsLocked}
                value={settings.booking_whatsapp_reminder_hours_before}
                onChange={(event) =>
                  setSettings((current) =>
                    current
                      ? { ...current, booking_whatsapp_reminder_hours_before: Number(event.target.value || 24) }
                      : current,
                  )
                }
              />
            </label>
            <label className={labelClass}>
              Messaggio
              <textarea
                className={`${textareaClass} min-h-[104px]`}
                disabled={communicationsLocked}
                value={settings.booking_whatsapp_reminder_template || ""}
                onChange={(event) =>
                  setSettings((current) =>
                    current ? { ...current, booking_whatsapp_reminder_template: event.target.value } : current,
                  )
                }
                placeholder="Ciao {{nome_contatto}}, ti ricordiamo la prenotazione per {{nome_associazione}} {{data_prenotazione}} alle {{orario_prenotazione}}."
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">Link rapidi</span>
                {bookingActionVariables.map((item) => (
                  <button
                    key={item.placeholder}
                    type="button"
                    className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                    title={item.hint}
                    disabled={communicationsLocked}
                    onClick={() => insertReminderVariable(item.placeholder)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Conferma, annulla e note sono link personalizzati della singola prenotazione.
              </p>
            </label>
            <button
              type="button"
              className="inline-flex min-h-[3.3rem] items-center justify-center rounded-lg bg-brand px-6 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={communicationsLocked || settingsSaving}
              onClick={() => void saveReminderSettings()}
            >
              {settingsSaving ? "Salvataggio..." : "Salva reminder"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Configurazione</p>
            <h3 className="mt-2 text-[1.85rem] font-semibold tracking-tight text-slate-950">
              {draft.id ? "Modifica regola" : "Nuova regola"}
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {wizardSteps.map((step, index) => (
              <StepButton
                key={step.key}
                index={index}
                label={step.label}
                active={activeStep === step.key}
                done={index < activeIndex}
                onClick={() => setActiveStep(step.key)}
              />
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_320px]">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-5 md:p-6">
            {activeStep === "origin" ? (
              <div className="grid gap-5">
                <label className={labelClass}>
                  Modulo
                  <select
                    className={fieldClass}
                    disabled={communicationsLocked}
                    value={draft.form_id ?? ""}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, form_id: event.target.value ? Number(event.target.value) : null }))
                    }
                  >
                    <option value="">Seleziona un form pubblico</option>
                    {forms.map((form) => (
                      <option key={form.id} value={form.id}>
                        {form.title}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className={labelClass}>
                    Evento
                    <select
                      className={fieldClass}
                      disabled={communicationsLocked}
                      value={draft.trigger_event}
                      onChange={(event) => setDraft((prev) => ({ ...prev, trigger_event: event.target.value }))}
                    >
                      <option value="form_submitted">Invio del modulo</option>
                      <option value="booking_created">Prenotazione creata</option>
                      <option value="booking_confirmed">Prenotazione confermata da admin</option>
                      <option value="booking_rejected">Prenotazione rigettata da admin</option>
                      <option value="request_received">Richiesta ricevuta</option>
                    </select>
                  </label>

                  <label className={labelClass}>
                    Nome interno
                    <input
                      className={fieldClass}
                      disabled={communicationsLocked}
                      value={draft.name}
                      onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Conferma iscrizione"
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {activeStep === "delivery" ? (
              <div className="grid gap-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <label className={labelClass}>
                    Destinatario
                    <select
                      className={fieldClass}
                      disabled={communicationsLocked}
                      value={draft.recipient_type}
                      onChange={(event) => setDraft((prev) => ({ ...prev, recipient_type: event.target.value }))}
                    >
                      <option value="submitter">Contatto che compila il form</option>
                      <option value="member">Socio collegato</option>
                      <option value="admin">Segreteria</option>
                      <option value="custom">Numero manuale</option>
                    </select>
                  </label>

                  <label className={labelClass}>
                    Numero da usare
                    <select
                      className={fieldClass}
                      disabled={communicationsLocked}
                      value={draft.phone_source}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          phone_source: event.target.value,
                          phone_field_key: event.target.value === "form_field" ? prev.phone_field_key : "",
                          custom_phone: event.target.value === "custom" ? prev.custom_phone : "",
                        }))
                      }
                    >
                      <option value="form_field">Campo telefono del form</option>
                      <option value="member_phone">Telefono socio salvato</option>
                      <option value="custom">Numero manuale</option>
                    </select>
                  </label>
                </div>

                {draft.phone_source === "form_field" ? (
                  <label className={labelClass}>
                    Campo telefono
                    <select
                      className={fieldClass}
                      disabled={communicationsLocked}
                      value={draft.phone_field_key}
                      onChange={(event) => setDraft((prev) => ({ ...prev, phone_field_key: event.target.value }))}
                    >
                      <option value="">Seleziona un campo telefono</option>
                      {phoneFieldOptions.map((field) => (
                        <option key={field.id} value={field.field_key}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {draft.phone_source === "custom" ? (
                  <label className={labelClass}>
                    Numero manuale
                    <input
                      className={fieldClass}
                      disabled={communicationsLocked}
                      value={draft.custom_phone}
                      onChange={(event) => setDraft((prev) => ({ ...prev, custom_phone: event.target.value }))}
                      placeholder="+393331234567"
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            {activeStep === "template" ? (
              <div className="grid gap-5">
                <label className={labelClass}>
                  Nome template
                  <input
                    className={fieldClass}
                    disabled={communicationsLocked}
                    value={draft.template_name}
                    onChange={(event) => setDraft((prev) => ({ ...prev, template_name: event.target.value }))}
                    placeholder="Conferma prenotazione"
                  />
                </label>

                <label className={labelClass}>
                  Messaggio
                  <textarea
                    ref={templateTextareaRef}
                    className={textareaClass}
                    disabled={communicationsLocked}
                    value={draft.template_body}
                    onChange={(event) => setDraft((prev) => ({ ...prev, template_body: event.target.value }))}
                    placeholder="Ciao {{nome_socio}}, abbiamo ricevuto la tua richiesta..."
                  />
                </label>

                <section className="whatsapp-variable-library" aria-label="Variabili disponibili per il messaggio WhatsApp">
                  <div className="whatsapp-variable-library__header">
                    <div>
                      <p>Variabili disponibili</p>
                      <h4>Tocca per inserirle nel messaggio</h4>
                    </div>
                    <span>{visibleVariableGroups.reduce((total, group) => total + group.items.length, 0)}</span>
                  </div>
                  <div className="whatsapp-variable-library__groups">
                    {visibleVariableGroups.map((group) => (
                      <div key={group.title} className="whatsapp-variable-library__group">
                        <div className="whatsapp-variable-library__group-head">
                          <strong>{group.title}</strong>
                          <small>{group.description}</small>
                        </div>
                        <div className="whatsapp-variable-library__chips">
                          {group.items.map((item) => (
                            <button
                              key={`${group.title}-${item.placeholder}`}
                              type="button"
                              className="whatsapp-variable-chip"
                              onClick={() => insertTemplateVariable(item.placeholder)}
                              title={item.hint}
                            >
                              <span>{item.label}</span>
                              <code>{item.placeholder}</code>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-neutral-300 bg-white text-brand"
                    checked={draft.is_active}
                    onChange={(event) => setDraft((prev) => ({ ...prev, is_active: event.target.checked }))}
                  />
                  Regola attiva
                </label>
              </div>
            ) : null}

          </div>

          <aside className="rounded-lg border border-neutral-200 bg-neutral-50 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Riepilogo</p>
            <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-900">{draft.template_name || "Template WhatsApp"}</p>
                  <p className="mt-1 text-sm text-slate-500">{selectedForm?.title || "Form pubblico"}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                    draft.is_active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {draft.is_active ? "Attiva" : "Bozza"}
                </span>
              </div>
              <div className="mt-5 space-y-3 text-sm text-slate-700">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Evento</p>
                  <p className="mt-1">{triggerLabel(draft.trigger_event)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Destinatario</p>
                  <p className="mt-1">{recipientLabel(draft.recipient_type)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Numero</p>
                  <p className="mt-1">{phoneSourceLabel(draft.phone_source)}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Messaggio</p>
              <p className="mt-3 text-sm leading-7 text-slate-700">{draft.template_body || reviewSummary}</p>
            </div>
          </aside>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-5">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="inline-flex min-h-[3.3rem] items-center justify-center rounded-lg border border-neutral-200 bg-white px-5 text-sm font-medium text-slate-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={beginNewRule}
            >
              Reset
            </button>
            <button
              type="button"
              className="inline-flex min-h-[3.3rem] items-center justify-center rounded-lg border border-neutral-200 bg-white px-5 text-sm font-medium text-slate-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={previousStep}
              disabled={activeIndex === 0}
            >
              Indietro
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            {activeStep !== "template" ? (
              <button
                type="button"
                className="inline-flex min-h-[3.3rem] items-center justify-center rounded-lg bg-brand px-6 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                onClick={nextStep}
                disabled={communicationsLocked}
              >
                Continua
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex min-h-[3.3rem] items-center justify-center rounded-lg bg-brand px-6 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void saveAutomation()}
                disabled={communicationsLocked}
              >
                {draft.id ? "Salva automazione" : "Crea automazione"}
              </button>
            )}
          </div>
        </div>
      </section>
      <ConfirmModal
        open={Boolean(deleteAutomationTarget)}
        title="Eliminare questa regola WhatsApp?"
        description={`La regola "${deleteAutomationTarget?.name || "selezionata"}" non invierà più messaggi automatici.`}
        confirmLabel="Elimina regola"
        tone="danger"
        onClose={() => setDeleteAutomationTarget(null)}
        onConfirm={() => void confirmDeleteAutomation()}
      />
    </div>
  );
}
