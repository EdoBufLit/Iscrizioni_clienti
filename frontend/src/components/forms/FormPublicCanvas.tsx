import type { AssociationFormField, PublicAssociationForm } from "../../lib/api";

type FormCanvasForm = Pick<
  PublicAssociationForm,
  | "title"
  | "description"
  | "accent_color"
  | "submit_button_text"
  | "show_logo"
  | "cover_image_url"
  | "page_style"
  | "fields"
> & {
  association?: {
    name: string | null;
  } | null;
};

type FormPublicCanvasProps = {
  form: FormCanvasForm;
  values: Record<string, unknown>;
  onValueChange?: (fieldKey: string, nextValue: unknown) => void;
  onSubmit?: () => void;
  submitting?: boolean;
  interactive?: boolean;
  heroLabel?: string;
};

const baseInputClass =
  "mt-2 w-full rounded-[1.35rem] border border-black/10 bg-white/95 px-4 py-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900/50 focus:ring-2 focus:ring-offset-2";

function getAccentColor(form: FormCanvasForm): string {
  return form.accent_color || "#0f766e";
}

function getPageTheme(pageStyle: string | null | undefined) {
  const style = (pageStyle || "editorial").toLowerCase();
  if (style === "minimal") {
    return {
      shell: "bg-[#fbfaf6]",
      surface: "border border-black/10 bg-white/92 shadow-[0_32px_120px_rgba(15,23,42,0.08)]",
      hero: "bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.12),_transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))]",
      eyebrow: "text-neutral-500",
      title: "font-serif text-[clamp(2.2rem,5vw,3.6rem)] leading-[0.92] tracking-tight text-neutral-950",
      body: "text-neutral-600",
      card: "border border-black/10 bg-white/90",
    };
  }
  if (style === "spotlight") {
    return {
      shell: "bg-[#0b1120]",
      surface: "border border-white/10 bg-white/[0.08] shadow-[0_40px_140px_rgba(2,6,23,0.55)] backdrop-blur-xl",
      hero: "bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.16),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(15,118,110,0.36),_transparent_28%),linear-gradient(135deg,#0f172a,#111827)]",
      eyebrow: "text-white/60",
      title: "font-serif text-[clamp(2.2rem,5vw,3.8rem)] leading-[0.9] tracking-tight text-white",
      body: "text-white/74",
      card: "border border-white/12 bg-white/[0.08]",
    };
  }
  return {
    shell: "bg-[#f5f0e8]",
    surface: "border border-black/10 bg-white/88 shadow-[0_36px_120px_rgba(68,35,14,0.14)] backdrop-blur-xl",
    hero: "bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.16),_transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(250,245,238,0.94))]",
    eyebrow: "text-neutral-500",
    title: "font-serif text-[clamp(2.4rem,5vw,4rem)] leading-[0.9] tracking-tight text-neutral-950",
    body: "text-neutral-700",
    card: "border border-black/10 bg-white/90",
  };
}

function renderField(props: {
  field: AssociationFormField;
  value: unknown;
  interactive: boolean;
  accentColor: string;
  onValueChange?: (fieldKey: string, nextValue: unknown) => void;
}) {
  const { field, value, interactive, accentColor, onValueChange } = props;
  const disabled = !interactive;
  const commonFocusStyle = interactive ? { focusRingColor: accentColor } : undefined;
  void commonFocusStyle;

  if (field.field_type === "long_text") {
    return (
      <label key={field.id} className="block text-sm font-semibold text-neutral-800">
        {field.label}
        <textarea
          className={`${baseInputClass} min-h-[132px]`}
          required={field.is_required}
          disabled={disabled}
          placeholder={field.placeholder || ""}
          value={String(value || "")}
          onChange={(event) => onValueChange?.(field.field_key, event.target.value)}
        />
        {field.help_text ? <span className="mt-2 block text-xs font-medium text-neutral-500">{field.help_text}</span> : null}
      </label>
    );
  }

  if (field.field_type === "select") {
    return (
      <label key={field.id} className="block text-sm font-semibold text-neutral-800">
        {field.label}
        <select
          className={baseInputClass}
          required={field.is_required}
          disabled={disabled}
          value={String(value || "")}
          onChange={(event) => onValueChange?.(field.field_key, event.target.value)}
        >
          <option value="">Seleziona</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {field.help_text ? <span className="mt-2 block text-xs font-medium text-neutral-500">{field.help_text}</span> : null}
      </label>
    );
  }

  if (field.field_type === "radio") {
    return (
      <fieldset key={field.id} className="rounded-[1.5rem] border border-black/10 bg-white/80 p-4">
        <legend className="px-1 text-sm font-semibold text-neutral-800">{field.label}</legend>
        <div className="mt-3 grid gap-2">
          {field.options.map((option) => (
            <label key={option} className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white/80 px-3 py-3 text-sm text-neutral-700">
              <input
                type="radio"
                name={field.field_key}
                disabled={disabled}
                checked={String(value || "") === option}
                onChange={() => onValueChange?.(field.field_key, option)}
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
      <fieldset key={field.id} className="rounded-[1.5rem] border border-black/10 bg-white/80 p-4">
        <legend className="px-1 text-sm font-semibold text-neutral-800">{field.label}</legend>
        <div className="mt-3 grid gap-2">
          {field.options.map((option) => (
            <label key={option} className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white/80 px-3 py-3 text-sm text-neutral-700">
              <input
                type="checkbox"
                disabled={disabled}
                checked={selected.includes(option)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option);
                  onValueChange?.(field.field_key, next);
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
      <label key={field.id} className="flex items-start gap-3 rounded-[1.5rem] border border-black/10 bg-white/82 px-4 py-4 text-sm text-neutral-700">
        <input
          type="checkbox"
          className="mt-1"
          disabled={disabled}
          checked={Boolean(value)}
          onChange={(event) => onValueChange?.(field.field_key, event.target.checked)}
          required={field.is_required}
        />
        <span>
          <span className="font-semibold text-neutral-900">{field.label}</span>
          {field.help_text ? <span className="mt-1 block text-xs font-medium text-neutral-500">{field.help_text}</span> : null}
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
    <label key={field.id} className="block text-sm font-semibold text-neutral-800">
      {field.label}
      <input
        className={baseInputClass}
        type={inputType}
        required={field.is_required}
        disabled={disabled}
        placeholder={field.placeholder || ""}
        value={String(value || "")}
        onChange={(event) => onValueChange?.(field.field_key, event.target.value)}
      />
      {field.help_text ? <span className="mt-2 block text-xs font-medium text-neutral-500">{field.help_text}</span> : null}
    </label>
  );
}

export function FormPublicCanvas({
  form,
  values,
  onValueChange,
  onSubmit,
  submitting = false,
  interactive = false,
  heroLabel = "Pagina pubblica",
}: FormPublicCanvasProps) {
  const accentColor = getAccentColor(form);
  const theme = getPageTheme(form.page_style);
  const sortedFields = [...form.fields].sort((left, right) => left.sort_order - right.sort_order);
  const surfaceStyle = {
    borderColor: `${accentColor}33`,
    boxShadow: `0 36px 120px ${accentColor}22`,
  } as const;
  const accentStyle = { backgroundColor: accentColor, color: "#ffffff" } as const;
  const ringStyle = { boxShadow: `0 0 0 4px ${accentColor}22` } as const;

  return (
    <div className={`relative overflow-hidden rounded-[2rem] ${theme.shell} p-3 md:p-4`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.35),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.08),transparent_34%)]" />
      <div className={`relative overflow-hidden rounded-[1.8rem] ${theme.surface}`} style={surfaceStyle}>
        {form.cover_image_url ? (
          <div
            className="h-44 w-full bg-cover bg-center md:h-56"
            style={{ backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.12), rgba(15,23,42,0.34)), url(${form.cover_image_url})` }}
          />
        ) : null}
        <div className={`relative px-5 py-6 md:px-8 md:py-8 ${theme.hero}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className={`text-[11px] font-bold uppercase tracking-[0.28em] ${theme.eyebrow}`}>{heroLabel}</p>
              <h1 className={`mt-3 ${theme.title}`}>{form.title}</h1>
              {form.description ? (
                <p className={`mt-4 max-w-2xl text-sm leading-7 md:text-base ${theme.body}`}>{form.description}</p>
              ) : null}
            </div>
            {form.show_logo ? (
              <div className="rounded-full border border-white/40 bg-white/80 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-neutral-700 shadow-sm backdrop-blur">
                {form.association?.name || "ASSONAM"}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 px-5 py-6 md:px-8 md:py-8 lg:grid-cols-[minmax(0,1fr)_260px]">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit?.();
            }}
          >
            {sortedFields.length === 0 ? (
              <div className={`rounded-[1.6rem] ${theme.card} px-5 py-8 text-sm text-neutral-500`} style={ringStyle}>
                Aggiungi i primi campi dal builder per vedere qui la pagina pubblica completa.
              </div>
            ) : (
              sortedFields.map((field) =>
                renderField({
                  field,
                  value: values[field.field_key],
                  interactive,
                  accentColor,
                  onValueChange,
                }),
              )
            )}

            <button
              className="inline-flex min-h-[54px] items-center justify-center rounded-full px-6 text-sm font-bold tracking-[0.18em] uppercase shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting || !interactive}
              style={accentStyle}
              type="submit"
            >
              {submitting ? "Invio in corso..." : form.submit_button_text || "Invia richiesta"}
            </button>
          </form>

          <aside className={`rounded-[1.6rem] ${theme.card} p-4 md:p-5`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-neutral-500">Snapshot pubblico</p>
            <div className="mt-4 space-y-3 text-sm text-neutral-600">
              <div className="rounded-2xl border border-black/5 bg-white/70 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Stile</p>
                <p className="mt-1 font-semibold text-neutral-900">{form.page_style || "editorial"}</p>
              </div>
              <div className="rounded-2xl border border-black/5 bg-white/70 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Campi</p>
                <p className="mt-1 font-semibold text-neutral-900">{sortedFields.length}</p>
              </div>
              <div className="rounded-2xl border border-black/5 bg-white/70 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">CTA</p>
                <p className="mt-1 font-semibold text-neutral-900">{form.submit_button_text || "Invia richiesta"}</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
