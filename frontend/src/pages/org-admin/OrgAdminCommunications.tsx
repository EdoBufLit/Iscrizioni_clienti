import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AuthError,
  archiveOrgAdminEmailTemplate,
  createOrgAdminEmailCampaign,
  createOrgAdminEmailTemplate,
  duplicateOrgAdminEmailTemplate,
  fetchOrgAdminCommunicationAudienceEstimate,
  fetchOrgAdminCommunicationSettings,
  fetchOrgAdminEmailCampaign,
  fetchOrgAdminEmailCampaignRecipients,
  fetchOrgAdminEmailCampaigns,
  fetchOrgAdminEmailTemplate,
  fetchOrgAdminEmailTemplateVariables,
  fetchOrgAdminEmailTemplates,
  putOrgAdminCommunicationSettings,
  previewOrgAdminEmailTemplate,
  sendOrgAdminCommunicationTestEmail,
  sendOrgAdminEmailCampaign,
  updateOrgAdminEmailTemplate,
  type OrgAdminCampaignAudienceType,
  type OrgAdminCommunicationSettings,
  type OrgAdminEmailCampaign,
  type OrgAdminEmailCampaignRecipient,
  type OrgAdminEmailTemplate,
  type OrgAdminEmailTemplateVariable,
} from "../../lib/api";
import { applySeo } from "../../lib/seo";
import Skeleton from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/ToastProvider";
import { useOrgAdmin } from "./OrgAdminLayout";
import { OrgAdminFormsWorkspace } from "./OrgAdminForms";

const inputClass =
  "mt-1 w-full rounded-md border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const labelClass = "block text-sm font-medium text-neutral-700";
const COMMUNICATIONS_LOCKED_MESSAGE =
  "Modulo Comunicazioni non attivo. Contatta ASSONAM per abilitarlo.";

type TabKey = "overview" | "campaigns" | "templates" | "forms" | "sending";
type ContentMode = "text" | "html";
type TemplateFilter = "all" | "system" | "custom" | "archived";

const audienceOptions: Array<{
  value: OrgAdminCampaignAudienceType;
  label: string;
  hint: string;
}> = [
  {
    value: "active_members",
    label: "Tutti i soci attivi",
    hint: "Invio a tutti i soci attualmente attivi.",
  },
  {
    value: "expired_members",
    label: "Soci scaduti",
    hint: "Invio ai soci con iscrizione scaduta.",
  },
  {
    value: "renewal_due_members",
    label: "Rinnovo in scadenza",
    hint: "Invio ai soci attivi con rinnovo da gestire entro l'anno corrente.",
  },
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
  const cleaned = (value || "").trim();
  return cleaned || null;
}

function sanitizeEmailLocalPartPreview(value: string | null | undefined): string {
  const normalized = (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const lowered = normalized.toLowerCase().trim();
  const spaced = lowered.replace(/\s+/g, "-");
  const stripped = spaced.replace(/[^a-z0-9-]+/g, "-");
  const collapsed = stripped.replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  return collapsed.slice(0, 48).replace(/^-+|-+$/g, "");
}

function buildAssociationEmailPreview(input: {
  associationId: number | null | undefined;
  associationName: string | null | undefined;
  communicationsEnabled: boolean;
  senderEmailLocalPart: string | null | undefined;
  emailFromNameOverride: string | null | undefined;
  replyToEmail: string | null | undefined;
  mailFromDomain: string | null | undefined;
  systemSender?: OrgAdminCommunicationSettings["system_email_sender"];
}) {
  const systemSender = input.systemSender;
  const systemEmail = systemSender?.from_email || "noreply@assonam.it";
  const systemHeader = systemSender?.from_header || systemEmail;
  const systemName = systemSender?.from_name || null;
  const systemReplyTo = systemSender?.reply_to || null;
  const fromName = normalizeText(input.emailFromNameOverride)
    || normalizeText(input.associationName)
    || "ASSONAM";
  const domain = normalizeText(input.mailFromDomain)?.toLowerCase() || null;
  const configuredLocalPart = sanitizeEmailLocalPartPreview(input.senderEmailLocalPart);
  const generatedLocalPart = sanitizeEmailLocalPartPreview(input.associationName);
  const fallbackLocalPart = sanitizeEmailLocalPartPreview(`org-${input.associationId ?? "x"}`);
  const localPart = configuredLocalPart || generatedLocalPart || fallbackLocalPart;
  const associationAvailable = Boolean(input.communicationsEnabled && domain && localPart);

  if (!associationAvailable) {
    return {
      selectedMode: "system" as const,
      fromName: systemName,
      fromEmail: systemEmail,
      fromHeader: systemHeader,
      replyTo: systemReplyTo,
      fallbackUsed: true,
    };
  }

  const fromEmail = `${localPart}@${domain}`;
  return {
    selectedMode: "association" as const,
    fromName,
    fromEmail,
    fromHeader: `${fromName} <${fromEmail}>`,
    replyTo: normalizeText(input.replyToEmail),
    fallbackUsed: false,
  };
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function audienceLabel(value: string): string {
  return audienceOptions.find((item) => item.value === value)?.label || value;
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

const OrgAdminCommunications = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { admin } = useOrgAdmin();

  const initialTab = (searchParams.get("tab") || "").trim().toLowerCase();
  const isValidTab = (value: string): value is TabKey =>
    value === "overview" || value === "campaigns" || value === "templates" || value === "forms" || value === "sending";
  const [activeTab, setActiveTab] = useState<TabKey>(isValidTab(initialTab) ? initialTab : "overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [settings, setSettings] = useState<OrgAdminCommunicationSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    sender_email_local_part: "",
    email_from_name_override: "",
    reply_to_email: "",
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  const [campaigns, setCampaigns] = useState<OrgAdminEmailCampaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<OrgAdminEmailCampaign | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<OrgAdminEmailCampaignRecipient[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

  const [campaignForm, setCampaignForm] = useState({
    name: "",
    subject: "",
    audience_type: "active_members" as OrgAdminCampaignAudienceType,
    body: "",
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [contentMode, setContentMode] = useState<ContentMode>("text");
  const [draftSaving, setDraftSaving] = useState(false);
  const [audienceEstimate, setAudienceEstimate] = useState<number | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);

  const [templates, setTemplates] = useState<OrgAdminEmailTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>("all");
  const [selectedTemplate, setSelectedTemplate] = useState<OrgAdminEmailTemplate | null>(null);
  const [templateEditor, setTemplateEditor] = useState({
    name: "",
    category: "",
    subject: "",
    body: "",
  });
  const [templateContentMode, setTemplateContentMode] = useState<ContentMode>("text");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templatePreviewLoading, setTemplatePreviewLoading] = useState(false);
  const [templatePreview, setTemplatePreview] = useState<{
    subject: string;
    body_html: string | null;
    body_text: string | null;
  } | null>(null);
  const [templateVariables, setTemplateVariables] = useState<OrgAdminEmailTemplateVariable[]>([]);
  const [templateFakeContext, setTemplateFakeContext] = useState<Record<string, string>>({});

  useEffect(() => {
    applySeo({
      title: "Comunicazioni Associazione",
      description: "Gestione email associazione, campagne e storico invii.",
      noindex: true,
    });
  }, []);

  const loadCampaigns = useCallback(
    async (nextSelectedId?: number | null) => {
      setCampaignsLoading(true);
      try {
        const data = await fetchOrgAdminEmailCampaigns();
        setCampaigns(data.items);
        const preferredId =
          nextSelectedId
          ?? (data.items.some((item) => item.id === selectedCampaignId) ? selectedCampaignId : null)
          ?? data.items[0]?.id
          ?? null;
        setSelectedCampaignId(preferredId);
      } catch (err) {
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
          return;
        }
        showToast({
          title: "Comunicazioni",
          message: err instanceof Error ? err.message : "Errore caricamento campagne.",
          tone: "error",
        });
      } finally {
        setCampaignsLoading(false);
      }
    },
    [navigate, selectedCampaignId, showToast],
  );

  const loadCampaignDetail = useCallback(
    async (campaignId: number) => {
      setDetailLoading(true);
      try {
        const [detail, recipients] = await Promise.all([
          fetchOrgAdminEmailCampaign(campaignId),
          fetchOrgAdminEmailCampaignRecipients(campaignId),
        ]);
        setSelectedCampaign(detail.campaign);
        setSelectedRecipients(recipients.items);
      } catch (err) {
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
          return;
        }
        showToast({
          title: "Storico campagne",
          message: err instanceof Error ? err.message : "Errore caricamento dettaglio campagna.",
          tone: "error",
        });
      } finally {
        setDetailLoading(false);
      }
    },
    [navigate, showToast],
  );

  const syncTemplateEditor = useCallback((template: OrgAdminEmailTemplate | null) => {
    if (!template) {
      setTemplateEditor({
        name: "",
        category: "",
        subject: "",
        body: "",
      });
      setTemplateContentMode("text");
      setTemplatePreview(null);
      return;
    }
    const hasHtml = Boolean(template.body_html && template.body_html.trim());
    setTemplateContentMode(hasHtml ? "html" : "text");
    setTemplateEditor({
      name: template.name || "",
      category: template.category || "",
      subject: template.subject || "",
      body: hasHtml ? template.body_html || "" : template.body_text || "",
    });
  }, []);

  const loadTemplates = useCallback(
    async (nextSelectedId?: number | null) => {
      setTemplatesLoading(true);
      try {
        const [templateData, variableData] = await Promise.all([
          fetchOrgAdminEmailTemplates({ scope: "all", includeInactive: true }),
          fetchOrgAdminEmailTemplateVariables(),
        ]);
        setTemplates(templateData.items);
        setTemplateVariables(variableData.items);
        setTemplateFakeContext(variableData.fake_context);

        const preferredId =
          nextSelectedId
          ?? (templateData.items.some((item) => item.id === selectedTemplate?.id) ? selectedTemplate?.id ?? null : null)
          ?? templateData.items[0]?.id
          ?? null;
        if (preferredId == null) {
          setSelectedTemplate(null);
          syncTemplateEditor(null);
          return;
        }
        const detail = await fetchOrgAdminEmailTemplate(preferredId);
        setSelectedTemplate(detail.template);
        syncTemplateEditor(detail.template);
      } catch (err) {
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
          return;
        }
        showToast({
          title: "Template",
          message: err instanceof Error ? err.message : "Errore caricamento template.",
          tone: "error",
        });
      } finally {
        setTemplatesLoading(false);
      }
    },
    [navigate, selectedTemplate?.id, showToast, syncTemplateEditor],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      fetchOrgAdminCommunicationSettings(),
      fetchOrgAdminEmailCampaigns(),
      fetchOrgAdminEmailTemplates({ scope: "all", includeInactive: true }),
      fetchOrgAdminEmailTemplateVariables(),
    ])
      .then(([settingsData, campaignData, templateData, variableData]) => {
        if (cancelled) return;
        setSettings(settingsData);
        setSettingsForm({
          sender_email_local_part: settingsData.sender_email_local_part || "",
          email_from_name_override: settingsData.email_from_name_override || "",
          reply_to_email: settingsData.reply_to_email || "",
        });
        setCampaigns(campaignData.items);
        setSelectedCampaignId(campaignData.items[0]?.id ?? null);
        setTemplates(templateData.items);
        setTemplateVariables(variableData.items);
        setTemplateFakeContext(variableData.fake_context);
        const firstTemplate = templateData.items[0] ?? null;
        setSelectedTemplate(firstTemplate);
        syncTemplateEditor(firstTemplate);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
        } else {
          setError("Impossibile caricare la sezione comunicazioni.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, syncTemplateEditor]);

  useEffect(() => {
    if (selectedCampaignId == null) {
      setSelectedCampaign(null);
      setSelectedRecipients([]);
      return;
    }
    loadCampaignDetail(selectedCampaignId);
  }, [loadCampaignDetail, selectedCampaignId]);

  useEffect(() => {
    if (!settings) {
      setAudienceEstimate(null);
      setAudienceLoading(false);
      return;
    }
    if (!settings.communications_enabled) {
      setAudienceEstimate(null);
      setAudienceLoading(false);
      return;
    }
    let cancelled = false;
    setAudienceLoading(true);
    fetchOrgAdminCommunicationAudienceEstimate(campaignForm.audience_type)
      .then((data) => {
        if (!cancelled) setAudienceEstimate(data.count);
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof AuthError) {
            navigate("/org-admin/login", { replace: true });
          } else {
            setAudienceEstimate(null);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setAudienceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignForm.audience_type, navigate, settings]);

  useEffect(() => {
    void loadTemplates(selectedTemplate?.id ?? undefined);
  }, [loadTemplates]);

  const preview = useMemo(
    () =>
      buildAssociationEmailPreview({
        associationId: admin?.organization?.id,
        associationName: admin?.organization?.name,
        communicationsEnabled: Boolean(settings?.communications_enabled),
        senderEmailLocalPart: settingsForm.sender_email_local_part,
        emailFromNameOverride: settingsForm.email_from_name_override,
        replyToEmail: settingsForm.reply_to_email,
        mailFromDomain: settings?.mail_from_domain,
        systemSender: settings?.system_email_sender,
      }),
    [admin?.organization?.id, admin?.organization?.name, settings, settingsForm],
  );

  const moduleActive = Boolean(settings?.communications_enabled);
  const communicationsLocked = !moduleActive;
  const filteredTemplates = useMemo(() => {
    if (templateFilter === "system") {
      return templates.filter((item) => item.is_system);
    }
    if (templateFilter === "custom") {
      return templates.filter((item) => !item.is_system && item.is_active);
    }
    if (templateFilter === "archived") {
      return templates.filter((item) => !item.is_active);
    }
    return templates;
  }, [templateFilter, templates]);
  const selectTab = useCallback(
    (tab: TabKey) => {
      setActiveTab(tab);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("tab", tab);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const next = (searchParams.get("tab") || "").trim().toLowerCase();
    if (isValidTab(next) && next !== activeTab) {
      setActiveTab(next);
    }
  }, [activeTab, searchParams]);

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (settingsSaving) return;
    setSettingsSaving(true);
    setSettingsSaved(false);
    try {
      if (communicationsLocked) {
        throw new Error(COMMUNICATIONS_LOCKED_MESSAGE);
      }
      const response = await putOrgAdminCommunicationSettings({
        sender_email_local_part: normalizeText(settingsForm.sender_email_local_part),
        email_from_name_override: normalizeText(settingsForm.email_from_name_override),
        reply_to_email: normalizeText(settingsForm.reply_to_email),
      });
      setSettings(response.settings);
      setSettingsForm({
        sender_email_local_part: response.settings.sender_email_local_part || "",
        email_from_name_override: response.settings.email_from_name_override || "",
        reply_to_email: response.settings.reply_to_email || "",
      });
      setSettingsSaved(true);
      showToast({ title: "Impostazioni", message: "Configurazione salvata.", tone: "success" });
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      showToast({
        title: "Impostazioni",
        message: err instanceof Error ? err.message : "Errore salvataggio impostazioni.",
        tone: "error",
      });
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSendTestEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (testSending) return;
    setTestSending(true);
    try {
      if (communicationsLocked) {
        throw new Error(COMMUNICATIONS_LOCKED_MESSAGE);
      }
      const response = await sendOrgAdminCommunicationTestEmail(testEmail);
      showToast({ title: "Email di test", message: response.message, tone: "success" });
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      showToast({
        title: "Email di test",
        message: err instanceof Error ? err.message : "Errore invio email di test.",
        tone: "error",
      });
    } finally {
      setTestSending(false);
    }
  };

  const handleCreateCampaign = async (mode: "draft" | "send") => {
    if (draftSaving) return;
    setDraftSaving(true);
    try {
      if (communicationsLocked) {
        throw new Error(COMMUNICATIONS_LOCKED_MESSAGE);
      }
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
        showToast({
          title: "Campagna inviata",
          message: `${sent.recipient_count} destinatari accodati.`,
          tone: "success",
        });
      } else {
        showToast({ title: "Campagne", message: "Bozza salvata correttamente.", tone: "success" });
      }

      setCampaignForm({
        name: "",
        subject: "",
        audience_type: "active_members",
        body: "",
      });
      setContentMode("text");
      selectTab("campaigns");
      await loadCampaigns(campaign.id);
      await loadCampaignDetail(campaign.id);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      showToast({
        title: "Campagne",
        message: err instanceof Error ? err.message : "Errore salvataggio campagna.",
        tone: "error",
      });
    } finally {
      setDraftSaving(false);
    }
  };

  const handleSendExistingCampaign = async (campaignId: number) => {
    if (sendLoading) return;
    setSendLoading(true);
    try {
      if (communicationsLocked) {
        throw new Error(COMMUNICATIONS_LOCKED_MESSAGE);
      }
      const response = await sendOrgAdminEmailCampaign(campaignId);
      showToast({
        title: "Storico campagne",
        message: `${response.recipient_count} destinatari accodati.`,
        tone: "success",
      });
      await loadCampaigns(campaignId);
      await loadCampaignDetail(campaignId);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      showToast({
        title: "Storico campagne",
        message: err instanceof Error ? err.message : "Errore invio campagna.",
        tone: "error",
      });
    } finally {
      setSendLoading(false);
    }
  };

  const handleTemplateSelect = async (templateId: number) => {
    setTemplatesLoading(true);
    try {
      const detail = await fetchOrgAdminEmailTemplate(templateId);
      setSelectedTemplate(detail.template);
      syncTemplateEditor(detail.template);
      setTemplatePreview(null);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      showToast({
        title: "Template",
        message: err instanceof Error ? err.message : "Errore caricamento template.",
        tone: "error",
      });
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handlePreviewTemplate = async () => {
    setTemplatePreviewLoading(true);
    try {
      if (communicationsLocked) {
        throw new Error(COMMUNICATIONS_LOCKED_MESSAGE);
      }
      const response = await previewOrgAdminEmailTemplate({
        template_id: selectedTemplate?.id,
        subject: templateEditor.subject,
        body_html: templateContentMode === "html" ? templateEditor.body : null,
        body_text: templateContentMode === "text" ? templateEditor.body : null,
      });
      setTemplatePreview(response.preview);
      setTemplateFakeContext(response.fake_context);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      showToast({
        title: "Template",
        message: err instanceof Error ? err.message : "Errore generazione preview.",
        tone: "error",
      });
    } finally {
      setTemplatePreviewLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (templateSaving) return;
    setTemplateSaving(true);
    try {
      if (communicationsLocked) {
        throw new Error(COMMUNICATIONS_LOCKED_MESSAGE);
      }
      const response = await createOrgAdminEmailTemplate({
        name: templateEditor.name.trim(),
        category: normalizeText(templateEditor.category),
        subject: templateEditor.subject.trim(),
        body_html: templateContentMode === "html" ? templateEditor.body : null,
        body_text: templateContentMode === "text" ? templateEditor.body : null,
        channel: "email",
      });
      setSelectedTemplate(response.template);
      syncTemplateEditor(response.template);
      await loadTemplates(response.template.id);
      showToast({ title: "Template", message: "Template salvato correttamente.", tone: "success" });
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      showToast({
        title: "Template",
        message: err instanceof Error ? err.message : "Errore salvataggio template.",
        tone: "error",
      });
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!selectedTemplate || selectedTemplate.is_system || templateSaving) return;
    setTemplateSaving(true);
    try {
      if (communicationsLocked) {
        throw new Error(COMMUNICATIONS_LOCKED_MESSAGE);
      }
      const response = await updateOrgAdminEmailTemplate(selectedTemplate.id, {
        name: templateEditor.name.trim(),
        category: normalizeText(templateEditor.category),
        subject: templateEditor.subject.trim(),
        body_html: templateContentMode === "html" ? templateEditor.body : null,
        body_text: templateContentMode === "text" ? templateEditor.body : null,
        channel: "email",
        is_active: selectedTemplate.is_active,
      });
      setSelectedTemplate(response.template);
      syncTemplateEditor(response.template);
      await loadTemplates(response.template.id);
      showToast({ title: "Template", message: "Template aggiornato.", tone: "success" });
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      showToast({
        title: "Template",
        message: err instanceof Error ? err.message : "Errore aggiornamento template.",
        tone: "error",
      });
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDuplicateTemplate = async () => {
    if (!selectedTemplate || templateSaving) return;
    setTemplateSaving(true);
    try {
      if (communicationsLocked) {
        throw new Error(COMMUNICATIONS_LOCKED_MESSAGE);
      }
      const response = await duplicateOrgAdminEmailTemplate(selectedTemplate.id);
      setSelectedTemplate(response.template);
      syncTemplateEditor(response.template);
      setTemplateFilter("custom");
      await loadTemplates(response.template.id);
      showToast({ title: "Template", message: "Template duplicato.", tone: "success" });
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      showToast({
        title: "Template",
        message: err instanceof Error ? err.message : "Errore duplicazione template.",
        tone: "error",
      });
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleArchiveTemplate = async () => {
    if (!selectedTemplate || selectedTemplate.is_system || templateSaving) return;
    setTemplateSaving(true);
    try {
      if (communicationsLocked) {
        throw new Error(COMMUNICATIONS_LOCKED_MESSAGE);
      }
      await archiveOrgAdminEmailTemplate(selectedTemplate.id);
      showToast({ title: "Template", message: "Template archiviato.", tone: "success" });
      setSelectedTemplate(null);
      syncTemplateEditor(null);
      await loadTemplates();
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      showToast({
        title: "Template",
        message: err instanceof Error ? err.message : "Errore archiviazione template.",
        tone: "error",
      });
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleUseTemplateInCampaign = async (template: OrgAdminEmailTemplate) => {
    try {
      if (communicationsLocked) {
        throw new Error(COMMUNICATIONS_LOCKED_MESSAGE);
      }
      const detail = template.body_html === undefined && template.body_text === undefined
        ? (await fetchOrgAdminEmailTemplate(template.id)).template
        : template;
      const hasHtml = Boolean(detail.body_html && detail.body_html.trim());
      setSelectedTemplateId(detail.id);
      setCampaignForm((prev) => ({
        ...prev,
        subject: detail.subject,
        body: hasHtml ? detail.body_html || "" : detail.body_text || "",
      }));
      setContentMode(hasHtml ? "html" : "text");
      selectTab("campaigns");
      showToast({
        title: "Campagne",
        message: `Template "${detail.name}" caricato nel composer.`,
        tone: "success",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
        return;
      }
      showToast({
        title: "Campagne",
        message: err instanceof Error ? err.message : "Errore caricamento template nel composer.",
        tone: "error",
      });
    }
  };

  if (loading) {
    return (
      <div className="container-shell py-8 space-y-5">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full rounded-[2rem]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container-shell py-8">
        <div className="surface p-6">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-shell py-8 space-y-6">
      <section className="surface overflow-hidden">
        <div className="border-b border-neutral-200 px-6 py-5 md:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand/80">Comunicazioni</p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">Workflow comunicazioni associazione</h1>
              <p className="mt-2 max-w-2xl text-sm text-neutral-600">
                Campagne, template, form pubblici e impostazioni di invio nello stesso pacchetto operativo.
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
              <p className="font-semibold text-neutral-900">{admin?.organization?.name || "Associazione"}</p>
              <p className="mt-1 text-neutral-700">
                Stato comunicazioni:{" "}
                <span className={moduleActive ? "text-emerald-700" : "text-amber-700"}>
                  {moduleActive ? "attivo" : "non attivo"}
                </span>
              </p>
            </div>
          </div>
        </div>

        {communicationsLocked ? (
          <div className="mx-6 mt-6 rounded-[1.75rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 md:mx-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-700">Modulo non attivo</p>
                <p className="mt-2">{COMMUNICATIONS_LOCKED_MESSAGE}</p>
              </div>
              <span className="inline-flex rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                Non attivo
              </span>
            </div>
          </div>
        ) : null}

        <div className="px-4 pt-4 md:px-8">
          <div className="flex flex-wrap gap-2 border-b border-neutral-200">
            {[
              { key: "overview", label: "Overview" },
              { key: "campaigns", label: "Campagne" },
              { key: "templates", label: "Template" },
              { key: "forms", label: "Forms & automations" },
              { key: "sending", label: "Sending settings" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`rounded-t-2xl px-4 py-3 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? "bg-brand text-white shadow-sm"
                    : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                }`}
                onClick={() => selectTab(tab.key as TabKey)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-6 md:px-8 md:py-8">
          {activeTab === "overview" ? (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-4">
                <button
                  type="button"
                  onClick={() => selectTab("campaigns")}
                  className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 text-left transition hover:border-brand/40 hover:bg-brand/5"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Campaigns</p>
                  <p className="mt-3 text-3xl font-bold tracking-tight text-neutral-900">{campaigns.length}</p>
                  <p className="mt-2 text-sm text-neutral-600">Bozze, invii e storico campagne in un solo flusso.</p>
                </button>
                <button
                  type="button"
                  onClick={() => selectTab("templates")}
                  className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 text-left transition hover:border-brand/40 hover:bg-brand/5"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Templates</p>
                  <p className="mt-3 text-3xl font-bold tracking-tight text-neutral-900">{templates.filter((item) => item.is_active).length}</p>
                  <p className="mt-2 text-sm text-neutral-600">Template system, custom e archiviati con preview variabili.</p>
                </button>
                <button
                  type="button"
                  onClick={() => selectTab("forms")}
                  className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 text-left transition hover:border-brand/40 hover:bg-brand/5"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Forms</p>
                  <p className="mt-3 text-lg font-bold tracking-tight text-neutral-900">Workflow pubblici</p>
                  <p className="mt-2 text-sm text-neutral-600">Form collegati a notifiche email, conferme e richieste interne.</p>
                </button>
                <button
                  type="button"
                  onClick={() => selectTab("sending")}
                  className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 text-left transition hover:border-brand/40 hover:bg-brand/5"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Sending</p>
                  <p className="mt-3 text-lg font-bold tracking-tight text-neutral-900">
                    {preview.selectedMode === "association" ? "Association mode" : "System fallback"}
                  </p>
                  <p className="mt-2 text-sm text-neutral-600">Controlla mittente, reply-to e test email reali.</p>
                </button>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Panoramica workflow</p>
                  <div className="mt-4 space-y-4">
                    {[
                      ["1", "Templates", "Crea template custom o duplica quelli ASSONAM per uniformare il tono."],
                      ["2", "Forms & automations", "Collega i template ai form pubblici per gestire notifiche e conferme."],
                      ["3", "Campaigns", "Usa gli stessi template nel composer campagne e monitora gli invii."],
                    ].map(([step, title, body]) => (
                      <div key={step} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                        <div className="flex items-start gap-4">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{step}</span>
                          <div>
                            <p className="text-sm font-semibold text-neutral-900">{title}</p>
                            <p className="mt-1 text-sm text-neutral-600">{body}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-5">
                  <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-5 text-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Sender attuale</p>
                    <p className="mt-4 text-neutral-500">From header</p>
                    <p className="font-semibold text-neutral-900 break-all">{preview.fromHeader}</p>
                    <p className="mt-3 text-neutral-500">Reply-To</p>
                    <p className="font-semibold text-neutral-900 break-all">{preview.replyTo || "-"}</p>
                    {preview.fallbackUsed ? (
                      <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                        La configurazione sta ancora usando il fallback system mode.
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5">
                    <p className="text-sm font-semibold text-neutral-900">Azioni rapide</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button className="btn-secondary" type="button" onClick={() => selectTab("templates")} disabled={communicationsLocked}>
                        Crea template
                      </button>
                      <button className="btn-secondary" type="button" onClick={() => selectTab("forms")} disabled={communicationsLocked}>
                        Crea form
                      </button>
                      <button className="btn-primary" type="button" onClick={() => selectTab("campaigns")} disabled={communicationsLocked}>
                        Crea campagna
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "sending" ? (
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <form className="space-y-5" onSubmit={handleSaveSettings}>
                <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5">
                  <p className="text-sm font-semibold text-neutral-900">Stato modulo</p>
                  <p className="mt-2 text-sm text-neutral-600">
                    Attivazione commerciale gestita solo dal super admin ASSONAM.
                  </p>
                  <span
                    className={`mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                      moduleActive
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {moduleActive ? "Attivo" : "Non attivo"}
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={labelClass}>Local part mittente</label>
                    <input
                      className={inputClass}
                      disabled={communicationsLocked}
                      value={settingsForm.sender_email_local_part}
                      onChange={(e) => {
                        setSettingsSaved(false);
                        setSettingsForm((prev) => ({ ...prev, sender_email_local_part: e.target.value }));
                      }}
                      placeholder="golden-age-club"
                    />
                    <p className="mt-2 text-xs text-neutral-500">Se vuoto, viene generato dal nome associazione.</p>
                  </div>
                  <div>
                    <label className={labelClass}>Nome visibile mittente</label>
                    <input
                      className={inputClass}
                      disabled={communicationsLocked}
                      value={settingsForm.email_from_name_override}
                      onChange={(e) => {
                        setSettingsSaved(false);
                        setSettingsForm((prev) => ({ ...prev, email_from_name_override: e.target.value }));
                      }}
                      placeholder={admin?.organization?.name || "ASSONAM"}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Reply-To</label>
                  <input
                    className={inputClass}
                    type="email"
                    disabled={communicationsLocked}
                    value={settingsForm.reply_to_email}
                    onChange={(e) => {
                      setSettingsSaved(false);
                      setSettingsForm((prev) => ({ ...prev, reply_to_email: e.target.value }));
                    }}
                    placeholder="segreteria@associazione.it"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button className="btn-primary" type="submit" disabled={settingsSaving || communicationsLocked}>
                    {communicationsLocked
                      ? "Modulo non attivo"
                      : settingsSaving
                        ? "Salvataggio..."
                        : settingsSaved
                          ? "Salvato ✓"
                          : "Salva impostazioni"}
                  </button>
                  <span className="text-sm text-neutral-500">
                    Dominio: <strong>{settings?.mail_from_domain || "non configurato"}</strong>
                  </span>
                </div>
              </form>

              <div className="space-y-5">
                <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-5 text-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Preview live</p>
                  <p className="mt-4 text-neutral-500">From name</p>
                  <p className="font-semibold text-neutral-900">{preview.fromName || "-"}</p>
                  <p className="mt-3 text-neutral-500">From email</p>
                  <p className="font-semibold text-neutral-900 break-all">{preview.fromEmail}</p>
                  <p className="mt-3 text-neutral-500">From header</p>
                  <p className="font-semibold text-neutral-900 break-all">{preview.fromHeader}</p>
                  <p className="mt-3 text-neutral-500">Reply-To</p>
                  <p className="font-semibold text-neutral-900 break-all">{preview.replyTo || "-"}</p>
                  <p className="mt-3 text-neutral-500">Modalità effettiva</p>
                  <p className="font-semibold text-neutral-900">
                    {preview.selectedMode === "association" ? "association" : "system fallback"}
                  </p>
                  {communicationsLocked ? (
                    <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                      {COMMUNICATIONS_LOCKED_MESSAGE}
                    </p>
                  ) : null}
                  {preview.fallbackUsed ? (
                    <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                      La preview sta usando il fallback system mode. Serve anche `MAIL_FROM_DOMAIN`.
                    </p>
                  ) : null}
                </div>

                <form className="rounded-[1.75rem] border border-neutral-200 bg-white p-5" onSubmit={handleSendTestEmail}>
                  <p className="text-sm font-semibold text-neutral-900">Invia email di test</p>
                  <input
                    className={inputClass}
                    type="email"
                    disabled={communicationsLocked}
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="nome@dominio.it"
                  />
                  <div className="mt-4 flex items-center gap-3">
                    <button className="btn-primary" type="submit" disabled={testSending || communicationsLocked}>
                      {communicationsLocked ? "Non disponibile" : testSending ? "Invio in corso..." : "Invia test"}
                    </button>
                    <span className="text-xs text-neutral-500">Invio diretto con esito reale del provider.</span>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          {activeTab === "campaigns" ? (
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <form
                className="space-y-5 rounded-[1.75rem] border border-neutral-200 bg-white p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleCreateCampaign("draft");
                }}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={labelClass}>Nome interno</label>
                    <input
                      className={inputClass}
                      disabled={communicationsLocked}
                      value={campaignForm.name}
                      onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Rinnovi marzo"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Audience</label>
                    <select
                      className={inputClass}
                      disabled={communicationsLocked}
                      value={campaignForm.audience_type}
                      onChange={(e) =>
                        setCampaignForm((prev) => ({
                          ...prev,
                          audience_type: e.target.value as OrgAdminCampaignAudienceType,
                        }))
                      }
                    >
                      {audienceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-neutral-500">{audienceOptions.find((item) => item.value === campaignForm.audience_type)?.hint}</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                  <div>
                    <label className={labelClass}>Template riutilizzabile</label>
                    <select
                      className={inputClass}
                      disabled={communicationsLocked}
                      value={selectedTemplateId ?? ""}
                      onChange={(e) => {
                        const nextId = Number(e.target.value || 0);
                        setSelectedTemplateId(nextId || null);
                      }}
                    >
                      <option value="">Nessun template</option>
                      {templates
                        .filter((item) => item.is_active)
                        .map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.is_system ? "ASSONAM" : "Associazione"} • {template.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!selectedTemplateId || communicationsLocked}
                    onClick={() => {
                      const template = templates.find((item) => item.id === selectedTemplateId);
                      if (template) {
                        void handleUseTemplateInCampaign(template);
                      }
                    }}
                  >
                    Usa template
                  </button>
                </div>

                <div>
                  <label className={labelClass}>Oggetto</label>
                    <input
                      className={inputClass}
                      disabled={communicationsLocked}
                      value={campaignForm.subject}
                    onChange={(e) => setCampaignForm((prev) => ({ ...prev, subject: e.target.value }))}
                    placeholder="Rinnova la tua iscrizione"
                  />
                </div>

                <div className="flex gap-2">
                  {(["text", "html"] as ContentMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        contentMode === mode
                          ? "bg-brand text-white"
                          : "border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-900"
                      }`}
                      disabled={communicationsLocked}
                      onClick={() => setContentMode(mode)}
                    >
                      {mode === "text" ? "Testo semplice" : "HTML"}
                    </button>
                  ))}
                </div>

                <div>
                  <label className={labelClass}>Corpo messaggio</label>
                  <textarea
                    className={`${inputClass} min-h-[240px]`}
                    disabled={communicationsLocked}
                    value={campaignForm.body}
                    onChange={(e) => setCampaignForm((prev) => ({ ...prev, body: e.target.value }))}
                    placeholder={contentMode === "html" ? "<p>Ciao...</p>" : "Ciao,\n\nla tua tessera sta per scadere..."}
                  />
                </div>

                {communicationsLocked ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Le campagne non possono essere inviate finché le comunicazioni associazione non sono abilitate.
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button className="btn-secondary" type="submit" disabled={draftSaving || communicationsLocked}>
                    {communicationsLocked ? "Bloccato" : draftSaving ? "Salvataggio..." : "Salva bozza"}
                  </button>
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={draftSaving || communicationsLocked}
                    onClick={() => void handleCreateCampaign("send")}
                  >
                    {communicationsLocked ? "Invio bloccato" : draftSaving ? "Invio..." : "Salva e invia"}
                  </button>
                </div>
              </form>

              <div className="space-y-5">
                <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Stima audience</p>
                  <p className="mt-3 text-3xl font-bold tracking-tight text-neutral-900">
                    {communicationsLocked ? "-" : audienceLoading ? "..." : audienceEstimate ?? "-"}
                  </p>
                  <p className="mt-2 text-sm text-neutral-600">
                    {communicationsLocked ? (
                      "Stima audience disponibile dopo l'attivazione del modulo."
                    ) : (
                      <>
                        Destinatari previsti per <strong>{audienceLabel(campaignForm.audience_type)}</strong>.
                      </>
                    )}
                  </p>
                </div>
                <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5">
                  <p className="text-sm font-semibold text-neutral-900">{campaignForm.subject || "Anteprima campagna"}</p>
                  <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                    {campaignForm.body.trim() ? (
                      contentMode === "html" ? (
                        <div dangerouslySetInnerHTML={{ __html: campaignForm.body }} />
                      ) : (
                        <div className="whitespace-pre-wrap">{campaignForm.body}</div>
                      )
                    ) : (
                      <p className="text-neutral-400">Il contenuto apparirà qui appena inizi a scrivere.</p>
                    )}
                  </div>
                </div>
                <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5">
                  <p className="text-sm font-semibold text-neutral-900">Variabili disponibili</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {templateVariables.map((variable) => (
                      <span key={variable.key} className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-semibold text-neutral-600">
                        {variable.placeholder}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "templates" ? (
            <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-900">Libreria template</h2>
                    <p className="text-sm text-neutral-600">Template ASSONAM pronti, template personalizzati e duplicazioni per associazione.</p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={communicationsLocked}
                    onClick={() => {
                      setSelectedTemplate(null);
                      syncTemplateEditor(null);
                      setTemplatePreview(null);
                    }}
                  >
                    Crea template da zero
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {([
                    { key: "all", label: "Tutti" },
                    { key: "system", label: "System" },
                    { key: "custom", label: "Custom" },
                    { key: "archived", label: "Archiviati" },
                  ] as Array<{ key: TemplateFilter; label: string }>).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        templateFilter === item.key
                          ? "bg-brand text-white"
                          : "border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-900"
                      }`}
                      onClick={() => setTemplateFilter(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  {templatesLoading ? (
                    <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5">
                      <Skeleton className="h-24 w-full" />
                    </div>
                  ) : filteredTemplates.length === 0 ? (
                    <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 text-sm text-neutral-500">
                      Nessun template disponibile per questo filtro.
                    </div>
                  ) : (
                    filteredTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className={`w-full rounded-[1.5rem] border p-4 text-left transition ${
                          selectedTemplate?.id === template.id
                            ? "border-brand bg-brand/5"
                            : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
                        }`}
                        onClick={() => void handleTemplateSelect(template.id)}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-neutral-900">{template.name}</p>
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                template.is_system
                                  ? "border-sky-200 bg-sky-50 text-sky-700"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
                              }`}>
                                {template.is_system ? "System" : "Associazione"}
                              </span>
                              {!template.is_active ? (
                                <span className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] font-semibold text-neutral-500">
                                  Archiviato
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm text-neutral-600">{template.subject}</p>
                          </div>
                          <button
                            type="button"
                            className="text-xs font-semibold text-brand hover:text-brand/80 disabled:cursor-not-allowed disabled:text-neutral-400"
                            disabled={communicationsLocked}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleUseTemplateInCampaign(template);
                            }}
                          >
                            Usa
                          </button>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Editor template</p>
                      <h3 className="mt-2 text-lg font-semibold text-neutral-900">
                        {selectedTemplate ? selectedTemplate.name : "Nuovo template custom"}
                      </h3>
                      <p className="mt-1 text-sm text-neutral-600">
                        {!selectedTemplate
                          ? "Parti da zero con un template personalizzato dell'associazione."
                          : selectedTemplate.is_system
                            ? "Template di sistema ASSONAM: puoi usarlo o duplicarlo."
                            : "Template personalizzato modificabile liberamente dall'associazione."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedTemplate ? (
                        <button className="btn-secondary" type="button" onClick={() => void handleDuplicateTemplate()} disabled={templateSaving || communicationsLocked}>
                          Duplica
                        </button>
                      ) : null}
                      {selectedTemplate && !selectedTemplate.is_system ? (
                        <button className="btn-secondary" type="button" onClick={() => void handleArchiveTemplate()} disabled={templateSaving || communicationsLocked}>
                          Archivia
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className={labelClass}>Nome</label>
                        <input
                          className={inputClass}
                          disabled={Boolean(selectedTemplate?.is_system) || communicationsLocked}
                          value={templateEditor.name}
                          onChange={(e) => setTemplateEditor((prev) => ({ ...prev, name: e.target.value }))}
                          placeholder="Sollecito rinnovo premium"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Categoria</label>
                        <input
                          className={inputClass}
                          disabled={Boolean(selectedTemplate?.is_system) || communicationsLocked}
                          value={templateEditor.category}
                          onChange={(e) => setTemplateEditor((prev) => ({ ...prev, category: e.target.value }))}
                          placeholder="renewal"
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>Oggetto</label>
                      <input
                        className={inputClass}
                        disabled={Boolean(selectedTemplate?.is_system) || communicationsLocked}
                        value={templateEditor.subject}
                        onChange={(e) => setTemplateEditor((prev) => ({ ...prev, subject: e.target.value }))}
                        placeholder="Oggetto email"
                      />
                    </div>

                    <div className="flex gap-2">
                      {(["text", "html"] as ContentMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                            templateContentMode === mode
                              ? "bg-brand text-white"
                              : "border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-900"
                          }`}
                          disabled={communicationsLocked}
                          onClick={() => setTemplateContentMode(mode)}
                        >
                          {mode === "text" ? "Testo semplice" : "HTML"}
                        </button>
                      ))}
                    </div>

                    <div>
                      <label className={labelClass}>Body</label>
                      <textarea
                        className={`${inputClass} min-h-[220px]`}
                        disabled={Boolean(selectedTemplate?.is_system) || communicationsLocked}
                        value={templateEditor.body}
                        onChange={(e) => setTemplateEditor((prev) => ({ ...prev, body: e.target.value }))}
                        placeholder={templateContentMode === "html" ? "<p>Ciao {{nome_socio}}</p>" : "Ciao {{nome_socio}}"}
                      />
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button className="btn-secondary" type="button" onClick={() => void handlePreviewTemplate()} disabled={templatePreviewLoading || communicationsLocked}>
                        {communicationsLocked ? "Preview bloccata" : templatePreviewLoading ? "Preview..." : "Aggiorna preview"}
                      </button>
                      {!selectedTemplate || !selectedTemplate.is_system ? (
                        <button
                          className="btn-primary"
                          type="button"
                          disabled={templateSaving || communicationsLocked}
                          onClick={() => void (selectedTemplate ? handleUpdateTemplate() : handleCreateTemplate())}
                        >
                          {communicationsLocked
                            ? "Salvataggio bloccato"
                            : templateSaving
                              ? "Salvataggio..."
                              : selectedTemplate
                                ? "Salva template"
                                : "Crea template"}
                        </button>
                      ) : null}
                    </div>
                    {communicationsLocked ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {COMMUNICATIONS_LOCKED_MESSAGE}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
                  <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-5">
                    <p className="text-sm font-semibold text-neutral-900">Variabili disponibili</p>
                    <p className="mt-1 text-sm text-neutral-500">
                      Usa gli stessi placeholder nei template che poi colleghi ai form o alle campagne.
                    </p>
                    <div className="mt-4 space-y-3">
                      {templateVariables.map((variable) => (
                        <div key={variable.key} className="rounded-2xl border border-neutral-200 bg-white p-3">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500">{variable.placeholder}</p>
                          <p className="mt-1 text-sm font-semibold text-neutral-900">{variable.label}</p>
                          <p className="mt-1 text-xs text-neutral-600">{variable.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5">
                    <p className="text-sm font-semibold text-neutral-900">Preview con dati fake</p>
                    <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                      <p className="text-sm font-semibold text-neutral-900">
                        {templatePreview?.subject || templateEditor.subject || "Oggetto preview"}
                      </p>
                      <div className="mt-4 text-sm text-neutral-700">
                        {templatePreview ? (
                          templatePreview.body_html ? (
                            <div dangerouslySetInnerHTML={{ __html: templatePreview.body_html }} />
                          ) : (
                            <div className="whitespace-pre-wrap">{templatePreview.body_text || "-"}</div>
                          )
                        ) : templateEditor.body.trim() ? (
                          templateContentMode === "html" ? (
                            <div dangerouslySetInnerHTML={{ __html: templateEditor.body }} />
                          ) : (
                            <div className="whitespace-pre-wrap">{templateEditor.body}</div>
                          )
                        ) : (
                          <p className="text-neutral-400">Crea o seleziona un template e genera la preview.</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">Dati fake usati</p>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {Object.entries(templateFakeContext).map(([key, value]) => (
                          <div key={key} className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm">
                            <p className="text-xs text-neutral-500">{key}</p>
                            <p className="font-medium text-neutral-900 break-all">{value || "-"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "forms" ? (
            <OrgAdminFormsWorkspace
              embedded
              locked={communicationsLocked}
              lockedMessage="I Form richiedono il modulo Comunicazioni attivo."
              availableTemplates={templates.filter((item) => item.is_active)}
            />
          ) : null}

          {activeTab === "campaigns" ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">Storico campagne</h2>
                  <p className="text-sm text-neutral-600">Stato invii, audience usata e dettaglio destinatari.</p>
                </div>
                <button className="btn-secondary" type="button" onClick={() => void loadCampaigns(selectedCampaignId)} disabled={campaignsLoading}>
                  {campaignsLoading ? "Aggiornamento..." : "Aggiorna"}
                </button>
              </div>

              <div className="overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-neutral-50 text-left text-neutral-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Campagna</th>
                        <th className="px-4 py-3 font-semibold">Stato</th>
                        <th className="px-4 py-3 font-semibold">Destinatari</th>
                        <th className="px-4 py-3 font-semibold">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.length === 0 ? (
                        <tr>
                          <td className="px-4 py-8 text-center text-neutral-500" colSpan={4}>Nessuna campagna creata.</td>
                        </tr>
                      ) : (
                        campaigns.map((campaign) => (
                          <tr
                            key={campaign.id}
                            className={`cursor-pointer border-t border-neutral-100 transition hover:bg-neutral-50 ${
                              selectedCampaignId === campaign.id ? "bg-brand/5" : ""
                            }`}
                            onClick={() => setSelectedCampaignId(campaign.id)}
                          >
                            <td className="px-4 py-3 align-top">
                              <p className="font-semibold text-neutral-900">{campaign.name || campaign.subject}</p>
                              <p className="mt-1 text-neutral-500">{audienceLabel(campaign.audience_type)}</p>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                statusToneClass[campaign.status] || statusToneClass.draft
                              }`}>
                                {statusLabel(campaign.status)}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-top text-neutral-700">{campaign.recipient_count}</td>
                            <td className="px-4 py-3 align-top text-neutral-700">{formatDateTime(campaign.sent_at || campaign.created_at)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5">
                {detailLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-40 w-full" />
                  </div>
                ) : selectedCampaign ? (
                  <div className="space-y-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Dettaglio campagna</p>
                        <h3 className="mt-2 text-xl font-bold tracking-tight text-neutral-900">{selectedCampaign.name || selectedCampaign.subject}</h3>
                        <p className="mt-1 text-sm text-neutral-600">{selectedCampaign.subject}</p>
                      </div>
                      {(selectedCampaign.status || "").toLowerCase() === "draft" ? (
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={sendLoading || communicationsLocked}
                          onClick={() => void handleSendExistingCampaign(selectedCampaign.id)}
                        >
                          {communicationsLocked ? "Invio bloccato" : sendLoading ? "Invio..." : "Invia campagna"}
                        </button>
                      ) : null}
                    </div>

                    {communicationsLocked ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {COMMUNICATIONS_LOCKED_MESSAGE}
                      </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"><p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Audience</p><p className="mt-2 font-semibold text-neutral-900">{audienceLabel(selectedCampaign.audience_type)}</p></div>
                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"><p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Totale</p><p className="mt-2 font-semibold text-neutral-900">{selectedCampaign.recipient_count}</p></div>
                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"><p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Inviate</p><p className="mt-2 font-semibold text-neutral-900">{selectedCampaign.recipient_status_counts.sent}</p></div>
                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"><p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Fallite</p><p className="mt-2 font-semibold text-neutral-900">{selectedCampaign.recipient_status_counts.failed}</p></div>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
                      <div className="rounded-2xl border border-neutral-200 p-4">
                        <p className="text-sm font-semibold text-neutral-900">Contenuto</p>
                        <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                          {selectedCampaign.body_html ? (
                            <div dangerouslySetInnerHTML={{ __html: selectedCampaign.body_html }} />
                          ) : (
                            <div className="whitespace-pre-wrap">{selectedCampaign.body_text || "-"}</div>
                          )}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-neutral-200 p-4">
                        <p className="text-sm font-semibold text-neutral-900">Destinatari campagna</p>
                        <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-neutral-200">
                          <table className="min-w-full text-sm">
                            <thead className="bg-neutral-50 text-left text-neutral-500">
                              <tr>
                                <th className="px-4 py-3 font-semibold">Destinatario</th>
                                <th className="px-4 py-3 font-semibold">Stato</th>
                                <th className="px-4 py-3 font-semibold">Inviata</th>
                                <th className="px-4 py-3 font-semibold">Errore</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedRecipients.length === 0 ? (
                                <tr>
                                  <td className="px-4 py-6 text-center text-neutral-500" colSpan={4}>Nessun destinatario salvato.</td>
                                </tr>
                              ) : (
                                selectedRecipients.map((recipient) => (
                                  <tr key={recipient.id} className="border-t border-neutral-100">
                                    <td className="px-4 py-3 align-top"><p className="font-medium text-neutral-900">{recipient.recipient_name || "-"}</p><p className="text-neutral-500 break-all">{recipient.recipient_email}</p></td>
                                    <td className="px-4 py-3 align-top"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                      statusToneClass[(recipient.delivery_status || "").toLowerCase()] || statusToneClass.queued
                                    }`}>{statusLabel(recipient.delivery_status)}</span></td>
                                    <td className="px-4 py-3 align-top text-neutral-700">{formatDateTime(recipient.sent_at)}</td>
                                    <td className="px-4 py-3 align-top text-neutral-700">{recipient.error_message || "-"}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">Seleziona una campagna dallo storico per vedere il dettaglio.</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
};

export default OrgAdminCommunications;
