import type { CSSProperties } from "react";
import type { AssociationFormField, OrgAdminBookingEventSeries, PublicAssociationForm } from "../../lib/api";
import { decodeField, isBookingBlockField } from "./builder/utils";

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
  | "booking_dynamic_events_enabled"
  | "booking_enabled"
  | "create_booking"
  | "form_type"
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
  bookingEvents?: OrgAdminBookingEventSeries[];
  bookingEventsLoading?: boolean;
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
      card: "border rounded-2xl p-6",
    };
  }
  // Editorial
  return {
    shell: "bg-[#FDFBF7]",
    surface: "bg-[#FDFBF7]",
    hero: "bg-transparent",
    title: "font-serif text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-neutral-900",
    body: "text-neutral-600 font-serif",
    card: "border rounded-xl p-6",
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
      <div
        key={decoded.key}
        style={containerStyle}
        className="form-public-canvas__section-title-block border-l-4 py-2 pl-4"
      >
        <h3 className={`form-public-canvas__section-title text-xl font-bold ${labelColor} ${theme.title.includes("serif") ? "font-serif" : "font-sans"}`}>
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
    return <hr key={decoded.key} style={containerStyle} className="form-public-canvas__divider my-6" />;
  }
  if (decoded.type === "spacer") {
    return <div key={decoded.key} style={containerStyle} className="h-10" />;
  }

  // Render Standard Inputs
  const renderLabel = () => {
    if (decoded.hideLabel) return null;
    return (
      <span className={`block text-sm font-semibold mb-1 ${labelColor}`}>
        <span className="form-public-canvas__label">{decoded.label}</span>
        {decoded.required && <span className="form-public-canvas__required ml-0.5">*</span>}
      </span>
    );
  };

  const renderHelpText = () => {
    if (!decoded.helpText) return null;
    return <span className={`mt-1.5 block text-xs font-medium ${helpColor}`}>{decoded.helpText}</span>;
  };

  if (decoded.type === "long_text") {
    return (
      <label key={decoded.key} style={containerStyle} className="form-public-canvas__field block">
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
      <label key={decoded.key} style={containerStyle} className="form-public-canvas__field block">
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
            <span className="form-public-canvas__label">{decoded.label}</span>
            {decoded.required && <span className="form-public-canvas__required ml-0.5">*</span>}
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
            <span className="form-public-canvas__label">{decoded.label}</span>
            {decoded.required && <span className="form-public-canvas__required ml-0.5">*</span>}
          </legend>
        )}
        <div className="grid gap-2">
          {options.map((option) => (
            <label key={option} className={`form-public-canvas__option flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors cursor-pointer ${optionCardClass}`}>
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
            <span className="form-public-canvas__label">{decoded.label}</span>
            {decoded.required && <span className="form-public-canvas__required ml-0.5">*</span>}
          </legend>
        )}
        <div className="grid gap-2">
          {options.map((option) => (
            <label key={option} className={`form-public-canvas__option flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors cursor-pointer ${optionCardClass}`}>
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
      <label key={decoded.key} style={containerStyle} className={`form-public-canvas__option flex items-start gap-3 rounded-xl px-4 py-4 text-sm cursor-pointer transition-colors ${optionCardClass}`}>
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
          <span className={`form-public-canvas__label font-semibold ${labelColor}`}>{decoded.label}</span>
          {decoded.helpText ? <span className={`mt-1 block text-xs font-medium ${helpColor}`}>{decoded.helpText}</span> : null}
        </span>
      </label>
    );
  }

  if (decoded.type === "file_upload") {
    return (
      <label key={decoded.key} style={containerStyle} className="form-public-canvas__field block">
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
            : decoded.type === "time"
              ? "time"
            : "text";

  return (
    <label key={decoded.key} style={containerStyle} className="form-public-canvas__field block">
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
  bookingEvents = [],
  bookingEventsLoading = false,
}: FormPublicCanvasProps) {
  const accentColor = getAccentColor(form);
  const theme = getPageTheme(form.page_style);
  const pageStyle = (form.page_style || "editorial").toLowerCase();
  const sortedFields = [...form.fields].sort((left, right) => left.sort_order - right.sort_order);
  const showDynamicBookingFields = Boolean(
    form.booking_dynamic_events_enabled && (form.booking_enabled || form.create_booking || form.form_type === "booking"),
  );
  const hasBookingBlockField = sortedFields.some((field) => isBookingBlockField(field));
  const selectedTime = String(values.__booking_event_time || "");
  const timeSlots = Array.from(new Set(
    bookingEvents.flatMap((eventItem) =>
      (eventItem.time_slots || [])
        .filter((slot) => slot.is_active !== false)
        .map((slot) => String(slot.time || slot.start_time || "").slice(0, 5))
        .filter(Boolean),
    ),
  )).sort();
  const matchingSeriesForTime = selectedTime
    ? bookingEvents.filter((eventItem) =>
        (eventItem.time_slots || []).some((slot) =>
          slot.is_active !== false && String(slot.time || slot.start_time || "").slice(0, 5) === selectedTime,
        )
      )
    : [];
  const canvasStyle = { "--form-accent": accentColor } as CSSProperties;

  // Dynamic styles
  const btnStyle = {
    backgroundColor: accentColor,
    color: "#ffffff",
    boxShadow: "0 18px 38px -24px var(--form-accent)",
  };
  const customFocusStyle = `
    .form-public-canvas-container {
      color-scheme: light;
    }

    .form-public-canvas-container[data-page-style="spotlight"] {
      color-scheme: dark;
    }

    .form-public-canvas-container:not([data-page-style="spotlight"]) input:not([type="checkbox"]):not([type="radio"]),
    .form-public-canvas-container:not([data-page-style="spotlight"]) select,
    .form-public-canvas-container:not([data-page-style="spotlight"]) textarea,
    .org-admin-v2 .form-public-canvas-container:not([data-page-style="spotlight"]) input:not([type="checkbox"]):not([type="radio"]),
    .org-admin-v2 .form-public-canvas-container:not([data-page-style="spotlight"]) select,
    .org-admin-v2 .form-public-canvas-container:not([data-page-style="spotlight"]) textarea {
      border-color: rgba(17, 24, 39, 0.12) !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #111827 !important;
      -webkit-text-fill-color: #111827 !important;
      caret-color: #111827 !important;
      color-scheme: light !important;
    }

    .form-public-canvas-container:not([data-page-style="spotlight"]) .form-public-canvas__option,
    .org-admin-v2 .form-public-canvas-container:not([data-page-style="spotlight"]) .form-public-canvas__option {
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #374151 !important;
      -webkit-text-fill-color: #374151 !important;
      color-scheme: light !important;
    }

    :root[data-theme="dark"] .form-public-canvas-container:not([data-page-style="spotlight"]) input:not([type="checkbox"]):not([type="radio"]),
    :root[data-theme="dark"] .form-public-canvas-container:not([data-page-style="spotlight"]) select,
    :root[data-theme="dark"] .form-public-canvas-container:not([data-page-style="spotlight"]) textarea,
    :root[data-theme="dark"] .form-public-canvas-container:not([data-page-style="spotlight"]) .form-public-canvas__option {
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #111827 !important;
      -webkit-text-fill-color: #111827 !important;
      caret-color: #111827 !important;
      color-scheme: light !important;
    }

    .form-public-canvas-container:not([data-page-style="spotlight"]) input::placeholder,
    .form-public-canvas-container:not([data-page-style="spotlight"]) textarea::placeholder,
    .org-admin-v2 .form-public-canvas-container:not([data-page-style="spotlight"]) input::placeholder,
    .org-admin-v2 .form-public-canvas-container:not([data-page-style="spotlight"]) textarea::placeholder {
      color: #9ca3af !important;
      -webkit-text-fill-color: #9ca3af !important;
    }

    .form-public-canvas-container:not([data-page-style="spotlight"]) select option {
      background: #ffffff;
      color: #111827;
    }

    .form-public-canvas-container:not([data-page-style="spotlight"]) .form-public-canvas__label,
    .org-admin-v2 .form-public-canvas-container:not([data-page-style="spotlight"]) .form-public-canvas__label {
      color: #1f2937 !important;
      -webkit-text-fill-color: #1f2937 !important;
    }

    .form-public-canvas-container input:focus,
    .form-public-canvas-container select:focus,
    .form-public-canvas-container textarea:focus {
      border-color: var(--form-accent) !important;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--form-accent) 20%, transparent) !important;
    }

    .form-public-canvas-container .form-public-canvas__hero-accent {
      background: linear-gradient(90deg, transparent, var(--form-accent), transparent);
    }

    .form-public-canvas-container .form-public-canvas__association {
      border-color: color-mix(in srgb, var(--form-accent) 28%, transparent) !important;
      color: var(--form-accent) !important;
      background: #ffffff !important;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--form-accent) 10%, transparent), 0 12px 28px -24px var(--form-accent);
    }

    .form-public-canvas-container .form-public-canvas__card {
      border-color: color-mix(in srgb, var(--form-accent) 24%, transparent) !important;
      box-shadow: inset 0 4px 0 var(--form-accent), 0 22px 52px -42px color-mix(in srgb, var(--form-accent) 50%, #0f172a) !important;
    }

    .form-public-canvas-container[data-page-style="editorial"] .form-public-canvas__card,
    .form-public-canvas-container[data-page-style="minimal"] .form-public-canvas__card {
      background: #ffffff !important;
      color: #111827 !important;
    }

    .form-public-canvas-container .form-public-canvas__section-title-block {
      border-color: var(--form-accent) !important;
    }

    .form-public-canvas-container .form-public-canvas__section-title,
    .form-public-canvas-container .form-public-canvas__required {
      color: var(--form-accent) !important;
    }

    .org-admin-v2 .form-public-canvas-container .form-public-canvas__association {
      border-color: color-mix(in srgb, var(--form-accent) 28%, transparent) !important;
      background: #ffffff !important;
      color: var(--form-accent) !important;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--form-accent) 10%, transparent), 0 12px 28px -24px var(--form-accent) !important;
    }

    .org-admin-v2 .form-public-canvas-container[data-page-style="editorial"] .form-public-canvas__card,
    .org-admin-v2 .form-public-canvas-container[data-page-style="minimal"] .form-public-canvas__card {
      border-color: color-mix(in srgb, var(--form-accent) 24%, transparent) !important;
      background: #ffffff !important;
      color: #111827 !important;
      box-shadow: inset 0 4px 0 var(--form-accent), 0 22px 52px -42px color-mix(in srgb, var(--form-accent) 50%, #0f172a) !important;
    }

    .org-admin-v2 .form-public-canvas-container .form-public-canvas__section-title,
    .org-admin-v2 .form-public-canvas-container .form-public-canvas__required {
      color: var(--form-accent) !important;
    }

    .form-public-canvas-container .form-public-canvas__divider {
      border-color: color-mix(in srgb, var(--form-accent) 34%, transparent) !important;
    }

    .form-public-canvas-container .form-public-canvas__field:focus-within .form-public-canvas__label,
    .form-public-canvas-container .form-public-canvas__option:has(input:checked) .form-public-canvas__label {
      color: var(--form-accent) !important;
    }

    .form-public-canvas-container .form-public-canvas__option:has(input:checked) {
      border-color: color-mix(in srgb, var(--form-accent) 62%, transparent) !important;
      background: color-mix(in srgb, var(--form-accent) 9%, white) !important;
      color: color-mix(in srgb, var(--form-accent) 70%, #0f172a) !important;
    }

    .form-public-canvas-container[data-page-style="spotlight"] .form-public-canvas__association,
    .form-public-canvas-container[data-page-style="spotlight"] .form-public-canvas__section-title,
    .form-public-canvas-container[data-page-style="spotlight"] .form-public-canvas__required {
      color: color-mix(in srgb, var(--form-accent) 62%, white) !important;
    }

    .form-public-canvas-container[data-page-style="spotlight"] .form-public-canvas__card {
      background: linear-gradient(180deg, color-mix(in srgb, var(--form-accent) 12%, rgba(255,255,255,0.05)), rgba(255,255,255,0.04));
      border-color: color-mix(in srgb, var(--form-accent) 34%, rgba(255,255,255,0.12)) !important;
    }

    .form-public-canvas-container[data-page-style="spotlight"] .form-public-canvas__option:has(input:checked) {
      background: color-mix(in srgb, var(--form-accent) 18%, rgba(255,255,255,0.08)) !important;
      color: #ffffff !important;
    }
  `;

  const renderDynamicBookingBlock = (key = "dynamic-booking-block") => (
    <div key={key} className="form-public-canvas__dynamic-booking w-full rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <p className="text-sm font-bold text-neutral-900">Prenotazione</p>
        <p className="form-public-canvas__dynamic-booking-help mt-1 text-xs font-medium leading-5 text-neutral-500">
          Scegli giorno e uno degli orari disponibili. La serata viene compilata in base alla configurazione dell'organizzazione.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="form-public-canvas__field block">
          <span className="form-public-canvas__label mb-1 block text-sm font-semibold text-neutral-800">Giorno *</span>
          <input
            className={baseInputClass}
            type="date"
            required
            disabled={!interactive}
            value={String(values.__booking_date || "")}
            onChange={(event) => {
              onValueChange?.("__booking_date", event.target.value);
              onValueChange?.("__booking_event_series_id", "");
            }}
          />
        </label>
        <label className="form-public-canvas__field block">
          <span className="form-public-canvas__label mb-1 block text-sm font-semibold text-neutral-800">Orario *</span>
          <select
            className={baseInputClass}
            required
            disabled={!interactive || bookingEventsLoading || !values.__booking_date || timeSlots.length === 0}
            value={String(values.__booking_event_time || "")}
            onChange={(event) => {
              onValueChange?.("__booking_event_time", event.target.value);
              onValueChange?.("__booking_event_series_id", "");
            }}
          >
            <option value="">{bookingEventsLoading ? "Caricamento orari..." : timeSlots.length === 0 ? "Nessun orario configurato" : "Scegli orario"}</option>
            {timeSlots.map((slot) => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </select>
        </label>
        <label className="form-public-canvas__field block">
          <span className="form-public-canvas__label mb-1 block text-sm font-semibold text-neutral-800">Serata</span>
          <select
            className={baseInputClass}
            disabled={!interactive || bookingEventsLoading || !values.__booking_date || !values.__booking_event_time}
            value={String(values.__booking_event_series_id || "")}
            onChange={(event) => onValueChange?.("__booking_event_series_id", event.target.value)}
          >
            <option value="">
              {bookingEventsLoading ? "Controllo serate..." : "Prenotazione libera"}
            </option>
            {matchingSeriesForTime.map((eventItem) => (
              <option key={eventItem.id} value={eventItem.id}>
                {eventItem.name}{eventItem.is_default ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );

  return (
    <div
      className={`form-public-canvas-container w-full min-h-full ${theme.shell} transition-colors duration-300`}
      data-page-style={pageStyle}
      style={canvasStyle}
    >
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
            <div className="form-public-canvas__association mb-6 inline-flex max-w-full items-center justify-center rounded-2xl border px-5 py-3 text-sm font-semibold">
              <span className="truncate">{form.association.name}</span>
            </div>
          )}
          <h1 className={`form-public-canvas__title ${theme.title}`}>{form.title}</h1>
          <span className="form-public-canvas__hero-accent mt-5 h-1 w-24 rounded-full" aria-hidden="true" />
          {form.description && (
            <p className={`form-public-canvas__description mt-5 text-sm md:text-base max-w-2xl mx-auto leading-relaxed ${theme.body}`}>
              {form.description}
            </p>
          )}
        </div>
      </div>

      {/* Form Content */}
      <div className={`max-w-3xl mx-auto px-6 py-8 md:py-12 ${theme.surface}`}>
        <form
          className={`form-public-canvas__card flex flex-wrap gap-y-6 gap-x-4 ${theme.card}`}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit?.();
          }}
        >
          {showDynamicBookingFields && !hasBookingBlockField ? renderDynamicBookingBlock() : null}

          {sortedFields.length === 0 ? (
            <div className="w-full text-center py-12 text-sm opacity-60">
              Il form non contiene ancora nessun campo.
            </div>
          ) : (
            sortedFields.map((field) =>
              showDynamicBookingFields && isBookingBlockField(field)
                ? renderDynamicBookingBlock(field.field_key)
                : renderField({
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
