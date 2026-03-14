import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
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
  { label: "Dati personali", short: "Dati" },
  { label: "Documenti e dichiarazioni", short: "Privacy" },
  { label: "Riepilogo e invio", short: "Conferma" },
] as const;

const inputBase =
  "mt-1.5 w-full rounded-md border bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:ring-2";
const inputOk =
  `${inputBase} border-neutral-200 focus:border-brand focus:ring-brand/20`;
const inputErr =
  `${inputBase} border-red-300 focus:border-red-400 focus:ring-red-100`;

const labelClass = "block text-sm font-medium text-neutral-700";

type FormData = {
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

function validateStep1(f: FormData): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.nome.trim()) e.nome = "Il campo nome è obbligatorio.";
  if (!f.cognome.trim()) e.cognome = "Il campo cognome è obbligatorio.";
  if (!f.dataNascita) e.dataNascita = "Inserisci la data di nascita.";
  if (!f.sesso) e.sesso = "Seleziona il sesso.";
  if (!f.comuneNascita.trim())
    e.comuneNascita = "Il comune di nascita e obbligatorio.";
  else if (!f.comuneNascitaCode)
    e.comuneNascita = "Seleziona un comune valido dall'elenco.";
  if (!f.codiceFiscale.trim()) {
    e.codiceFiscale = "Il codice fiscale è obbligatorio.";
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
  if (!f.email.trim()) e.email = "L'indirizzo email è obbligatorio.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))
    e.email = "L'indirizzo email non sembra valido.";
  if (!f.telefono.trim()) e.telefono = "Il numero di telefono è obbligatorio.";
  if (!f.modalitaPagamento)
    e.modalitaPagamento = "Seleziona la modalità di pagamento.";
  if (!f.password || f.password.length < 6)
    e.password = "La password deve avere almeno 6 caratteri.";
  return e;
}

function validateStep2(
  f: FormData,
  hasStatute: boolean,
  requireMembershipDocument: boolean,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (requireMembershipDocument && !f.documentoIdentita)
    e.documentoIdentita = "Carica il documento di identità per procedere.";
  if (!f.privacy)
    e.privacy = "È necessario dichiarare di aver letto l'informativa privacy per procedere.";
  if (hasStatute && !f.statuto)
    e.statuto = "È necessario accettare lo statuto dell'associazione per procedere.";
  return e;
}

const StepIndicator = ({ current }: { current: number }) => (
  <div className="flex items-center gap-0" role="list" aria-label="Passaggi">
    {STEPS.map((s, i) => {
      const num = i + 1;
      const completed = num < current;
      const active = num === current;
      return (
        <div key={num} className="flex items-center" role="listitem">
          {i > 0 && (
            <div
              className={`mx-2 h-px w-8 sm:mx-3 sm:w-12 ${
                completed ? "bg-brand" : "bg-neutral-200"
              }`}
              aria-hidden="true"
            />
          )}
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                completed
                  ? "bg-brand text-white"
                  : active
                    ? "border-2 border-brand bg-white text-brand"
                    : "border border-neutral-200 bg-white text-neutral-400"
              }`}
            >
              {completed ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
              ) : num}
            </span>
            <span className={`hidden text-sm font-medium sm:block ${active ? "text-neutral-900" : "text-neutral-400"}`}>
              {s.short}
            </span>
          </div>
        </div>
      );
    })}
  </div>
);

const SectionHeader = ({ icon, title, description }: { icon: string; title: string; description?: string }) => (
  <div className="flex items-start gap-3 border-b border-neutral-100 pb-5">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
      <svg className="h-4 w-4 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
    </div>
    <div>
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      {description && <p className="mt-0.5 text-xs leading-5 text-neutral-500">{description}</p>}
    </div>
  </div>
);

const Iscrizione = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState("");

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
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
    if (org) {
      applySeo({
        title: `Iscrizione a ${org.name}`,
        description: `Compila il modulo per richiedere l'iscrizione a ${org.name}. Iscrizione digitale guidata su ASSO.N.A.M.`,
        canonicalPath: `/associazioni/${slug}/iscrizione`,
        noindex: true,
      });
    }
  }, [org, slug]);

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
        // Ignore intermediate invalid states while the user is typing.
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

  const associationName = org?.name;
  const membershipDocumentRequired = Boolean(org?.require_membership_document);
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

  if (orgLoading) {
    return (
      <section className="py-16" data-reveal="fade-up">
        <div className="container-shell max-w-2xl">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="mt-3 h-4 w-96" />
        </div>
      </section>
    );
  }

  if (orgError || !org) {
    return (
      <section className="py-16" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface max-w-2xl p-7">
            <h1 className="text-base font-semibold text-neutral-900">Associazione non trovata</h1>
            <p className="mt-3 text-sm leading-6 text-neutral-600">Il collegamento non è corretto o l'associazione non è disponibile.</p>
            <div className="mt-5"><Link className="btn-primary" to="/associazioni">Torna all'elenco</Link></div>
          </div>
        </div>
      </section>
    );
  }

  const updateField = (field: keyof FormData, value: string | boolean | File | null) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    }
  };

  const fieldError = (field: string) => {
    if (field === "codiceFiscale") {
      return errors.codiceFiscale || liveFiscalCodeError;
    }
    return errors[field];
  };

  const handleText = (field: keyof FormData) => (e: ChangeEvent<HTMLInputElement>) => updateField(field, e.target.value);
  const handleFile = (e: ChangeEvent<HTMLInputElement>) => updateField("documentoIdentita", e.target.files?.[0] ?? null);
  const handleCheck = (field: "privacy" | "statuto") => (e: ChangeEvent<HTMLInputElement>) => updateField(field, e.target.checked);
  const handleGenderChange = (e: ChangeEvent<HTMLSelectElement>) => updateField("sesso", e.target.value as "" | "M" | "F");
  const handleBirthPlaceChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setShowMunicipalitySuggestions(true);
    setMunicipalityLookupError("");
    setForm((prev) => ({
      ...prev,
      comuneNascita: value,
      comuneNascitaCode: "",
    }));
    if (errors.comuneNascita) {
      setErrors((prev) => { const next = { ...prev }; delete next.comuneNascita; return next; });
    }
  };
  const handleFiscalCodeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextValue = normalizeCodiceFiscale(e.target.value).slice(0, 16);
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
      setErrors((prev) => { const next = { ...prev }; delete next.comuneNascita; return next; });
    }
  };

  const goNext = () => {
    let newErrors = {};
    if (step === 1) {
        newErrors = validateStep1(form);
    } else if (step === 2) {
        newErrors = validateStep2(form, !!org?.has_statute, membershipDocumentRequired);
    }

    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setErrors({});
    setStep((s) => s + 1);
  };

  const goBack = () => { setErrors({}); setStep((s) => s - 1); };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (membershipDocumentRequired && !form.documentoIdentita) {
      setErrors((prev) => ({
        ...prev,
        documentoIdentita: "Carica il documento di identità per completare l'iscrizione.",
      }));
      setSubmitError("Completa il caricamento del documento richiesto per inviare la richiesta.");
      setStep(2);
      return;
    }
    if (!form.modalitaPagamento) {
      setSubmitError("Seleziona la modalità di pagamento.");
      return;
    }
    setSubmitError("");
    setSubmitting(true);
    try {
      // 1. Submit join request to backend (critical - if this fails, show error)
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
        accepted_statute_version: org?.has_statute ? (org.statute_version || null) : null,
        accept_privacy: form.privacy,
        payment_method: form.modalitaPagamento,
        id_document: form.documentoIdentita,
      });

      // Signup saved successfully — mark as submitted regardless of registration
      if (!joinResult.active_card_page_url) {
        setSubmitted(true);
      }

      // 2. Register with password for immediate login (non-blocking)
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
        // Registration failed but signup was saved — user can login later
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
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const hasErrors = Object.keys(errors).length > 0;
  const ic = (field: string) => (fieldError(field) ? inputErr : inputOk);
  const paymentMethodLabel =
    form.modalitaPagamento === "CASH"
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

  if (submitted) {
    return (
      <section className="flex min-h-[60vh] items-center justify-center py-16" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface mx-auto max-w-lg overflow-hidden">
            <div className="bg-gradient-to-b from-emerald-50 to-white px-8 pb-0 pt-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-7 w-7 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
              </div>
              <h1 className="mt-5 text-xl font-semibold text-neutral-900">Richiesta registrata</h1>
            </div>
            <div className="px-8 pb-8 pt-4 text-center">
              <p className="text-sm leading-6 text-neutral-600">
                La richiesta di iscrizione a{" "}
                <span className="font-medium text-neutral-800">{associationName}</span>{" "}
                è stata inviata correttamente. Sarai reindirizzato alla tua area riservata.
              </p>
              <div className="mt-4 rounded-lg border border-neutral-100 bg-neutral-25 px-5 py-4">
                <p className="text-xs leading-5 text-neutral-500">
                  La verifica dei dati e dei documenti avviene entro pochi giorni lavorativi.
                </p>
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link className="btn-primary" to="/dashboard">Vai alla tua area</Link>
                <Link className="btn-ghost" to="/associazioni">Torna alle associazioni</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="mb-6">
          <Link className="text-sm font-medium text-neutral-500 transition hover:text-neutral-800" to={`/associazioni/${slug}`}>{associationName}</Link>
          <span className="mx-2 text-sm text-neutral-300">/</span>
          <span className="text-sm font-medium text-neutral-700">Iscrizione</span>
        </div>

        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold text-neutral-900">Diventa socio</h1>
          <p className="mt-1.5 text-sm leading-6 text-neutral-500">
            Compila il modulo per richiedere l'iscrizione a{" "}
            <span className="font-medium text-neutral-700">{associationName}</span>.
            {membershipDocumentRequired
              ? " Il documento di identità è obbligatorio per completare la richiesta."
              : " Il documento di identità è facoltativo."}
          </p>

          <div className="mt-8"><StepIndicator current={step} /></div>

          {hasErrors && (
            <div className="mt-6 flex gap-3 rounded-lg border border-red-200/60 bg-red-50 px-5 py-3.5">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
              <p className="text-sm text-red-700">Compila correttamente i campi evidenziati per continuare.</p>
            </div>
          )}

          {submitError && (
            <div className="mt-6 flex gap-3 rounded-lg border border-red-200/60 bg-red-50 px-5 py-3.5">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {step === 1 && (
              <div className="surface mt-6 p-7">
                <SectionHeader
                  icon="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                  title="Anagrafica"
                  description="Dati identificativi del richiedente."
                />
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <div>
                    <label htmlFor="nome" className={labelClass}>Nome</label>
                    <input id="nome" className={ic("nome")} type="text" placeholder="Mario" value={form.nome} onChange={handleText("nome")} />
                    {fieldError("nome") && <p className="mt-1.5 text-xs text-red-600">{fieldError("nome")}</p>}
                  </div>
                  <div>
                    <label htmlFor="cognome" className={labelClass}>Cognome</label>
                    <input id="cognome" className={ic("cognome")} type="text" placeholder="Rossi" value={form.cognome} onChange={handleText("cognome")} />
                    {fieldError("cognome") && <p className="mt-1.5 text-xs text-red-600">{fieldError("cognome")}</p>}
                  </div>
                  <div>
                    <label htmlFor="dataNascita" className={labelClass}>Data di nascita</label>
                    <input id="dataNascita" className={ic("dataNascita")} type="date" value={form.dataNascita} onChange={handleText("dataNascita")} />
                    {fieldError("dataNascita") && <p className="mt-1.5 text-xs text-red-600">{fieldError("dataNascita")}</p>}
                  </div>
                  <div>
                    <label htmlFor="sesso" className={labelClass}>Sesso</label>
                    <select id="sesso" className={ic("sesso")} value={form.sesso} onChange={handleGenderChange}>
                      <option value="">Seleziona...</option>
                      <option value="M">Maschile</option>
                      <option value="F">Femminile</option>
                    </select>
                    {fieldError("sesso") && <p className="mt-1.5 text-xs text-red-600">{fieldError("sesso")}</p>}
                  </div>
                  <div className="relative md:col-span-2" onBlur={() => window.setTimeout(() => setShowMunicipalitySuggestions(false), 120)}>
                    <label htmlFor="comuneNascita" className={labelClass}>Comune di nascita</label>
                    <input
                      id="comuneNascita"
                      className={ic("comuneNascita")}
                      type="text"
                      autoComplete="off"
                      placeholder="Roma"
                      value={form.comuneNascita}
                      onChange={handleBirthPlaceChange}
                      onFocus={() => setShowMunicipalitySuggestions(true)}
                    />
                    {showMunicipalitySuggestions && !form.comuneNascitaCode && form.comuneNascita.trim().length >= 2 && (
                      <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl">
                        {municipalityLoading ? (
                          <p className="px-4 py-3 text-sm text-neutral-500">Ricerca comuni in corso...</p>
                        ) : municipalitySuggestions.length > 0 ? (
                          <ul className="max-h-64 overflow-y-auto py-1">
                            {municipalitySuggestions.map((item) => (
                              <li key={item.code}>
                                <button
                                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-neutral-700 transition hover:bg-neutral-50"
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    selectMunicipality(item);
                                  }}
                                >
                                  <span>{item.name}</span>
                                  <span className="text-xs text-neutral-400">
                                    {[item.province, item.region].filter(Boolean).join(" - ")}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="px-4 py-3 text-sm text-neutral-500">Nessun comune trovato.</p>
                        )}
                      </div>
                    )}
                    {fieldError("comuneNascita") ? (
                      <p className="mt-1.5 text-xs text-red-600">{fieldError("comuneNascita")}</p>
                    ) : municipalityLookupError ? (
                      <p className="mt-1.5 text-xs text-amber-600">{municipalityLookupError}</p>
                    ) : form.comuneNascitaCode ? (
                      <p className="mt-1.5 text-xs text-neutral-400">Codice catastale: {form.comuneNascitaCode}</p>
                    ) : (
                      <p className="mt-1.5 text-xs text-neutral-400">Seleziona il comune dalla lista per calcolare il codice fiscale.</p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="codiceFiscale" className={labelClass}>Codice fiscale</label>
                    <input id="codiceFiscale" className={`${ic("codiceFiscale")} uppercase`} type="text" maxLength={16} placeholder="RSSMRA85A01H501Z" value={form.codiceFiscale} onChange={handleFiscalCodeChange} />
                    {fieldError("codiceFiscale") ? (
                      <p className="mt-1.5 text-xs text-red-600">{fieldError("codiceFiscale")}</p>
                    ) : fiscalCodeWarning ? (
                      <p className="mt-1.5 text-xs text-amber-600">{fiscalCodeWarning}</p>
                    ) : (
                      <p className="mt-1.5 text-xs text-neutral-400">Il codice fiscale viene precompilato automaticamente e resta modificabile.</p>
                    )}
                  </div>
                </div>

                <div className="mt-7 border-t border-neutral-100 pt-5">
                  <SectionHeader
                    icon="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                    title="Contatti e accesso"
                    description="Recapiti e credenziali per accedere all'area riservata."
                  />
                </div>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <div>
                    <label htmlFor="email" className={labelClass}>Email</label>
                    <input id="email" className={ic("email")} type="email" placeholder="mario.rossi@email.it" autoComplete="email" value={form.email} onChange={handleText("email")} />
                    {errors.email && <p className="mt-1.5 text-xs text-red-600">{errors.email}</p>}
                  </div>
                  <div>
                    <label htmlFor="telefono" className={labelClass}>Telefono</label>
                    <input id="telefono" className={ic("telefono")} type="tel" placeholder="+39 333 1234567" value={form.telefono} onChange={handleText("telefono")} />
                    {errors.telefono && <p className="mt-1.5 text-xs text-red-600">{errors.telefono}</p>}
                  </div>
                  <div>
                    <label htmlFor="modalitaPagamento" className={labelClass}>Modalità di pagamento</label>
                    <select
                      id="modalitaPagamento"
                      className={ic("modalitaPagamento")}
                      value={form.modalitaPagamento}
                      onChange={(e) => updateField("modalitaPagamento", e.target.value as "" | "CASH" | "BONIFICO")}
                      required
                    >
                      <option value="">Seleziona...</option>
                      <option value="CASH">Contanti</option>
                      <option value="BONIFICO">Bonifico</option>
                    </select>
                    {errors.modalitaPagamento && <p className="mt-1.5 text-xs text-red-600">{errors.modalitaPagamento}</p>}
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="password" className={labelClass}>Password</label>
                    <input id="password" className={ic("password")} type="password" placeholder="Minimo 6 caratteri" autoComplete="new-password" value={form.password} onChange={handleText("password")} />
                    {errors.password && <p className="mt-1.5 text-xs text-red-600">{errors.password}</p>}
                    <p className="mt-1 text-xs text-neutral-400">Scegli una password per accedere alla tua area riservata.</p>
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-neutral-100 pt-5">
                  <p className="text-xs text-neutral-400">Passaggio 1 di {STEPS.length}</p>
                  <button className="btn-primary" type="button" onClick={goNext}>Continua</button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="surface mt-6 p-7">
                <SectionHeader
                  icon="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  title="Documento di identità"
                  description={
                    membershipDocumentRequired
                      ? "Carica una copia leggibile del documento in corso di validita. Questo passaggio e obbligatorio."
                      : "Carica una copia leggibile del documento in corso di validita (facoltativo)."
                  }
                />
                <div className="mt-5">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 ${
                        membershipDocumentRequired
                          ? "bg-red-100 text-red-700"
                          : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {membershipDocumentRequired ? "Obbligatorio" : "Facoltativo"}
                    </span>
                    <span className="text-neutral-400">
                      {membershipDocumentRequired
                        ? "Senza documento non puoi completare l'iscrizione."
                        : "Puoi continuare anche senza allegarlo."}
                    </span>
                  </div>
                  <label htmlFor="documentoIdentita" className={`flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition ${errors.documentoIdentita ? "border-red-300 bg-red-50/30" : form.documentoIdentita ? "border-brand/30 bg-brand/[0.02]" : "border-neutral-200 hover:border-neutral-300"}`}>
                    {form.documentoIdentita ? (
                      <>
                        <svg className="h-8 w-8 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="m9 12.75 3 3m0 0 3-3m-3 3v-7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                        <p className="mt-2 text-sm font-medium text-neutral-800">{form.documentoIdentita.name}</p>
                        <p className="mt-0.5 text-xs text-neutral-500">Seleziona per sostituire</p>
                      </>
                    ) : (
                      <>
                        <svg className="h-8 w-8 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                        <p className="mt-2 text-sm font-medium text-neutral-700">Seleziona un file</p>
                        <p className="mt-0.5 text-xs text-neutral-500">PDF, JPG o PNG — max 5 MB</p>
                      </>
                    )}
                    <input id="documentoIdentita" className="sr-only" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFile} />
                  </label>
                  {errors.documentoIdentita && <p className="mt-2 text-xs text-red-600">{errors.documentoIdentita}</p>}
                </div>

                <div className="mt-7 border-t border-neutral-100 pt-5">
                  <SectionHeader
                    icon="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                    title="Dichiarazioni obbligatorie"
                    description="Per completare l'adesione devi prendere visione dell'informativa privacy e, se previsto, dello statuto."
                  />
                </div>

                {!org?.has_statute && (
                  <div className="mt-5 flex gap-3 rounded-lg border border-amber-200/60 bg-amber-50 px-5 py-3.5">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" /><path d="M12 15.75h.007v.008H12v-.008Z" /></svg>
                    <p className="text-sm text-amber-800">Lo statuto non è ancora disponibile per questa associazione. Contatta l'associazione per maggiori informazioni.</p>
                  </div>
                )}

                <div className="mt-5 space-y-4">
                  <label className={`flex items-start gap-3 rounded-lg border p-4 transition ${errors.privacy ? "border-red-200 bg-red-50/30" : form.privacy ? "border-brand/20 bg-brand/[0.02]" : "border-neutral-100"}`}>
                    <input className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-brand focus:ring-brand/30" type="checkbox" checked={form.privacy} onChange={handleCheck("privacy")} />
                    <div>
                      <span className="text-sm font-medium leading-6 text-neutral-800">Presa visione dell'informativa privacy</span>
                      <p className="mt-0.5 text-xs leading-5 text-neutral-500">
                        Dichiaro di aver letto l'informativa sul trattamento dei dati personali prima di proseguire.
                        {" "}
                        <Link
                          className="font-medium text-brand hover:underline"
                          to="/privacy"
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                        >
                          Apri informativa
                        </Link>
                      </p>
                    </div>
                  </label>
                  {errors.privacy && <p className="pl-7 text-xs text-red-600">{errors.privacy}</p>}

                  {org?.has_statute && (
                    <>
                      <label className={`flex items-start gap-3 rounded-lg border p-4 transition ${errors.statuto ? "border-red-200 bg-red-50/30" : form.statuto ? "border-brand/20 bg-brand/[0.02]" : "border-neutral-100"}`}>
                        <input className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-brand focus:ring-brand/30" type="checkbox" checked={form.statuto} onChange={handleCheck("statuto")} />
                        <div>
                          <span className="text-sm font-medium leading-6 text-neutral-800">Statuto dell'associazione</span>
                          <div className="mt-1">
                             {org.statute_url && (
                                <a href={org.statute_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline mb-1">
                                   <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                                   Leggi lo statuto (PDF)
                                </a>
                             )}
                             <p className="text-xs leading-5 text-neutral-500">Dichiaro di aver letto e di accettare integralmente lo statuto dell'associazione, impegnandomi a rispettarne le disposizioni.</p>
                          </div>
                        </div>
                      </label>
                      {errors.statuto && <p className="pl-7 text-xs text-red-600">{errors.statuto}</p>}
                    </>
                  )}
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-neutral-100 pt-5">
                  <button className="btn-ghost" type="button" onClick={goBack}>Indietro</button>
                  <div className="flex items-center gap-4">
                    <p className="text-xs text-neutral-400">Passaggio 2 di {STEPS.length}</p>
                    <button className="btn-primary" type="button" onClick={goNext}>Continua</button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="surface mt-6 p-7">
                <SectionHeader
                  icon="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75"
                  title="Riepilogo richiesta"
                  description="Verifica i dati inseriti prima di inviare la richiesta."
                />

                <div className="mt-5 rounded-lg border border-neutral-100 bg-neutral-25 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">Anagrafica</p>
                  <dl className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
                    {[
                      { label: "Nome", value: form.nome },
                      { label: "Cognome", value: form.cognome },
                      { label: "Data di nascita", value: form.dataNascita },
                      { label: "Sesso", value: genderLabel },
                      { label: "Comune di nascita", value: form.comuneNascita },
                      { label: "Codice fiscale", value: normalizeCodiceFiscale(form.codiceFiscale) },
                    ].map((item) => (
                      <div key={item.label}>
                        <dt className="text-xs text-neutral-500">{item.label}</dt>
                        <dd className="mt-0.5 text-sm font-medium text-neutral-800">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="mt-4 rounded-lg border border-neutral-100 bg-neutral-25 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">Contatti</p>
                  <dl className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
                    <div><dt className="text-xs text-neutral-500">Email</dt><dd className="mt-0.5 text-sm font-medium text-neutral-800">{form.email}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Telefono</dt><dd className="mt-0.5 text-sm font-medium text-neutral-800">{form.telefono}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Modalità di pagamento</dt><dd className="mt-0.5 text-sm font-medium text-neutral-800">{paymentMethodLabel}</dd></div>
                  </dl>
                </div>

                <div className="mt-4 rounded-lg border border-neutral-100 bg-neutral-25 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">Documenti e dichiarazioni</p>
                  <dl className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
                    <div><dt className="text-xs text-neutral-500">Documento</dt><dd className="mt-0.5 text-sm font-medium text-neutral-800">{form.documentoIdentita?.name ?? (membershipDocumentRequired ? "Non caricato (obbligatorio)" : "Non caricato (facoltativo)")}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Presa visione</dt><dd className="mt-0.5 text-sm font-medium text-emerald-700">{org?.has_statute ? "Informativa privacy letta e statuto accettato" : "Informativa privacy letta"}</dd></div>
                  </dl>
                </div>

                <div className="mt-5 border-t border-neutral-100 pt-5">
                  <p className="text-xs leading-5 text-neutral-500">
                    Confermando l'invio, dichiari che i dati inseriti sono corretti e completi.
                    Un account sarà creato con l'email e la password indicati.
                  </p>
                </div>

                <div className="mt-7 flex items-center justify-between border-t border-neutral-100 pt-5">
                  <button className="btn-ghost" type="button" onClick={goBack}>Indietro</button>
                  <div className="flex items-center gap-4">
                    <p className="text-xs text-neutral-400">Passaggio 3 di {STEPS.length}</p>
                    <button className="btn-primary" type="submit" disabled={submitting}>
                      {submitting ? "Invio in corso…" : "Conferma e invia"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
};

export default Iscrizione;
