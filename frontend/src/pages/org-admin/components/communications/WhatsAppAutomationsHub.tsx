import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  createOrgAdminWhatsAppAutomation,
  fetchOrgAdminForms,
  fetchOrgAdminWhatsAppAutomations,
  updateOrgAdminWhatsAppAutomation,
  type AssociationForm,
  type OrgAdminWhatsAppAutomation,
} from "../../../../lib/api";
import Skeleton from "../../../../components/ui/Skeleton";
import { useToast } from "../../../../components/ui/ToastProvider";

type Props = { communicationsLocked: boolean };

const inputClass =
  "mt-2 w-full rounded-[1.05rem] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/15";
const labelClass = "block text-sm font-semibold text-neutral-800";
const cardClass = "rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]";

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

function buildAutomationSummary(
  automation: Pick<
    OrgAdminWhatsAppAutomation,
    "form" | "trigger_event" | "recipient_type" | "phone_source" | "phone_field_key" | "custom_phone" | "template_name"
  >,
): string {
  const formLabel = automation.form?.title || "questo flusso";
  const triggerLabel =
    automation.trigger_event === "booking_created"
      ? "viene creata una prenotazione"
      : automation.trigger_event === "request_received"
        ? "arriva una richiesta"
        : "un utente invia il modulo";
  const recipientLabel =
    automation.recipient_type === "member"
      ? "al socio collegato"
      : automation.recipient_type === "admin"
        ? "alla segreteria"
        : automation.recipient_type === "custom"
          ? "al numero manuale"
          : "al contatto che compila il form";
  const phoneLabel =
    automation.phone_source === "member_phone"
      ? "usando il telefono già salvato in anagrafica"
      : automation.phone_source === "custom"
        ? `usando il numero ${automation.custom_phone || "manuale"}`
        : `usando il campo ${automation.phone_field_key || "Telefono"} del modulo`;
  return `Quando ${triggerLabel} per "${formLabel}", ASSONAM invia automaticamente il template "${automation.template_name}" ${recipientLabel}, ${phoneLabel}.`;
}

export function WhatsAppAutomationsHub({ communicationsLocked }: Props) {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<AssociationForm[]>([]);
  const [automations, setAutomations] = useState<OrgAdminWhatsAppAutomation[]>([]);
  const [draft, setDraft] = useState(emptyAutomationDraft());
  const selectedForm = useMemo(
    () => forms.find((form) => form.id === draft.form_id) ?? null,
    [forms, draft.form_id],
  );
  const phoneFieldOptions = useMemo(
    () => (selectedForm?.fields || []).filter((field) => field.field_type === "phone"),
    [selectedForm],
  );

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
      showToast({ title: "Errore", message: err instanceof Error ? err.message : "Errore caricamento automazioni WhatsApp.", tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const formId = Number(searchParams.get("formId") || 0) || null;
    void loadData(formId);
  }, [searchParams]);

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
  }

  async function saveAutomation() {
    if (!draft.name.trim() || !draft.template_name.trim() || !draft.template_body.trim()) {
      showToast({ title: "Campi mancanti", message: "Nome automazione, nome template e messaggio sono obbligatori.", tone: "error" });
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
      showToast({ title: draft.id ? "Automazione aggiornata" : "Automazione creata", message: "La regola WhatsApp è stata salvata.", tone: "success" });
    } catch (err) {
      showToast({ title: "Errore", message: err instanceof Error ? err.message : "Errore salvataggio automazione WhatsApp.", tone: "error" });
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-36 w-full rounded-[1.75rem]" />
        <Skeleton className="h-80 w-full rounded-[1.75rem]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-6 rounded-[2rem] border border-neutral-200 bg-gradient-to-br from-emerald-50 via-white to-white p-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">WhatsApp</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-neutral-900">Automazioni leggibili, non catene tecniche nascoste.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600">
            Qui la relazione tra form pubblico, trigger, destinatario, sorgente del numero e template WhatsApp viene esposta in modo esplicito. Ogni regola produce una frase naturale leggibile anche dalla segreteria.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.25rem] border border-neutral-200 bg-white px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Regole</p>
            <p className="mt-2 text-xl font-bold text-neutral-900">{automations.length}</p>
          </div>
          <div className="rounded-[1.25rem] border border-neutral-200 bg-white px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Attive</p>
            <p className="mt-2 text-xl font-bold text-neutral-900">{automations.filter((item) => item.is_active).length}</p>
          </div>
          <div className="rounded-[1.25rem] border border-neutral-200 bg-white px-4 py-3 sm:col-span-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Form connessi</p>
            <p className="mt-2 text-xl font-bold text-neutral-900">{new Set(automations.map((item) => item.form_id).filter(Boolean)).size}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
        <section className="space-y-4">
          <div className={cardClass}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Automazioni</p>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">Regole attive e bozze</h3>
                <p className="mt-2 text-sm text-neutral-600">Apri una regola per modificarla oppure crea una nuova configurazione dal builder laterale.</p>
              </div>
              <button className="btn-secondary" type="button" onClick={() => setDraft(emptyAutomationDraft())}>
                Nuova regola
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {automations.length === 0 ? (
                <div className="rounded-[1.4rem] border border-dashed border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-500">
                  Nessuna automazione WhatsApp configurata. Crea la prima regola per collegare in modo esplicito modulo, evento e numero destinatario.
                </div>
              ) : (
                automations.map((automation) => (
                  <button
                    key={automation.id}
                    type="button"
                    onClick={() => hydrateFromAutomation(automation)}
                    className={`w-full rounded-[1.4rem] border p-5 text-left transition ${
                      draft.id === automation.id
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-neutral-200 bg-white hover:border-neutral-300"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-neutral-900">{automation.name}</p>
                        <p className="mt-1 text-xs text-neutral-500">{automation.form?.title || "Origine non collegata"}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${automation.is_active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
                        {automation.is_active ? "Attiva" : "Inattiva"}
                      </span>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-neutral-600">{buildAutomationSummary(automation)}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-6 xl:sticky xl:top-28 xl:self-start">
          <section className={cardClass}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Automation Builder</p>
            <h3 className="mt-2 text-xl font-semibold text-neutral-900">{draft.id ? "Modifica regola" : "Nuova regola"}</h3>
            <div className="mt-5 space-y-4">
              <label className={labelClass}>
                Da quale modulo parte questo messaggio?
                <select className={inputClass} disabled={communicationsLocked} value={draft.form_id ?? ""} onChange={(event) => setDraft((prev) => ({ ...prev, form_id: event.target.value ? Number(event.target.value) : null }))}>
                  <option value="">Seleziona un form pubblico</option>
                  {forms.map((form) => (
                    <option key={form.id} value={form.id}>{form.title}</option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Quando deve essere inviato?
                <select className={inputClass} disabled={communicationsLocked} value={draft.trigger_event} onChange={(event) => setDraft((prev) => ({ ...prev, trigger_event: event.target.value }))}>
                  <option value="form_submitted">Invio del modulo</option>
                  <option value="booking_created">Prenotazione creata</option>
                  <option value="request_received">Richiesta ricevuta</option>
                </select>
              </label>
              <label className={labelClass}>
                A chi deve arrivare?
                <select className={inputClass} disabled={communicationsLocked} value={draft.recipient_type} onChange={(event) => setDraft((prev) => ({ ...prev, recipient_type: event.target.value }))}>
                  <option value="submitter">Al contatto che compila il form</option>
                  <option value="member">Al socio collegato</option>
                  <option value="admin">Alla segreteria</option>
                  <option value="custom">A un numero manuale</option>
                </select>
              </label>
              <label className={labelClass}>
                Quale numero deve usare?
                <select className={inputClass} disabled={communicationsLocked} value={draft.phone_source} onChange={(event) => setDraft((prev) => ({ ...prev, phone_source: event.target.value }))}>
                  <option value="form_field">Numero inserito nel modulo</option>
                  <option value="member_phone">Telefono socio già salvato</option>
                  <option value="custom">Numero manuale</option>
                </select>
              </label>
              {draft.phone_source === "form_field" ? (
                <label className={labelClass}>
                  Campo telefono del modulo
                  <select className={inputClass} disabled={communicationsLocked} value={draft.phone_field_key} onChange={(event) => setDraft((prev) => ({ ...prev, phone_field_key: event.target.value }))}>
                    <option value="">Seleziona un campo telefono</option>
                    {phoneFieldOptions.map((field) => (
                      <option key={field.id} value={field.field_key}>{field.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {draft.phone_source === "custom" ? (
                <label className={labelClass}>
                  Numero manuale (E.164)
                  <input className={inputClass} disabled={communicationsLocked} value={draft.custom_phone} onChange={(event) => setDraft((prev) => ({ ...prev, custom_phone: event.target.value }))} placeholder="+393331234567" />
                </label>
              ) : null}
              <label className={labelClass}>
                Quale template WhatsApp deve usare?
                <input className={inputClass} disabled={communicationsLocked} value={draft.template_name} onChange={(event) => setDraft((prev) => ({ ...prev, template_name: event.target.value }))} placeholder="Conferma prenotazione evento" />
              </label>
              <label className={labelClass}>
                Messaggio template
                <textarea className={`${inputClass} min-h-[140px]`} disabled={communicationsLocked} value={draft.template_body} onChange={(event) => setDraft((prev) => ({ ...prev, template_body: event.target.value }))} placeholder="Ciao {{nome_socio}}, abbiamo ricevuto la tua richiesta..." />
              </label>
              <label className={labelClass}>
                Nome interno regola
                <input className={inputClass} disabled={communicationsLocked} value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="WhatsApp conferma form evento" />
              </label>
              <label className="flex items-center gap-3 text-sm font-medium text-neutral-700">
                <input type="checkbox" className="rounded border-neutral-300 text-brand" checked={draft.is_active} onChange={(event) => setDraft((prev) => ({ ...prev, is_active: event.target.checked }))} />
                Automazione attiva
              </label>
            </div>
            <div className="mt-6 rounded-[1.4rem] border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Riassunto naturale</p>
              <p className="mt-3 text-sm leading-6 text-neutral-700">
                {buildAutomationSummary({
                  form: selectedForm ? { id: selectedForm.id, title: selectedForm.title, public_slug: selectedForm.public_slug, public_path: selectedForm.public_path || "" } : null,
                  trigger_event: draft.trigger_event,
                  recipient_type: draft.recipient_type,
                  phone_source: draft.phone_source,
                  phone_field_key: draft.phone_field_key || null,
                  custom_phone: draft.custom_phone || null,
                  template_name: draft.template_name || "questo template",
                })}
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="btn-primary" type="button" disabled={communicationsLocked} onClick={() => void saveAutomation()}>
                {draft.id ? "Salva automazione" : "Crea automazione"}
              </button>
              <button className="btn-secondary" type="button" onClick={() => setDraft(emptyAutomationDraft())}>
                Reset
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
