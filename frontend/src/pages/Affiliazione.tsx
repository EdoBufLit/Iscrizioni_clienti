import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  createAffiliationDraft,
  createAffiliationStripeCheckout,
  fetchAffiliationDraft,
  patchAffiliationDraft,
  replaceAffiliationPeople,
  retryAffiliationWelcomeVideo,
  submitAffiliationDraft,
  uploadAffiliationDocument,
  type AffiliationDraft,
  type AffiliationSubmitResponse,
} from "../lib/api";
import { applySeo } from "../lib/seo";
import {
  affiliationDocumentStatusMeta,
  affiliationStatusMeta,
  resolveStatusMeta,
} from "../lib/statusLabels";
import { publicUploadHint, validatePublicDocumentUpload } from "../lib/uploadValidation";
import { useStatePlatformCapabilities } from "../hooks/useStatePlatformCapabilities";
import FullscreenVideoOverlay from "../components/affiliation/FullscreenVideoOverlay";
import { useUnsavedChangesGuard } from "../components/ui/UnsavedChangesProvider";

type PersonForm = {
  role: string;
  full_name: string;
  email: string;
  phone: string;
  fiscal_code: string;
};

type FormState = {
  organization_name: string;
  organization_legal_name: string;
  organization_slug_candidate: string;
  tax_code: string;
  vat_number: string;
  address_line1: string;
  address_line2: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  applicant_full_name: string;
  applicant_email: string;
  applicant_phone: string;
  notes: string;
  payment_method: "" | "stripe" | "bank_transfer" | "cash";
  manual_preferred_date: string;
  manual_preferred_time: string;
  manual_contact: string;
};

const DOC_ITEMS = [
  { type: "statuto", label: "Statuto firmato" },
  { type: "atto_costitutivo", label: "Atto costitutivo" },
  { type: "documento_presidente", label: "Documento presidente" },
  { type: "codice_fiscale_presidente", label: "Codice fiscale presidente" },
  { type: "documento_vicepresidente", label: "Documento vice presidente" },
  { type: "documento_segretario_tesoriere", label: "Documento segretario/tesoriere" },
] as const;

const ROLE_ITEMS = [
  { role: "presidente", label: "Presidente" },
  { role: "segretario", label: "Segretario" },
  { role: "tesoriere", label: "Tesoriere" },
] as const;

const WIZARD_PROGRESS_STEPS = [
  { step: 1, label: "Associazione" },
  { step: 2, label: "Cariche" },
  { step: 3, label: "Documenti" },
  { step: 4, label: "Pagamento" },
  { step: 5, label: "Invio" },
] as const;

const FIRST_WIZARD_STEP = 1;
const LAST_WIZARD_STEP = 5;
const SUBMITTED_WIZARD_STEP = 6;

const INTRO_CHECKLIST_ITEMS = [
  "Statuto firmato (PDF o immagine)",
  "Atto costitutivo (PDF o immagine)",
  "Documento d'identità Presidente",
  "Codice fiscale Presidente",
  "Documento Vicepresidente",
  "Documento Segretario/Tesoriere",
] as const;


const buildEmptyForm = (): FormState => ({
  organization_name: "",
  organization_legal_name: "",
  organization_slug_candidate: "",
  tax_code: "",
  vat_number: "",
  address_line1: "",
  address_line2: "",
  city: "",
  province: "",
  postal_code: "",
  country: "Italy",
  applicant_full_name: "",
  applicant_email: "",
  applicant_phone: "",
  notes: "",
  payment_method: "",
  manual_preferred_date: "",
  manual_preferred_time: "",
  manual_contact: "",
});

const buildDefaultPeople = (): PersonForm[] =>
  ROLE_ITEMS.map((role) => ({
    role: role.role,
    full_name: "",
    email: "",
    phone: "",
    fiscal_code: "",
  }));

const toFormState = (draft: AffiliationDraft): FormState => ({
  organization_name: draft.organization_name ?? "",
  organization_legal_name: draft.organization_legal_name ?? "",
  organization_slug_candidate: draft.organization_slug_candidate ?? "",
  tax_code: draft.tax_code ?? "",
  vat_number: draft.vat_number ?? "",
  address_line1: draft.address_line1 ?? "",
  address_line2: draft.address_line2 ?? "",
  city: draft.city ?? "",
  province: draft.province ?? "",
  postal_code: draft.postal_code ?? "",
  country: draft.country ?? "Italy",
  applicant_full_name: draft.applicant_full_name ?? "",
  applicant_email: draft.applicant_email ?? "",
  applicant_phone: draft.applicant_phone ?? "",
  notes: draft.notes ?? "",
  payment_method:
    draft.payment_method === "stripe" ||
    draft.payment_method === "bank_transfer" ||
    draft.payment_method === "cash"
      ? draft.payment_method
      : "",
  manual_preferred_date: draft.manual_preferred_date ?? "",
  manual_preferred_time: draft.manual_preferred_time ?? "",
  manual_contact: draft.manual_contact ?? "",
});

const toPeople = (draft: AffiliationDraft): PersonForm[] => {
  const source = new Map((draft.people || []).map((item) => [item.role, item]));
  return ROLE_ITEMS.map((roleItem) => {
    const item = source.get(roleItem.role);
    return {
      role: roleItem.role,
      full_name: item?.full_name ?? "",
      email: item?.email ?? "",
      phone: item?.phone ?? "",
      fiscal_code: item?.fiscal_code ?? "",
    };
  });
};

const SUBMITTED_STATUSES = new Set(["under_review", "approved", "rejected"]);

type WizardValidation = {
  issues: string[];
  stepErrors: Record<number, string[]>;
  firstInvalidStep: number | null;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const buildDraftPatchPayload = (form: FormState) => ({
  organization_name: form.organization_name || null,
  organization_legal_name: form.organization_legal_name || null,
  organization_slug_candidate: form.organization_slug_candidate || null,
  tax_code: form.tax_code || null,
  vat_number: form.vat_number || null,
  address_line1: form.address_line1 || null,
  address_line2: form.address_line2 || null,
  city: form.city || null,
  province: form.province || null,
  postal_code: form.postal_code || null,
  country: form.country || null,
  applicant_full_name: form.applicant_full_name || null,
  applicant_email: form.applicant_email || null,
  applicant_phone: form.applicant_phone || null,
  notes: form.notes || null,
  payment_method: form.payment_method || null,
  manual_preferred_date: form.manual_preferred_date || null,
  manual_preferred_time: form.manual_preferred_time || null,
  manual_contact: form.manual_contact || null,
});

const normalizeIdempotencyPart = (value: string | null | undefined) => {
  const normalized = (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "";
};

const buildCreateDraftIdempotencyKey = (form: FormState) => {
  const applicantEmail = normalizeIdempotencyPart(form.applicant_email);
  const organizationName = normalizeIdempotencyPart(
    form.organization_name || form.organization_legal_name,
  );
  const taxCode = normalizeIdempotencyPart(form.tax_code);
  const vatNumber = normalizeIdempotencyPart(form.vat_number);
  if (!applicantEmail || (!organizationName && !taxCode && !vatNumber)) {
    return null;
  }
  return [
    "affiliation",
    "create",
    applicantEmail,
    organizationName || "-",
    taxCode || "-",
    vatNumber || "-",
  ]
    .join(":")
    .slice(0, 200);
};

const buildTokenActionIdempotencyKey = (action: string, publicToken: string) => {
  const normalizedToken = normalizeIdempotencyPart(publicToken);
  if (!normalizedToken) {
    return null;
  }
  return `affiliation:${action}:${normalizedToken}`;
};

const normalizeWizardStep = (value: number) =>
  Math.max(FIRST_WIZARD_STEP, Math.min(LAST_WIZARD_STEP, value));

const readResumeStep = (rawValue: string | null): number | null => {
  const parsedValue = Number.parseInt(String(rawValue ?? "").trim(), 10);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }
  return normalizeWizardStep(parsedValue);
};

const Affiliazione = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tokenFromQuery = searchParams.get("token")?.trim() || "";
  const stepFromQuery = readResumeStep(searchParams.get("step"));
  const referralFromQuery = searchParams.get("ref")?.trim().toLowerCase() || "";
  const [token, setToken] = useState<string>("");
  const [draft, setDraft] = useState<AffiliationDraft | null>(null);
  const [form, setForm] = useState<FormState>(() => buildEmptyForm());
  const [people, setPeople] = useState<PersonForm[]>(() => buildDefaultPeople());
  const [currentStep, setCurrentStep] = useState(1);
  const [showIntroScreen, setShowIntroScreen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitResult, setSubmitResult] = useState<AffiliationSubmitResponse | null>(null);
  const [showVideoOverlay, setShowVideoOverlay] = useState(false);
  const [notice, setNotice] = useState("");
  const [attemptedSteps, setAttemptedSteps] = useState<Record<number, boolean>>({});
  const { capabilities, loading: capabilitiesLoading } = useStatePlatformCapabilities();
  const stripeFallbackAppliedRef = useRef(false);
  const autoOpenedVideoRef = useRef(false);
  const wizardTopRef = useRef<HTMLDivElement>(null);
  const currentStepRef = useRef(currentStep);
  const showIntroScreenRef = useRef(showIntroScreen);
  const tokenRef = useRef(token);
  const draftRef = useRef<AffiliationDraft | null>(draft);
  const bootRequestIdRef = useRef(0);
  const navigate = useNavigate();
  const affiliazioneEnabled = capabilities?.affiliazioneEnabled === true;

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    showIntroScreenRef.current = showIntroScreen;
  }, [showIntroScreen]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    applySeo({
      title: "Affilia la tua Associazione",
      description:
        "Wizard pubblico ASSONAM: dati associazione, documenti, pagamento e invio richiesta.",
      canonicalPath: "/affiliazione",
    });
  }, []);

  useEffect(() => {
    if (capabilitiesLoading) return;
    if (!affiliazioneEnabled) {
      navigate("/", { replace: true });
    }
  }, [affiliazioneEnabled, capabilitiesLoading, navigate]);

  const updateResumeLocation = useCallback(
    (publicToken: string, stepOverride?: number | null) => {
      if (!publicToken) return;
      const nextParams = new URLSearchParams();
      nextParams.set("token", publicToken);
      if (referralFromQuery) {
        nextParams.set("ref", referralFromQuery);
      }
      const normalizedStep =
        typeof stepOverride === "number" ? normalizeWizardStep(stepOverride) : null;
      if (normalizedStep && normalizedStep > FIRST_WIZARD_STEP) {
        nextParams.set("step", String(normalizedStep));
      }
      if (nextParams.toString() !== searchParams.toString()) {
        setSearchParams(nextParams, { replace: true });
      }
    },
    [referralFromQuery, searchParams, setSearchParams],
  );

  const applyDraftState = useCallback(
    (nextDraft: AffiliationDraft, syncForm: boolean) => {
      setDraft(nextDraft);
      setToken(nextDraft.public_token);
      const resumeStep =
        !showIntroScreenRef.current && currentStepRef.current < SUBMITTED_WIZARD_STEP
          ? currentStepRef.current
          : null;
      updateResumeLocation(nextDraft.public_token, resumeStep);
      if (syncForm) {
        setForm(toFormState(nextDraft));
        setPeople(toPeople(nextDraft));
      }

      const normalizedStatus = String(nextDraft.status || "").trim().toLowerCase();
      if (SUBMITTED_STATUSES.has(normalizedStatus)) {
        setShowIntroScreen(false);
        setCurrentStep(SUBMITTED_WIZARD_STEP);
      }
    },
    [updateResumeLocation],
  );

  const refreshDraft = useCallback(
    async (publicToken: string, syncForm: boolean) => {
      const nextDraft = await fetchAffiliationDraft(publicToken);
      applyDraftState(nextDraft, syncForm);
      return nextDraft;
    },
    [applyDraftState],
  );

  const ensureServerDraft = useCallback(
    async (options?: { syncForm?: boolean }) => {
      if (token) {
        if (draft) {
          return draft;
        }
        return refreshDraft(token, options?.syncForm ?? true);
      }

      const idempotencyKey = buildCreateDraftIdempotencyKey(form);
      if (!idempotencyKey) {
        throw new Error(
          "Compila email del referente e dati identificativi dell'associazione prima di continuare.",
        );
      }

      const created = await createAffiliationDraft(
        {
          applicant_email: form.applicant_email || undefined,
          organization_name: form.organization_name || undefined,
          organization_legal_name: form.organization_legal_name || undefined,
          tax_code: form.tax_code || undefined,
          vat_number: form.vat_number || undefined,
          referral_slug: referralFromQuery || undefined,
        },
        { idempotencyKey },
      );
      applyDraftState(created, options?.syncForm ?? false);
      return created;
    },
    [applyDraftState, draft, form, referralFromQuery, refreshDraft, token],
  );

  const saveApplicationDetails = useCallback(
    async (publicToken: string) => {
      const nextDraft = await patchAffiliationDraft(
        publicToken,
        buildDraftPatchPayload(form),
      );
      applyDraftState(nextDraft, false);
      return nextDraft;
    },
    [applyDraftState, form],
  );

  const saveApplicationPeople = useCallback(
    async (publicToken: string) => {
      const nextDraft = await replaceAffiliationPeople(
        publicToken,
        people.map((item) => ({
          role: item.role,
          full_name: item.full_name || null,
          email: item.email || null,
          phone: item.phone || null,
          fiscal_code: item.fiscal_code || null,
        })),
      );
      applyDraftState(nextDraft, false);
      return nextDraft;
    },
    [applyDraftState, people],
  );

  const syncDraftData = useCallback(async () => {
    try {
      const ensuredDraft = await ensureServerDraft({ syncForm: false });
      const normalizedStatus = String(ensuredDraft.status || "").trim().toLowerCase();
      if (SUBMITTED_STATUSES.has(normalizedStatus)) {
        return ensuredDraft;
      }
      await saveApplicationDetails(ensuredDraft.public_token);
      return saveApplicationPeople(ensuredDraft.public_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sincronizzazione dati");
      return null;
    }
  }, [ensureServerDraft, saveApplicationDetails, saveApplicationPeople]);

  useEffect(() => {
    if (capabilitiesLoading) return;
    if (!affiliazioneEnabled) return;

    const boot = async () => {
      const requestId = ++bootRequestIdRef.current;
      try {
        setLoading(true);
        if (tokenFromQuery) {
          const existingDraft = await fetchAffiliationDraft(tokenFromQuery);
          if (bootRequestIdRef.current !== requestId) {
            return;
          }
          setSubmitResult(null);
          applyDraftState(existingDraft, true);
          const normalizedStatus = String(existingDraft.status || "").trim().toLowerCase();
          if (SUBMITTED_STATUSES.has(normalizedStatus)) {
            setShowIntroScreen(false);
            setCurrentStep(SUBMITTED_WIZARD_STEP);
          } else {
            const preservedStep = normalizeWizardStep(
              Math.max(
                stepFromQuery ?? FIRST_WIZARD_STEP,
                currentStepRef.current,
              ),
            );
            const shouldKeepWizardOpen =
              preservedStep > FIRST_WIZARD_STEP ||
              !showIntroScreenRef.current ||
              (tokenRef.current === tokenFromQuery && draftRef.current !== null);
            setShowIntroScreen(!shouldKeepWizardOpen);
            setCurrentStep(shouldKeepWizardOpen ? preservedStep : FIRST_WIZARD_STEP);
          }
        } else {
          setToken("");
          setDraft(null);
          setSubmitResult(null);
          setForm(buildEmptyForm());
          setPeople(buildDefaultPeople());
          setShowIntroScreen(true);
          setCurrentStep(FIRST_WIZARD_STEP);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore avvio wizard");
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [
    affiliazioneEnabled,
    applyDraftState,
    capabilitiesLoading,
    tokenFromQuery,
  ]);

  useEffect(() => {
    if (!token) return;
    if (currentStep >= SUBMITTED_WIZARD_STEP || showIntroScreen) {
      updateResumeLocation(token, null);
      return;
    }
    updateResumeLocation(token, currentStep);
  }, [currentStep, showIntroScreen, token, updateResumeLocation]);

  const paymentEnabled = draft?.payment_config?.payment_enabled !== false;
  const feeAmountCents = draft?.payment_config?.fee_amount_cents ?? null;
  const feeCurrency = draft?.payment_config?.fee_currency || "EUR";
  const feeLabel =
    typeof feeAmountCents === "number" && feeAmountCents > 0
      ? new Intl.NumberFormat("it-IT", {
          style: "currency",
          currency: feeCurrency,
        }).format(feeAmountCents / 100)
      : "Quota da confermare";
  const stripeEnabled =
    paymentEnabled &&
    capabilities?.stripeEnabled === true &&
    (draft?.payment_config?.stripe_enabled ?? true);
  const videoEnabled = capabilities?.affiliationVideoEnabled === true;

  useEffect(() => {
    if (!token) return;
    if (stripeEnabled) return;

    if (!form.payment_method) {
      setForm((current) =>
        current ? { ...current, payment_method: "bank_transfer" } : current,
      );
      return;
    }

    if (
      form.payment_method === "stripe" &&
      !stripeFallbackAppliedRef.current
    ) {
      stripeFallbackAppliedRef.current = true;
      setNotice(
        "Pagamento con carta non disponibile al momento. Abbiamo selezionato Bonifico.",
      );
      setForm((current) =>
        current ? { ...current, payment_method: "bank_transfer" } : current,
      );
      void patchAffiliationDraft(token, { payment_method: "bank_transfer" })
        .then(() => refreshDraft(token, false))
        .catch(() => {});
    }
  }, [form, refreshDraft, stripeEnabled, token]);

  const docsByType = useMemo(() => {
    const map = new Map<string, AffiliationDraft["documents"][number]>();
    (draft?.documents || []).forEach((item) => map.set(item.doc_type, item));
    return map;
  }, [draft]);

  const validation = useMemo<WizardValidation>(() => {
    const stepErrors: Record<number, string[]> = {
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
    };

    const addError = (step: number, message: string) => {
      if (!stepErrors[step]) stepErrors[step] = [];
      stepErrors[step].push(message);
    };

    const orgName = form?.organization_name?.trim() || "";
    const applicantName = form?.applicant_full_name?.trim() || "";
    const applicantEmail = form?.applicant_email?.trim() || "";
    const applicantPhone = form?.applicant_phone?.trim() || "";
    const paymentMethod = form?.payment_method || "";

    if (!orgName) addError(1, "Inserisci il nome dell'associazione.");
    if (!applicantName) addError(1, "Inserisci il nome del referente.");
    if (!applicantEmail) {
      addError(1, "Inserisci l'email del referente.");
    } else if (!isValidEmail(applicantEmail)) {
      addError(1, "L'email del referente non è valida.");
    }
    if (!applicantPhone) addError(1, "Inserisci il telefono del referente.");

    ROLE_ITEMS.forEach((role) => {
      const person = people.find((item) => item.role === role.role);
      const fullName = person?.full_name?.trim() || "";
      const email = person?.email?.trim() || "";
      if (!fullName) {
        addError(2, `Compila il nominativo del ruolo ${role.label}.`);
      }
      if (!email) {
        addError(2, `Compila l'email del ruolo ${role.label}.`);
      } else if (!isValidEmail(email)) {
        addError(2, `L'email del ruolo ${role.label} non è valida.`);
      }
    });

    DOC_ITEMS.forEach((doc) => {
      if (!docsByType.get(doc.type)) {
        addError(3, `Carica il documento obbligatorio: ${doc.label}.`);
      }
    });

    if (!paymentMethod) {
      addError(4, "Seleziona un metodo di pagamento.");
    }
    if (
      (paymentMethod === "bank_transfer" || paymentMethod === "cash") &&
      !(form?.manual_contact || "").trim()
    ) {
      addError(4, "Inserisci un contatto operativo per il pagamento manuale.");
    }

    const issues = [1, 2, 3, 4]
      .flatMap((step) => stepErrors[step] || []);
    const firstInvalidStep =
      ([1, 2, 3, 4].find((step) => (stepErrors[step] || []).length > 0) as number | undefined) ??
      null;
    return { issues, stepErrors, firstInvalidStep };
  }, [docsByType, form, people]);

  const onFieldChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const onPersonChange = (index: number, key: keyof PersonForm, value: string) => {
    setPeople((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  };

  const onUploadDocument = useCallback(
    async (docType: string, file: File) => {
      const validationError = validatePublicDocumentUpload(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      try {
        setUploadingType(docType);
        setError("");
        const currentDraft = await ensureServerDraft({ syncForm: false });
        await uploadAffiliationDocument(currentDraft.public_token, docType, file);
        await refreshDraft(currentDraft.public_token, false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore upload documento");
      } finally {
        setUploadingType(null);
      }
    },
    [ensureServerDraft, refreshDraft],
  );

  const onOpenStripeCheckout = useCallback(async () => {
    if (!stripeEnabled) {
      setError("Stripe non configurato. Usa Bonifico o Contanti.");
      return;
    }
    try {
      setError("");
      const currentDraft = await ensureServerDraft({ syncForm: false });
      if (SUBMITTED_STATUSES.has(String(currentDraft.status || "").trim().toLowerCase())) {
        return;
      }
      if (form.payment_method !== "stripe") {
        onFieldChange("payment_method", "stripe");
        const nextDraft = await patchAffiliationDraft(currentDraft.public_token, {
          payment_method: "stripe",
        });
        applyDraftState(nextDraft, false);
      }
      const payload = await createAffiliationStripeCheckout(currentDraft.public_token, {
        idempotencyKey:
          buildTokenActionIdempotencyKey("stripe", currentDraft.public_token) || undefined,
      });
      window.open(payload.checkout_url, "_blank", "noopener,noreferrer");
      await refreshDraft(currentDraft.public_token, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore apertura checkout Stripe");
    }
  }, [applyDraftState, ensureServerDraft, form.payment_method, refreshDraft, stripeEnabled]);

  const onSubmit = useCallback(async () => {
    if (validation.issues.length > 0) {
      setError("Completa i campi obbligatori prima di inviare la richiesta.");
      if (validation.firstInvalidStep) {
        setShowIntroScreen(false);
        setCurrentStep(validation.firstInvalidStep);
      }
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      const syncedDraft = await syncDraftData();
      if (!syncedDraft) {
        return;
      }
      if (SUBMITTED_STATUSES.has(String(syncedDraft.status || "").trim().toLowerCase())) {
        setShowIntroScreen(false);
        setCurrentStep(SUBMITTED_WIZARD_STEP);
        return;
      }
      const response = await submitAffiliationDraft(syncedDraft.public_token, {
        idempotencyKey:
          buildTokenActionIdempotencyKey("submit", syncedDraft.public_token) || undefined,
      });
      setSubmitResult(response);
      applyDraftState(response.application, false);
      setShowIntroScreen(false);
      setCurrentStep(SUBMITTED_WIZARD_STEP);
      if (videoEnabled) {
        setShowVideoOverlay(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore invio richiesta");
    } finally {
      setSubmitting(false);
    }
  }, [applyDraftState, syncDraftData, validation.firstInvalidStep, validation.issues.length, videoEnabled]);

  const onOpenInstantWelcomeVideo = () => {
    setShowVideoOverlay(true);
  };

  const onRetryVideoStatus = useCallback(async () => {
    if (!token) return;
    try {
      setError("");
      const payload = await retryAffiliationWelcomeVideo(token, {
        idempotencyKey: buildTokenActionIdempotencyKey("video-retry", token) || undefined,
      });
      applyDraftState(payload.application, false);
      await refreshDraft(token, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore aggiornamento stato video");
    }
  }, [applyDraftState, refreshDraft, token]);

  const onStartWizard = () => {
    setError("");
    if (token) {
      setShowIntroScreen(false);
      setCurrentStep(stepFromQuery ?? FIRST_WIZARD_STEP);
      return;
    }
    setShowIntroScreen(false);
    setCurrentStep(FIRST_WIZARD_STEP);
  };

  const currentApplication = draft ?? submitResult?.application ?? null;
  const currentVideoJob =
    currentApplication?.latest_video_job || submitResult?.latest_video_job || null;
  const welcomeVideoReady = currentApplication?.welcome_video_ready === true;
  const welcomeVideoError = currentApplication?.welcome_video_error || null;
  const personalizedVideoUrl =
    currentApplication?.welcome_video_url || currentVideoJob?.output_url || null;
  const videoStatusLabel = !videoEnabled
    ? "Video disattivato"
    : welcomeVideoReady
      ? "Video personalizzato pronto"
      : welcomeVideoError
        ? "Video non ancora disponibile"
        : "Sto generando il video...";
  const normalizedDraftStatus = String(currentApplication?.status || "").trim().toLowerCase();
  const hasRealSubmission = Boolean(submitResult) || SUBMITTED_STATUSES.has(normalizedDraftStatus);
  const hasUnsavedAffiliationChanges = useMemo(() => {
    if (loading || saving || submitting || hasRealSubmission || showIntroScreen) return false;
    const baselineForm = draft ? toFormState(draft) : buildEmptyForm();
    const baselinePeople = draft ? toPeople(draft) : buildDefaultPeople();
    return JSON.stringify(form) !== JSON.stringify(baselineForm)
      || JSON.stringify(people) !== JSON.stringify(baselinePeople);
  }, [draft, form, hasRealSubmission, loading, people, saving, showIntroScreen, submitting]);

  useUnsavedChangesGuard({
    when: hasUnsavedAffiliationChanges,
    title: "Affiliazione non salvata",
    message: "Hai dati di affiliazione non ancora salvati. Se esci ora, le ultime modifiche andranno perse.",
    blockOnSearchChange: false,
  });
  const progressActiveStep = Math.min(5, Math.max(1, currentStep));
  const progressPercent = ((progressActiveStep - 1) / (WIZARD_PROGRESS_STEPS.length - 1)) * 100;
  const stepErrors = validation.stepErrors[currentStep] || [];
  const hasCurrentStepErrors = stepErrors.length > 0;
  const isVideoPreparing =
    videoEnabled && hasRealSubmission && !welcomeVideoReady && !welcomeVideoError;
  const overlayAssociationName = (
    currentApplication?.organization_name ||
    form.organization_name ||
    "ASSOCIATION"
  )
    .trim()
    .toUpperCase();

  useEffect(() => {
    if (!token || !hasRealSubmission || !videoEnabled || welcomeVideoReady) return;

    const pollId = window.setInterval(() => {
      void refreshDraft(token, false).catch(() => {});
    }, 8000);
    return () => window.clearInterval(pollId);
  }, [hasRealSubmission, refreshDraft, token, videoEnabled, welcomeVideoReady]);

  useEffect(() => {
    if (!hasRealSubmission || !videoEnabled) {
      autoOpenedVideoRef.current = false;
      return;
    }
    if (
      !showVideoOverlay &&
      personalizedVideoUrl &&
      welcomeVideoReady &&
      !autoOpenedVideoRef.current
    ) {
      autoOpenedVideoRef.current = true;
      setShowVideoOverlay(true);
    }
  }, [hasRealSubmission, personalizedVideoUrl, showVideoOverlay, videoEnabled, welcomeVideoReady]);

  const scrollWizardTop = useCallback(() => {
    if (typeof window === "undefined") return;
    const topEl = wizardTopRef.current;
    if (topEl && typeof topEl.scrollIntoView === "function") {
      topEl.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const persistCurrentStep = useCallback(async () => {
    if (currentStep === 1 || currentStep === 2 || currentStep === 4) {
      const currentDraft = await ensureServerDraft({ syncForm: false });
      if (SUBMITTED_STATUSES.has(String(currentDraft.status || "").trim().toLowerCase())) {
        return false;
      }
      if (currentStep === 1 || currentStep === 4) {
        await saveApplicationDetails(currentDraft.public_token);
      }
      if (currentStep === 2) {
        await saveApplicationPeople(currentDraft.public_token);
      }
    }
    return true;
  }, [currentStep, ensureServerDraft, saveApplicationDetails, saveApplicationPeople]);

  const onGoPrevStep = () => {
    setError("");
    setCurrentStep((value) => Math.max(FIRST_WIZARD_STEP, value - 1));
    scrollWizardTop();
  };

  const onGoNextStep = async () => {
    setAttemptedSteps((prev) => ({ ...prev, [currentStep]: true }));
    if (hasCurrentStepErrors) {
      setError("Completa i campi obbligatori dello step prima di continuare.");
      scrollWizardTop();
      return;
    }
    try {
      setSaving(true);
      setError("");
      const canContinue = await persistCurrentStep();
      if (!canContinue) return;
      setCurrentStep((value) => Math.min(LAST_WIZARD_STEP, value + 1));
      scrollWizardTop();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio step");
    } finally {
      setSaving(false);
    }
  };

  const onSelectWizardStep = async (targetStep: number) => {
    if (targetStep === currentStep || saving || submitting) return;
    if (targetStep < currentStep) {
      setError("");
      setCurrentStep(targetStep);
      scrollWizardTop();
      return;
    }
    // Going forward requires current step to be valid and persisted
    setAttemptedSteps((prev) => ({ ...prev, [currentStep]: true }));
    if (hasCurrentStepErrors) {
      setError("Completa i campi obbligatori dello step corrente prima di passare allo step successivo.");
      scrollWizardTop();
      return;
    }
    for (let s = currentStep + 1; s < targetStep; s += 1) {
      if ((validation.stepErrors[s] || []).length > 0) {
        setAttemptedSteps((prev) => ({ ...prev, [s]: true }));
        setCurrentStep(s);
        setError("Completa i passaggi intermedi obbligatori prima di proseguire.");
        scrollWizardTop();
        return;
      }
    }
    try {
      setSaving(true);
      setError("");
      const canContinue = await persistCurrentStep();
      if (!canContinue) return;
      setCurrentStep(targetStep);
      scrollWizardTop();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio step");
    } finally {
      setSaving(false);
    }
  };

  if (capabilitiesLoading || loading) {
    return (
      <div className="signup-wizard-shell min-h-[100dvh] flex items-center justify-center">
        <div className="surface rounded-2xl p-8 text-sm text-[var(--theme-text-muted)] text-center animate-pulse flex flex-col items-center gap-4">
           <svg className="animate-spin w-8 h-8 text-brand" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
           Caricamento procedura...
        </div>
      </div>
    );
  }

  return (
    <div ref={wizardTopRef} className="signup-wizard-shell min-h-[100dvh] py-8 md:py-12 font-sans text-[var(--theme-text)] pb-36">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">

        {/* Header minimal */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[var(--theme-text)]">
            Affilia la tua Associazione
          </h1>
          <p className="mt-3 text-sm md:text-base text-[var(--theme-text-muted)] max-w-xl mx-auto">
            Completa la procedura guidata per richiedere l'affiliazione ad ASSONAM.
          </p>
        </div>

        {draft?.status === "changes_requested" && (
          <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm text-orange-800 shadow-sm">
            <strong className="block mb-1 font-bold">Modifiche richieste da ASSONAM</strong>
            Aggiorna dati e documenti, poi invia nuovamente.
            {draft.review_notes ? <div className="mt-2 bg-white/50 p-3 rounded-lg border border-orange-100 italic">{draft.review_notes}</div> : null}
          </div>
        )}

        {draft?.referral?.referrer_org_name && (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-800 shadow-sm flex items-center gap-3">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">👋</span>
            <div>Invito ricevuto da <strong className="font-bold">{draft.referral.referrer_org_name}</strong></div>
          </div>
        )}

        {notice && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800 shadow-sm">
            {notice}
          </div>
        )}

        {error && (
          <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 shadow-sm flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <div className="space-y-1">
              <div className="font-semibold">{error}</div>
              {attemptedSteps[currentStep] && stepErrors.length > 0 && (
                <ul className="list-disc pl-4 text-xs space-y-0.5 pt-1">
                  {stepErrors.map((errItem) => (
                    <li key={errItem}>{errItem}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Stepper top */}
        {!showIntroScreen && !hasRealSubmission && (
          <nav className="mb-8 mt-4" aria-label="Passaggi affiliazione">
            <div className="relative">
              <div className="absolute left-[10%] right-[10%] top-4 h-1 rounded-full bg-[var(--theme-border)]" aria-hidden="true"></div>
              <div
                className="absolute left-[10%] top-4 h-1 rounded-full bg-[var(--theme-brand)] transition-all duration-500 ease-out"
                style={{ width: `calc(80% * ${progressPercent / 100})` }}
                aria-hidden="true"
              ></div>
              <ol className="relative z-10 grid grid-cols-5 gap-1 sm:gap-2">
                {WIZARD_PROGRESS_STEPS.map((item) => {
                  const isActive = item.step === progressActiveStep;
                  const isCompleted = item.step < progressActiveStep;
                  return (
                    <li key={item.step} className="flex flex-col items-center">
                      <button
                        type="button"
                        id={`affiliation-step-tab-${item.step}`}
                        aria-current={isActive ? "step" : undefined}
                        aria-controls={`affiliation-step-panel-${item.step}`}
                        onClick={() => {
                          setShowIntroScreen(false);
                          void onSelectWizardStep(item.step);
                        }}
                        className="group flex w-full flex-col items-center gap-1.5 rounded-lg p-1 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                      >
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs sm:text-sm font-bold shadow-sm transition-colors ${
                            isActive
                              ? "border-[var(--theme-brand)] bg-[var(--theme-surface-solid)] text-[var(--theme-brand)] ring-4 ring-brand/15"
                              : isCompleted
                                ? "border-[var(--theme-brand)] bg-[var(--theme-brand)] text-[var(--theme-on-brand)]"
                                : "border-[var(--theme-border)] bg-[var(--theme-surface-solid)] text-[var(--theme-text-soft)] group-hover:border-[var(--theme-border-strong)]"
                          }`}
                        >
                          {isCompleted ? (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            item.step
                          )}
                        </span>
                        <span
                          className={`max-w-full truncate text-[9px] sm:text-[11px] font-bold uppercase tracking-tight sm:tracking-wider ${
                            isActive
                              ? "text-[var(--theme-brand)]"
                              : isCompleted
                                ? "text-[var(--theme-text)]"
                                : "text-[var(--theme-text-soft)]"
                          }`}
                        >
                          {item.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </nav>
        )}

        {/* Main Card */}
        <div className="surface signup-wizard-card rounded-[1.5rem] sm:rounded-[2rem] border border-[var(--theme-border)] overflow-hidden transition-all relative">

          {showIntroScreen && (
            <div className="p-6 sm:p-12 space-y-8 relative overflow-hidden">
              <div className="text-center relative z-10">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[var(--theme-brand-soft)] text-[var(--theme-brand)] mb-6 border border-[var(--theme-border)]">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--theme-text)]">Inizia la tua richiesta</h2>
                <p className="mt-3 text-base text-[var(--theme-text-muted)] max-w-md mx-auto leading-relaxed">
                  La procedura richiede circa 10 minuti. Assicurati di avere a disposizione i documenti richiesti in formato PDF o immagine.
                </p>
              </div>

              <div className="bg-[var(--theme-surface-2)] rounded-2xl p-5 sm:p-8 border border-[var(--theme-border)] relative z-10">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--theme-text-soft)] mb-5">Checklist necessaria</h3>
                <ul className="grid sm:grid-cols-2 gap-4">
                  {INTRO_CHECKLIST_ITEMS.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-[var(--theme-text)] font-medium">
                      <svg className="w-5 h-5 text-[var(--theme-brand)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      <span className="leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 text-center relative z-10">
                <button
                  type="button"
                  className="btn-primary inline-flex items-center justify-center w-full sm:w-auto min-w-[240px] h-14 px-8 rounded-xl text-lg font-bold tracking-wide disabled:opacity-70 disabled:cursor-not-allowed"
                  disabled={saving}
                  onClick={() => void onStartWizard()}
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Preparazione...
                    </span>
                  ) : "Inizia Ora"}
                </button>
              </div>
            </div>
          )}

          {!showIntroScreen && !hasRealSubmission && currentStep === 1 && (
            <div id="affiliation-step-panel-1" role="region" aria-labelledby="affiliation-step-tab-1" className="p-5 sm:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="border-b border-[var(--theme-border)] pb-5">
                <h2 className="text-2xl font-extrabold text-[var(--theme-text)]">Dati dell'Associazione</h2>
                <p className="mt-1 text-sm text-[var(--theme-text-muted)]">Inserisci i riferimenti principali e i dati del referente della richiesta.</p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="aff-org-name" className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Nome associazione <span className="text-red-500">*</span></label>
                  <input id="aff-org-name" className="theme-input w-full h-12 px-4 rounded-xl border text-sm font-medium outline-none transition-all placeholder:font-normal" placeholder="Associazione XYZ" value={form.organization_name} onChange={(e) => onFieldChange("organization_name", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="aff-org-legal-name" className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Ragione sociale</label>
                  <input id="aff-org-legal-name" className="theme-input w-full h-12 px-4 rounded-xl border text-sm font-medium outline-none transition-all placeholder:font-normal" placeholder="Opzionale" value={form.organization_legal_name} onChange={(e) => onFieldChange("organization_legal_name", e.target.value)} />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="aff-address" className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Indirizzo Sede Legale</label>
                  <input id="aff-address" className="theme-input w-full h-12 px-4 rounded-xl border text-sm font-medium outline-none transition-all placeholder:font-normal" placeholder="Via Roma 1" value={form.address_line1} onChange={(e) => onFieldChange("address_line1", e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="aff-city" className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Città</label>
                  <input id="aff-city" className="theme-input w-full h-12 px-4 rounded-xl border text-sm font-medium outline-none transition-all placeholder:font-normal" placeholder="Roma" value={form.city} onChange={(e) => onFieldChange("city", e.target.value)} />
                </div>
                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="aff-postal-code" className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">CAP</label>
                    <input id="aff-postal-code" className="theme-input w-full h-12 px-4 rounded-xl border text-sm font-medium outline-none transition-all placeholder:font-normal" placeholder="00100" value={form.postal_code} onChange={(e) => onFieldChange("postal_code", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="aff-province" className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Provincia</label>
                    <input id="aff-province" className="theme-input w-full h-12 px-4 rounded-xl border text-sm font-medium outline-none transition-all placeholder:font-normal" placeholder="RM" value={form.province} onChange={(e) => onFieldChange("province", e.target.value)} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="aff-tax-code" className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Codice Fiscale Associazione</label>
                  <input id="aff-tax-code" className="theme-input w-full h-12 px-4 rounded-xl border text-sm font-bold outline-none transition-all uppercase placeholder:font-normal placeholder:normal-case" placeholder="11 cifre" value={form.tax_code} onChange={(e) => onFieldChange("tax_code", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="aff-vat-number" className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Partita IVA (se presente)</label>
                  <input id="aff-vat-number" className="theme-input w-full h-12 px-4 rounded-xl border text-sm font-bold outline-none transition-all placeholder:font-normal" placeholder="11 cifre" value={form.vat_number} onChange={(e) => onFieldChange("vat_number", e.target.value)} />
                </div>

                <div className="sm:col-span-2 pt-8 border-t border-[var(--theme-border)]">
                  <h3 className="text-lg font-bold text-[var(--theme-text)] mb-6 flex items-center gap-2">
                    <svg className="w-5 h-5 text-[var(--theme-brand)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    Dati Referente Pratica
                  </h3>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="aff-applicant-name" className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Nome e Cognome <span className="text-red-500">*</span></label>
                  <input id="aff-applicant-name" className="theme-input w-full h-12 px-4 rounded-xl border text-sm font-medium outline-none transition-all placeholder:font-normal" placeholder="Mario Rossi" value={form.applicant_full_name} onChange={(e) => onFieldChange("applicant_full_name", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="aff-applicant-phone" className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Telefono <span className="text-red-500">*</span></label>
                  <input id="aff-applicant-phone" type="tel" className="theme-input w-full h-12 px-4 rounded-xl border text-sm font-medium outline-none transition-all placeholder:font-normal" placeholder="+39" value={form.applicant_phone} onChange={(e) => onFieldChange("applicant_phone", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="aff-applicant-email" className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Email <span className="text-red-500">*</span></label>
                  <input id="aff-applicant-email" type="email" className="theme-input w-full h-12 px-4 rounded-xl border text-sm font-medium outline-none transition-all placeholder:font-normal" placeholder="mario@esempio.it" value={form.applicant_email} onChange={(e) => onFieldChange("applicant_email", e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {!showIntroScreen && !hasRealSubmission && currentStep === 2 && (
            <div id="affiliation-step-panel-2" role="region" aria-labelledby="affiliation-step-tab-2" className="p-5 sm:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="border-b border-[var(--theme-border)] pb-5">
                <h2 className="text-2xl font-extrabold text-[var(--theme-text)]">Cariche e Referenti</h2>
                <p className="mt-1 text-sm text-[var(--theme-text-muted)]">Inserisci i responsabili del direttivo dell'associazione.</p>
              </div>

              <div className="space-y-8">
                {people.map((person, index) => (
                  <div key={person.role} className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface-2)] p-5 sm:p-8 hover:border-[var(--theme-border-strong)] transition-all group">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-2 h-8 bg-[var(--theme-brand)] rounded-full group-hover:scale-y-110 transition-transform"></div>
                      <h3 className="font-extrabold text-[var(--theme-text)] uppercase tracking-widest text-sm">
                        {ROLE_ITEMS.find((item) => item.role === person.role)?.label || person.role}
                      </h3>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor={`aff-person-name-${person.role}`} className="text-[11px] font-bold text-[var(--theme-text-muted)] uppercase tracking-wider">Nome Completo <span className="text-red-500">*</span></label>
                        <input id={`aff-person-name-${person.role}`} className="theme-input w-full h-11 px-4 rounded-xl border text-sm font-medium outline-none transition-all" placeholder="Nome e cognome" value={person.full_name} onChange={(e) => onPersonChange(index, "full_name", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor={`aff-person-email-${person.role}`} className="text-[11px] font-bold text-[var(--theme-text-muted)] uppercase tracking-wider">Email <span className="text-red-500">*</span></label>
                        <input id={`aff-person-email-${person.role}`} type="email" className="theme-input w-full h-11 px-4 rounded-xl border text-sm font-medium outline-none transition-all" placeholder="Email" value={person.email} onChange={(e) => onPersonChange(index, "email", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor={`aff-person-phone-${person.role}`} className="text-[11px] font-bold text-[var(--theme-text-muted)] uppercase tracking-wider">Telefono</label>
                        <input id={`aff-person-phone-${person.role}`} type="tel" className="theme-input w-full h-11 px-4 rounded-xl border text-sm font-medium outline-none transition-all" placeholder="+39" value={person.phone} onChange={(e) => onPersonChange(index, "phone", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor={`aff-person-cf-${person.role}`} className="text-[11px] font-bold text-[var(--theme-text-muted)] uppercase tracking-wider">Codice Fiscale</label>
                        <input id={`aff-person-cf-${person.role}`} className="theme-input w-full h-11 px-4 rounded-xl border text-sm font-bold outline-none transition-all uppercase placeholder:font-normal placeholder:normal-case" placeholder="16 caratteri" value={person.fiscal_code} onChange={(e) => onPersonChange(index, "fiscal_code", e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!showIntroScreen && !hasRealSubmission && currentStep === 3 && (
            <div id="affiliation-step-panel-3" role="region" aria-labelledby="affiliation-step-tab-3" className="p-5 sm:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="border-b border-[var(--theme-border)] pb-5">
                <h2 className="text-2xl font-extrabold text-[var(--theme-text)]">Upload Documenti</h2>
                <p className="mt-1 text-sm text-[var(--theme-text-muted)]">Carica i file richiesti. {publicUploadHint}. La segreteria convaliderà i documenti manualmente.</p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                {DOC_ITEMS.map((doc) => {
                  const docData = docsByType.get(doc.type);
                  const isUploaded = !!docData;
                  const isDraftUpload =
                    (!draft?.status || draft.status === "draft") &&
                    (docData?.status === "uploaded" || docData?.status === "pending");
                  const status = isDraftUpload
                    ? { label: "Caricato", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" }
                    : resolveStatusMeta(affiliationDocumentStatusMeta, docData?.status, "Non caricato");

                  return (
                    <div key={doc.type} className={`relative flex flex-col justify-between rounded-2xl border-2 p-5 transition-all ${isUploaded ? 'border-[var(--theme-brand)] bg-[var(--theme-brand-soft)] shadow-sm' : 'border-dashed border-[var(--theme-border-strong)] bg-[var(--theme-surface-2)] hover:border-[var(--theme-brand)]'}`}>
                      <div className="mb-6">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-bold text-sm text-[var(--theme-text)] leading-tight">{doc.label}</h3>
                          {isUploaded && (
                            <span className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-[var(--theme-brand)] text-[var(--theme-on-brand)] shadow-sm">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            </span>
                          )}
                        </div>
                        {isUploaded && (
                          <div className="mt-2 flex items-center gap-3">
                            <span className={`rounded border px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${status.tone}`}>
                              {status.label}
                            </span>
                            {docData.download_url && (
                              <a href={docData.download_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--theme-brand)] hover:underline flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                Vedi file
                              </a>
                            )}
                          </div>
                        )}
                        {docData?.rejection_note && (
                          <p className="mt-3 text-xs font-medium text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200">
                            Nota di rifiuto: {docData.rejection_note}
                          </p>
                        )}
                      </div>

                      <div className="mt-auto">
                        <label htmlFor={`aff-doc-${doc.type}`} className={`cursor-pointer w-full flex items-center justify-center h-12 px-4 rounded-xl text-sm font-bold transition-all focus-within:ring-2 focus-within:ring-[var(--theme-brand)] focus-within:ring-offset-2 ${
                          uploadingType === doc.type
                            ? 'bg-[var(--theme-surface-2)] text-[var(--theme-text-muted)] cursor-wait'
                            : isUploaded
                              ? 'btn-secondary'
                              : 'btn-primary'
                        }`}>
                          {uploadingType === doc.type ? (
                            <span className="flex items-center gap-2">
                              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                              Caricamento...
                            </span>
                          ) : isUploaded ? (
                            'Sostituisci File'
                          ) : (
                            <span className="flex items-center gap-2">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                              Carica file
                            </span>
                          )}
                          <input
                            id={`aff-doc-${doc.type}`}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="sr-only"
                            disabled={uploadingType === doc.type}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = "";
                              if (file) void onUploadDocument(doc.type, file);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!showIntroScreen && !hasRealSubmission && currentStep === 4 && (
            <div id="affiliation-step-panel-4" role="region" aria-labelledby="affiliation-step-tab-4" className="p-5 sm:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="border-b border-[var(--theme-border)] pb-5">
                <h2 className="text-2xl font-extrabold text-[var(--theme-text)]">Pagamento</h2>
                <p className="mt-1 text-sm text-[var(--theme-text-muted)]">Scegli come saldare la quota associativa.</p>
              </div>

              <div className="rounded-2xl border border-[var(--theme-border-strong)] bg-[var(--theme-chrome)] p-6 sm:p-8 text-[var(--theme-on-chrome)] flex items-center justify-between shadow-lg relative overflow-hidden">
                <div className="relative z-10">
                  <p className="text-[var(--theme-on-chrome)]/80 text-xs font-bold uppercase tracking-widest mb-1">Quota Affiliazione Annuale</p>
                  <p className="text-3xl sm:text-5xl font-extrabold tracking-tight">
                    {feeLabel}
                  </p>
                  {!paymentEnabled ? (
                    <p className="mt-3 max-w-md text-sm font-medium text-[var(--theme-on-chrome)]/80">
                      La segreteria confermerà importo e modalità prima del saldo.
                    </p>
                  ) : null}
                </div>
                <div className="hidden sm:flex w-16 h-16 rounded-full bg-white/10 items-center justify-center relative z-10">
                  <svg className="w-8 h-8 text-[var(--theme-on-chrome)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-[var(--theme-text)] text-sm uppercase tracking-wider">Metodo di pagamento <span className="text-red-500">*</span></h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <label htmlFor="aff-pay-stripe" className={`relative flex flex-col p-6 rounded-2xl border-2 cursor-pointer transition-all focus-within:ring-2 focus-within:ring-[var(--theme-brand)] ${
                    form.payment_method === "stripe" ? 'border-[var(--theme-brand)] bg-[var(--theme-brand-soft)] ring-4 ring-brand/10' : 'border-[var(--theme-border)] bg-[var(--theme-surface-solid)] hover:border-[var(--theme-border-strong)]'
                  } ${!stripeEnabled ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-extrabold text-[var(--theme-text)] text-lg">Carta di Credito</span>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${form.payment_method === "stripe" ? 'border-[var(--theme-brand)]' : 'border-[var(--theme-border-strong)]'}`}>
                        {form.payment_method === "stripe" && <div className="w-3 h-3 bg-[var(--theme-brand)] rounded-full"></div>}
                      </div>
                    </div>
                    <p className="text-sm text-[var(--theme-text-muted)] font-medium flex-grow leading-relaxed">Pagamento sicuro e immediato tramite Stripe. Attivazione automatica.</p>
                    <input id="aff-pay-stripe" type="radio" name="affiliation-payment-method" className="sr-only" checked={form.payment_method === "stripe"} disabled={!stripeEnabled} onChange={() => onFieldChange("payment_method", "stripe")} />
                  </label>

                  <label htmlFor="aff-pay-bank" className={`relative flex flex-col p-6 rounded-2xl border-2 cursor-pointer transition-all focus-within:ring-2 focus-within:ring-[var(--theme-brand)] ${
                    form.payment_method === "bank_transfer" ? 'border-[var(--theme-brand)] bg-[var(--theme-brand-soft)] ring-4 ring-brand/10' : 'border-[var(--theme-border)] bg-[var(--theme-surface-solid)] hover:border-[var(--theme-border-strong)]'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-extrabold text-[var(--theme-text)] text-lg">Bonifico Bancario</span>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${form.payment_method === "bank_transfer" ? 'border-[var(--theme-brand)]' : 'border-[var(--theme-border-strong)]'}`}>
                        {form.payment_method === "bank_transfer" && <div className="w-3 h-3 bg-[var(--theme-brand)] rounded-full"></div>}
                      </div>
                    </div>
                    <p className="text-sm text-[var(--theme-text-muted)] font-medium flex-grow leading-relaxed">Attivazione manuale post verifica contabile da parte di ASSONAM.</p>
                    <input id="aff-pay-bank" type="radio" name="affiliation-payment-method" className="sr-only" checked={form.payment_method === "bank_transfer"} onChange={() => onFieldChange("payment_method", "bank_transfer")} />
                  </label>
                </div>
              </div>

              {form.payment_method === "stripe" && stripeEnabled && (
                <div className="bg-[var(--theme-surface-2)] border border-[var(--theme-border)] rounded-2xl p-6 sm:p-8 text-center animate-in fade-in">
                  <p className="text-sm font-semibold text-[var(--theme-text)] mb-5">Verrai reindirizzato al portale sicuro di Stripe per completare il pagamento in 1 minuto.</p>
                  <button type="button" className="btn-primary inline-flex items-center justify-center h-14 px-10 rounded-xl text-lg font-bold tracking-wide" onClick={onOpenStripeCheckout}>
                    <svg className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7a4 4 0 00-8 0v4h8z" /></svg>
                    Paga con Stripe
                  </button>
                </div>
              )}

              {form.payment_method === "bank_transfer" && (
                <div className="bg-[var(--theme-surface-2)] border border-[var(--theme-border)] rounded-2xl p-5 sm:p-8 animate-in fade-in space-y-6">
                  <div className="text-center sm:text-left">
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--theme-text-muted)] mb-4">Coordinate Bancarie ASSONAM</p>
                    <div className="font-mono text-base sm:text-xl font-bold bg-[var(--theme-surface-solid)] border border-[var(--theme-border)] rounded-xl p-4 mb-4 select-all break-all text-[var(--theme-brand)] tracking-wider shadow-sm text-center">
                      {draft?.payment_config.bank_iban || "-"}
                    </div>
                    <p className="text-sm text-[var(--theme-text-muted)] font-medium">Causale obbligatoria: <strong className="text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded select-all">{draft?.payment_config.bank_causale_prefix || "AFFILIAZIONE"} - {draft?.payment_config.reference_code || "AFFILIAZIONE"}</strong></p>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2 pt-6 border-t border-[var(--theme-border)]">
                    <div className="space-y-1.5">
                      <label htmlFor="aff-manual-date" className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Data Prevista Versamento</label>
                      <input id="aff-manual-date" type="date" className="theme-input w-full h-12 px-4 rounded-xl border text-sm font-medium outline-none transition-all" value={form.manual_preferred_date} onChange={(e) => onFieldChange("manual_preferred_date", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="aff-manual-contact" className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Nome Referente Bonifico <span className="text-red-500">*</span></label>
                      <input id="aff-manual-contact" type="text" placeholder="Nome di chi effettua il bonifico" className="theme-input w-full h-12 px-4 rounded-xl border text-sm font-medium outline-none transition-all" value={form.manual_contact} onChange={(e) => onFieldChange("manual_contact", e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!showIntroScreen && !hasRealSubmission && currentStep === 5 && (
            <div id="affiliation-step-panel-5" role="region" aria-labelledby="affiliation-step-tab-5" className="p-5 sm:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="border-b border-[var(--theme-border)] pb-5">
                <h2 className="text-2xl font-extrabold text-[var(--theme-text)]">Riepilogo Finale</h2>
                <p className="mt-1 text-sm text-[var(--theme-text-muted)]">Un ultimo controllo prima di inviare definitivamente la richiesta.</p>
              </div>

              <div className="bg-[var(--theme-surface-2)] rounded-2xl border border-[var(--theme-border)] overflow-hidden">
                <dl className="divide-y divide-[var(--theme-border)] text-sm md:text-base">
                  <div className="flex flex-col sm:flex-row sm:justify-between p-5 gap-2">
                    <dt className="text-[var(--theme-text-muted)] font-semibold">Associazione</dt>
                    <dd className="font-bold text-[var(--theme-text)] sm:text-right">{form.organization_name || "-"}</dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between p-5 gap-2">
                    <dt className="text-[var(--theme-text-muted)] font-semibold">Referente</dt>
                    <dd className="font-bold text-[var(--theme-text)] sm:text-right">{form.applicant_full_name || "-"}</dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between p-5 gap-2 items-start sm:items-center">
                    <dt className="text-[var(--theme-text-muted)] font-semibold">Metodo Pagamento</dt>
                    <dd className="font-bold text-[var(--theme-text)] sm:text-right uppercase text-xs tracking-wider bg-[var(--theme-surface-solid)] border border-[var(--theme-border)] px-3 py-1.5 rounded-lg">
                      {form.payment_method === 'stripe' ? 'Carta di Credito' : form.payment_method === 'bank_transfer' ? 'Bonifico' : form.payment_method || "-"}
                    </dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between p-5 gap-2 items-start sm:items-center">
                    <dt className="text-[var(--theme-text-muted)] font-semibold">Documenti Caricati</dt>
                    <dd className="font-bold text-[var(--theme-text)] sm:text-right">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[var(--theme-brand-soft)] text-[var(--theme-brand)] text-sm">{docsByType.size}</span>
                      <span className="text-[var(--theme-text-muted)] text-sm ml-2 font-medium">/ 6 Obbligatori</span>
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="space-y-2">
                <label htmlFor="aff-notes" className="text-xs font-bold text-[var(--theme-text)] uppercase tracking-wider">Note Aggiuntive (Opzionale)</label>
                <textarea id="aff-notes" className="theme-input w-full min-h-[120px] p-4 rounded-xl border text-sm font-medium outline-none transition-all resize-y" placeholder="Comunicazioni per la segreteria..." value={form.notes} onChange={(e) => onFieldChange("notes", e.target.value)} />
              </div>

              {validation.issues.length > 0 ? (
                <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-6 shadow-sm">
                  <div className="flex items-center gap-3 text-red-800 font-extrabold text-lg mb-4">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    Attenzione: Dati Incompleti
                  </div>
                  <ul className="space-y-2 text-sm text-red-700 font-medium">
                    {validation.issues.map((issue) => (
                      <li key={issue} className="flex items-start gap-2">
                        <span className="text-red-500 font-bold">•</span> {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-emerald-900 text-lg">Tutto Pronto!</h4>
                    <p className="text-sm font-medium text-emerald-700 mt-1">I dati inseriti sono corretti. Clicca il pulsante "Invia Richiesta" in basso per completare la procedura.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {hasRealSubmission && (
            <div className="p-6 sm:p-16 text-center space-y-8 animate-in zoom-in-95 duration-500">
              <div className="mx-auto w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mb-6 border-4 border-emerald-200 shadow-sm">
                <svg className="w-12 h-12 sm:w-14 sm:h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[var(--theme-text)] tracking-tight">Richiesta Inviata!</h2>
              <p className="text-base sm:text-lg text-[var(--theme-text-muted)] max-w-lg mx-auto font-medium">
                Abbiamo preso in carico la tua domanda di affiliazione. Riceverai presto aggiornamenti dalla segreteria.
              </p>

              <div className="bg-[var(--theme-surface-2)] rounded-2xl p-6 border border-[var(--theme-border)] inline-block text-center sm:text-left w-full max-w-sm mx-auto mt-6">
                <p className="text-xs font-bold text-[var(--theme-text-soft)] uppercase tracking-widest mb-3 text-center">Stato Pratica</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
                  </span>
                  <strong className="text-[var(--theme-text)] font-extrabold uppercase tracking-wider text-lg">
                    {resolveStatusMeta(affiliationStatusMeta, submitResult?.status || draft?.status, "In revisione").label}
                  </strong>
                </div>
              </div>

              <div className="pt-8 flex flex-col sm:flex-row justify-center gap-4">
                {videoEnabled ? (
                  <button type="button" className="btn-primary inline-flex items-center justify-center h-14 px-8 rounded-xl font-bold tracking-wide text-lg" onClick={onOpenInstantWelcomeVideo}>
                    <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" /></svg>
                    Guarda Video
                  </button>
                ) : null}
                <Link to="/" className="btn-secondary inline-flex items-center justify-center h-14 px-8 rounded-xl font-bold text-lg">
                  Torna alla Home
                </Link>
              </div>
            </div>
          )}

          {/* Sticky Footer */}
          {!showIntroScreen && !hasRealSubmission && (
            <div className="fixed bottom-0 left-0 w-full bg-[var(--theme-surface-solid)]/95 backdrop-blur-xl border-t border-[var(--theme-border)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:p-5 z-40 md:sticky md:bottom-auto md:w-auto md:bg-[var(--theme-surface-2)] md:backdrop-blur-none md:border-t md:border-[var(--theme-border)] md:p-6 shadow-[0_-20px_40px_rgba(0,0,0,0.08)] md:shadow-none">
              <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
                <button
                  type="button"
                  className="btn-secondary px-6 h-12 rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={onGoPrevStep}
                  disabled={progressActiveStep <= 1 || saving}
                >
                  Indietro
                </button>

                {progressActiveStep < 5 ? (
                  <button
                    type="button"
                    className="btn-primary inline-flex items-center justify-center px-10 h-12 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => void onGoNextStep()}
                    disabled={saving}
                  >
                    {saving ? "Salvataggio..." : "Avanti"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary inline-flex items-center justify-center px-10 h-12 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={submitting || validation.issues.length > 0}
                    onClick={() => void onSubmit()}
                  >
                    {submitting ? (
                       <span className="flex items-center gap-2">
                       <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                       Invio in corso...
                     </span>
                    ) : "Invia Richiesta"}
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      <FullscreenVideoOverlay
        open={showVideoOverlay}
        onClose={() => setShowVideoOverlay(false)}
        associationName={overlayAssociationName}
        videoUrl={personalizedVideoUrl}
        preparing={isVideoPreparing}
        errorText={welcomeVideoError}
        statusLabel={
          !videoEnabled
            ? "Video disattivato in questa installazione."
            : welcomeVideoReady
              ? "Video personalizzato pronto."
              : isVideoPreparing
                ? "Sto preparando il video..."
                : welcomeVideoError
                  ? "Video non ancora disponibile."
                  : videoStatusLabel
        }
        onRetry={
          welcomeVideoError
            ? () => {
                void onRetryVideoStatus();
              }
            : undefined
        }
      />
    </div>
  );

};

export default Affiliazione;
