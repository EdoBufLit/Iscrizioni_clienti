import {
  type ChangeEvent,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useEffect,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createMembershipPaymentCheckout,
  fetchOrganizationDetail,
  joinOrganization,
  registerMember,
  searchMunicipalities,
  type MunicipalitySearchItem,
  type OrganizationDetail,
} from "../lib/api";
import {
  calculateCodiceFiscale,
  normalizeCodiceFiscale,
  validateCodiceFiscale,
} from "../lib/codiceFiscale";
import { applySeo } from "../lib/seo";
import Skeleton from "../components/ui/Skeleton";

const STEPS = [
  { label: "Dati", title: "I tuoi dati" },
  { label: "Documenti", title: "Documenti e dichiarazioni" },
  { label: "Conferma", title: "Riepilogo e invio" },
] as const;

const fieldBaseClass =
  "mt-2 block w-full rounded-[1.35rem] border bg-white px-5 py-4 text-base text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none transition duration-200 placeholder:text-slate-400 focus:ring-4";
const fieldOkClass =
  `${fieldBaseClass} border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:ring-indigo-100`;
const fieldErrClass =
  `${fieldBaseClass} border-rose-300 bg-rose-50/30 focus:border-rose-400 focus:ring-rose-100`;
const labelClass = "block text-sm font-semibold text-slate-800";
const primaryActionClass =
  "signup-wizard-primary inline-flex items-center justify-center gap-3 rounded-[1.35rem] px-7 py-4 text-base font-semibold";
const secondaryActionClass =
  "signup-wizard-secondary inline-flex items-center justify-center gap-2 rounded-[1.2rem] px-5 py-3 text-base font-medium";

type FormData = {
  membershipType: "annual" | "temporary";
  nome: string;
  cognome: string;
  dataNascita: string;
  sesso: "" | "M" | "F";
  comuneNascita: string;
  comuneNascitaCode: string;
  codiceFiscale: string;
  email: string;
  telefono: string;
  modalitaPagamento: "" | "CASH" | "BONIFICO";
  password: string;
  documentoIdentita: File | null;
  privacy: boolean;
  statuto: boolean;
};

const initial: FormData = {
  membershipType: "annual",
  nome: "",
  cognome: "",
  dataNascita: "",
  sesso: "",
  comuneNascita: "",
  comuneNascitaCode: "",
  codiceFiscale: "",
  email: "",
  telefono: "",
  modalitaPagamento: "",
  password: "",
  documentoIdentita: null,
  privacy: false,
  statuto: false,
};

function validateStep1(
  f: FormData,
  requireOnlinePayment: boolean,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.nome.trim()) e.nome = "Il campo nome e obbligatorio.";
  if (!f.cognome.trim()) e.cognome = "Il campo cognome e obbligatorio.";
  if (!f.dataNascita) e.dataNascita = "Inserisci la data di nascita.";
  if (!f.sesso) e.sesso = "Seleziona il sesso.";
  if (!f.comuneNascita.trim()) {
    e.comuneNascita = "Il comune di nascita e obbligatorio.";
  } else if (!f.comuneNascitaCode) {
    e.comuneNascita = "Seleziona un comune valido dall'elenco.";
  }
  if (!f.codiceFiscale.trim()) {
    e.codiceFiscale = "Il codice fiscale e obbligatorio.";
  } else if (
    !validateCodiceFiscale({
      fiscalCode: f.codiceFiscale,
      firstName: f.nome,
      lastName: f.cognome,
      birthDate: f.dataNascita,
      gender: f.sesso,
      birthPlaceCode: f.comuneNascitaCode,
    }).isFormallyValid
  ) {
    e.codiceFiscale = "Il codice fiscale non e valido. Verifica formato e checksum.";
  }
  if (!f.email.trim()) {
    e.email = "L'indirizzo email e obbligatorio.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
    e.email = "L'indirizzo email non sembra valido.";
  }
  if (!f.telefono.trim()) e.telefono = "Il numero di telefono e obbligatorio.";
  if (!requireOnlinePayment && !f.modalitaPagamento) {
    e.modalitaPagamento = "Seleziona la modalita di pagamento.";
  }
  if (!f.password || f.password.length < 6) {
    e.password = "La password deve avere almeno 6 caratteri.";
  }
  return e;
}

function validateStep2(
  f: FormData,
  hasStatute: boolean,
  requireMembershipDocument: boolean,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (requireMembershipDocument && !f.documentoIdentita) {
    e.documentoIdentita = "Carica il documento di identita per procedere.";
  }
  if (!f.privacy) {
    e.privacy = "E necessario dichiarare di aver letto l'informativa privacy per procedere.";
  }
  if (hasStatute && !f.statuto) {
    e.statuto = "E necessario accettare lo statuto dell'associazione per procedere.";
  }
  return e;
}

function formatDateDisplay(value: string): string {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function iconFor(path: string, className = "h-5 w-5") {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

type StepIndicatorProps = {
  current: number;
  progress: number;
  shouldReduceMotion: boolean;
};

const StepIndicator = ({ current, progress, shouldReduceMotion }: StepIndicatorProps) => (
  <div className="mx-auto max-w-3xl">
    <div className="relative px-2 pt-2">
      <div
        className="absolute left-[16.66%] right-[16.66%] top-8 h-[3px] rounded-full bg-slate-200"
        aria-hidden="true"
      />
      <motion.div
        className="absolute left-[16.66%] top-8 h-[3px] rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
        initial={false}
        animate={{ width: `calc((66.68%) * ${progress / 100})` }}
        transition={shouldReduceMotion ? { duration: 0.01 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden="true"
      />
      <div className="grid grid-cols-3 gap-3">
        {STEPS.map((stepItem, index) => {
          const number = index + 1;
          const completed = number < current;
          const active = number === current;

          return (
            <div key={stepItem.label} className="flex flex-col items-center text-center">
              <motion.div
                initial={false}
                animate={{
                  scale: active && !shouldReduceMotion ? 1.04 : 1,
                  boxShadow:
                    completed || active
                      ? "0 14px 32px rgba(99, 102, 241, 0.24)"
                      : "0 6px 14px rgba(148, 163, 184, 0.12)",
                }}
                transition={shouldReduceMotion ? { duration: 0.01 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className={`relative z-10 flex h-14 w-14 items-center justify-center rounded-full border text-lg font-semibold ${
                  completed || active
                    ? "border-indigo-500 bg-gradient-to-br from-indigo-500 to-violet-500 text-white"
                    : "border-slate-200 bg-white text-slate-400"
                }`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {completed ? (
                    <motion.span
                      key="check"
                      initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.6 }}
                      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
                    >
                      {iconFor("m5 13 4 4L19 7", "h-6 w-6")}
                    </motion.span>
                  ) : (
                    <motion.span
                      key={`step-${number}`}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    >
                      {number}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
              <p
                className={`mt-4 text-sm font-semibold md:text-base ${
                  active || completed ? "text-slate-900" : "text-slate-400"
                }`}
              >
                {stepItem.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

type CardHeaderProps = {
  iconPath: string;
  title: string;
  description: string;
  rightSlot?: ReactNode;
};

const CardHeader = ({ iconPath, title, description, rightSlot }: CardHeaderProps) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div className="flex items-start gap-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        {iconFor(iconPath, "h-7 w-7")}
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
        <p className="mt-1 text-base leading-7 text-slate-500">{description}</p>
      </div>
    </div>
    {rightSlot}
  </div>
);

type TextFieldProps = {
  id: keyof FormData | string;
  label: string;
  error?: string;
  hint?: string;
  hintTone?: "muted" | "warning";
  inputClassName?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id">;

const TextField = ({
  id,
  label,
  error,
  hint,
  hintTone = "muted",
  inputClassName = "",
  ...props
}: TextFieldProps) => (
  <div>
    <label htmlFor={id} className={labelClass}>
      {label}
    </label>
    <input
      id={id}
      className={`${error ? fieldErrClass : fieldOkClass} ${inputClassName}`.trim()}
      {...props}
    />
    <FieldMessage
      message={error || hint}
      tone={error ? "error" : hintTone}
    />
  </div>
);

type SelectFieldProps = {
  id: keyof FormData | string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "children">;

const SelectField = ({ id, label, error, hint, children, ...props }: SelectFieldProps) => (
  <div>
    <label htmlFor={id} className={labelClass}>
      {label}
    </label>
    <div className="relative">
      <select
        id={id}
        className={`${error ? fieldErrClass : fieldOkClass} appearance-none pr-14`}
        {...props}
      >
        {children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-slate-400">
        {iconFor("m6 9 6 6 6-6", "h-5 w-5")}
      </div>
    </div>
    <FieldMessage message={error || hint} tone={error ? "error" : "muted"} />
  </div>
);

type FieldMessageProps = {
  message?: string;
  tone: "muted" | "warning" | "error";
};

const FieldMessage = ({ message, tone }: FieldMessageProps) => {
  if (!message) return null;

  const toneClass =
    tone === "error"
      ? "text-rose-600"
      : tone === "warning"
        ? "text-amber-600"
        : "text-slate-500";

  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mt-2 text-sm leading-6 ${toneClass}`}
    >
      {message}
    </motion.p>
  );
};

type CheckboxCardProps = {
  checked: boolean;
  error?: string;
  label: string;
  description: ReactNode;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

const CheckboxCard = ({ checked, error, label, description, onChange }: CheckboxCardProps) => (
  <label
    className={`block rounded-[1.8rem] border px-5 py-5 transition md:px-7 ${
      error
        ? "border-rose-200 bg-rose-50/40"
        : checked
          ? "border-indigo-200 bg-indigo-50/40 shadow-[0_12px_28px_-24px_rgba(79,70,229,0.5)]"
          : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50/80"
    }`}
  >
    <div className="flex items-start gap-4">
      <input
        className="mt-1 h-6 w-6 rounded-full border-2 border-slate-300 text-indigo-600 focus:ring-indigo-200"
        type="checkbox"
        checked={checked}
        onChange={onChange}
      />
      <div className="min-w-0">
        <div className="text-lg font-semibold text-slate-950">{label}</div>
        <div className="mt-2 text-base leading-7 text-slate-600">{description}</div>
      </div>
    </div>
    {error ? <FieldMessage message={error} tone="error" /> : null}
  </label>
);

type SummaryItemProps = {
  label: string;
  value: string;
  muted?: boolean;
};

const SummaryItem = ({ label, value, muted = false }: SummaryItemProps) => (
  <div className="border-b border-slate-100 pb-5 last:border-b-0 last:pb-0">
    <dt className="text-sm font-medium text-slate-500">{label}</dt>
    <dd className={`mt-2 text-2xl font-semibold tracking-tight ${muted ? "text-slate-400" : "text-slate-950"}`}>
      {value}
    </dd>
  </div>
);

const Iscrizione = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion() ?? false;

  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState("");

  const [step, setStep] = useState(1);
  const [stepDirection, setStepDirection] = useState<1 | -1>(1);
  const [form, setForm] = useState<FormData>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmReady, setConfirmReady] = useState(step !== STEPS.length);
  const [userEditedCF, setUserEditedCF] = useState(false);
  const [municipalitySuggestions, setMunicipalitySuggestions] = useState<MunicipalitySearchItem[]>([]);
  const [municipalityLoading, setMunicipalityLoading] = useState(false);
  const [municipalityLookupError, setMunicipalityLookupError] = useState("");
  const [showMunicipalitySuggestions, setShowMunicipalitySuggestions] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setOrgLoading(true);
    fetchOrganizationDetail(slug)
      .then(setOrg)
      .catch(() => setOrgError("Associazione non trovata."))
      .finally(() => setOrgLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!org) return;
    applySeo({
      title: `Iscriviti ora a ${org.name}`,
      description: `Tesseramento online ${org.name}`,
      canonicalPath: `/associazioni/${slug}/iscrizione`,
      imagePath: org.logo_url || "/logo.jpg",
      appendSiteName: false,
      noindex: true,
    });
  }, [org, slug]);

  useEffect(() => {
    if (step !== STEPS.length) {
      setConfirmReady(true);
      return;
    }

    setConfirmReady(false);
    const timeoutId = window.setTimeout(() => {
      setConfirmReady(true);
    }, shouldReduceMotion ? 80 : 320);

    return () => window.clearTimeout(timeoutId);
  }, [shouldReduceMotion, step]);

  useEffect(() => {
    const query = form.comuneNascita.trim();
    if (query.length < 2 || form.comuneNascitaCode) {
      setMunicipalitySuggestions([]);
      setMunicipalityLoading(false);
      return;
    }

    let cancelled = false;
    setMunicipalityLoading(true);
    setMunicipalityLookupError("");
    const timeoutId = window.setTimeout(() => {
      searchMunicipalities(query)
        .then((items) => {
          if (cancelled) return;
          setMunicipalitySuggestions(items);
        })
        .catch(() => {
          if (cancelled) return;
          setMunicipalitySuggestions([]);
          setMunicipalityLookupError("Ricerca comuni temporaneamente non disponibile.");
        })
        .finally(() => {
          if (!cancelled) {
            setMunicipalityLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [form.comuneNascita, form.comuneNascitaCode]);

  useEffect(() => {
    if (
      userEditedCF ||
      !form.nome.trim() ||
      !form.cognome.trim() ||
      !form.dataNascita ||
      !form.sesso ||
      !form.comuneNascitaCode
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      try {
        const calculated = calculateCodiceFiscale({
          firstName: form.nome,
          lastName: form.cognome,
          birthDate: form.dataNascita,
          gender: form.sesso as "M" | "F",
          birthPlaceCode: form.comuneNascitaCode,
        });
        setForm((prev) => (
          prev.codiceFiscale === calculated
            ? prev
            : { ...prev, codiceFiscale: calculated }
        ));
      } catch {
        // Ignore intermediate invalid states while typing.
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [
    form.cognome,
    form.comuneNascitaCode,
    form.dataNascita,
    form.nome,
    form.sesso,
    userEditedCF,
  ]);

  const associationName = org?.name ?? "questa associazione";
  const membershipDocumentRequired = Boolean(org?.require_membership_document);
  const membershipPaymentConfig = org?.membership_payment;
  const membershipConfig = org?.membership_config;
  const customMembershipTypesEnabled = Boolean(membershipConfig?.custom_types_enabled);
  const membershipPaymentRequired = Boolean(membershipPaymentConfig?.required);
  const membershipPaymentAmount = membershipPaymentConfig?.amount ?? null;
  const membershipPaymentCurrency = membershipPaymentConfig?.currency ?? "EUR";
  const membershipPaymentLabel = membershipPaymentConfig?.label || "Quota associativa";
  const membershipPaymentButtonLabel =
    membershipPaymentConfig?.button_label || "Paga con carta";
  const selectedMembershipType = form.membershipType;
  const selectedMembershipTypeLabel =
    selectedMembershipType === "temporary" ? "Tessera temporanea" : "Tessera annuale";
  const selectedMembershipFee =
    selectedMembershipType === "temporary"
      ? membershipConfig?.temporary_fee_amount ?? membershipPaymentConfig?.temporary_amount ?? null
      : membershipConfig?.annual_fee_amount ?? membershipPaymentAmount;
  const temporaryDurationLabel = membershipConfig?.temporary_duration_label ?? "1 giorno";
  const fiscalCodeValidation = validateCodiceFiscale({
    fiscalCode: form.codiceFiscale,
    firstName: form.nome,
    lastName: form.cognome,
    birthDate: form.dataNascita,
    gender: form.sesso,
    birthPlaceCode: form.comuneNascitaCode,
  });
  const liveFiscalCodeError =
    form.codiceFiscale.trim() && !fiscalCodeValidation.isFormallyValid
      ? "Il codice fiscale non e valido. Verifica formato e checksum."
      : "";
  const fiscalCodeWarning =
    form.codiceFiscale.trim() &&
    fiscalCodeValidation.isFormallyValid &&
    fiscalCodeValidation.matchesExpected === false
      ? "Il codice fiscale inserito non coincide con quello calcolato dai dati anagrafici. Puoi correggerlo manualmente se necessario."
      : "";

  const updateField = (field: keyof FormData, value: string | boolean | File | null) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const fieldError = (field: string) => {
    if (field === "codiceFiscale") {
      return errors.codiceFiscale || liveFiscalCodeError;
    }
    return errors[field];
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: shouldReduceMotion ? "auto" : "smooth",
    });
  };

  const moveToStep = (nextStep: number, direction: 1 | -1) => {
    setStepDirection(direction);
    setStep(nextStep);
    scrollToTop();
  };

  const handleText =
    (field: keyof FormData) =>
    (event: ChangeEvent<HTMLInputElement>) =>
      updateField(field, event.target.value);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) =>
    updateField("documentoIdentita", event.target.files?.[0] ?? null);

  const handleCheck =
    (field: "privacy" | "statuto") =>
    (event: ChangeEvent<HTMLInputElement>) =>
      updateField(field, event.target.checked);

  const handleGenderChange = (event: ChangeEvent<HTMLSelectElement>) =>
    updateField("sesso", event.target.value as "" | "M" | "F");

  const handleBirthPlaceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setShowMunicipalitySuggestions(true);
    setMunicipalityLookupError("");
    setForm((prev) => ({
      ...prev,
      comuneNascita: value,
      comuneNascitaCode: "",
    }));
    if (errors.comuneNascita) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.comuneNascita;
        return next;
      });
    }
  };

  const handleFiscalCodeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = normalizeCodiceFiscale(event.target.value).slice(0, 16);
    setUserEditedCF(nextValue.length > 0);
    updateField("codiceFiscale", nextValue);
    if (!nextValue) {
      setUserEditedCF(false);
    }
  };

  const selectMunicipality = (item: MunicipalitySearchItem) => {
    setForm((prev) => ({
      ...prev,
      comuneNascita: item.name,
      comuneNascitaCode: item.code,
    }));
    setShowMunicipalitySuggestions(false);
    setMunicipalityLookupError("");
    setMunicipalitySuggestions([]);
    if (errors.comuneNascita) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.comuneNascita;
        return next;
      });
    }
  };

  const goNext = () => {
    let newErrors: Record<string, string> = {};
    if (step === 1) {
      newErrors = validateStep1(form, membershipPaymentRequired);
    } else if (step === 2) {
      newErrors = validateStep2(form, Boolean(org?.has_statute), membershipDocumentRequired);
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    moveToStep(Math.min(step + 1, STEPS.length), 1);
  };

  const goBack = () => {
    setErrors({});
    moveToStep(Math.max(step - 1, 1), -1);
  };

  const submitMembership = async () => {
    if (submitting) return;

    if (membershipDocumentRequired && !form.documentoIdentita) {
      setErrors((prev) => ({
        ...prev,
        documentoIdentita: "Carica il documento di identita per completare l'iscrizione.",
      }));
      setSubmitError("Completa il caricamento del documento richiesto per inviare la richiesta.");
      moveToStep(2, -1);
      return;
    }

    if (!membershipPaymentRequired && !form.modalitaPagamento) {
      setSubmitError("Seleziona la modalita di pagamento.");
      return;
    }

    setSubmitError("");
    setSubmitting(true);
    try {
      if (membershipPaymentRequired) {
        const checkout = await createMembershipPaymentCheckout(slug!, {
          first_name: form.nome,
          last_name: form.cognome,
          birth_date: form.dataNascita,
          birth_place: form.comuneNascita,
          birth_place_code: form.comuneNascitaCode,
          gender: form.sesso as "M" | "F",
          email: form.email,
          phone: form.telefono,
          fiscal_code: normalizeCodiceFiscale(form.codiceFiscale),
          password: form.password,
          accept_statute: form.statuto,
          accepted_statute_version: org?.has_statute ? org.statute_version || null : null,
          accept_privacy: form.privacy,
          membership_type: form.membershipType,
          id_document: form.documentoIdentita,
        });
        window.location.assign(checkout.hosted_checkout_url);
        return;
      }

      const joinResult = await joinOrganization(slug!, {
        first_name: form.nome,
        last_name: form.cognome,
        birth_date: form.dataNascita,
        birth_place: form.comuneNascita,
        birth_place_code: form.comuneNascitaCode,
        gender: form.sesso as "M" | "F",
        email: form.email,
        phone: form.telefono,
        fiscal_code: normalizeCodiceFiscale(form.codiceFiscale),
        accept_statute: form.statuto,
        accepted_statute_version: org?.has_statute ? org.statute_version || null : null,
        accept_privacy: form.privacy,
        payment_method: form.modalitaPagamento as "CASH" | "BONIFICO",
        membership_type: form.membershipType,
        id_document: form.documentoIdentita,
      });

      if (!joinResult.active_card_page_url) {
        setSubmitted(true);
      }

      let authenticated = false;
      try {
        const registrationResult = await registerMember({
          email: form.email,
          password: form.password,
          first_name: form.nome,
          last_name: form.cognome,
          phone: form.telefono,
          fiscal_code: normalizeCodiceFiscale(form.codiceFiscale),
          org_slug: slug!,
        });
        authenticated = Boolean(registrationResult.authenticated);
      } catch {
        console.warn("Password registration failed, signup was saved successfully");
      }

      if (joinResult.active_card_page_url) {
        window.location.assign(joinResult.active_card_page_url);
        return;
      }

      if (authenticated) {
        setTimeout(() => navigate("/dashboard"), 3000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore sconosciuto";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (step !== STEPS.length || !confirmReady) return;
    void submitMembership();
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;
  const hasErrors = Object.keys(errors).length > 0;
  const paymentMethodLabel =
    membershipPaymentRequired
      ? membershipPaymentButtonLabel
      : form.modalitaPagamento === "CASH"
      ? "Contanti"
      : form.modalitaPagamento === "BONIFICO"
        ? "Bonifico"
        : "-";
  const genderLabel =
    form.sesso === "M"
      ? "Maschile"
      : form.sesso === "F"
        ? "Femminile"
        : "-";
  const fullName = [form.nome, form.cognome].filter(Boolean).join(" ").trim() || "futuro socio";
  const birthPlaceHint = fieldError("comuneNascita")
    ? fieldError("comuneNascita")
    : municipalityLookupError
      ? municipalityLookupError
      : form.comuneNascitaCode
        ? `Codice catastale: ${form.comuneNascitaCode}`
        : "Seleziona il comune dalla lista per calcolare il codice fiscale.";

  const panelVariants = {
    enter: (direction: 1 | -1) =>
      shouldReduceMotion
        ? { opacity: 0 }
        : { opacity: 0, x: direction > 0 ? 40 : -40, y: 8, scale: 0.99 },
    center: { opacity: 1, x: 0, y: 0, scale: 1 },
    exit: (direction: 1 | -1) =>
      shouldReduceMotion
        ? { opacity: 0 }
        : { opacity: 0, x: direction > 0 ? -28 : 28, y: -4, scale: 0.995 },
  };
  const panelTransition = shouldReduceMotion
    ? { duration: 0.01 }
    : { duration: 0.3, ease: [0.22, 1, 0.36, 1] };

  if (orgLoading) {
    return (
      <section className="signup-wizard-shell py-16 md:py-20" data-reveal="fade-up">
        <div className="container-shell max-w-4xl">
          <div className="mx-auto max-w-3xl">
            <Skeleton className="mx-auto h-8 w-60" />
            <Skeleton className="mx-auto mt-4 h-5 w-96" />
            <Skeleton className="mt-12 h-80 rounded-[2rem]" />
          </div>
        </div>
      </section>
    );
  }

  if (orgError || !org) {
    return (
      <section className="signup-wizard-shell py-16 md:py-20" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface mx-auto max-w-2xl p-8">
            <h1 className="text-lg font-semibold text-neutral-900">Associazione non trovata</h1>
            <p className="mt-3 text-sm leading-7 text-neutral-600">
              Il collegamento non e corretto oppure l'associazione non e disponibile.
            </p>
            <div className="mt-6">
              <Link className="btn-primary" to="/associazioni">
                Torna all'elenco
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (submitted) {
    return (
      <section className="signup-wizard-shell py-16 md:py-20" data-reveal="fade-up">
        <div className="container-shell">
          <div className="signup-wizard-card mx-auto max-w-2xl px-8 py-10 text-center md:px-12 md:py-14">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 ring-8 ring-white shadow-[0_20px_45px_-30px_rgba(79,70,229,0.45)]">
              {iconFor("m5 13 4 4L19 7", "h-11 w-11")}
            </div>
            <h1 className="mt-8 text-4xl font-semibold tracking-tight text-slate-950">
              Richiesta registrata
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg leading-8 text-slate-500">
              La richiesta di iscrizione a <span className="font-semibold text-slate-950">{associationName}</span> e stata inviata correttamente. Se l'account e stato creato, verrai reindirizzato alla tua area riservata.
            </p>
            <div className="mt-8 rounded-[1.6rem] border border-slate-200 bg-slate-50/70 px-6 py-5">
              <p className="text-sm leading-7 text-slate-500">
                La verifica dei dati e dei documenti avviene entro pochi giorni lavorativi.
              </p>
            </div>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link className={primaryActionClass} to="/dashboard">
                Vai alla tua area
              </Link>
              <Link className={secondaryActionClass} to="/associazioni">
                Torna alle associazioni
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="signup-wizard-shell py-16 md:py-20" data-reveal="fade-up">
      <div className="container-shell max-w-[1180px]">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex items-center justify-center gap-2 text-sm font-medium text-slate-400">
            <Link className="transition hover:text-slate-700" to={`/associazioni/${slug}`}>
              {associationName}
            </Link>
            <span>/</span>
            <span className="text-slate-500">Iscrizione</span>
          </div>

          <header className="text-center">
            <h1 className="text-5xl font-semibold tracking-tight text-slate-950 md:text-6xl">
              Diventa socio
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-xl leading-9 text-slate-500 md:text-[1.75rem]">
              Siamo felici di averti a bordo. Iniziamo con i tuoi dati fondamentali.
            </p>
          </header>

          <div className="mt-12 md:mt-14">
            <StepIndicator current={step} progress={progress} shouldReduceMotion={shouldReduceMotion} />
          </div>

          <form className="mt-10 md:mt-14" onSubmit={handleSubmit}>
            <div className="space-y-4">
              {hasErrors ? (
                <div className="rounded-[1.6rem] border border-rose-200 bg-rose-50/70 px-6 py-4 text-base text-rose-700 shadow-[0_18px_40px_-34px_rgba(244,63,94,0.5)]">
                  Compila correttamente i campi evidenziati per continuare.
                </div>
              ) : null}

              {submitError ? (
                <div className="rounded-[1.6rem] border border-rose-200 bg-rose-50/70 px-6 py-4 text-base text-rose-700 shadow-[0_18px_40px_-34px_rgba(244,63,94,0.5)]">
                  {submitError}
                </div>
              ) : null}
            </div>

            <AnimatePresence custom={stepDirection} initial={false} mode="wait">
              <motion.div
                key={step}
                custom={stepDirection}
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={panelTransition}
                className="mt-8 space-y-6"
              >
                {step === 1 ? (
                  <>
                    {customMembershipTypesEnabled ? (
                      <div className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
                        <CardHeader
                          iconPath="M4.5 12.75l6 6 9-13.5M4.5 6.75h15M4.5 17.25h9"
                          title="Scegli la tessera"
                          description="Seleziona il tipo di tessera prima di completare l'iscrizione. La durata della temporanea segue la regola generale impostata dall'associazione."
                        />

                        <div className="mt-8 grid gap-4 md:grid-cols-2">
                          {[
                            {
                              value: "annual" as const,
                              title: "Tessera annuale",
                              description: "",
                              fee: membershipConfig?.annual_fee_amount ?? membershipPaymentAmount,
                              extra: null,
                            },
                            {
                              value: "temporary" as const,
                              title: "Tessera temporanea",
                              description: "Pensata per accessi brevi o occasionali.",
                              fee:
                                membershipConfig?.temporary_fee_amount ??
                                membershipPaymentConfig?.temporary_amount ??
                                null,
                              extra: `Durata: ${temporaryDurationLabel}`,
                            },
                          ].map((option) => {
                            const active = form.membershipType === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => updateField("membershipType", option.value)}
                                className={`rounded-[1.8rem] border px-6 py-6 text-left transition ${
                                  active
                                    ? "border-indigo-500 bg-indigo-50/70 shadow-[0_18px_40px_-34px_rgba(79,70,229,0.45)]"
                                    : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <p className="text-lg font-semibold text-slate-950">{option.title}</p>
                                    {option.description ? (
                                      <p className="mt-2 text-sm leading-7 text-slate-500">{option.description}</p>
                                    ) : null}
                                  </div>
                                  <span
                                    className={`mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                                      active
                                        ? "border-indigo-500 bg-indigo-500 text-white"
                                        : "border-slate-300 bg-white text-transparent"
                                    }`}
                                  >
                                    {iconFor("m5 13 4 4L19 7", "h-4 w-4")}
                                  </span>
                                </div>
                                {option.fee != null || option.extra ? (
                                  <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
                                    {option.fee != null ? (
                                      <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                                        {`${option.fee.toFixed(2)} ${membershipPaymentCurrency}`}
                                      </span>
                                    ) : null}
                                    {option.extra ? (
                                      <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700">
                                        {option.extra}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
                      <CardHeader
                        iconPath="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                        title="I tuoi dati personali"
                        description="Inserisci i dati anagrafici esattamente come li userai per completare l'iscrizione."
                      />

                      <div className="mt-10 grid gap-x-7 gap-y-8 md:grid-cols-2">
                        <TextField
                          id="nome"
                          label="Nome"
                          error={errors.nome}
                          placeholder="es. Mario"
                          value={form.nome}
                          onChange={handleText("nome")}
                          autoComplete="given-name"
                        />
                        <TextField
                          id="cognome"
                          label="Cognome"
                          error={errors.cognome}
                          placeholder="es. Rossi"
                          value={form.cognome}
                          onChange={handleText("cognome")}
                          autoComplete="family-name"
                        />
                        <TextField
                          id="dataNascita"
                          label="Data di nascita"
                          error={errors.dataNascita}
                          type="date"
                          value={form.dataNascita}
                          onChange={handleText("dataNascita")}
                        />
                        <SelectField
                          id="sesso"
                          label="Sesso"
                          error={errors.sesso}
                          value={form.sesso}
                          onChange={handleGenderChange}
                        >
                          <option value="">Seleziona...</option>
                          <option value="M">Maschile</option>
                          <option value="F">Femminile</option>
                        </SelectField>

                        <div
                          className="relative md:col-span-2"
                          onBlur={() => window.setTimeout(() => setShowMunicipalitySuggestions(false), 120)}
                        >
                          <label htmlFor="comuneNascita" className={labelClass}>
                            Comune di nascita
                          </label>
                          <input
                            id="comuneNascita"
                            className={fieldError("comuneNascita") ? fieldErrClass : fieldOkClass}
                            type="text"
                            autoComplete="off"
                            placeholder="es. Roma"
                            value={form.comuneNascita}
                            onChange={handleBirthPlaceChange}
                            onFocus={() => setShowMunicipalitySuggestions(true)}
                          />
                          {showMunicipalitySuggestions &&
                          !form.comuneNascitaCode &&
                          form.comuneNascita.trim().length >= 2 ? (
                            <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_30px_70px_-36px_rgba(15,23,42,0.28)]">
                              {municipalityLoading ? (
                                <p className="px-5 py-4 text-sm text-slate-500">Ricerca comuni in corso...</p>
                              ) : municipalitySuggestions.length > 0 ? (
                                <ul className="max-h-72 overflow-y-auto py-2">
                                  {municipalitySuggestions.map((item) => (
                                    <li key={item.code}>
                                      <button
                                        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                                        type="button"
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          selectMunicipality(item);
                                        }}
                                      >
                                        <span className="font-medium">{item.name}</span>
                                        <span className="text-xs text-slate-400">
                                          {[item.province, item.region].filter(Boolean).join(" - ")}
                                        </span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="px-5 py-4 text-sm text-slate-500">Nessun comune trovato.</p>
                              )}
                            </div>
                          ) : null}
                          <FieldMessage
                            message={birthPlaceHint}
                            tone={
                              fieldError("comuneNascita")
                                ? "error"
                                : municipalityLookupError
                                  ? "warning"
                                  : "muted"
                            }
                          />
                        </div>

                        <TextField
                          id="codiceFiscale"
                          label="Codice fiscale"
                          error={fieldError("codiceFiscale")}
                          hint={
                            !fieldError("codiceFiscale")
                              ? fiscalCodeWarning || "Il codice fiscale viene precompilato automaticamente e resta modificabile."
                              : undefined
                          }
                          hintTone={fiscalCodeWarning ? "warning" : "muted"}
                          placeholder="RSSMRA85A01H501Z"
                          value={form.codiceFiscale}
                          onChange={handleFiscalCodeChange}
                          inputClassName="uppercase"
                          maxLength={16}
                          autoCapitalize="characters"
                        />
                      </div>
                    </div>

                    <div className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
                      <CardHeader
                        iconPath="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                        title="I tuoi contatti"
                        description="Qui raccogliamo i recapiti e le informazioni necessarie per completare la richiesta."
                      />

                      <div className="mt-10 grid gap-x-7 gap-y-8 md:grid-cols-2">
                        <TextField
                          id="email"
                          label="Indirizzo email"
                          error={errors.email}
                          placeholder="es. mario.rossi@email.it"
                          value={form.email}
                          onChange={handleText("email")}
                          autoComplete="email"
                          type="email"
                        />
                        <TextField
                          id="telefono"
                          label="Numero di telefono"
                          error={errors.telefono}
                          placeholder="es. +39 333 1234567"
                          value={form.telefono}
                          onChange={handleText("telefono")}
                          autoComplete="tel"
                          type="tel"
                        />
                        {membershipPaymentRequired ? (
                          <div className="md:col-span-2 rounded-[1.6rem] border border-indigo-200 bg-indigo-50/60 px-5 py-5">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
                              Pagamento online obbligatorio
                            </p>
                            <p className="mt-2 text-sm leading-7 text-slate-700">
                              Per completare l&apos;iscrizione è necessario effettuare il pagamento online. Nel passaggio finale vedrai solo il bottone{" "}
                              <span className="font-semibold text-slate-950">{membershipPaymentButtonLabel}</span>.
                            </p>
                          </div>
                        ) : (
                          <SelectField
                            id="modalitaPagamento"
                            label="Modalita di pagamento"
                            error={errors.modalitaPagamento}
                            value={form.modalitaPagamento}
                            onChange={(event) =>
                              updateField(
                                "modalitaPagamento",
                                event.target.value as "" | "CASH" | "BONIFICO",
                              )
                            }
                          >
                            <option value="">Seleziona...</option>
                            <option value="CASH">Contanti</option>
                            <option value="BONIFICO">Bonifico</option>
                          </SelectField>
                        )}
                      </div>

                      <div className="mt-10 border-t border-slate-100 pt-8">
                        <div className="max-w-3xl">
                          <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
                            Crea un accesso
                          </h3>
                          <p className="mt-2 text-base leading-7 text-slate-500">
                            Scegli una password per poter accedere subito alla tua area riservata dopo l'invio della richiesta.
                          </p>
                        </div>
                        <div className="mt-6 max-w-2xl">
                          <TextField
                            id="password"
                            label="Password"
                            error={errors.password}
                            hint={!errors.password ? "Minimo 6 caratteri." : undefined}
                            placeholder="Inserisci una password"
                            value={form.password}
                            onChange={handleText("password")}
                            autoComplete="new-password"
                            type="password"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}

                {step === 2 ? (
                  <>
                    <div className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
                      <CardHeader
                        iconPath="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                        title="Documento di identita"
                        description={
                          membershipDocumentRequired
                            ? "Carica una copia leggibile del documento in corso di validita. Questo passaggio e obbligatorio."
                            : "Se preferisci, puoi allegare subito un documento valido. Il passaggio resta facoltativo."
                        }
                        rightSlot={
                          <span
                            className={`inline-flex items-center self-start rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
                              membershipDocumentRequired
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-slate-200 bg-slate-50 text-slate-500"
                            }`}
                          >
                            {membershipDocumentRequired ? "Obbligatorio" : "Facoltativo"}
                          </span>
                        }
                      />

                      <div className="mt-8">
                        <AnimatePresence mode="wait" initial={false}>
                          {form.documentoIdentita ? (
                            <motion.div
                              key="uploaded-file"
                              initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                              className="rounded-[1.8rem] border border-indigo-200 bg-indigo-50/50 p-5 shadow-[0_22px_44px_-38px_rgba(79,70,229,0.48)]"
                            >
                              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-4">
                                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-[0_10px_24px_-18px_rgba(79,70,229,0.4)]">
                                    {iconFor("M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5", "h-7 w-7")}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-lg font-semibold text-slate-950">
                                      {form.documentoIdentita.name}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-500">Documento pronto per l'invio.</p>
                                  </div>
                                </div>
                                <button
                                  className={secondaryActionClass}
                                  type="button"
                                  onClick={() => updateField("documentoIdentita", null)}
                                >
                                  Rimuovi
                                </button>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="upload-dropzone"
                              initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                            >
                              <label
                                htmlFor="documentoIdentita"
                                className={`group block cursor-pointer rounded-[2rem] border-2 border-dashed px-6 py-10 text-center transition md:px-10 ${
                                  errors.documentoIdentita
                                    ? "border-rose-300 bg-rose-50/40"
                                    : "border-slate-200 bg-slate-50/70 hover:border-indigo-300 hover:bg-indigo-50/40"
                                }`}
                              >
                                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white text-slate-400 shadow-[0_18px_35px_-26px_rgba(15,23,42,0.16)] transition group-hover:text-indigo-600">
                                  {iconFor("M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5", "h-9 w-9")}
                                </div>
                                <h3 className="mt-6 text-2xl font-semibold tracking-tight text-slate-950">
                                  Trascina qui o clicca per esplorare
                                </h3>
                                <p className="mt-3 text-base text-slate-500">
                                  Formati supportati: PDF, JPG, PNG (max 5 MB)
                                </p>
                                <input
                                  id="documentoIdentita"
                                  className="sr-only"
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                  onChange={handleFile}
                                />
                              </label>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <FieldMessage
                          message={
                            errors.documentoIdentita
                              ? errors.documentoIdentita
                              : membershipDocumentRequired
                                ? "Senza documento non puoi completare l'iscrizione."
                                : "Puoi continuare anche senza allegarlo."
                          }
                          tone={errors.documentoIdentita ? "error" : "muted"}
                        />
                      </div>
                    </div>

                    <div className="signup-wizard-card px-6 py-7 md:px-10 md:py-10">
                      <CardHeader
                        iconPath="M12 21c4.97-1.279 8.25-5.775 8.25-10.965V5.625l-8.25-3.375-8.25 3.375v4.41C3.75 15.225 7.03 19.721 12 21Zm0-11.25v3.75m0 3h.008v.008H12v-.008Z"
                        title="Dichiarazioni obbligatorie"
                        description="Per completare l'iscrizione devi confermare di aver preso visione delle informazioni richieste."
                      />

                      {!org.has_statute ? (
                        <div className="mt-8 rounded-[1.6rem] border border-amber-200 bg-amber-50/70 px-6 py-5 text-base leading-7 text-amber-800">
                          Lo statuto non e ancora disponibile per questa associazione. Puoi comunque proseguire con la sola presa visione dell'informativa privacy.
                        </div>
                      ) : null}

                      <div className="mt-8 space-y-4">
                        <CheckboxCard
                          checked={form.privacy}
                          error={errors.privacy}
                          label="Informativa sulla privacy"
                          onChange={handleCheck("privacy")}
                          description={
                            <>
                              <span>
                                Dichiaro di aver letto l'informativa sul trattamento dei dati personali prima di proseguire.
                              </span>{" "}
                              <Link
                                className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-100"
                                to="/privacy"
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                              >
                                Apri informativa
                              </Link>
                            </>
                          }
                        />

                        {org.has_statute ? (
                          <CheckboxCard
                            checked={form.statuto}
                            error={errors.statuto}
                            label="Statuto dell'associazione"
                            onChange={handleCheck("statuto")}
                            description={
                              <>
                                <span>
                                  Dichiaro di aver letto e di accettare integralmente lo statuto dell'associazione, impegnandomi a rispettarne le disposizioni.
                                </span>{" "}
                                {org.statute_url ? (
                                  <a
                                    className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-100"
                                    href={org.statute_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    Visualizza statuto
                                  </a>
                                ) : null}
                              </>
                            }
                          />
                        ) : null}
                      </div>
                    </div>
                  </>
                ) : null}

                {step === 3 ? (
                  <>
                    <div className="pt-2 text-center md:pt-4">
                      <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 ring-[18px] ring-white shadow-[0_28px_70px_-34px_rgba(79,70,229,0.42)]">
                        {iconFor("m6.75 12.75 3 3 7.5-7.5", "h-12 w-12")}
                      </div>
                      <p className="mt-8 text-sm font-semibold uppercase tracking-[0.24em] text-indigo-500">
                        {STEPS[step - 1].title}
                      </p>
                      <h2 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                        Tutto pronto, {fullName}!
                      </h2>
                      <p className="mx-auto mt-5 max-w-3xl text-xl leading-9 text-slate-500">
                        Controlla un'ultima volta il riepilogo dei tuoi dati prima di confermare ufficialmente la tua richiesta di iscrizione.
                      </p>
                    </div>

                    <div className="signup-wizard-card px-6 py-8 md:px-10 md:py-10">
                      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
                        <section>
                          <p className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-indigo-500">
                            {iconFor("M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z", "h-4 w-4")}
                            Dati personali
                          </p>
                          <dl className="mt-7 space-y-5">
                            <SummaryItem label="Nominativo completo" value={fullName} muted={fullName === "futuro socio"} />
                            <SummaryItem label="Data di nascita" value={formatDateDisplay(form.dataNascita)} muted={!form.dataNascita} />
                            <SummaryItem label="Sesso" value={genderLabel} muted={genderLabel === "-"} />
                            <SummaryItem label="Comune di nascita" value={form.comuneNascita || "-"} muted={!form.comuneNascita} />
                            <SummaryItem label="Codice fiscale" value={normalizeCodiceFiscale(form.codiceFiscale) || "-"} muted={!form.codiceFiscale} />
                          </dl>
                        </section>

                        <section>
                          <p className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-indigo-500">
                            {iconFor("M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75", "h-4 w-4")}
                            Riepilogo contatti
                          </p>
                          <dl className="mt-7 space-y-5">
                            <SummaryItem
                              label="Tipo tessera"
                              value={selectedMembershipTypeLabel}
                              muted={!selectedMembershipTypeLabel}
                            />
                            <SummaryItem label="Indirizzo email" value={form.email || "-"} muted={!form.email} />
                            <SummaryItem label="Numero di telefono" value={form.telefono || "-"} muted={!form.telefono} />
                            {selectedMembershipType === "temporary" ? (
                              <SummaryItem
                                label="Durata temporanea"
                                value={temporaryDurationLabel}
                              />
                            ) : null}
                            {membershipPaymentRequired ? (
                              <>
                                <SummaryItem
                                  label="Cosa stai pagando"
                                  value={
                                    selectedMembershipType === "temporary"
                                      ? "Quota tessera temporanea"
                                      : membershipPaymentLabel
                                  }
                                  muted={false}
                                />
                                <SummaryItem
                                  label="Importo"
                                  value={
                                    selectedMembershipFee != null
                                      ? `${selectedMembershipFee.toFixed(2)} ${membershipPaymentCurrency}`
                                      : "-"
                                  }
                                  muted={selectedMembershipFee == null}
                                />
                              </>
                            ) : (
                              <SummaryItem
                                label="Modalita di pagamento"
                                value={paymentMethodLabel}
                                muted={paymentMethodLabel === "-"}
                              />
                            )}
                            <SummaryItem
                              label="Documento d'identita allegato"
                              value={
                                form.documentoIdentita?.name ||
                                (membershipDocumentRequired
                                  ? "Non caricato (obbligatorio)"
                                  : "Nessun documento fornito in questa fase")
                              }
                              muted={!form.documentoIdentita}
                            />
                            <SummaryItem
                              label="Privacy e statuto"
                              value={
                                org.has_statute
                                  ? "Informativa privacy letta e statuto accettato"
                                  : "Informativa privacy letta"
                              }
                            />
                          </dl>
                        </section>
                      </div>

                      {membershipPaymentRequired ? (
                        <div className="mt-10 rounded-[1.8rem] border border-indigo-200 bg-indigo-50/70 px-6 py-6">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
                            Pagamento quota associativa
                          </p>
                          <p className="mt-3 text-base leading-7 text-slate-700">
                            Per completare l&apos;iscrizione è necessario effettuare il pagamento online.
                          </p>
                          <div className="mt-5 rounded-[1.4rem] border border-white/80 bg-white px-5 py-4 shadow-[0_18px_40px_-32px_rgba(79,70,229,0.35)]">
                            <p className="text-sm text-slate-500">
                              {selectedMembershipType === "temporary"
                                ? "Quota tessera temporanea"
                                : membershipPaymentLabel}
                            </p>
                            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                              {selectedMembershipFee != null
                                ? `${selectedMembershipFee.toFixed(2)} ${membershipPaymentCurrency}`
                                : "-"}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-10 rounded-[1.6rem] border border-slate-200 bg-slate-50/70 px-6 py-5 text-base leading-7 text-slate-500">
                          Confermando l&apos;invio dichiari che i dati inseriti sono corretti e completi. Se la registrazione password andrà a buon fine, l&apos;accesso all&apos;area riservata sarà disponibile subito.
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </motion.div>
            </AnimatePresence>

            <div className="mt-10 flex flex-col gap-4 border-t border-slate-200 px-1 pt-8 sm:flex-row sm:items-center sm:justify-between">
              {step > 1 ? (
                <button className={secondaryActionClass} type="button" onClick={goBack}>
                  {iconFor("m15 6-6 6 6 6", "h-5 w-5")}
                  Indietro
                </button>
              ) : (
                <div />
              )}

              {step < STEPS.length ? (
                <button className={primaryActionClass} type="button" onClick={goNext}>
                  Continua
                  {iconFor("m9 18 6-6-6-6", "h-5 w-5")}
                </button>
              ) : (
                <button
                  className={`${primaryActionClass} min-w-[240px] disabled:cursor-not-allowed disabled:opacity-70`}
                  type="button"
                  disabled={submitting || !confirmReady}
                  onClick={() => {
                    if (!confirmReady) return;
                    void submitMembership();
                  }}
                >
                  {submitting
                    ? membershipPaymentRequired
                      ? "Creazione checkout..."
                      : "Invio in corso..."
                    : confirmReady
                      ? membershipPaymentRequired
                        ? membershipPaymentButtonLabel
                        : "Conferma iscrizione"
                      : "Preparo conferma..."}
                  {!submitting ? iconFor("m9 18 6-6-6-6", "h-5 w-5") : null}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
};

export default Iscrizione;
