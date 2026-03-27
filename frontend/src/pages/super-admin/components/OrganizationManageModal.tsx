import { FormEvent, memo, useEffect, useState } from "react";
import {
  createSuperAdminOrganization,
  deleteSuperAdminSumUpApiKey,
  fetchOrganizationNumberingConfig,
  fetchSuperAdminMembershipPaymentSettings,
  patchSuperAdminOrganization,
  patchSuperAdminMembershipPaymentSettings,
  patchOrganizationNumberingConfig,
  saveSuperAdminSumUpApiKey,
  setOrganizationCardRange,
  addOrgCardBatch,
  patchOrgCardLot,
  deleteOrgCardLot,
  fetchOrgBatches,
  runAnnualMaintenance,
  uploadSuperAdminStatute,
  type SuperAdminOrganization,
  type OrgBatch,
  type OrganizationNumberingConfig,
  type SuperAdminMembershipPaymentSettings,
} from "../../../lib/api";
import ConfirmModal from "../../../components/ui/ConfirmModal";

export type OrganizationModalType = "create" | "range" | "add-batch" | "view-batches" | "branding";

type OrganizationManageModalProps = {
  open: boolean;
  modalType: OrganizationModalType;
  selectedOrg: SuperAdminOrganization | null;
  onClose: () => void;
  onSaved: () => void;
  onSwitchToAddBatch: () => void;
};

type ModalFormData = {
  name: string;
  slug: string;
  club_display_name: string;
  whatsapp_e164: string;
  card_email_subject: string;
  card_logo_url: string;
  city: string;
  province: string;
  description_short: string;
  is_active: boolean;
  auto_approve_signup: boolean;
  require_membership_document: boolean;
  accounting_enabled: boolean;
  numbering_mode: "shared_assonam" | "dedicated";
  from_no: string;
  to_no: string;
};

type BatchEditFormData = {
  status: "active" | "inactive";
  year: string;
  notes: string;
  range_start: string;
  range_end: string;
};

type MembershipPaymentFormData = {
  payment_provider: "none" | "sumup";
  payment_required_before_card: boolean;
  membership_payment_label: string;
  membership_fee_amount: string;
  membership_fee_currency: string;
  payment_button_label: string;
  sumup_enabled: boolean;
  sumup_api_key: string;
  sumup_api_key_configured: boolean;
  sumup_api_key_last4: string | null;
  sumup_api_key_configured_at: string | null;
  remove_sumup_api_key: boolean;
  show_sumup_api_key: boolean;
};

const createInitialFormData = (): ModalFormData => ({
  name: "",
  slug: "",
  club_display_name: "",
  whatsapp_e164: "",
  card_email_subject: "",
  card_logo_url: "",
  city: "",
  province: "",
  description_short: "",
  is_active: true,
  auto_approve_signup: false,
  require_membership_document: false,
  accounting_enabled: false,
  numbering_mode: "shared_assonam",
  from_no: "",
  to_no: "",
});

const createBatchEditFormData = (batch: OrgBatch): BatchEditFormData => ({
  status: batch.is_enabled ? "active" : "inactive",
  year: String(batch.year),
  notes: batch.notes ?? "",
  range_start: String(batch.start_no),
  range_end: String(batch.end_no),
});

const createInitialMembershipPaymentFormData = (): MembershipPaymentFormData => ({
  payment_provider: "none",
  payment_required_before_card: false,
  membership_payment_label: "",
  membership_fee_amount: "",
  membership_fee_currency: "EUR",
  payment_button_label: "Paga con carta",
  sumup_enabled: false,
  sumup_api_key: "",
  sumup_api_key_configured: false,
  sumup_api_key_last4: null,
  sumup_api_key_configured_at: null,
  remove_sumup_api_key: false,
  show_sumup_api_key: false,
});

const mapMembershipPaymentSettingsToForm = (
  settings: SuperAdminMembershipPaymentSettings,
): MembershipPaymentFormData => ({
  payment_provider: settings.payment_provider,
  payment_required_before_card: settings.payment_required_before_card,
  membership_payment_label: settings.membership_payment_label ?? "",
  membership_fee_amount:
    settings.membership_fee_amount != null ? String(settings.membership_fee_amount) : "",
  membership_fee_currency: settings.membership_fee_currency ?? "EUR",
  payment_button_label: settings.payment_button_label ?? "Paga con carta",
  sumup_enabled: settings.sumup_enabled,
  sumup_api_key: "",
  sumup_api_key_configured: settings.sumup_api_key_configured,
  sumup_api_key_last4: settings.sumup_api_key_last4,
  sumup_api_key_configured_at: settings.sumup_api_key_configured_at,
  remove_sumup_api_key: false,
  show_sumup_api_key: false,
});

const BATCH_DELETE_CONFIRMATION_TEXT = "ELIMINA";

const batchStatusClassName = (batch: OrgBatch): string => {
  if (batch.status_label === "Attivo") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (batch.status_label === "Disattivo") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (batch.status_label === "Esaurito") {
    return "border-neutral-200 bg-neutral-100 text-neutral-600";
  }
  return "border-neutral-200 bg-neutral-50 text-neutral-600";
};

const OrganizationManageModal = memo(function OrganizationManageModal({
  open,
  modalType,
  selectedOrg,
  onClose,
  onSaved,
  onSwitchToAddBatch,
}: OrganizationManageModalProps) {
  const [formData, setFormData] = useState<ModalFormData>(createInitialFormData);
  const [statuteFile, setStatuteFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [batches, setBatches] = useState<OrgBatch[]>([]);
  const [batchesSummary, setBatchesSummary] = useState<{
    total: number;
    assigned: number;
    remaining: number;
  } | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [maintenanceRunning, setMaintenanceRunning] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [maintenanceConfirmOpen, setMaintenanceConfirmOpen] = useState(false);
  const [batchesCurrentYear, setBatchesCurrentYear] = useState<number | null>(null);
  const [nextResetAt, setNextResetAt] = useState<string | null>(null);
  const [editingBatch, setEditingBatch] = useState<OrgBatch | null>(null);
  const [editBatchFormData, setEditBatchFormData] = useState<BatchEditFormData | null>(null);
  const [deleteBatchTarget, setDeleteBatchTarget] = useState<OrgBatch | null>(null);
  const [deleteBatchConfirmation, setDeleteBatchConfirmation] = useState("");
  const [batchActionSubmitting, setBatchActionSubmitting] = useState(false);
  const [batchActionError, setBatchActionError] = useState("");
  const [numberingConfig, setNumberingConfig] = useState<OrganizationNumberingConfig | null>(null);
  const [loadingNumbering, setLoadingNumbering] = useState(false);
  const [numberingConfirmOpen, setNumberingConfirmOpen] = useState(false);
  const [membershipPaymentFormData, setMembershipPaymentFormData] = useState<MembershipPaymentFormData>(
    createInitialMembershipPaymentFormData,
  );
  const [loadingMembershipPayment, setLoadingMembershipPayment] = useState(false);
  const [membershipPaymentMessage, setMembershipPaymentMessage] = useState("");
  const currentBrandingNumberingMode =
    numberingConfig?.numbering_mode === "dedicated" ? "dedicated" : "shared_assonam";
  const numberingModeChanged =
    modalType === "branding" &&
    selectedOrg !== null &&
    numberingConfig !== null &&
    formData.numbering_mode !== currentBrandingNumberingMode;

  const normalizeOptionalString = (value: string): string | null => {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  };

  const refreshBatches = async (orgId: number) => {
    setLoadingBatches(true);
    setSubmitError("");
    try {
      const result = await fetchOrgBatches(orgId);
      setBatches(result.batches);
      setBatchesSummary(result.summary);
      setBatchesCurrentYear(result.current_year);
      setNextResetAt(result.next_reset_at);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Errore nel caricamento dei lotti");
      throw err;
    } finally {
      setLoadingBatches(false);
    }
  };

  const openEditBatchDialog = (batch: OrgBatch) => {
    setBatchActionError("");
    setDeleteBatchTarget(null);
    setDeleteBatchConfirmation("");
    setEditingBatch(batch);
    setEditBatchFormData(createBatchEditFormData(batch));
  };

  const closeEditBatchDialog = () => {
    setEditingBatch(null);
    setEditBatchFormData(null);
    setBatchActionError("");
    setBatchActionSubmitting(false);
  };

  const openDeleteBatchDialog = (batch: OrgBatch) => {
    setBatchActionError("");
    setEditingBatch(null);
    setEditBatchFormData(null);
    setDeleteBatchTarget(batch);
    setDeleteBatchConfirmation("");
  };

  const closeDeleteBatchDialog = () => {
    setDeleteBatchTarget(null);
    setDeleteBatchConfirmation("");
    setBatchActionError("");
    setBatchActionSubmitting(false);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    setFormData(createInitialFormData());
    setStatuteFile(null);
    setSubmitting(false);
    setSubmitError("");
    setBatches([]);
    setBatchesSummary(null);
    setMaintenanceMessage("");
    setMaintenanceConfirmOpen(false);
    setBatchesCurrentYear(null);
    setNextResetAt(null);
    setEditingBatch(null);
    setEditBatchFormData(null);
    setDeleteBatchTarget(null);
    setDeleteBatchConfirmation("");
    setBatchActionSubmitting(false);
    setBatchActionError("");
    setNumberingConfig(null);
    setLoadingNumbering(false);
    setNumberingConfirmOpen(false);
    setMembershipPaymentFormData(createInitialMembershipPaymentFormData());
    setLoadingMembershipPayment(false);
    setMembershipPaymentMessage("");
  }, [open, modalType, selectedOrg?.id]);

  useEffect(() => {
    if (!open || !selectedOrg || modalType !== "branding") {
      return;
    }
    setFormData((prev) => ({
      ...prev,
      name: selectedOrg.name ?? "",
      slug: selectedOrg.slug ?? "",
      club_display_name: selectedOrg.club_display_name ?? "",
      whatsapp_e164: selectedOrg.whatsapp_e164 ?? "",
      card_email_subject: selectedOrg.card_email_subject ?? "",
      card_logo_url: selectedOrg.card_logo_url ?? "",
      auto_approve_signup: Boolean(selectedOrg.auto_approve_signup),
      require_membership_document: Boolean(selectedOrg.require_membership_document),
      accounting_enabled: Boolean(selectedOrg.accounting_enabled),
      numbering_mode:
        selectedOrg.numbering_mode === "dedicated" ? "dedicated" : "shared_assonam",
    }));
  }, [open, modalType, selectedOrg]);

  useEffect(() => {
    if (!open || !selectedOrg || modalType !== "branding") {
      return;
    }
    let active = true;
    setLoadingNumbering(true);
    fetchOrganizationNumberingConfig(selectedOrg.id)
      .then((result) => {
        if (!active) return;
        setNumberingConfig(result);
        setFormData((prev) => ({
          ...prev,
          numbering_mode:
            result.numbering_mode === "dedicated" ? "dedicated" : "shared_assonam",
        }));
      })
      .catch((err) => {
        if (!active) return;
        setSubmitError(err instanceof Error ? err.message : "Errore caricamento numerazione");
      })
      .finally(() => {
        if (!active) return;
        setLoadingNumbering(false);
      });

    return () => {
      active = false;
    };
  }, [open, modalType, selectedOrg]);

  useEffect(() => {
    if (!open || !selectedOrg || modalType !== "branding") {
      return;
    }
    let active = true;
    setLoadingMembershipPayment(true);
    fetchSuperAdminMembershipPaymentSettings(selectedOrg.id)
      .then((result) => {
        if (!active) return;
        setMembershipPaymentFormData(mapMembershipPaymentSettingsToForm(result));
      })
      .catch((err) => {
        if (!active) return;
        setSubmitError(err instanceof Error ? err.message : "Errore caricamento impostazioni pagamento");
      })
      .finally(() => {
        if (!active) return;
        setLoadingMembershipPayment(false);
      });

    return () => {
      active = false;
    };
  }, [open, modalType, selectedOrg]);

  useEffect(() => {
    if (!open || modalType !== "view-batches" || !selectedOrg) {
      return;
    }
    let active = true;
    setLoadingBatches(true);
    setSubmitError("");
    fetchOrgBatches(selectedOrg.id)
      .then((result) => {
        if (!active) return;
        setBatches(result.batches);
        setBatchesSummary(result.summary);
        setBatchesCurrentYear(result.current_year);
        setNextResetAt(result.next_reset_at);
      })
      .catch(() => {
        if (!active) return;
        setSubmitError("Errore nel caricamento dei lotti");
      })
      .finally(() => {
        if (!active) return;
        setLoadingBatches(false);
      });

    return () => {
      active = false;
    };
  }, [open, modalType, selectedOrg]);

  useEffect(() => {
    if (
      !open &&
      !editingBatch &&
      !deleteBatchTarget &&
      !maintenanceConfirmOpen &&
      !numberingConfirmOpen
    ) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (deleteBatchTarget) {
        closeDeleteBatchDialog();
        return;
      }
      if (editingBatch) {
        closeEditBatchDialog();
        return;
      }
      if (maintenanceConfirmOpen && !maintenanceRunning) {
        setMaintenanceConfirmOpen(false);
        return;
      }
      if (numberingConfirmOpen && !submitting) {
        setNumberingConfirmOpen(false);
        return;
      }
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    deleteBatchTarget,
    editingBatch,
    maintenanceConfirmOpen,
    maintenanceRunning,
    numberingConfirmOpen,
    onClose,
    open,
    submitting,
  ]);

  const saveOrganizationChanges = async () => {
    if (submitting) return;

    setSubmitting(true);
    setSubmitError("");
    setMembershipPaymentMessage("");
    setNumberingConfirmOpen(false);

    try {
      if (modalType === "create") {
        const payload = {
          name: formData.name,
          slug: formData.slug || undefined,
          club_display_name: normalizeOptionalString(formData.club_display_name) ?? undefined,
          whatsapp_e164: normalizeOptionalString(formData.whatsapp_e164) ?? undefined,
          card_email_subject: normalizeOptionalString(formData.card_email_subject) ?? undefined,
          card_logo_url: normalizeOptionalString(formData.card_logo_url) ?? undefined,
          city: formData.city || undefined,
          province: formData.province || undefined,
          description_short: formData.description_short || undefined,
          is_active: formData.is_active,
          auto_approve_signup: formData.auto_approve_signup,
          require_membership_document: formData.require_membership_document,
          accounting_enabled: formData.accounting_enabled,
          numbering_mode: formData.numbering_mode,
        };
        const newOrg = await createSuperAdminOrganization(payload);
        if (statuteFile && newOrg.id) {
          await uploadSuperAdminStatute(newOrg.id, statuteFile);
        }
      } else if ((modalType === "range" || modalType === "add-batch") && selectedOrg) {
        const from = parseInt(formData.from_no, 10);
        const to = parseInt(formData.to_no, 10);
        if (Number.isNaN(from) || Number.isNaN(to)) {
          throw new Error("Numeri non validi");
        }
        if (from <= 0 || to <= 0) {
          throw new Error("I numeri devono essere positivi");
        }
        if (from > to) {
          throw new Error("Il numero iniziale deve essere minore o uguale al finale");
        }

        if (modalType === "range") {
          await setOrganizationCardRange(selectedOrg.id, from, to);
        } else {
          await addOrgCardBatch(selectedOrg.id, from, to);
        }
      } else if (modalType === "branding" && selectedOrg) {
        await patchSuperAdminOrganization(selectedOrg.id, {
          club_display_name: normalizeOptionalString(formData.club_display_name),
          whatsapp_e164: normalizeOptionalString(formData.whatsapp_e164),
          card_email_subject: normalizeOptionalString(formData.card_email_subject),
          card_logo_url: normalizeOptionalString(formData.card_logo_url),
          auto_approve_signup: formData.auto_approve_signup,
          require_membership_document: formData.require_membership_document,
          accounting_enabled: formData.accounting_enabled,
        });
        const requiresPayment = membershipPaymentFormData.payment_required_before_card;
        const provider = membershipPaymentFormData.payment_provider;
        const paymentLabel = normalizeOptionalString(
          membershipPaymentFormData.membership_payment_label,
        );
        const amountValue = membershipPaymentFormData.membership_fee_amount.trim();
        const amount =
          amountValue.length > 0 ? Number(amountValue.replace(",", ".")) : null;
        const currency =
          membershipPaymentFormData.membership_fee_currency.trim().toUpperCase() || "EUR";
        const buttonLabel =
          normalizeOptionalString(membershipPaymentFormData.payment_button_label) || "Paga con carta";
        const hasExistingKey = membershipPaymentFormData.sumup_api_key_configured;
        const hasNewKey = membershipPaymentFormData.sumup_api_key.trim().length > 0;

        if (requiresPayment && provider !== "sumup") {
          throw new Error("Se il pagamento è obbligatorio devi selezionare SumUp.");
        }
        if (provider === "sumup") {
          if (!paymentLabel) {
            throw new Error("Inserisci cosa paga il socio.");
          }
          if (amount == null || Number.isNaN(amount) || amount <= 0) {
            throw new Error("Inserisci un importo quota valido.");
          }
          if (!currency) {
            throw new Error("Inserisci una valuta valida.");
          }
          if (requiresPayment && !hasExistingKey && !hasNewKey) {
            throw new Error("Configura la API key SumUp prima di attivare il pagamento obbligatorio.");
          }
        }

        let nextMembershipSettings = await patchSuperAdminMembershipPaymentSettings(selectedOrg.id, {
          payment_provider: provider,
          payment_required_before_card: requiresPayment,
          membership_payment_label: paymentLabel,
          membership_fee_amount: amount,
          membership_fee_currency: currency,
          payment_button_label: buttonLabel,
        });

        if (hasNewKey) {
          nextMembershipSettings = await saveSuperAdminSumUpApiKey(
            selectedOrg.id,
            membershipPaymentFormData.sumup_api_key.trim(),
          );
        } else if (
          membershipPaymentFormData.remove_sumup_api_key &&
          membershipPaymentFormData.sumup_api_key_configured
        ) {
          nextMembershipSettings = await deleteSuperAdminSumUpApiKey(selectedOrg.id);
        }
        setMembershipPaymentFormData(mapMembershipPaymentSettingsToForm(nextMembershipSettings));
        setMembershipPaymentMessage("Configurazione pagamento quota salvata.");

        if (formData.numbering_mode !== currentBrandingNumberingMode) {
          const result = await patchOrganizationNumberingConfig(selectedOrg.id, formData.numbering_mode);
          setNumberingConfig({
            organization_id: result.organization_id,
            organization_name: result.organization_name,
            numbering_mode: result.numbering_mode,
            numbering_scope_id: result.numbering_scope_id,
            numbering_scope_name: result.numbering_scope_name,
            numbering_scope_type: result.numbering_scope_type,
            numbering_scope_prefix: result.numbering_scope_prefix,
            numbering_scope_description: result.numbering_scope_description,
            numbering_scope_is_system: result.numbering_scope_is_system,
            is_freely_editable: result.is_freely_editable,
            is_sensitive: result.is_sensitive,
            members_with_cards: result.members_with_cards,
            total_batches: result.total_batches,
            real_used_batches: result.real_used_batches,
            batches_with_linked_members: result.batches_with_linked_members,
            warning_message: result.warning_message,
          });
        }
      }

      onSaved();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Errore operazione");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (numberingModeChanged) {
      setNumberingConfirmOpen(true);
      return;
    }
    await saveOrganizationChanges();
  };

  const handleRunMaintenance = () => {
    if (maintenanceRunning) return;
    setMaintenanceConfirmOpen(true);
  };

  const confirmRunMaintenance = async () => {
    setMaintenanceRunning(true);
    setMaintenanceMessage("");
    setSubmitError("");
    try {
      const result = await runAnnualMaintenance(true);
      setMaintenanceMessage(
        `Manutenzione completata: ${result.expired_count} soci scaduti, ${result.purged_count} soci purgati.`
      );
      if (selectedOrg) {
        await refreshBatches(selectedOrg.id);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Errore esecuzione manutenzione");
    } finally {
      setMaintenanceRunning(false);
    }
  };

  const handleSaveBatch = async (event: FormEvent) => {
    event.preventDefault();
    if (
      batchActionSubmitting ||
      !selectedOrg ||
      !editingBatch ||
      !editBatchFormData
    ) {
      return;
    }

    setBatchActionSubmitting(true);
    setBatchActionError("");

    try {
      const payload: {
        status?: "active" | "inactive";
        year?: number;
        notes?: string | null;
        range_start?: number;
        range_end?: number;
      } = {};

      const nextStatus = editBatchFormData.status;
      if (nextStatus !== (editingBatch.is_enabled ? "active" : "inactive")) {
        payload.status = nextStatus;
      }

      const nextNotes = normalizeOptionalString(editBatchFormData.notes);
      const currentNotes = editingBatch.notes ?? null;
      if (nextNotes !== currentNotes) {
        payload.notes = nextNotes;
      }

      const parsedYear = Number.parseInt(editBatchFormData.year, 10);
      if (Number.isNaN(parsedYear) || parsedYear < 2000) {
        throw new Error("Anno lotto non valido");
      }
      if (parsedYear !== editingBatch.year) {
        payload.year = parsedYear;
      }

      if (editingBatch.range_editable) {
        const parsedStart = Number.parseInt(editBatchFormData.range_start, 10);
        const parsedEnd = Number.parseInt(editBatchFormData.range_end, 10);
        if (Number.isNaN(parsedStart) || Number.isNaN(parsedEnd)) {
          throw new Error("Inserisci un range valido");
        }
        if (parsedStart <= 0 || parsedEnd <= 0) {
          throw new Error("I numeri devono essere positivi");
        }
        if (parsedStart > parsedEnd) {
          throw new Error("Il numero iniziale deve essere minore o uguale al finale");
        }
        if (parsedStart !== editingBatch.start_no || parsedEnd !== editingBatch.end_no) {
          payload.range_start = parsedStart;
          payload.range_end = parsedEnd;
        }
      }

      if (Object.keys(payload).length === 0) {
        closeEditBatchDialog();
        return;
      }

      await patchOrgCardLot(selectedOrg.id, editingBatch.id, payload);
      await refreshBatches(selectedOrg.id);
      closeEditBatchDialog();
    } catch (err) {
      setBatchActionError(err instanceof Error ? err.message : "Errore durante la modifica del lotto");
    } finally {
      setBatchActionSubmitting(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (
      batchActionSubmitting ||
      !selectedOrg ||
      !deleteBatchTarget ||
      deleteBatchConfirmation.trim().toUpperCase() !== BATCH_DELETE_CONFIRMATION_TEXT
    ) {
      return;
    }

    setBatchActionSubmitting(true);
    setBatchActionError("");

    try {
      await deleteOrgCardLot(selectedOrg.id, deleteBatchTarget.id);
      await refreshBatches(selectedOrg.id);
      closeDeleteBatchDialog();
    } catch (err) {
      setBatchActionError(err instanceof Error ? err.message : "Errore durante l'eliminazione del lotto");
    } finally {
      setBatchActionSubmitting(false);
    }
  };

  const panelClassName =
    modalType === "view-batches"
      ? "modal-panel w-full max-w-6xl max-h-[90vh] overflow-y-auto p-6"
      : "modal-panel max-w-lg max-h-[90vh] overflow-y-auto p-6";

  if (!open) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <div className={`${panelClassName} relative`} data-component="superadmin-org-manage-modal">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-lg font-semibold text-neutral-900">
              {modalType === "create" && "Nuova associazione"}
              {modalType === "range" && `Imposta range tessere: ${selectedOrg?.name}`}
              {modalType === "add-batch" && `Aggiungi lotto tessere: ${selectedOrg?.name}`}
              {modalType === "view-batches" && `Lotti tessere: ${selectedOrg?.name}`}
              {modalType === "branding" && `Branding e alert: ${selectedOrg?.name}`}
            </h3>
            <button
              type="button"
              className="rounded-full p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900"
              onClick={onClose}
              aria-label="Chiudi finestra"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-4 min-h-[48px]">
            {submitError && (
              <div className="rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}
          </div>

          <form className="mt-2 grid gap-4" onSubmit={handleSubmit}>
          {modalType === "create" && (
            <>
              <div>
                <label htmlFor="name" className="block text-xs font-medium text-neutral-600">
                  Nome associazione *
                </label>
                <input
                  id="name"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="city" className="block text-xs font-medium text-neutral-600">
                    Citta
                  </label>
                  <input
                    id="city"
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="province" className="block text-xs font-medium text-neutral-600">
                    Provincia
                  </label>
                  <input
                    id="province"
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="text"
                    placeholder="RM"
                    maxLength={2}
                    value={formData.province}
                    onChange={(e) => setFormData((prev) => ({ ...prev, province: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="slug" className="block text-xs font-medium text-neutral-600">
                  Slug (opzionale, autogenerato)
                </label>
                <input
                  id="slug"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-xs font-medium text-neutral-600">
                  Descrizione breve
                </label>
                <textarea
                  id="description"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  rows={3}
                  value={formData.description_short}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description_short: e.target.value }))
                  }
                />
              </div>

              <div className="rounded-xl border border-brand/15 bg-brand/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                      Numerazione tessere
                    </p>
                    <p className="mt-1 text-sm text-neutral-600">
                      Default iniziale: Condivisa ASSONAM. Il Super Admin puo modificarla prima del primo uso reale.
                    </p>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    Default ASSONAM
                  </span>
                </div>
                <div className="mt-4 grid gap-3">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3">
                    <input
                      type="radio"
                      name="numbering_mode_create"
                      className="mt-1 text-brand focus:ring-brand"
                      checked={formData.numbering_mode === "shared_assonam"}
                      onChange={() =>
                        setFormData((prev) => ({ ...prev, numbering_mode: "shared_assonam" }))
                      }
                    />
                    <div>
                      <div className="text-sm font-semibold text-neutral-900">Condivisa ASSONAM</div>
                      <p className="mt-1 text-xs leading-5 text-neutral-500">
                        Usa il pool centrale condiviso ASSONAM_CENTRAL insieme alle affiliate configurate nello stesso scope.
                      </p>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3">
                    <input
                      type="radio"
                      name="numbering_mode_create"
                      className="mt-1 text-brand focus:ring-brand"
                      checked={formData.numbering_mode === "dedicated"}
                      onChange={() =>
                        setFormData((prev) => ({ ...prev, numbering_mode: "dedicated" }))
                      }
                    />
                    <div>
                      <div className="text-sm font-semibold text-neutral-900">Dedicata</div>
                      <p className="mt-1 text-xs leading-5 text-neutral-500">
                        Crea uno scope dedicato riservato all'organizzazione, senza conflitti con il pool centrale ASSONAM.
                      </p>
                    </div>
                  </label>
                </div>
                <p className="mt-3 text-xs text-neutral-500">
                  Le tessere gia emesse non verranno mai rinumerate. Questa impostazione controlla solo le future assegnazioni.
                </p>
              </div>

              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  Branding e alert
                </p>
                <div className="mt-3 grid gap-3">
                  <div>
                    <label htmlFor="club_display_name" className="block text-xs font-medium text-neutral-600">
                      Nome club visualizzato
                    </label>
                    <input
                      id="club_display_name"
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      type="text"
                      value={formData.club_display_name}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, club_display_name: e.target.value }))
                      }
                      placeholder="Golden Age Club - Speakeasy"
                    />
                  </div>
                  <div>
                    <label htmlFor="whatsapp_e164" className="block text-xs font-medium text-neutral-600">
                      WhatsApp alert (E.164)
                    </label>
                    <input
                      id="whatsapp_e164"
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      type="text"
                      value={formData.whatsapp_e164}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, whatsapp_e164: e.target.value }))
                      }
                      placeholder="+393331112233"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      Numero usato dal job automatico quando le tessere residue scendono sotto soglia.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="card_email_subject" className="block text-xs font-medium text-neutral-600">
                      Oggetto email tessera
                    </label>
                    <input
                      id="card_email_subject"
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      type="text"
                      value={formData.card_email_subject}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, card_email_subject: e.target.value }))
                      }
                      placeholder="La tua tessera {club_display_name}"
                    />
                  </div>
                  <div>
                    <label htmlFor="card_logo_url" className="block text-xs font-medium text-neutral-600">
                      URL logo tessera (opzionale)
                    </label>
                    <input
                      id="card_logo_url"
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                      type="url"
                      value={formData.card_logo_url}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, card_logo_url: e.target.value }))
                      }
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                  className="rounded border-gray-300 text-brand focus:ring-brand"
                />
                <label htmlFor="is_active" className="text-sm text-neutral-700">
                  Attiva subito
                </label>
              </div>

              <div>
                <label htmlFor="statute_file" className="block text-xs font-medium text-neutral-600">
                  Statuto (PDF, opzionale)
                </label>
                <input
                  id="statute_file"
                  type="file"
                  accept=".pdf"
                  className="mt-1 block text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-700"
                  onChange={(e) => setStatuteFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </>
          )}

          {modalType === "range" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600">Da (Inizio)</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  required
                  value={formData.from_no}
                  onChange={(e) => setFormData((prev) => ({ ...prev, from_no: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600">A (Fine)</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  required
                  value={formData.to_no}
                  onChange={(e) => setFormData((prev) => ({ ...prev, to_no: e.target.value }))}
                />
              </div>
            </div>
          )}

          {modalType === "add-batch" && (
            <div>
              <p className="mb-4 text-sm text-neutral-600">
                Aggiungi un nuovo lotto di tessere per <strong>{selectedOrg?.name}</strong>.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600">
                    Da (numero iniziale)
                  </label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
                    required
                    min="1"
                    value={formData.from_no}
                    onChange={(e) => setFormData((prev) => ({ ...prev, from_no: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600">
                    A (numero finale)
                  </label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
                    required
                    min="1"
                    value={formData.to_no}
                    onChange={(e) => setFormData((prev) => ({ ...prev, to_no: e.target.value }))}
                  />
                </div>
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                Il range non deve sovrapporsi a lotti esistenti (di questa o altre associazioni).
              </p>
            </div>
          )}

          {modalType === "view-batches" && (
            <div>
              <div className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="text-neutral-500">Anno corrente (server)</p>
                    <p className="font-semibold text-neutral-900 tabular-nums">
                      {batchesCurrentYear ?? "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-neutral-500">Reset annuale</p>
                    <p className="font-medium text-neutral-800">
                      {nextResetAt
                        ? `Previsto il ${new Date(nextResetAt).toLocaleDateString("it-IT")}`
                        : "A inizio anno (01/01)"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-xs font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-60"
                    onClick={handleRunMaintenance}
                    disabled={maintenanceRunning}
                  >
                    {maintenanceRunning ? "Manutenzione..." : "Esegui manutenzione annuale"}
                  </button>
                </div>
                {maintenanceMessage && (
                  <p className="mt-2 text-xs text-emerald-700">{maintenanceMessage}</p>
                )}
              </div>

              {loadingBatches ? (
                <p className="text-sm text-neutral-500">Caricamento lotti...</p>
              ) : batches.length === 0 ? (
                <p className="text-sm text-neutral-500">Nessun lotto configurato.</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-neutral-200/80">
                    <table className="min-w-full text-sm">
                      <thead className="bg-neutral-50/80">
                        <tr className="border-b text-left text-[11px] uppercase tracking-[0.14em] text-neutral-500">
                          <th className="px-4 py-3 font-medium">Range</th>
                          <th className="px-4 py-3 font-medium text-right">Next</th>
                          <th className="px-4 py-3 font-medium text-right">Anno</th>
                          <th className="px-4 py-3 font-medium text-right">Stato</th>
                          <th className="px-4 py-3 font-medium text-right">Totale</th>
                          <th className="px-4 py-3 font-medium text-right">Assegnate</th>
                          <th className="px-4 py-3 font-medium text-right">Rimanenti</th>
                          <th className="px-4 py-3 font-medium text-right">Azioni</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 bg-white">
                        {batches.map((batch) => (
                          <tr key={batch.id}>
                            <td className="px-4 py-3">
                              <div className="font-medium text-neutral-900 tabular-nums">
                                {batch.start_no} - {batch.end_no}
                              </div>
                              {batch.notes && (
                                <p className="mt-1 max-w-[18rem] text-xs leading-5 text-neutral-500">
                                  {batch.notes}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">{batch.next_no}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{batch.year}</td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${batchStatusClassName(batch)}`}
                                title={
                                  batch.range_editable
                                    ? undefined
                                    : "Non modificabile per range o anno: esistono assegnazioni"
                                }
                              >
                                {batch.status_label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">{batch.total}</td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {batch.assigned}
                              {batch.linked_members > batch.assigned && (
                                <div className="text-[11px] text-neutral-400">
                                  link: {batch.linked_members}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium text-brand">
                              {batch.remaining}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-900"
                                  onClick={() => openEditBatchDialog(batch)}
                                >
                                  Modifica
                                </button>
                                <button
                                  type="button"
                                  className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                  onClick={() => openDeleteBatchDialog(batch)}
                                  disabled={!batch.deletable}
                                  title={
                                    batch.deletable
                                      ? "Elimina lotto"
                                      : "Impossibile eliminare: esistono tessere gia assegnate"
                                  }
                                >
                                  Elimina
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {batchesSummary && (
                    <div className="mt-4 rounded-md bg-neutral-50 px-4 py-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-600">Totale tessere:</span>
                        <span className="font-medium tabular-nums">{batchesSummary.total}</span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-neutral-600">Assegnate:</span>
                        <span className="font-medium tabular-nums">{batchesSummary.assigned}</span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-neutral-600">Rimanenti:</span>
                        <span className="font-semibold text-brand tabular-nums">{batchesSummary.remaining}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {modalType === "branding" && (
            <div className="grid gap-4">
              <p className="text-sm text-neutral-600">
                Configura branding tessera e numero WhatsApp usato per gli alert automatici.
              </p>
              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  Nome club visualizzato
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                  value={formData.club_display_name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, club_display_name: e.target.value }))
                  }
                  placeholder={selectedOrg?.name ?? "Nome club"}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  WhatsApp alert (E.164)
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                  value={formData.whatsapp_e164}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, whatsapp_e164: e.target.value }))
                  }
                  placeholder="+393331112233"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Numero destinatario degli alert WhatsApp per tessere residue sotto soglia.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  Oggetto email tessera
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                  value={formData.card_email_subject}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, card_email_subject: e.target.value }))
                  }
                  placeholder="La tua tessera {club_display_name}"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Placeholder supportati: {"{club_display_name}"}, {"{org_name}"}.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  URL logo tessera
                </label>
                <input
                  type="url"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                  value={formData.card_logo_url}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, card_logo_url: e.target.value }))
                  }
                  placeholder="https://..."
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Se vuoto, viene usato il logo ufficiale associazione (se presente).
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                      Numerazione tessere
                    </p>
                    <p className="mt-1 text-sm text-neutral-600">
                      Configurazione visibile solo al Super Admin. Le tessere gia emesse non verranno modificate.
                    </p>
                  </div>
                  {loadingNumbering ? (
                    <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-500">
                      Caricamento...
                    </span>
                  ) : (
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        numberingConfig?.is_freely_editable
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {numberingConfig?.is_freely_editable
                        ? "Modificabile liberamente"
                        : "Configurazione sensibile"}
                    </span>
                  )}
                </div>

                {loadingNumbering ? (
                  <p className="mt-4 text-sm text-neutral-500">Recupero configurazione numerazione...</p>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-white/80 bg-white p-3 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                          Scope attuale
                        </p>
                        <p className="mt-2 text-sm font-semibold text-neutral-900">
                          {numberingConfig?.numbering_scope_name ?? "Legacy / non configurato"}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Tipo: {numberingConfig?.numbering_scope_type ?? "legacy"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/80 bg-white p-3 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                          Prefisso visuale
                        </p>
                        <p className="mt-2 text-sm font-semibold text-neutral-900">
                          {numberingConfig?.numbering_scope_prefix ?? "Nessun prefisso"}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {numberingConfig?.numbering_scope_description ?? "Nessuna descrizione configurata."}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2">
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3">
                        <input
                          type="radio"
                          name="numbering_mode_branding"
                          className="mt-1 text-brand focus:ring-brand"
                          checked={formData.numbering_mode === "shared_assonam"}
                          onChange={() =>
                            setFormData((prev) => ({ ...prev, numbering_mode: "shared_assonam" }))
                          }
                        />
                        <div>
                          <div className="text-sm font-semibold text-neutral-900">Condivisa ASSONAM</div>
                          <p className="mt-1 text-xs leading-5 text-neutral-500">
                            Questa organizzazione usa la numerazione centrale condivisa del circuito ASSONAM.
                          </p>
                        </div>
                      </label>
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3">
                        <input
                          type="radio"
                          name="numbering_mode_branding"
                          className="mt-1 text-brand focus:ring-brand"
                          checked={formData.numbering_mode === "dedicated"}
                          onChange={() =>
                            setFormData((prev) => ({ ...prev, numbering_mode: "dedicated" }))
                          }
                        />
                        <div>
                          <div className="text-sm font-semibold text-neutral-900">Dedicata</div>
                          <p className="mt-1 text-xs leading-5 text-neutral-500">
                            Questa organizzazione usa una numerazione indipendente riservata.
                          </p>
                        </div>
                      </label>
                    </div>

                    <div className="mt-4 grid gap-2 text-xs text-neutral-500 md:grid-cols-3">
                      <div className="rounded-xl border border-white/80 bg-white px-3 py-2">
                        Tessere emesse: <span className="font-semibold text-neutral-800">{numberingConfig?.members_with_cards ?? 0}</span>
                      </div>
                      <div className="rounded-xl border border-white/80 bg-white px-3 py-2">
                        Lotti totali: <span className="font-semibold text-neutral-800">{numberingConfig?.total_batches ?? 0}</span>
                      </div>
                      <div className="rounded-xl border border-white/80 bg-white px-3 py-2">
                        Lotti usati: <span className="font-semibold text-neutral-800">{numberingConfig?.real_used_batches ?? 0}</span>
                      </div>
                    </div>

                    {(numberingConfig?.warning_message || numberingModeChanged) && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-sm font-semibold text-amber-800">Attenzione</p>
                        <p className="mt-1 text-sm leading-6 text-amber-700">
                          {numberingConfig?.warning_message ??
                            "Questa modifica influira solo sulle future tessere. Le tessere gia esistenti non verranno modificate."}
                        </p>
                      </div>
                    )}

                    <p className="mt-4 text-xs text-neutral-500">
                      Le tessere gia emesse non verranno modificate. I cambiamenti post-storico valgono solo per le future assegnazioni.
                    </p>
                  </>
                )}
              </div>
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  Impostazioni iscrizioni
                </p>
                <div className="mt-3 flex items-start gap-3">
                  <input
                    id="auto_approve_signup"
                    type="checkbox"
                    className="mt-0.5 rounded border-gray-300 text-brand focus:ring-brand"
                    checked={formData.auto_approve_signup}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        auto_approve_signup: e.target.checked,
                      }))
                    }
                  />
                  <div>
                    <label htmlFor="auto_approve_signup" className="text-sm font-medium text-neutral-800">
                      Iscrizione automatica
                    </label>
                    <p className="mt-1 text-xs text-neutral-500">
                      Se attivo, i nuovi soci vengono approvati subito e ricevono immediatamente la tessera.
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  Modulo documenti
                </p>
                <div className="mt-3 flex items-start gap-3">
                  <input
                    id="accounting_enabled"
                    type="checkbox"
                    className="mt-0.5 rounded border-gray-300 text-brand focus:ring-brand"
                    checked={formData.accounting_enabled}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        accounting_enabled: e.target.checked,
                      }))
                    }
                  />
                  <div>
                    <label htmlFor="accounting_enabled" className="text-sm font-medium text-neutral-800">
                      Contabilità attiva
                    </label>
                    <p className="mt-1 text-xs text-neutral-500">
                      Abilita la tab Contabilità per gli Org Admin e consenti l'invio di documenti accounting.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-start gap-3 border-t border-neutral-200 pt-4">
                  <input
                    id="require_membership_document"
                    type="checkbox"
                    className="mt-0.5 rounded border-gray-300 text-brand focus:ring-brand"
                    checked={formData.require_membership_document}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        require_membership_document: e.target.checked,
                      }))
                    }
                  />
                  <div>
                    <label htmlFor="require_membership_document" className="text-sm font-medium text-neutral-800">
                      Documento obbligatorio per completare l'iscrizione
                    </label>
                    <p className="mt-1 text-xs text-neutral-500">
                      Se attivo, il socio dovrà caricare il documento nella pagina pubblica di iscrizione.
                      Se disattivato, il documento resta facoltativo come ora.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600">
                      Pagamento quota associativa
                    </p>
                    <p className="mt-1 text-sm text-neutral-600">
                      Il socio verrà reindirizzato alla pagina di pagamento SumUp. La tessera verrà emessa solo dopo conferma del pagamento.
                    </p>
                  </div>
                  {loadingMembershipPayment ? (
                    <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-500">
                      Caricamento...
                    </span>
                  ) : membershipPaymentFormData.sumup_api_key_configured ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      Chiave configurata
                    </span>
                  ) : (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                      Chiave mancante
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-start gap-3 rounded-xl border border-white/80 bg-white px-4 py-4">
                  <input
                    id="payment_required_before_card"
                    type="checkbox"
                    className="mt-0.5 rounded border-gray-300 text-brand focus:ring-brand"
                    checked={membershipPaymentFormData.payment_required_before_card}
                    onChange={(e) =>
                      setMembershipPaymentFormData((prev) => ({
                        ...prev,
                        payment_required_before_card: e.target.checked,
                        payment_provider: e.target.checked ? "sumup" : prev.payment_provider,
                      }))
                    }
                  />
                  <div>
                    <label htmlFor="payment_required_before_card" className="text-sm font-medium text-neutral-800">
                      Richiedi pagamento prima dell&apos;emissione tessera
                    </label>
                    <p className="mt-1 text-xs text-neutral-500">
                      Se attivo, nel wizard pubblico comparirà solo il bottone di pagamento online.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600">Provider</label>
                    <select
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                      value={membershipPaymentFormData.payment_provider}
                      onChange={(e) =>
                        setMembershipPaymentFormData((prev) => ({
                          ...prev,
                          payment_provider: e.target.value as "none" | "sumup",
                        }))
                      }
                    >
                      <option value="none">Nessuno</option>
                      <option value="sumup">SumUp</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600">Valuta</label>
                    <input
                      type="text"
                      maxLength={3}
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 uppercase"
                      value={membershipPaymentFormData.membership_fee_currency}
                      onChange={(e) =>
                        setMembershipPaymentFormData((prev) => ({
                          ...prev,
                          membership_fee_currency: e.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="EUR"
                    />
                  </div>
                </div>

                {membershipPaymentFormData.payment_provider === "sumup" ? (
                  <div className="mt-4 grid gap-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-600">Cosa paga il socio</label>
                      <input
                        type="text"
                        className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                        value={membershipPaymentFormData.membership_payment_label}
                        onChange={(e) =>
                          setMembershipPaymentFormData((prev) => ({
                            ...prev,
                            membership_payment_label: e.target.value,
                          }))
                        }
                        placeholder="Quota associativa annuale"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-neutral-600">Importo</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                          value={membershipPaymentFormData.membership_fee_amount}
                          onChange={(e) =>
                            setMembershipPaymentFormData((prev) => ({
                              ...prev,
                              membership_fee_amount: e.target.value,
                            }))
                          }
                          placeholder="25.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-600">Etichetta pulsante frontend</label>
                        <input
                          type="text"
                          className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                          value={membershipPaymentFormData.payment_button_label}
                          onChange={(e) =>
                            setMembershipPaymentFormData((prev) => ({
                              ...prev,
                              payment_button_label: e.target.value,
                            }))
                          }
                          placeholder="Paga con carta"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600">
                            API key SumUp del merchant
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            Dopo il salvataggio la chiave non verrà più mostrata in chiaro.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="text-xs font-semibold text-brand"
                          onClick={() =>
                            setMembershipPaymentFormData((prev) => ({
                              ...prev,
                              show_sumup_api_key: !prev.show_sumup_api_key,
                            }))
                          }
                        >
                          {membershipPaymentFormData.show_sumup_api_key ? "Nascondi" : "Mostra"}
                        </button>
                      </div>
                      <input
                        type={membershipPaymentFormData.show_sumup_api_key ? "text" : "password"}
                        className="mt-3 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                        value={membershipPaymentFormData.sumup_api_key}
                        onChange={(e) =>
                          setMembershipPaymentFormData((prev) => ({
                            ...prev,
                            sumup_api_key: e.target.value,
                            remove_sumup_api_key: false,
                          }))
                        }
                        placeholder={
                          membershipPaymentFormData.sumup_api_key_configured
                            ? "Inserisci una nuova chiave per sostituire quella attuale"
                            : "Inserisci la API key SumUp"
                        }
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                        {membershipPaymentFormData.sumup_api_key_configured ? (
                          <span>
                            Chiave configurata
                            {membershipPaymentFormData.sumup_api_key_last4
                              ? ` • ultime 4: ${membershipPaymentFormData.sumup_api_key_last4}`
                              : ""}
                            {membershipPaymentFormData.sumup_api_key_configured_at
                              ? ` • salvata il ${new Date(membershipPaymentFormData.sumup_api_key_configured_at).toLocaleString("it-IT")}`
                              : ""}
                          </span>
                        ) : (
                          <span>Nessuna chiave configurata.</span>
                        )}
                        {membershipPaymentFormData.sumup_api_key_configured ? (
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={membershipPaymentFormData.remove_sumup_api_key}
                              onChange={(e) =>
                                setMembershipPaymentFormData((prev) => ({
                                  ...prev,
                                  remove_sumup_api_key: e.target.checked,
                                  sumup_api_key: e.target.checked ? "" : prev.sumup_api_key,
                                }))
                              }
                            />
                            Rimuovi chiave salvata
                          </label>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-neutral-200 bg-white px-4 py-4 text-sm text-neutral-500">
                    Seleziona SumUp per configurare il pagamento quota associativa.
                  </div>
                )}

                {membershipPaymentMessage ? (
                  <p className="mt-4 text-sm text-emerald-700">{membershipPaymentMessage}</p>
                ) : null}
              </div>
            </div>
          )}

          {modalType !== "view-batches" && (
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                onClick={onClose}
              >
                Annulla
              </button>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-subtle transition hover:-translate-y-px hover:bg-brand-dark hover:shadow-card active:translate-y-0 disabled:opacity-50"
                disabled={submitting}
              >
                {submitting ? "Salvataggio..." : "Conferma"}
              </button>
            </div>
          )}

          {modalType === "view-batches" && (
            <div className="mt-6 flex justify-between">
              <button
                type="button"
                className="text-sm font-medium text-brand hover:text-brand-dark"
                onClick={onSwitchToAddBatch}
              >
                + Aggiungi lotto
              </button>
              <button
                type="button"
                className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                onClick={onClose}
              >
                Chiudi
              </button>
            </div>
          )}
          </form>
        </div>
      </div>
      {editingBatch && editBatchFormData && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeEditBatchDialog();
            }
          }}
        >
          <div className="modal-panel w-full max-w-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-neutral-900">Modifica lotto</h4>
                <p className="mt-1 text-sm text-neutral-500">
                  Aggiorna stato, anno, note e, se consentito, il range del lotto.
                </p>
              </div>
              <button
                type="button"
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                onClick={closeEditBatchDialog}
              >
                Chiudi
              </button>
            </div>

            {batchActionError && (
              <div className="mt-4 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{batchActionError}</p>
              </div>
            )}

            <form className="mt-5 grid gap-4" onSubmit={handleSaveBatch}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-neutral-600">Stato</label>
                  <select
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                    value={editBatchFormData.status}
                    onChange={(event) =>
                      setEditBatchFormData((prev) =>
                        prev ? { ...prev, status: event.target.value as "active" | "inactive" } : prev
                      )
                    }
                  >
                    <option value="active">Attivo</option>
                    <option value="inactive">Disattivo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600">Anno</label>
                  <input
                    type="number"
                    min="2000"
                    title={
                      editingBatch.range_editable
                        ? undefined
                        : "Non modificabile perche esistono assegnazioni"
                    }
                    disabled={!editingBatch.range_editable}
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-100"
                    value={editBatchFormData.year}
                    onChange={(event) =>
                      setEditBatchFormData((prev) =>
                        prev ? { ...prev, year: event.target.value } : prev
                      )
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600">Note</label>
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                  placeholder="Descrizione interna del lotto"
                  value={editBatchFormData.notes}
                  onChange={(event) =>
                    setEditBatchFormData((prev) =>
                      prev ? { ...prev, notes: event.target.value } : prev
                    )
                  }
                />
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">Range lotto</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {editingBatch.range_editable
                        ? "Puoi modificare il range solo per lotti senza assegnazioni."
                        : "Non modificabile perche esistono assegnazioni."}
                    </p>
                  </div>
                  {!editingBatch.range_editable && (
                    <span
                      className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
                      title="Non modificabile perche esistono assegnazioni"
                    >
                      Bloccato
                    </span>
                  )}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600">Da</label>
                    <input
                      type="number"
                      min="1"
                      title={
                        editingBatch.range_editable
                          ? undefined
                          : "Non modificabile perche esistono assegnazioni"
                      }
                      disabled={!editingBatch.range_editable}
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-100"
                      value={editBatchFormData.range_start}
                      onChange={(event) =>
                        setEditBatchFormData((prev) =>
                          prev ? { ...prev, range_start: event.target.value } : prev
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600">A</label>
                    <input
                      type="number"
                      min="1"
                      title={
                        editingBatch.range_editable
                          ? undefined
                          : "Non modificabile perche esistono assegnazioni"
                      }
                      disabled={!editingBatch.range_editable}
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-100"
                      value={editBatchFormData.range_end}
                      onChange={(event) =>
                        setEditBatchFormData((prev) =>
                          prev ? { ...prev, range_end: event.target.value } : prev
                        )
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                  onClick={closeEditBatchDialog}
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-subtle transition hover:-translate-y-px hover:bg-brand-dark hover:shadow-card active:translate-y-0 disabled:opacity-50"
                  disabled={batchActionSubmitting}
                >
                  {batchActionSubmitting ? "Salvataggio..." : "Salva modifiche"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {deleteBatchTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeDeleteBatchDialog();
            }
          }}
        >
          <div className="modal-panel w-full max-w-lg p-6">
            <div className="flex items-start justify-between gap-4">
              <h4 className="text-lg font-semibold text-neutral-900">Elimina lotto</h4>
              <button
                type="button"
                className="rounded-full p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900"
                onClick={closeDeleteBatchDialog}
                aria-label="Chiudi finestra"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Questa azione rimuove il lotto{" "}
              <span className="font-semibold tabular-nums">
                {deleteBatchTarget.start_no} - {deleteBatchTarget.end_no}
              </span>
              . Procedi solo se il lotto non contiene tessere gia assegnate.
            </p>

            {batchActionError && (
              <div className="mt-4 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{batchActionError}</p>
              </div>
            )}

            <div className="mt-5 rounded-xl border border-red-200/70 bg-red-50/80 p-4">
              <p className="text-sm font-semibold text-red-800">Conferma obbligatoria</p>
              <p className="mt-1 text-xs leading-5 text-red-700">
                Scrivi <span className="font-semibold">{BATCH_DELETE_CONFIRMATION_TEXT}</span> per confermare l'eliminazione.
              </p>
              <input
                type="text"
                className="mt-3 w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-neutral-800"
                placeholder={BATCH_DELETE_CONFIRMATION_TEXT}
                value={deleteBatchConfirmation}
                onChange={(event) => setDeleteBatchConfirmation(event.target.value)}
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
                onClick={closeDeleteBatchDialog}
              >
                Annulla
              </button>
              <button
                type="button"
                className="rounded-md border border-red-200 bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleDeleteBatch}
                disabled={
                  batchActionSubmitting ||
                  deleteBatchConfirmation.trim().toUpperCase() !== BATCH_DELETE_CONFIRMATION_TEXT
                }
              >
                {batchActionSubmitting ? "Eliminazione..." : "Conferma eliminazione"}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        open={maintenanceConfirmOpen}
        title="Esegui manutenzione annuale"
        description="Conferma l'esecuzione della manutenzione annuale. Verranno scaduti e purgati i soci con tessera di anni precedenti."
        confirmLabel="Esegui manutenzione"
        tone="danger"
        confirmState={maintenanceRunning ? "loading" : "idle"}
        onClose={() => {
          if (!maintenanceRunning) {
            setMaintenanceConfirmOpen(false);
          }
        }}
        onConfirm={confirmRunMaintenance}
      />
      <ConfirmModal
        open={numberingConfirmOpen}
        title="Conferma modifica numerazione"
        description={
          numberingConfig?.is_sensitive
            ? "Questa organizzazione ha gia storico o lotti usati. Il cambio influira solo sulle future tessere."
            : "La configurazione e ancora libera. Conferma il cambio della modalita di numerazione."
        }
        confirmLabel="Conferma modifica"
        tone={numberingConfig?.is_sensitive ? "danger" : "brand"}
        confirmState={submitting ? "loading" : "idle"}
        onClose={() => {
          if (!submitting) {
            setNumberingConfirmOpen(false);
          }
        }}
        onConfirm={saveOrganizationChanges}
      />
    </>
  );
});

export default OrganizationManageModal;
