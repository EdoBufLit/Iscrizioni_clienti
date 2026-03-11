import { AssociationFormField, AssociationFormFieldType } from "../../../lib/api";

export type FieldWidth = "100%" | "50%";

export type VirtualFieldType = 
  | AssociationFormFieldType
  | "section_title"
  | "free_text"
  | "divider"
  | "spacer"
  | "file_upload";

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
};

export const META_DELIMITER = "|||META:";

export function decodeField(apiField: AssociationFormField): BuilderField {
  let virtualType: VirtualFieldType = apiField.field_type;
  
  // Detect virtual types from field_key
  for (const [vType, prefix] of Object.entries(VIRTUAL_TYPE_PREFIXES)) {
    if (apiField.field_key.startsWith(prefix)) {
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
      const meta = JSON.parse(parts[1]) as { w?: FieldWidth; hl?: boolean };
      if (meta.w === "50%") width = "50%";
      if (meta.hl === true) hideLabel = true;
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
      "select",
      "radio",
      "checkbox",
      "consent"
    ].includes(builderField.type)
  ) {
    apiType = builderField.type as AssociationFormFieldType;
  } else if (builderField.type === "free_text") {
    apiType = "long_text";
  }

  // Build metadata
  const meta: { w?: FieldWidth; hl?: boolean } = {};
  if (builderField.width === "50%") meta.w = "50%";
  if (builderField.hideLabel) meta.hl = true;
  
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

export const PALETTE_ITEMS = [
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
  { type: "select", label: "Menu a tendina", icon: "▾" },
  { type: "radio", label: "Scelta singola", icon: "◉" },
  { type: "checkbox", label: "Scelta multipla", icon: "☑" },
  { type: "file_upload", label: "Upload file", icon: "↑" },
  { type: "consent", label: "Consenso Privacy", icon: "✓" },
] as const;
