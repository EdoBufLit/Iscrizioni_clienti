import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  archiveOrgAdminEmailTemplate,
  AuthError,
  createOrgAdminEmailCampaign,
  createOrgAdminEmailTemplate,
  duplicateOrgAdminEmailTemplate,
  fetchOrgAdminCommunicationAudienceEstimate,
  fetchOrgAdminEmailCampaign,
  fetchOrgAdminEmailCampaigns,
  fetchOrgAdminEmailTemplate,
  fetchOrgAdminEmailTemplateVariables,
  fetchOrgAdminEmailTemplates,
  fetchOrgAdminForms,
  searchOrgAdminCommunicationMembers,
  sendOrgAdminEmailCampaign,
  updateOrgAdminEmailTemplate,
  type AssociationForm,
  type OrgAdminCampaignAudienceType,
  type OrgAdminCampaignRecipientMode,
  type OrgAdminEmailCampaign,
  type OrgAdminEmailDesign,
  type OrgAdminEmailTemplate,
  type OrgAdminEmailTemplateVariable,
  type OrgAdminMember,
} from "../../../../lib/api";
import Skeleton from "../../../../components/ui/Skeleton";
import { useToast } from "../../../../components/ui/ToastProvider";

type MessagesHubProps = { communicationsLocked: boolean };
type Tab = "lista" | "nuovo" | "modelli";
type Mode = "text" | "html";

type CampaignFormState = {
  name: string;
  subject: string;
  body: string;
  audience_type: OrgAdminCampaignAudienceType;
  recipient_mode: OrgAdminCampaignRecipientMode;
  scheduled_at: string;
  linked_form_id: number | null;
  design: OrgAdminEmailDesign;
};

type TemplateFormState = {
  id: number | null;
  name: string;
  category: string;
  subject: string;
  body: string;
  linked_form_id: number | null;
  is_active: boolean;
  is_system: boolean;
  design: OrgAdminEmailDesign;
};

const inputClass =
  "mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const labelClass = "block text-sm font-medium text-neutral-700";
const panelClass = "rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm";
const mutedPanelClass = "rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4";

const defaultDesign: OrgAdminEmailDesign = {
  accent_color: "#0f766e",
  logo_url: "",
  hero_image_url: "",
  cta_label: "",
  cta_note: "",
  show_association_name: true,
};

const audienceOptions: Array<{ value: OrgAdminCampaignAudienceType; label: string; description: string }> = [
  { value: "active_members", label: "Tutti i soci attivi", description: "Invia il messaggio all'intera base attiva dell'associazione." },
  { value: "expired_members", label: "Soci scaduti", description: "Raggiunge i soci che devono rinnovare o riattivarsi." },
  { value: "renewal_due_members", label: "Rinnovo in scadenza", description: "Filtra solo chi ha il rinnovo vicino alla scadenza." },
];

const tabOptions: Array<{ key: Tab; label: string; hint: string }> = [
  { key: "lista", label: "Storico e bozze", hint: "Controlla invii, bozze e campagne programmate." },
  { key: "nuovo", label: "Crea messaggio", hint: "Componi un invio nuovo, subito o pianificato." },
  { key: "modelli", label: "Modelli salvati", hint: "Riusa strutture e grafiche gia pronte." },
];

function createEmptyCampaignForm(): CampaignFormState {
  return {
    name: "",
    subject: "",
    body: "",
    audience_type: "active_members",
    recipient_mode: "all_members",
    scheduled_at: "",
    linked_form_id: null,
    design: { ...defaultDesign },
  };
}

function createEmptyTemplateForm(): TemplateFormState {
  return {
    id: null,
    name: "",
    category: "custom",
    subject: "",
    body: "",
    linked_form_id: null,
    is_active: true,
    is_system: false,
    design: { ...defaultDesign },
  };
}

function statusLabel(value: string | null | undefined): string {
  return ({ draft: "Bozza", scheduled: "Programmato", sending: "In invio", sent: "Inviata", failed: "Fallita", partial_failed: "Parziale" } as Record<string, string>)[String(value || "").toLowerCase()] || String(value || "-");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

function ModeSwitch(props: { value: Mode; onChange: (next: Mode) => void }) {
  const { value, onChange } = props;
  return (
    <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 p-1">
      {(["text", "html"] as Mode[]).map((mode) => (
        <button key={mode} type="button" className={`rounded-full px-3 py-1 text-xs font-semibold transition ${value === mode ? "bg-neutral-900 text-white" : "text-neutral-600"}`} onClick={() => onChange(mode)}>
          {mode === "text" ? "Testo" : "HTML"}
        </button>
      ))}
    </div>
  );
}

function TabButton(props: { active: boolean; label: string; hint: string; onClick: () => void }) {
  const { active, label, hint, onClick } = props;
  return (
    <button type="button" className={`rounded-[1.35rem] border px-4 py-3 text-left transition ${active ? "border-brand bg-brand text-white shadow-sm" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"}`} onClick={onClick}>
      <p className="text-sm font-semibold">{label}</p>
      <p className={`mt-1 text-xs ${active ? "text-white/80" : "text-neutral-500"}`}>{hint}</p>
    </button>
  );
}

function StatCard(props: { label: string; value: string | number; hint: string }) {
  const { label, value, hint } = props;
  return (
    <div className={mutedPanelClass}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-neutral-900">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{hint}</p>
    </div>
  );
}

function VariableCloud(props: { variables: OrgAdminEmailTemplateVariable[]; inverted?: boolean }) {
  const pillClass = props.inverted ? "rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-700" : "rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700";
  return <div className="flex flex-wrap gap-2">{props.variables.map((variable) => <span key={variable.key} className={pillClass}>{variable.placeholder}</span>)}</div>;
}

function DesignFields(props: { value: OrgAdminEmailDesign; onChange: (next: OrgAdminEmailDesign) => void; disabled?: boolean }) {
  const { value, onChange, disabled = false } = props;
  const setValue = <K extends keyof OrgAdminEmailDesign,>(key: K, next: OrgAdminEmailDesign[K]) => onChange({ ...value, [key]: next });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className={labelClass}>Colore accent<input className={`${inputClass} h-12 p-2`} type="color" disabled={disabled} value={value.accent_color} onChange={(event) => setValue("accent_color", event.target.value)} /></label>
      <label className={labelClass}>Etichetta CTA<input className={inputClass} disabled={disabled} value={value.cta_label} onChange={(event) => setValue("cta_label", event.target.value)} placeholder="Es. Clicca qui per compilare" /></label>
      <label className={labelClass}>URL logo<input className={inputClass} disabled={disabled} value={value.logo_url} onChange={(event) => setValue("logo_url", event.target.value)} placeholder="https://..." /></label>
      <label className={labelClass}>URL sfondo<input className={inputClass} disabled={disabled} value={value.hero_image_url} onChange={(event) => setValue("hero_image_url", event.target.value)} placeholder="https://..." /></label>
      <label className={`${labelClass} md:col-span-2`}>Nota CTA<input className={inputClass} disabled={disabled} value={value.cta_note} onChange={(event) => setValue("cta_note", event.target.value)} placeholder="Es. Compila il form in pochi secondi." /></label>
      <label className="flex items-center gap-2 text-sm text-neutral-700 md:col-span-2"><input type="checkbox" className="rounded border-neutral-300 text-brand" checked={value.show_association_name} disabled={disabled} onChange={(event) => setValue("show_association_name", event.target.checked)} />Mostra il nome associazione</label>
    </div>
  );
}

export function MessagesHub({ communicationsLocked }: MessagesHubProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("lista");
  const [campaigns, setCampaigns] = useState<OrgAdminEmailCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<OrgAdminEmailCampaign | null>(null);
  const [templates, setTemplates] = useState<OrgAdminEmailTemplate[]>([]);
  const [variables, setVariables] = useState<OrgAdminEmailTemplateVariable[]>([]);
  const [forms, setForms] = useState<AssociationForm[]>([]);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sendingExisting, setSendingExisting] = useState(false);
  const [composerMode, setComposerMode] = useState<Mode>("text");
  const [templateMode, setTemplateMode] = useState<Mode>("text");
  const [selectedMembers, setSelectedMembers] = useState<OrgAdminMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<OrgAdminMember[]>([]);
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(createEmptyCampaignForm);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(createEmptyTemplateForm);

  const activeForms = useMemo(() => forms.filter((form) => form.is_active), [forms]);
  const activeTemplates = useMemo(() => templates.filter((template) => template.is_active), [templates]);
  const selectedLinkedForm = useMemo(() => activeForms.find((form) => form.id === campaignForm.linked_form_id) ?? null, [activeForms, campaignForm.linked_form_id]);
  const selectedTemplateLinkedForm = useMemo(() => activeForms.find((form) => form.id === templateForm.linked_form_id) ?? null, [activeForms, templateForm.linked_form_id]);
  const audienceLabel = useMemo(() => audienceOptions.find((option) => option.value === campaignForm.audience_type)?.label || "Tutti i soci attivi", [campaignForm.audience_type]);

  function handleLoadError(err: unknown, fallback: string) {
    if (err instanceof AuthError) {
      navigate("/org-admin/login", { replace: true });
      return;
    }
    showToast({ title: "Errore", message: err instanceof Error ? err.message : fallback, tone: "error" });
  }

  function applyTemplateToEditor(template: OrgAdminEmailTemplate) {
    setTemplateForm({
      id: template.id,
      name: template.name,
      category: template.category || "custom",
      subject: template.subject,
      body: template.body_html || template.body_text || "",
      linked_form_id: template.linked_form_id,
      is_active: template.is_active,
      is_system: template.is_system,
      design: { ...defaultDesign, ...template.design },
    });
    setTemplateMode(template.body_html && template.body_html.trim() ? "html" : "text");
  }

  async function loadAll() {
    const [campaignData, templateData, variableData, formData] = await Promise.all([
      fetchOrgAdminEmailCampaigns(),
      fetchOrgAdminEmailTemplates({ scope: "all", includeInactive: true }),
      fetchOrgAdminEmailTemplateVariables(),
      fetchOrgAdminForms(),
    ]);
    setCampaigns(campaignData.items);
    setSelectedCampaignId(campaignData.items[0]?.id ?? null);
    setTemplates(templateData.items);
    setVariables(variableData.items);
    setForms(formData.items);
  }

  useEffect(() => {
    loadAll().catch((err) => handleLoadError(err, "Impossibile caricare la sezione Messaggi."));
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) {
      setSelectedCampaign(null);
      return;
    }
    setDetailLoading(true);
    fetchOrgAdminEmailCampaign(selectedCampaignId)
      .then(({ campaign }) => setSelectedCampaign(campaign))
      .catch((err) => handleLoadError(err, "Impossibile caricare il dettaglio del messaggio."))
      .finally(() => setDetailLoading(false));
  }, [selectedCampaignId]);

  useEffect(() => {
    if (campaignForm.recipient_mode === "selected_members") {
      setEstimate(selectedMembers.length);
      return;
    }
    fetchOrgAdminCommunicationAudienceEstimate(campaignForm.audience_type).then((data) => setEstimate(data.count)).catch(() => setEstimate(null));
  }, [campaignForm.audience_type, campaignForm.recipient_mode, selectedMembers.length]);

  useEffect(() => {
    const query = memberSearch.trim();
    if (campaignForm.recipient_mode !== "selected_members" || !query) {
      setMemberResults([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      searchOrgAdminCommunicationMembers({ q: query, limit: 12 }).then((data) => setMemberResults(data.items)).catch(() => setMemberResults([]));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [campaignForm.recipient_mode, memberSearch]);

  async function refreshCampaigns(nextId?: number | null) {
    const data = await fetchOrgAdminEmailCampaigns();
    setCampaigns(data.items);
    setSelectedCampaignId(nextId ?? data.items[0]?.id ?? null);
  }

  async function refreshTemplates(nextId?: number | null) {
    const data = await fetchOrgAdminEmailTemplates({ scope: "all", includeInactive: true });
    setTemplates(data.items);
    if (!nextId) return;
    const { template } = await fetchOrgAdminEmailTemplate(nextId);
    applyTemplateToEditor(template);
  }

  async function handleLoadTemplateIntoComposer(templateId: number) {
    try {
      const { template } = await fetchOrgAdminEmailTemplate(templateId);
      setCampaignForm((prev) => ({
        ...prev,
        subject: template.subject,
        body: template.body_html || template.body_text || "",
        linked_form_id: template.linked_form_id,
        design: { ...defaultDesign, ...template.design },
      }));
      setComposerMode(template.body_html && template.body_html.trim() ? "html" : "text");
      showToast({ title: "Modello caricato", message: "Oggetto, contenuto e grafica sono stati copiati nel composer.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Impossibile caricare il modello selezionato.");
    }
  }

  async function saveCampaign(sendNow: boolean, schedule: boolean) {
    if (campaignForm.recipient_mode === "selected_members" && !selectedMembers.length) {
      showToast({ title: "Destinatari mancanti", message: "Seleziona almeno un socio.", tone: "error" });
      return;
    }
    if (schedule && !campaignForm.scheduled_at) {
      showToast({ title: "Programmazione mancante", message: "Scegli data e ora.", tone: "error" });
      return;
    }
    try {
      let campaign = (await createOrgAdminEmailCampaign({
        name: campaignForm.name.trim() || null,
        subject: campaignForm.subject,
        body_html: composerMode === "html" ? campaignForm.body : null,
        body_text: composerMode === "text" ? campaignForm.body : null,
        audience_type: campaignForm.audience_type,
        recipient_mode: campaignForm.recipient_mode,
        member_ids: campaignForm.recipient_mode === "selected_members" ? selectedMembers.map((member) => member.id) : [],
        scheduled_at: schedule ? campaignForm.scheduled_at : null,
        linked_form_id: campaignForm.linked_form_id,
        design: campaignForm.design,
      })).campaign;
      if (sendNow) {
        campaign = (await sendOrgAdminEmailCampaign(campaign.id)).campaign;
      }
      setCampaignForm(createEmptyCampaignForm());
      setSelectedMembers([]);
      setMemberSearch("");
      setTab("lista");
      await refreshCampaigns(campaign.id);
      showToast({ title: sendNow ? "Messaggio inviato" : schedule ? "Messaggio programmato" : "Bozza salvata", message: "Operazione completata.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Errore durante il salvataggio della campagna.");
    }
  }

  async function saveTemplate() {
    if (!templateForm.name.trim() || !templateForm.subject.trim() || !templateForm.body.trim()) {
      showToast({ title: "Dati incompleti", message: "Nome, oggetto e contenuto sono obbligatori.", tone: "error" });
      return;
    }
    try {
      const payload = {
        name: templateForm.name.trim(),
        category: templateForm.category.trim() || null,
        subject: templateForm.subject.trim(),
        body_html: templateMode === "html" ? templateForm.body : null,
        body_text: templateMode === "text" ? templateForm.body : null,
        linked_form_id: templateForm.linked_form_id,
        design: templateForm.design,
        is_active: templateForm.is_active,
      };
      const result = templateForm.id ? await updateOrgAdminEmailTemplate(templateForm.id, payload) : await createOrgAdminEmailTemplate(payload);
      await refreshTemplates(result.template.id);
      showToast({ title: templateForm.id ? "Modello aggiornato" : "Modello creato", message: "Il modello e disponibile nel composer.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Errore durante il salvataggio del modello.");
    }
  }

  async function handleSendExisting(campaignId: number) {
    if (sendingExisting) return;
    setSendingExisting(true);
    try {
      await sendOrgAdminEmailCampaign(campaignId);
      await refreshCampaigns(campaignId);
      showToast({ title: "Messaggio inviato", message: "Campagna accodata correttamente.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Errore durante l'invio della campagna.");
    } finally {
      setSendingExisting(false);
    }
  }

  async function handleSelectTemplate(templateId: number) {
    try {
      const { template } = await fetchOrgAdminEmailTemplate(templateId);
      applyTemplateToEditor(template);
    } catch (err) {
      handleLoadError(err, "Impossibile aprire il modello selezionato.");
    }
  }

  async function handleDuplicateTemplate() {
    if (templateForm.id == null) return;
    try {
      const result = await duplicateOrgAdminEmailTemplate(templateForm.id, `${templateForm.name} (copia)`);
      await refreshTemplates(result.template.id);
      showToast({ title: "Modello duplicato", message: "La copia e pronta per essere personalizzata.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Impossibile duplicare il modello.");
    }
  }

  async function handleArchiveTemplate() {
    if (templateForm.id == null || templateForm.is_system) return;
    try {
      await archiveOrgAdminEmailTemplate(templateForm.id);
      setTemplateForm(createEmptyTemplateForm());
      await refreshTemplates();
      showToast({ title: "Modello archiviato", message: "Il modello non verra piu proposto nel composer.", tone: "success" });
    } catch (err) {
      handleLoadError(err, "Impossibile archiviare il modello.");
    }
  }

  function addSelectedMember(member: OrgAdminMember) {
    setSelectedMembers((prev) => (prev.some((item) => item.id === member.id) ? prev : [...prev, member]));
  }

  function removeSelectedMember(memberId: number) {
    setSelectedMembers((prev) => prev.filter((member) => member.id !== memberId));
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-[2rem] border border-neutral-200 bg-gradient-to-br from-brand/10 via-white to-white p-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand">Comunicazioni</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-neutral-900">Messaggi, modelli e campagne collegate ai tuoi form</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">Gestisci invii immediati o programmati, salva modelli riusabili, collega i form pubblici e cura la grafica del messaggio senza uscire dallo stesso workspace.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Campagne" value={campaigns.length} hint="Storico completo di bozze, programmate e inviate." />
          <StatCard label="Modelli" value={templates.length} hint="Template di sistema e modelli personalizzati." />
          <StatCard label="Form attivi" value={activeForms.length} hint="Form disponibili da collegare ai messaggi." />
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        {tabOptions.map((option) => <TabButton key={option.key} active={tab === option.key} label={option.label} hint={option.hint} onClick={() => setTab(option.key)} />)}
      </div>

      {tab === "lista" && (
        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <section className={`${panelClass} overflow-hidden p-0`}>
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold text-neutral-900">Storico campagne</h3>
                <p className="mt-1 text-sm text-neutral-500">Apri bozze e invii gia effettuati.</p>
              </div>
              <button type="button" className="btn-secondary text-sm" onClick={() => setTab("nuovo")}>Nuovo messaggio</button>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-500"><tr><th className="px-4 py-3 font-semibold">Messaggio</th><th className="px-4 py-3 font-semibold">Stato</th><th className="px-4 py-3 font-semibold">Data</th></tr></thead>
              <tbody>
                {campaigns.length === 0 ? <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-neutral-500">Nessun messaggio trovato. Crea la prima bozza per avviare lo storico.</td></tr> : campaigns.map((campaign) => (
                  <tr key={campaign.id} className={`cursor-pointer border-t border-neutral-100 transition hover:bg-neutral-50 ${selectedCampaignId === campaign.id ? "bg-brand/5" : ""}`} onClick={() => setSelectedCampaignId(campaign.id)}>
                    <td className="px-4 py-3"><p className="font-semibold text-neutral-900">{campaign.name || campaign.subject}</p><p className="mt-1 text-xs text-neutral-500">{campaign.target_summary}</p></td>
                    <td className="px-4 py-3"><span className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-700">{statusLabel(campaign.status)}</span></td>
                    <td className="px-4 py-3 text-neutral-700">{formatDateTime(campaign.sent_at || campaign.scheduled_at || campaign.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className={panelClass}>
            {detailLoading ? <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-28 w-full" /><Skeleton className="h-48 w-full" /></div> : selectedCampaign ? (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Dettaglio campagna</p>
                    <h3 className="mt-2 text-xl font-bold tracking-tight text-neutral-900">{selectedCampaign.name || selectedCampaign.subject}</h3>
                    <p className="mt-2 text-sm text-neutral-600">Oggetto: {selectedCampaign.subject}</p>
                  </div>
                  {["draft", "scheduled"].includes((selectedCampaign.status || "").toLowerCase()) && <button type="button" className="btn-primary" disabled={sendingExisting || communicationsLocked} onClick={() => void handleSendExisting(selectedCampaign.id)}>{sendingExisting ? "Invio..." : "Invia ora"}</button>}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <StatCard label="Destinatari" value={selectedCampaign.recipient_count || selectedCampaign.planned_recipient_count} hint={selectedCampaign.target_summary} />
                  <StatCard label="Form collegato" value={selectedCampaign.linked_form?.title || "Nessuno"} hint={selectedCampaign.linked_form ? "La CTA punta a questo form." : "Nessun modulo allegato a questa campagna."} />
                  <StatCard label="Programmazione" value={formatDateTime(selectedCampaign.scheduled_at)} hint="Se vuoto, l'invio e stato gestito manualmente." />
                </div>
                <div className={mutedPanelClass}>
                  <p className="text-sm font-semibold text-neutral-900">Anteprima contenuto</p>
                  <div className="mt-3 text-sm leading-6 text-neutral-700">{selectedCampaign.body_html ? <div dangerouslySetInnerHTML={{ __html: selectedCampaign.body_html }} /> : <div className="whitespace-pre-wrap">{selectedCampaign.body_text || "-"}</div>}</div>
                </div>
              </div>
            ) : <div className="flex min-h-[320px] items-center justify-center rounded-[1.5rem] border border-dashed border-neutral-200 bg-neutral-50 px-6 text-center text-sm text-neutral-500">Seleziona una campagna dall'elenco per vedere contenuto, stato e collegamento al form.</div>}
          </section>
        </div>
      )}

      {tab === "nuovo" && (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <form className={`${panelClass} space-y-5`} onSubmit={(event) => { event.preventDefault(); void saveCampaign(false, false); }}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Composer</p>
                <h3 className="mt-2 text-xl font-semibold text-neutral-900">Crea un messaggio nuovo</h3>
                <p className="mt-2 text-sm text-neutral-500">Scegli destinatari, collega un form e definisci se inviare subito o a una data specifica.</p>
              </div>
              <ModeSwitch value={composerMode} onChange={setComposerMode} />
            </div>

            <section className="grid gap-4 md:grid-cols-2">
              <label className={labelClass}>Nome interno<input className={inputClass} value={campaignForm.name} onChange={(event) => setCampaignForm((prev) => ({ ...prev, name: event.target.value }))} /></label>
              <label className={labelClass}>Programma invio<input type="datetime-local" className={inputClass} value={campaignForm.scheduled_at} onChange={(event) => setCampaignForm((prev) => ({ ...prev, scheduled_at: event.target.value }))} /></label>
            </section>

            <section className={mutedPanelClass}>
              <p className="text-sm font-semibold text-neutral-900">Destinatari</p>
              <p className="mt-1 text-sm text-neutral-500">Decidi se lavorare su tutta la base soci o su una selezione manuale.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {(["all_members", "selected_members"] as OrgAdminCampaignRecipientMode[]).map((mode) => (
                  <button key={mode} type="button" className={`rounded-2xl border px-4 py-3 text-left transition ${campaignForm.recipient_mode === mode ? "border-brand bg-brand/5 text-brand" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"}`} onClick={() => setCampaignForm((prev) => ({ ...prev, recipient_mode: mode }))}>
                    <p className="text-sm font-semibold">{mode === "selected_members" ? "Soci selezionati" : "Tutti i soci"}</p>
                    <p className="mt-1 text-xs">{mode === "selected_members" ? "Ricerca e aggiungi manualmente uno o piu soci." : "Usa il segmento definito qui sotto."}</p>
                  </button>
                ))}
              </div>

              {campaignForm.recipient_mode === "all_members" ? (
                <label className={`${labelClass} mt-4`}>
                  Segmento soci
                  <select className={inputClass} value={campaignForm.audience_type} onChange={(event) => setCampaignForm((prev) => ({ ...prev, audience_type: event.target.value as OrgAdminCampaignAudienceType }))}>
                    {audienceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <span className="mt-2 block text-xs text-neutral-500">{audienceOptions.find((option) => option.value === campaignForm.audience_type)?.description}</span>
                </label>
              ) : (
                <div className="mt-4 space-y-4 rounded-2xl border border-neutral-200 bg-white p-4">
                  <label className={labelClass}>Cerca soci<input className={inputClass} value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Nome, cognome, email o numero tessera" /></label>
                  <div className="rounded-2xl border border-neutral-200">
                    {memberSearch.trim() && memberResults.length === 0 ? <div className="p-4 text-sm text-neutral-500">Nessun socio trovato.</div> : memberResults.map((member) => (
                      <button key={member.id} type="button" className="flex w-full items-start justify-between gap-4 border-b border-neutral-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-neutral-50" onClick={() => addSelectedMember(member)}>
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">{member.name}</p>
                          <p className="mt-1 text-xs text-neutral-500">{[member.email || "Email non disponibile", member.card_number ? `Tessera ${member.card_number}` : null].filter(Boolean).join(" - ")}</p>
                        </div>
                        <span className="text-xs font-semibold text-brand">Aggiungi</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedMembers.map((member) => (
                      <span key={member.id} className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-700">
                        <span>{member.name}</span>
                        <button type="button" className="text-neutral-400 transition hover:text-neutral-700" onClick={() => removeSelectedMember(member.id)}>x</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <label className={labelClass}>Carica modello<select className={inputClass} onChange={(event) => { const id = Number(event.target.value || 0); if (id > 0) void handleLoadTemplateIntoComposer(id); }}><option value="">Nessun modello</option>{activeTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
              <label className={labelClass}>Form collegato<select className={inputClass} value={campaignForm.linked_form_id ?? ""} onChange={(event) => setCampaignForm((prev) => ({ ...prev, linked_form_id: event.target.value ? Number(event.target.value) : null }))}><option value="">Nessun form collegato</option>{activeForms.map((form) => <option key={form.id} value={form.id}>{form.title}</option>)}</select></label>
            </section>

            <label className={labelClass}>Oggetto<input className={inputClass} value={campaignForm.subject} onChange={(event) => setCampaignForm((prev) => ({ ...prev, subject: event.target.value }))} /></label>
            <label className={labelClass}>Contenuto<textarea className={`${inputClass} min-h-[220px]`} value={campaignForm.body} onChange={(event) => setCampaignForm((prev) => ({ ...prev, body: event.target.value }))} /></label>

            <section className={mutedPanelClass}>
              <h4 className="text-sm font-semibold text-neutral-900">Estetica messaggio</h4>
              <p className="mt-1 text-sm text-neutral-500">Personalizza logo, sfondo e CTA mantenendo il rendering email condiviso.</p>
              <div className="mt-4"><DesignFields value={campaignForm.design} onChange={(next) => setCampaignForm((prev) => ({ ...prev, design: next }))} /></div>
            </section>

            <div className="flex flex-wrap gap-3 pt-2">
              <button className="btn-secondary" type="submit">Salva bozza</button>
              <button className="btn-secondary" type="button" onClick={() => void saveCampaign(false, true)}>Programma invio</button>
              <button className="btn-primary" type="button" disabled={communicationsLocked} onClick={() => void saveCampaign(true, false)}>Invia ora</button>
            </div>
          </form>

          <aside className="space-y-5">
            <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">Destinatari stimati</p>
              <p className="mt-2 text-4xl font-bold text-neutral-900">{estimate ?? "-"}</p>
              <p className="mt-2 text-sm text-neutral-500">{campaignForm.recipient_mode === "selected_members" ? `${selectedMembers.length} soci selezionati` : audienceLabel}</p>
            </div>
            <div className={panelClass}>
              <p className="text-sm font-semibold text-neutral-900">Form collegato</p>
              <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                {selectedLinkedForm ? <>
                  <p className="font-semibold text-neutral-900">{selectedLinkedForm.title}</p>
                  <p className="mt-2 text-sm text-neutral-500">La CTA del messaggio aprira questo modulo pubblico.</p>
                </> : <p className="text-sm text-neutral-500">Nessun form collegato. Selezionane uno per inserire un invito esplicito nel messaggio.</p>}
              </div>
            </div>
            <div className={panelClass}>
              <p className="font-semibold text-neutral-900">Variabili automatiche</p>
              <p className="mt-2 text-sm text-neutral-500">Restano disponibili anche per invii singoli o selezionati.</p>
              <div className="mt-4"><VariableCloud variables={variables} /></div>
            </div>
          </aside>
        </div>
      )}

      {tab === "modelli" && (
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-neutral-900">Modelli salvati</h3>
                <p className="mt-1 text-sm text-neutral-500">Costruisci una libreria riusabile per comunicazioni ricorrenti.</p>
              </div>
              <button type="button" className="btn-secondary text-sm" onClick={() => setTemplateForm(createEmptyTemplateForm())}>Crea un nuovo modello</button>
            </div>
            <div className={`${panelClass} p-0`}>
              {templates.length === 0 ? <div className="p-10 text-center"><p className="text-sm font-semibold text-neutral-900">Nessun modello creato</p><p className="mt-2 text-sm text-neutral-500">Crea il primo modello per riutilizzare testo, design e form collegati.</p></div> : templates.map((template) => {
                const active = templateForm.id === template.id;
                return (
                  <button key={template.id} type="button" className={`w-full border-b border-neutral-100 px-5 py-4 text-left transition last:border-b-0 hover:bg-neutral-50 ${active ? "bg-brand/5" : ""}`} onClick={() => void handleSelectTemplate(template.id)}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-neutral-900">{template.name}</p>
                        <p className="mt-1 text-xs text-neutral-500">{template.is_system ? "Template di sistema" : "Template associazione"}</p>
                      </div>
                      <span className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-700">{template.is_active ? "Attivo" : "Archiviato"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={`${panelClass} space-y-5`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Editor modello</p>
                <h3 className="mt-2 text-xl font-semibold text-neutral-900">{templateForm.id ? templateForm.name || "Modello" : "Nuovo modello"}</h3>
                <p className="mt-2 text-sm text-neutral-500">Crea strutture riusabili per campagne, reminder o sondaggi post evento.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ModeSwitch value={templateMode} onChange={setTemplateMode} />
                {templateForm.id != null && <button type="button" className="btn-secondary text-sm" onClick={() => void handleDuplicateTemplate()}>Duplica</button>}
                {templateForm.id != null && !templateForm.is_system && <button type="button" className="btn-secondary text-sm" onClick={() => void handleArchiveTemplate()}>Archivia</button>}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className={labelClass}>Nome modello<input className={inputClass} disabled={templateForm.is_system} value={templateForm.name} onChange={(event) => setTemplateForm((prev) => ({ ...prev, name: event.target.value }))} /></label>
              <label className={labelClass}>Categoria<input className={inputClass} disabled={templateForm.is_system} value={templateForm.category} onChange={(event) => setTemplateForm((prev) => ({ ...prev, category: event.target.value }))} /></label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className={labelClass}>Form collegato<select className={inputClass} disabled={templateForm.is_system} value={templateForm.linked_form_id ?? ""} onChange={(event) => setTemplateForm((prev) => ({ ...prev, linked_form_id: event.target.value ? Number(event.target.value) : null }))}><option value="">Nessun form collegato</option>{activeForms.map((form) => <option key={form.id} value={form.id}>{form.title}</option>)}</select></label>
              <label className="flex items-center gap-2 pt-8 text-sm text-neutral-700"><input type="checkbox" className="rounded border-neutral-300 text-brand" disabled={templateForm.is_system} checked={templateForm.is_active} onChange={(event) => setTemplateForm((prev) => ({ ...prev, is_active: event.target.checked }))} />Modello attivo</label>
            </div>
            <label className={labelClass}>Oggetto<input className={inputClass} disabled={templateForm.is_system} value={templateForm.subject} onChange={(event) => setTemplateForm((prev) => ({ ...prev, subject: event.target.value }))} /></label>
            <label className={labelClass}>Contenuto<textarea className={`${inputClass} min-h-[220px]`} disabled={templateForm.is_system} value={templateForm.body} onChange={(event) => setTemplateForm((prev) => ({ ...prev, body: event.target.value }))} /></label>
            <section className={mutedPanelClass}>
              <h4 className="text-sm font-semibold text-neutral-900">Estetica modello</h4>
              <div className="mt-4"><DesignFields value={templateForm.design} onChange={(next) => setTemplateForm((prev) => ({ ...prev, design: next }))} disabled={templateForm.is_system} /></div>
            </section>
            <section className={mutedPanelClass}>
              <p className="text-sm font-semibold text-neutral-900">Variabili disponibili</p>
              <p className="mt-2 text-sm text-neutral-500">Riusa gli stessi placeholder del composer per personalizzare il contenuto per ciascun socio.</p>
              <div className="mt-3"><VariableCloud variables={variables} inverted /></div>
            </section>
            <section className={mutedPanelClass}>
              <p className="text-sm font-semibold text-neutral-900">Form collegato</p>
              <p className="mt-2 text-sm text-neutral-500">{selectedTemplateLinkedForm ? `Il modello puntera al form "${selectedTemplateLinkedForm.title}" quando verra usato in una campagna.` : "Nessun form collegato a questo modello."}</p>
            </section>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-primary" type="button" disabled={templateForm.is_system} onClick={() => void saveTemplate()}>{templateForm.id ? "Salva modello" : "Crea modello"}</button>
              {templateForm.is_system && <p className="text-sm text-neutral-500">Duplica il modello di sistema prima di modificarlo.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
