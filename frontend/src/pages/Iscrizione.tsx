import { ChangeEvent, FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";

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
  "Dati personali",
  "Documenti e consensi",
  "Riepilogo e invio",
] as const;

const inputClass =
  "mt-1.5 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-neutral-300";

const labelClass = "block text-sm font-medium text-neutral-700";

const errorClass = "mt-1 text-xs text-red-500";

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
  if (!f.nome.trim()) e.nome = "Inserisci il nome.";
  if (!f.cognome.trim()) e.cognome = "Inserisci il cognome.";
  if (!f.dataNascita) e.dataNascita = "Inserisci la data di nascita.";
  if (!f.codiceFiscale.trim()) e.codiceFiscale = "Inserisci il codice fiscale.";
  if (!f.email.trim()) e.email = "Inserisci l'indirizzo email.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))
    e.email = "L'indirizzo email non sembra valido.";
  if (!f.telefono.trim()) e.telefono = "Inserisci il numero di telefono.";
  return e;
}

function validateStep2(f: FormData): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.documentoIdentita)
    e.documentoIdentita = "Carica un documento di identità.";
  if (!f.privacy)
    e.privacy = "È necessario accettare l'informativa sulla privacy.";
  if (!f.statuto)
    e.statuto = "È necessario accettare lo statuto dell'associazione.";
  return e;
}

const Iscrizione = () => {
  const { slug } = useParams<{ slug: string }>();
  const associationName = slug ? associationNames[slug] : undefined;

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

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

  if (submitted) {
    return (
      <section className="py-16">
        <div className="container-shell">
          <div className="surface mx-auto max-w-2xl p-7">
            <p className="text-xs font-medium text-neutral-400">
              ISCRIZIONE INVIATA
            </p>
            <h1 className="mt-2 text-base font-semibold text-neutral-900">
              Richiesta registrata
            </h1>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              La richiesta di iscrizione a{" "}
              <span className="font-medium text-neutral-800">
                {associationName}
              </span>{" "}
              è stata inviata. Riceverai comunicazioni sullo stato della pratica
              all'indirizzo indicato.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="btn-primary" to="/associazioni">
                Torna alle associazioni
              </Link>
              <Link className="btn-ghost" to="/">
                Vai alla home
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16">
      <div className="container-shell">
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
          <h1 className="text-3xl font-semibold text-neutral-900 md:text-4xl">
            Iscrizione
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            {associationName}
          </p>

          <p className="mt-6 text-sm font-medium text-neutral-500">
            Passaggio {step} di {STEPS.length} —{" "}
            <span className="text-neutral-700">{STEPS[step - 1]}</span>
          </p>

          <form onSubmit={handleSubmit}>
            {step === 1 && (
              <div className="surface mt-6 p-7">
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label htmlFor="nome" className={labelClass}>
                      Nome
                    </label>
                    <input
                      id="nome"
                      className={inputClass}
                      type="text"
                      value={form.nome}
                      onChange={handleText("nome")}
                    />
                    {errors.nome && (
                      <p className={errorClass}>{errors.nome}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="cognome" className={labelClass}>
                      Cognome
                    </label>
                    <input
                      id="cognome"
                      className={inputClass}
                      type="text"
                      value={form.cognome}
                      onChange={handleText("cognome")}
                    />
                    {errors.cognome && (
                      <p className={errorClass}>{errors.cognome}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="dataNascita" className={labelClass}>
                      Data di nascita
                    </label>
                    <input
                      id="dataNascita"
                      className={inputClass}
                      type="date"
                      value={form.dataNascita}
                      onChange={handleText("dataNascita")}
                    />
                    {errors.dataNascita && (
                      <p className={errorClass}>{errors.dataNascita}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="codiceFiscale" className={labelClass}>
                      Codice fiscale
                    </label>
                    <input
                      id="codiceFiscale"
                      className={inputClass}
                      type="text"
                      value={form.codiceFiscale}
                      onChange={handleText("codiceFiscale")}
                    />
                    {errors.codiceFiscale && (
                      <p className={errorClass}>{errors.codiceFiscale}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="email" className={labelClass}>
                      Email
                    </label>
                    <input
                      id="email"
                      className={inputClass}
                      type="email"
                      value={form.email}
                      onChange={handleText("email")}
                    />
                    {errors.email && (
                      <p className={errorClass}>{errors.email}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="telefono" className={labelClass}>
                      Telefono
                    </label>
                    <input
                      id="telefono"
                      className={inputClass}
                      type="tel"
                      value={form.telefono}
                      onChange={handleText("telefono")}
                    />
                    {errors.telefono && (
                      <p className={errorClass}>{errors.telefono}</p>
                    )}
                  </div>
                </div>
                <div className="mt-7 flex justify-end">
                  <button className="btn-primary" type="button" onClick={goNext}>
                    Continua
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="surface mt-6 p-7">
                <div className="grid gap-5">
                  <div>
                    <label htmlFor="documentoIdentita" className={labelClass}>
                      Documento di identità
                    </label>
                    <input
                      id="documentoIdentita"
                      className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-neutral-600`}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFile}
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      PDF, JPG o PNG — dimensione massima 5 MB.
                    </p>
                    {errors.documentoIdentita && (
                      <p className={errorClass}>{errors.documentoIdentita}</p>
                    )}
                  </div>

                  <div className="border-t border-neutral-100 pt-5">
                    <p className="text-sm font-medium text-neutral-700">
                      Consensi obbligatori
                    </p>
                    <div className="mt-4 space-y-3">
                      <label className="flex items-start gap-3">
                        <input
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300"
                          type="checkbox"
                          checked={form.privacy}
                          onChange={handleCheck("privacy")}
                        />
                        <span className="text-sm leading-6 text-neutral-600">
                          Ho letto e accetto l'informativa sulla privacy.
                        </span>
                      </label>
                      {errors.privacy && (
                        <p className={`pl-7 ${errorClass}`}>
                          {errors.privacy}
                        </p>
                      )}
                      <label className="flex items-start gap-3">
                        <input
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300"
                          type="checkbox"
                          checked={form.statuto}
                          onChange={handleCheck("statuto")}
                        />
                        <span className="text-sm leading-6 text-neutral-600">
                          Ho letto e accetto lo statuto dell'associazione.
                        </span>
                      </label>
                      {errors.statuto && (
                        <p className={`pl-7 ${errorClass}`}>
                          {errors.statuto}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-7 flex justify-between">
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={goBack}
                  >
                    Indietro
                  </button>
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

            {step === 3 && (
              <div className="surface mt-6 p-7">
                <p className="text-sm font-medium text-neutral-700">
                  Verifica i dati inseriti prima di inviare la richiesta.
                </p>

                <dl className="mt-5 grid gap-4 border-t border-neutral-100 pt-5 md:grid-cols-2">
                  {[
                    { label: "Nome", value: form.nome },
                    { label: "Cognome", value: form.cognome },
                    { label: "Data di nascita", value: form.dataNascita },
                    { label: "Codice fiscale", value: form.codiceFiscale },
                    { label: "Email", value: form.email },
                    { label: "Telefono", value: form.telefono },
                  ].map((item) => (
                    <div key={item.label}>
                      <dt className="text-xs font-medium text-neutral-500">
                        {item.label}
                      </dt>
                      <dd className="mt-1 text-sm text-neutral-800">
                        {item.value}
                      </dd>
                    </div>
                  ))}
                  <div>
                    <dt className="text-xs font-medium text-neutral-500">
                      Documento
                    </dt>
                    <dd className="mt-1 text-sm text-neutral-800">
                      {form.documentoIdentita?.name ?? "—"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 border-t border-neutral-100 pt-5">
                  <p className="text-xs text-neutral-500">
                    Confermando, dichiari che i dati inseriti sono corretti e
                    accetti le condizioni indicate nei passaggi precedenti.
                  </p>
                </div>

                <div className="mt-7 flex justify-between">
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={goBack}
                  >
                    Indietro
                  </button>
                  <button className="btn-primary" type="submit">
                    Conferma e invia
                  </button>
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
