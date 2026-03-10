import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchPublicForm, submitPublicForm, type PublicAssociationForm } from "../lib/api";
import { applySeo } from "../lib/seo";

const inputClass =
  "mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";

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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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
    <div className="container-shell py-12">
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-gradient-to-br from-white via-neutral-50 to-brand/5 shadow-[0_30px_80px_rgba(15,23,42,0.08)]">
          <div className="border-b border-neutral-200 px-6 py-8 md:px-10">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand/70">Form pubblico</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-900">
              {form?.title || "Caricamento form"}
            </h1>
            {form?.association?.name ? (
              <p className="mt-2 text-sm text-neutral-500">Associazione: {form.association.name}</p>
            ) : null}
            {form?.description ? (
              <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-600">{form.description}</p>
            ) : null}
          </div>

          <div className="px-6 py-8 md:px-10">
            {loading ? (
              <div className="space-y-3 text-sm text-neutral-500">Caricamento modulo...</div>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : successMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5">
                <h2 className="text-lg font-semibold text-emerald-800">Invio completato</h2>
                <p className="mt-2 text-sm text-emerald-700">{successMessage}</p>
              </div>
            ) : form ? (
              <form className="space-y-5" onSubmit={handleSubmit}>
                {form.fields
                  .slice()
                  .sort((left, right) => left.sort_order - right.sort_order)
                  .map((field) => {
                    const value = values[field.field_key];
                    if (field.field_type === "long_text") {
                      return (
                        <label key={field.id} className="block text-sm font-medium text-neutral-700">
                          {field.label}
                          <textarea
                            className={`${inputClass} min-h-[120px]`}
                            required={field.is_required}
                            placeholder={field.placeholder || ""}
                            value={String(value || "")}
                            onChange={(event) => updateValue(field.field_key, event.target.value)}
                          />
                          {field.help_text ? <span className="mt-1 block text-xs text-neutral-500">{field.help_text}</span> : null}
                        </label>
                      );
                    }
                    if (field.field_type === "select") {
                      return (
                        <label key={field.id} className="block text-sm font-medium text-neutral-700">
                          {field.label}
                          <select
                            className={inputClass}
                            required={field.is_required}
                            value={String(value || "")}
                            onChange={(event) => updateValue(field.field_key, event.target.value)}
                          >
                            <option value="">Seleziona</option>
                            {field.options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          {field.help_text ? <span className="mt-1 block text-xs text-neutral-500">{field.help_text}</span> : null}
                        </label>
                      );
                    }
                    if (field.field_type === "radio") {
                      return (
                        <fieldset key={field.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                          <legend className="px-1 text-sm font-medium text-neutral-700">{field.label}</legend>
                          <div className="mt-3 space-y-2">
                            {field.options.map((option) => (
                              <label key={option} className="flex items-center gap-3 text-sm text-neutral-700">
                                <input
                                  type="radio"
                                  name={field.field_key}
                                  checked={String(value || "") === option}
                                  onChange={() => updateValue(field.field_key, option)}
                                  required={field.is_required}
                                />
                                {option}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      );
                    }
                    if (field.field_type === "checkbox") {
                      const selected = Array.isArray(value) ? value.map(String) : [];
                      return (
                        <fieldset key={field.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                          <legend className="px-1 text-sm font-medium text-neutral-700">{field.label}</legend>
                          <div className="mt-3 space-y-2">
                            {field.options.map((option) => (
                              <label key={option} className="flex items-center gap-3 text-sm text-neutral-700">
                                <input
                                  type="checkbox"
                                  checked={selected.includes(option)}
                                  onChange={(event) => {
                                    const next = event.target.checked
                                      ? [...selected, option]
                                      : selected.filter((item) => item !== option);
                                    updateValue(field.field_key, next);
                                  }}
                                />
                                {option}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      );
                    }
                    if (field.field_type === "consent") {
                      return (
                        <label key={field.id} className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={Boolean(value)}
                            onChange={(event) => updateValue(field.field_key, event.target.checked)}
                            required={field.is_required}
                          />
                          <span>
                            <span className="font-medium text-neutral-900">{field.label}</span>
                            {field.help_text ? <span className="mt-1 block text-xs text-neutral-500">{field.help_text}</span> : null}
                          </span>
                        </label>
                      );
                    }

                    const inputType =
                      field.field_type === "email"
                        ? "email"
                        : field.field_type === "phone"
                          ? "tel"
                          : field.field_type === "number"
                            ? "number"
                            : field.field_type === "date"
                              ? "date"
                              : "text";

                    return (
                      <label key={field.id} className="block text-sm font-medium text-neutral-700">
                        {field.label}
                        <input
                          className={inputClass}
                          type={inputType}
                          required={field.is_required}
                          placeholder={field.placeholder || ""}
                          value={String(value || "")}
                          onChange={(event) => updateValue(field.field_key, event.target.value)}
                        />
                        {field.help_text ? <span className="mt-1 block text-xs text-neutral-500">{field.help_text}</span> : null}
                      </label>
                    );
                  })}

                <button className="btn-primary w-full justify-center" disabled={submitting} type="submit">
                  {submitting ? "Invio in corso..." : "Invia richiesta"}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicFormPage;
