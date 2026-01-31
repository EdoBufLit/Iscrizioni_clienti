import { ChangeEvent, FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { requestMagicLink } from "../lib/api";

const associationNames: Record<string, string> = {
  "lodi-artigiani": "Associazione Artigiani Lodigiani",
  "milano-commercianti": "Unione Commercianti Milano Centro",
  "pavia-professionisti": "Associazione Professionisti Pavia",
  "cremona-artigiani": "Confederazione Artigiana Cremona",
  "bergamo-commercianti": "Associazione Commercianti Bergamo",
  "lodi-professionisti": "Forum Professionisti Lodi",
  "milano-artigiani": "Artigiani Metropolitani Milano",
  "pavia-commercianti": "Commercianti Pavia Sud",
};

const STEPS = [
  { label: "Dati personali", short: "Dati" },
  { label: "Documenti e consensi", short: "Consensi" },
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
  codiceFiscale: string;
  email: string;
  telefono: string;
  documentoIdentita: File | null;
  privacy: boolean;
  statuto: boolean;
};

const initial: FormData = {
  nome: "",
  cognome: "",
  dataNascita: "",
  codiceFiscale: "",
  email: "",
  telefono: "",
  documentoIdentita: null,
  privacy: false,
  statuto: false,
};

function validateStep1(f: FormData): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.nome.trim()) e.nome = "Il campo nome è obbligatorio.";
  if (!f.cognome.trim()) e.cognome = "Il campo cognome è obbligatorio.";
  if (!f.dataNascita) e.dataNascita = "Inserisci la data di nascita.";
  if (!f.codiceFiscale.trim())
    e.codiceFiscale = "Il codice fiscale è obbligatorio.";
  else if (!/^[A-Z0-9]{16}$/i.test(f.codiceFiscale.trim()))
    e.codiceFiscale = "Il codice fiscale deve contenere 16 caratteri alfanumerici.";
  if (!f.email.trim()) e.email = "L'indirizzo email è obbligatorio.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))
    e.email = "L'indirizzo email non sembra valido.";
  if (!f.telefono.trim()) e.telefono = "Il numero di telefono è obbligatorio.";
  return e;
}

function validateStep2(f: FormData): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.documentoIdentita)
    e.documentoIdentita = "Il documento di identità è obbligatorio per completare l'iscrizione.";
  if (!f.privacy)
    e.privacy = "È necessario accettare l'informativa sulla privacy per procedere.";
  if (!f.statuto)
    e.statuto = "È necessario accettare lo statuto dell'associazione per procedere.";
  return e;
}

/* ── Step indicator ─────────────────────────────────────────────── */

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
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 13 4 4L19 7" />
                </svg>
              ) : (
                num
              )}
            </span>
            <span
              className={`hidden text-sm font-medium sm:block ${
                active ? "text-neutral-900" : "text-neutral-400"
              }`}
            >
              {s.short}
            </span>
          </div>
        </div>
      );
    })}
  </div>
);

/* ── Section header ─────────────────────────────────────────────── */

const SectionHeader = ({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description?: string;
}) => (
  <div className="flex items-start gap-3 border-b border-neutral-100 pb-5">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
      <svg
        className="h-4 w-4 text-brand"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={icon} />
      </svg>
    </div>
    <div>
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      {description && (
        <p className="mt-0.5 text-xs leading-5 text-neutral-500">
          {description}
        </p>
      )}
    </div>
  </div>
);

/* ── Main component ─────────────────────────────────────────────── */

const Iscrizione = () => {
  const { slug } = useParams<{ slug: string }>();
  const associationName = slug ? associationNames[slug] : undefined;

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const [linkSending, setLinkSending] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [linkError, setLinkError] = useState("");

  if (!associationName) {
    return (
      <section className="py-16">
        <div className="container-shell">
          <div className="surface max-w-2xl p-7">
            <h1 className="text-base font-semibold text-neutral-900">
              Associazione non trovata
            </h1>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              Il collegamento non è corretto o l'associazione non è disponibile.
            </p>
            <div className="mt-5">
              <Link className="btn-primary" to="/associazioni">
                Torna all'elenco
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const updateField = (
    field: keyof FormData,
    value: string | boolean | File | null,
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleText =
    (field: keyof FormData) => (e: ChangeEvent<HTMLInputElement>) =>
      updateField(field, e.target.value);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    updateField("documentoIdentita", e.target.files?.[0] ?? null);
  };

  const handleCheck =
    (field: "privacy" | "statuto") => (e: ChangeEvent<HTMLInputElement>) =>
      updateField(field, e.target.checked);

  const goNext = () => {
    const validate = step === 1 ? validateStep1 : validateStep2;
    const newErrors = validate(form);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setStep((s) => s + 1);
  };

  const goBack = () => {
    setErrors({});
    setStep((s) => s - 1);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const hasErrors = Object.keys(errors).length > 0;
  const ic = (field: string) => (errors[field] ? inputErr : inputOk);

  /* ── Success ──────────────────────────────────────────────────── */

  const handleMagicLink = async () => {
    if (linkSending || linkSent) return;
    setLinkError("");
    setLinkSending(true);
    try {
      await requestMagicLink(form.email.trim());
      setLinkSent(true);
    } catch {
      setLinkError("Invio non riuscito. Riprova o accedi dalla pagina di login.");
    } finally {
      setLinkSending(false);
    }
  };

  if (submitted) {
    return (
      <section className="flex min-h-[60vh] items-center justify-center py-16">
        <div className="container-shell">
          <div className="surface mx-auto max-w-lg overflow-hidden">
            <div className="bg-gradient-to-b from-emerald-50 to-white px-8 pb-0 pt-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <svg
                  className="h-7 w-7 text-emerald-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 13 4 4L19 7" />
                </svg>
              </div>
              <h1 className="mt-5 text-xl font-semibold text-neutral-900">
                Richiesta registrata
              </h1>
            </div>
            <div className="px-8 pb-8 pt-4 text-center">
              <p className="text-sm leading-6 text-neutral-600">
                La richiesta di iscrizione a{" "}
                <span className="font-medium text-neutral-800">
                  {associationName}
                </span>{" "}
                è stata inviata correttamente. Riceverai comunicazioni sullo
                stato della pratica all'indirizzo email indicato.
              </p>
              <div className="mt-4 rounded-lg border border-neutral-100 bg-neutral-25 px-5 py-4">
                <p className="text-xs leading-5 text-neutral-500">
                  La verifica dei dati e dei documenti avviene entro pochi
                  giorni lavorativi. Ti contatteremo in caso di necessità.
                </p>
              </div>

              {/* Magic-link access section */}
              <div className="mt-6 rounded-lg border border-neutral-200 bg-white px-6 py-5 text-left">
                <p className="text-sm font-semibold text-neutral-900">
                  Accedi alla tua area riservata
                </p>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Ricevi un link di accesso direttamente nella tua casella email
                  per consultare lo stato della richiesta.
                </p>

                {linkSent ? (
                  <div className="mt-4 rounded-md border border-emerald-200/60 bg-emerald-50 px-4 py-3">
                    <p className="text-sm text-emerald-700">
                      Link inviato a{" "}
                      <span className="font-medium">{form.email}</span>.
                      Controlla la tua casella di posta.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-neutral-25 px-3.5 py-2.5">
                        <p className="truncate text-sm text-neutral-700">
                          {form.email}
                        </p>
                      </div>
                      <button
                        className="inline-flex shrink-0 items-center justify-center rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-subtle transition hover:-translate-y-px hover:bg-brand-dark hover:shadow-card active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-subtle"
                        type="button"
                        disabled={linkSending}
                        onClick={handleMagicLink}
                      >
                        {linkSending ? "Invio…" : "Ricevi link di accesso"}
                      </button>
                    </div>
                    {linkError && (
                      <p className="mt-2 text-xs text-red-600">{linkError}</p>
                    )}
                  </>
                )}
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link className="btn-primary" to="/associazioni">
                  Torna alle associazioni
                </Link>
                <Link className="btn-ghost" to="/login">
                  Vai al login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  /* ── Wizard ───────────────────────────────────────────────────── */

  return (
    <section className="py-16">
      <div className="container-shell">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            className="text-sm font-medium text-neutral-500 transition hover:text-neutral-800"
            to={`/associazioni/${slug}`}
          >
            {associationName}
          </Link>
          <span className="mx-2 text-sm text-neutral-300">/</span>
          <span className="text-sm font-medium text-neutral-700">
            Iscrizione
          </span>
        </div>

        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold text-neutral-900">
            Diventa socio
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-neutral-500">
            Compila il modulo per richiedere l'iscrizione a{" "}
            <span className="font-medium text-neutral-700">
              {associationName}
            </span>
            . Tutti i campi sono obbligatori.
          </p>

          {/* Step indicator */}
          <div className="mt-8">
            <StepIndicator current={step} />
          </div>

          {/* Error banner */}
          {hasErrors && (
            <div className="mt-6 flex gap-3 rounded-lg border border-red-200/60 bg-red-50 px-5 py-3.5">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <p className="text-sm text-red-700">
                Compila correttamente i campi evidenziati per continuare.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* ── Step 1: Personal data ───────────────────────────── */}
            {step === 1 && (
              <div className="surface mt-6 p-7">
                <SectionHeader
                  icon="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                  title="Anagrafica"
                  description="Dati identificativi del richiedente."
                />
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <div>
                    <label htmlFor="nome" className={labelClass}>
                      Nome
                    </label>
                    <input
                      id="nome"
                      className={ic("nome")}
                      type="text"
                      placeholder="Mario"
                      value={form.nome}
                      onChange={handleText("nome")}
                    />
                    {errors.nome && (
                      <p className="mt-1.5 text-xs text-red-600">
                        {errors.nome}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="cognome" className={labelClass}>
                      Cognome
                    </label>
                    <input
                      id="cognome"
                      className={ic("cognome")}
                      type="text"
                      placeholder="Rossi"
                      value={form.cognome}
                      onChange={handleText("cognome")}
                    />
                    {errors.cognome && (
                      <p className="mt-1.5 text-xs text-red-600">
                        {errors.cognome}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="dataNascita" className={labelClass}>
                      Data di nascita
                    </label>
                    <input
                      id="dataNascita"
                      className={ic("dataNascita")}
                      type="date"
                      value={form.dataNascita}
                      onChange={handleText("dataNascita")}
                    />
                    {errors.dataNascita && (
                      <p className="mt-1.5 text-xs text-red-600">
                        {errors.dataNascita}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="codiceFiscale" className={labelClass}>
                      Codice fiscale
                    </label>
                    <input
                      id="codiceFiscale"
                      className={`${ic("codiceFiscale")} uppercase`}
                      type="text"
                      maxLength={16}
                      placeholder="RSSMRA85A01H501Z"
                      value={form.codiceFiscale}
                      onChange={handleText("codiceFiscale")}
                    />
                    {errors.codiceFiscale && (
                      <p className="mt-1.5 text-xs text-red-600">
                        {errors.codiceFiscale}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-7 border-t border-neutral-100 pt-5">
                  <SectionHeader
                    icon="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                    title="Contatti"
                    description="Recapiti per le comunicazioni relative all'iscrizione."
                  />
                </div>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <div>
                    <label htmlFor="email" className={labelClass}>
                      Email
                    </label>
                    <input
                      id="email"
                      className={ic("email")}
                      type="email"
                      placeholder="mario.rossi@email.it"
                      value={form.email}
                      onChange={handleText("email")}
                    />
                    {errors.email && (
                      <p className="mt-1.5 text-xs text-red-600">
                        {errors.email}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="telefono" className={labelClass}>
                      Telefono
                    </label>
                    <input
                      id="telefono"
                      className={ic("telefono")}
                      type="tel"
                      placeholder="+39 333 1234567"
                      value={form.telefono}
                      onChange={handleText("telefono")}
                    />
                    {errors.telefono && (
                      <p className="mt-1.5 text-xs text-red-600">
                        {errors.telefono}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-neutral-100 pt-5">
                  <p className="text-xs text-neutral-400">
                    Passaggio 1 di {STEPS.length}
                  </p>
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={goNext}
                  >
                    Continua
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: Documents & consent ─────────────────────── */}
            {step === 2 && (
              <div className="surface mt-6 p-7">
                <SectionHeader
                  icon="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  title="Documento di identità"
                  description="Carica una copia leggibile del documento in corso di validità."
                />

                <div className="mt-5">
                  <label
                    htmlFor="documentoIdentita"
                    className={`flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition ${
                      errors.documentoIdentita
                        ? "border-red-300 bg-red-50/30"
                        : form.documentoIdentita
                          ? "border-brand/30 bg-brand/[0.02]"
                          : "border-neutral-200 hover:border-neutral-300"
                    }`}
                  >
                    {form.documentoIdentita ? (
                      <>
                        <svg
                          className="h-8 w-8 text-brand"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m9 12.75 3 3m0 0 3-3m-3 3v-7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                        <p className="mt-2 text-sm font-medium text-neutral-800">
                          {form.documentoIdentita.name}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          Seleziona per sostituire
                        </p>
                      </>
                    ) : (
                      <>
                        <svg
                          className="h-8 w-8 text-neutral-300"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                        </svg>
                        <p className="mt-2 text-sm font-medium text-neutral-700">
                          Seleziona un file
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          PDF, JPG o PNG — max 5 MB
                        </p>
                      </>
                    )}
                    <input
                      id="documentoIdentita"
                      className="sr-only"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFile}
                    />
                  </label>
                  {errors.documentoIdentita && (
                    <p className="mt-2 text-xs text-red-600">
                      {errors.documentoIdentita}
                    </p>
                  )}
                </div>

                <div className="mt-7 border-t border-neutral-100 pt-5">
                  <SectionHeader
                    icon="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                    title="Consensi obbligatori"
                    description="La tua adesione richiede l'accettazione dei seguenti documenti."
                  />
                </div>
                <div className="mt-5 space-y-4">
                  <label
                    className={`flex items-start gap-3 rounded-lg border p-4 transition ${
                      errors.privacy
                        ? "border-red-200 bg-red-50/30"
                        : form.privacy
                          ? "border-brand/20 bg-brand/[0.02]"
                          : "border-neutral-100"
                    }`}
                  >
                    <input
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-brand focus:ring-brand/30"
                      type="checkbox"
                      checked={form.privacy}
                      onChange={handleCheck("privacy")}
                    />
                    <div>
                      <span className="text-sm font-medium leading-6 text-neutral-800">
                        Informativa sulla privacy
                      </span>
                      <p className="mt-0.5 text-xs leading-5 text-neutral-500">
                        Dichiaro di aver letto e compreso l'informativa sul
                        trattamento dei dati personali ai sensi del GDPR
                        (Regolamento UE 2016/679).
                      </p>
                    </div>
                  </label>
                  {errors.privacy && (
                    <p className="pl-7 text-xs text-red-600">
                      {errors.privacy}
                    </p>
                  )}

                  <label
                    className={`flex items-start gap-3 rounded-lg border p-4 transition ${
                      errors.statuto
                        ? "border-red-200 bg-red-50/30"
                        : form.statuto
                          ? "border-brand/20 bg-brand/[0.02]"
                          : "border-neutral-100"
                    }`}
                  >
                    <input
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-brand focus:ring-brand/30"
                      type="checkbox"
                      checked={form.statuto}
                      onChange={handleCheck("statuto")}
                    />
                    <div>
                      <span className="text-sm font-medium leading-6 text-neutral-800">
                        Statuto dell'associazione
                      </span>
                      <p className="mt-0.5 text-xs leading-5 text-neutral-500">
                        Dichiaro di aver letto e di accettare integralmente lo
                        statuto dell'associazione, impegnandomi a rispettarne le
                        disposizioni.
                      </p>
                    </div>
                  </label>
                  {errors.statuto && (
                    <p className="pl-7 text-xs text-red-600">
                      {errors.statuto}
                    </p>
                  )}
                </div>

                <div className="mt-5 rounded-lg border border-neutral-100 bg-neutral-25 px-5 py-4">
                  <div className="flex gap-3">
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                    <p className="text-xs leading-5 text-neutral-500">
                      I tuoi dati sono trattati in conformità alla normativa
                      vigente e non saranno condivisi con terze parti al di
                      fuori delle finalità associative.
                    </p>
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-neutral-100 pt-5">
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={goBack}
                  >
                    Indietro
                  </button>
                  <div className="flex items-center gap-4">
                    <p className="text-xs text-neutral-400">
                      Passaggio 2 di {STEPS.length}
                    </p>
                    <button
                      className="btn-primary"
                      type="button"
                      onClick={goNext}
                    >
                      Continua
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 3: Summary & submit ────────────────────────── */}
            {step === 3 && (
              <div className="surface mt-6 p-7">
                <SectionHeader
                  icon="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75"
                  title="Riepilogo richiesta"
                  description="Verifica i dati inseriti prima di inviare la richiesta."
                />

                <div className="mt-5 rounded-lg border border-neutral-100 bg-neutral-25 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">
                    Anagrafica
                  </p>
                  <dl className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
                    {[
                      { label: "Nome", value: form.nome },
                      { label: "Cognome", value: form.cognome },
                      { label: "Data di nascita", value: form.dataNascita },
                      { label: "Codice fiscale", value: form.codiceFiscale.toUpperCase() },
                    ].map((item) => (
                      <div key={item.label}>
                        <dt className="text-xs text-neutral-500">
                          {item.label}
                        </dt>
                        <dd className="mt-0.5 text-sm font-medium text-neutral-800">
                          {item.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="mt-4 rounded-lg border border-neutral-100 bg-neutral-25 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">
                    Contatti
                  </p>
                  <dl className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
                    <div>
                      <dt className="text-xs text-neutral-500">Email</dt>
                      <dd className="mt-0.5 text-sm font-medium text-neutral-800">
                        {form.email}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Telefono</dt>
                      <dd className="mt-0.5 text-sm font-medium text-neutral-800">
                        {form.telefono}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-4 rounded-lg border border-neutral-100 bg-neutral-25 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">
                    Documenti e consensi
                  </p>
                  <dl className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
                    <div>
                      <dt className="text-xs text-neutral-500">Documento</dt>
                      <dd className="mt-0.5 text-sm font-medium text-neutral-800">
                        {form.documentoIdentita?.name ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Consensi</dt>
                      <dd className="mt-0.5 text-sm font-medium text-emerald-700">
                        Privacy e statuto accettati
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-5 border-t border-neutral-100 pt-5">
                  <p className="text-xs leading-5 text-neutral-500">
                    Confermando l'invio, dichiari che i dati inseriti sono
                    corretti e completi. La richiesta sarà esaminata
                    dall'associazione, che ti contatterà per le fasi successive.
                  </p>
                </div>

                <div className="mt-7 flex items-center justify-between border-t border-neutral-100 pt-5">
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={goBack}
                  >
                    Indietro
                  </button>
                  <div className="flex items-center gap-4">
                    <p className="text-xs text-neutral-400">
                      Passaggio 3 di {STEPS.length}
                    </p>
                    <button className="btn-primary" type="submit">
                      Conferma e invia
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
