# Come misurare INP localmente

Questa guida vale **solo in dev**. In produzione è **OFF** salvo `VITE_PERF_LOG=1`.

## Avvio
1. `cd frontend`
2. `npm install`
3. `npm run dev`
4. Apri l’app in Chrome/Edge e apri la Console di DevTools.

Per forzare il logger in qualsiasi ambiente:
```
VITE_PERF_LOG=1 npm run dev
```

Per cambiare sampling o throttle:
```
VITE_PERF_SAMPLE_RATE=0.1 VITE_PERF_INP_THROTTLE_MS=2000 VITE_PERF_LONGTASK_THROTTLE_MS=2000 npm run dev
```

## Dove misurare (pagine)
- Home (`/`)
- Login (`/login`)
- Dashboard (`/dashboard`)
- Super Admin > Associazioni (`/super-admin/associazioni`)

## Azioni suggerite (riproduzione)
- **Home:** click su “Menu” (mobile) e “Area riservata”.
- **Login:** click su “Accedi” dopo compilazione campi.
- **Dashboard:** cambia tab (Riepilogo / Profilo / Documenti).
- **Super Admin > Associazioni:** apri “Nuova associazione” (modal) e usa il pulsante “Gestione” su una riga.
- **Fetch organizzazioni:** apri la pagina “Associazioni” nel pannello Super Admin (triggera il fetch).

## Output atteso in Console
- Log `[INP] ...` con breakdown:
  - `inputDelay`
  - `processingTime`
  - `presentationDelay`
- Log `[LongTask] ...` con route, component (se presente), target, stack (best-effort).

> Nota: i log includono `route` e `data-component` quando disponibili.

## Aggiornamenti Dashboard (Feb 07, 2026)

Ottimizzazioni applicate per ridurre INP/lag su typing e contenere CLS:

- `OrgAdminMembers`: modale "Aggiungi socio" estratta in componente memoizzato (`CreateMemberModal`) con stato locale; tabella/lista separata (`MembersTable`); ricerca debounced isolata (`DebouncedSearchInput`).
- `SuperAdminOrganizations`: form/modali create/range/lotti estratti in `OrganizationManageModal` con stato locale, evitando rerender della tabella durante il typing.
- `SuperAdminOrgAdmins`: form "Nuovo amministratore" estratto in `CreateOrgAdminForm` con stato locale; la tabella admin non rerendera ad ogni keypress email.
- `OrgAdminMemberDetail`: form pagamento, rigetto documento e decisione finale isolati in componenti dedicati (`ManualPaymentForm`, `RejectDocumentModal`, `MemberDecisionPanel`) per limitare il rerender del dettaglio completo mentre si digita.
- CLS: introdotti blocchi con altezza minima per messaggi dinamici nelle pagine dashboard ottimizzate.
- Follow-up lag (presentation delay): su route dashboard/admin e attiva `dashboard-perf-mode` (niente scene background animato, niente page transition framer-motion, meno `backdrop-filter` su `surface`/`surface-strong`/`header-band`).
- Modale "Aggiungi socio" rifattorizzata in modalita quasi-uncontrolled (submit con `FormData`) per evitare setState su ogni keypress.
- Modali principali uniformati su `modal-panel` statico (senza blur glass) per ridurre costo di compositing.

### Verifica rapida consigliata

1. Avvia: `VITE_PERF_LOG=1 npm run dev`
2. Apri pagine dashboard coinvolte e digita nei campi form/modali.
3. Confronta log `[INP]` e `[LongTask]` prima/dopo sulle stesse interazioni.
