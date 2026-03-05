import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  createAffiliationDraft,
  createAffiliationStripeCheckout,
  fetchAffiliationDraft,
  patchAffiliationDraft,
  replaceAffiliationPeople,
  submitAffiliationDraft,
  uploadAffiliationDocument,
  type AffiliationDraft,
  type AffiliationSubmitResponse,
} from "../lib/api";
import { applySeo } from "../lib/seo";
import { useStatePlatformCapabilities } from "../hooks/useStatePlatformCapabilities";

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

const TRUST_BADGES = [
  "Pagamento sicuro",
  "Verifica documenti",
  "Attivazione dopo approvazione",
] as const;

const BASE_WELCOME_VIDEO_URL = "/videos/welcome_base.mp4";

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

const Affiliazione = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tokenFromQuery = searchParams.get("token")?.trim() || "";
  const referralFromQuery = searchParams.get("ref")?.trim().toLowerCase() || "";
  const [token, setToken] = useState<string>("");
  const [draft, setDraft] = useState<AffiliationDraft | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [people, setPeople] = useState<PersonForm[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [showIntroScreen, setShowIntroScreen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saveInfo, setSaveInfo] = useState("Bozza non salvata");
  const [submitResult, setSubmitResult] = useState<AffiliationSubmitResponse | null>(null);
  const [showVideoOverlay, setShowVideoOverlay] = useState(false);
  const [baseVideoEnded, setBaseVideoEnded] = useState(false);
  const [baseVideoFailed, setBaseVideoFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const { capabilities, loading: capabilitiesLoading } = useStatePlatformCapabilities();
  const [dirtyCounter, setDirtyCounter] = useState(0);
  const [resumeLinkCopied, setResumeLinkCopied] = useState(false);
  const autosaveReadyRef = useRef(false);
  const stripeFallbackAppliedRef = useRef(false);
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

  const applyDraftState = useCallback((nextDraft: AffiliationDraft) => {
    setDraft(nextDraft);
    setForm(toFormState(nextDraft));
    setPeople(toPeople(nextDraft));
  }, []);

  const refreshDraft = useCallback(
    async (draftToken: string, syncForm: boolean) => {
      const nextDraft = await fetchAffiliationDraft(draftToken);
      setDraft(nextDraft);
      if (syncForm) {
        setForm(toFormState(nextDraft));
        setPeople(toPeople(nextDraft));
      }
      return nextDraft;
    },
    [],
  );

  const persistDraft = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token || !form) return false;
      const silent = Boolean(options?.silent);
      try {
        if (!silent) {
          setSaving(true);
          setSaveInfo("Salvataggio bozza in corso...");
        }
        await patchAffiliationDraft(token, {
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
        await replaceAffiliationPeople(
          token,
          people.map((item) => ({
            role: item.role,
            full_name: item.full_name || null,
            email: item.email || null,
            phone: item.phone || null,
            fiscal_code: item.fiscal_code || null,
          })),
        );
        await refreshDraft(token, false);
        setSaveInfo("Bozza salvata");
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore salvataggio bozza");
        setSaveInfo("Errore salvataggio bozza");
        return false;
      } finally {
        if (!silent) {
          setSaving(false);
        }
      }
    },
    [form, people, refreshDraft, token],
  );

  useEffect(() => {
    if (capabilitiesLoading) return;
    if (!affiliazioneEnabled) return;

    const boot = async () => {
      try {
        setLoading(true);
        if (tokenFromQuery) {
          setToken(tokenFromQuery);
          const existingDraft = await fetchAffiliationDraft(tokenFromQuery);
          applyDraftState(existingDraft);
        } else {
          const created = await createAffiliationDraft(
            referralFromQuery ? { referral_slug: referralFromQuery } : undefined,
          );
          setToken(created.public_token);
          applyDraftState(created);
          const nextParams = new URLSearchParams();
          nextParams.set("token", created.public_token);
          if (referralFromQuery) {
            nextParams.set("ref", referralFromQuery);
          }
          setSearchParams(nextParams, { replace: true });
        }
        autosaveReadyRef.current = true;
        setSaveInfo("Bozza pronta");
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
    referralFromQuery,
    setSearchParams,
    tokenFromQuery,
  ]);

  useEffect(() => {
    if (!token || !form || !autosaveReadyRef.current) return;
    if (saving || submitting) return;
    if (dirtyCounter === 0) return;

    const timeout = window.setTimeout(async () => {
      await persistDraft();
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [dirtyCounter, form, persistDraft, saving, submitting, token]);

  const stripeEnabled =
    capabilities?.stripeEnabled === true &&
    (draft?.payment_config?.stripe_enabled ?? true);

  useEffect(() => {
    if (!form || !token) return;
    if (stripeEnabled) return;

    if (!form.payment_method) {
      setForm((current) =>
        current ? { ...current, payment_method: "bank_transfer" } : current,
      );
      setDirtyCounter((value) => value + 1);
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
      setDirtyCounter((value) => value + 1);
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

  const resumeUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const draftResume = (draft?.resume_url || "").trim();
    if (draftResume) {
      return new URL(draftResume, window.location.origin).toString();
    }
    if (!token) return "";
    return `${window.location.origin}/affiliazione?token=${encodeURIComponent(token)}`;
  }, [draft?.resume_url, token]);

  const markDirty = useCallback(() => {
    setDirtyCounter((value) => value + 1);
  }, []);

  const onFieldChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    markDirty();
  };

  const onPersonChange = (index: number, key: keyof PersonForm, value: string) => {
    setPeople((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
    markDirty();
  };

  const onUploadDocument = async (docType: string, file: File) => {
    if (!token) return;
    try {
      setUploadingType(docType);
      setError("");
      await uploadAffiliationDocument(token, docType, file);
      await refreshDraft(token, false);
      setSaveInfo("Documento caricato");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore upload documento");
    } finally {
      setUploadingType(null);
    }
  };

  const onOpenStripeCheckout = async () => {
    if (!token || !form) return;
    if (!stripeEnabled) {
      setError("Stripe non configurato. Usa Bonifico o Contanti.");
      return;
    }
    try {
      setError("");
      if (form.payment_method !== "stripe") {
        onFieldChange("payment_method", "stripe");
        await patchAffiliationDraft(token, { payment_method: "stripe" });
      }
      const payload = await createAffiliationStripeCheckout(token);
      window.open(payload.checkout_url, "_blank", "noopener,noreferrer");
      await refreshDraft(token, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore apertura checkout Stripe");
    }
  };

  const onSubmit = async () => {
    if (!token) return;
    try {
      setSubmitting(true);
      setError("");
      const saved = await persistDraft({ silent: true });
      if (!saved) {
        return;
      }
      const response = await submitAffiliationDraft(token);
      setSubmitResult(response);
      setDraft(response.application);
      setShowIntroScreen(false);
      setCurrentStep(6);
      setBaseVideoEnded(false);
      setBaseVideoFailed(false);
      setShowVideoOverlay(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore invio richiesta");
    } finally {
      setSubmitting(false);
    }
  };

  const onCopyResumeLink = async () => {
    if (!resumeUrl) return;
    try {
      await navigator.clipboard.writeText(resumeUrl);
      setResumeLinkCopied(true);
      window.setTimeout(() => setResumeLinkCopied(false), 1500);
    } catch {
      setError("Impossibile copiare il link. Copialo manualmente.");
    }
  };

  const onOpenInstantWelcomeVideo = () => {
    setBaseVideoEnded(false);
    setBaseVideoFailed(false);
    setShowVideoOverlay(true);
  };

  if (capabilitiesLoading || loading || !form) {
    return (
      <section className="py-16">
        <div className="container-shell">
          <div className="surface-strong p-8 text-sm text-neutral-500">Caricamento wizard...</div>
        </div>
      </section>
    );
  }

  const currentVideoJob = submitResult?.latest_video_job || draft?.latest_video_job || null;
  const progressActiveStep = Math.min(5, Math.max(1, currentStep));
  const progressPercent = ((progressActiveStep - 1) / (WIZARD_PROGRESS_STEPS.length - 1)) * 100;
  const overlayAssociationName = (
    submitResult?.application.organization_name ||
    draft?.organization_name ||
    form.organization_name ||
    "ASSOCIATION"
  )
    .trim()
    .toUpperCase();

  return (
    <section className="py-14">
      <div className="container-shell space-y-6">
        <div className="surface-strong p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="section-title">Wizard Pubblico</p>
              <h1 className="section-heading">Affilia la tua Associazione</h1>
              <p className="section-subtitle">
                Bozza salvata automaticamente. Riprendi con il link dedicato e completa in 5 passaggi.
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white/80 px-4 py-3 text-xs text-neutral-600">
              <p className="font-semibold text-neutral-800">Token pratica</p>
              <p className="mt-1 break-all">{token}</p>
              <p className="mt-2 font-semibold text-neutral-800">Link ripresa</p>
              <p className="mt-1 break-all">{resumeUrl || "-"}</p>
              <button
                type="button"
                className="mt-2 rounded-md border border-neutral-300 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:border-brand/40"
                onClick={onCopyResumeLink}
              >
                {resumeLinkCopied ? "Link copiato" : "Copia link"}
              </button>
              <p className="mt-2">{saving ? "Salvataggio..." : saveInfo}</p>
            </div>
          </div>

          {draft?.status === "changes_requested" && (
            <div className="mt-5 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
              Modifiche richieste da ASSONAM. Aggiorna dati e documenti, poi invia nuovamente.
              {draft.review_notes ? <div className="mt-1 font-medium">{draft.review_notes}</div> : null}
            </div>
          )}

          {draft?.referral?.referrer_org_name && (
            <div className="mt-5 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
              Invito da <span className="font-semibold">{draft.referral.referrer_org_name}</span>
            </div>
          )}

          {notice && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {notice}
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!showIntroScreen && (
            <div className="mt-6 space-y-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0 md:pb-0">
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
                      className={`min-w-[118px] shrink-0 rounded-md border px-2 py-2 text-left text-[11px] leading-tight transition md:min-w-0 ${
                        isActive
                          ? "border-brand bg-brand/10 text-brand"
                          : isCompleted
                            ? "border-brand/30 bg-brand/[0.05] text-brand/90"
                            : "border-neutral-200 bg-white text-neutral-500 hover:border-brand/40"
                      }`}
                    >
                      <div className="font-semibold">
                        {item.step} {item.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {showIntroScreen && (
          <div className="surface p-6 space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-neutral-900">Affilia la tua Associazione</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Richiede circa 10 minuti. Ti serviranno solo alcuni documenti dell’associazione.
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Checklist documenti
              </p>
              <ul className="mt-3 space-y-2 text-sm text-neutral-700">
                {INTRO_CHECKLIST_ITEMS.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-sm text-neutral-600">
              Potrai salvare la richiesta e continuare più tardi.
            </p>

            <div className="flex flex-wrap gap-2">
              {TRUST_BADGES.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700"
                >
                  {badge}
                </span>
              ))}
            </div>

            <div>
              <button
                type="button"
                className="btn-primary w-full sm:w-auto"
                onClick={() => {
                  setShowIntroScreen(false);
                  setCurrentStep(1);
                }}
              >
                Inizia Affiliazione
              </button>
            </div>
          </div>
        )}

        {!showIntroScreen && currentStep === 1 && (
          <div className="surface p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Checklist iniziale</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Prima di compilare, prepara questi documenti obbligatori.
              </p>
              <ul className="mt-3 grid gap-2 text-sm text-neutral-700 md:grid-cols-2">
                {DOC_ITEMS.map((item) => (
                  <li key={item.type} className="rounded-md border border-neutral-200 bg-white px-3 py-2">
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Nome associazione *" value={form.organization_name} onChange={(e) => onFieldChange("organization_name", e.target.value)} />
              <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Ragione sociale" value={form.organization_legal_name} onChange={(e) => onFieldChange("organization_legal_name", e.target.value)} />
              <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Slug suggerito (opzionale)" value={form.organization_slug_candidate} onChange={(e) => onFieldChange("organization_slug_candidate", e.target.value)} />
              <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Codice fiscale associazione" value={form.tax_code} onChange={(e) => onFieldChange("tax_code", e.target.value)} />
              <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Partita IVA" value={form.vat_number} onChange={(e) => onFieldChange("vat_number", e.target.value)} />
              <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Telefono referente *" value={form.applicant_phone} onChange={(e) => onFieldChange("applicant_phone", e.target.value)} />
              <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm md:col-span-2" placeholder="Indirizzo sede legale" value={form.address_line1} onChange={(e) => onFieldChange("address_line1", e.target.value)} />
              <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm md:col-span-2" placeholder="Indirizzo aggiuntivo" value={form.address_line2} onChange={(e) => onFieldChange("address_line2", e.target.value)} />
              <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Citta" value={form.city} onChange={(e) => onFieldChange("city", e.target.value)} />
              <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Provincia" value={form.province} onChange={(e) => onFieldChange("province", e.target.value)} />
              <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="CAP" value={form.postal_code} onChange={(e) => onFieldChange("postal_code", e.target.value)} />
              <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Paese" value={form.country} onChange={(e) => onFieldChange("country", e.target.value)} />
              <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Nome referente *" value={form.applicant_full_name} onChange={(e) => onFieldChange("applicant_full_name", e.target.value)} />
              <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Email referente *" value={form.applicant_email} onChange={(e) => onFieldChange("applicant_email", e.target.value)} />
            </div>
          </div>
        )}

        {!showIntroScreen && currentStep === 2 && (
          <div className="surface p-6 space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900">Cariche e referenti</h2>
            <p className="text-sm text-neutral-600">Inserisci i responsabili principali dell'associazione.</p>
            <div className="space-y-4">
              {people.map((person, index) => (
                <div key={person.role} className="rounded-lg border border-neutral-200 bg-white p-4">
                  <p className="text-sm font-semibold text-neutral-800">
                    {ROLE_ITEMS.find((item) => item.role === person.role)?.label || person.role}
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Nome e cognome" value={person.full_name} onChange={(e) => onPersonChange(index, "full_name", e.target.value)} />
                    <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Email" value={person.email} onChange={(e) => onPersonChange(index, "email", e.target.value)} />
                    <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Telefono" value={person.phone} onChange={(e) => onPersonChange(index, "phone", e.target.value)} />
                    <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Codice fiscale" value={person.fiscal_code} onChange={(e) => onPersonChange(index, "fiscal_code", e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!showIntroScreen && currentStep === 3 && (
          <div className="surface p-6 space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900">Documenti e cariche</h2>
            <p className="text-sm text-neutral-600">Carica PDF validi. Ogni documento viene verificato dal super admin.</p>
            <div className="space-y-3">
              {DOC_ITEMS.map((doc) => {
                const docData = docsByType.get(doc.type);
                return (
                  <div key={doc.type} className="rounded-lg border border-neutral-200 bg-white p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">{doc.label}</p>
                        <p className="text-xs text-neutral-500">
                          Stato: {docData?.status || "non caricato"}
                          {docData?.rejection_note ? ` - ${docData.rejection_note}` : ""}
                        </p>
                      </div>
                      {docData?.download_url ? (
                        <a className="text-xs font-medium text-brand hover:underline" href={docData.download_url} target="_blank" rel="noreferrer">
                          Scarica ultimo file
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      <input
                        type="file"
                        accept=".pdf"
                        disabled={uploadingType === doc.type}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void onUploadDocument(doc.type, file);
                        }}
                        className="block w-full rounded-md border border-neutral-200 px-3 py-2 text-xs text-neutral-600"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!showIntroScreen && currentStep === 4 && (
          <div className="surface p-6 space-y-5">
            <h2 className="text-lg font-semibold text-neutral-900">Pagamento</h2>
            <p className="text-sm text-neutral-600">
              Seleziona il metodo di pagamento. L'attivazione avviene sempre dopo verifica documentale.
            </p>
            <div className="rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-xs text-neutral-700">
              Quota affiliazione:{" "}
              <span className="font-semibold text-neutral-900">
                {((draft?.payment_amount_cents ?? 0) / 100).toLocaleString("it-IT", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                EUR
              </span>
            </div>
            {!stripeEnabled ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Puoi completare l'invio e pagare con bonifico o contanti. Attivazione dopo verifica.
              </div>
            ) : null}
            <div className="grid gap-3">
              <label
                className={`flex items-start gap-3 rounded-md border border-neutral-200 bg-white p-3 ${
                  stripeEnabled ? "" : "opacity-70"
                }`}
              >
                <input
                  type="radio"
                  checked={form.payment_method === "stripe"}
                  disabled={!stripeEnabled}
                  onChange={() => onFieldChange("payment_method", "stripe")}
                />
                <div>
                  <p className="text-sm font-semibold text-neutral-900">
                    {stripeEnabled ? "Carta (Stripe)" : "Carta (Stripe) — presto disponibile"}
                  </p>
                  <p className="text-xs text-neutral-600">
                    {stripeEnabled
                      ? "Pagamento online immediato con carta."
                      : "Modalita carta temporaneamente disattivata in questa installazione."}
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-md border border-neutral-200 bg-white p-3">
                <input type="radio" checked={form.payment_method === "bank_transfer"} onChange={() => onFieldChange("payment_method", "bank_transfer")} />
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Bonifico</p>
                  <p className="text-xs text-neutral-600">Verifica manuale del pagamento da parte del super admin.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-md border border-neutral-200 bg-white p-3">
                <input type="radio" checked={form.payment_method === "cash"} onChange={() => onFieldChange("payment_method", "cash")} />
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Contanti</p>
                  <p className="text-xs text-neutral-600">Definisci appuntamento per il versamento.</p>
                </div>
              </label>
            </div>

            {form.payment_method === "stripe" && stripeEnabled && (
              <div className="rounded-md border border-neutral-200 bg-white p-4">
                <p className="text-sm text-neutral-700">Apri la sessione checkout Stripe in una nuova scheda.</p>
                <button type="button" className="btn-primary mt-3" onClick={onOpenStripeCheckout}>
                  Apri checkout Stripe
                </button>
              </div>
            )}

            {(form.payment_method === "bank_transfer" || form.payment_method === "cash") && (
              <div className="grid gap-3 rounded-md border border-neutral-200 bg-white p-4 md:grid-cols-2">
                {form.payment_method === "bank_transfer" ? (
                  <div className="md:col-span-2 text-xs text-neutral-600">
                    <p>IBAN: <span className="font-semibold text-neutral-800">{draft?.payment_config.bank_iban || "-"}</span></p>
                    <p className="mt-1">Causale: <span className="font-semibold text-neutral-800">{draft?.payment_config.bank_causale_prefix || "AFFILIAZIONE ASSONAM"} - {token}</span></p>
                  </div>
                ) : (
                  <div className="md:col-span-2 text-xs text-neutral-600">
                    Sede contanti: <span className="font-semibold text-neutral-800">{draft?.payment_config.cash_location || "Sede ASSONAM"}</span>
                  </div>
                )}
                <input type="date" className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Data preferita" value={form.manual_preferred_date} onChange={(e) => onFieldChange("manual_preferred_date", e.target.value)} />
                <input type="time" className="rounded-md border border-neutral-200 px-3 py-2 text-sm" placeholder="Orario preferito" value={form.manual_preferred_time} onChange={(e) => onFieldChange("manual_preferred_time", e.target.value)} />
                <input className="rounded-md border border-neutral-200 px-3 py-2 text-sm md:col-span-2" placeholder="Contatto operativo" value={form.manual_contact} onChange={(e) => onFieldChange("manual_contact", e.target.value)} />
              </div>
            )}
          </div>
        )}

        {!showIntroScreen && currentStep === 5 && (
          <div className="surface p-6 space-y-5">
            <h2 className="text-lg font-semibold text-neutral-900">Riepilogo e invio</h2>
            <p className="text-sm text-neutral-600">
              Verifica i dati principali. Dopo l'invio lo stato passa a <strong>under_review</strong>.
            </p>
            <div className="grid gap-2 text-sm text-neutral-700">
              <div>Associazione: {form.organization_name || "-"}</div>
              <div>Referente: {form.applicant_full_name || "-"}</div>
              <div>Email: {form.applicant_email || "-"}</div>
              <div>Metodo pagamento: {form.payment_method || "-"}</div>
              <div>Documenti caricati: {(draft?.documents || []).length}</div>
            </div>
            <textarea className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm" rows={4} placeholder="Note per il super admin" value={form.notes} onChange={(e) => onFieldChange("notes", e.target.value)} />
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-primary" disabled={submitting} onClick={onSubmit}>
                {submitting ? "Invio in corso..." : "Invia richiesta"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setCurrentStep(6)}>
                Vai allo stato pratica
              </button>
            </div>
          </div>
        )}

        {!showIntroScreen && currentStep === 6 && (
          <div className="surface p-6 space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900">Richiesta inviata</h2>
            <p className="text-sm text-neutral-600">
              Stato attuale: <strong>{submitResult?.status || draft?.status || "draft"}</strong>
            </p>
            {submitResult?.message ? (
              <p className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-sm text-neutral-700">
                {submitResult.message}
              </p>
            ) : null}
            <ul className="space-y-1 text-sm text-neutral-700">
              {(submitResult?.next_steps || [
                "Richiesta inviata",
                "Ti contatteremo per conferma",
                "Riceverai email alla conferma",
              ]).map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={onOpenInstantWelcomeVideo}>
                Apri video stato
              </button>
              <Link to="/affiliazione-info" className="btn-ghost">
                Vai a guida affiliazione
              </Link>
            </div>
          </div>
        )}
      </div>

      {showVideoOverlay && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4">
          <div className="relative w-full max-w-5xl rounded-xl border border-white/20 bg-black p-4">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-md border border-white/20 px-2 py-1 text-xs text-white"
              onClick={() => setShowVideoOverlay(false)}
            >
              Chiudi
            </button>
            {!baseVideoEnded ? (
              <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-black">
                <video
                  src={BASE_WELCOME_VIDEO_URL}
                  autoPlay
                  playsInline
                  className="h-full w-full object-cover"
                  onEnded={() => setBaseVideoEnded(true)}
                  onError={() => {
                    setBaseVideoFailed(true);
                    setBaseVideoEnded(true);
                  }}
                />
                <div className="affiliazione-hud-name-overlay">
                  <p className="affiliazione-hud-name-kicker">ASSOCIATION</p>
                  <p className="affiliazione-hud-name-value">{overlayAssociationName}</p>
                </div>
              </div>
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6">
                <div className="max-w-xl rounded-xl border border-cyan-300/30 bg-cyan-300/5 p-6 text-center text-white">
                  <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">ASSONAM</p>
                  <h3 className="mt-3 text-3xl font-semibold">Richiesta ricevuta</h3>
                  <p className="mt-3 text-sm text-neutral-200">
                    La tua affiliazione è ora in revisione.
                  </p>
                  {baseVideoFailed ? (
                    <p className="mt-2 text-xs text-amber-300">
                      Il video base non è disponibile in questo ambiente.
                    </p>
                  ) : null}
                  <Link
                    to="/"
                    className="btn-primary mt-6 inline-flex"
                    onClick={() => setShowVideoOverlay(false)}
                  >
                    Torna alla homepage
                  </Link>
                </div>
              </div>
            )}
            <div className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-200">
              Render personalizzato in background: {currentVideoJob?.status || "queued"}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Affiliazione;
