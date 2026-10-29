import { type FormEvent } from "react";
import type { OrgAdminMembershipSettings } from "../../../../lib/api";

export default function CardMembershipRules({ settings, saving, error, onSubmit }: {
  settings: OrgAdminMembershipSettings;
  saving: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <details className="cards-panel cards-rules">
    <summary>Regole di emissione, prezzi e durata</summary>
    <form aria-label="Regole di emissione" onSubmit={onSubmit} className="mt-4">
      <fieldset disabled={saving} className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="cards-field"><span>Prezzo annuale</span><input type="number" step="0.01" min="0.01" name="membership_fee_amount" defaultValue={settings.membership_fee_amount ?? ""} inputMode="decimal" /></label>
          <label className="cards-field"><span>Valuta</span><input type="text" name="membership_fee_currency" maxLength={3} pattern="[A-Za-z]{3}" title="Codice valuta di tre lettere, per esempio EUR" defaultValue={settings.membership_fee_currency ?? "EUR"} /></label>
          {settings.custom_membership_types_enabled && <>
            <label className="cards-field col-span-2"><span>Prezzo temporanea</span><input type="number" step="0.01" min="0.01" name="temporary_membership_fee_amount" defaultValue={settings.temporary_membership_fee_amount ?? ""} inputMode="decimal" /></label>
            <label className="cards-field"><span>Durata temporanea</span><input type="number" min="1" step="1" name="temporary_membership_duration_value" defaultValue={settings.temporary_membership_duration_value ?? 1} inputMode="numeric" /></label>
            <label className="cards-field"><span>Unità</span><select name="temporary_membership_duration_unit" defaultValue={settings.temporary_membership_duration_unit ?? "days"}><option value="days">Giorni</option><option value="hours">Ore</option></select></label>
          </>}
        </div>
        <label className="cards-rules-cash"><input type="checkbox" name="cash_only_signup_payment" defaultChecked={settings.cash_only_signup_payment ?? false} disabled={settings.online_payment_required} /><span>Solo contanti nel modulo di iscrizione</span></label>
        {settings.online_payment_required && <p className="cards-hint">Il pagamento online obbligatorio si gestisce dalle impostazioni dell'associazione.</p>}
        {error && <p role="alert" className="text-sm text-[var(--theme-danger)]">{error}</p>}
        <button type="submit" className="btn-primary w-full justify-center sm:w-auto">{saving ? "Salvataggio…" : "Salva regole"}</button>
      </fieldset>
    </form>
  </details>;
}
