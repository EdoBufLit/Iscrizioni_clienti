import { BuilderField } from "./utils";

type Props = {
  selectedField: BuilderField | null;
  onChange: (field: BuilderField) => void;
  locked: boolean;
};

const inputClass =
  "mt-1 w-full rounded-[1rem] border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const labelClass = "block text-[11px] font-bold uppercase tracking-[0.05em] text-neutral-500 mb-1";

export function PropertiesPanel({ selectedField, onChange, locked }: Props) {
  if (!selectedField) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-400">
        <svg className="w-12 h-12 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
        <p className="text-sm font-medium">Nessun blocco selezionato</p>
        <p className="mt-1 text-xs">Clicca su un elemento nel canvas per modificarne le proprietà.</p>
      </div>
    );
  }

  const isStructural = ["divider", "spacer"].includes(selectedField.type);
  const isTitle = selectedField.type === "section_title";
  const isFreeText = selectedField.type === "free_text";
  const hasOptions = ["select", "radio", "checkbox"].includes(selectedField.type);
  const isStandardInput = !isStructural && !isTitle && !isFreeText;

  const handleChange = (key: keyof BuilderField, value: any) => {
    onChange({ ...selectedField, [key]: value });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-100 pb-4">
        <div className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-600">
          Proprietà blocco
        </div>
      </div>

      <div className="space-y-5">
        {isStructural ? (
          <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-4 text-center">
            <p className="text-xs text-neutral-500">Questo elemento non ha proprietà configurabili.</p>
          </div>
        ) : (
          <>
            <div>
              <label className={labelClass}>{isTitle ? "Testo Titolo" : "Etichetta (Label)"}</label>
              <input
                className={inputClass}
                disabled={locked}
                value={selectedField.label}
                onChange={(e) => handleChange("label", e.target.value)}
              />
            </div>

            {isStandardInput && (
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
                <label className={labelClass}>{isFreeText ? "Testo libero" : "Testo di aiuto (Helper text)"}</label>
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
                <label className={labelClass}>Opzioni (separate da virgola)</label>
                <textarea
                  className={`${inputClass} min-h-[80px] resize-none`}
                  disabled={locked}
                  value={selectedField.optionsText}
                  onChange={(e) => handleChange("optionsText", e.target.value)}
                  placeholder="Opzione 1, Opzione 2, Opzione 3"
                />
              </div>
            )}

            {isStandardInput && (
              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={selectedField.required}
                      onChange={(e) => handleChange("required", e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="w-10 h-6 bg-neutral-200 rounded-full peer-checked:bg-brand transition-colors"></div>
                    <div className="absolute left-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                  </div>
                  <span className="text-sm font-medium text-neutral-800">Campo obbligatorio</span>
                </label>
              </div>
            )}
          </>
        )}

        <div className="border-t border-neutral-100 pt-5 space-y-5">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.05em] text-neutral-900">Aspetto Layout</h4>
          
          <div>
            <label className={labelClass}>Larghezza campo</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                disabled={locked}
                onClick={() => handleChange("width", "100%")}
                className={`rounded-xl border py-2.5 text-sm font-medium transition-all ${
                  selectedField.width === "100%"
                    ? "border-brand bg-brand/5 text-brand ring-1 ring-brand/20"
                    : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                100%
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => handleChange("width", "50%")}
                className={`rounded-xl border py-2.5 text-sm font-medium transition-all ${
                  selectedField.width === "50%"
                    ? "border-brand bg-brand/5 text-brand ring-1 ring-brand/20"
                    : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                50%
              </button>
            </div>
          </div>

          {!isStructural && !isTitle && !isFreeText && (
            <div>
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm font-medium text-neutral-800">Nascondi Etichetta (Label)</span>
                <div className="relative flex items-center justify-center">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={selectedField.hideLabel}
                    onChange={(e) => handleChange("hideLabel", e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="w-10 h-6 bg-neutral-200 rounded-full peer-checked:bg-brand transition-colors"></div>
                  <div className="absolute left-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                </div>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
