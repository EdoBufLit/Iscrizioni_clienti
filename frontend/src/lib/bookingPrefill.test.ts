import { describe, expect, it } from "vitest";
import { bookingPrefillValues } from "./bookingPrefill";
import type { PublicAssociationForm } from "./api";

const prefill = { formId: 4, associationId: 2, first_name: "Anna", last_name: "Rossi", email: "anna@example.test", phone: "+393331234567" };
const form = { id: 4, association_id: 2, booking_field_mapping: { customer_name: "guest" }, fields: [
  { field_key: "nome", label: "Nome", field_type: "short_text" },
  { field_key: "cognome", label: "Cognome", field_type: "short_text" },
  { field_key: "guest", label: "Ospite", field_type: "short_text" },
  { field_key: "contatto", label: "Contatto", field_type: "email" },
  { field_key: "recapito", label: "Recapito", field_type: "phone" },
  { field_key: "nome_evento", label: "Nome evento", field_type: "short_text" },
  { field_key: "consenso", label: "Consenso", field_type: "consent" },
] } as unknown as PublicAssociationForm;

describe("Booking prefill", () => {
  it("precompila campi espliciti, separando nome e cognome senza alterare altri campi o consensi", () => {
    expect(bookingPrefillValues(form, prefill)).toEqual({ nome: "Anna", cognome: "Rossi", guest: "Anna Rossi", contatto: prefill.email, recapito: prefill.phone });
  });
  it("non trasferisce dati a un modulo o associazione differente", () => {
    expect(bookingPrefillValues(form, { ...prefill, associationId: 9 })).toEqual({});
    expect(bookingPrefillValues(form, { ...prefill, formId: 9 })).toEqual({});
  });
});
