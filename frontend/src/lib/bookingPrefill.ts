import type { MemberProfile, PublicAssociationForm } from "./api";

export type BookingPrefill = Pick<MemberProfile, "first_name" | "last_name" | "email" | "phone"> & { formId: number; associationId: number };

export function bookingPrefillValues(form: PublicAssociationForm, prefill?: BookingPrefill | null): Record<string, string> {
  if (!prefill || prefill.formId !== form.id || prefill.associationId !== form.association_id) return {};
  const result: Record<string, string> = {};
  const name = `${prefill.first_name || ""} ${prefill.last_name || ""}`.trim();
  for (const field of form.fields) {
    if (!["short_text", "email", "phone"].includes(field.field_type)) continue;
    const key = field.field_key.toLowerCase();
    const label = field.label.trim().toLowerCase();
    const mapping = form.booking_field_mapping ?? {};
    if (mapping.customer_name === field.field_key) result[field.field_key] = name;
    else if (mapping.customer_email === field.field_key || field.field_type === "email") result[field.field_key] = prefill.email;
    else if (mapping.customer_phone === field.field_key || field.field_type === "phone") result[field.field_key] = prefill.phone || "";
    else if (["last_name", "surname", "cognome"].includes(key) || label === "cognome") result[field.field_key] = prefill.last_name;
    else if (["first_name", "nome"].includes(key) || label === "nome") result[field.field_key] = prefill.first_name;
    else if (["full_name", "name", "customer_name", "nome_cliente", "nome_socio"].includes(key) || label === "nome e cognome") result[field.field_key] = name;
    else if (["email", "customer_email"].includes(key)) result[field.field_key] = prefill.email;
    else if (["telefono", "cellulare", "phone", "customer_phone"].includes(key)) result[field.field_key] = prefill.phone || "";
  }
  return result;
}
