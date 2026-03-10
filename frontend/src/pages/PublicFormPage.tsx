import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchPublicForm, submitPublicForm, type PublicAssociationForm } from "../lib/api";
import { applySeo } from "../lib/seo";
import { FormPublicCanvas } from "../components/forms/FormPublicCanvas";

function buildInitialValues(form: PublicAssociationForm): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of form.fields) {
    if (field.field_type === "checkbox") values[field.field_key] = [];
    else if (field.field_type === "consent") values[field.field_key] = false;
    else values[field.field_key] = "";
  }
  return values;
}

const PublicFormPage = () => {
  const { orgSlug, slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<PublicAssociationForm | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError("");
    setSuccessMessage("");
    fetchPublicForm(orgSlug || slug, orgSlug ? slug : undefined)
      .then((response) => {
        setForm(response.form);
        setValues(buildInitialValues(response.form));
        applySeo({
          title: `${response.form.title} | ${response.form.association.name || "ASSONAM"}`,
          description: response.form.description || "Modulo pubblico dinamico ASSONAM.",
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Form non disponibile.");
      })
      .finally(() => setLoading(false));
  }, [orgSlug, slug]);

  function updateValue(fieldKey: string, nextValue: unknown) {
    setValues((current) => ({ ...current, [fieldKey]: nextValue }));
  }

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!slug || !form) return;
    setSubmitting(true);
    setError("");
    try {
      const response = orgSlug
        ? await submitPublicForm(orgSlug, slug, values)
        : await submitPublicForm(slug, values);
      setSuccessMessage(response.message);
      setValues(buildInitialValues(form));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invio non riuscito.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.88),_rgba(239,231,220,0.96)_40%,_rgba(225,214,198,1))] px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl">
        {loading ? (
          <div className="rounded-[2rem] border border-black/10 bg-white/80 px-6 py-12 text-sm text-neutral-500 shadow-[0_30px_100px_rgba(15,23,42,0.08)]">
            Caricamento pagina del form...
          </div>
        ) : error ? (
          <div className="rounded-[2rem] border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">
            {error}
          </div>
        ) : successMessage && form ? (
          <div className="space-y-5">
            <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 px-6 py-6 text-emerald-900 shadow-[0_24px_80px_rgba(16,185,129,0.12)]">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-700">Invio completato</p>
              <h1 className="mt-3 font-serif text-4xl leading-none">{form.title}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7">{successMessage}</p>
            </div>
            <button
              className="inline-flex rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-neutral-800 shadow-sm transition hover:-translate-y-0.5"
              type="button"
              onClick={() => setSuccessMessage("")}
            >
              Invia una nuova risposta
            </button>
          </div>
        ) : form ? (
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
              <div className="rounded-[2rem] border border-black/10 bg-white/82 px-6 py-5 shadow-[0_24px_80px_rgba(15,23,42,0.06)] backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-neutral-500">Pagina modulo</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-neutral-950 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
                    {form.visibility === "members_only" ? "Solo soci" : "Pubblico"}
                  </span>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-600">
                    {form.fields.length} campi
                  </span>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-600">
                    {form.association.name || "Associazione"}
                  </span>
                </div>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-neutral-600">
                  Stai compilando una vera pagina pubblica dell'associazione. Tutte le risposte vengono registrate nel backoffice e seguono le automazioni configurate dal form.
                </p>
              </div>
              <div className="rounded-[2rem] border border-black/10 bg-[#101826] px-6 py-5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/55">Dopo l'invio</p>
                <div className="mt-4 space-y-3 text-sm text-white/78">
                  <p>La risposta viene salvata subito nello storico interno dell'associazione.</p>
                  <p>Se previsto dal workflow, partono anche email di conferma o notifiche alla segreteria.</p>
                  <p>{form.visibility === "members_only" ? "Questa pagina e pensata per soci autenticati o contesti riservati." : "Questa pagina puo essere condivisa liberamente via sito, email, social o QR."}</p>
                </div>
              </div>
            </div>
            <FormPublicCanvas
              form={form}
              values={values}
              onValueChange={updateValue}
              onSubmit={() => void handleSubmit()}
              submitting={submitting}
              interactive
              heroLabel={form.visibility === "members_only" ? "Form riservato ai soci" : "Pagina pubblica"}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PublicFormPage;
