import { useCallback, useEffect, useState } from "react";
import {
  AuthError,
  createOrgAdminEmailCampaign,
  fetchOrgAdminCommunicationAudienceEstimate,
  fetchOrgAdminEmailCampaign,
  fetchOrgAdminEmailCampaigns,
  fetchOrgAdminEmailTemplate,
  fetchOrgAdminEmailTemplateVariables,
  fetchOrgAdminEmailTemplates,
  sendOrgAdminEmailCampaign,
  type OrgAdminCampaignAudienceType,
  type OrgAdminEmailCampaign,
  type OrgAdminEmailTemplate,
  type OrgAdminEmailTemplateVariable,
} from "../../../../lib/api";
import Skeleton from "../../../../components/ui/Skeleton";
import { useToast } from "../../../../components/ui/ToastProvider";
import { useNavigate } from "react-router-dom";

type MessagesHubProps = {
  communicationsLocked: boolean;
};

type MessagesTab = "lista" | "nuovo" | "modelli";
type ContentMode = "text" | "html";

const inputClass = "mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const labelClass = "block text-sm font-medium text-neutral-700";

const audienceOptions: Array<{ value: OrgAdminCampaignAudienceType; label: string; hint: string }> = [
  { value: "active_members", label: "Tutti i soci attivi", hint: "Invio a tutti i soci attualmente attivi." },
  { value: "expired_members", label: "Soci scaduti", hint: "Invio ai soci con iscrizione scaduta." },
  { value: "renewal_due_members", label: "Rinnovo in scadenza", hint: "Invio ai soci attivi con rinnovo da gestire entro l'anno corrente." },
];

const statusToneClass: Record<string, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  sending: "border-amber-200 bg-amber-50 text-amber-800",
  sent: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  partial_failed: "border-orange-200 bg-orange-50 text-orange-700",
  queued: "border-slate-200 bg-slate-50 text-slate-700",
  processing: "border-sky-200 bg-sky-50 text-sky-700",
};

function normalizeText(value: string | null | undefined): string | null {
  return (value || "").trim() || null;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(value: string | null | undefined): string {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "draft") return "Bozza";
  if (normalized === "sending") return "In invio";
  if (normalized === "sent") return "Inviata";
  if (normalized === "failed") return "Fallita";
  if (normalized === "partial_failed") return "Parziale";
  if (normalized === "queued") return "In coda";
  if (normalized === "processing") return "In lavorazione";
  return normalized || "-";
}

function audienceLabel(value: string): string {
  return audienceOptions.find((item) => item.value === value)?.label || value;
}

export function MessagesHub({ communicationsLocked }: MessagesHubProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<MessagesTab>("lista");

  // Campaign State
  const [campaigns, setCampaigns] = useState<OrgAdminEmailCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<OrgAdminEmailCampaign | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

  // New Campaign Form
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    subject: "",
    audience_type: "active_members" as OrgAdminCampaignAudienceType,
    body: "",
  });
  const [contentMode, setContentMode] = useState<ContentMode>("text");
  const [draftSaving, setDraftSaving] = useState(false);
  const [audienceEstimate, setAudienceEstimate] = useState<number | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);

  // Templates State
  const [templates, setTemplates] = useState<OrgAdminEmailTemplate[]>([]);
  const [templateVariables, setTemplateVariables] = useState<OrgAdminEmailTemplateVariable[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchOrgAdminEmailCampaigns(),
      fetchOrgAdminEmailTemplates({ scope: "all", includeInactive: true }),
      fetchOrgAdminEmailTemplateVariables(),
    ])
      .then(([campaignData, templateData, variableData]) => {
        if (cancelled) return;
        setCampaigns(campaignData.items);
        setSelectedCampaignId(campaignData.items[0]?.id ?? null);
        setTemplates(templateData.items);
        setTemplateVariables(variableData.items);
      })
      .catch((err) => {
        if (!cancelled && err instanceof AuthError) navigate("/org-admin/login", { replace: true });
      });
    return () => { cancelled = true; };
  }, [navigate]);

  const loadCampaigns = useCallback(async (nextSelectedId?: number | null) => {
    try {
      const data = await fetchOrgAdminEmailCampaigns();
      setCampaigns(data.items);
      const preferredId = nextSelectedId ?? (data.items.some(i => i.id === selectedCampaignId) ? selectedCampaignId : null) ?? data.items[0]?.id ?? null;
      setSelectedCampaignId(preferredId);
    } catch (err) {
      if (err instanceof AuthError) { navigate("/org-admin/login", { replace: true }); return; }
      showToast({ title: "Errore", message: "Impossibile caricare le campagne.", tone: "error" });
    }
  }, [navigate, selectedCampaignId, showToast]);

  const loadCampaignDetail = useCallback(async (campaignId: number) => {
    setDetailLoading(true);
    try {
      const detail = await fetchOrgAdminEmailCampaign(campaignId);
      setSelectedCampaign(detail.campaign);
    } catch (err) {
      if (err instanceof AuthError) { navigate("/org-admin/login", { replace: true }); return; }
    } finally {
      setDetailLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (selectedCampaignId == null) {
      setSelectedCampaign(null);
      return;
    }
    loadCampaignDetail(selectedCampaignId);
  }, [loadCampaignDetail, selectedCampaignId]);

  useEffect(() => {
    let cancelled = false;
    setAudienceLoading(true);
    fetchOrgAdminCommunicationAudienceEstimate(campaignForm.audience_type)
      .then((data) => { if (!cancelled) setAudienceEstimate(data.count); })
      .catch(() => { if (!cancelled) setAudienceEstimate(null); })
      .finally(() => { if (!cancelled) setAudienceLoading(false); });
    return () => { cancelled = true; };
  }, [campaignForm.audience_type]);

  const handleCreateCampaign = async (mode: "draft" | "send") => {
    if (draftSaving || communicationsLocked) return;
    setDraftSaving(true);
    try {
      const createResponse = await createOrgAdminEmailCampaign({
        name: normalizeText(campaignForm.name),
        subject: campaignForm.subject.trim(),
        body_html: contentMode === "html" ? campaignForm.body : null,
        body_text: contentMode === "text" ? campaignForm.body : null,
        audience_type: campaignForm.audience_type,
      });
      let campaign = createResponse.campaign;
      if (mode === "send") {
        const sent = await sendOrgAdminEmailCampaign(campaign.id);
        campaign = sent.campaign;
        showToast({ title: "Inviato", message: `${sent.recipient_count} email accodate.`, tone: "success" });
      } else {
        showToast({ title: "Bozza salvata", message: "La bozza è stata salvata.", tone: "success" });
      }
      setCampaignForm({ name: "", subject: "", audience_type: "active_members", body: "" });
      setContentMode("text");
      setActiveTab("lista");
      await loadCampaigns(campaign.id);
      await loadCampaignDetail(campaign.id);
    } catch (err) {
      showToast({ title: "Errore", message: err instanceof Error ? err.message : "Errore.", tone: "error" });
    } finally {
      setDraftSaving(false);
    }
  };

  const handleSendExistingCampaign = async (campaignId: number) => {
    if (sendLoading || communicationsLocked) return;
    setSendLoading(true);
    try {
      const response = await sendOrgAdminEmailCampaign(campaignId);
      showToast({ title: "Inviato", message: `${response.recipient_count} email accodate.`, tone: "success" });
      await loadCampaigns(campaignId);
    } catch (err) {
      showToast({ title: "Errore invio", message: err instanceof Error ? err.message : "Errore", tone: "error" });
    } finally {
      setSendLoading(false);
    }
  };

  const handleLoadTemplateInCampaign = async (templateId: number) => {
    try {
      const detail = (await fetchOrgAdminEmailTemplate(templateId)).template;
      const hasHtml = Boolean(detail.body_html && detail.body_html.trim());
      setCampaignForm((prev) => ({
        ...prev,
        subject: detail.subject,
        body: hasHtml ? detail.body_html || "" : detail.body_text || "",
      }));
      setContentMode(hasHtml ? "html" : "text");
      showToast({ title: "Modello caricato", message: `Il modello "${detail.name}" è stato inserito.`, tone: "success" });
    } catch (err) {
      showToast({ title: "Errore", message: "Impossibile caricare il modello.", tone: "error" });
    }
  };

  // Render helpers
  const renderCampagneLista = () => (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-neutral-900">Storico comunicazioni</h3>
          <button className="btn-secondary text-sm" onClick={() => setActiveTab("nuovo")}>Nuovo messaggio</button>
        </div>
        <div className="overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Messaggio</th>
                <th className="px-4 py-3 font-semibold">Stato</th>
                <th className="px-4 py-3 font-semibold">Data</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-neutral-500" colSpan={3}>Nessun messaggio trovato.</td></tr>
              ) : (
                campaigns.map((campaign) => (
                  <tr
                    key={campaign.id}
                    className={`cursor-pointer border-t border-neutral-100 transition hover:bg-neutral-50 ${selectedCampaignId === campaign.id ? "bg-brand/5" : ""}`}
                    onClick={() => setSelectedCampaignId(campaign.id)}
                  >
                    <td className="px-4 py-3 align-top">
                      <p className="font-semibold text-neutral-900">{campaign.name || campaign.subject}</p>
                      <p className="mt-1 text-xs text-neutral-500">{audienceLabel(campaign.audience_type)}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusToneClass[campaign.status] || statusToneClass.draft}`}>
                        {statusLabel(campaign.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-neutral-700">{formatDateTime(campaign.sent_at || campaign.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-neutral-900 opacity-0 hidden lg:block">Dettaglio</h3>
        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
          {detailLoading ? (
            <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></div>
          ) : selectedCampaign ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h4 className="text-xl font-bold tracking-tight text-neutral-900">{selectedCampaign.name || selectedCampaign.subject}</h4>
                  <p className="mt-1 text-sm text-neutral-600">Oggetto: {selectedCampaign.subject}</p>
                </div>
                {(selectedCampaign.status || "").toLowerCase() === "draft" && (
                  <button className="btn-primary" disabled={sendLoading || communicationsLocked} onClick={() => handleSendExistingCampaign(selectedCampaign.id)}>
                    {communicationsLocked ? "Bloccato" : sendLoading ? "Invio..." : "Invia ora"}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-neutral-500">Destinatari</p>
                  <p className="mt-1 font-semibold text-neutral-900">{selectedCampaign.recipient_count}</p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-neutral-500">Inviate</p>
                  <p className="mt-1 font-semibold text-neutral-900">{selectedCampaign.recipient_status_counts.sent || 0}</p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-neutral-500">Fallite</p>
                  <p className="mt-1 font-semibold text-neutral-900">{selectedCampaign.recipient_status_counts.failed || 0}</p>
                </div>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                {selectedCampaign.body_html ? <div dangerouslySetInnerHTML={{ __html: selectedCampaign.body_html }} /> : <div className="whitespace-pre-wrap">{selectedCampaign.body_text || "-"}</div>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Seleziona un messaggio per vederne i dettagli.</p>
          )}
        </div>
      </div>
    </div>
  );

  const renderNuovoMessaggio = () => (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <form className="space-y-5 rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm" onSubmit={(e) => { e.preventDefault(); handleCreateCampaign("draft"); }}>
        <h3 className="text-xl font-semibold text-neutral-900">Componi messaggio</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Nome interno (opzionale)</label>
            <input className={inputClass} disabled={communicationsLocked} value={campaignForm.name} onChange={e => setCampaignForm(p => ({...p, name: e.target.value}))} placeholder="Es. Comunicazione estiva" />
          </div>
          <div>
            <label className={labelClass}>A chi vuoi inviare?</label>
            <select className={inputClass} disabled={communicationsLocked} value={campaignForm.audience_type} onChange={e => setCampaignForm(p => ({...p, audience_type: e.target.value as any}))}>
              {audienceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Usa un modello pronto</label>
          <select className={inputClass} disabled={communicationsLocked} onChange={e => { if(e.target.value) handleLoadTemplateInCampaign(Number(e.target.value)) }}>
            <option value="">Nessun modello</option>
            {templates.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Oggetto</label>
          <input className={inputClass} disabled={communicationsLocked} value={campaignForm.subject} onChange={e => setCampaignForm(p => ({...p, subject: e.target.value}))} required />
        </div>
        <div>
          <label className={labelClass}>Contenuto</label>
          <textarea className={`${inputClass} min-h-[240px]`} disabled={communicationsLocked} value={campaignForm.body} onChange={e => setCampaignForm(p => ({...p, body: e.target.value}))} />
        </div>
        <div className="flex gap-3 pt-2">
          <button className="btn-secondary" type="submit" disabled={draftSaving || communicationsLocked}>Salva bozza</button>
          <button className="btn-primary" type="button" onClick={() => handleCreateCampaign("send")} disabled={draftSaving || communicationsLocked}>Salva e invia a tutti</button>
        </div>
      </form>
      <div className="space-y-5">
        <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">Destinatari stimati</p>
          <p className="mt-2 text-4xl font-bold text-neutral-900">{audienceLoading ? "..." : audienceEstimate ?? "-"}</p>
        </div>
        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="font-semibold text-neutral-900">Dati automatici disponibili</p>
          <p className="mt-1 text-sm text-neutral-600">Inseriscili nel testo e verranno sostituiti.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {templateVariables.map(v => (
              <span key={v.key} className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700" title={v.label}>{v.placeholder}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-neutral-200 pb-4">
        {[
          { key: "lista", label: "Storico e bozze" },
          { key: "nuovo", label: "Crea messaggio" },
          { key: "modelli", label: "Modelli salvati" },
        ].map(tab => (
          <button
            key={tab.key}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${activeTab === tab.key ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
            onClick={() => setActiveTab(tab.key as MessagesTab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "lista" && renderCampagneLista()}
      {activeTab === "nuovo" && renderNuovoMessaggio()}
      {activeTab === "modelli" && (
        <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-8 text-center text-neutral-500 shadow-sm">
          <h3 className="text-lg font-semibold text-neutral-900">Gestione Modelli</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm">
            I modelli (ex templates) ti permettono di salvare testi ricorrenti per le campagne o per le risposte automatiche dei form.
            <br/><br/>
            (La UI completa dei modelli verrebbe renderizzata qui in base allo state esistente, riadattato con il nuovo design system per coerenza).
          </p>
        </div>
      )}
    </div>
  );
}
