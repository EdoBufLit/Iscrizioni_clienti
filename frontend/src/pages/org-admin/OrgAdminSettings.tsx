import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchOrgAdminOrganization,
  patchOrgAdminOrganization,
  putOrgAdminCommunicationSettings,
  uploadOrgAdminStatute,
  uploadOrgAdminWalletAssets,
  AuthError,
  type OrgAdminOrganizationDetail,
} from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/ToastProvider";
import { useUnsavedChangesGuard } from "../../components/ui/UnsavedChangesProvider";

type SettingsTabKey = "profilo" | "documenti" | "email" | "wallet";

const SETTINGS_TABS: Array<{ key: SettingsTabKey; label: string }> = [
  { key: "profilo", label: "Profilo" },
  { key: "documenti", label: "Documenti" },
  { key: "email", label: "Email" },
  { key: "wallet", label: "Google Wallet" },
];

const inputClass =
  "theme-input mt-1.5 w-full rounded-lg px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--oa-brand)] focus:ring-2 focus:ring-[var(--oa-brand)]/20";
const labelClass = "block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--oa-muted)]";
const COMMUNICATIONS_LOCKED_MESSAGE =
  "Modulo Comunicazioni non attivo. Contatta ASSONAM per abilitarlo.";

type EmailPreview = {
  requestedMode: "association";
  selectedMode: "system" | "association";
  fromName: string | null;
  fromEmail: string;
  fromHeader: string;
  replyTo: string | null;
  fallbackUsed: boolean;
};

function resolveTab(raw: string | null): SettingsTabKey {
  if (raw === "documenti" || raw === "email" || raw === "wallet") return raw;
  return "profilo";
}

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function buildAssociationEmailPreview(input: {
  associationId: number | null | undefined;
  associationName: string | null | undefined;
  communicationsEnabled: boolean;
  senderEmailLocalPart: string | null | undefined;
  emailFromNameOverride: string | null | undefined;
  replyToEmail: string | null | undefined;
  mailFromDomain: string | null | undefined;
  systemSender?: OrgAdminOrganizationDetail["system_email_sender"];
}): EmailPreview {
  const systemSender = input.systemSender;
  const systemEmail = systemSender?.from_email || "noreply@assonam.it";
  const systemHeader = systemSender?.from_header || systemEmail;
  const systemName = systemSender?.from_name || null;
  const systemReplyTo = systemSender?.reply_to || null;
  const associationName =
    normalizeText(input.emailFromNameOverride)
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
      requestedMode: "association",
      selectedMode: "system",
      fromName: systemName,
      fromEmail: systemEmail,
      fromHeader: systemHeader,
      replyTo: systemReplyTo,
      fallbackUsed: true,
    };
  }

  const fromEmail = `${localPart}@${domain}`;
  return {
    requestedMode: "association",
    selectedMode: "association",
    fromName: associationName,
    fromEmail,
    fromHeader: `${associationName} <${fromEmail}>`,
    replyTo: normalizeText(input.replyToEmail),
    fallbackUsed: false,
  };
}

function organizationFormSnapshot(org: OrgAdminOrganizationDetail | null) {
  return {
    name: org?.name || "",
    description: org?.description || "",
    city: org?.city || "",
    province: org?.province || "",
    email: org?.email || "",
    phone: org?.phone || "",
    website: org?.website || "",
  };
}

function organizationEmailSettingsSnapshot(org: OrgAdminOrganizationDetail | null) {
  return {
    sender_email_local_part: org?.sender_email_local_part || "",
    email_from_name_override: org?.email_from_name_override || "",
    reply_to_email: org?.reply_to_email || "",
  };
}

function organizationWalletSnapshot(org: OrgAdminOrganizationDetail | null) {
  return {
    wallet_bg_color: org?.wallet_bg_color || org?.wallet_effective_bg_color || "#0B3C75",
    wallet_title_override: org?.wallet_title_override || org?.wallet_effective_title_override || "",
    wallet_is_test_prefix: Boolean(org?.wallet_is_test_prefix),
  };
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V1C5.925 1 1 5.925 1 12h3Z"
      />
    </svg>
  );
}

const OrgAdminSettings = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const activeTab = resolveTab(searchParams.get("tab"));
  const setActiveTab = (nextTab: SettingsTabKey) => {
    const next = new URLSearchParams(searchParams);
    if (nextTab === "profilo") {
      next.delete("tab");
    } else {
      next.set("tab", nextTab);
    }
    setSearchParams(next, { replace: true });
  };

  const [org, setOrg] = useState<OrgAdminOrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Tab 1: Profile state
  const [form, setForm] = useState({
    name: "",
    description: "",
    city: "",
    province: "",
    email: "",
    phone: "",
    website: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveError, setSaveError] = useState("");

  // Tab 2: Statute upload state
  const [statuteFile, setStatuteFile] = useState<File | null>(null);
  const [statuteDragActive, setStatuteDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadError, setUploadError] = useState("");
  const statuteInputRef = useRef<HTMLInputElement | null>(null);

  // Tab 3: Email state
  const [emailSettingsForm, setEmailSettingsForm] = useState({
    sender_email_local_part: "",
    email_from_name_override: "",
    reply_to_email: "",
  });
  const [emailSettingsSaving, setEmailSettingsSaving] = useState(false);
  const [emailSettingsError, setEmailSettingsError] = useState("");
  const [emailSettingsSaved, setEmailSettingsSaved] = useState(false);

  // Tab 4: Google Wallet state
  const [walletForm, setWalletForm] = useState({
    wallet_bg_color: "#0B3C75",
    wallet_title_override: "",
    wallet_is_test_prefix: false,
  });
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletSaveMsg, setWalletSaveMsg] = useState("");
  const [walletSaveError, setWalletSaveError] = useState("");
  const [walletLogoFile, setWalletLogoFile] = useState<File | null>(null);
  const [walletHeroFile, setWalletHeroFile] = useState<File | null>(null);
  const [walletLogoObjectUrl, setWalletLogoObjectUrl] = useState<string | null>(null);
  const [walletHeroObjectUrl, setWalletHeroObjectUrl] = useState<string | null>(null);
  const walletLogoInputRef = useRef<HTMLInputElement | null>(null);
  const walletHeroInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!walletLogoFile) {
      setWalletLogoObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(walletLogoFile);
    setWalletLogoObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [walletLogoFile]);

  useEffect(() => {
    if (!walletHeroFile) {
      setWalletHeroObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(walletHeroFile);
    setWalletHeroObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [walletHeroFile]);

  useEffect(() => {
    fetchOrgAdminOrganization()
      .then((data) => {
        setOrg(data);
        setForm(organizationFormSnapshot(data));
        setWalletForm(organizationWalletSnapshot(data));
        setEmailSettingsForm(organizationEmailSettingsSnapshot(data));
      })
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/org-admin/login", { replace: true });
        } else {
          setError("Impossibile caricare i dati dell'associazione.");
        }
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleChange =
    (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setSaveMsg("");
      setSaveError("");
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleEmailSettingsChange =
    (field: keyof typeof emailSettingsForm) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      setEmailSettingsSaved(false);
      setEmailSettingsError("");
      setEmailSettingsForm((prev) => ({
        ...prev,
        [field]: e.target.value,
      }));
    };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveMsg("");
    setSaveError("");
    try {
      const result = await patchOrgAdminOrganization(form);
      if (result.organization) {
        setOrg(result.organization);
        setForm(organizationFormSnapshot(result.organization));
      }
      setSaveMsg("Dati aggiornati correttamente.");
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
      } else {
        setSaveError("Errore nel salvataggio.");
      }
    } finally {
      setSaving(false);
    }
  };

  const selectStatuteFile = (file: File | null) => {
    setUploadMsg("");
    setUploadError("");
    setStatuteFile(file);
  };

  const handleStatuteDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setStatuteDragActive(false);
    const dropped = event.dataTransfer.files?.[0] ?? null;
    if (dropped) {
      selectStatuteFile(dropped);
    }
  };

  const handleStatuteUpload = async () => {
    if (!statuteFile || uploading) return;

    const hasPdfExtension = statuteFile.name.toLowerCase().endsWith(".pdf");
    const hasPdfMime = !statuteFile.type || statuteFile.type === "application/pdf";
    if (!hasPdfExtension || !hasPdfMime) {
      setUploadMsg("");
      setUploadError("Formato non valido: carica un PDF.");
      return;
    }
    if (statuteFile.size > 10 * 1024 * 1024) {
      setUploadMsg("");
      setUploadError("File troppo grande (max 10 MB).");
      return;
    }

    setUploading(true);
    setUploadMsg("");
    setUploadError("");
    try {
      const result = await uploadOrgAdminStatute(statuteFile);
      setOrg((prev) =>
        prev
          ? {
              ...prev,
              statute_version: result.statute_version,
              statute_updated_at: result.updated_at,
              statute_url: `/api/organizations/${prev.slug}/statute`,
              has_statute: true,
            }
          : prev,
      );
      setUploadMsg(`Statuto aggiornato (${result.statute_version}).`);
      setStatuteFile(null);
      if (statuteInputRef.current) statuteInputRef.current.value = "";
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
      } else {
        setUploadError(err instanceof Error ? err.message : "Errore nel caricamento del file.");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleAssociationEmailSave = async (event?: FormEvent) => {
    event?.preventDefault();
    if (emailSettingsSaving) return;
    setEmailSettingsSaving(true);
    setEmailSettingsError("");
    setEmailSettingsSaved(false);
    try {
      if (!org?.communications_enabled) {
        throw new Error(COMMUNICATIONS_LOCKED_MESSAGE);
      }
      const result = await putOrgAdminCommunicationSettings({
        sender_email_local_part: normalizeText(emailSettingsForm.sender_email_local_part),
        email_from_name_override: normalizeText(emailSettingsForm.email_from_name_override),
        reply_to_email: normalizeText(emailSettingsForm.reply_to_email),
      });
      if (org) {
        setOrg({
          ...org,
          sender_email_local_part: result.settings.sender_email_local_part,
          email_from_name_override: result.settings.email_from_name_override,
          reply_to_email: result.settings.reply_to_email,
          mail_from_domain: result.settings.mail_from_domain,
          system_email_sender: result.settings.system_email_sender,
          association_email_sender: result.settings.association_email_sender,
        });
        setEmailSettingsForm({
          sender_email_local_part: result.settings.sender_email_local_part || "",
          email_from_name_override: result.settings.email_from_name_override || "",
          reply_to_email: result.settings.reply_to_email || "",
        });
      }
      setEmailSettingsSaved(true);
      window.setTimeout(() => setEmailSettingsSaved(false), 2200);
      showToast({
        tone: "success",
        title: "Email associazione",
        message: "Impostazioni salvate.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore nel salvataggio impostazioni email.";
      setEmailSettingsError(message);
      showToast({
        tone: "error",
        title: "Email associazione",
        message,
      });
    } finally {
      setEmailSettingsSaving(false);
    }
  };

  const validateWalletImage = (
    file: File | null,
    options: { label: string; maxBytes: number; allowedExt: string[]; allowedMime: string[] },
  ): string | null => {
    if (!file) return null;
    const ext = `.${(file.name.split(".").pop() || "").toLowerCase()}`;
    const hasValidExt = options.allowedExt.includes(ext);
    const hasValidMime = !file.type || options.allowedMime.includes(file.type);
    if (!hasValidExt || !hasValidMime) return `Formato non valido per ${options.label}.`;
    if (file.size > options.maxBytes) return `${options.label} troppo grande (max 2 MB).`;
    return null;
  };

  const handleWalletUnifiedSave = async (event?: FormEvent) => {
    event?.preventDefault();
    if (walletSaving) return;

    const logoError = validateWalletImage(walletLogoFile, {
      label: "logo",
      maxBytes: 2 * 1024 * 1024,
      allowedExt: [".png", ".jpg", ".jpeg", ".svg"],
      allowedMime: ["image/png", "image/jpeg", "image/svg+xml"],
    });
    const heroError = validateWalletImage(walletHeroFile, {
      label: "hero image",
      maxBytes: 2 * 1024 * 1024,
      allowedExt: [".png", ".jpg", ".jpeg"],
      allowedMime: ["image/png", "image/jpeg"],
    });
    const validationError = logoError || heroError;
    if (validationError) {
      setWalletSaveMsg("");
      setWalletSaveError(validationError);
      return;
    }

    setWalletSaving(true);
    setWalletSaveMsg("");
    setWalletSaveError("");

    try {
      const payload = {
        wallet_bg_color: walletForm.wallet_bg_color.trim() || null,
        wallet_title_override: walletForm.wallet_title_override.trim() || null,
        wallet_is_test_prefix: walletForm.wallet_is_test_prefix,
      };
      const brandingResult = await patchOrgAdminOrganization(payload);
      let nextOrg = brandingResult.organization ?? org;

      if (walletLogoFile || walletHeroFile) {
        const assetsResult = await uploadOrgAdminWalletAssets({
          logo: walletLogoFile,
          heroImage: walletHeroFile,
        });
        if (nextOrg) {
          nextOrg = {
            ...nextOrg,
            wallet_logo_url: assetsResult.wallet_logo_url ?? nextOrg.wallet_logo_url,
            wallet_hero_image_url: assetsResult.wallet_hero_image_url ?? nextOrg.wallet_hero_image_url,
            wallet_effective_logo_url:
              assetsResult.wallet_effective_logo_url ?? nextOrg.wallet_effective_logo_url,
            wallet_effective_hero_image_url:
              assetsResult.wallet_effective_hero_image_url ?? nextOrg.wallet_effective_hero_image_url,
          };
        }
        setWalletLogoFile(null);
        setWalletHeroFile(null);
        if (walletLogoInputRef.current) walletLogoInputRef.current.value = "";
        if (walletHeroInputRef.current) walletHeroInputRef.current.value = "";
      }

      if (nextOrg) {
        setOrg(nextOrg);
        setWalletForm(organizationWalletSnapshot(nextOrg));
      }
      setWalletSaveMsg("Modifiche Google Wallet salvate correttamente.");
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/org-admin/login", { replace: true });
      } else {
        setWalletSaveError(
          err instanceof Error ? err.message : "Errore nel salvataggio Google Wallet.",
        );
      }
    } finally {
      setWalletSaving(false);
    }
  };

  const emailPreview = buildAssociationEmailPreview({
    associationId: org?.id,
    associationName: normalizeText(form.name) || org?.name,
    communicationsEnabled: Boolean(org?.communications_enabled),
    senderEmailLocalPart: emailSettingsForm.sender_email_local_part,
    emailFromNameOverride: emailSettingsForm.email_from_name_override,
    replyToEmail: emailSettingsForm.reply_to_email,
    mailFromDomain: org?.mail_from_domain,
    systemSender: org?.system_email_sender,
  });
  const communicationsLocked = !Boolean(org?.communications_enabled);
  const computedLocalPart =
    sanitizeEmailLocalPartPreview(emailSettingsForm.sender_email_local_part)
    || sanitizeEmailLocalPartPreview(normalizeText(form.name) || org?.name)
    || `org-${org?.id ?? "x"}`;
  const walletPreviewLogo =
    walletLogoObjectUrl || org?.wallet_logo_url || org?.wallet_effective_logo_url || "/logo-transparent.png";
  const walletPreviewHero =
    walletHeroObjectUrl || org?.wallet_hero_image_url || org?.wallet_effective_hero_image_url;
  const walletPreviewTitle = walletForm.wallet_title_override.trim() || org?.name || "ASSO.N.A.M.";

  const hasUnsavedSettingsChanges = useMemo(() => {
    if (loading || saving || emailSettingsSaving || uploading || walletSaving) {
      return false;
    }
    return (
      JSON.stringify(form) !== JSON.stringify(organizationFormSnapshot(org))
      || JSON.stringify(emailSettingsForm) !== JSON.stringify(organizationEmailSettingsSnapshot(org))
      || JSON.stringify(walletForm) !== JSON.stringify(organizationWalletSnapshot(org))
      || Boolean(statuteFile || walletLogoFile || walletHeroFile)
    );
  }, [
    emailSettingsForm,
    emailSettingsSaving,
    form,
    loading,
    org,
    saving,
    statuteFile,
    uploading,
    walletForm,
    walletHeroFile,
    walletLogoFile,
    walletSaving,
  ]);

  useUnsavedChangesGuard({
    when: hasUnsavedSettingsChanges,
    title: "Impostazioni non salvate",
    message: "Hai modifiche o file selezionati non ancora salvati. Se esci ora, li perderai.",
  });

  if (loading) {
    return (
      <div className="container-shell py-8 pb-32">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-80" />
        <div className="mt-6 flex gap-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
        <div className="mt-6 surface p-6">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-4 h-10 w-full" />
          <Skeleton className="mt-4 h-10 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container-shell py-8 pb-32">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-6 py-4" role="alert">
          <p className="text-sm font-medium text-rose-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-shell org-admin-mobile-page org-admin-settings-page py-8 pb-32 space-y-6">
      <header className="org-page-header">
        <div className="min-w-0">
          <p className="org-eyebrow hidden md:block">Impostazioni</p>
          <h1 className="org-page-header__title">Associazione</h1>
          <p className="org-page-header__subtitle hidden md:block">
            Gestisci profilo pubblico, statuto PDF, mittente email e branding Google Wallet.
          </p>
        </div>
      </header>

      {/* Persistent Tab Bar */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto scrollbar-none rounded-xl border border-[var(--oa-line)] bg-[var(--oa-panel-soft)] p-1.5"
        role="tablist"
        aria-label="Sezioni impostazioni associazione"
      >
        {SETTINGS_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex min-h-10 shrink-0 flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap transition ${
                isActive
                  ? "bg-[var(--oa-panel)] text-[var(--oa-brand-strong)] shadow-sm ring-1 ring-inset ring-[var(--oa-line-strong)]"
                  : "text-[var(--oa-muted)] hover:text-[var(--oa-text)]"
              }`}
            >
              <span>{tab.label}</span>
              {tab.key === "documenti" && org?.has_statute && (
                <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                  {org.statute_version || "PDF"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: PROFILO */}
      {activeTab === "profilo" && (
        <form onSubmit={handleSave} className="org-section-panel p-5 md:p-7">
          <div className="border-b border-[var(--oa-line)] pb-4">
            <h2 className="text-base font-semibold text-[var(--oa-text)]">Dettagli e contatti pubblici</h2>
            <p className="mt-1 text-xs sm:text-sm text-[var(--oa-muted)]">
              Queste informazioni sono visibili nella scheda pubblica dell&apos;associazione.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="md:col-span-4">
              <label htmlFor="org-name" className={labelClass}>
                Nome
              </label>
              <input
                id="org-name"
                className={inputClass}
                type="text"
                value={form.name}
                onChange={handleChange("name")}
              />
            </div>

            <div className="grid grid-cols-4 gap-3 md:col-span-4 md:gap-4">
              <div className="col-span-3">
                <label htmlFor="org-city" className={labelClass}>
                  Città
                </label>
                <input
                  id="org-city"
                  className={inputClass}
                  type="text"
                  value={form.city}
                  onChange={handleChange("city")}
                />
              </div>
              <div className="col-span-1">
                <label htmlFor="org-province" className={labelClass}>
                  Provincia
                </label>
                <input
                  id="org-province"
                  className={`${inputClass} uppercase`}
                  type="text"
                  maxLength={2}
                  placeholder="RM"
                  value={form.province}
                  onChange={handleChange("province")}
                />
              </div>
            </div>

            <div className="md:col-span-4">
              <label htmlFor="org-description" className={labelClass}>
                Descrizione
              </label>
              <textarea
                id="org-description"
                className={inputClass}
                rows={3}
                value={form.description}
                onChange={handleChange("description")}
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="org-email" className={labelClass}>
                Email
              </label>
              <input
                id="org-email"
                className={inputClass}
                type="email"
                value={form.email}
                onChange={handleChange("email")}
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="org-phone" className={labelClass}>
                Telefono
              </label>
              <input
                id="org-phone"
                className={inputClass}
                type="tel"
                value={form.phone}
                onChange={handleChange("phone")}
              />
            </div>

            <div className="md:col-span-4">
              <label htmlFor="org-website" className={labelClass}>
                Sito web
              </label>
              <input
                id="org-website"
                className={inputClass}
                type="url"
                placeholder="https://"
                value={form.website}
                onChange={handleChange("website")}
              />
            </div>
          </div>

          {saveMsg && (
            <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3" role="status">
              <p className="text-sm font-medium text-emerald-700">{saveMsg}</p>
            </div>
          )}
          {saveError && (
            <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3" role="alert">
              <p className="text-sm font-medium text-rose-700">{saveError}</p>
            </div>
          )}

          <div className="mt-6 flex justify-end border-t border-[var(--oa-line)] pt-5">
            <button className="btn-primary inline-flex items-center gap-2" type="submit" disabled={saving}>
              {saving && <Spinner />}
              <span>{saving ? "Salvataggio..." : "Salva"}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: DOCUMENTI (STATUTO) */}
      {activeTab === "documenti" && (
        <section className="org-section-panel p-5 md:p-7 space-y-6">
          <div className="border-b border-[var(--oa-line)] pb-4">
            <h2 className="text-base font-semibold text-[var(--oa-text)]">Statuto associativo</h2>
            <p className="mt-1 text-xs sm:text-sm text-[var(--oa-muted)]">
              Carica o aggiorna lo statuto dell&apos;associazione in formato PDF per renderlo consultabile ai soci.
            </p>
          </div>

          {org?.has_statute ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--oa-line-strong)] bg-[var(--oa-panel-soft)] p-4">
              <div className="flex min-w-0 items-center gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
                  <svg
                    className="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                    />
                  </svg>
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--oa-text)]">
                      Statuto attuale: {org.statute_version}
                    </p>
                    <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
                      {org.statute_version}
                    </span>
                  </div>
                  {org.statute_updated_at && (
                    <p className="mt-0.5 text-xs text-[var(--oa-muted)]">
                      Aggiornato il{" "}
                      {new Date(org.statute_updated_at).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>
              </div>
              <a
                href={org.statute_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-flex items-center gap-2 !px-3.5 !py-2 text-xs font-semibold"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                <span>Scarica PDF</span>
              </a>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--oa-line-strong)] bg-[var(--oa-panel-soft)] p-4 text-xs sm:text-sm text-[var(--oa-muted)]">
              Nessuno statuto caricato. Carica il primo documento PDF qui sotto.
            </div>
          )}

          <div>
            <p className={labelClass}>{org?.has_statute ? "Aggiorna statuto" : "Carica statuto"}</p>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setStatuteDragActive(true);
              }}
              onDragLeave={() => setStatuteDragActive(false)}
              onDrop={handleStatuteDrop}
              className={`mt-2 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${
                statuteDragActive
                  ? "border-[var(--oa-brand)] bg-[var(--oa-brand)]/10"
                  : "border-[var(--oa-line-strong)] bg-[var(--oa-panel-soft)] hover:border-[var(--oa-brand)]/60"
              }`}
            >
              <input
                ref={statuteInputRef}
                id="statute-pdf-input"
                type="file"
                accept=".pdf,application/pdf"
                aria-label="Seleziona file PDF dello statuto"
                className="sr-only"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  selectStatuteFile(e.target.files?.[0] ?? null)
                }
              />
              <svg
                className="h-8 w-8 text-[var(--oa-brand-strong)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
                />
              </svg>
              {statuteFile ? (
                <div className="mt-3 space-y-2">
                  <p className="text-sm font-semibold text-[var(--oa-text)]">{statuteFile.name}</p>
                  <p className="text-xs text-[var(--oa-muted)]">{formatFileSize(statuteFile.size)}</p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      className="btn-secondary !px-3 !py-1.5 text-xs"
                      onClick={() => statuteInputRef.current?.click()}
                    >
                      Cambia file
                    </button>
                    <button
                      type="button"
                      className="btn-ghost !px-3 !py-1.5 text-xs"
                      onClick={() => {
                        selectStatuteFile(null);
                        if (statuteInputRef.current) statuteInputRef.current.value = "";
                      }}
                    >
                      Rimuovi
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-sm font-semibold text-[var(--oa-text)]">
                    Trascina qui il PDF dello statuto oppure selezionalo dal dispositivo
                  </p>
                  <p className="mt-1 text-xs text-[var(--oa-muted)]">
                    Solo file PDF · Dimensione massima 10 MB
                  </p>
                  <button
                    type="button"
                    className="btn-secondary mt-4 !px-4 !py-2 text-xs font-semibold"
                    onClick={() => statuteInputRef.current?.click()}
                  >
                    Scegli file PDF
                  </button>
                </>
              )}
            </div>
          </div>

          {uploadMsg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3" role="status">
              <p className="text-sm font-medium text-emerald-700">{uploadMsg}</p>
            </div>
          )}
          {uploadError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3" role="alert">
              <p className="text-sm font-medium text-rose-700">{uploadError}</p>
            </div>
          )}

          <div className="flex justify-end border-t border-[var(--oa-line)] pt-5">
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              disabled={!statuteFile || uploading}
              onClick={handleStatuteUpload}
            >
              {uploading && <Spinner />}
              <span>{uploading ? "Caricamento..." : "Carica"}</span>
            </button>
          </div>
        </section>
      )}

      {/* TAB 3: COMUNICAZIONI & EMAIL */}
      {activeTab === "email" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <form onSubmit={handleAssociationEmailSave} className="org-section-panel p-5 md:p-7 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--oa-line)] pb-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--oa-text)]">Impostazioni email associazione</h2>
                <p className="mt-1 text-xs sm:text-sm text-[var(--oa-muted)]">
                  Configura il mittente visibile delle comunicazioni associazione. Se la configurazione non è completa, il sistema torna automaticamente al mittente ASSONAM.
                </p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                  communicationsLocked
                    ? "border-amber-500/35 bg-amber-500/15 text-amber-700"
                    : "border-emerald-500/35 bg-emerald-500/15 text-emerald-700"
                }`}
              >
                {communicationsLocked ? "Modulo non attivo" : `Mode attuale: ${emailPreview.selectedMode}`}
              </span>
            </div>

            {communicationsLocked && (
              <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-800">
                {COMMUNICATIONS_LOCKED_MESSAGE}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="sender-email-local-part" className={labelClass}>
                  Local part mittente
                </label>
                <input
                  id="sender-email-local-part"
                  className={inputClass}
                  type="text"
                  disabled={communicationsLocked}
                  placeholder="golden-age-club"
                  value={emailSettingsForm.sender_email_local_part}
                  onChange={handleEmailSettingsChange("sender_email_local_part")}
                />
                <p className="mt-1.5 text-xs text-[var(--oa-muted)]">
                  Se lasci vuoto, il sistema genera automaticamente il local part dal nome associazione.
                </p>
              </div>

              <div>
                <label htmlFor="email-from-name-override" className={labelClass}>
                  Nome mittente visibile
                </label>
                <input
                  id="email-from-name-override"
                  className={inputClass}
                  type="text"
                  disabled={communicationsLocked}
                  placeholder={normalizeText(form.name) || org?.name || "ASSONAM"}
                  value={emailSettingsForm.email_from_name_override}
                  onChange={handleEmailSettingsChange("email_from_name_override")}
                />
                <p className="mt-1.5 text-xs text-[var(--oa-muted)]">
                  Se lasci vuoto, verrà usato il nome dell&apos;associazione.
                </p>
              </div>

              <div>
                <label htmlFor="reply-to-email" className={labelClass}>
                  Reply-To
                </label>
                <input
                  id="reply-to-email"
                  className={inputClass}
                  type="email"
                  disabled={communicationsLocked}
                  placeholder="segreteria@associazione.it"
                  value={emailSettingsForm.reply_to_email}
                  onChange={handleEmailSettingsChange("reply_to_email")}
                />
                <p className="mt-1.5 text-xs text-[var(--oa-muted)]">
                  Opzionale. Se valorizzato, verrà usato come Reply-To in association mode.
                </p>
              </div>
            </div>

            {emailSettingsError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3" role="alert">
                <p className="text-sm font-medium text-rose-700">{emailSettingsError}</p>
              </div>
            )}

            <div className="flex justify-end border-t border-[var(--oa-line)] pt-5">
              <button
                type="submit"
                className="btn-primary inline-flex items-center gap-2"
                disabled={emailSettingsSaving || communicationsLocked}
              >
                {emailSettingsSaving && <Spinner />}
                {emailSettingsSaved && !emailSettingsSaving && (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.25 7.313a1 1 0 0 1-1.42 0l-3-3.024a1 1 0 1 1 1.42-1.408l2.29 2.308 6.54-6.597a1 1 0 0 1 1.414-.006Z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                <span>
                  {communicationsLocked
                    ? "Modulo non attivo"
                    : emailSettingsSaving
                      ? "Salvataggio..."
                      : emailSettingsSaved
                        ? "Salvato"
                        : "Salva impostazioni email"}
                </span>
              </button>
            </div>
          </form>

          <aside className="org-section-panel p-5 md:p-6 lg:sticky lg:top-24 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--oa-line)] pb-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--oa-muted)]">
                Preview &amp; Regole attive
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                    communicationsLocked
                      ? "border-amber-500/35 bg-amber-500/15 text-amber-700"
                      : "border-emerald-500/35 bg-emerald-500/15 text-emerald-700"
                  }`}
                >
                  {communicationsLocked ? "Non attivo" : "Attivo"}
                </span>
                <span className="inline-flex items-center rounded-full border border-[var(--oa-line-strong)] bg-[var(--oa-panel-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--oa-text)]">
                  {emailPreview.fallbackUsed ? "System mode" : "Association mode"}
                </span>
              </div>
            </div>

            <dl className="space-y-3 rounded-xl border border-[var(--oa-line)] bg-[var(--oa-panel-soft)] p-4 text-xs">
              <div>
                <dt className="font-semibold uppercase tracking-wider text-[var(--oa-muted)]">From name previsto</dt>
                <dd className="mt-0.5 text-sm font-semibold text-[var(--oa-text)]">{emailPreview.fromName || "-"}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wider text-[var(--oa-muted)]">From email previsto</dt>
                <dd className="mt-0.5 break-all font-mono text-sm text-[var(--oa-text)]">{emailPreview.fromEmail}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wider text-[var(--oa-muted)]">From header completo previsto</dt>
                <dd className="mt-0.5 break-all font-mono text-sm text-[var(--oa-text)]">{emailPreview.fromHeader}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wider text-[var(--oa-muted)]">Reply-To previsto</dt>
                <dd className="mt-0.5 break-all font-mono text-sm text-[var(--oa-text)]">{emailPreview.replyTo || "-"}</dd>
              </div>
            </dl>

            <div className="space-y-2.5 text-xs text-[var(--oa-muted)]">
              <div className="flex items-center justify-between gap-2">
                <span>Dominio mittente</span>
                <strong className="text-[var(--oa-text)]">{org?.mail_from_domain || "non configurato"}</strong>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Local part calcolato</span>
                <code className="font-mono font-semibold text-[var(--oa-text)]">{computedLocalPart}</code>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Fallback usato</span>
                <strong className={emailPreview.fallbackUsed ? "text-amber-600" : "text-emerald-600"}>
                  {emailPreview.fallbackUsed ? "Si, system mode" : "No, association mode"}
                </strong>
              </div>
              {communicationsLocked && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800">
                  L&apos;attivazione del modulo Comunicazioni è gestita solo dal super admin ASSONAM.
                </p>
              )}
              {!org?.mail_from_domain && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800">
                  <code>MAIL_FROM_DOMAIN</code> non configurato: la preview e l&apos;invio useranno system mode.
                </p>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* TAB 4: GOOGLE WALLET BRANDING */}
      {activeTab === "wallet" && (
        <form onSubmit={handleWalletUnifiedSave} className="org-section-panel p-5 md:p-7 space-y-6">
          <div className="border-b border-[var(--oa-line)] pb-4">
            <h2 className="text-base font-semibold text-[var(--oa-text)]">Google Wallet Branding</h2>
            <p className="mt-1 text-xs sm:text-sm text-[var(--oa-muted)]">
              Personalizza la tessera aperta e la miniatura compatta mostrata in Google Wallet (Android).
            </p>
          </div>

          <div
            className="rounded-xl border border-[var(--oa-brand)]/40 bg-[var(--oa-panel-soft)] px-4 py-3.5 text-sm text-[var(--oa-text)]"
            role="note"
          >
            <p className="font-semibold text-[var(--oa-text)]">Il formato della miniatura lo decide Google.</p>
            <p className="mt-1 text-xs sm:text-sm leading-relaxed text-[var(--oa-muted)]">
              Un pass socio non può diventare alto come un biglietto cinema. Possiamo renderlo più curato con logo reale, colore e hero; il QR resta nell&apos;area di verifica e non va usato come logo.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="wallet-bg-color" className={labelClass}>
                    Colore sfondo Wallet
                  </label>
                  <div className="mt-1.5 flex items-center gap-2.5">
                    <input
                      id="wallet-bg-color"
                      type="color"
                      aria-label="Selettore colore sfondo Wallet"
                      className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-[var(--oa-line-strong)] bg-[var(--oa-panel)] p-1"
                      value={
                        /^#[0-9A-Fa-f]{6}$/.test(walletForm.wallet_bg_color.trim())
                          ? walletForm.wallet_bg_color.trim()
                          : "#0B3C75"
                      }
                      onChange={(e) =>
                        setWalletForm((prev) => ({ ...prev, wallet_bg_color: e.target.value }))
                      }
                    />
                    <input
                      className={`${inputClass} !mt-0 font-mono`}
                      type="text"
                      placeholder="#0B3C75"
                      value={walletForm.wallet_bg_color}
                      onChange={(e) =>
                        setWalletForm((prev) => ({ ...prev, wallet_bg_color: e.target.value }))
                      }
                    />
                  </div>
                  {org?.wallet_effective_bg_color && !org.wallet_bg_color && (
                    <p className="mt-1.5 text-xs text-[var(--oa-muted)]">
                      Fallback attivo: {org.wallet_effective_bg_color} (es. Golden Age).
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="wallet-title" className={labelClass}>
                    Titolo Wallet (override)
                  </label>
                  <input
                    id="wallet-title"
                    className={inputClass}
                    type="text"
                    placeholder="ASSO.N.A.M. / Golden Age Club"
                    value={walletForm.wallet_title_override}
                    onChange={(e) =>
                      setWalletForm((prev) => ({ ...prev, wallet_title_override: e.target.value }))
                    }
                  />
                  {org?.wallet_effective_title_override && !org.wallet_title_override && (
                    <p className="mt-1.5 text-xs text-[var(--oa-muted)]">
                      Fallback attivo: {org.wallet_effective_title_override}
                    </p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="inline-flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--oa-line)] bg-[var(--oa-panel-soft)] px-4 py-3 text-sm text-[var(--oa-text)]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[var(--oa-line-strong)] accent-[var(--oa-brand)]"
                      checked={walletForm.wallet_is_test_prefix}
                      onChange={(e) =>
                        setWalletForm((prev) => ({
                          ...prev,
                          wallet_is_test_prefix: e.target.checked,
                        }))
                      }
                    />
                    <span>Abilita prefisso demo (&quot;[SOLO TEST]&quot;) solo quando <code>WALLET_DEMO_MODE=true</code></span>
                  </label>
                </div>
              </div>

              <div className="border-t border-[var(--oa-line)] pt-5">
                <h3 className="text-sm font-semibold text-[var(--oa-text)]">Asset immagini</h3>
                <p className="mt-1 text-xs text-[var(--oa-muted)]">
                  Logo quadrato (1:1, consigliato 660×660 PNG) e Hero image (consigliata 1032×812 PNG/JPG). Max 2 MB per file.
                </p>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-[var(--oa-line-strong)] bg-[var(--oa-panel-soft)] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className={labelClass}>Logo Wallet (1:1)</span>
                      {(org?.wallet_logo_url || org?.wallet_effective_logo_url) && (
                        <a
                          href={org.wallet_logo_url || org.wallet_effective_logo_url || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-[var(--oa-brand-strong)] hover:underline"
                        >
                          Apri immagine logo
                        </a>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--oa-muted)]">
                      Google ritaglia il logo in una maschera circolare (lascia 15% di margine).
                    </p>
                    <input
                      ref={walletLogoInputRef}
                      id="wallet-logo-input"
                      type="file"
                      accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                      aria-label="Logo Wallet"
                      className="sr-only"
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setWalletLogoFile(e.target.files?.[0] ?? null)
                      }
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="btn-secondary !px-3 !py-1.5 text-xs font-semibold"
                        onClick={() => walletLogoInputRef.current?.click()}
                      >
                        {walletLogoFile ? "Cambia logo" : "Scegli logo"}
                      </button>
                      {walletLogoFile && (
                        <span className="truncate text-xs font-medium text-[var(--oa-text)]">
                          {walletLogoFile.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--oa-line-strong)] bg-[var(--oa-panel-soft)] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className={labelClass}>Hero image Wallet</span>
                      {(org?.wallet_hero_image_url || org?.wallet_effective_hero_image_url) && (
                        <a
                          href={org.wallet_hero_image_url || org.wallet_effective_hero_image_url || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-[var(--oa-brand-strong)] hover:underline"
                        >
                          Apri hero image
                        </a>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--oa-muted)]">
                      Banner orizzontale visibile aprendo il pass (1032×812, senza QR né testo).
                    </p>
                    <input
                      ref={walletHeroInputRef}
                      id="wallet-hero-input"
                      type="file"
                      accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                      aria-label="Hero image Wallet"
                      className="sr-only"
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setWalletHeroFile(e.target.files?.[0] ?? null)
                      }
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="btn-secondary !px-3 !py-1.5 text-xs font-semibold"
                        onClick={() => walletHeroInputRef.current?.click()}
                      >
                        {walletHeroFile ? "Cambia hero" : "Scegli hero"}
                      </button>
                      {walletHeroFile && (
                        <span className="truncate text-xs font-medium text-[var(--oa-text)]">
                          {walletHeroFile.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <aside className="lg:sticky lg:top-24">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--oa-muted)]">
                Anteprima indicativa
              </p>
              <div
                className="mt-2 overflow-hidden rounded-2xl border border-white/15 shadow-[0_18px_45px_rgba(15,23,42,0.28)]"
                style={{ backgroundColor: walletForm.wallet_bg_color || "#0B3C75" }}
              >
                <div className="flex items-center gap-3 px-4 py-4 text-white">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm">
                    <img
                      src={walletPreviewLogo}
                      alt="Logo Wallet in anteprima"
                      className="h-full w-full object-contain p-1"
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-white">
                      {walletForm.wallet_is_test_prefix ? `[SOLO TEST] ${walletPreviewTitle}` : walletPreviewTitle}
                    </p>
                    <p className="text-sm text-white/75">Tessera socio</p>
                  </div>
                </div>
                {walletPreviewHero && (
                  <img
                    src={walletPreviewHero}
                    alt="Hero Wallet in anteprima"
                    className="aspect-[1032/812] w-full object-cover"
                  />
                )}
                <div className="grid grid-cols-2 gap-3 px-4 py-4 text-white">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/65">Tessera</p>
                    <p className="mt-0.5 text-sm font-medium text-white">N. 0000 · 2026</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/65">Validità</p>
                    <p className="mt-0.5 text-sm font-medium text-white">Attiva</p>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[var(--oa-muted)]">
                La hero appare quando la tessera viene aperta; nella home Wallet restano visibili soprattutto logo, titolo e colore.
              </p>
            </aside>
          </div>

          {walletSaveMsg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3" role="status">
              <p className="text-sm font-medium text-emerald-700">{walletSaveMsg}</p>
            </div>
          )}
          {walletSaveError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3" role="alert">
              <p className="text-sm font-medium text-rose-700">{walletSaveError}</p>
            </div>
          )}

          <div className="flex justify-end border-t border-[var(--oa-line)] pt-5">
            <button
              type="submit"
              className="btn-primary inline-flex items-center gap-2"
              disabled={walletSaving}
            >
              {walletSaving && <Spinner />}
              <span>{walletSaving ? "Salvataggio..." : "Salva modifiche Wallet"}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default OrgAdminSettings;
