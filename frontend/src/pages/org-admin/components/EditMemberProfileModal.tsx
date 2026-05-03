import { memo, useEffect, useMemo, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import {
  type OrgAdminMembershipSettings,
  searchMunicipalities,
  type MunicipalitySearchItem,
  type OrgAdminMemberDetail,
  type UpdateOrgAdminMemberProfileInput,
} from "../../../lib/api";
import {
  normalizeCodiceFiscale,
  validateCodiceFiscale,
} from "../../../lib/codiceFiscale";

type EditMemberProfileModalProps = {
  open: boolean;
  member: OrgAdminMemberDetail | null;
  membershipSettings?: OrgAdminMembershipSettings | null;
  saving: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: UpdateOrgAdminMemberProfileInput) => void;
};

type FormState = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  birth_date: string;
  birth_place: string;
  birth_place_code: string;
  fiscal_code: string;
  membership_type: "annual" | "temporary";
  membership_fee_snapshot: string;
  internal_notes: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  birth_date: "",
  birth_place: "",
  birth_place_code: "",
  fiscal_code: "",
  membership_type: "annual",
  membership_fee_snapshot: "",
  internal_notes: "",
};

function buildFormState(
  member: OrgAdminMemberDetail | null,
  membershipSettings?: OrgAdminMembershipSettings | null,
): FormState {
  const defaultMembershipType =
    member?.membership_type === "temporary" ? "temporary" : "annual";
  const defaultMembershipFee =
    member?.membership_fee_snapshot != null
      ? String(member.membership_fee_snapshot)
      : defaultMembershipType === "temporary"
        ? membershipSettings?.temporary_membership_fee_amount != null
          ? String(membershipSettings.temporary_membership_fee_amount)
          : ""
        : membershipSettings?.membership_fee_amount != null
          ? String(membershipSettings.membership_fee_amount)
          : "";
  if (!member) {
    return {
      ...EMPTY_FORM,
      membership_fee_snapshot:
        membershipSettings?.membership_fee_amount != null
          ? String(membershipSettings.membership_fee_amount)
          : "",
    };
  }
  return {
    first_name: member.first_name ?? "",
    last_name: member.last_name ?? "",
    email: member.email ?? "",
    phone: member.phone ?? "",
    birth_date: member.birth_date ?? "",
    birth_place: member.birth_place ?? "",
    birth_place_code: member.birth_place_code ?? "",
    fiscal_code: member.fiscal_code ?? "",
    membership_type: defaultMembershipType,
    membership_fee_snapshot: defaultMembershipFee,
    internal_notes: member.internal_notes ?? "",
  };
}

const helperTextClass = "mt-1 text-xs text-neutral-500";
const labelClass = "block text-xs font-medium uppercase tracking-[0.15em] text-neutral-500";
const inputClass =
  "mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand focus:ring-2 focus:ring-brand/20";

const EditMemberProfileModal = memo(function EditMemberProfileModal({
  open,
  member,
  membershipSettings,
  saving,
  error,
  onClose,
  onSubmit,
}: EditMemberProfileModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [municipalitySuggestions, setMunicipalitySuggestions] = useState<MunicipalitySearchItem[]>([]);
  const [municipalityLoading, setMunicipalityLoading] = useState(false);
  const [municipalityError, setMunicipalityError] = useState("");
  const [showMunicipalitySuggestions, setShowMunicipalitySuggestions] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setForm(buildFormState(member, membershipSettings));
    setFieldErrors({});
    setMunicipalitySuggestions([]);
    setMunicipalityError("");
    setShowMunicipalitySuggestions(false);
  }, [member, membershipSettings, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const query = form.birth_place.trim();
    if (query.length < 2 || form.birth_place_code) {
      setMunicipalitySuggestions([]);
      setMunicipalityLoading(false);
      return;
    }

    let cancelled = false;
    setMunicipalityLoading(true);
    setMunicipalityError("");
    const timeoutId = window.setTimeout(() => {
      searchMunicipalities(query)
        .then((items) => {
          if (cancelled) return;
          setMunicipalitySuggestions(items);
        })
        .catch(() => {
          if (cancelled) return;
          setMunicipalitySuggestions([]);
          setMunicipalityError("Ricerca comuni temporaneamente non disponibile.");
        })
        .finally(() => {
          if (!cancelled) {
            setMunicipalityLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [form.birth_place, form.birth_place_code, open]);

  const fiscalCodeValidation = useMemo(
    () =>
      validateCodiceFiscale({
        fiscalCode: form.fiscal_code,
      }),
    [form.fiscal_code],
  );

  const liveFiscalCodeError =
    form.fiscal_code.trim() && !fiscalCodeValidation.isFormallyValid
      ? "Il codice fiscale non ? valido. Verifica formato e checksum."
      : "";

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const selectMunicipality = (item: MunicipalitySearchItem) => {
    setForm((prev) => ({
      ...prev,
      birth_place: item.name,
      birth_place_code: item.code,
    }));
    setMunicipalitySuggestions([]);
    setShowMunicipalitySuggestions(false);
    setMunicipalityError("");
    setFieldErrors((prev) => {
      if (!prev.birth_place) {
        return prev;
      }
      const next = { ...prev };
      delete next.birth_place;
      return next;
    });
  };

  const handleSubmit = () => {
    const nextErrors: FormErrors = {};
    if (!form.first_name.trim()) {
      nextErrors.first_name = "Inserisci il nome.";
    }
    if (!form.last_name.trim()) {
      nextErrors.last_name = "Inserisci il cognome.";
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = "Inserisci un indirizzo email valido.";
    }
    if (form.birth_place.trim() && !form.birth_place_code.trim()) {
      nextErrors.birth_place = "Seleziona un comune dall'elenco suggerito.";
    }
    if (liveFiscalCodeError) {
      nextErrors.fiscal_code = liveFiscalCodeError;
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    onSubmit({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      birth_date: form.birth_date || null,
      birth_place: form.birth_place.trim() || null,
      birth_place_code: form.birth_place_code.trim() || null,
      fiscal_code: form.fiscal_code.trim()
        ? normalizeCodiceFiscale(form.fiscal_code).slice(0, 16)
        : null,
      internal_notes: form.internal_notes.trim() || null,
      membership_type:
        membershipSettings?.custom_membership_types_enabled
          ? form.membership_type
          : undefined,
      membership_fee_snapshot:
        membershipSettings?.custom_membership_types_enabled && form.membership_fee_snapshot.trim()
          ? Number(form.membership_fee_snapshot)
          : null,
    });
  };

  if (!open || !member) {
    return null;
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Modifica anagrafica socio"
      description="Aggiorna i dati principali del socio. Le modifiche restano tracciate nello storico attività."
      sizeClassName="max-w-4xl"
      contentClassName="rounded-[28px] border border-neutral-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,246,242,0.98))] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
    >
      <div className="space-y-6" data-component="orgadmin-edit-member-profile-modal">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="member-first-name">
              Nome
            </label>
            <input
              id="member-first-name"
              className={inputClass}
              value={form.first_name}
              onChange={(event) => updateField("first_name", event.target.value)}
              placeholder="Nome"
              disabled={saving}
            />
            {fieldErrors.first_name ? <p className="mt-1 text-xs text-red-600">{fieldErrors.first_name}</p> : null}
          </div>
          <div>
            <label className={labelClass} htmlFor="member-last-name">
              Cognome
            </label>
            <input
              id="member-last-name"
              className={inputClass}
              value={form.last_name}
              onChange={(event) => updateField("last_name", event.target.value)}
              placeholder="Cognome"
              disabled={saving}
            />
            {fieldErrors.last_name ? <p className="mt-1 text-xs text-red-600">{fieldErrors.last_name}</p> : null}
          </div>
          <div>
            <label className={labelClass} htmlFor="member-email">
              Email
            </label>
            <input
              id="member-email"
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              placeholder="nome@dominio.it"
              disabled={saving}
            />
            {fieldErrors.email ? <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p> : null}
          </div>
          <div>
            <label className={labelClass} htmlFor="member-phone">
              Telefono
            </label>
            <input
              id="member-phone"
              className={inputClass}
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              placeholder="Telefono"
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="member-birth-date">
              Data di nascita
            </label>
            <input
              id="member-birth-date"
              type="date"
              className={inputClass}
              value={form.birth_date}
              onChange={(event) => updateField("birth_date", event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="relative">
            <label className={labelClass} htmlFor="member-birth-place">
              Luogo di nascita
            </label>
            <input
              id="member-birth-place"
              className={inputClass}
              value={form.birth_place}
              onChange={(event) => {
                setShowMunicipalitySuggestions(true);
                setMunicipalityError("");
                setForm((prev) => ({
                  ...prev,
                  birth_place: event.target.value,
                  birth_place_code: "",
                }));
                setFieldErrors((prev) => {
                  if (!prev.birth_place) {
                    return prev;
                  }
                  const next = { ...prev };
                  delete next.birth_place;
                  return next;
                });
              }}
              placeholder="Comune di nascita"
              autoComplete="off"
              disabled={saving}
            />
            {municipalityLoading ? <p className={helperTextClass}>Ricerca comuni in corso...</p> : null}
            {!municipalityLoading && form.birth_place_code ? (
              <p className={helperTextClass}>Comune selezionato: codice {form.birth_place_code}</p>
            ) : null}
            {fieldErrors.birth_place ? <p className="mt-1 text-xs text-red-600">{fieldErrors.birth_place}</p> : null}
            {!fieldErrors.birth_place && municipalityError ? (
              <p className="mt-1 text-xs text-red-600">{municipalityError}</p>
            ) : null}
            {showMunicipalitySuggestions && municipalitySuggestions.length > 0 ? (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
                {municipalitySuggestions.map((item) => (
                  <button
                    key={`${item.code}-${item.name}`}
                    type="button"
                    className="flex w-full items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3 text-left last:border-b-0 hover:bg-neutral-50"
                    onClick={() => selectMunicipality(item)}
                  >
                    <span>
                      <span className="block text-sm font-medium text-neutral-900">{item.name}</span>
                      <span className="mt-0.5 block text-xs text-neutral-500">
                        {item.province ? `${item.province} • ` : ""}
                        {item.region ?? "Comune italiano"}
                      </span>
                    </span>
                    <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                      {item.code}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <label className={labelClass} htmlFor="member-fiscal-code">
              Codice fiscale
            </label>
            <input
              id="member-fiscal-code"
              className={inputClass}
              value={form.fiscal_code}
              onChange={(event) =>
                updateField("fiscal_code", normalizeCodiceFiscale(event.target.value).slice(0, 16))
              }
              placeholder="Codice fiscale"
              maxLength={16}
              disabled={saving}
            />
            {fieldErrors.fiscal_code ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.fiscal_code}</p>
            ) : liveFiscalCodeError ? (
              <p className="mt-1 text-xs text-red-600">{liveFiscalCodeError}</p>
            ) : (
              <p className={helperTextClass}>Validazione formale lato client; il controllo definitivo resta server-side.</p>
            )}
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="member-internal-notes">
            Note interne
          </label>
          <textarea
            id="member-internal-notes"
            className={`${inputClass} min-h-[140px] resize-y`}
            value={form.internal_notes}
            onChange={(event) => updateField("internal_notes", event.target.value)}
            placeholder="Annotazioni interne visibili solo agli amministratori"
            disabled={saving}
          />
        </div>

        {membershipSettings?.custom_membership_types_enabled ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="member-membership-type">
                Tipo tessera
              </label>
              <select
                id="member-membership-type"
                className={inputClass}
                value={form.membership_type}
                onChange={(event) => {
                  const nextType = event.target.value === "temporary" ? "temporary" : "annual";
                  setForm((prev) => ({
                    ...prev,
                    membership_type: nextType,
                    membership_fee_snapshot:
                      prev.membership_fee_snapshot.trim() !== ""
                        ? prev.membership_fee_snapshot
                        : nextType === "temporary"
                          ? membershipSettings.temporary_membership_fee_amount != null
                            ? String(membershipSettings.temporary_membership_fee_amount)
                            : ""
                          : membershipSettings.membership_fee_amount != null
                            ? String(membershipSettings.membership_fee_amount)
                            : "",
                  }));
                }}
                disabled={saving}
              >
                <option value="annual">Annuale</option>
                <option value="temporary">Temporanea</option>
              </select>
              <p className={helperTextClass}>
                La durata della tessera temporanea segue la regola generale impostata nella pagina Soci.
              </p>
            </div>
            <div>
              <label className={labelClass} htmlFor="member-membership-fee">
                Importo tessera
              </label>
              <input
                id="member-membership-fee"
                className={inputClass}
                type="number"
                min="0.01"
                step="0.01"
                value={form.membership_fee_snapshot}
                onChange={(event) => updateField("membership_fee_snapshot", event.target.value)}
                placeholder="Es. 30.00"
                disabled={saving}
              />
              <p className={helperTextClass}>
                Snapshot usato nel totale teorico tessere per questo socio.
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200/70 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            Annulla
          </button>
          <button type="button" className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva anagrafica"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
});

export default EditMemberProfileModal;
