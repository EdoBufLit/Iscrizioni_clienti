import { FormEvent, memo, useEffect, useState } from "react";
import {
  createOrgAdminMember,
  type CreateOrgAdminMemberInput,
} from "../../../lib/api";

type CreatedMember = {
  id: number;
  first_name: string;
  last_name: string;
  email_sent?: boolean;
  email_status?: string;
};

type CreateMemberModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (created: CreatedMember) => void;
};

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const CreateMemberModal = memo(function CreateMemberModal({
  open,
  onClose,
  onCreated,
}: CreateMemberModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [joinedAtDefault, setJoinedAtDefault] = useState(todayIsoDate);

  useEffect(() => {
    if (!open) return;
    setSubmitError("");
    setIsSubmitting(false);
    setJoinedAtDefault(todayIsoDate());
  }, [open]);

  const handleCreateMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");

    const form = event.currentTarget;
    const data = new FormData(form);

    const firstName = String(data.get("first_name") ?? "").trim();
    const lastName = String(data.get("last_name") ?? "").trim();

    if (!firstName || !lastName) {
      setSubmitError("Nome e cognome sono obbligatori.");
      return;
    }

    const payload: CreateOrgAdminMemberInput = {
      first_name: firstName,
      last_name: lastName,
      is_manual: data.get("is_manual") === "on",
      send_access_email: data.get("send_access_email") === "on",
    };

    const email = String(data.get("email") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const fiscalCode = String(data.get("fiscal_code") ?? "").trim();
    const paymentMethod = String(data.get("payment_method") ?? "")
      .trim()
      .toUpperCase();
    const joinedAt = String(data.get("joined_at") ?? "").trim();
    const memberType = String(data.get("member_type") ?? "").trim();
    const internalNotes = String(data.get("internal_notes") ?? "").trim();

    if (email) payload.email = email;
    if (phone) payload.phone = phone;
    if (fiscalCode) payload.fiscal_code = fiscalCode;
    if (paymentMethod === "CASH" || paymentMethod === "BONIFICO") {
      payload.payment_method = paymentMethod;
    }
    if (joinedAt) payload.joined_at = joinedAt;
    if (memberType) payload.member_type = memberType;
    if (internalNotes) payload.internal_notes = internalNotes;

    if (payload.send_access_email && !payload.email) {
      setSubmitError("Inserisci un'email valida per inviare l'accesso.");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createOrgAdminMember(payload);
      onCreated(created);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Errore durante la creazione"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="modal-panel max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
        data-component="orgadmin-member-create-modal"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">
              Aggiungi socio
            </h3>
            <p className="mt-1 text-sm text-neutral-500">
              Inserisci i dati anagrafici del socio e salva l'iscrizione
              manuale.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100"
            aria-label="Chiudi"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 6l12 12M18 6l-12 12"
              />
            </svg>
          </button>
        </div>

        <div className="mt-4 min-h-[50px]">
          {submitError && (
            <div className="rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}
        </div>

        <form className="mt-2 grid gap-4" onSubmit={handleCreateMember}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-neutral-600">
                Nome *
              </label>
              <input
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                type="text"
                name="first_name"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600">
                Cognome *
              </label>
              <input
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                type="text"
                name="last_name"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-neutral-600">
                Email (opzionale)
              </label>
              <input
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                type="email"
                name="email"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600">
                Telefono (opzionale)
              </label>
              <input
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                type="tel"
                name="phone"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-neutral-600">
                Codice Fiscale (opzionale)
              </label>
              <input
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                type="text"
                name="fiscal_code"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600">
                Modalita di pagamento (opzionale)
              </label>
              <select
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                name="payment_method"
                defaultValue=""
              >
                <option value="">Seleziona...</option>
                <option value="CASH">Contanti</option>
                <option value="BONIFICO">Bonifico</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600">
                Data iscrizione
              </label>
              <input
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                type="date"
                name="joined_at"
                defaultValue={joinedAtDefault}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600">
              Categoria / Tipo (opzionale)
            </label>
            <input
              className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              type="text"
              name="member_type"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600">
              Note interne (solo admin)
            </label>
            <textarea
              className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              rows={3}
              name="internal_notes"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-brand focus:ring-brand"
                name="is_manual"
                defaultChecked
              />
              Iscrizione manuale
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-brand focus:ring-brand"
                name="send_access_email"
              />
              Invia accesso via email ora
            </label>
            <p className="text-xs text-neutral-500">
              L'invio dell'accesso richiede un'email valida e genera un magic
              link.
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Annulla
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvataggio..." : "Crea socio"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default CreateMemberModal;
