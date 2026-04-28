import type { AssociationFormField, PublicAssociationForm } from "../../lib/api";
import { decodeField } from "./builder/utils";

type FormCanvasForm = Pick<
  PublicAssociationForm,
  | "title"
  | "description"
  | "accent_color"
  | "submit_button_text"
  | "show_logo"
  | "cover_image_url"
  | "page_style"
  | "visibility"
  | "fields"
> & {
  association?: {
    name: string | null;
  } | null;
  is_active?: boolean;
};

type FormPublicCanvasProps = {
  form: FormCanvasForm;
  values: Record<string, unknown>;
  onValueChange?: (fieldKey: string, nextValue: unknown) => void;
  onSubmit?: () => void;
  submitting?: boolean;
  interactive?: boolean;
};

type PageTheme = ReturnType<typeof getPageTheme>;

const baseInputClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand/40 focus:ring-2 focus:ring-brand/10 shadow-sm";

function getAccentColor(form: FormCanvasForm): string {
  return form.accent_color || "#0f766e";
}

function getPageTheme(pageStyle: string | null | undefined) {
  const style = (pageStyle || "editorial").toLowerCase();
  if (style === "minimal") {
    return {
      shell: "bg-white",
      surface: "bg-white",
      hero: "bg-neutral-50/50 border-b border-neutral-100",
      title: "font-sans text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-neutral-900",
      body: "text-neutral-500",
      card: "",
    };
  }
  if (style === "spotlight") {
    return {
      shell: "bg-[#0b1120]",
      surface: "bg-[#0b1120] text-white",
      hero: "bg-gradient-to-br from-white/10 to-transparent border-b border-white/10",
      title: "font-sans text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white",
      body: "text-white/70",
      card: "bg-white/5 border border-white/10 rounded-2xl p-6",
    };
  }
  // Editorial
  return {
    shell: "bg-[#FDFBF7]",
    surface: "bg-[#FDFBF7]",
    hero: "bg-transparent",
    title: "font-serif text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-neutral-900",
    body: "text-neutral-600 font-serif",
    card: "bg-white border border-neutral-200/60 rounded-xl p-6 shadow-sm",
  };
}

function renderField(props: {
  field: AssociationFormField;
  value: unknown;
  interactive: boolean;
  accentColor: string;
  theme: PageTheme;
  onValueChange?: (fieldKey: string, nextValue: unknown) => void;
}) {
  const { field: rawField, value, interactive, accentColor, theme, onValueChange } = props;
  const disabled = !interactive;
  
  // Decode field to get virtual type and metadata (width, hideLabel)
  const decoded = decodeField(rawField);
  const containerStyle = decoded.width === "50%" ? { width: "calc(50% - 0.5rem)", display: "inline-block" } : { width: "100%" };
  
  // Use spotlight classes if we are in spotlight
  const isSpotlight = theme.shell.includes("0b1120");
  const inputClass = isSpotlight 
    ? "mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-white/40 focus:ring-2 focus:ring-white/10"
    : baseInputClass;

  const labelColor = isSpotlight ? "text-white/90" : "text-neutral-800";
  const helpColor = isSpotlight ? "text-white/50" : "text-neutral-500";

  // Render Virtual Types
  if (decoded.type === "section_title") {
    return (
      <div key={decoded.key} style={containerStyle} className="pt-6 pb-2">
        <h3 className={`text-xl font-bold ${labelColor} ${theme.title.includes("serif") ? "font-serif" : "font-sans"}`}>
          {decoded.label}
        </h3>
      </div>
    );
  }
  if (decoded.type === "free_text") {
    return (
      <div key={decoded.key} style={containerStyle} className="py-2">
        <p className={`text-[15px] leading-relaxed whitespace-pre-wrap ${helpColor}`}>
          {decoded.helpText}
        </p>
      </div>
    );
  }
  if (decoded.type === "divider") {
    return <hr key={decoded.key} style={containerStyle} className={`my-6 ${isSpotlight ? "border-white/10" : "border-neutral-200"}`} />;
  }
  if (decoded.type === "spacer") {
    return <div key={decoded.key} style={containerStyle} className="h-10" />;
  }

  // Render Standard Inputs
  const renderLabel = () => {
    if (decoded.hideLabel) return null;
    return (
      <span className={`block text-sm font-semibold mb-1 ${labelColor}`}>
        {decoded.label} {decoded.required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
    );
  };

  const renderHelpText = () => {
    if (!decoded.helpText) return null;
    return <span className={`mt-1.5 block text-xs font-medium ${helpColor}`}>{decoded.helpText}</span>;
  };

  if (decoded.type === "long_text") {
    return (
      <label key={decoded.key} style={containerStyle} className="block">
        {renderLabel()}
        <textarea
          className={`${inputClass} min-h-[120px]`}
          required={decoded.required}
          disabled={disabled}
          placeholder={decoded.placeholder}
          value={String(value || "")}
          onChange={(event) => onValueChange?.(decoded.key, event.target.value)}
        />
        {renderHelpText()}
      </label>
    );
  }

  if (decoded.type === "select") {
    const options = decoded.optionsText.split(",").map((s) => s.trim()).filter(Boolean);
    return (
      <label key={decoded.key} style={containerStyle} className="block">
        {renderLabel()}
        <select
          className={inputClass}
          required={decoded.required}
          disabled={disabled}
          value={String(value || "")}
          onChange={(event) => onValueChange?.(decoded.key, event.target.value)}
        >
          <option value="">Seleziona</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {renderHelpText()}
      </label>
    );
  }

  const optionCardClass = isSpotlight
    ? "border border-white/10 bg-white/5 text-white/90 hover:bg-white/10"
    : "border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300";

  if (decoded.type === "rating_1_5" || decoded.type === "nps_0_10") {
    const options = decoded.optionsText.split(",").map((s) => s.trim()).filter(Boolean);
    const minimumLabel = decoded.type === "rating_1_5" ? "Per niente soddisfatto" : "Per niente probabile";
    const maximumLabel = decoded.type === "rating_1_5" ? "Molto soddisfatto" : "Estremamente probabile";
    return (
      <fieldset key={decoded.key} style={containerStyle} className="block">
        {!decoded.hideLabel && (
          <legend className={`text-sm font-semibold mb-3 ${labelColor}`}>
            {decoded.label} {decoded.required && <span className="text-red-500 ml-0.5">*</span>}
          </legend>
        )}
        <div className={`grid gap-2 ${decoded.type === "nps_0_10" ? "grid-cols-6 sm:grid-cols-11" : "grid-cols-5"}`}>
          {options.map((option) => {
            const selected = String(value || "") === option;
            return (
              <label
                key={option}
                className={`flex h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold transition-colors ${
                  selected
                    ? "border-transparent text-white"
                    : optionCardClass
                }`}
                style={selected && !isSpotlight ? { backgroundColor: accentColor } : undefined}
              >
                <input
                  type="radio"
                  name={decoded.key}
                  disabled={disabled}
                  checked={selected}
                  onChange={() => onValueChange?.(decoded.key, option)}
                  required={decoded.required}
                  className="sr-only"
                />
                {option}
              </label>
            );
          })}
        </div>
        <div className={`mt-2 flex justify-between text-xs ${helpColor}`}>
          <span>{minimumLabel}</span>
          <span>{maximumLabel}</span>
        </div>
        {renderHelpText()}
      </fieldset>
    );
  }

  if (decoded.type === "radio") {
    const options = decoded.optionsText.split(",").map((s) => s.trim()).filter(Boolean);
    return (
      <fieldset key={decoded.key} style={containerStyle} className="block">
        {!decoded.hideLabel && (
          <legend className={`text-sm font-semibold mb-2 ${labelColor}`}>
            {decoded.label} {decoded.required && <span className="text-red-500 ml-0.5">*</span>}
          </legend>
        )}
        <div className="grid gap-2">
          {options.map((option) => (
            <label key={option} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors cursor-pointer ${optionCardClass}`}>
              <input
                type="radio"
                name={decoded.key}
                disabled={disabled}
                checked={String(value || "") === option}
                onChange={() => onValueChange?.(decoded.key, option)}
                required={decoded.required}
                className="w-4 h-4 text-brand bg-transparent"
                style={!isSpotlight ? { accentColor } : {}}
              />
              {option}
            </label>
          ))}
        </div>
        {renderHelpText()}
      </fieldset>
    );
  }

  if (decoded.type === "checkbox") {
    const options = decoded.optionsText.split(",").map((s) => s.trim()).filter(Boolean);
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <fieldset key={decoded.key} style={containerStyle} className="block">
        {!decoded.hideLabel && (
          <legend className={`text-sm font-semibold mb-2 ${labelColor}`}>
            {decoded.label} {decoded.required && <span className="text-red-500 ml-0.5">*</span>}
          </legend>
        )}
        <div className="grid gap-2">
          {options.map((option) => (
            <label key={option} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors cursor-pointer ${optionCardClass}`}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={selected.includes(option)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option);
                  onValueChange?.(decoded.key, next);
                }}
                className="w-4 h-4 rounded text-brand bg-transparent"
                style={!isSpotlight ? { accentColor } : {}}
              />
              {option}
            </label>
          ))}
        </div>
        {renderHelpText()}
      </fieldset>
    );
  }

  if (decoded.type === "consent") {
    return (
      <label key={decoded.key} style={containerStyle} className={`flex items-start gap-3 rounded-xl px-4 py-4 text-sm cursor-pointer transition-colors ${optionCardClass}`}>
        <input
          type="checkbox"
          className="mt-1 w-4 h-4 rounded text-brand bg-transparent"
          disabled={disabled}
          checked={Boolean(value)}
          onChange={(event) => onValueChange?.(decoded.key, event.target.checked)}
          required={decoded.required}
          style={!isSpotlight ? { accentColor } : {}}
        />
        <span>
          <span className={`font-semibold ${labelColor}`}>{decoded.label}</span>
          {decoded.helpText ? <span className={`mt-1 block text-xs font-medium ${helpColor}`}>{decoded.helpText}</span> : null}
        </span>
      </label>
    );
  }

  if (decoded.type === "file_upload") {
    return (
      <label key={decoded.key} style={containerStyle} className="block">
        {renderLabel()}
        <input
          className={inputClass}
          type="file"
          required={decoded.required}
          disabled={disabled}
          onChange={() => {
            onValueChange?.(decoded.key, "File caricato");
          }}
        />
        {renderHelpText()}
      </label>
    );
  }

  const inputType =
    decoded.type === "email"
      ? "email"
      : decoded.type === "phone"
        ? "tel"
        : decoded.type === "number"
          ? "number"
          : decoded.type === "date"
            ? "date"
            : "text";

  return (
    <label key={decoded.key} style={containerStyle} className="block">
      {renderLabel()}
      <input
        className={inputClass}
        type={inputType}
        required={decoded.required}
        disabled={disabled}
        placeholder={decoded.placeholder || ""}
        value={String(value || "")}
        onChange={(event) => onValueChange?.(decoded.key, event.target.value)}
      />
      {renderHelpText()}
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
}: FormPublicCanvasProps) {
  const accentColor = getAccentColor(form);
  const theme = getPageTheme(form.page_style);
  const sortedFields = [...form.fields].sort((left, right) => left.sort_order - right.sort_order);

  // Dynamic styles
  const btnStyle = { backgroundColor: accentColor, color: "#ffffff" };
  const customFocusStyle = `
    .form-public-canvas-container input:focus,
    .form-public-canvas-container select:focus,
    .form-public-canvas-container textarea:focus {
      border-color: ${accentColor}88 !important;
      box-shadow: 0 0 0 3px ${accentColor}22 !important;
    }
  `;

  return (
    <div className={`form-public-canvas-container w-full min-h-full ${theme.shell} transition-colors duration-300`}>
      <style>{customFocusStyle}</style>
      
      {/* Cover Image */}
      {form.cover_image_url && (
        <div className="w-full h-48 md:h-64 relative">
          <img src={form.cover_image_url} alt="Cover" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/40"></div>
        </div>
      )}

      {/* Hero Section */}
      <div className={`${theme.hero} px-6 py-10 md:py-16 text-center`}>
        <div className="max-w-3xl mx-auto flex flex-col items-center">
          {form.show_logo && form.association?.name && (
            <div className="mb-6 inline-flex max-w-full items-center justify-center rounded-2xl border border-neutral-100 bg-white px-5 py-3 text-sm font-semibold text-neutral-900 shadow-sm">
              <span className="truncate">{form.association.name}</span>
            </div>
          )}
          <h1 className={theme.title}>{form.title}</h1>
          {form.description && (
            <p className={`mt-5 text-sm md:text-base max-w-2xl mx-auto leading-relaxed ${theme.body}`}>
              {form.description}
            </p>
          )}
        </div>
      </div>

      {/* Form Content */}
      <div className={`max-w-3xl mx-auto px-6 py-8 md:py-12 ${theme.surface}`}>
        <form
          className={`flex flex-wrap gap-y-6 gap-x-4 ${theme.card}`}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit?.();
          }}
        >
          {sortedFields.length === 0 ? (
            <div className="w-full text-center py-12 text-sm opacity-60">
              Il form non contiene ancora nessun campo.
            </div>
          ) : (
            sortedFields.map((field) =>
              renderField({
                field,
                value: values[field.field_key],
                interactive,
                accentColor,
                theme,
                onValueChange,
              }),
            )
          )}

          {sortedFields.length > 0 && (
            <div className="w-full mt-6 pt-6 border-t border-neutral-200/50 flex justify-center">
              <button
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl text-sm font-bold shadow-md transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                disabled={submitting || !interactive}
                style={btnStyle}
                type="submit"
              >
                {submitting ? "Invio in corso..." : form.submit_button_text || "Invia richiesta"}
              </button>
            </div>
          )}
        </form>
        
        {/* Footer info */}
        <div className="mt-12 text-center text-xs opacity-50 pb-8">
           Modulo gestito tramite <strong>ASSONAM</strong>
        </div>
      </div>
    </div>
  );
}
