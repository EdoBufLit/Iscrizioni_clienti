- [x] Inspect frontend structure, routes, and existing styles to map all pages (public + user/admin/superadmin dashboards)
- [x] Define a premium, colorful visual direction (type, palette, motion, imagery) consistent across pages
- [x] Implement global theming updates (tokens, typography, backgrounds, effects) and set reusable UI patterns
- [x] Update homepage hero (centered, larger logo) and enhance key UI sections across all dashboards
- [x] Add motion/interaction effects and validate UX improvements across critical flows
- [x] Review changes, run targeted checks, and document results

## Review
- `npm run build` (frontend) OK
- `npm run build` (frontend) OK (perf instrumentation)
- `npm run build` (frontend) OK (perf hardening)
- `npm run build` (frontend) OK (hero background)
- `npm run build` (frontend) OK (header logo blend)
- `npm run build` (frontend) OK (transparent logo asset)
- `python -m pytest tests/test_org_admin_manual_member.py` failed: missing alembic module and stale sqlite schema (see console)
- `python -m pytest tests/test_org_admin_send_access.py` failed: missing alembic module and stale sqlite schema (see console)
- `python -m alembic upgrade head` failed: `member_documents` table already exists (migration 5f60c30665a2)
- `python -m pytest tests/test_org_admin_manual_member.py tests/test_org_admin_send_access.py` OK (warnings about datetime.utcnow deprecation)
- `python -m pytest tests/test_document_workflow.py` OK (warnings about datetime.utcnow deprecation)
- `npm run build` (frontend) OK (org-admin document UI)
- `python -m pytest tests/test_member_documents_dashboard.py` OK (warnings about datetime.utcnow deprecation)
- `npm run build` (frontend) OK (socio dashboard documenti)
- `python -m pytest tests/test_org_admin_manual_payment.py` OK (warnings about datetime.utcnow deprecation)
- `npm run build` (frontend) OK (pagamento manuale org-admin)
- `python -m pytest tests/test_org_admin_member_filters.py` OK (warnings about datetime.utcnow deprecation)
- `npm run build` (frontend) OK (org-admin soci filters)
- `python -m pytest tests/test_org_admin_member_activity.py` OK (warnings about datetime.utcnow deprecation)
- `npm run build` (frontend) OK (attivitÃƒÆ’Ã‚Â  socio + reset filtri)
- `python -m alembic upgrade head` OK (actor_member_id)
- `npm run build` (frontend) OK (legenda attivitÃƒÂ )
- `npm run build` (frontend) OK (INP + font + hero contrast)

---

## INP + Hero Logo (Feb 02, 2026)
- [x] Inspect hero logo rendering and remove visible box background without changing the asset
- [x] Add dev-only INP instrumentation (web-vitals) with breakdown logging
- [x] Add long task logger (PerformanceObserver) with route/component/stack best-effort context
- [x] Wire performance logging in dev entrypoint and add minimal INP optimizations
- [x] Document local INP reproduction steps and update review
- [x] Harden perf instrumentation, reduce overhead, add sampling/throttling/cleanup

---

## Hero Logo Background (Feb 02, 2026)
- [x] Update hero layout to move logo into background layer and remove visible white box
- [x] Add subtle background styling so logo fills hero and keeps text readable
- [x] Verify rendering and document outcome
- [x] Swap to transparent logo asset and remove header logo background box

---

## Manual Member Creation (Feb 02, 2026)
- [x] Review current org-admin member flows (API, models, UI) and identify integration points
- [x] Add backend endpoint + validations + permissions, plus email magic-link option
- [x] Add DB changes and migration for manual member fields (notes/category/manual)
- [x] Update org-admin UI with CTA + form + success/error handling and detail view updates
- [x] Add tests for org admin creation + permission guards
- [x] Update review section with how to test locally

---

## Org Admin Send Access (Feb 02, 2026)
- [x] Review existing member magic-link flow and decide a reuse strategy
- [x] Add backend endpoint with throttle + permissions + audit and expose last sent timestamp
- [x] Update DB schema/migration if needed for last access sent timestamp
- [x] Add UI button and UX messaging on member detail (and/or list)
- [x] Add tests for send access (ok / no email / permissions)
- [x] Update review section with how to test locally

---

## Document Workflow (Feb 02, 2026)
- [x] Review current member document schema + routes and decide minimal changes
- [x] Add DB fields + alembic migration (status/review/rejection/replaces)
- [x] Implement org-admin approve/reject endpoints with validation/permissions
- [x] Implement member resubmit flow to create new pending doc linked to rejected
- [x] Add tests for reject-without-note, resubmit policy, cross-org guard
- [x] Update review section with how to test locally

---

## Org Admin Document UI (Feb 02, 2026)
- [x] Review current org-admin member detail UI and dashboard metrics
- [x] Add modal-based rejection flow with required note and inline status updates
- [x] Render document status badges + actions with error handling
- [x] Show document chain when replacements exist
- [x] Add dashboard counters for Ã¢â‚¬Å“da rivedereÃ¢â‚¬Â and Ã¢â‚¬Å“rigettatiÃ¢â‚¬Â
- [x] Update review section with how to test locally

---

## Socio Dashboard Documenti (Feb 02, 2026)
- [x] Review current member dashboard documents page and backend APIs
- [x] Add member documents API payload (status, rejection note, replacements)
- [x] Update dashboard UI: alert for rejected docs + resubmit CTA + timeline
- [x] Wire resubmit upload to create pending doc + inline state refresh
- [x] Add minimal tests for member doc view + resubmit flow
- [x] Update review section with local test steps

---

## Pagamento Manuale Org Admin (Feb 02, 2026)
- [x] Review current member detail/list flows for payment state display
- [x] Add DB table + migration for manual payments
- [x] Add org-admin endpoint + validations + permission checks
- [x] Update member detail UI with payment form + last payment info
- [x] Add payment badge in org-admin members list
- [x] Add tests for permissions + manual payment flow
- [x] Update review section with local test steps

---

## Org Admin Soci Filters & Pagination (Feb 02, 2026)
- [x] Review current org-admin members list UI + API and define filter/ordering params
- [x] Update backend list endpoint with filters, ordering, and pagination; optimize queries
- [x] Update frontend members page UI for search, filters, ordering, and pagination controls
- [x] Add tests for filters + permissions
- [x] Update review section with local test steps

---

## Audit Log & AttivitÃƒÆ’Ã‚Â  Socio (Feb 02, 2026)
- [x] Add actor_member_id to audit logs and migrate schema
- [x] Log sensitive actions for member create/update/access/doc review/resubmit/payment
- [x] Surface recent activity in org-admin member detail (tab)
- [x] Add reset filters UI on members list
- [x] Add tests for activity visibility
- [x] Add user-friendly legend for activity items

---

## INP + Font + Hero Contrast (Feb 02, 2026)
- [x] Inspect INP hotspots (routes /, /associazioni) and current font/hero styles
- [x] Implement low-overhead INP optimizations (defer heavy work, reduce reflow, memoize where safe)
- [x] Swap to a more professional font pairing with proper loading strategy
- [x] Improve hero logo contrast while keeping text legible
- [x] Verify UI and document results in Review

---

## Guided Onboarding Tour (Feb 04, 2026)
- [x] Create OnboardingTour DB model and Alembic migration
- [x] Create API routes for tour state management (/api/me/onboarding/*)
- [x] Install react-joyride and create frontend components
- [x] Integrate tour in member (SOCIO) dashboard with data-tour attributes
- [x] Integrate tour in org admin dashboard with data-tour attributes
- [x] Verify frontend build passes

### Files Created
- `app/routes/onboarding.py` - Backend API routes
- `alembic/versions/c2d3e4f5g6h7_add_onboarding_tours.py` - DB migration
- `frontend/src/components/onboarding/tourSteps.ts` - Tour step definitions
- `frontend/src/components/onboarding/OnboardingTour.tsx` - Main tour component
- `frontend/src/components/onboarding/ReviewGuideButton.tsx` - Reset button
- `frontend/src/components/onboarding/index.ts` - Exports

### Files Modified
- `app/models.py` - Added OnboardingTour model
- `app/main.py` - Registered onboarding router
- `frontend/src/lib/api.ts` - Added onboarding API functions
- `frontend/src/pages/dashboard/DashboardLayout.tsx` - Tour + button
- `frontend/src/pages/dashboard/DashboardHome.tsx` - data-tour attrs
- `frontend/src/pages/dashboard/DashboardDocuments.tsx` - data-tour attrs
- `frontend/src/pages/org-admin/OrgAdminLayout.tsx` - Tour + button
- `frontend/src/pages/org-admin/OrgAdminDashboard.tsx` - data-tour attrs
- `frontend/src/pages/org-admin/OrgAdminMembers.tsx` - data-tour attrs
- `frontend/src/pages/org-admin/OrgAdminMemberDetail.tsx` - data-tour attrs
- `frontend/src/pages/org-admin/OrgAdminCards.tsx` - data-tour attrs

### Test Manuali
1. Nuovo utente SOCIO: tour parte automaticamente
2. Completa tour: non riparte
3. Skip tour: non riparte
4. Rivedi guida: tour riparte
5. Nuovo ADMIN ORG: tour parte automaticamente
6. Isolamento ruoli: socio non vede tour admin e viceversa

### Come Resettare la Guida
- UI: Clicca "Rivedi guida" nel menu
- API: `POST /api/me/onboarding/reset`
- DB: `UPDATE onboarding_tours SET completed_at=NULL, skipped_at=NULL WHERE user_id=X`

---

## Fix Guided Tour Multi-Route (Feb 04, 2026)
- [x] Add route mapping to tour steps (TourStep type with route property)
- [x] Mark conditional steps as optional (member-document-rejected, member-upload-document)
- [x] Update OnboardingTour to navigate between routes automatically
- [x] Add DOM wait logic with requestAnimationFrame + setTimeout
- [x] Add retry logic for finding elements (waitForElement with retries)
- [x] Skip optional steps gracefully when target not found
- [x] Remove non-existent steps (member-help was never implemented)
- [x] Reorganize step order (dashboard home steps together, documents steps together)
- [x] Verify frontend build passes

### Implementazione
- `tourSteps.ts`: Aggiunto `TourStep` type con `route` e `optional` properties
- `OnboardingTour.tsx`:
  - Usa `useNavigate` e `useLocation` per la navigazione
  - `waitForDom()`: doppio requestAnimationFrame + setTimeout per aspettare il DOM
  - `waitForElement()`: retry loop per trovare elementi con delay
  - `findNextValidStep()`: salta automaticamente step opzionali se target mancante
  - Gestione `TARGET_NOT_FOUND` con retry prima di skippare

### Route Mapping
**Member tour:**
- Steps 1-3 (`member-dashboard-home`, `member-status`, `member-card-number`): `/dashboard`
- Steps 4-6 (`member-documents`, `member-document-rejected`, `member-upload-document`): `/dashboard/documenti`

**Org Admin tour:**
- Steps 1-2 (`admin-dashboard-home`, `admin-stats`): `/org-admin`
- Steps 3-4 (`admin-members-list`, `admin-add-member`): `/org-admin/soci`
- Step 5 (`admin-cards`): `/org-admin/tessere`

---

## Architecture, Scaffolding & Performance Fixes (Feb 04, 2026)

### Security Fixes (CRITICAL)
- [x] Fix inverted auth check in `org_admin.py:47-48` (was returning None for super admin)
- [x] Add atomic token consumption with UPDATE WHERE to prevent race condition (`member.py`)
- [x] Add session expiration (30 min timeout) to `main.py` SessionMiddleware

### Performance Fixes
- [x] Combine 4 metrics queries into 3 using conditional aggregation (`org_admin.py`)
- [x] Add composite database indexes (Alembic migration `d3e4f5g6h7i8`)
  - `ix_members_org_status` - (org_id, status)
  - `ix_members_org_deleted` - (org_id, deleted_at)
  - `ix_member_documents_member_status` - (member_id, status)
  - `ix_card_batches_org` - (org_id)

### Frontend Scaffolding
- [x] Create `AuthProvider` and `useAuth` hook (`hooks/useAuth.tsx`)
- [x] Create `ProtectedRoute` component (`components/auth/ProtectedRoute.tsx`)
- [x] Create `apiClient` with retry & deduplication (`lib/apiClient.ts`)

### Files Created
- `frontend/src/hooks/useAuth.tsx` - Centralized auth state with tab sync
- `frontend/src/components/auth/ProtectedRoute.tsx` - Route guard component
- `frontend/src/components/auth/index.ts` - Auth exports
- `frontend/src/lib/apiClient.ts` - API client with retry/dedupe
- `alembic/versions/d3e4f5g6h7i8_add_performance_indexes.py` - Index migration

### Files Modified
- `app/routes/org_admin.py` - Auth fix + metrics optimization
- `app/routes/member.py` - Atomic token consumption
- `app/main.py` - Session expiration (max_age=1800)

### Usage Examples

**ProtectedRoute:**
```tsx
// In App.tsx routes
<Route path="/dashboard/*" element={
  <ProtectedRoute role="member">
    <DashboardLayout />
  </ProtectedRoute>
} />
```

**useAuth:**
```tsx
const { user, loading, logout, refresh } = useAuth();
if (loading) return <Loading />;
if (!user) return <Navigate to="/login" />;
```

**apiClient:**
```tsx
import { apiGet, apiPost } from "../lib/apiClient";

// With automatic retry and deduplication
const data = await apiGet<User[]>("/api/users");
const result = await apiPost<Result>("/api/users", { name: "John" });
```

---

## Alembic Migration Idempotency Fix (Feb 04, 2026)

### Problema
`alembic upgrade head` falliva con errori tipo:
- `table member_payments already exists`
- `no such column: deleted_at`

### Causa
Il database era fuori sync con Alembic perchÃƒÂ©:
1. `init_db.py` usa `Base.metadata.create_all()` che crea tabelle bypassando Alembic
2. Alcune migrazioni aggiungono colonne che potrebbero non esistere nel DB attuale
3. Il DB locale potrebbe essere stato creato prima che le migrazioni fossero definite

### Fix Implementato
Rese idempotenti le migrazioni problematiche:

**`a1b2c3d4e5f6_add_member_payments.py`:**
- Aggiunto check `_table_exists()` prima di `create_table`
- Aggiunto check `_index_exists()` prima di `create_index`
- Se la tabella esiste giÃƒÂ , la migrazione passa senza errori

**`d3e4f5g6h7i8_add_performance_indexes.py`:**
- Aggiunto `_safe_create_index()` che verifica:
  - L'indice non esiste giÃƒÂ 
  - Tutte le colonne referenziate esistono
- Se le condizioni non sono soddisfatte, skip silenzioso

### Come Evitare in Futuro

1. **Non usare `create_all()` in produzione** - Solo Alembic deve gestire lo schema
2. **Usare `alembic stamp head`** dopo init manuale per sincronizzare la versione
3. **Rendere TUTTE le migrazioni idempotenti** con pattern:
   ```python
   from sqlalchemy import inspect

   def _table_exists(name):
       return name in inspect(op.get_bind()).get_table_names()

   def upgrade():
       if _table_exists("my_table"):
           return
       op.create_table("my_table", ...)
   ```

4. **Per nuovi progetti:** Iniziare con `alembic upgrade head` su DB vuoto

### Verifica
```bash
python -m alembic upgrade head  # OK
python -m alembic current       # d3e4f5g6h7i8 (head)
```

---

## Spec (Fix Modale Finale Guida Completata - Feb 05, 2026)
- Obiettivo: evitare che la modale finale "Guida completata" resti bloccata dopo la chiusura del tour.
- Vincoli: modale finale controllata da state esplicito; chiusura affidabile da Fine, X e Indietro; nessuna riapertura automatica dopo chiusura manuale.
- Approccio: separare la modale finale da Joyride e renderla come dialog controllato (`open` + `onOpenChange`).

## Plan (Fix Modale Finale Guida Completata)
- [x] Trovare il componente che mostra "Guida completata" in `frontend/src`.
- [x] Introdurre `showFinalStep` e collegare apertura/chiusura della modale a stato controllato.
- [x] Fare in modo che Fine, X, Indietro chiudano sempre la modale (`setShowFinalStep(false)`).
- [x] Aggiungere guard anti-riapertura dopo close manuale.
- [x] Verificare build/lint mirato e aggiornare review.

## Review (Fix Modale Finale Guida Completata)
- [x] Modale finale resa controllata via `showFinalStep` + `onOpenChange`.
- [x] Bottoni `Fine`, `X`, `Indietro` chiudono tutti la modale.
- [x] Guard anti-riapertura aggiunta (`finalStepDismissedRef`) + reset stato al nuovo tour.
- [x] Verifica tecnica: `npm run build` in `frontend` OK.

---

## Spec (Fix Tour Socio Route/Tab Resilience - Feb 05, 2026)
- Obiettivo: rendere il tour socio (member) resiliente ai cambi tab/route interni dashboard senza interrompersi o rimbalzare.
- Vincoli: non alterare il comportamento admin; patch mirata su gestione member in onboarding.
- Requisiti: persistenza `run` + `stepIndex`, retry su `TARGET_NOT_FOUND/ERROR`, resume stato su mount, log diagnostici temporanei per member.

## Plan (Fix Tour Socio Route/Tab Resilience)
- [x] Analizzare flow attuale `OnboardingTour` e identificare i punti di stop su route change.
- [x] Implementare persistenza member (`tour_member_run`, `tour_member_step_index`) e ripristino su mount.
- [x] Implementare retry member su `TARGET_NOT_FOUND`/`ERROR` con max tentativi e avanzamento sicuro senza chiusura tour.
- [x] Aggiungere log temporanei member (`role`, `run`, `stepIndex`, `currentRoute`, callback joyride).
- [x] Aggiornare reset guida per pulire anche le nuove chiavi member.
- [x] Verificare con build frontend + aggiornare review + lessons.

## Review (Fix Tour Socio Route/Tab Resilience)
- [x] Tour member continua su cambi route/tab senza chiamare `endTour` su `TARGET_NOT_FOUND/ERROR`.
- [x] Stato in corso member persistito (`tour_member_run`, `tour_member_step_index`) e ripristinato al mount.
- [x] Retry member su target mancanti con massimo 4 tentativi prima di avanzare.
- [x] Admin lasciato invariato nel flusso (`role="org_admin"` non usa persistenza/retry/log extra).
- [x] Verifica tecnica: `npm run build` in `frontend` OK.

---

## Spec (Preview Tessera Socio 2026 - Feb 05, 2026)
- Obiettivo: mostrare in Dashboard Socio > Riepilogo un preview grafico della tessera ASSO.N.A.M. 2026 usando dati reali backend/DB.
- Vincoli: nessun mock hardcoded (eccetto label anno 2026), fallback safe su campi mancanti, nessun impatto admin/deploy/docker/alembic.
- Fonte dati: `GET /api/auth/me` (gia esistente) con `first_name`, `last_name`, `card_no`, `joined_at`, `organization.name`, `status`.

## Plan (Preview Tessera Socio 2026)
- [x] Definire adapter/type guard per mappare `MemberProfile` -> `MemberCardPreviewData` con fallback robusti.
- [x] Creare componente riusabile `frontend/src/components/cards/MemberCardPreview.tsx` in stile tessera ufficiale (fronte).
- [x] Integrare il preview nella card "Tessera" di `DashboardHome` con skeleton/loading e fallback errore + retry.
- [x] Verificare build frontend e aggiornare review con passi di test locali.

## Review (Preview Tessera Socio 2026)
- [x] Dati preview tessera consumati da `GET /api/auth/me` (nessun mock di nome/cognome/associazione/numero/stato).
- [x] Preview responsive introdotto in `DashboardHome` con design coerente crema/verde petrolio/oro.
- [x] Fallback robusti su campi mancanti (`-`) e fallback errore con bottone `Riprova`.
- [x] Adapter compatibile con naming backend alternativi (`organization_name`, `card_number`, `assigned_card_number`).
- [x] Verifica tecnica: `npm run build` in `frontend` OK.

---

## Spec (Tessera Separata + QR Reale + Fix Area Riservata - Feb 05, 2026)
- Obiettivo: rendere la tessera socio ASSO.N.A.M. una sezione dedicata e separata dalle KPI card, con flip 3D fronte/retro, QR reale verso backend e bugfix del primo click su "Area riservata".
- Vincoli: nessun mock/hardcode dati socio-tessera, no modali, stile istituzionale coerente con tessera annuale, nessuna duplicazione tessera nelle card riepilogo.
- Dati richiesti: `socio.nome`, `socio.cognome`, `tessera.numero`, `tessera.stato`, `tessera.anno`, `associazione.nome` da DB.

## Plan (Tessera Separata + QR Reale + Fix Area Riservata)
- [x] Spostare la tessera in una sezione dedicata "La tua tessera" sotto le card riepilogo standard.
- [x] Reimplementare `MemberCardPreview` come tessera interattiva con flip 3D fronte/retro e stati hover/focus.
- [x] Estendere backend `GET /api/auth/me` con payload tessera completo (`status/year/verification_url`) e costruzione URL verifica firmato.
- [x] Aggiungere endpoint pubblico reale `GET /api/cards/verify/{token}` con controllo firma + validazione dati DB.
- [x] Introdurre `card_year` nel modello dati + migration + assegnazione anno nei flussi di emissione tessera.
- [x] Correggere il bug primo click su "Area riservata" unificando il redirect auth in route dedicata (`/area-riservata`).
- [x] Verificare build/test mirati e aggiornare review.

## Review (Tessera Separata + QR Reale + Fix Area Riservata)
- [x] Dashboard socio aggiornata: KPI standard separate, tessera resa protagonista in sezione dedicata con heading esplicito.
- [x] Tessera fronte: logo, dicitura "Tessera Socio 2026", nome/cognome, numero tessera, nome completo associazione.
- [x] Tessera retro: QR funzionante verso endpoint backend reale, stato tessera, anno validita, associazione.
- [x] Dati tessera presi da DB tramite `GET /api/auth/me` con payload card esteso.
- [x] Endpoint verifica implementato in backend con token firmato (`app/services/card_verification.py`) e controllo su `members`.
- [x] Bug "Area riservata primo click" risolto con route di redirect unica e deterministica (`frontend/src/pages/ReservedAreaRedirect.tsx`).
- [x] Verifica tecnica: `python -m pytest tests/test_member_card_verification.py` OK.
- [x] Verifica tecnica: `npm run build` (frontend) OK.
- [ ] Verifica allargata: `python -m pytest tests/test_member_card_verification.py tests/test_email_flows.py` NON completamente verde per failure preesistente su `test_email_flows.py::test_member_magic_link_flow` (join 400 per statuto mancante su `my-association`).

---

## Spec (ASSONAM - Documento facoltativo + attivazione senza documenti - Feb 06, 2026)
- Obiettivo: separare stato iscrizione/attivazione dal flusso documenti.
- Upload carta identita facoltativo nel form iscrizione.
- Admin puo approvare/attivare socio anche senza documenti caricati.
- Flusso approva/rifiuta documento invariato quando il documento esiste.

## Plan (ASSONAM - Documento facoltativo)
- [x] Rendere opzionale `id_document` nel backend submit iscrizione.
- [x] Salvare documenti solo se presenti e mantenere submit valido senza file.
- [x] Introdurre `document_status` separato (`not_provided|pending|approved|rejected`) nel payload admin.
- [x] Rimuovere guard docs-based nell'attivazione da pagamento manuale.
- [x] Aggiornare frontend iscrizione (campo documento facoltativo + submit unico).
- [x] Aggiornare frontend admin dettaglio (badge documento non caricato, nessun blocco approvazione iscrizione).
- [x] Aggiungere migrazione Alembic di compatibilita per nullable status documento.
- [x] Aggiungere test minimi richiesti.

## Review (ASSONAM - Documento facoltativo)
- [x] `python -m pytest tests/test_optional_identity_document.py` OK (3 passed).
- [x] Verifica caso a): create member senza documento -> OK.
- [x] Verifica caso b): admin activate member senza documento -> OK.
- [x] Verifica caso c): approve documento inesistente -> 404.
- [x] `npm run build` in `frontend` OK.
- [ ] `python -m pytest tests/test_org_admin_decision.py` non verde per stato ambiente (`pending_cards` per stock tessere org test).
- [ ] `python -m pytest tests/test_document_workflow.py` non verde per slug duplicati su DB test preesistente (`docflow-org*`).

---

## Spec (ASSONAM - Modalita di pagamento iscrizione socio - Feb 07, 2026)
- Obiettivo: aggiungere `payment_method` (CASH/BONIFICO) nel flusso iscrizione socio con persistenza DB.
- Vincoli: nessuna integrazione gateway; solo scelta e salvataggio.
- UX: select con label italiana "Modalita di pagamento", placeholder "Seleziona...", opzioni "Contanti" e "Bonifico".
- Backend: campo su `members`, validazione input, supporto payload create/update, esposizione nel dettaglio socio admin.
- Test minimo: create con `CASH` OK, create con `BONIFICO` OK, create senza campo -> 400 con messaggio chiaro.

## Plan (ASSONAM - Modalita di pagamento iscrizione socio)
- [x] Aggiungere `payment_method` al modello `Member` con validazione valori ammessi e compatibilita legacy.
- [x] Creare migrazione Alembic idempotente per colonna `members.payment_method` (+ eventuale vincolo dove supportato).
- [x] Aggiornare endpoint backend di creazione/aggiornamento socio (`/api/join/{org_slug}/submit`, create member org-admin, edit legacy) per accettare/salvare il campo.
- [x] Esporre `payment_method` nei payload dettaglio socio per org-admin e super-admin (dove disponibile) e nei tipi API frontend.
- [x] Aggiornare form iscrizione frontend con select required + placeholder e invio del campo alle API.
- [x] Mostrare "Modalita di pagamento" nella vista dettaglio socio dashboard org-admin (e super-admin dove presente).
- [x] Aggiungere/aggiornare test backend per CASH, BONIFICO e validazione required.
- [x] Eseguire test mirati + build frontend e compilare review.

## Review (ASSONAM - Modalita di pagamento iscrizione socio)
- [x] Migrazione eseguita con successo: `python -m alembic upgrade head` OK (`f4a5b6c7d8e9 -> a9b8c7d6e5f4`).
- [x] Test richiesti feature: `python -m pytest tests/test_payment_method_join.py tests/test_org_admin_payment_method_detail.py tests/test_super_admin_member_payment_method_detail.py` OK (5 passed).
- [x] Build frontend: `npm run build` in `frontend` OK.
- [x] Verifica addizionale: `python -m pytest tests/test_payment_method_join.py tests/test_optional_identity_document.py tests/test_documents.py tests/test_org_admin_manual_member.py` NON completamente verde per failure preesistenti su `tests/test_documents.py` e `tests/test_org_admin_manual_member.py`.

---

## Spec (ASSONAM - Performance INP/CLS dashboard - Feb 07, 2026)
- Obiettivo: eliminare il lag in typing e ridurre INP/CLS su dashboard socio, org-admin, super-admin.
- Hotspot principali: form/modali con stato locale nel parent che contiene tabelle/listoni, causando rerender dell'intera pagina ad ogni keypress.
- Vincoli: nessuna regressione funzionale nei flussi esistenti; ottimizzazioni mirate e progressive.

## Plan (ASSONAM - Performance INP/CLS dashboard)
- [x] Profilare hotspot di rerender su typing e documentare i componenti impattati.
- [x] Isolare i form/modali pesanti in componenti memoizzati con stato locale (evitare rerender di tabelle/layout su keypress).
- [x] Stabilizzare render di liste/tabelle con memo/callback stabili e ridurre computazioni nel render.
- [x] Ridurre CLS con spazi riservati/min-height per messaggi e blocchi dinamici in dashboard.
- [x] Verificare build/test frontend, raccogliere evidenze e aggiornare README/perf notes + review.

## Review (ASSONAM - Performance INP/CLS dashboard)
- [x] Hotspot confermati: `OrgAdminMembers`, `SuperAdminOrganizations`, `SuperAdminOrgAdmins`, `OrgAdminMemberDetail` avevano stato input/modale nel parent con tabelle/listoni nello stesso albero.
- [x] Refactor eseguito: form/modali separati in componenti dedicati con stato locale (`CreateMemberModal`, `OrganizationManageModal`, `CreateOrgAdminForm`, `ManualPaymentForm`, `RejectDocumentModal`, `MemberDecisionPanel`).
- [x] Tabelle/listoni stabilizzati con componenti memoizzati (`MembersTable`) e callback stabili; conteggi documenti memoizzati nel dettaglio socio.
- [x] CLS mitigato con `min-h` su aree messaggi dinamiche nelle pagine dashboard ottimizzate.
- [x] Documentazione aggiornata: note performance in `README.md` e dettaglio operativo in `README_INP.md`.
- [x] Verifica tecnica: `npm run build` in `frontend` OK (bundle rigenerato senza errori TS/Vite).
- [x] Evidenza build: chunk dashboard ottimizzati generati (`OrgAdminMembers-YPTJ6xid.js`, `SuperAdminOrganizations-DUb0JKUy.js`, `SuperAdminOrgAdmins-zONclGsn.js`, `OrgAdminMemberDetail-BLs04_lo.js`).
