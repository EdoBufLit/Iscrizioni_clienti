export type StatusMeta = {
  label: string;
  tone: string;
};

export const affiliationStatusMeta: Record<string, StatusMeta> = {
  draft: { label: "Bozza", tone: "border-neutral-200 bg-neutral-50 text-neutral-600" },
  under_review: { label: "In revisione", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  changes_requested: { label: "Modifiche richieste", tone: "border-orange-200 bg-orange-50 text-orange-700" },
  approved: { label: "Approvata", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rifiutata", tone: "border-red-200 bg-red-50 text-red-700" },
};

export const affiliationPaymentStatusMeta: Record<string, StatusMeta> = {
  unpaid: { label: "Non pagato", tone: "border-neutral-200 bg-neutral-50 text-neutral-600" },
  checkout_pending: { label: "Checkout in attesa", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  payment_under_review: { label: "Pagamento da verificare", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  paid: { label: "Pagato", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  verified: { label: "Verificato", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  failed: { label: "Non riuscito", tone: "border-red-200 bg-red-50 text-red-700" },
  cancelled: { label: "Annullato", tone: "border-red-200 bg-red-50 text-red-700" },
  expired: { label: "Scaduto", tone: "border-red-200 bg-red-50 text-red-700" },
  pending: { label: "In attesa", tone: "border-amber-200 bg-amber-50 text-amber-700" },
};

export const affiliationDocumentStatusMeta: Record<string, StatusMeta> = {
  pending: { label: "In revisione", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  uploaded: { label: "In revisione", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  approved: { label: "Approvato", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rifiutato", tone: "border-red-200 bg-red-50 text-red-700" },
};

export const affiliationDocsStatusMeta: Record<string, StatusMeta> = {
  pending: { label: "Documenti in attesa", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  ok: { label: "Documenti approvati", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  changes_requested: { label: "Modifiche richieste", tone: "border-orange-200 bg-orange-50 text-orange-700" },
};

export const referralStatusMeta: Record<string, StatusMeta> = {
  pending: { label: "In attesa", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  approved: { label: "Approvata", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  rewarded: { label: "Premio assegnato", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

export const referralInviteStatusMeta: Record<string, StatusMeta & { hint: string }> = {
  invited: {
    label: "Invitata",
    tone: "border-neutral-200 bg-neutral-50 text-neutral-700",
    hint: "L'associazione non ha ancora completato la richiesta.",
  },
  completed_by_association: {
    label: "Completata da associazione",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
    hint: "Compilazione completata, in attesa di presa in carico.",
  },
  under_review: {
    label: "In revisione",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
    hint: "Pratica in revisione da parte del super admin.",
  },
  approved: {
    label: "Approvata",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    hint: "La ruota premi e disponibile.",
  },
  rejected: {
    label: "Rifiutata",
    tone: "border-red-200 bg-red-50 text-red-700",
    hint: "Pratica rifiutata dal super admin.",
  },
};

export const membershipCardStatusMeta: Record<string, StatusMeta> = {
  pending: { label: "In attesa", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  issued: { label: "Emessa", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  failed: { label: "Non emessa", tone: "border-red-200 bg-red-50 text-red-700" },
};

export function resolveStatusMeta(
  source: Record<string, StatusMeta>,
  status: string | null | undefined,
  fallbackLabel = "Non disponibile",
): StatusMeta {
  const key = String(status || "").trim().toLowerCase();
  return source[key] ?? {
    label: key ? key.replace(/_/g, " ") : fallbackLabel,
    tone: "border-neutral-200 bg-neutral-50 text-neutral-600",
  };
}
