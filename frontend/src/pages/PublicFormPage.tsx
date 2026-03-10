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
  const { slug } = useParams();
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
    fetchPublicForm(slug)
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
  }, [slug]);

  function updateValue(fieldKey: string, nextValue: unknown) {
    setValues((current) => ({ ...current, [fieldKey]: nextValue }));
  }

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!slug || !form) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await submitPublicForm(slug, values);
      setSuccessMessage(response.message);
      setValues(buildInitialValues(form));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invio non riuscito.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#efe7dc] px-4 py-6 md:px-8 md:py-10">
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
          <FormPublicCanvas
            form={form}
            values={values}
            onValueChange={updateValue}
            onSubmit={() => void handleSubmit()}
            submitting={submitting}
            interactive
            heroLabel={form.visibility === "members_only" ? "Form riservato ai soci" : "Pagina pubblica"}
          />
        ) : null}
      </div>
    </div>
  );
};

export default PublicFormPage;
