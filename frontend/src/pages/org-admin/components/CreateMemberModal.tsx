import { FormEvent, memo, useCallback, useEffect, useState } from "react";
import {
  createOrgAdminMember,
  type CreateOrgAdminMemberInput,
} from "../../../lib/api";

type MemberFormData = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  fiscal_code: string;
  payment_method: "" | "CASH" | "BONIFICO";
  joined_at: string;
  member_type: string;
  internal_notes: string;
  is_manual: boolean;
  send_access_email: boolean;
};

type CreatedMember = {
  id: number;
  first_name: string;
  last_name: string;
  email_sent?: boolean;
};

type CreateMemberModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (created: CreatedMember) => void;
};

const createInitialFormData = (): MemberFormData => ({
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  fiscal_code: "",
  payment_method: "",
  joined_at: new Date().toISOString().slice(0, 10),
  member_type: "",
  internal_notes: "",
  is_manual: true,
  send_access_email: false,
});

const CreateMemberModal = memo(function CreateMemberModal({
  open,
  onClose,
  onCreated,
}: CreateMemberModalProps) {
  const [formData, setFormData] = useState<MemberFormData>(createInitialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setFormData(createInitialFormData());
    setSubmitError("");
    setIsSubmitting(false);
  }, [open]);

  const updateField = useCallback(
    <K extends keyof MemberFormData>(key: K, value: MemberFormData[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleCreateMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");

    const payload: CreateOrgAdminMemberInput = {
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim(),
      is_manual: formData.is_manual,
      send_access_email: formData.send_access_email,
    };

    if (!payload.first_name || !payload.last_name) {
      setSubmitError("Nome e cognome sono obbligatori.");
      return;
    }

    if (formData.email.trim()) payload.email = formData.email.trim();
    if (formData.phone.trim()) payload.phone = formData.phone.trim();
    if (formData.fiscal_code.trim()) payload.fiscal_code = formData.fiscal_code.trim();
    if (formData.payment_method) payload.payment_method = formData.payment_method;
    if (formData.joined_at) payload.joined_at = formData.joined_at;
    if (formData.member_type.trim()) payload.member_type = formData.member_type.trim();
    if (formData.internal_notes.trim()) payload.internal_notes = formData.internal_notes.trim();

    if (payload.send_access_email && !payload.email) {
      setSubmitError("Inserisci un'email valida per inviare l'accesso.");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createOrgAdminMember(payload);
      onCreated(created);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Errore durante la creazione");
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
        className="w-full max-w-2xl surface-strong p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        data-component="orgadmin-member-create-modal"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">
              Aggiungi socio
            </h3>
            <p className="mt-1 text-sm text-neutral-500">
              Inserisci i dati anagrafici del socio e salva l'iscrizione manuale.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100"
            aria-label="Chiudi"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12" />
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
                value={formData.first_name}
                onChange={(e) => updateField("first_name", e.target.value)}
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
                value={formData.last_name}
                onChange={(e) => updateField("last_name", e.target.value)}
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
                value={formData.email}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    email: e.target.value,
                    send_access_email: e.target.value.trim()
                      ? prev.send_access_email
                      : false,
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600">
                Telefono (opzionale)
              </label>
              <input
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                type="tel"
                value={formData.phone}
                onChange={(e) => updateField("phone", e.target.value)}
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
                value={formData.fiscal_code}
                onChange={(e) => updateField("fiscal_code", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600">
                Modalita di pagamento (opzionale)
              </label>
              <select
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                value={formData.payment_method}
                onChange={(e) =>
                  updateField(
                    "payment_method",
                    (e.target.value as MemberFormData["payment_method"]) ?? ""
                  )
                }
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
                value={formData.joined_at}
                onChange={(e) => updateField("joined_at", e.target.value)}
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
              value={formData.member_type}
              onChange={(e) => updateField("member_type", e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600">
              Note interne (solo admin)
            </label>
            <textarea
              className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              rows={3}
              value={formData.internal_notes}
              onChange={(e) => updateField("internal_notes", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-brand focus:ring-brand"
                checked={formData.is_manual}
                onChange={(e) => updateField("is_manual", e.target.checked)}
              />
              Iscrizione manuale
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-brand focus:ring-brand"
                checked={formData.send_access_email}
                disabled={!formData.email.trim()}
                onChange={(e) => updateField("send_access_email", e.target.checked)}
              />
              Invia accesso via email ora
            </label>
            <p className="text-xs text-neutral-500">
              L'invio dell'accesso richiede un'email valida e genera un magic link.
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
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Salvataggio..." : "Crea socio"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default CreateMemberModal;
