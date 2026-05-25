import { AssociationFormField, AssociationFormFieldType } from "../../../lib/api";

export type FieldWidth = "100%" | "50%";

export type VirtualFieldType = 
  | AssociationFormFieldType
  | "section_title"
  | "free_text"
  | "divider"
  | "spacer"
  | "file_upload"
  | "rating_1_5"
  | "nps_0_10"
  | "booking_block";

export interface BuilderField {
  id: number;
  type: VirtualFieldType;
  key: string;
  label: string;
  placeholder: string;
  helpText: string;
  required: boolean;
  optionsText: string;
  width: FieldWidth;
  hideLabel: boolean;
  surveyKind?: "rating_1_5" | "nps_0_10";
}

export type BuilderFieldPayload = {
  field_key: string | null;
  field_type: AssociationFormFieldType;
  label: string;
  placeholder: string | null;
  help_text: string | null;
  is_required: boolean;
  sort_order: number;
  options: string | null;
};

export const VIRTUAL_TYPE_PREFIXES: Record<string, string> = {
  section_title: "__ui_title__",
  free_text: "__ui_text__",
  divider: "__ui_divider__",
  spacer: "__ui_spacer__",
  file_upload: "__ui_file__",
  rating_1_5: "__survey_rating__",
  nps_0_10: "__survey_nps__",
  booking_block: "__booking_block__",
};

const LEGACY_VIRTUAL_TYPE_PREFIXES: Record<string, string> = {
  section_title: "ui_title_",
  free_text: "ui_text_",
  divider: "ui_divider_",
  spacer: "ui_spacer_",
  file_upload: "ui_file_",
  rating_1_5: "survey_rating_",
  nps_0_10: "survey_nps_",
  booking_block: "booking_block_",
};

export const META_DELIMITER = "|||META:";
export const FORM_BUILDER_CANVAS_ID = "form-builder-canvas";

export function createFieldFromPaletteItem(
  type: VirtualFieldType,
  label?: string,
): BuilderField {
  const paletteItem = PALETTE_ITEMS.find((item) => item.type === type);
  const resolvedLabel = label || paletteItem?.label || "Nuovo blocco";
  const isRating = type === "rating_1_5";
  const isNps = type === "nps_0_10";
  const isBookingBlock = type === "booking_block";

  return {
    id: -Date.now(),
    type,
    key: generateFieldKey(type, resolvedLabel),
    label: resolvedLabel,
    placeholder: "",
    helpText: isBookingBlock
      ? "Data e orario sono liberi; la serata viene proposta se disponibile per la scelta del socio."
      : isRating
      ? "Lascia una valutazione da 1 a 5."
      : isNps
        ? "Indica quanto consiglieresti questa esperienza."
        : "",
    required: false,
    optionsText: isBookingBlock
      ? ""
      : isRating
      ? "1, 2, 3, 4, 5"
      : isNps
        ? "0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10"
        : ["select", "radio", "checkbox"].includes(type)
          ? "Opzione 1, Opzione 2"
          : "",
    width: "100%",
    hideLabel: false,
    surveyKind: isRating || isNps ? type : undefined,
  };
}

export function decodeField(apiField: AssociationFormField): BuilderField {
  let virtualType: VirtualFieldType = apiField.field_type;
  
  // Detect virtual types from field_key
  for (const [vType, prefix] of Object.entries(VIRTUAL_TYPE_PREFIXES)) {
    const legacyPrefix = LEGACY_VIRTUAL_TYPE_PREFIXES[vType];
    if (apiField.field_key.startsWith(prefix) || (legacyPrefix && apiField.field_key.startsWith(legacyPrefix))) {
      virtualType = vType as VirtualFieldType;
      break;
    }
  }

  // Parse metadata from help_text
  let helpText = apiField.help_text || "";
  let width: FieldWidth = "100%";
  let hideLabel = false;

  if (helpText.includes(META_DELIMITER)) {
    const parts = helpText.split(META_DELIMITER);
    helpText = parts[0];
    try {
      const meta = JSON.parse(parts[1]) as { w?: FieldWidth; hl?: boolean; survey?: "rating_1_5" | "nps_0_10" };
      if (meta.w === "50%") width = "50%";
      if (meta.hl === true) hideLabel = true;
      if (meta.survey === "rating_1_5" || meta.survey === "nps_0_10") {
        virtualType = meta.survey;
      }
    } catch {
      // ignore parse errors
    }
  }

  return {
    id: apiField.id,
    type: virtualType,
    key: apiField.field_key,
    label: apiField.label,
    placeholder: apiField.placeholder || "",
    helpText: helpText,
    required: apiField.is_required,
    optionsText: (apiField.options || []).join(", "),
    width,
    hideLabel,
    surveyKind: virtualType === "rating_1_5" || virtualType === "nps_0_10" ? virtualType : undefined,
  };
}

export function encodeField(
  builderField: BuilderField,
  sortOrder: number,
): BuilderFieldPayload {
  let apiType: AssociationFormFieldType = "short_text";
  
  if (
    [
      "short_text",
      "long_text",
      "email",
      "phone",
      "number",
      "date",
      "time",
      "select",
      "radio",
      "checkbox",
      "consent"
    ].includes(builderField.type)
  ) {
    apiType = builderField.type as AssociationFormFieldType;
  } else if (builderField.type === "free_text") {
    apiType = "long_text";
  } else if (builderField.type === "booking_block") {
    apiType = "long_text";
  } else if (builderField.type === "rating_1_5" || builderField.type === "nps_0_10") {
    apiType = "radio";
  }

  // Build metadata
  const meta: { w?: FieldWidth; hl?: boolean; survey?: "rating_1_5" | "nps_0_10" } = {};
  if (builderField.width === "50%") meta.w = "50%";
  if (builderField.hideLabel) meta.hl = true;
  if (builderField.surveyKind || builderField.type === "rating_1_5" || builderField.type === "nps_0_10") {
    meta.survey = (builderField.surveyKind || builderField.type) as "rating_1_5" | "nps_0_10";
  }
  
  let finalHelpText = builderField.helpText;
  if (Object.keys(meta).length > 0) {
    finalHelpText = `${builderField.helpText}${META_DELIMITER}${JSON.stringify(meta)}`;
  }

  return {
    field_key: builderField.key,
    field_type: apiType,
    label: builderField.label || " ",
    placeholder: builderField.placeholder || null,
    help_text: finalHelpText || null,
    is_required: builderField.required,
    sort_order: sortOrder,
    options: builderField.optionsText || null,
  };
}

export function generateFieldKey(type: VirtualFieldType, label: string): string {
  const baseKey = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "campo";
    
  const suffix = Math.random().toString(36).substring(2, 8);
  
  if (VIRTUAL_TYPE_PREFIXES[type]) {
    return `${VIRTUAL_TYPE_PREFIXES[type]}${suffix}`;
  }
  
  return `${baseKey}_${suffix}`;
}

export const FORM_PALETTE_ITEMS = [
  { type: "section_title", label: "Titolo sezione", icon: "H" },
  { type: "free_text", label: "Testo libero", icon: "T" },
  { type: "divider", label: "Separatore", icon: "—" },
  { type: "spacer", label: "Spazio vuoto", icon: "↕" },
  { type: "short_text", label: "Testo breve", icon: "Aa" },
  { type: "long_text", label: "Textarea", icon: "¶" },
  { type: "email", label: "Email", icon: "@" },
  { type: "phone", label: "Telefono", icon: "☎" },
  { type: "number", label: "Numero", icon: "123" },
  { type: "date", label: "Data", icon: "◷" },
  { type: "time", label: "Orario", icon: "00" },
  { type: "select", label: "Menu a tendina", icon: "▾" },
  { type: "radio", label: "Scelta singola", icon: "◉" },
  { type: "checkbox", label: "Scelta multipla", icon: "☑" },
  { type: "file_upload", label: "Upload file", icon: "↑" },
  { type: "consent", label: "Consenso Privacy", icon: "✓" },
] as const;

export const SURVEY_PALETTE_ITEMS = [
  { type: "section_title", label: "Titolo/Intro", icon: "T" },
  { type: "short_text", label: "Risposta breve", icon: "Aa" },
  { type: "long_text", label: "Paragrafo", icon: "P" },
  { type: "radio", label: "Scelta multipla", icon: "O" },
  { type: "checkbox", label: "Caselle di controllo", icon: "C" },
  { type: "select", label: "Menu a tendina", icon: "V" },
  { type: "rating_1_5", label: "Valutazione 1-5", icon: "5" },
  { type: "nps_0_10", label: "NPS 0-10", icon: "10" },
  { type: "date", label: "Data", icon: "D" },
  { type: "time", label: "Orario", icon: "H" },
  { type: "consent", label: "Consenso privacy", icon: "OK" },
] as const;

export const PALETTE_ITEMS = [...FORM_PALETTE_ITEMS, ...SURVEY_PALETTE_ITEMS] as const;

export function getPaletteItems(mode: "forms" | "surveys" = "forms") {
  return mode === "surveys" ? SURVEY_PALETTE_ITEMS : FORM_PALETTE_ITEMS;
}

export function isBookingBlockField(field: { field_key?: string | null; type?: string | null }): boolean {
  const fieldKey = String(field.field_key || "");
  return field.type === "booking_block" || fieldKey.startsWith(VIRTUAL_TYPE_PREFIXES.booking_block);
}
