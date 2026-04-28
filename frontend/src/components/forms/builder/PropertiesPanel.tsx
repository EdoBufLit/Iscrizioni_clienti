import type { BuilderField } from "./utils";

type Props = {
  selectedField: BuilderField | null;
  onChange: (field: BuilderField) => void;
  locked: boolean;
};

const inputClass =
  "mt-1 w-full rounded-[0.72rem] border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const labelClass = "mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500";

export function PropertiesPanel({ selectedField, onChange, locked }: Props) {
  if (!selectedField) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center p-6 text-center text-slate-400">
        <svg className="mb-4 h-12 w-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 1 0 0 4m0-4a2 2 0 1 1 0 4m-6 8a2 2 0 1 0 0-4m0 4a2 2 0 1 1 0-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 1 0 0-4m0 4a2 2 0 1 1 0-4m0 4v2m0-6V4" />
        </svg>
        <p className="text-sm font-semibold text-slate-700">Nessun campo selezionato</p>
        <p className="mt-1 text-xs">Clicca un elemento nel canvas per modificarne le proprieta.</p>
      </div>
    );
  }

  const isStructural = ["divider", "spacer"].includes(selectedField.type);
  const isTitle = selectedField.type === "section_title";
  const isFreeText = selectedField.type === "free_text";
  const isScaleInput = selectedField.type === "rating_1_5" || selectedField.type === "nps_0_10";
  const hasOptions = ["select", "radio", "checkbox", "rating_1_5", "nps_0_10"].includes(selectedField.type);
  const isStandardInput = !isStructural && !isTitle && !isFreeText;

  const handleChange = (key: keyof BuilderField, value: unknown) => {
    onChange({ ...selectedField, [key]: value });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Proprieta campo</p>
        <h3 className="mt-2 text-base font-semibold text-slate-950">{selectedField.label || "Campo selezionato"}</h3>
      </div>

      <div className="space-y-5">
        {isStructural ? (
          <div className="rounded-[0.75rem] border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
            <p className="text-xs text-slate-500">Questo elemento non ha proprieta configurabili.</p>
          </div>
        ) : (
          <>
            <div>
              <label className={labelClass}>{isTitle ? "Testo titolo" : "Etichetta"}</label>
              <input
                className={inputClass}
                disabled={locked}
                value={selectedField.label}
                onChange={(e) => handleChange("label", e.target.value)}
              />
            </div>

            {isStandardInput && !isScaleInput && (
              <div>
                <label className={labelClass}>Placeholder</label>
                <input
                  className={inputClass}
                  disabled={locked}
                  value={selectedField.placeholder}
                  onChange={(e) => handleChange("placeholder", e.target.value)}
                  placeholder="Es: Mario Rossi"
                />
              </div>
            )}

            {(isStandardInput || isFreeText) && (
              <div>
                <label className={labelClass}>{isFreeText ? "Testo libero" : "Testo di aiuto"}</label>
                <textarea
                  className={`${inputClass} min-h-[80px] resize-none`}
                  disabled={locked}
                  value={selectedField.helpText}
                  onChange={(e) => handleChange("helpText", e.target.value)}
                  placeholder={isFreeText ? "Aggiungi il paragrafo..." : "Spiegazione aggiuntiva..."}
                />
              </div>
            )}

            {hasOptions && (
              <div>
                <label className={labelClass}>{isScaleInput ? "Valori scala" : "Opzioni"}</label>
                <textarea
                  className={`${inputClass} min-h-[88px] resize-none`}
                  disabled={locked}
                  value={selectedField.optionsText}
                  onChange={(e) => handleChange("optionsText", e.target.value)}
                  placeholder={isScaleInput ? "1, 2, 3, 4, 5" : "Opzione 1, Opzione 2, Opzione 3"}
                />
              </div>
            )}

            {isStandardInput && (
              <div className="pt-2">
                <label className="group flex cursor-pointer items-center gap-3">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={selectedField.required}
                      onChange={(e) => handleChange("required", e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="h-6 w-10 rounded-full bg-slate-200 transition-colors peer-checked:bg-brand"></div>
                    <div className="absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4"></div>
                  </div>
                  <span className="text-sm font-medium text-slate-800">Campo obbligatorio</span>
                </label>
              </div>
            )}
          </>
        )}

        <div className="space-y-5 border-t border-slate-100 pt-5">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-900">Aspetto layout</h4>

          <div>
            <label className={labelClass}>Larghezza campo</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {["100%", "50%"].map((width) => (
                <button
                  key={width}
                  type="button"
                  disabled={locked}
                  onClick={() => handleChange("width", width)}
                  className={`rounded-[0.72rem] border py-2.5 text-sm font-semibold transition-all ${
                    selectedField.width === width
                      ? "border-brand bg-brand/5 text-brand ring-1 ring-brand/20"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {width}
                </button>
              ))}
            </div>
          </div>

          {!isStructural && !isTitle && !isFreeText && (
            <div>
              <label className="group flex cursor-pointer items-center justify-between">
                <span className="text-sm font-medium text-slate-800">Nascondi etichetta</span>
                <div className="relative flex items-center justify-center">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={selectedField.hideLabel}
                    onChange={(e) => handleChange("hideLabel", e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="h-6 w-10 rounded-full bg-slate-200 transition-colors peer-checked:bg-brand"></div>
                  <div className="absolute left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4"></div>
                </div>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
