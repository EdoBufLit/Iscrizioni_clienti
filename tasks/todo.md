- [x] Individuare perch� il logo ASSONAM non viene renderizzato nella mail tessera inviata da flusso API/thank-you
- [x] Correggere URL logo nel template email integrazione usando asset compatibile client mail
- [x] Aggiungere regressione test su HTML email per evitare ritorno a SVG non compatibile
- [x] Eseguire test mirati integrazione/ingest e documentare risultato

## Review (Fix logo mail tessera API - Feb 19, 2026)
- `python -m pytest tests/test_integration_issue_member.py::test_issue_member_captures_html_email_with_verification_url -q` -> 1 passed
- `python -m pytest tests/test_ingest_pienissimo.py::test_ingest_retry_100x_is_idempotent_and_sends_email_once -q` -> 1 passed
- Fix applicato in `app/services/integration_issuer.py`: `logo_url` ora usa `frontend_base/logo-transparent.png` (PNG, pi� compatibile in email)

---
- [x] Riprodurre errore 500 creazione integration key da super admin e identificare causa
- [x] Hardening backend create/rotate key con gestione vincoli legacy UNIQUE(org_id,name) su integration_api_keys
- [x] Restituire errore applicativo (409) al posto di 500 generico su conflitti di vincolo
- [x] Aggiungere test regressione per schema legacy con unique parziale org+name
- [x] Eseguire test mirati endpoint super-admin keys

## Review (Fix 500 create integration key - Feb 17, 2026)
- `python -m pytest tests/test_org_admin_integration_keys.py` -> 5 passed
- Fix applicato in `app/routes/super_admin.py`: fallback legacy-safe quando presente vincolo unico org+name non migrato

---
- [x] FE super-admin: aggiungere API client integration-keys (list/create/rotate/disable) con error handling 401/403
- [x] FE super-admin: creare SuperAdminPienissimoIntegrationCard con stato key attiva, last_used_at e azioni
- [x] FE super-admin: modal one-time raw key con copy + warning e reset visibilita alla chiusura
- [x] FE super-admin: integrare sezione Integrazione Pienissimo in pagina Associazioni (solo role super_admin)
- [x] Verificare assenza residui org-admin UI/API keys e build frontend

## Review (Super Admin FE Integration Keys - Feb 17, 2026)
- `npm --prefix frontend run build` -> OK
- Verifica manuale codice: nessuna chiamata FE a `/api/org-admin/integrations/keys*`
- Sezione integrazione visibile solo in `SuperAdminOrganizations` con `profile.role === "super_admin"`

---
- [x] Aggiornare security con IntegrationContext (key_id, org_id, scopes) e enforcement key->org nell'issuer
- [x] Estrarre logica issuer in service riusabile issue_member_from_integration
- [x] Aggiungere endpoint ingest POST /api/ingest/pienissimo/{org_slug} con X-ASSO-INGEST-SECRET
- [x] Mappare payload Pienissimo flessibile e fallback external_customer_id con hash(email+org_slug)
- [x] Confermare super-admin only key management e assenza endpoint/UI org-admin keys
- [x] Aggiornare settings/docs con INGEST_SECRET
- [x] Aggiungere test: ingest 401/200, issuer key-org mismatch, regressioni key endpoints
- [x] Eseguire test mirati e documentare review

## Review (Ingest Pienissimo option A - Feb 17, 2026)
- `python -m pytest tests/test_integration_issue_member.py tests/test_org_admin_integration_keys.py tests/test_ingest_pienissimo.py` -> 11 passed
- `python -m pytest tests/test_signup_fixes.py` -> 6 passed
- `npm --prefix frontend run build` -> OK
- `DATABASE_URL=sqlite:///tmp_option_a_empty.db python -m alembic upgrade head` -> OK
- `DATABASE_URL=sqlite:///tmp_option_a_existing.db python -m alembic upgrade head` con `member_documents` preesistente -> OK

---
- [x] Identificare tutti i riferimenti FE org-admin a integrazioni/API key/Pienissimo
- [x] Rimuovere sezione UI Integrazioni dall'area org-admin (settings/cards/menu)
- [x] Eliminare funzioni e tipi API client verso /api/org-admin/integrations/keys*
- [x] Verificare che il badge signup_source in tab Soci resti invariato
- [x] Eseguire build frontend e controllo link/route/chiamate residue

## Review (FE cleanup org-admin integration keys - Feb 17, 2026)
- npm run build (frontend) OK
- Nessun riferimento FE residuo a /api/org-admin/integrations/keys* o UI "Integrazioni/Pienissimo key"
- Badge INTEGRAZIONE in tab Soci mantenuto (usa signup_source)

---
- [x] Mappare implementazione IntegrationApiKey corrente (org-admin + issue endpoint) e definire refactor target super-admin only
- [x] Rimuovere completamente endpoint org-admin integration keys (devono risultare 404)
- [x] Implementare endpoint super-admin per list/create/rotate/disable chiavi per organizzazione
- [x] Verificare hardening require_integration_key e assenza raw_key fuori create/rotate
- [x] Aggiornare test: super-admin create key, org-admin access denied/404, issue endpoint con key super-admin
- [x] Aggiornare documentazione (README/ENV_REQUIRED) con ownership super-admin ASSONAM
- [x] Eseguire test mirati e aggiornare review

## Review (Integration keys super-admin only - Feb 17, 2026)
- python -m pytest tests/test_org_admin_integration_keys.py tests/test_integration_issue_member.py -> 8 passed
- Verifica funzionale: endpoint /api/org-admin/integrations/keys* non pi� registrati; GET/POST/PATCH/DELETE su path rimossi rispondono 404 (fallback API)
- /api/integrations/members/issue invariato su header X-ASSONAM-API-KEY, con update last_used_at/last_used_ip/last_used_user_agent su chiave attiva

---
- [x] Analizzare payload membri/org-admin esistenti e mappare dove rendere visibili signup_source e gestione chiavi
- [x] Aggiornare tabella Soci con badge "INTEGRAZIONE" + sorgente senza alterare filtri/ordinamenti
- [x] Aggiungere sezione "Integrazioni" in OrgAdminSettings con stato key, genera/rigenera, disattiva, reveal one-time e copia
- [x] Verificare compilazione frontend e documentare esito in Review
## Review (Frontend integrazione Pienissimo - Feb 17, 2026)
- npm run build (frontend) OK (badge integrazione soci + gestione chiavi API)
---
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
---
## Spec (ASSONAM - Performance follow-up lag alto in input/modal - Feb 07, 2026)
- Evidenza utente: INP ancora alto (~424ms) con breakdown dominato da `presentationDelay` durante interazione su input/modal dashboard.
- Ipotesi principale: costo compositing/paint elevato da glass UI (`backdrop-filter`, gradient overlay, hover transforms) e sfondo scenico animato attivi anche sulle route dashboard.
- Obiettivo: ridurre latenza percepita su click/focus/typing in form dashboard, mantenendo flussi invariati.
## Plan (ASSONAM - Performance follow-up lag alto in input/modal)
- [x] Introdurre modalita performance per route dashboard/admin e attenuare effetti visivi costosi (blur/backdrop/overlay animati) in quel contesto.
- [x] Rendere il form "Aggiungi socio" principalmente uncontrolled (FormData submit) per eliminare rerender per keypress.
- [x] Sostituire i pannelli modali principali con stile statico senza `backdrop-filter` per limitare repaint.
- [x] Verificare build frontend e aggiornare note/review.
## Review (ASSONAM - Performance follow-up lag alto in input/modal)
- [x] Aggiunta `dashboard-perf-mode` sulle route admin/dashboard in `Layout`: disattivati sfondo scenico animato e page transition framer-motion su quelle route.
- [x] Override CSS performance su dashboard: rimozione `backdrop-filter`/glass overlay per `surface`, `surface-strong`, `header-band`; hover meno costosi.
- [x] Form modal "Aggiungi socio" rifattorizzato in modalita quasi-uncontrolled (`FormData` submit), eliminando setState per keypress nei campi testo.
- [x] Modali principali convertiti a pannello statico `modal-panel` (senza blur) per ridurre paint/compositing.
- [x] Verifica tecnica: `npm run build` in `frontend` OK.
---
## Spec (Dashboard socio - Fix flip tessera no specchio + logo fisso - Feb 07, 2026)
- Obiettivo: correggere il flip 3D della tessera socio evitando qualsiasi testo specchiato durante/after rotate.
- Vincoli UX: retro minimal (solo QR grande + dati essenziali), logo ASSONAM sempre fisso/non ruotato come overlay.
- Accessibilit�: flip via click + Enter/Space, aria-label chiara, no text selection durante animazione.
- Impatto: patch limitata a `MemberCardPreview` e CSS dedicato in `frontend/src/index.css`.
## Plan (Dashboard socio - Fix flip tessera)
- [x] Rifattorizzare markup in struttura flip standard (`wrapper`/`inner`/`front`/`back`) con facce assolute e backface hidden.
- [x] Spostare logo ASSONAM fuori da `inner` e renderlo overlay assoluto non ruotante.
- [x] Ridurre il retro a QR grande + massimo 3 righe dati essenziali (numero, nome, anno) mantenendo endpoint QR attuale.
- [x] Garantire interazione accessibile (click/Enter/Space, aria-label) e `user-select: none`.
- [x] Verificare build frontend e aggiornare review.
## Review (Dashboard socio - Fix flip tessera)
- [x] Struttura flip standard applicata: `member-card-flip` (perspective), `member-card-flip-inner` (preserve-3d + rotateY), facce front/back assolute con `backface-visibility` nascosta.
- [x] Logo ASSONAM estratto dal layer ruotato e reso overlay fisso (`absolute`, `z-10`, `pointer-events-none`), senza duplicazioni.
- [x] Retro semplificato: QR grande centrale + 3 righe essenziali (`Numero tessera`, `Nome`, `Anno`) senza testi front duplicati/specchiati.
- [x] Accessibilita: flip via bottone (click + Enter/Space nativi), `aria-label="Ruota tessera"`, `user-select: none` sul wrapper.
- [x] Verifica tecnica: `npm run build` in `frontend` OK.
---
## Spec (Dashboard socio - Follow-up flip ancora specchiato - Feb 07, 2026)
- Obiettivo: eliminare definitivamente il rendering specchiato del fronte quando la card e in stato flipped.
- Approccio: rendere front/back figli diretti di uno stage unico ruotato, con proprieta 3D/backface rinforzate anche inline.
## Plan (Follow-up flip specchiato)
- [x] Sostituire `member-card-flip-inner` con `member-card-flip-stage` e ridurre livelli annidati nel DOM della card.
- [x] Rinforzare `backface-visibility` e `transform-style` (incluse varianti WebKit) su stage e facce.
- [x] Verificare build frontend e aggiornare review.
## Review (Follow-up flip specchiato)
- [x] Front/back resi figli diretti dello stage ruotato, evitando layering ambiguo che mostrava il fronte specchiato.
- [x] Aggiunte proprieta 3D robuste (`preserve-3d`, `backface-visibility`, `translateZ`) a livello CSS + inline sulle facce.
- [x] Verifica tecnica: `npm run build` in `frontend` OK.
---
## Spec (Fix Favicon ASSONAM tab browser - Feb 08, 2026)
- Obiettivo: mostrare il logo ASSONAM nella scheda browser al posto della favicon errata.
- Vincoli: modifica minima, nessun impatto su routing/API, compatibile con build Vite.
## Plan (Fix Favicon ASSONAM)
- [ ] Aggiornare `frontend/index.html` per usare il logo ASSONAM come favicon.
- [ ] Eliminare la favicon legacy non coerente (`frontend/public/favicon.svg`).
- [ ] Eseguire verifica tecnica (`npm run build` frontend) e aggiornare review.
## Execution (Fix Favicon ASSONAM)
- [x] Aggiornato `frontend/index.html` per usare il logo ASSONAM come favicon (`/logo-transparent.png?v=2026-02-08`).
- [x] Eliminata favicon legacy non coerente (`frontend/public/favicon.svg`).
- [x] Verifica tecnica completata: `npm run build` in `frontend` OK.
---
## Spec (SEO Audit completo + remediation - Feb 08, 2026)
- Obiettivo: eseguire audit SEO tecnico/on-page completo e correggere le criticita principali direttamente nel codice.
- Scope: crawlability/indexation, meta tags, canonical, OG/Twitter, robots/sitemap, soft-404 SPA, pagine trust base.
- Vincoli: impatto minimo sui flussi applicativi, nessuna regressione su routing dashboard/API.
## Plan (SEO Audit + Fix)
- [x] Implementare gestione SEO centralizzata frontend (title, description, canonical, robots, OG/Twitter) con regole per route pubbliche/private.
- [x] Migliorare SEO dinamico su pagine associazione/iscrizione e aggiungere structured data nella home.
- [x] Aggiungere endpoint backend `sitemap.xml` (con URL statiche + associazioni attive da DB) e `robots.txt` statico frontend.
- [x] Aggiungere pagina Privacy pubblica e link interno dal footer per trust/compliance base.
- [x] Eseguire verifica tecnica (build frontend + smoke checks backend) e documentare review in `tasks/todo.md`.
## Execution (SEO Audit + Fix)
### Frontend: applySeo() wired into all pages
- `Home.tsx`: title, description, canonical, Organization + FAQPage JSON-LD
- `LoStudio.tsx`: title, description, canonical
- `Servizi.tsx`: title, description, canonical
- `Associazioni.tsx`: title, description, canonical
- `AffiliazioneDettaglio.tsx`: dynamic title/description from DB, Organization JSON-LD
- `Iscrizione.tsx`: dynamic title from org name, noindex
- `Contatti.tsx`: title, description, canonical, ContactPage JSON-LD
- `Login.tsx`: title, description, noindex
- `Register.tsx`: title, description, noindex
- `NotFound.tsx`: title, noindex
- `DashboardLayout.tsx`: noindex
- `AdminLayout.tsx`: noindex
- `OrgAdminLayout.tsx`: noindex
- `SuperAdminLayout.tsx`: noindex
### Frontend: index.html fallback meta
- Meta description, robots, canonical in static HTML
- Full Open Graph tags (type, title, description, url, site_name, locale, image)
- Twitter Card tags (summary_large_image)
### Frontend: robots.txt
- `frontend/public/robots.txt`: Allow /, Disallow private routes, Sitemap reference
### Backend: sitemap.xml endpoint
- `app/routes/public.py`: GET /sitemap.xml — static pages + active organizations from DB
### Frontend: Privacy page
- `frontend/src/pages/Privacy.tsx`: GDPR-compliant privacy policy
- Route added in App.tsx: `/privacy`
- Footer link updated from unlinked `<span>` to `<Link to="/privacy">`
## Review (SEO Audit + Fix)
- [x] `npm run build` in `frontend` OK.
- [x] Tutte le pagine pubbliche hanno title, description, canonical, OG e Twitter Card.
- [x] Pagine private (dashboard, admin, org-admin, super-admin, login, register) hanno `noindex,nofollow`.
- [x] Home page ha structured data Organization + FAQPage.
- [x] Pagine associazione hanno structured data Organization dinamico da DB.
- [x] `robots.txt` statico in `frontend/public/` con disallow route private e sitemap reference.
- [x] Endpoint `/sitemap.xml` dinamico nel backend con pagine statiche + associazioni attive.
- [x] Pagina Privacy creata con informativa GDPR e linkata dal footer.
- [x] Fallback meta tags in `index.html` per crawler che non eseguono JS.
---
## Spec (Rehaul totale pagine pubbliche + Hero Three.js - Feb 13, 2026)
- Obiettivo: modernizzare tutte le pagine pubbliche ASSONAM con hero home WebGL premium sobrio e motion system coerente, senza alterare dashboard/logica backend/routing.
- Scope incluso: home/landing, lo studio, servizi, associazioni, dettaglio affiliazione, iscrizione, contatti, privacy, login/register/magic verify/not-found, header/footer/layout pubblico.
- Scope escluso: dashboard socio/admin/org-admin/super-admin e relativi componenti/layout.
## Plan (Rehaul pagine pubbliche)
- [x] Separare shell/layout pubblico da route dashboard mantenendo dashboard invariata.
- [x] Introdurre motion system GSAP pubblico con reveal discreti (fade-up + stagger) e supporto prefers-reduced-motion.
- [x] Implementare hero home con Three.js client-only, quality adattiva mobile e fallback statico WebGL off/low-power.
- [x] Ridisegnare header/footer pubblici con brand block + payoff animato e menu mobile curato.
- [x] Aggiornare styling/UX di tutte le pagine pubbliche e componenti comuni (cards, forms, FAQ, CTA, sezioni).
- [x] Aggiornare dipendenze frontend e verificare build/test funzionali richiesti (desktop/mobile/fallback/dashboard invariata).
## Review (Rehaul pagine pubbliche)
- [x] Aggiunta shell pubblica dedicata in `Layout` con header sticky+shrink, brand block e payoff animato, footer ristrutturato; branch dashboard mantenuto separato.
- [x] Motion system GSAP introdotto (`usePublicMotion`) con due pattern reveal (`fade-up`, `stagger`) e rispetto `prefers-reduced-motion`.
- [x] Hero home rifatta con scena WebGL lazy/client-only (`@react-three/fiber`), quality adattiva (mobile/low-power), cap FPS e fallback statico senza WebGL.
- [x] Rehaul UI completo su pagine pubbliche principali: `Home`, `LoStudio`, `Servizi`, `Associazioni`, `AffiliazioneDettaglio`, `Contatti`, `Privacy`, `Login`, `Register`, `MagicLinkVerify`, `ReservedAreaRedirect`, `NotFound`, `Iscrizione`.
- [x] Design system pubblico in `index.css` (`public-*`), aggiornamento tipografia, cards, form states, FAQ accordion, CTA e coerenza cromatica globale.
- [x] Dipendenze aggiornate (`gsap`, `three`, `@react-three/fiber`, `@react-three/drei`) con lockfile rigenerato.
- [x] Verifica tecnica: `npm.cmd run build` (frontend) OK.
- [x] Verifica dashboard invariata lato file: nessuna modifica diretta in `frontend/src/pages/dashboard/*`, `frontend/src/pages/admin/*`, `frontend/src/pages/org-admin/*`, `frontend/src/pages/super-admin/*`.
- [ ] Verifica visuale manuale browser (desktop/mobile e fallback WebGL disabilitato) da completare in ambiente UI locale.
---
## Spec (Fix reale Three.js + GSAP pubblico - Feb 13, 2026)
- Obiettivo: sostituire la scena hero simulata con WebGL reale (`<canvas>`) e garantire motion GSAP verificabile sulle sole pagine pubbliche.
- Vincoli: impatto minimo, nessuna modifica a dashboard/admin/org-admin/super-admin; routing/auth/forms invariati.
- Accettazione: dipendenze presenti, `<canvas>` hero visibile, timeline mount (logo/payoff/CTA), almeno uno ScrollTrigger reveal, WebGL client-only, mobile 360x800 e 390x844 senza regressioni UX/perf.
## Plan (Fix reale Three.js + GSAP pubblico)
- [x] Introdurre componente hero WebGL dedicato `PublicHeroThree.client.tsx` con `@react-three/fiber` + `@react-three/drei`.
- [x] Integrare Home hero con mount client-only, fallback non-WebGL e layering canvas/overlay/testo corretto.
- [x] Rafforzare GSAP mount timeline pubblico (logo/payoff/CTA) e confermare `ScrollTrigger` reveal sezioni.
- [x] Rifinire mobile/performance (DPR/fps, touch scroll, clamp typography, CTA above-the-fold, no overflow).
- [x] Verificare build frontend e documentare review con punti di verifica DevTools/GSAP.
## Execution (Fix reale Three.js + GSAP pubblico)
- Creato `frontend/src/components/public/PublicHeroThree.client.tsx` con scena R3F reale (`Canvas`) + `MeshDistortMaterial` (drei), luci morbide, fog e particelle discrete.
- Aggiornata `Home` con import lazy client-only del nuovo componente e policy degrado qualitativo (non disattivazione WebGL su low-power).
- Rafforzata la timeline GSAP nel layout pubblico: logo, payoff e CTA hero (`[data-hero-cta]`) in sequenza mount.
- Confermato e irrigidito il sistema `ScrollTrigger` reveal pubblico (`fade-up` e `stagger`) in `usePublicMotion`.
- Rifinita UX mobile/public CSS: canvas assoluto non-interattivo, overlay leggibilita, tap target >= 44px, clamp heading e prevenzione overflow orizzontale.
## Review (Fix reale Three.js + GSAP pubblico)
- [x] `npm.cmd run build` in `frontend` OK.
- [x] Dipendenze richieste presenti in `frontend/package.json`: `three`, `@react-three/fiber`, `@react-three/drei`, `gsap`.
- [x] Home usa un `Canvas` R3F reale (`public-hero-canvas`) dentro hero, con fallback quando WebGL non disponibile.
- [x] Timeline GSAP mount presente in `Layout` per logo/payoff/CTA (`data-hero-cta`).
- [x] ScrollTrigger attivo su reveal sezioni pubbliche (`[data-reveal=\"fade-up\"]`, `[data-reveal=\"stagger\"]`).
- [x] Dashboard non toccata: nessuna modifica in `frontend/src/pages/dashboard/*`, `frontend/src/pages/admin/*`, `frontend/src/pages/org-admin/*`, `frontend/src/pages/super-admin/*`.
- [ ] Verifica manuale browser DevTools (presenza `<canvas>` in Elements + test viewport 360x800 e 390x844) da completare localmente.
---
## Spec (Hero Particle Logo ASSONAM da SVG - Feb 13, 2026)
- Obiettivo: sostituire la hero WebGL con logo ASSONAM a particelle riconoscibile da sorgente SVG, senza geometrie casuali.
- Vincoli: no sfere/torus/knot/poligoni random; movimento minimo sobrio; fallback statico su low-power/no WebGL; dashboard esclusa.
- Verifiche richieste: canvas in hero desktop, particle logo visibile a destra, mobile stabile con fallback, screenshot desktop/mobile.
## Plan (Hero Particle Logo ASSONAM da SVG)
- [x] Generare asset SVG dedicato del logo ASSONAM e usarlo come sorgente particellare.
- [x] Implementare parser SVG (`SVGLoader`) e campionamento path in punti per `THREE.Points`.
- [x] Riprogettare hero composition (copy a sinistra, logo a destra, overlay leggibilità).
- [x] Limitare movimento a micro breathing/parallax e ridurre costi su mobile/low-power.
- [x] Eseguire build e produrre screenshot desktop/mobile.
## Review (Hero Particle Logo ASSONAM da SVG)
- [x] Asset sorgente creato: `frontend/public/logo-assonam-particle.svg`.
- [x] Particle logo implementato in `PublicHeroThree.client.tsx` con `SVGLoader` + `PointsMaterial` (niente mesh casuali).
- [x] Hero aggiornata con composizione copy-left/logo-right e fallback statico logo su low-power/no WebGL.
- [x] Rimossa qualsiasi immagine underlay quando WebGL è attivo: in modalità WebGL il logo è solo `THREE.Points`.
- [x] Sampling SVG reso più pulito con path vettoriali da contorni (no texture/no scanline overlay).
- [x] Build frontend verificata: `npm.cmd run build` OK.
- [x] Screenshot generati:
  - `tasks/screenshots/hero-desktop.png`
  - `tasks/screenshots/hero-mobile-390x844.png`
  - `tasks/screenshots/hero-mobile-360x800.png`
---
## Spec (Hero Monumento: logo 3D ASSONAM sotto testo - Feb 13, 2026)
- Obiettivo: sostituire l'hero object con il logo ASSONAM 3D estruso da SVG, grande, centrato e posizionato sotto H1/CTA.
- Vincoli: niente sfere/forme casuali, colori brand blu+giallo, animazione sobria, fallback statico solo quando WebGL e disattivo.
## Plan (Hero Monumento)
- [x] Rigenerare SVG logo pulito in `public` con separazione cromatica blu/giallo.
- [x] Implementare pipeline `SVGLoader -> shapes -> ExtrudeGeometry` con gruppo centrato e scala monumentale.
- [x] Aggiornare layout hero in stack verticale (copy sopra, monumento sotto) mantenendo CTA leggibile.
- [x] Applicare lighting morbido + animazione minima (breathing/oscillazione lieve + micro parallax desktop).
- [x] Verificare build frontend e fallback statico mobile/low-power.
## Review (Hero Monumento)
- [x] Nuovo hero object: logo ASSONAM 3D da SVG, nessun oggetto geometrico casuale.
- [x] Layout aggiornato: testo/CTA sopra, area monumento centrata sotto con spazio dedicato (`public-hero-monument-spacer`).
- [x] Materiali brand coerenti (blu + giallo) con luci key/rim/ambient morbide.
- [x] Mobile/low-power: WebGL disattivato e fallback statico grande centrato sotto testo.
- [x] Verifica tecnica: `npm.cmd run build` in `frontend` OK.
---
## Spec (Hero WebGL monument fix dopo review utente - Feb 13, 2026)
- Obiettivo: correggere hero pubblico per avere logo ASSONAM 3D animato sotto il testo, CTA leggibili e sfondo chiaro brand (bianco sfumato con glow blu/giallo).
- Vincoli: dashboard invariata, WebGL desktop attivo con canvas reale, fallback statico su mobile/low-power, GSAP pubblico mantenuto.
## Plan (Hero WebGL monument fix)
- [x] Rivedere trigger WebGL/low-power per evitare fallback statico su desktop.
- [x] Riallineare stile hero (background chiaro, CTA coerenti blu/bianco, layout non sovrapposto).
- [x] Rafforzare resa logo 3D (materiali double-side, colori brand da SVG, motion continuo sobrio).
- [x] Forzare comportamento mobile stabile con fallback statico sotto testo.
- [x] Verificare build e produrre screenshot desktop/mobile aggiornati.
## Review (Hero WebGL monument fix)
- [x] `frontend/src/pages/Home.tsx`: policy low-power aggiornata (`<768px` => fallback statico) e CTA hero uniformate.
- [x] `frontend/src/components/public/PublicHeroThree.client.tsx`: logo 3D da SVG con animazione breathing/parallax + materiali blu/giallo e `DoubleSide`.
- [x] `frontend/src/index.css`: hero sfondo bianco sfumato con glow blu/giallo, canvas limitato alla zona bassa per non coprire copy/CTA.
- [x] `frontend/public/logo-assonam-particle.svg`: path con riempimenti brand blu/giallo usati per la mesh estrusa.
- [x] Verifica build: `npm.cmd run build` OK.
- [x] Verifica canvas in hero: `npx playwright screenshot --wait-for-selector ".public-hero-scene canvas"` OK.
- [x] Screenshot aggiornati:
  - `tasks/screenshots/hero-desktop-final.png`
  - `tasks/screenshots/hero-mobile-final.png`
---
## Spec (Hero background composition fix post-feedback - Feb 13, 2026)
- Obiettivo: integrare il logo hero WebGL nel background (dietro copy/CTA), ridurre aggressivita visiva e ripristinare leggibilita foto Piazza Bologna + tipografia headline bilanciata.
- Vincoli: canvas reale in hero, GSAP mount/scroll invariati, dashboard e pricing untouched.
## Plan (Hero background composition fix)
- [x] Spostare la composizione del logo hero nel layer background (non in flow sotto al testo).
- [x] Ribilanciare overlay/background per rendere visibile la foto e mantenere contrasto del copy.
- [x] Correggere line-break H1 e spacing CTA per evitare resa "storta".
- [x] Verificare desktop/mobile con screenshot e check canvas in DevTools.
---
## Spec (Hero brand color rebalance + CTA pairs coherence - Feb 13, 2026)
- Obiettivo: centrare meglio il logo ASSONAM dietro la headline, evitare hero monocromatica blu e rendere tutte le coppie CTA pubbliche coerenti con palette blu+giallo.
- Vincoli: nessun impatto dashboard/admin; mantenere Three.js + GSAP reali.
## Plan (Hero brand rebalance)
- [x] Ricalibrare scala/posizione/logo opacity nel canvas Three per centratura dietro H1.
- [x] Uniformare i bottoni pubblici (`btn-primary` + `btn-ghost`) con trattamento cromatico blu+giallo su tutto il sito pubblico.
- [x] Aggiornare la resa tipografica hero con trattamento cromatico verticale blu/giallo.
- [x] Verificare build frontend.
## Review (Hero brand rebalance)
- [x] `frontend/src/components/public/PublicHeroThree.client.tsx`: logo ridimensionato e riposizionato per stare centrato nel layer hero dietro il copy.
- [x] `frontend/src/index.css`: bottoni pubblici aggiornati con gradienti brand-mix blu/giallo applicati a tutte le coppie CTA del sito pubblico.
- [x] `frontend/src/index.css`: headline hero con gradiente verticale (parte alta blu / parte bassa gialla).
- [x] Verifica tecnica: `npm.cmd run build` in `frontend` OK.
---
## Spec (Sostituzione immagine sezione post-hero - Feb 13, 2026)
- Obiettivo: rimuovere completamente la foto con mano/unghie e sostituire la prima immagine sotto hero con un asset web piu coerente.
## Plan (Sostituzione immagine sezione)
- [x] Scaricare un nuovo asset royalty-free dal web nella cartella `frontend/public/public-images`.
- [x] Aggiornare mapping immagini in `Home.tsx` eliminando riferimenti a `associazione-team.jpg`.
- [x] Cancellare il file `associazione-team.jpg` e verificare build frontend.
## Review (Sostituzione immagine sezione)
- [x] Nuova immagine web salvata: `frontend/public/public-images/process-consulenza-web.jpg`.
- [x] `frontend/src/pages/Home.tsx` aggiornato: prima sezione usa il nuovo asset web.
- [x] Riferimento a `associazione-team.jpg` rimosso dal codice.
- [x] File legacy `frontend/public/public-images/associazione-team.jpg` eliminato.
- [x] Verifica tecnica: `npm.cmd run build` in `frontend` OK.
---
## Spec (Hotfix hero mobile readability/layout - Feb 13, 2026)
- Obiettivo: correggere la resa hero su mobile (headline invisibile/disallineata e logo fallback troppo alto sopra il copy).
## Plan (Hotfix hero mobile)
- [x] Introdurre fallback tipografico robusto su mobile (headline blu pieno, senza dipendenza da text-clip gradient).
- [x] Limitare il gradiente testo blu/giallo solo a desktop con `@supports` + `@media`.
- [x] Spostare logo fallback mobile piu in basso e ridurne scala/opacita per evitare overlap con subtitle/CTA.
- [x] Verificare build frontend.
## Review (Hotfix hero mobile)
- [x] `frontend/src/index.css`: hero title default solido blu; gradient clip attivo solo desktop compatibile.
- [x] `frontend/src/index.css`: fallback logo mobile riposizionato (`top: 68%`) e ridotto (`clamp(8.8rem, 34vw, 11.2rem)`).
- [x] Verifica tecnica: `npm.cmd run build` in `frontend` OK.
---
## Spec (Hotfix mobile typo/contrast dopo screenshot reale - Feb 13, 2026)
- Obiettivo: correggere hero mobile con titolo troppo grande/spezzato e subtitle poco leggibile sullo sfondo foto.
## Plan (Hotfix mobile readability v2)
- [x] Ridurre ulteriormente scala e tracking dell'H1 mobile.
- [x] Aumentare leggibilita copy mobile con panel leggero dietro al blocco testo.
- [x] Rafforzare contrasto del subtitle (colore + peso + text-shadow soft).
- [x] Spostare logo fallback piu in basso per evitare sovrapposizione copy/CTA.
- [x] Verificare build frontend.
## Review (Hotfix mobile readability v2)
- [x] `frontend/src/index.css`: H1 mobile ridotto (`clamp(1.58rem, 8.9vw, 2.7rem)`), `line-height: 1.11`.
- [x] `frontend/src/index.css`: `public-hero-copy` mobile con pannello soft per contrasto del testo.
- [x] `frontend/src/index.css`: subtitle mobile scurito e reso piu leggibile (`rgba(19,42,101,0.96)`, weight 500).
- [x] `frontend/src/index.css`: fallback logo mobile abbassato (`top: 78%`) e ridotto (`clamp(8.1rem, 30vw, 10.2rem)`).
- [x] Verifica tecnica: `npm.cmd run build` in `frontend` OK.
---
## Spec (Bug Fix: Doc Socio + Iscrizione + Error Page - Feb 16, 2026)
### Root Causes Identified
1. **Org-admin soci/:id page crash (CRITICAL)**: 3 `useMemo` hooks dopo `if (loading) return` ? violazione Rules of Hooks ? React crash "Rendered more hooks than expected" ? ErrorBoundary. Spostati PRIMA dei return condizionali.
2. **ErrorBoundary buttons broken**: `<Link to="/">` does SPA nav but `hasError` class state persists ? fallback keeps showing. Fixed by using `window.location.href` for full navigation.
3. **Signup 400 for oasi-2 (and any org without statute)**: Backend required `statute_pdf_path` AND `accept_statute=true` unconditionally. Frontend only showed statute checkbox when org had statute. Fixed: statute acceptance now conditional on org having a statute.
4. **Generic error messages hide real cause**: `joinOrganization()` threw "Join failed" without reading response body. Fixed: now reads `detail` from response.
5. **Registration failure masks signup success**: If `joinOrganization` succeeded but `registerMember` failed, user saw error. Fixed: registration is now non-blocking.
### Fixes Applied
- [x] A. ErrorBoundary: `<Link>` ? `window.location.href`, added error logging
- [x] B. Join endpoint: statute check conditional, added `is_active` check
- [x] C. `joinOrganization()`: reads response body for 400/409/429/500 detail
- [x] D. Iscrizione.tsx: shows real backend error, registration non-blocking
- [x] E. Request ID middleware: `X-Request-Id` on all responses, logged in errors
- [x] F. Doc download: fetch+blob with error handling instead of `<a href>` nav
- [x] G. Tests: 6 pytest tests all passing (statute-optional, inactive, all-orgs, request-id)
### Files Modified
- `frontend/src/components/ErrorBoundary.tsx` � Full navigation, error logging
- `frontend/src/lib/api.ts` � `joinOrganization` + `registerMember` error detail
- `frontend/src/pages/Iscrizione.tsx` � Real error messages, non-blocking registration
- `frontend/src/pages/org-admin/OrgAdminMemberDetail.tsx` � Fetch-based doc download
- `app/routes/join.py` � Conditional statute, is_active check, request_id in errors
- `app/middleware.py` � `RequestIdMiddleware` + `get_request_id`
- `app/main.py` � Register `RequestIdMiddleware`
### Files Created
- `tests/test_signup_fixes.py` � 6 tests covering all fixes
### Deploy Notes
- No DB migration needed
- No new env vars
- Request ID header (`X-Request-Id`) now present on all responses
---
## Spec (Hero mobile CTA-only con watermark - Feb 13, 2026)
- Obiettivo: su mobile mostrare solo CTA centrate + watermark logo; nascondere completamente eyebrow/H1/subtitle. Da `md` in su layout invariato con testo completo.
- Vincoli: niente cambi routing/backend/SEO, nessuna nuova dipendenza, modifica limitata a hero + css collegato.
## Plan (Hero mobile CTA-only)
- [x] Aggiornare markup hero in `Home.tsx` con blocco testo `hidden md:block` senza duplicare la hero.
- [x] Rendere CTA sempre presenti con layout responsive: mobile colonna full-width, desktop riga width auto.
- [x] Inserire watermark mobile assoluto (`md:hidden`) dietro CTA e separare fallback no-webgl desktop-only.
- [x] Pulire stratificazione z-index (`scene 0`, `overlay 10`, `watermark 20`, `cta/text 30`) e centratura verticale mobile.
- [x] Verificare build frontend.
## Review (Hero mobile CTA-only)
- [x] `frontend/src/pages/Home.tsx`: testo hero wrappato in `hidden md:block`; CTA sempre visibili con classi responsive richieste.
- [x] `frontend/src/pages/Home.tsx`: watermark mobile aggiunto (`md:hidden`, `opacity 0.12`, `pointer-events-none`) dietro bottoni.
- [x] `frontend/src/pages/Home.tsx`: fallback statico no-webgl limitato a desktop (`hidden md:flex`) per evitare doppio logo su mobile.
- [x] `frontend/src/index.css`: min-height hero mobile impostata a `70svh` / `75svh` (sm), copy centrato verticalmente e overlay ribilanciato.
- [x] `frontend/src/index.css`: z-index hero riallineati (`overlay 10`, `content/copy 30`).
- [x] Verifica tecnica: `npm.cmd run build` in `frontend` OK.
---
## Spec (Integrazione Issuer Tessera API - Feb 17, 2026)
- Obiettivo: aggiungere endpoint sicuro per emissione socio attivo via gestionale esterno (es. Pienissimo), con idempotenza, assegnazione tessera da lotto, email HTML tessera + magic link accesso area riservata.
- Vincoli: non alterare il flusso signup standard (resta pending/approvazione), usare API key scoped per associazione, evitare duplicati su retry (`external_customer_id`), mantenere compatibilit� codice esistente.
## Plan (Integrazione Issuer Tessera API)
- [x] Estendere modelli (`Member` + `IntegrationApiKey`) e retro-compatibilit� init DB.
- [x] Aggiungere migrazione Alembic per nuovi campi, nuova tabella e vincolo univoco idempotenza.
- [x] Implementare sicurezza integrazione (hash API key + dependency con scope e tracciamento `last_used_*`).
- [x] Implementare endpoint `POST /api/integrations/members/issue` con idempotenza, attivazione socio e card verification URL.
- [x] Estendere servizio email a multipart HTML e aggiungere template tessera con QR + CTA accesso/verifica.
- [x] Integrare generazione token magic-link diretto nel flusso issuer.
- [x] Aggiungere audit log evento `integration_issue_member`.
- [x] Scrivere test pytest richiesti (create/idempotenza/401/email HTML capture).
- [x] Aggiornare documentazione (README/ENV_REQUIRED) con header e creazione chiavi.
- [x] Eseguire test mirati e completare review.
## Review (Integrazione Issuer Tessera API)
- [x] Endpoint `POST /api/integrations/members/issue` attivo con API key scoped e controllo org.
- [x] Idempotenza implementata su `(org_id, signup_source, external_customer_id)` con vincolo DB + logica applicativa.
- [x] Emissione tessera con `assign_next_card_with_batch` e salvataggio `batch_id` sul socio.
- [x] Email multipart HTML implementata (`send_email_html`) con template tessera, QR `qrserver` e CTA magic-link.
- [x] Audit DB `integration_issue_member` registrato in `operation_logs`.
- [x] Test eseguiti: `python -m pytest tests\\test_integration_issue_member.py tests\\test_email_flows.py tests\\test_card_assignment.py` -> **22 passed**.
- [x] Nota migrazioni legacy: `python -m alembic upgrade head` resta bloccato da una migration storica preesistente (`5f60c30665a2`, table `member_documents` gi� esistente), non da questa implementazione.
---
## Spec (Hotfix Alembic 5f60 Idempotenza - Feb 17, 2026)
- Obiettivo: rendere idempotente la migration storica `5f60c30665a2` (`member_documents`) per evitare crash su `alembic upgrade head` quando la tabella esiste gi�.
- Vincoli: usare SQLAlchemy inspector (`sa.inspect(op.get_bind())`), saltare creazione tabella/indici/constraint se gi� presenti.
## Plan (Hotfix Alembic 5f60 Idempotenza)
- [x] Aggiornare `upgrade()` con check esistenza tabella `member_documents`.
- [x] Proteggere creazione indice della migration con check `index exists`.
- [x] Rendere `downgrade()` safe (drop solo se tabella/indice esistono).
- [x] Verificare `alembic upgrade head` su DB vuoto e su DB con tabella gi� presente.
## Review (Hotfix Alembic 5f60 Idempotenza)
- [x] Modificata migration `alembic/versions/5f60c30665a2_add_member_documents_table.py` con helper `_table_exists` e `_index_exists`.
- [x] `upgrade()` ora ritorna subito se `member_documents` � gi� presente.
- [x] `downgrade()` ora evita drop su oggetti mancanti.
- [x] Validazione eseguita:
  - `DATABASE_URL=sqlite:///tmp_alembic_empty.db python -m alembic upgrade head` -> OK.
  - `DATABASE_URL=sqlite:///tmp_alembic_existing.db python -m alembic upgrade d9638477c3a7` -> OK.
  - `DATABASE_URL=sqlite:///tmp_alembic_existing.db python -m alembic upgrade head` -> OK.
---
## Spec (Org-Admin IntegrationApiKey Management - Feb 17, 2026)
- Obiettivo: aggiungere endpoint org-admin per creare/listare/ruotare/disattivare IntegrationApiKey in modo sicuro, con raw key esposta solo in create/rotate.
- Vincoli: session auth org-admin esistente, scoping rigoroso su `org_id`, soft-disable via `is_active=false`, audit su OperationLog.
## Plan (Org-Admin IntegrationApiKey Management)
- [x] Estendere schema/model per permettere rotazione storica (rimozione unique `org_id+name` su integration keys).
- [x] Implementare endpoint `GET /api/org-admin/integrations/keys` con filtro `name` e output senza `key_hash`.
- [x] Implementare endpoint `POST /api/org-admin/integrations/keys` con generazione raw key e hash persistito.
- [x] Implementare endpoint `POST /api/org-admin/integrations/keys/{id}/rotate` disattivando la key vecchia e creando una nuova.
- [x] Implementare endpoint `DELETE /api/org-admin/integrations/keys/{id}` per soft-disable.
- [x] Aggiungere audit log `integration_key_created`, `integration_key_rotated`, `integration_key_disabled`.
- [x] Aggiungere test basilari pytest (auth, create/list, rotate, disable, scoping org).
- [x] Eseguire test mirati e documentare review.
## Review (Org-Admin IntegrationApiKey Management)
- [x] Aggiunti endpoint in `app/routes/org_admin.py`:
  - `GET /api/org-admin/integrations/keys`
  - `POST /api/org-admin/integrations/keys`
  - `POST /api/org-admin/integrations/keys/{id}/rotate`
  - `DELETE /api/org-admin/integrations/keys/{id}`
- [x] Sicurezza: accesso solo via sessione org-admin e filtro `key.org_id == admin.org_id`.
- [ ] Verificare hardening require_integration_key e assenza raw_key fuori create/rotate
- [x] Soft disable implementato via `is_active=False`.
- [x] Audit log DB aggiunti: `integration_key_created`, `integration_key_rotated`, `integration_key_disabled`.
- [x] Schema aggiornato per rotazione storica:
  - modello `IntegrationApiKey` senza unique `org_id+name`
  - migration `h1a2b3c4d5e6_drop_integration_org_name_unique.py`
- [x] Test aggiunti: `tests/test_org_admin_integration_keys.py`.
- [x] Verifiche eseguite:
  - `python -m pytest tests\\test_org_admin_integration_keys.py tests\\test_integration_issue_member.py` -> **8 passed**
  - `DATABASE_URL=sqlite:///tmp_org_admin_integration_keys.db python -m alembic upgrade head` -> **OK**






---
## Spec (Ingest pubblico Pienissimo senza secret - Feb 17, 2026)
- Obiettivo: rendere operativo solo `POST /api/ingest/pienissimo/{org_slug}` pubblico, senza auth/secret, con gating su integrazione attiva per org, idempotenza forte, rate limit e invio email solo al primo successo.
- Vincoli: nessuna regressione signup normale; endpoint issuer key-based invariato su `X-ASSONAM-API-KEY`.
## Plan (Ingest pubblico)
- [x] Rimuovere ogni dipendenza runtime da `INGEST_SECRET` lato ingest/docs/config.
- [x] Verificare paywall su key attiva + scope issue_member con esito coerente 402.
- [x] Verificare idempotenza forte + email-once in service issuer (retry senza duplicati/card/email).
- [x] Verificare e rifinire rate limit per IP+org (20/5m configurabile) con risposta 429.
- [x] Aggiornare test ingest richiesti (402, 200 create, 100x idempotenza, 429 RL).
- [x] Eseguire `alembic upgrade head` e test mirati backend.
- [x] Aggiornare review finale in `tasks/todo.md`.
## Execution Update (Ingest pubblico Pienissimo senza secret - Feb 17, 2026)
- [x] Rimosse dipendenze runtime da `INGEST_SECRET` (config/cors/docs).
- [x] Confermato paywall `integration_inactive` con HTTP 402 su ingest senza key attiva.
- [x] Confermata idempotenza forte + email-once (`card_email_sent_at`) su retry ingest.
- [x] Confermato rate limit IP+org (configurabile) con HTTP 429.
- [x] Eseguito `python -m alembic upgrade head`.
- [x] Eseguiti test mirati backend ingest/integration.
- [x] Eseguite regressioni rapide signup + build frontend.
## Review (Ingest pubblico Pienissimo senza secret - Feb 17, 2026)
- `python -m alembic upgrade head` -> OK
- `python -m pytest tests/test_ingest_pienissimo.py tests/test_integration_issue_member.py tests/test_org_admin_integration_keys.py -q` -> 14 passed
- `python -m pytest tests/test_signup_fixes.py tests/test_join_submit_failure.py -q` -> 8 passed
- `npm --prefix frontend run build` -> OK

- `python -m pytest tests/test_ingest_pienissimo.py tests/test_integration_issue_member.py tests/test_org_admin_integration_keys.py tests/test_signup_fixes.py tests/test_join_submit_failure.py -q` -> 23 passed
- Hardening test isolation: `tests/test_signup_fixes.py` ora forza logout admin prima del test bulk su tutte le org attive.

---
## Spec (Delete associazione + rilascio range tessere - Feb 18, 2026)
- Obiettivo: rendere eliminabile una associazione disattivata con rilascio slot tessere riutilizzabile.
- Vincoli: operazione solo super-admin, modalita archive/purge, transazionale, no regressioni UI.
## Plan (Delete associazione + rilascio range tessere)
- [ ] Analisi vincoli FK e cause blocco delete (modelli + endpoint esistenti).
- [ ] Implementare service transazionale backend deleteAssociationAndReleaseRange con mode archive/purge, force e release_range.
- [ ] Esporre endpoint DELETE /api/admin/associations/{association_id} e mantenere compatibilita endpoint super-admin esistente.
- [ ] Aggiungere supporto schema per archiviazione/rilascio range (migrazione alembic + modello minimo).
- [ ] Aggiornare UI super-admin Associazioni con modal a due scelte e conferma slug per purge.
- [ ] Aggiungere test backend archive/purge + verifica riutilizzo range; eseguire test/build mirati.
## Review (Delete associazione + rilascio range tessere)
- [ ] Da completare.
## Execution Update (Delete associazione + rilascio range tessere - Feb 18, 2026)
- [x] Analizzati modelli/route delete/range: causa primaria blocco delete su FK indirette (es. operation_logs actor_* verso admin/member).
- [x] Implementato service transazionale backend delete_association_and_release_range con mode archive/purge, force, release_range e audit.
- [x] Esposto nuovo endpoint DELETE /api/admin/associations/{association_id}; endpoint legacy super-admin delete mantenuto (purge compat).
- [x] Aggiunte colonne schema minime organizations.deleted_at e card_batches.released_at (modello + migrazione + init_db compat).
- [x] Aggiornata UI Super Admin Associazioni con modal archive/purge, conferma slug per purge e feedback operazione.
- [x] Aggiunti test backend dedicati per archive/purge con verifica riutilizzo range.
## Review (Delete associazione + rilascio range tessere - Feb 18, 2026)
- [x] python -m py_compile app/models.py app/services/association_delete.py app/services/card.py app/routes/super_admin.py app/main.py init_db.py alembic/versions/j1k2l3m4n5o6_add_archive_and_released_flags.py tests/test_super_admin_association_delete_release_range.py -> OK
- [x] python -m pytest tests/test_super_admin_association_delete_release_range.py -q -> 2 passed
- [x] python -m pytest tests/test_soft_delete.py -q -> 1 passed
- [x] python -m pytest tests/test_org_admin_integration_keys.py -q -> 5 passed
- [x] 
pm --prefix frontend run build -> OK
- [x] DATABASE_URL=sqlite:///tmp_assoc_delete.db python -m alembic upgrade head -> OK

---
## Spec (Fix coerenza socio/tessera/accesso/QR - Feb 19, 2026)
- Obiettivo: garantire che socio eliminato/disattivato non possa accedere e che verifica tessera mostri sempre stato coerente (HTML leggibile + JSON compatibile).
- Vincoli: source-of-truth unica per stato socio/tessera, backward compatibility JSON, QR browser-first in HTML, test regressione su integrazione+delete.
## Plan (Fix coerenza socio/tessera/accesso/QR)
- [ ] Introdurre utility centrale `is_member_active` / `is_card_active` (+ reason code) e riusarla in auth + card status.
- [ ] Hardening auth member (`/api/auth/login`, `/member/auth`, `get_current_member`, whoami): negare accesso/token a account non attivo con 403 coerente.
- [ ] Rifattorizzare `GET /api/cards/verify/{token}` con content negotiation HTML/JSON, pagina mobile-readable e motivo non attiva.
- [ ] Allineare soft-delete socio e query/liste admin affinch� tessera eliminata non risulti mai attiva.
- [ ] Aggiornare/aggiungere test regressione (QR verify JSON+HTML, delete->non attiva, login negato, lista attivi esclusa) ed eseguire test mirati.
## Review (Fix coerenza socio/tessera/accesso/QR)
- [ ] Da completare.
## Execution Update (Fix coerenza socio/tessera/accesso/QR - Feb 19, 2026)
- [x] Aggiunta utility centrale in `app/services/member_activity.py` con `is_member_active`, `is_card_active`, reason codes e label utente.
- [x] Hardening auth member in `app/routes/member.py`: login/magic-link/session check bloccano account non attivo con HTTP 403 `account non attivo`.
- [x] Rifattorizzata verifica tessera in `app/routes/public.py` con content negotiation HTML/JSON e pagina mobile-readable con motivo NON ATTIVA.
- [x] Allineato soft-delete in `app/routes/org_admin.py` (deleted_at + status rejected) e filtri active in query admin/listing.
- [x] Aggiunti test regressione in `tests/test_member_active_state_regression.py` + update test QR/login/send-access.
## Review (Fix coerenza socio/tessera/accesso/QR - Feb 19, 2026)
- `python -m pytest tests/test_member_card_verification.py tests/test_member_active_state_regression.py tests/test_email_flows.py tests/test_org_admin_send_access.py -q` -> **11 passed**
- Regressione chiave coperta: integrazione -> delete -> login negato + verify magic link negato + QR JSON/HTML NON ATTIVA + lista active esclusa.
- `python -m py_compile ...` non eseguibile in questo workspace per permessi su `__pycache__` (WinError 13); validazione fatta con pytest mirati.

---
## Spec (Scadenza annuale tessere + auto-expire/purge - Feb 19, 2026)
- Obiettivo: rendere la tessera valida fino al 31/12 dell'anno `card_year` e dal 01/01 successivo bloccare accesso socio, segnare tessera non attiva (motivo Scaduta) e applicare rimozione automatica con soft delete + purge PII.
- Vincoli: compatibilita QR JSON/HTML esistente, mantenere audit essenziale (org_id, card_no, card_year), endpoint manuale super-admin per maintenance.
## Plan (Scadenza annuale tessere)
- [ ] Estendere modello/migration con `members.expired_at`, `members.purged_at` e indice `(card_year, deleted_at)` + aggiornamento init_db legacy.
- [ ] Rafforzare source-of-truth stato: `is_member_active`/reason per scadenza annuale e motivo `Scaduta` coerente anche dopo auto-expire.
- [ ] Implementare service `expire_and_purge_members()` con soft delete + status expired + purge PII + output contatori.
- [ ] Esporre trigger manuale protetto super-admin `POST /api/super-admin/maintenance/run` con audit `auto_expire_members`.
- [ ] Aggiornare query/listing dove necessario per non mostrare scaduti come attivi.
- [ ] Aggiungere test regressione: member scaduto -> verify non attiva (Scaduta), login negato, maintenance -> deleted_at/expired_at/purged_at + PII purgata.
## Review (Scadenza annuale tessere)
- [ ] Da completare.
## Execution Update (Scadenza annuale tessere + auto-expire/purge - Feb 19, 2026)
- [x] Esteso modello `Member` con `expired_at`, `purged_at`, indice `ix_members_card_year_deleted` e nuovo stato `expired`.
- [x] Aggiunta migration Alembic `k2l3m4n5o6p7_add_member_expiration_and_purge_fields.py` + aggiornamento fallback legacy in `init_db.py`.
- [x] Rafforzata source-of-truth in `app/services/member_activity.py`: scadenza annuale (`card_year < now.year`) e reason `expired` anche dopo auto-expire.
- [x] Implementato service `app/services/member_maintenance.py` con `expire_and_purge_members()` (soft delete + status expired + purge PII).
- [x] Esposto trigger protetto `POST /api/super-admin/maintenance/run` con audit `auto_expire_members`.
- [x] Aggiunto runner CLI `python -m app.maintenance` per schedulazione esterna cron.
- [x] Allineata lista org-admin per non mostrare scaduti come attivi (`status=active` via source-of-truth) e normalizzazione status scaduto.
- [x] Aggiunti test regressione scadenza/maintenance in `tests/test_member_card_expiration_maintenance.py`.
## Review (Scadenza annuale tessere + auto-expire/purge - Feb 19, 2026)
- `python -m py_compile app/models.py app/services/member_activity.py app/services/member_maintenance.py app/maintenance.py app/routes/super_admin.py app/routes/org_admin.py app/routes/public.py alembic/versions/k2l3m4n5o6p7_add_member_expiration_and_purge_fields.py tests/test_member_card_expiration_maintenance.py` -> **OK**
- `python -m alembic upgrade head` -> **OK** (upgrade fino a `k2l3m4n5o6p7`)
- `python -m pytest tests/test_member_card_expiration_maintenance.py tests/test_member_card_verification.py tests/test_member_active_state_regression.py tests/test_org_admin_member_filters.py tests/test_email_flows.py tests/test_org_admin_send_access.py -q` -> **14 passed**
- [x] Documentato cron esterno in docs/member_expiration_maintenance.md (CLI python -m app.maintenance).

---
## Spec (Frontend org-admin/super-admin coerenza tessere - Feb 19, 2026)
- Obiettivo: allineare UI Vite/React alla nuova logica backend su soci attivi/scaduti/eliminati, mostrare gestione lotti annuale in super-admin e rimuovere anno hardcoded dalla grafica tessera.
- Vincoli: usare `is_active`/stato calcolato backend (mai solo `card_no`), mantenere compatibilita API esistente, zero regressioni build.
## Plan (Frontend org-admin/super-admin coerenza tessere)
- [x] Estendere contratto API backend/org-admin members con `status` lifecycle, `workflow_status`, `deleted_at`, `card_year`, `card_number`, `is_active`.
- [x] Aggiornare tipi TS in `frontend/src/lib/api.ts` per nuovi campi members + batches annuali + maintenance trigger.
- [x] Aggiornare tab Soci org-admin: default Attivi, filtro Mostra (Attivi/Tutti/Scaduti/Eliminati), badge non attivi coerenti.
- [x] Rimuovere logiche UI implicite basate su sola presenza tessera (`card_no`) per stato attivo; usare `is_active`.
- [x] Estendere vista super-admin lotti con anno corrente server-provided, stato lotto, reset 01/01 e bottone manutenzione annuale.
- [x] Rendere dinamico anno grafica tessera (fallback a anno corrente).
- [x] Eseguire test backend mirati + build frontend e documentare review.
## Execution Update (Frontend org-admin/super-admin coerenza tessere - Feb 19, 2026)
- [x] Backend `app/routes/org_admin.py`: lista/detail soci ora espongono `status` lifecycle (`ACTIVE/EXPIRED/DELETED/PENDING`), `workflow_status`, `is_active`, `deleted_at`, `card_year`, `card_number`.
- [x] Backend `app/services/member_activity.py`: aggiunta utility `get_member_lifecycle_status`.
- [x] Backend `app/routes/super_admin.py`: endpoint lotti ora include `current_year`, `next_reset_at`, `batch.year`, `batch.is_active`.
- [x] Frontend `frontend/src/lib/api.ts`: aggiornati tipi `OrgAdminMember`, `OrgBatch`, `OrgBatchesResult`; aggiunta API `runAnnualMaintenance()`.
- [x] Frontend `OrgAdminMembers.tsx`: filtro stato convertito a Mostra Attivi/Tutti/Scaduti/Eliminati con default Attivi.
- [x] Frontend `MembersTable.tsx`: badge lifecycle (`SCADUTO`/`ELIMINATO`) + visualizzazione tessera con anno (`card_number / card_year`).
- [x] Frontend `OrgAdminMemberDetail.tsx`: uso `is_active` per disabilitare invio accesso su account non attivi; refresh dati post-azioni.
- [x] Frontend super-admin `OrganizationManageModal.tsx`: sezione "Tessere per anno / Lotti" con anno server, reset 01/01, stato lotto e bottone "Esegui manutenzione annuale".
- [x] Frontend grafica tessera: rimosso hardcoded `2026`, fallback dinamico a `new Date().getFullYear()`.
## Review (Frontend org-admin/super-admin coerenza tessere - Feb 19, 2026)
- `python -m py_compile app/services/member_activity.py app/routes/org_admin.py app/routes/super_admin.py app/services/member_maintenance.py app/maintenance.py` -> **OK**
- `python -m pytest tests/test_org_admin_member_filters.py tests/test_member_active_state_regression.py tests/test_org_admin_send_access.py tests/test_member_card_expiration_maintenance.py tests/test_super_admin_association_delete_release_range.py -q` -> **10 passed**
- `npm --prefix frontend run build` -> **OK**


---
## Review (Fix KPI tessere + ingest 500 - Feb 19, 2026)
- Corretto calcolo cards used in org-admin su soci attivi (non su next_no batch) in /api/org-admin/cards e /api/org-admin/metrics.
- Hardened card allocation: collisioni legacy su card_no ora vengono saltate, evitando 500 su /api/ingest/pienissimo/{org_slug}.
- Test: python -m pytest tests/test_member_active_state_regression.py tests/test_ingest_pienissimo.py -q -> 7 passed.
- Build FE: npm --prefix frontend run build -> OK.


---
## Review (CSV + riuso email/card post-delete - Feb 19, 2026)
- Export CSV org-admin ora esclude i soci soft-deleted (/api/org-admin/members.csv).
- Delete org-admin libera card_no, batch_id, external_customer_id per permettere nuova iscrizione con stessa email e riuso numero tessera.
- Maintenance annuale libera anche card_no/batch_id/external_customer_id per rendere riutilizzabili email e numeri dopo reset.
- Allocazione tessere aggiornata: cerca il primo numero libero nei lotti (riempie buchi prima del progressivo).
- Test: python -m pytest tests/test_member_active_state_regression.py tests/test_member_card_expiration_maintenance.py tests/test_ingest_pienissimo.py -q -> 10 passed.
- Build FE: npm --prefix frontend run build -> OK.



---
## Review (Hard purge delete + fallback anti-500 ingest - Feb 19, 2026)
- Delete org-admin ora azzera email, phone, fiscal_code, password_hash, card_no, card_year, batch_id, external_customer_id.
- Integrazione ingest/issue ripulisce conflitti su record deleted legacy prima del provisioning e in caso di race restituisce 409 'socio gia presente' invece di 500.
- Allocazione lotti usa il primo numero libero nel range per consentire riuso dei numeri liberati.
- Test: python -m pytest tests/test_member_active_state_regression.py tests/test_member_card_expiration_maintenance.py tests/test_ingest_pienissimo.py tests/test_integration_issue_member.py -q -> 15 passed.


- FE thank-you aggiornata: su HTTP 409 mostra detail/message backend (es. socio gia presente) invece del messaggio servizio non attivo.

- Email tessera: nome socio reso nero con priorita inline nel template HTML per aumentare leggibilita nei client mail.

- Email tessera mobile: aggiunto invio inline CID di logo+QR (fallback URL) per evitare immagini mancanti su client mobile.
