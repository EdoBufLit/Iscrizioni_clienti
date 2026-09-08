import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import ModalShell from "../../../components/ui/ModalShell";
import {
  AuthError, CardLotStepUpRequiredError, createAutomaticCardLot,
  fetchSuperAdminOrganizations, previewAutomaticCardLot, stepUpSuperAdmin,
  type CardLotPreview, type CardLotRegistryItem, type SuperAdminOrganization,
} from "../../../lib/api";
import { SuperAdminActionButton, SuperAdminIcon } from "./SuperAdminPrimitives";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (item: CardLotRegistryItem) => void;
  onAuthError: () => void;
};

export default function CreateCardLotModal({ open, onClose, onCreated, onAuthError }: Props) {
  const [organizations, setOrganizations] = useState<SuperAdminOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [quantity, setQuantity] = useState("100");
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [organizationError, setOrganizationError] = useState("");
  const [reload, setReload] = useState(0);
  const [preview, setPreview] = useState<CardLotPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [needsStepUp, setNeedsStepUp] = useState(false);
  const [stepUpCode, setStepUpCode] = useState("");
  const selectRef = useRef<HTMLSelectElement>(null);
  const submittingRef = useRef(false);
  const attemptRef = useRef<{ signature: string; key: string } | null>(null);
  const quantityNumber = /^\d+$/.test(quantity) ? Number(quantity) : 0;
  const quantityValid = Number.isInteger(quantityNumber) && quantityNumber >= 1 && quantityNumber <= 100000;
  const selectedOrg = organizations.find((org) => String(org.id) === organizationId);
  const currentPreview = preview?.organization_id === Number(organizationId) && preview.quantity === quantityNumber ? preview : null;
  const canCreate = Boolean(currentPreview && selectedOrg && quantityValid && !loadingPreview && !loadingOrganizations && !organizationError);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoadingOrganizations(true);
    setOrganizationError("");
    void (async () => {
      try {
        const first = await fetchSuperAdminOrganizations({ pageSize: 100, signal: controller.signal });
        const all = [...first.items];
        for (let page = 2; page <= first.total_pages; page += 1) {
          const next = await fetchSuperAdminOrganizations({ page, pageSize: 100, signal: controller.signal });
          all.push(...next.items);
        }
        if (!controller.signal.aborted) {
          setOrganizations(all.filter((org) => !org.deleted_at && !org.is_archived).sort((a, b) => a.name.localeCompare(b.name, "it")));
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        if (caught instanceof AuthError) onAuthError();
        else setOrganizationError(caught instanceof Error ? caught.message : "Impossibile caricare le associazioni");
      } finally {
        if (!controller.signal.aborted) setLoadingOrganizations(false);
      }
    })();
    return () => controller.abort();
  }, [open, reload, onAuthError]);

  useEffect(() => {
    setPreview(null);
    setPreviewError("");
    if (!open || !selectedOrg || !quantityValid) {
      setLoadingPreview(false);
      return;
    }
    const controller = new AbortController();
    setLoadingPreview(true);
    const timer = window.setTimeout(() => {
      void previewAutomaticCardLot(selectedOrg.id, quantityNumber, controller.signal)
        .then((value) => { if (!controller.signal.aborted) setPreview(value); })
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          if (caught instanceof AuthError) onAuthError();
          else setPreviewError(caught instanceof Error ? caught.message : "Impossibile calcolare l'intervallo");
        })
        .finally(() => { if (!controller.signal.aborted) setLoadingPreview(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, selectedOrg, quantityNumber, quantityValid, reload, onAuthError]);

  const close = useCallback(() => { if (!submittingRef.current) onClose(); }, [onClose]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate || !currentPreview || submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    setError("");
    try {
      if (needsStepUp) {
        await stepUpSuperAdmin(stepUpCode.trim());
        setNeedsStepUp(false);
        setStepUpCode("");
      }
      const signature = `${organizationId}:${quantityNumber}:${currentPreview.year}`;
      if (attemptRef.current?.signature !== signature) {
        attemptRef.current = { signature, key: crypto.randomUUID() };
      }
      const result = await createAutomaticCardLot({
        organization_id: Number(organizationId), quantity: quantityNumber,
        year: currentPreview.year, idempotency_key: attemptRef.current.key,
      });
      attemptRef.current = null;
      setPreview(null);
      onCreated(result.item);
    } catch (caught) {
      if (caught instanceof AuthError) onAuthError();
      else if (caught instanceof CardLotStepUpRequiredError) {
        setNeedsStepUp(true);
        setError(caught.message);
      } else {
        setError(caught instanceof TypeError ? "Connessione interrotta. Riprova con gli stessi dati per verificare la creazione del lotto." : caught instanceof Error ? caught.message : "Impossibile creare il lotto");
      }
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <ModalShell open={open} title="Nuovo lotto" description="Scegli l'associazione e quante tessere aggiungere."
      onClose={close} closeDisabled={saving} closeOnEscape={!saving} closeOnOverlay={!saving}
      initialFocusRef={selectRef} contentClassName="max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6">
      <form onSubmit={save} className="space-y-5">
        <div>
          <label htmlFor="new-lot-organization" className="mb-2 block text-sm font-semibold text-neutral-800">Associazione</label>
          <select ref={selectRef} id="new-lot-organization" className="theme-input min-h-11 w-full px-3 py-2" value={organizationId}
            disabled={loadingOrganizations || saving} required
            onChange={(event) => { setOrganizationId(event.target.value); setError(""); }}>
            <option value="">{loadingOrganizations ? "Caricamento associazioni…" : "Seleziona un'associazione"}</option>
            {organizations.map((org) => <option value={org.id} key={org.id}>{org.name}{org.club_display_name && org.club_display_name !== org.name ? ` · ${org.club_display_name}` : ""}</option>)}
          </select>
          {organizationError ? <div role="alert" className="mt-2 text-sm text-red-700">{organizationError} <button type="button" className="underline" onClick={() => setReload((value) => value + 1)}>Riprova</button></div> : null}
        </div>
        <div>
          <label htmlFor="new-lot-quantity" className="mb-2 block text-sm font-semibold text-neutral-800">Numero di tessere</label>
          <input id="new-lot-quantity" className="theme-input min-h-11 w-full px-3 py-2" type="number" min="1" max="100000" step="1" inputMode="numeric"
            value={quantity} required disabled={saving} aria-invalid={!quantityValid} aria-describedby={!quantityValid ? "new-lot-quantity-error" : undefined}
            onChange={(event) => { setQuantity(event.target.value); setError(""); }} />
          <div className="mt-2 flex gap-2" aria-label="Quantità rapide">
            {[100, 300, 500].map((amount) => <button key={amount} type="button" disabled={saving} aria-pressed={quantityNumber === amount}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${quantityNumber === amount ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-800" : "border-neutral-200 text-neutral-600 hover:border-emerald-600"}`}
              onClick={() => { setQuantity(String(amount)); setError(""); }}>{amount}</button>)}
          </div>
          {!quantityValid ? <p id="new-lot-quantity-error" className="mt-2 text-sm text-red-700">Inserisci un numero intero da 1 a 100.000.</p> : null}
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4" aria-live="polite" aria-busy={loadingPreview}>
          <div className="flex items-center justify-between gap-3 text-sm text-emerald-900">
            <span className="flex items-center gap-2 font-semibold"><SuperAdminIcon name="cards" className="h-4 w-4" />Intervallo previsto</span>
            {currentPreview ? <span>Anno {currentPreview.year}</span> : null}
          </div>
          {loadingPreview ? <p className="mt-3 text-sm text-emerald-800">Calcolo dell'intervallo…</p> : currentPreview ? <>
            <p className="mt-3 text-2xl font-semibold tabular-nums text-emerald-950">{currentPreview.range_start_label} <span className="font-normal text-emerald-700">–</span> {currentPreview.range_end_label}</p>
            <p className="mt-2 text-sm text-emerald-800">{currentPreview.quantity.toLocaleString("it-IT")} tessere · {selectedOrg?.numbering_mode === "shared_assonam" ? "Numerazione condivisa ASSONAM" : "Numerazione dell'associazione"}</p>
            <p className="mt-2 text-xs leading-5 text-emerald-800">L'intervallo definitivo viene confermato alla creazione.</p>
          </> : <p className="mt-3 text-sm text-emerald-800">Seleziona l'associazione e la quantità per vedere i numeri del nuovo lotto.</p>}
        </div>
        {previewError ? <p role="alert" className="text-sm text-red-700">{previewError} <button type="button" className="underline" onClick={() => setReload((value) => value + 1)}>Ricalcola</button></p> : null}
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {needsStepUp ? <div>
          <label htmlFor="new-lot-auth-code" className="mb-2 block text-sm font-semibold text-neutral-800">Codice di autenticazione</label>
          <input id="new-lot-auth-code" className="theme-input min-h-11 w-full px-3 py-2" autoComplete="one-time-code" inputMode="numeric" required value={stepUpCode}
            disabled={saving} onChange={(event) => setStepUpCode(event.target.value)} />
        </div> : null}
        <div className="flex flex-wrap justify-end gap-3 border-t border-neutral-200 pt-4">
          <SuperAdminActionButton onClick={close} disabled={saving}>Annulla</SuperAdminActionButton>
          <SuperAdminActionButton type="submit" tone="primary" icon="plus" disabled={!canCreate || saving || (needsStepUp && !stepUpCode.trim())}>
            {saving ? "Creazione in corso…" : needsStepUp ? "Verifica e crea lotto" : "Crea lotto"}
          </SuperAdminActionButton>
        </div>
      </form>
    </ModalShell>
  );
}
