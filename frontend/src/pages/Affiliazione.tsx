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
import { useStatePlatformCapabilities } from "../hooks/useStatePlatformCapabilities";
import FullscreenVideoOverlay from "../components/affiliation/FullscreenVideoOverlay";

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

const INTRO_CHECKLIST_ITEMS = [
  "Statuto dell'associazione (PDF)",
  "Atto costitutivo (PDF)",
  "Codice fiscale associazione",
  "Documento Presidente",
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

const docStatusMeta = (status: string | undefined) => {
  if (status === "approved") {
    return { tone: "text-emerald-700", label: "approvato" };
  }
  if (status === "rejected") {
    return { tone: "text-red-700", label: "rifiutato" };
  }
  if (status === "pending" || status === "uploaded") {
    return { tone: "text-amber-700", label: "in revisione" };
  }
  return { tone: "text-neutral-500", label: "non caricato" };
};

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

const Affiliazione = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tokenFromQuery = searchParams.get("token")?.trim() || "";
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
  const { capabilities, loading: capabilitiesLoading } = useStatePlatformCapabilities();
  const stripeFallbackAppliedRef = useRef(false);
  const autoOpenedVideoRef = useRef(false);
  const navigate = useNavigate();
  const affiliazioneEnabled = capabilities?.affiliazioneEnabled === true;

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
    (publicToken: string) => {
      if (!publicToken) return;
      const nextParams = new URLSearchParams();
      nextParams.set("token", publicToken);
      if (referralFromQuery) {
        nextParams.set("ref", referralFromQuery);
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
      updateResumeLocation(nextDraft.public_token);
      if (syncForm) {
        setForm(toFormState(nextDraft));
        setPeople(toPeople(nextDraft));
      }

      const normalizedStatus = String(nextDraft.status || "").trim().toLowerCase();
      if (SUBMITTED_STATUSES.has(normalizedStatus)) {
        setShowIntroScreen(false);
        setCurrentStep(6);
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
      applyDraftState(created, options?.syncForm ?? true);
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
      const ensuredDraft = await ensureServerDraft({ syncForm: true });
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
      try {
        setLoading(true);
        if (tokenFromQuery) {
          const existingDraft = await fetchAffiliationDraft(tokenFromQuery);
          setSubmitResult(null);
          applyDraftState(existingDraft, true);
          const normalizedStatus = String(existingDraft.status || "").trim().toLowerCase();
          if (SUBMITTED_STATUSES.has(normalizedStatus)) {
            setShowIntroScreen(false);
            setCurrentStep(6);
          } else {
            setShowIntroScreen(true);
            setCurrentStep(1);
          }
        } else {
          setToken("");
          setDraft(null);
          setSubmitResult(null);
          setForm(buildEmptyForm());
          setPeople(buildDefaultPeople());
          setShowIntroScreen(true);
          setCurrentStep(1);
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

  const stripeEnabled =
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
      addError(1, "L'email del referente non e valida.");
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
        addError(2, `L'email del ruolo ${role.label} non e valida.`);
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
      try {
        setUploadingType(docType);
        setError("");
        const currentDraft = await ensureServerDraft({ syncForm: true });
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
      const currentDraft = await ensureServerDraft({ syncForm: true });
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
        setCurrentStep(6);
        return;
      }
      const response = await submitAffiliationDraft(syncedDraft.public_token, {
        idempotencyKey:
          buildTokenActionIdempotencyKey("submit", syncedDraft.public_token) || undefined,
      });
      setSubmitResult(response);
      applyDraftState(response.application, false);
      setShowIntroScreen(false);
      setCurrentStep(6);
      setShowVideoOverlay(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore invio richiesta");
    } finally {
      setSubmitting(false);
    }
  }, [applyDraftState, syncDraftData, validation.firstInvalidStep, validation.issues.length]);

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
      setCurrentStep(1);
      return;
    }
    setShowIntroScreen(false);
    setCurrentStep(1);
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

  const onGoPrevStep = () => {
    setError("");
    setCurrentStep((value) => Math.max(1, value - 1));
  };

  const onGoNextStep = async () => {
    if (hasCurrentStepErrors) {
      setError("Completa i campi obbligatori dello step prima di continuare.");
      return;
    }
    try {
      setSaving(true);
      setError("");

      if (currentStep === 1 || currentStep === 2 || currentStep === 4) {
        const currentDraft = await ensureServerDraft({ syncForm: true });
        if (SUBMITTED_STATUSES.has(String(currentDraft.status || "").trim().toLowerCase())) {
          return;
        }
        if (currentStep === 1 || currentStep === 4) {
          await saveApplicationDetails(currentDraft.public_token);
        }
        if (currentStep === 2) {
          await saveApplicationPeople(currentDraft.public_token);
        }
      }

      setCurrentStep((value) => Math.min(5, value + 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio step");
    } finally {
      setSaving(false);
    }
  };

  if (capabilitiesLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-sm text-slate-500 text-center animate-pulse flex flex-col items-center gap-4">
           <svg className="animate-spin w-8 h-8 text-brand" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
           Caricamento procedura...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50/50 py-8 md:py-12 font-sans text-slate-900 pb-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        
        {/* Header minimal */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">
            Affilia la tua Associazione
          </h1>
          <p className="mt-3 text-sm md:text-base text-slate-500 max-w-xl mx-auto">
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
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 shadow-sm flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <div>{error}</div>
          </div>
        )}

        {/* Stepper top */}
        {!showIntroScreen && !hasRealSubmission && (
          <div className="mb-10 mt-4">
            <div className="flex items-center justify-between relative z-0">
              {/* Line behind */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 rounded-full -z-10"></div>
              <div 
                className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-brand transition-all duration-500 ease-out rounded-full -z-10"
                style={{ width: `${progressPercent}%` }}
              ></div>
              
              {WIZARD_PROGRESS_STEPS.map((item) => {
                const isActive = item.step === progressActiveStep;
                const isCompleted = item.step < progressActiveStep;
                return (
                  <button
                    key={item.step}
                    type="button"
                    onClick={() => {
                      setShowIntroScreen(false);
                      setCurrentStep(item.step);
                    }}
                    className={`group relative flex flex-col items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded-lg p-1 transition-transform hover:scale-105`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm transition-colors border-2
                      ${isActive 
                        ? "bg-white border-brand text-brand ring-4 ring-brand/10" 
                        : isCompleted 
                          ? "bg-brand border-brand text-white" 
                          : "bg-white border-slate-200 text-slate-400 group-hover:border-slate-300"
                      }`}
                    >
                      {isCompleted ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        item.step
                      )}
                    </div>
                    <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-widest absolute -bottom-7 w-max text-center
                      ${isActive ? "text-brand" : isCompleted ? "text-slate-700" : "text-slate-400 hidden sm:block"}
                    `}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Card */}
        <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden transition-all relative">
          
          {showIntroScreen && (
            <div className="p-6 sm:p-12 space-y-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-brand/5 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="text-center relative z-10">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-brand/10 to-brand/5 text-brand mb-6 shadow-inner border border-brand/10">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900">Inizia la tua richiesta</h2>
                <p className="mt-3 text-base text-slate-500 max-w-md mx-auto leading-relaxed">
                  La procedura richiede circa 10 minuti. Assicurati di avere a disposizione i documenti in formato PDF.
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-6 sm:p-8 border border-slate-100 relative z-10">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-5">Checklist necessaria</h3>
                <ul className="grid sm:grid-cols-2 gap-4">
                  {INTRO_CHECKLIST_ITEMS.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-slate-700 font-medium">
                      <svg className="w-5 h-5 text-brand shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      <span className="leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 text-center relative z-10">
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-full sm:w-auto min-w-[240px] h-14 px-8 rounded-xl bg-gradient-to-r from-brand to-brand-light text-white text-lg font-bold tracking-wide shadow-xl shadow-brand/20 hover:-translate-y-1 hover:shadow-2xl hover:shadow-brand/30 transition-all focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
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
            <div className="p-6 sm:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="border-b border-slate-100 pb-5">
                <h2 className="text-2xl font-extrabold text-slate-900">Dati dell'Associazione</h2>
                <p className="mt-1 text-sm text-slate-500">Inserisci i riferimenti principali e i dati del referente della richiesta.</p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nome associazione <span className="text-red-500">*</span></label>
                  <input className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium focus:bg-white focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all placeholder:font-normal" placeholder="Associazione XYZ" value={form.organization_name} onChange={(e) => onFieldChange("organization_name", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Ragione sociale</label>
                  <input className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium focus:bg-white focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all placeholder:font-normal" placeholder="Opzionale" value={form.organization_legal_name} onChange={(e) => onFieldChange("organization_legal_name", e.target.value)} />
                </div>
                
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Indirizzo Sede Legale</label>
                  <input className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium focus:bg-white focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all placeholder:font-normal" placeholder="Via Roma 1" value={form.address_line1} onChange={(e) => onFieldChange("address_line1", e.target.value)} />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Città</label>
                  <input className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium focus:bg-white focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all placeholder:font-normal" placeholder="Roma" value={form.city} onChange={(e) => onFieldChange("city", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">CAP</label>
                    <input className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium focus:bg-white focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all placeholder:font-normal" placeholder="00100" value={form.postal_code} onChange={(e) => onFieldChange("postal_code", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Provincia</label>
                    <input className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium focus:bg-white focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all placeholder:font-normal" placeholder="RM" value={form.province} onChange={(e) => onFieldChange("province", e.target.value)} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Codice Fiscale Associazione</label>
                  <input className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-bold focus:bg-white focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all uppercase placeholder:font-normal placeholder:normal-case" placeholder="11 cifre" value={form.tax_code} onChange={(e) => onFieldChange("tax_code", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Partita IVA (se presente)</label>
                  <input className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-bold focus:bg-white focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all placeholder:font-normal" placeholder="11 cifre" value={form.vat_number} onChange={(e) => onFieldChange("vat_number", e.target.value)} />
                </div>

                <div className="sm:col-span-2 pt-8 border-t border-slate-100">
                  <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                    <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    Dati Referente Pratica
                  </h3>
                </div>
                
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nome e Cognome <span className="text-red-500">*</span></label>
                  <input className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium focus:bg-white focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all placeholder:font-normal" placeholder="Mario Rossi" value={form.applicant_full_name} onChange={(e) => onFieldChange("applicant_full_name", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Telefono <span className="text-red-500">*</span></label>
                  <input type="tel" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium focus:bg-white focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all placeholder:font-normal" placeholder="+39" value={form.applicant_phone} onChange={(e) => onFieldChange("applicant_phone", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Email <span className="text-red-500">*</span></label>
                  <input type="email" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium focus:bg-white focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all placeholder:font-normal" placeholder="mario@esempio.it" value={form.applicant_email} onChange={(e) => onFieldChange("applicant_email", e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {!showIntroScreen && !hasRealSubmission && currentStep === 2 && (
            <div className="p-6 sm:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="border-b border-slate-100 pb-5">
                <h2 className="text-2xl font-extrabold text-slate-900">Cariche e Referenti</h2>
                <p className="mt-1 text-sm text-slate-500">Inserisci i responsabili del direttivo dell'associazione.</p>
              </div>

              <div className="space-y-8">
                {people.map((person, index) => (
                  <div key={person.role} className="rounded-2xl border border-slate-200 bg-slate-50/30 p-6 sm:p-8 hover:border-brand/30 hover:shadow-md transition-all group">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-2 h-8 bg-brand rounded-full group-hover:scale-y-110 transition-transform"></div>
                      <h3 className="font-extrabold text-slate-800 uppercase tracking-widest text-sm">
                        {ROLE_ITEMS.find((item) => item.role === person.role)?.label || person.role}
                      </h3>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Nome Completo</label>
                        <input className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all" placeholder="Nome" value={person.full_name} onChange={(e) => onPersonChange(index, "full_name", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Email</label>
                        <input type="email" className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all" placeholder="Email" value={person.email} onChange={(e) => onPersonChange(index, "email", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Telefono</label>
                        <input type="tel" className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all" placeholder="+39" value={person.phone} onChange={(e) => onPersonChange(index, "phone", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Codice Fiscale</label>
                        <input className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all uppercase placeholder:font-normal placeholder:normal-case" placeholder="16 caratteri" value={person.fiscal_code} onChange={(e) => onPersonChange(index, "fiscal_code", e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!showIntroScreen && !hasRealSubmission && currentStep === 3 && (
            <div className="p-6 sm:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="border-b border-slate-100 pb-5">
                <h2 className="text-2xl font-extrabold text-slate-900">Upload Documenti</h2>
                <p className="mt-1 text-sm text-slate-500">Carica i file in formato PDF. La segreteria convaliderà i documenti manualmente.</p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                {DOC_ITEMS.map((doc) => {
                  const docData = docsByType.get(doc.type);
                  const isUploaded = !!docData;
                  const status = docStatusMeta(docData?.status);
                  
                  return (
                    <div key={doc.type} className={`relative flex flex-col justify-between rounded-2xl border-2 p-5 transition-all ${isUploaded ? 'border-brand/40 bg-brand/[0.02] shadow-sm' : 'border-dashed border-slate-300 bg-slate-50/80 hover:bg-slate-50 hover:border-slate-400'}`}>
                      <div className="mb-6">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-bold text-sm text-slate-900 leading-tight">{doc.label}</h3>
                          {isUploaded && (
                            <span className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-brand text-white shadow-sm">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            </span>
                          )}
                        </div>
                        {isUploaded && (
                          <div className="mt-2 flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              status.label === 'approvato' ? 'bg-emerald-100 text-emerald-800' : 
                              status.label === 'rifiutato' ? 'bg-red-100 text-red-800' : 
                              'bg-amber-100 text-amber-800'
                            }`}>
                              {status.label}
                            </span>
                            {docData.download_url && (
                              <a href={docData.download_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand hover:underline flex items-center gap-1">
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
                        <label className={`cursor-pointer w-full flex items-center justify-center h-12 px-4 rounded-xl text-sm font-bold transition-all ${
                          uploadingType === doc.type 
                            ? 'bg-slate-200 text-slate-500 cursor-wait' 
                            : isUploaded 
                              ? 'bg-white border-2 border-slate-200 text-slate-600 hover:border-brand hover:text-brand' 
                              : 'bg-slate-900 text-white shadow-md hover:-translate-y-0.5 hover:shadow-lg'
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
                              Carica PDF
                            </span>
                          )}
                          <input
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            disabled={uploadingType === doc.type}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
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
            <div className="p-6 sm:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="border-b border-slate-100 pb-5">
                <h2 className="text-2xl font-extrabold text-slate-900">Pagamento</h2>
                <p className="mt-1 text-sm text-slate-500">Scegli come saldare la quota associativa.</p>
              </div>

              <div className="bg-slate-900 rounded-2xl p-8 text-white flex items-center justify-between shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
                <div className="relative z-10">
                  <p className="text-brand-light text-xs font-bold uppercase tracking-widest mb-1">Quota Affiliazione Annuale</p>
                  <p className="text-4xl sm:text-5xl font-extrabold tracking-tight">
                    {((draft?.payment_amount_cents ?? 0) / 100).toLocaleString("it-IT", { minimumFractionDigits: 2 })} <span className="text-xl text-slate-400 font-medium">EUR</span>
                  </p>
                </div>
                <div className="hidden sm:flex w-16 h-16 rounded-full bg-white/10 items-center justify-center relative z-10">
                  <svg className="w-8 h-8 text-brand-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Metodo di pagamento</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className={`relative flex flex-col p-6 rounded-2xl border-2 cursor-pointer transition-all ${
                    form.payment_method === "stripe" ? 'border-brand bg-brand/5 ring-4 ring-brand/10' : 'border-slate-200 bg-white hover:border-slate-300'
                  } ${!stripeEnabled ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-extrabold text-slate-900 text-lg">Carta di Credito</span>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${form.payment_method === "stripe" ? 'border-brand' : 'border-slate-300'}`}>
                        {form.payment_method === "stripe" && <div className="w-3 h-3 bg-brand rounded-full"></div>}
                      </div>
                    </div>
                    <p className="text-sm text-slate-500 font-medium flex-grow leading-relaxed">Pagamento sicuro e immediato tramite Stripe. Attivazione automatica.</p>
                    <input type="radio" className="hidden" checked={form.payment_method === "stripe"} disabled={!stripeEnabled} onChange={() => onFieldChange("payment_method", "stripe")} />
                  </label>

                  <label className={`relative flex flex-col p-6 rounded-2xl border-2 cursor-pointer transition-all ${
                    form.payment_method === "bank_transfer" ? 'border-brand bg-brand/5 ring-4 ring-brand/10' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-extrabold text-slate-900 text-lg">Bonifico Bancario</span>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${form.payment_method === "bank_transfer" ? 'border-brand' : 'border-slate-300'}`}>
                        {form.payment_method === "bank_transfer" && <div className="w-3 h-3 bg-brand rounded-full"></div>}
                      </div>
                    </div>
                    <p className="text-sm text-slate-500 font-medium flex-grow leading-relaxed">Attivazione manuale post verifica contabile da parte di ASSONAM.</p>
                    <input type="radio" className="hidden" checked={form.payment_method === "bank_transfer"} onChange={() => onFieldChange("payment_method", "bank_transfer")} />
                  </label>
                </div>
              </div>

              {form.payment_method === "stripe" && stripeEnabled && (
                <div className="bg-[#635BFF]/5 border border-[#635BFF]/20 rounded-2xl p-6 sm:p-8 text-center animate-in fade-in">
                  <p className="text-sm font-semibold text-[#635BFF] mb-5">Verrai reindirizzato al portale sicuro di Stripe per completare il pagamento in 1 minuto.</p>
                  <button type="button" className="inline-flex items-center justify-center h-14 px-10 rounded-xl bg-[#635BFF] hover:bg-[#5851E5] text-white text-lg font-bold tracking-wide shadow-lg shadow-[#635BFF]/30 transition-all hover:-translate-y-0.5 focus:ring-4 focus:ring-[#635BFF]/30" onClick={onOpenStripeCheckout}>
                    <svg className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7a4 4 0 00-8 0v4h8z" /></svg>
                    Paga con Stripe
                  </button>
                </div>
              )}

              {form.payment_method === "bank_transfer" && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 sm:p-8 animate-in fade-in space-y-6">
                  <div className="text-center sm:text-left">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Coordinate Bancarie ASSONAM</p>
                    <div className="font-mono text-base sm:text-xl font-bold bg-white border border-slate-200 rounded-xl p-4 mb-4 select-all break-all text-brand tracking-wider shadow-sm text-center">
                      {draft?.payment_config.bank_iban || "-"}
                    </div>
                    <p className="text-sm text-slate-600 font-medium">Causale obbligatoria: <strong className="text-slate-900 bg-amber-100/50 border border-amber-200 px-2 py-1 rounded select-all">{draft?.payment_config.bank_causale_prefix || "AFFILIAZIONE"} - {token}</strong></p>
                  </div>
                  
                  <div className="grid gap-5 sm:grid-cols-2 pt-6 border-t border-slate-200">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Data Prevista Versamento</label>
                      <input type="date" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all" value={form.manual_preferred_date} onChange={(e) => onFieldChange("manual_preferred_date", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nome Referente Bonifico</label>
                      <input type="text" placeholder="Nome di chi effettua il bonifico" className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all" value={form.manual_contact} onChange={(e) => onFieldChange("manual_contact", e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!showIntroScreen && !hasRealSubmission && currentStep === 5 && (
            <div className="p-6 sm:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="border-b border-slate-100 pb-5">
                <h2 className="text-2xl font-extrabold text-slate-900">Riepilogo Finale</h2>
                <p className="mt-1 text-sm text-slate-500">Un ultimo controllo prima di inviare definitivamente la richiesta.</p>
              </div>

              <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                <dl className="divide-y divide-slate-100 text-sm md:text-base">
                  <div className="flex flex-col sm:flex-row sm:justify-between p-5 gap-2">
                    <dt className="text-slate-500 font-semibold">Associazione</dt>
                    <dd className="font-bold text-slate-900 sm:text-right">{form.organization_name || "-"}</dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between p-5 gap-2">
                    <dt className="text-slate-500 font-semibold">Referente</dt>
                    <dd className="font-bold text-slate-900 sm:text-right">{form.applicant_full_name || "-"}</dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between p-5 gap-2 items-start sm:items-center">
                    <dt className="text-slate-500 font-semibold">Metodo Pagamento</dt>
                    <dd className="font-bold text-slate-900 sm:text-right uppercase text-xs tracking-wider bg-slate-200 px-3 py-1.5 rounded-lg">
                      {form.payment_method === 'stripe' ? 'Carta di Credito' : form.payment_method === 'bank_transfer' ? 'Bonifico' : form.payment_method || "-"}
                    </dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between p-5 gap-2 items-start sm:items-center">
                    <dt className="text-slate-500 font-semibold">Documenti Caricati</dt>
                    <dd className="font-bold text-slate-900 sm:text-right">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand/10 text-brand text-sm">{docsByType.size}</span>
                      <span className="text-slate-500 text-sm ml-2 font-medium">/ 6 Obbligatori</span>
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Note Aggiuntive (Opzionale)</label>
                <textarea className="w-full min-h-[120px] p-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium focus:bg-white focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all resize-y" placeholder="Comunicazioni per la segreteria..." value={form.notes} onChange={(e) => onFieldChange("notes", e.target.value)} />
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
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
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
            <div className="p-8 sm:p-16 text-center space-y-8 animate-in zoom-in-95 duration-500">
              <div className="mx-auto w-28 h-28 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-8 border-4 border-emerald-100 shadow-xl shadow-emerald-100/50">
                <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </div>
              <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Richiesta Inviata!</h2>
              <p className="text-lg text-slate-500 max-w-lg mx-auto font-medium">
                Abbiamo preso in carico la tua domanda di affiliazione. Riceverai presto aggiornamenti dalla segreteria.
              </p>
              
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 inline-block text-center sm:text-left w-full max-w-sm mx-auto mt-6">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">Stato Pratica</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
                  </span>
                  <strong className="text-slate-800 font-extrabold uppercase tracking-wider text-lg">{submitResult?.status || draft?.status || "In Revisione"}</strong>
                </div>
              </div>

              <div className="pt-10 flex flex-col sm:flex-row justify-center gap-4">
                <button type="button" className="inline-flex items-center justify-center h-14 px-8 rounded-xl bg-brand text-white font-bold tracking-wide shadow-lg shadow-brand/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand/40 transition-all text-lg" onClick={onOpenInstantWelcomeVideo}>
                  <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" /></svg>
                  Guarda Video
                </button>
                <Link to="/" className="inline-flex items-center justify-center h-14 px-8 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-all text-lg">
                  Torna alla Home
                </Link>
              </div>
            </div>
          )}

          {/* Sticky Footer */}
          {!showIntroScreen && !hasRealSubmission && (
            <div className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-xl border-t border-slate-200 p-4 sm:p-5 z-40 md:sticky md:bottom-auto md:w-auto md:bg-slate-50/50 md:backdrop-blur-none md:border-t md:border-slate-100 md:p-6 shadow-[0_-20px_40px_rgba(0,0,0,0.08)] md:shadow-none">
              <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
                <button
                  type="button"
                  className="px-6 h-12 rounded-xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  onClick={onGoPrevStep}
                  disabled={progressActiveStep <= 1 || saving}
                >
                  Indietro
                </button>
                
                {progressActiveStep < 5 ? (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center px-10 h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-lg shadow-slate-900/20 hover:shadow-xl transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    onClick={() => void onGoNextStep()}
                    disabled={saving}
                  >
                    {saving ? "Salvataggio..." : "Avanti"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center px-10 h-12 rounded-xl bg-brand hover:bg-brand-light text-white text-sm font-bold shadow-lg shadow-brand/30 hover:shadow-xl transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed disabled:transform-none"
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
