- [x] Investigare crash startup (502/restart loop) post-push
- [x] Applicare hotfix bootstrap schema per colonne branding org mancanti
- [x] Verificare avvio app locale dopo hotfix
- [x] Push hotfix urgente

## Review (Hotfix 502 startup - Feb 19, 2026)
- Root cause probabile: DB senza colonne branding (`club_display_name`, `card_email_subject`, `card_logo_url`) + startup strict con `SKIP_CREATE_ALL=1`
- Fix in `init_db.py`: aggiunta auto-riparazione colonne branding su `organizations` prima delle query modello
- Smoke check: `python -m uvicorn app.main:app --host 127.0.0.1 --port 8099 --log-level debug` avvia correttamente (errore solo su porta gia in uso locale)

---
- [x] Limitare watermark/logo e naming speciale alla sola org `oasi-2`
- [x] Mantenere comportamento standard per le altre org
- [x] Verificare thank-you page su slug `oasi-2`
- [x] Eseguire test/build e preparare push

## Review (Scope branding solo oasi-2 - Feb 19, 2026)
- Watermark attivo solo per `oasi-2` su preview FE, email e download HTML
- Nome speciale `Golden Age - Speakeasy` limitato a `oasi-2`
- Test: `python -m pytest tests/test_member_card_verification.py tests/test_integration_issue_member.py::test_issue_member_captures_html_email_with_verification_url -q` -> 7 passed
- Build: `npm --prefix frontend run build` -> OK

---
- [x] Forzare nome club tessera per slug `oasi-2`: `Golden Age - Speakeasy`
- [x] Applicare logo org come watermark di sfondo su tessera (FE preview + email + download)
- [x] Mantenere logo ASSONAM visibile nel layout tessera
- [x] Aggiornare test branding su public/orgs e download tessera
- [x] Eseguire test/build mirati e documentare esito

## Review (Nome tessera + watermark logo org - Feb 19, 2026)
- Override naming aggiunto in `app/services/org_branding.py`: `oasi-2 -> Golden Age - Speakeasy`
- Watermark logo org applicato su:
  - `frontend/src/components/cards/MemberCardPreview.tsx`
  - `app/email_templates/member_card_email.py`
  - `app/routes/public.py` (download HTML)
- Nome associazione sulla tessera ora usa `club_display_name` (non `organization_name`) in email/download
- Test: `python -m pytest tests/test_member_card_verification.py tests/test_integration_issue_member.py::test_issue_member_captures_html_email_with_verification_url -q` -> 7 passed
- Build: `npm --prefix frontend run build` -> OK

---
- [x] Impostare logo dedicato per slug `oasi-2` su tessera (senza rimuovere logo ASSONAM)
- [x] Rendere la sorgente logo robusta con fallback backend statico per branding tessera
- [x] Verificare heading Thank You Page: `ULTIMO PASSO PER RICEVERE LA TESSERA`
- [x] Aggiungere test regressione branding pubblico (logo fallback slug)
- [x] Eseguire test/build mirati e documentare esito

## Review (Logo oasi-2 + heading thank-you - Feb 19, 2026)
- Asset aggiunto: `app/static/card-logos/oasi-2.png` (logo Golden Age per slug `oasi-2`)
- Resolver branding aggiornato: `app/services/org_branding.py` usa fallback dedicato per `oasi-2` mantenendo priorita a `card_logo_url` configurato
- Heading Thank You confermato: `ULTIMO PASSO PER RICEVERE LA TESSERA`
- Test: `python -m pytest tests/test_member_card_verification.py -q` -> 6 passed
- Build: `npm --prefix frontend run build` -> OK
---
- [x] Individuare perchÈ il logo ASSONAM non viene renderizzato nella mail tessera inviata da flusso API/thank-you
- [x] Correggere URL logo nel template email integrazione usando asset compatibile client mail
- [x] Aggiungere regressione test su HTML email per evitare ritorno a SVG non compatibile
- [x] Eseguire test mirati integrazione/ingest e documentare risultato

## Review (Fix logo mail tessera API - Feb 19, 2026)
- `python -m pytest tests/test_integration_issue_member.py::test_issue_member_captures_html_email_with_verification_url -q` -> 1 passed
- `python -m pytest tests/test_ingest_pienissimo.py::test_ingest_retry_100x_is_idempotent_and_sends_email_once -q` -> 1 passed
- Fix applicato in `app/services/integration_issuer.py`: `logo_url` ora usa `frontend_base/logo-transparent.png` (PNG, pi˘ compatibile in email)

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
- Verifica funzionale: endpoint /api/org-admin/integrations/keys* non pi˘ registrati; GET/POST/PATCH/DELETE su path rimossi rispondono 404 (fallback API)
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
- `npm run build` (frontend) OK (attivit√É∆í√Ü‚Äô√É‚Äö√Ç¬† socio + reset filtri)
- `python -m alembic upgrade head` OK (actor_member_id)
- `npm run build` (frontend) OK (legenda attivit√É∆í√Ç¬†)
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
- [x] Add dashboard counters for √É¬¢√¢‚Äö¬¨√Ö‚Äúda rivedere√É¬¢√¢‚Äö¬¨√Ç¬ù and √É¬¢√¢‚Äö¬¨√Ö‚Äúrigettati√É¬¢√¢‚Äö¬¨√Ç¬ù
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
## Audit Log & Attivit√É∆í√Ü‚Äô√É‚Äö√Ç¬† Socio (Feb 02, 2026)
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
Il database era fuori sync con Alembic perch√É∆í√Ç¬©:
1. `init_db.py` usa `Base.metadata.create_all()` che crea tabelle bypassando Alembic
2. Alcune migrazioni aggiungono colonne che potrebbero non esistere nel DB attuale
3. Il DB locale potrebbe essere stato creato prima che le migrazioni fossero definite
### Fix Implementato
Rese idempotenti le migrazioni problematiche:
**`a1b2c3d4e5f6_add_member_payments.py`:**
- Aggiunto check `_table_exists()` prima di `create_table`
- Aggiunto check `_index_exists()` prima di `create_index`
- Se la tabella esiste gi√É∆í√Ç¬†, la migrazione passa senza errori
**`d3e4f5g6h7i8_add_performance_indexes.py`:**
- Aggiunto `_safe_create_index()` che verifica:
  - L'indice non esiste gi√É∆í√Ç¬†
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
- AccessibilitÔøΩ: flip via click + Enter/Space, aria-label chiara, no text selection durante animazione.
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
- `app/routes/public.py`: GET /sitemap.xml ‚Äî static pages + active organizations from DB
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
- [x] Riprogettare hero composition (copy a sinistra, logo a destra, overlay leggibilit√†).
- [x] Limitare movimento a micro breathing/parallax e ridurre costi su mobile/low-power.
- [x] Eseguire build e produrre screenshot desktop/mobile.
## Review (Hero Particle Logo ASSONAM da SVG)
- [x] Asset sorgente creato: `frontend/public/logo-assonam-particle.svg`.
- [x] Particle logo implementato in `PublicHeroThree.client.tsx` con `SVGLoader` + `PointsMaterial` (niente mesh casuali).
- [x] Hero aggiornata con composizione copy-left/logo-right e fallback statico logo su low-power/no WebGL.
- [x] Rimossa qualsiasi immagine underlay quando WebGL √® attivo: in modalit√† WebGL il logo √® solo `THREE.Points`.
- [x] Sampling SVG reso pi√π pulito con path vettoriali da contorni (no texture/no scanline overlay).
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
- `frontend/src/components/ErrorBoundary.tsx` ó Full navigation, error logging
- `frontend/src/lib/api.ts` ó `joinOrganization` + `registerMember` error detail
- `frontend/src/pages/Iscrizione.tsx` ó Real error messages, non-blocking registration
- `frontend/src/pages/org-admin/OrgAdminMemberDetail.tsx` ó Fetch-based doc download
- `app/routes/join.py` ó Conditional statute, is_active check, request_id in errors
- `app/middleware.py` ó `RequestIdMiddleware` + `get_request_id`
- `app/main.py` ó Register `RequestIdMiddleware`
### Files Created
- `tests/test_signup_fixes.py` ó 6 tests covering all fixes
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
- Vincoli: non alterare il flusso signup standard (resta pending/approvazione), usare API key scoped per associazione, evitare duplicati su retry (`external_customer_id`), mantenere compatibilit‡ codice esistente.
## Plan (Integrazione Issuer Tessera API)
- [x] Estendere modelli (`Member` + `IntegrationApiKey`) e retro-compatibilit‡ init DB.
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
- [x] Nota migrazioni legacy: `python -m alembic upgrade head` resta bloccato da una migration storica preesistente (`5f60c30665a2`, table `member_documents` gi‡ esistente), non da questa implementazione.
---
## Spec (Hotfix Alembic 5f60 Idempotenza - Feb 17, 2026)
- Obiettivo: rendere idempotente la migration storica `5f60c30665a2` (`member_documents`) per evitare crash su `alembic upgrade head` quando la tabella esiste gi‡.
- Vincoli: usare SQLAlchemy inspector (`sa.inspect(op.get_bind())`), saltare creazione tabella/indici/constraint se gi‡ presenti.
## Plan (Hotfix Alembic 5f60 Idempotenza)
- [x] Aggiornare `upgrade()` con check esistenza tabella `member_documents`.
- [x] Proteggere creazione indice della migration con check `index exists`.
- [x] Rendere `downgrade()` safe (drop solo se tabella/indice esistono).
- [x] Verificare `alembic upgrade head` su DB vuoto e su DB con tabella gi‡ presente.
## Review (Hotfix Alembic 5f60 Idempotenza)
- [x] Modificata migration `alembic/versions/5f60c30665a2_add_member_documents_table.py` con helper `_table_exists` e `_index_exists`.
- [x] `upgrade()` ora ritorna subito se `member_documents` Ë gi‡ presente.
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
- [ ] Allineare soft-delete socio e query/liste admin affinchÈ tessera eliminata non risulti mai attiva.
- [ ] Aggiornare/aggiungere test regressione (QR verify JSON+HTML, delete->non attiva, login negato, lista attivi esclusa) ed eseguire test mirati.
## Review (Fix coerenza socio/tessera/accesso/QR)
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

---
## Flusso Tessera Pienissimo/ThankYou/Email (Feb 19, 2026)
- [ ] Aggiungere campi branding su Organization + migrazione Alembic (`club_display_name`, `card_email_subject`, `card_logo_url`)
- [ ] Esporre endpoint pubblico `GET /api/public/orgs/{org_slug}` con fallback branding e wallet flag
- [ ] Implementare download tessera `GET /api/cards/{token}/download` (HTML printable MVP)
- [ ] Aggiungere placeholder wallet endpoints Apple/Google (404 quando non configurato)
- [ ] Aggiornare issuer/email: subject per-org, logo org + ASSONAM, bottone "Scarica tessera"
- [ ] Estendere response ingest con token/url utili per Thank You page
- [ ] Aggiornare Thank You FE: copy richiesto, club dinamico, bottone "Scarica ora", wallet CTA condizionali
- [ ] Aggiungere configurazione branding in UI super-admin (almeno campi base)
- [ ] Aggiornare test backend/FE e verifiche build

## Review (Flusso Tessera Pienissimo/ThankYou/Email - Feb 19, 2026)
- [ ] Da compilare a fine implementazione con comandi eseguiti e risultati

## Flusso Tessera Pienissimo/ThankYou/Email (Feb 19, 2026) - Update
- [x] Aggiungere campi branding su Organization + migrazione Alembic (`club_display_name`, `card_email_subject`, `card_logo_url`)
- [x] Esporre endpoint pubblico `GET /api/public/orgs/{org_slug}` con fallback branding e wallet flag
- [x] Implementare download tessera `GET /api/cards/{token}/download` (HTML printable MVP)
- [x] Aggiungere placeholder wallet endpoints Apple/Google (404 quando non configurato)
- [x] Aggiornare issuer/email: subject per-org, logo org + ASSONAM, bottone "Scarica tessera"
- [x] Estendere response ingest con token/url utili per Thank You page
- [x] Aggiornare Thank You FE: copy richiesto, club dinamico, bottone "Scarica ora", wallet CTA condizionali
- [x] Aggiungere configurazione branding in UI super-admin (almeno campi base)
- [x] Aggiornare test backend/FE e verifiche build

## Review (Flusso Tessera Pienissimo/ThankYou/Email - Feb 19, 2026) - Update
- `python -m alembic upgrade head` -> OK (migrazione `l3m4n5o6p7q8`)
- `$env:DATABASE_URL='sqlite:///test_qa.db'; python -m alembic upgrade head` -> OK (allineamento DB test)
- `python -m pytest tests/test_integration_issue_member.py tests/test_ingest_pienissimo.py tests/test_member_card_verification.py -q` -> 17 passed
- `npm --prefix frontend run build` -> OK
- Nota: `python -m pytest tests/test_soft_delete.py tests/test_smoke.py -q` ha 1 failure preesistente su endpoint legacy `/api/super-admin/orgs/1/cards/increase` (risponde 400 invece di 401/403), non introdotto da questo change-set.

## ThankYou + Logo placement (Feb 19, 2026) - Update
- [x] Aggiornare titolo form Thank You in "ULTIMO PASSO PER RICEVERE LA TESSERA"
- [x] Migliorare layout tessera con doppio logo leggibile (logo associazione + ASSONAM, senza coprire testi)
- [x] Verificare build frontend e test backend toccati











---
## Spec (Cleanup soci eliminati multi-associazione - Feb 19, 2026)
- Obiettivo: eliminare definitivamente le "tracce" dei soci soft-deleted in tutte le associazioni, evitando errori 500/duplicati in iscrizione.
- Vincoli: nessuna regressione sui flussi join/register/integration; cleanup scoped per associazione quando richiesto dai flussi runtime.

## Plan (Cleanup soci eliminati multi-associazione)
- [x] Tracciare spec e piano operativo in `tasks/todo.md`.
- [x] Implementare bonifica retroattiva globale dei soci `deleted_at` con identificativi ancora presenti (startup-safe/idempotente).
- [x] Hardening runtime su iscrizione/registrazione per pulire conflitti legacy prima dei controlli duplicati.
- [x] Aggiungere test regressione per ri-iscrizione dopo delete su associazioni diverse.
- [x] Eseguire test mirati e compilare Review con esiti.

## Execution Update (Cleanup soci eliminati multi-associazione - Feb 19, 2026)
- [x] Implementata utility condivisa `cleanup_deleted_member_traces` in `app/services/member_cleanup.py` per bonifica identificativi su soci `deleted_at`.
- [x] Hardening `app/routes/join.py`: cleanup pre-check signup (email/fiscal), matching email case-insensitive e gestione `IntegrityError` con HTTP 409 (no 500 generico).
- [x] Hardening `app/routes/member.py` (`/api/auth/register`): controllo duplicati scoped per org + cleanup pre-check su record deleted legacy.
- [x] Bonifica retroattiva globale collegata a startup in `init_db.py` (idempotente, con log conteggio righe pulite).
- [x] Aggiunti test regressione multi-associazione in `tests/test_deleted_member_cleanup_multiorg.py`.

## Review (Cleanup soci eliminati multi-associazione - Feb 19, 2026)
- `python -m pytest tests/test_deleted_member_cleanup_multiorg.py tests/test_signup_fixes.py tests/test_member_active_state_regression.py -q` -> **10 passed**
- Esito: i soci soft-deleted legacy vengono bonificati (globale + runtime), la ri-iscrizione per associazione non lascia conflitti residui, e i conflitti legacy non esplodono pi˘ in 500 nel submit iscrizione.




- [x] Esteso fix con hard purge fisico dei soci `deleted_at` (cleanup FK) in `app/services/member_cleanup.py`, invocato in startup (`init_db.py`) e pre-check join/register.
- [x] Verifica locale purge on-demand: `purged_deleted_members=0` (DB locale gi‡ pulito).
- `python -m pytest tests/test_deleted_member_cleanup_multiorg.py tests/test_signup_fixes.py tests/test_member_active_state_regression.py -q` -> **10 passed** (post hard-purge update).

---
## Spec (Full Audit ASSONAM - Feb 19, 2026)
- Obiettivo: audit end-to-end sicurezza, regressioni funzionali (focus integrazione Pienissimo), integrita dati e robustezza UX/API per stack Vite/React + FastAPI + DB.
- Deliverable: report markdown con executive summary + tabella findings + checklist PASS/FAIL, patch mirate per tutti i Must Fix, test aggiornati per ogni fix rilevante.

## Plan (Full Audit ASSONAM)
- [ ] Inventory completo backend/frontend: routes, middleware, auth boundaries, servizi ingest/verify/download/pdf/email.
- [ ] Eseguire audit tool-based con skill `audit-website` (squirrel) dove applicabile e dependency/secrets scan locale.
- [ ] Verificare checklist SECURITY/FUNCTIONAL richiesta e classificare finding per severita/impatto/riproduzione.
- [ ] Definire Top 10 criticita con piano fix (Must fix before prod vs Nice to have).
- [ ] Implementare patch mirate sui Must Fix (no refactor massivi) con hardening security/data consistency.
- [ ] Aggiungere/aggiornare test backend/frontend per ogni fix importante e coprire regressioni Pienissimo.
- [ ] Eseguire test/build mirati, validare assenza regressioni principali e raccogliere evidenze.
- [ ] Redigere report finale markdown in `docs/assonam_full_audit_2026-02-19.md` con risultati completi.

## Review (Full Audit ASSONAM - Feb 19, 2026)
- [ ] Da compilare a fine esecuzione con comandi, esiti e file modificati.

## Execution Update (Full Audit ASSONAM - Feb 19, 2026)
- [x] Inventory completo backend/frontend: routes, middleware, auth boundaries, servizi ingest/verify/download/pdf/email.
- [x] Eseguire audit tool-based con skill `audit-website` (squirrel) dove applicabile e dependency/secrets scan locale.
- [x] Verificare checklist SECURITY/FUNCTIONAL richiesta e classificare finding per severita/impatto/riproduzione.
- [x] Definire Top 10 criticita con piano fix (Must fix before prod vs Nice to have).
- [x] Implementare patch mirate sui Must Fix (no refactor massivi) con hardening security/data consistency.
- [x] Aggiungere/aggiornare test backend/frontend per ogni fix importante e coprire regressioni Pienissimo.
- [x] Eseguire test/build mirati, validare assenza regressioni principali e raccogliere evidenze.
- [x] Redigere report finale markdown in `docs/assonam_full_audit_2026-02-19.md` con risultati completi.

## Review (Full Audit ASSONAM - Feb 19, 2026) - Update
- `squirrel --version` -> comando non disponibile nel workspace (`squirrel` non installato), audit skill eseguito in fallback manuale code-first.
- Dependency/security scan:
  - `npm --prefix frontend audit --audit-level=high --json` -> 2 vuln moderate (transitive `esbuild` via `vite`, fix major `vite@7.3.1` consigliato).
  - `python -m pip_audit` -> modulo non installato (`No module named pip_audit`).
  - `rg` secrets scan su repo -> nessuna chiave raw esposta nei sorgenti applicativi.
- Hardening implementato:
  - Rate-limit DB per endpoint pubblici tessera (`verify/download/download.pdf/image`) riusando tabella `ingest_rate_limits`.
  - Rimosso leak token verso servizio QR esterno: QR ora embedded `data:image/png;base64`.
  - Security headers estesi (CSP, COOP/CORP, HSTS su HTTPS) + cookie `same_site=strict`.
  - CSRF best-effort su endpoint session-auth (origin/referer mismatch -> 403).
  - PII minimizzata nei log integrazione/login (hash external id/email).
  - Hardening RBAC endpoint legacy `/api/super-admin/orgs/{id}/cards/increase` (auth check prima della risposta deprecata).
  - Sanitizzazione header email (`To`/`Subject`) contro header injection.
- Test eseguiti:
  - `python -m pytest tests/test_security_hardening_audit.py tests/test_member_card_verification.py tests/test_ingest_pienissimo.py tests/test_smoke.py -q` -> **43 passed**
  - `npm --prefix frontend run build` -> **OK**
- File nuovi/modificati principali:
  - `app/services/db_rate_limit.py`
  - `app/main.py`, `app/middleware.py`, `app/config.py`
  - `app/routes/public.py`, `app/routes/ingest_pienissimo.py`, `app/routes/member.py`, `app/routes/super_admin.py`
  - `app/services/integration_issuer.py`, `app/utils.py`
  - `tests/test_security_hardening_audit.py`, `tests/test_ingest_pienissimo.py`

---
## Spec (Oasi-2 mono-color card + ingest already_issued idempotenza - Feb 20, 2026)
- Obiettivo: rendere la tessera `oasi-2` mono-colore senza watermark centrale, migliorare visibilita logo in thank-you e rendere ingest idempotente su email gia tesserata con risposta `already_issued`.
- Vincoli: nessuna regressione per altre organizzazioni; mantenere invariati campi testuali tessera; riuso `club_display_name` come fonte naming.

## Plan (Oasi-2 mono-color card + ingest already_issued idempotenza)
- [x] Aggiornare backend ingest (`/api/ingest/pienissimo/{org_slug}`): normalizzazione email, check attivo current-year, risposta `already_issued` senza side-effect, blocco deleted.
- [x] Aggiungere protezione anti-race DB con indice unico parziale su org+anno+email normalizzata attiva.
- [x] Aggiornare naming branding a `Golden Age Club - Speakeasy` via `club_display_name` (override + data update `oasi-2`).
- [x] Restyle card `oasi-2` su frontend preview + renderer backend (HTML download, email fallback, PDF, PNG): sfondo mono-colore, logo org in alto, no watermark.
- [x] Migliorare Thank You page: stato `already_issued`, messaggio dedicato e logo plate nero con blur/backdrop responsive.
- [x] Aggiornare test backend/frontend toccati e validare con pytest mirati + build frontend.

## Review (Oasi-2 mono-color card + ingest already_issued idempotenza - Feb 20, 2026)
- [x] Compilata in sezione Review - Update.

## Execution Update (Oasi-2 mono-color card + ingest already_issued idempotenza - Feb 20, 2026)
- [x] Backend ingest hardening: check preventivo su email normalizzata + socio attivo current-year (`is_member_active`) con risposta `200 already_issued` e link tessera (`verify_url`, `download_pdf_url`) senza nuovi side-effect.
- [x] Policy deleted: blocco emissione su email di socio soft-deleted (409 `member_deleted`) senza riattivazione automatica.
- [x] Service issuer allineato: opzione `allow_deleted_reissue`, supporto reissue annuale (nuovo anno) e tracciamento audit `issued_new_card`.
- [x] DB: migration `m4n5o6p7q8r9` con indice unico parziale `uq_members_org_year_lower_email_active` e data-fix `oasi-2` -> `Golden Age Club - Speakeasy`; fallback startup in `init_db.py`.
- [x] Card UI `oasi-2` allineata su FE preview e renderer backend (download HTML, email fallback, PDF, PNG): fondo mono-colore bordeaux, watermark rimosso, logo org in alto, ASSONAM mantenuto.
- [x] Thank-you page aggiornata: logo con plate nero (blur/backdrop) e copy dedicata in stato `already_issued` con bottoni download/verifica.
- [x] Rename completato: stringa legacy sostituita con `Golden Age Club - Speakeasy` via `club_display_name` dove applicabile (incluse aspettative test).

## Review (Oasi-2 mono-color card + ingest already_issued idempotenza - Feb 20, 2026) - Update
- `python -m py_compile app/routes/ingest_pienissimo.py app/services/integration_issuer.py app/services/org_branding.py app/services/card_image.py app/services/card_pdf.py app/routes/public.py init_db.py` -> **OK**
- `python -m py_compile tests/test_ingest_pienissimo.py tests/test_member_card_verification.py tests/test_integration_issue_member.py` -> **OK**
- `python -m pytest tests/test_ingest_pienissimo.py tests/test_member_card_verification.py tests/test_integration_issue_member.py -q` -> **20 passed**
- `npm --prefix frontend run build` -> **OK**
- `python -m alembic upgrade head` -> **OK** (applicata `m4n5o6p7q8r9`)
## Visual QA Update (Oasi-2 branding check - Feb 20, 2026)
- Screenshot Playwright generati:
  - `tasks/screenshots/oasi2-card-download-desktop.png`
  - `tasks/screenshots/oasi2-thankyou-desktop.png`
  - `tasks/screenshots/oasi2-thankyou-mobile.png`
- Verifica visuale: card `oasi-2` con fondo mono-colore bordeaux, logo associazione posizionato in alto (non watermark), logo ASSONAM in alto a destra, campi testuali invariati.
- Verifica thank-you: logo header su plate nero con blur/backdrop, resa leggibile sia desktop che mobile.


---
## Spec (Allocazione tessere multi-lotto annuale + concurrency-safe - Feb 21, 2026)
- Obiettivo: supportare pi˘ lotti attivi nello stesso anno per associazione e garantire emissione continua senza blocco quando un lotto termina.
- Vincoli: funzione unica `allocate_next_card(org_id, year)` con lock transazionale, fallback automatico tra lotti disponibili, errore chiaro `card_range_exhausted` (409), integrazione su flussi manuali + ingest Pienissimo.

## Plan (Allocazione tessere multi-lotto annuale + concurrency-safe)
- [x] Implementare servizio unico `app/services/card_allocation.py` con `allocate_next_card(db, org_id, year)` e lock concurrency-safe.
- [x] Aggiornare `CardBatch` e creazione lotti per supportare `year` (migrazione Alembic + fallback startup `init_db.py`).
- [x] Sostituire tutti i punti di emissione tessera (manual signup/join, org-admin decision/payment, admin legacy, ingest/integration issuer) con la nuova funzione.
- [x] Aggiornare KPI/sommari lotti `assegnate/rimanenti` evitando `next_no - start_no` dove esposto in API.
- [x] Aggiungere logging allocation (`org_id`, `year`, `batch_id`, `card_no`) e evento `batch_exhausted_fallback`.
- [x] Aggiungere test obbligatori: fallback A->B, A esaurito ma B disponibile, tutti esauriti -> 409, concorrenza 10 emissioni parallele uniche.
- [x] Eseguire test mirati e documentare Review con evidenze.

## Review (Allocazione tessere multi-lotto annuale + concurrency-safe - Feb 21, 2026)
- Nuovo servizio: `app/services/card_allocation.py` con lock transazionale (`pg_advisory_xact_lock` su PostgreSQL, `BEGIN IMMEDIATE` su SQLite), filtro lotti per `org_id/year/released_at`, fallback automatico e logging `batch_exhausted_fallback` + `card_allocated`.
- Compatibilit‡: wrapper legacy `app/services/card.py` ora delega a `allocate_next_card(...)`.
- Emissione aggiornata nei flussi: `app/routes/join.py`, `app/routes/org_admin.py`, `app/routes/admin.py`, `app/services/integration_issuer.py`.
- Supporto anno lotto: `CardBatch.year` in `app/models.py`, migrazione `alembic/versions/n5o6p7q8r9s0_add_card_batch_year.py`, fallback bootstrap in `init_db.py`.
- KPI/sommari lotti super-admin: `app/routes/super_admin.py` usa conteggi reali su membri per `assigned/remaining` (non `next_no-start_no`) e supporta `year` nei payload lotto.
- Test obbligatori implementati in `tests/test_card_assignment.py` (fallback A->B, A esaurito con B disponibile, esaurimento totale 409, concorrenza 10 parallele senza duplicati).
- Aggiornamento test regressione org-admin decision: `tests/test_org_admin_decision.py` ora garantisce lotto disponibile per anno corrente.
- Comandi eseguiti:
  - `python -m pytest tests/test_card_assignment.py tests/test_ingest_pienissimo.py tests/test_integration_issue_member.py tests/test_org_admin_decision.py tests/test_org_admin_manual_payment.py -q` -> **22 passed**
  - `python -m pytest tests/test_optional_identity_document.py tests/test_signup_fixes.py -q` -> **9 passed**
  - `python -m pytest tests/test_card_assignment.py tests/test_ingest_pienissimo.py tests/test_integration_issue_member.py tests/test_org_admin_decision.py tests/test_org_admin_manual_payment.py tests/test_optional_identity_document.py tests/test_signup_fixes.py tests/test_member_active_state_regression.py tests/test_super_admin_association_delete_release_range.py -q` -> **35 passed**
  - setup locale schema test: `if (Test-Path test_qa.db) { Remove-Item -Force test_qa.db }; $env:DATABASE_URL='sqlite:///test_qa.db'; python -c "from init_db import init_db; init_db()"` -> **OK**

---
## Spec (Riuso numeri tessera dopo delete - Feb 21, 2026)
- Obiettivo: quando una tessera viene eliminata, il numero deve tornare disponibile subito e la prossima emissione deve riutilizzare i numeri liberati prima di avanzare.
- Vincoli: mantenere lock/concurrency-safe su allocazione, nessun doppio numero in richieste parallele, nessuna regressione su ingest/manual/admin.

## Plan (Riuso numeri tessera dopo delete)
- [x] Ripristinare allocazione basata su `next_no` con lock forte, evitando duplicati in concorrenza.
- [x] Introdurre helper centralizzato `release_card_number(...)` per riavvolgere `batch.next_no` quando un numero viene liberato.
- [x] Integrare il rilascio nei flussi che azzerano card (`org_admin delete`, `member maintenance`, cleanup deleted ingest/legacy).
- [x] Aggiornare test: regressione delete->reissue e test esplicito di riuso numero rilasciato.
- [x] Eseguire pytest mirato e registrare esiti.

## Review (Riuso numeri tessera dopo delete - Feb 21, 2026)
- `app/services/card_allocation.py` aggiornato con `release_card_number(...)` + fallback robusto di risoluzione batch (anche in casi legacy con anno non allineato).
- `app/routes/org_admin.py`: su delete membro ora viene fatto rewind di `next_no` prima di azzerare i campi tessera.
- `app/services/member_maintenance.py`, `app/services/integration_issuer.py`, `app/services/member_cleanup.py`: rilascio numero integrato nei punti di cleanup card.
- Test aggiornati:
  - `tests/test_card_assignment.py`: nuovo test `test_released_cards_are_reused_before_advancing_progressive`.
  - `tests/test_member_active_state_regression.py`: atteso riuso dello stesso numero dopo delete/reissue.
- Comandi eseguiti:
  - `python -m pytest tests/test_card_assignment.py::test_allocate_is_concurrency_safe_for_10_parallel_requests tests/test_member_card_expiration_maintenance.py::test_maintenance_frees_email_and_card_number_for_new_issue -q` -> **2 passed**
  - `python -m pytest tests/test_card_assignment.py tests/test_member_active_state_regression.py tests/test_ingest_pienissimo.py tests/test_integration_issue_member.py tests/test_member_card_expiration_maintenance.py tests/test_org_admin_decision.py tests/test_org_admin_manual_payment.py tests/test_super_admin_association_delete_release_range.py -q` -> **30 passed**

---
## Spec (Statuto area socio + badge Pienissimo + email tessera post-verifica - Feb 23, 2026)
- Obiettivo A: rendere sempre disponibile in area socio (Documenti) lo statuto dell'associazione con endpoint autenticato e download sicuro.
- Obiettivo B: mostrare badge `INTEGRAZIONE PIENISSIMO` solo per soci creati via ingest/API Pienissimo (`signup_source = pienissimo`), non per iscrizioni web/manual.
- Obiettivo C: inviare automaticamente la tessera al socio dopo approvazione/verifica documenti, in modo idempotente (una sola volta per tessera/anno), senza rompere i flussi Pienissimo esistenti.
- Vincoli: riuso infrastruttura esistente (`Organization.statute_pdf_path`, mailer/tessera), migrazioni Alembic per cambi schema, test minimi backend/FE.

## Plan (Statuto + badge Pienissimo + email tessera post-verifica)
- [x] Ricognizione completata e mappatura punti di integrazione (modelli, route, FE dashboard, table badge, email/tessera).
- [ ] Backend A: aggiungere endpoint socio `/api/me/organization/statute` + `/api/me/organization/statute/download` riusando `Organization.statute_pdf_path`.
- [ ] Frontend A: aggiungere card "Statuto dell'associazione" nella pagina `DashboardDocuments` con stati loading/available/not-available e download robusto.
- [ ] Backend B: hardening `signup_source` (migration default/backfill) e verifica flussi web/ingest; mantenere `pienissimo` solo per ingest.
- [ ] Frontend B: correggere logica badge in tabella soci per mostrare la pill solo con `signup_source === pienissimo`.
- [ ] Backend C: aggiungere campo idempotenza invio tessera post-verifica (riuso o nuova colonna dedicata) + migration/backfill.
- [ ] Backend C: introdurre servizio condiviso per invio email tessera e agganciarlo all'approvazione documenti (approve/review) con guard anti-duplicate.
- [ ] Test: aggiungere test minimi per statuto area socio, badge/signup_source, email tessera post-verifica idempotente.
- [ ] Verifica finale: pytest mirati + build frontend + `alembic upgrade head`, poi compilare Review con esiti.

## Review (Statuto + badge Pienissimo + email tessera post-verifica - Feb 23, 2026)
- [ ] Da compilare a fine implementazione.

## Execution Update (Statuto + badge Pienissimo + email tessera post-verifica - Feb 23, 2026)
- [x] Ricognizione completata (modelli `Organization/Member/MemberDocument`, flusso `ingest_pienissimo`, tabella soci org-admin, mailer/tessera).
- [x] Backend A: aggiunti endpoint socio `/api/me/organization/statute` e `/api/me/organization/statute/download` riusando `Organization.statute_pdf_path`.
- [x] Frontend A: aggiunta card "Statuto dell'associazione" in `DashboardDocuments` con loading/available/not available + download via `fetch`/blob.
- [x] Backend B: hardening `signup_source` con default/backfill (migrazione + fallback startup `init_db.py`) mantenendo `pienissimo` come unico source integrazione.
- [x] Frontend B: badge `INTEGRAZIONE PIENISSIMO` mostrato solo per `signup_source` `pienissimo`/`pienissimo_api`.
- [x] Backend C: aggiunto `members.card_delivered_at` (migrazione + backfill da `card_email_sent_at`) e sincronizzazione delivery nel flusso integrazione.
- [x] Backend C: nuovo servizio idempotente `member_card_delivery` agganciato a review documenti + attivazione socio (decision/manual payment).
- [x] Test minimi aggiunti: statuto area socio, signup_source web, email tessera post-verifica idempotente.

## Review (Statuto + badge Pienissimo + email tessera post-verifica - Feb 23, 2026) - Update
- `python -m py_compile app\\routes\\member.py app\\routes\\org_admin.py app\\services\\integration_issuer.py app\\services\\member_card_delivery.py app\\email_templates\\member_card_email.py tests\\test_member_documents_dashboard.py tests\\test_document_workflow.py tests\\test_signup_fixes.py` -> **OK**
- `npm --prefix frontend run build` -> **OK**
- `python -m alembic upgrade head` -> **OK** (migrazione `p6q7r8s9t0u1`)
- `python -m pytest tests\\test_member_documents_dashboard.py::test_member_can_fetch_and_download_organization_statute tests\\test_signup_fixes.py::test_web_register_sets_signup_source_assonam_form tests\\test_document_workflow.py::test_document_approval_sends_card_email_once_for_active_member tests\\test_ingest_pienissimo.py::test_ingest_retry_100x_is_idempotent_and_sends_email_once tests\\test_integration_issue_member.py::test_issue_member_captures_html_email_with_verification_url -q` -> **5 passed**
- Nota compatibilit‡ locale/test DB: aggiunto fallback bootstrap in `init_db.py` per colonna `members.card_delivered_at` e normalizzazione `signup_source` su schema legacy non ancora migrato.

---
## Spec (Google Wallet Android per tessera socio + credenziali sicure - Feb 23, 2026)
- Obiettivo: permettere al socio autenticato di generare un link "Aggiungi a Google Wallet" (Android) dalla propria area riservata, con class/object Generic pass gestiti lato backend e credenziali service account non committate.
- Vincoli: solo Google Wallet (no Apple, no OAuth utente), gestione credenziali via file path o ENV base64, Alembic migration per campi wallet, docs operative per deploy (Docker/Hetzner).
- Sicurezza: nessun JSON credenziali nel repo; `secrets/` gitignored con README; log senza leak di private key/JWT/secrets.

## Plan (Google Wallet Android + credenziali sicure)
- [ ] Task 0 ricognizione completa (modelli socio/tessera, endpoint verifica QR, `/api/auth/me`, pagina FE tessera, config/env, docker).
- [ ] Task 1: hardening credenziali (`.gitignore`, `secrets/README.md`, config/env loader file/b64, compose produzione overlay).
- [ ] Task 2: migration Alembic + model fields `google_wallet_*` su `members` (fallback startup `init_db.py` per schema legacy locale/test).
- [ ] Task 3: servizio backend Google Wallet (credenziali, REST client, ensure generic class/object, JWT save link, logging) + endpoint socio `POST /api/me/wallet/google/save-link`.
- [ ] Task 4: frontend area socio (pagina tessera in `DashboardHome`) con bottone "Aggiungi a Google Wallet", loading/error e redirect.
- [ ] Task 5: documentazione `docs/GOOGLE_WALLET.md` + note Hetzner/Docker secret e ENV base64.
- [ ] Task 6: test minimi (loader credenziali file/b64 + endpoint save-link no-env / mock success) e verifiche build/pytest/alembic.

## Review (Google Wallet Android + credenziali sicure - Feb 23, 2026)
- [ ] Da compilare a fine implementazione.

## Review (Google Wallet Android + credenziali sicure - Feb 23, 2026) - Update
- Credenziali sicure: `.gitignore` aggiornato per `secrets/`, `google-wallet*.json`, `*.b64`; aggiunto `secrets/README.md` con istruzioni locali/server (nessun JSON committato).
- Backend config: aggiunte env `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_WALLET_SA_B64`, timeout HTTP wallet.
- Backend service: nuovo `app/services/google_wallet.py` con loader credenziali file/b64, token service-account (`wallet_object.issuer`), ensure `genericClass`/`genericObject`, JWT `Save to Google Wallet`, logging error-safe.
- Endpoint socio: `POST /api/me/wallet/google/save-link` in `app/routes/member.py` con auth, idempotenza object/class, persistenza campi `google_wallet_*`, gestione errori config/API.
- DB: migrazione Alembic `q1r2s3t4u5v6` + campi `google_wallet_*` su `members`; fallback schema legacy in `init_db.py`.
- Frontend: bottone `Aggiungi a Google Wallet` in dashboard tessera (`DashboardHome`) con loading/error e redirect al save URL; client API dedicato in `frontend/src/lib/api.ts`.
- Infra/docs: `docker-compose.prod.yml` overlay per mount read-only secret Google Wallet; `docs/GOOGLE_WALLET.md` con setup locale/prod, base64 fallback e troubleshooting.
- Test minimi aggiunti: `tests/test_google_wallet.py` (loader file/b64 + endpoint no-creds + mock success).
- Comandi eseguiti:
  - `python -m py_compile app\\services\\google_wallet.py app\\routes\\member.py app\\models.py app\\config.py init_db.py tests\\test_google_wallet.py` -> **OK**
  - `python -m alembic upgrade head` -> **OK** (migrazione `q1r2s3t4u5v6`)
  - `python -m pytest tests\\test_google_wallet.py -q` -> **4 passed**
  - `npm --prefix frontend run build` -> **OK**
- Nota operativa: non ho usato il file JSON reale indicato nel prompt (`C:\\Users\\edoar\\Downloads\\...json`); va spostato in `secrets/` o montato come secret in produzione per evitare leak/commit accidentali.
- Live test (credenziali reali + issuer `3388000000023089481`): endpoint `POST /api/me/wallet/google/save-link` verificato in locale su DB temporaneo -> **200 OK**, `classId` e `objectId` persistiti, save URL generato.
- Fix runtime emerso dal live test: Google Wallet rifiutava `logo.sourceUri` con URL locale (`http://localhost:8000/...`) in create object (400). Aggiornato `app/services/google_wallet.py` per omettere il logo quando l'URL non Ë pubblico/raggiungibile (localhost/127.0.0.1).

---
## Spec (Email tessera pronta + CTA Wallet handoff + statuto + badge Pienissimo + test - Feb 23, 2026)
- Obiettivo: completare il flusso end-to-end post-verifica socio con email aggiornata (accesso area riservata + CTA Google Wallet Android + link tessera/statuto), aggiungere pagina frontend `/wallet/google/add`, mantenere/finire statuto area socio e fix badge Pienissimo, con test minimi backend.
- Vincoli: riuso endpoint `/api/me/wallet/google/save-link` e flussi auth/magic-link esistenti; nessuna nuova auth; nessun secret nei commit; nessuna regressione su dashboard/documenti/admin.
- Nota: campo origine iscrizione `signup_source` e statuto area socio sono gi‡ presenti da task precedenti, quindi questo task completa alias/coverage/test e rifiniture UI/email.

## Plan (Email tessera pronta + CTA Wallet handoff + statuto + badge Pienissimo + test)
- [ ] Ricognizione finale dei punti gi‡ implementati vs gap (email template/call-site, route wallet handoff, alias statuto, test coverage).
- [ ] Backend: arricchire email tessera pronta (CTA wallet handoff, area riservata, vedi tessera, statuto) e allineare copy "email"; riusare trigger idempotente esistente.
- [ ] Backend: aggiungere alias endpoint sicuro `GET /api/me/documents/statute` (download) e, se necessario, rifinire source admin (`signup_source=admin`).
- [ ] Frontend: nuova pagina pubblica `/wallet/google/add` con auto-redirect se autenticato, CTA login/magic-link se non autenticato, messaggi UX chiari; registrare route in `App.tsx`.
- [ ] Test: aggiornare/aggiungere pytest per email content + alias statuto + esposizione `signup_source` in lista org-admin + mantenere save-link mock test; build frontend e pytest mirati.
- [ ] Commit ordinati + preparazione descrizione PR (se il push/PR remoto non Ë disponibile, produrre testo PR pronto).

## Review (Email tessera pronta + CTA Wallet handoff + statuto + badge Pienissimo + test - Feb 23, 2026)
- [ ] Da compilare a fine implementazione.
## Review (Email tessera pronta + CTA Wallet handoff + statuto + badge Pienissimo + test - Feb 23, 2026) - Update
- Email `tessera pronta`: template `app/email_templates/member_card_email.py` esteso con CTA `Aggiungi a Google Wallet (Android)`, link area riservata, `Vedi la tua tessera`, `Scarica lo statuto`, copy aggiornato con "email" e nota iPhone.
- Trigger idempotente riusato (`card_delivered_at`) senza nuovi campi DB; call-site aggiornati in `app/services/member_card_delivery.py` e `app/services/integration_issuer.py` per passare URL frontend/handoff.
- Nuova pagina frontend pubblica `frontend/src/pages/WalletGoogleAdd.tsx` + route `/wallet/google/add` in `frontend/src/App.tsx`: auto-call `POST /api/me/wallet/google/save-link`, redirect a Google Wallet se auth, altrimenti CTA login + invio magic-link via `/api/auth/login` (password vuota).
- Backend statuto: alias download sicuro `GET /api/me/documents/statute` aggiunto in `app/routes/member.py` (riusa il controllo org del socio gi‡ esistente).
- Origine iscrizione admin: `create_org_member` ora imposta `signup_source='admin'` (`SignupSource.ADMIN`) in `app/routes/org_admin.py`; nessuna migration nuova richiesta perchÈ il campo `signup_source` esiste gi‡ e la colonna Ë TEXT.
- Test backend aggiornati/aggiunti:
  - contenuto email post-verifica include CTA Wallet + link documenti/statuto + copy "email"
  - email integrazione include CTA Wallet handoff
  - alias statuto `/api/me/documents/statute`
  - scoping statuto per sessione/org (A vede A, B vede B)
  - org-admin manual create => `signup_source=admin`
  - lista org-admin espone `signup_source` (admin/pienissimo/web)
- FE test automatici non aggiunti: nel progetto non Ë presente setup Vitest/Playwright; verificata build Vite/TS invece.
- Comandi eseguiti:
  - `python -m py_compile app\\email_templates\\member_card_email.py app\\services\\member_card_delivery.py app\\services\\integration_issuer.py app\\routes\\member.py app\\routes\\org_admin.py app\\models.py` -> **OK**
  - `npm --prefix frontend run build` -> **OK**
  - `python -m pytest ...` (8 test mirati su email/statuto/signup_source/wallet) -> **8 passed**
  - `python -m pytest tests\\test_google_wallet.py -q` -> **4 passed**
  - `python -m alembic upgrade head` -> **OK**
- Nota runtime locale Google Wallet: mantenuto fix che omette il logo nel pass se `BASE_URL/FRONTEND_URL` puntano a `localhost`, per evitare 400 da Google Wallet Objects API.
---
## Spec (Fix upload statuto 413 + CSP Google Fonts - Feb 23, 2026)
- Obiettivo: rendere affidabile l'upload dello statuto fino a 10 MB (proxy a 12 MB), con errori chiari backend/frontend.
- Diagnosi live: POST /api/org-admin/organization/statute > ~1 MB viene bloccato da nginx/1.24.0 con 413 prima di FastAPI (curl), mentre upload piccoli arrivano al backend (401 senza sessione).
- Vincoli: limite app hard 10 MB, fix proxy non illimitato, nessuna regressione su altri upload/endpoints, log sicuri, docs operative per proxy esterno al repo.

## Plan (Fix upload statuto 413 + CSP Google Fonts)
- [x] Ricognizione/diagnosi completata: punto 413 identificato (nginx live) con evidenze curl.
- [ ] Backend: hardening upload statuto (Content-Length check se presente, mapping errori 413/415, messaggi chiari) e allineamento super-admin statuto.
- [ ] Backend: handler globali HTTPException / RequestValidationError JSON user-friendly.
- [ ] Frontend: API + UI org-admin settings per mostrare messaggi reali su 413/415/5xx.
- [ ] Test: upload statuto >10MB => 413; formato non valido => 415; PDF valido => 200.
- [ ] CSP/Fonts: rimuovere Google Fonts oppure aggiornare CSP in modo coerente.
- [ ] Docs/Ops: snippet Nginx client_max_body_size 12M + reload; nota proxy config non versionata nel repo.
- [ ] Verifica finale: pytest mirati + build frontend e Review.

## Review (Fix upload statuto 413 + CSP Google Fonts - Feb 23, 2026)
- [ ] Da compilare a fine implementazione.
## Review (Fix upload statuto 413 + CSP Google Fonts - Feb 23, 2026) - Update
- Diagnosi live completata: `413 Request Entity Too Large` confermato da `nginx/1.24.0 (Ubuntu)` prima di FastAPI (probe `curl` con multipart ~2MB); request piccola raggiunge backend e risponde `401` JSON.
- Backend: nuovo helper condiviso `app/services/statute_upload.py` con limite hard file 10MB, pre-check header request 12MB, mapping errori `413/415/422` e messaggi chiari; applicato a route org-admin e super-admin statuto.
- Backend: handler globali JSON per `RequestValidationError` e `HTTPException` con `message` user-friendly + `request_id` (mantiene `detail` delle 422).
- Frontend: `uploadOrgAdminStatute`/`uploadSuperAdminStatute` ora distinguono `413/415/422/5xx`; `OrgAdminSettings` mostra il motivo reale e fa pre-check client-side PDF/10MB.
- CSP: `app/middleware.py` aggiornato per consentire Google Fonts (`style-src`, `font-src`, `connect-src`).
- Ops/proxy: aggiunti `docs/UPLOAD_STATUTE_10MB.md` e snippet `ops/nginx/assonam-upload-limit.conf.example` con `client_max_body_size 12M` + reload/verifica.
- Test aggiunti: `tests/test_org_admin_statute_upload.py` (`>10MB => 413`, non-PDF => 415, PDF valido => 200`).
- Comandi eseguiti:
  - `curl -I https://assonam.it/api/org-admin/organization/statute` -> `Server: nginx/1.24.0 (Ubuntu)`
  - `curl POST multipart ~2MB` -> `413 Request Entity Too Large` (Nginx)
  - `curl POST multipart ~100KB` -> `401 Unauthorized` JSON (backend raggiunto)
  - `python -m py_compile app\\main.py app\\middleware.py app\\routes\\org_admin.py app\\routes\\super_admin.py app\\services\\statute_upload.py tests\\test_org_admin_statute_upload.py` -> OK
  - `python -m pytest tests\\test_org_admin_statute_upload.py -q` -> `3 passed`
  - `python -m pytest tests\\test_org_admin_manual_member.py::test_org_admin_cannot_override_org_id tests\\test_ingest_pienissimo.py::test_ingest_requires_email_even_when_external_id_is_provided -q` -> `2 passed`
  - `npm --prefix frontend run build` -> OK
---
## Spec (Diagnosi upload statuto bloccato a ~1MB in org-admin - Feb 23, 2026)
- Obiettivo: verificare perche' la UI org-admin mostra "File troppo grande (max 10 MB)" gia' oltre ~1 MB.
- Vincolo: confermare se il limite e' applicativo (frontend/FastAPI) o infrastrutturale (proxy), evitando fix cosmetici non risolutivi.

## Plan (Diagnosi upload statuto bloccato a ~1MB in org-admin)
- [x] Controllare pre-check frontend pagina `Associazione > Statuto`.
- [x] Controllare limite backend/statute upload e test esistenti.
- [x] Verificare presenza/assenza config reverse proxy nel repo e documentazione operativa.
- [x] Documentare esito e fix operativo da applicare sul server.

## Review (Diagnosi upload statuto bloccato a ~1MB in org-admin - Feb 23, 2026)
- Frontend gia' a `10 * 1024 * 1024` in `frontend/src/pages/org-admin/OrgAdminSettings.tsx` (pre-check client-side 10 MB).
- Backend gia' a `10 MB` in `app/services/statute_upload.py` con test dedicati (`tests/test_org_admin_statute_upload.py`).
- Il messaggio UI resta "max 10 MB" anche se il blocco avviene prima, perche' `frontend/src/lib/api.ts` usa un fallback generico su HTTP `413`.
- Root cause confermata dalla documentazione operativa esistente: reverse proxy Nginx con limite body di default (~1 MB) prima di FastAPI.
- Fix reale: applicare `client_max_body_size 12M;` nel vhost Nginx (snippet gia' presente in `ops/nginx/assonam-upload-limit.conf.example`, guida in `docs/UPLOAD_STATUTE_10MB.md`).

---
## Google Wallet Branding per Associazione (Feb 23, 2026)
- [ ] Ricognizione Wallet branding per org (modello Organization, wallet service, OrgAdminSettings, asset Golden Age, static/uploads)
- [ ] Aggiungere campi branding Google Wallet a `organizations` + migration Alembic + fallback bootstrap `init_db.py`
- [ ] Implementare upload asset Wallet org-admin (`/api/org-admin/organization/wallet-assets`) con validazioni mime/size e URL pubblici
- [ ] Esporre `/uploads` come static in FastAPI + snippet/config Nginx di esempio
- [ ] Applicare branding per-organization nel payload Google Wallet (logo/hero/bg/title/test-prefix/env) con fallback ASSONAM
- [ ] Aggiornare UI OrgAdminSettings con sezione "Google Wallet Branding" (color picker, title, test flag, upload logo/hero, preview)
- [ ] Precompilare Golden Age (`oasi-2`) con asset/logo e hero image fallback riusando design esistente
- [ ] Aggiungere test backend minimi (payload branding fallback/custom + upload endpoint) e aggiornare test save-link mock
- [ ] Aggiungere docs `docs/WALLET_BRANDING.md` + note deploy/static `/uploads`
- [ ] Eseguire verifiche (`pytest` mirati, `alembic upgrade head`, `npm build`) e documentare Review

## Review (Google Wallet branding per associazione - In corso)
- Pending
- [x] Ricognizione Wallet branding per org (modello Organization, wallet service, OrgAdminSettings, asset Golden Age, static/uploads)
- [x] Aggiungere campi branding Google Wallet a `organizations` + migration Alembic + fallback bootstrap `init_db.py`
- [x] Implementare upload asset Wallet org-admin (`/api/org-admin/organization/wallet-assets`) con validazioni mime/size e URL pubblici
- [x] Esporre `/uploads` come static in FastAPI + snippet/config Nginx di esempio
- [x] Applicare branding per-organization nel payload Google Wallet (logo/hero/bg/title/test-prefix/env) con fallback ASSONAM / Golden Age
- [x] Aggiornare UI OrgAdminSettings con sezione "Google Wallet Branding" (color picker, title, test flag, upload logo/hero, preview)
- [x] Precompilare Golden Age (`oasi-2`) con asset/logo e hero image fallback riusando design esistente
- [x] Aggiungere test backend minimi (payload branding fallback/custom + upload endpoint) e aggiornare test save-link mock
- [x] Aggiungere docs `docs/WALLET_BRANDING.md` + note deploy/static `/uploads`
- [x] Eseguire verifiche (`pytest` mirati, `alembic upgrade head`, `npm build`) e documentare Review

## Review (Google Wallet branding per associazione - Feb 23, 2026)
- Backend: aggiunti campi `wallet_*` su `organizations`, endpoint upload assets org-admin, mount `/uploads`, fallback Golden Age (`oasi-2`) e branding applicato al payload Google Wallet (`logo`, `heroImage`, `hexBackgroundColor`, titolo, moduli testo).
- Frontend: nuova sezione `Google Wallet Branding` in `OrgAdminSettings` con color picker, titolo override, flag demo, upload logo/hero e link preview.
- Golden Age: asset fallback logo riusato (`app/static/card-logos/oasi-2.png`) + nuova hero image `app/static/wallet-heroes/oasi-2-hero.png`.
- Docs/infra: aggiunti `docs/WALLET_BRANDING.md` e snippet Nginx `ops/nginx/assonam-uploads-static.conf.example`.
- Test: `python -m pytest tests/test_google_wallet.py tests/test_org_admin_statute_upload.py -q` -> 13 passed.
- Build: `npm --prefix frontend run build` -> OK.
- Migration: `python -m alembic upgrade head` -> OK (pulito residuo locale `_alembic_tmp_organizations` lasciato da un run Alembic interrotto su SQLite).

---
## Spec (Safe production migration SQLite -> PostgreSQL with rollback - Feb 25, 2026)
- Obiettivo: aggiungere supporto PostgreSQL via Docker Compose mantenendo SQLite come fallback immediato tramite `DATABASE_URL`, senza cancellare file dati e senza migrazioni distruttive automatiche.
- Vincoli: compatibilit‡ runtime con SQLite e Postgres, documentare backup/pgloader/rollback/verifica, nessun `DROP` automatico, nessuna rimozione supporto SQLite.

## Plan (Safe production migration SQLite -> PostgreSQL with rollback)
- [ ] Ricognizione config DB/SQLAlchemy/Alembic e Docker Compose per identificare punti SQLite-specifici che romperebbero Postgres.
- [ ] Aggiornare `docker-compose.yml` con servizio `db` PostgreSQL 16, volume persistente `pgdata` e `depends_on` per `web`.
- [ ] Rendere `app/db.py` (e, se serve, Alembic/env) DB-agnostic per SQLite/Postgres mantenendo fallback SQLite.
- [ ] Aggiornare `requirements.txt` e documentazione env (`DATABASE_URL`, `POSTGRES_PASSWORD`) senza imporre switch immediato in produzione.
- [ ] Creare `MIGRATION.md` con backup SQLite, comando `pgloader`, switch `DATABASE_URL`, rollback e checklist verifica row-count.
- [ ] Creare `scripts/check_db.py` per stampare `engine.url` e `engine.dialect.name`.
- [ ] Verifica finale non distruttiva (script/check sintassi) e compilazione Review con risultati.

## Review (Safe production migration SQLite -> PostgreSQL with rollback - Feb 25, 2026)
- [ ] Da compilare a fine implementazione.

## Execution Update (Safe production migration SQLite -> PostgreSQL with rollback - Feb 25, 2026)
- [x] Ricognizione config DB/SQLAlchemy/Alembic e Docker Compose completata; identificato blocco Postgres su `check_same_thread` applicato sempre.
- [x] `docker-compose.yml` aggiornato con servizio `db` (`postgres:16`), volume `pgdata` e `web.depends_on: db`.
- [x] Runtime DB reso multi-database in `app/db.py` (SQLite/Postgres) con fallback SQLite preservato.
- [x] Alembic reso compatibile multi-database (`render_as_batch` solo SQLite, `connect_args` SQLite condizionale).
- [x] `requirements.txt` aggiornato con `psycopg2-binary`.
- [x] Documentazione env aggiornata (`ENV_REQUIRED.md`) con switch `DATABASE_URL` e `POSTGRES_PASSWORD`.
- [x] Creati `MIGRATION.md` (backup/pgloader/switch/rollback/verifica) e `scripts/check_db.py` (engine URL + dialect).
- [x] Verifica finale non distruttiva completata (py_compile + check script + compose config).

## Review (Safe production migration SQLite -> PostgreSQL with rollback - Feb 25, 2026) - Update
- `python -m py_compile app\\db.py alembic\\env.py scripts\\check_db.py` -> **OK**
- `python scripts\\check_db.py` -> **OK** (`engine.url=sqlite:///./data/app.db`, `engine.dialect.name=sqlite`)
- `docker compose config` -> **OK** (warning attesi su env non impostate; compose renderizza servizio `db`, `depends_on`, volume `pgdata` e default SQLite)
- Nessuna migrazione eseguita, nessun `DROP`, nessun file SQLite eliminato/modificato.

---
## Spec (Super Admin Associazioni: paginazione reale + search server-side - Feb 27, 2026)
- Obiettivo: correggere la lista Super Admin Associazioni per mostrare tutte le organizzazioni con paginazione reale e ricerca server-side sull'intero dataset, preservando lo stato in URL.
- Scope: backend FastAPI endpoint admin organizations + frontend React `SuperAdminOrganizations`; nessuna migration DB prevista.
- Vincoli: riusare auth super-admin esistente, minimizzare modifiche collaterali, mantenere compatibilita con endpoint/consumatori legacy dove serve.

## Plan (Super Admin Associazioni: paginazione reale + search server-side)
- [x] Ricognizione finale endpoint/lista esistenti, payload attuale e campi ricercabili su `organizations`.
- [x] Backend: introdurre handler condiviso con `q`, `page`, `page_size`, `sort`, filtri soft-delete coerenti, `COUNT(*)` e risposta `{items,page,page_size,total,total_pages}`; mantenere compatibilita path legacy.
- [x] Backend: aggiungere test minimi per paginazione e ricerca su piu pagine.
- [x] Frontend: aggiornare API client e pagina `SuperAdminOrganizations` con stato URL (`q/page/pageSize`), debounce, ricerca elegante, loading/error/empty state e paginazione.
- [x] Verifiche finali: pytest mirati backend + build frontend, poi compilare review con esiti.

## Review (Super Admin Associazioni: paginazione reale + search server-side - Feb 27, 2026)
- Backend: `GET /api/admin/organizations` aggiunto come alias super-admin del listing organizzazioni; supporta `q`, `page`, `page_size`, `sort` e mantiene compatibilita payload legacy con `data/meta` oltre al nuovo `items/page/page_size/total/total_pages`.
- Backend query: count e lista applicano gli stessi filtri server-side su `name`, `slug`, `email`, `club_display_name`; i range tessere vengono aggregati via subquery per evitare duplicati e mantenere paginazione corretta.
- Frontend: `SuperAdminOrganizations` ora usa querystring persistente (`q`, `page`, `pageSize`), search bar con debounce 400ms + Enter + clear, fetch cancellabile e paginazione con Prev/Next e numeri pagina.
- UX: ricerca globale server-side, reset a pagina 1 quando cambia il termine o il page size, loading state durante refresh, empty state dedicato e banner errore se l'API fallisce.
- Hook: aggiunto `frontend/src/hooks/useSuperAdminOrganizationsQueryState.ts` per centralizzare lettura/scrittura dello stato lista nell'URL.
- Test: `python -m pytest tests\\test_super_admin_organizations_pagination.py -q` -> **2 passed**.
- Build: `npm --prefix frontend run build` -> **OK**.
- Smoke test UI (Feb 27, 2026): eseguito su istanza locale isolata `127.0.0.1:8011` con DB temporaneo `tmp_smoke_super_admin_orgs.db` e 120 org seed + 1 org baseline di bootstrap (`total=121`).
- Evidenze smoke: login super-admin OK; `/super-admin/associazioni` mostra default `1-50 di 121 associazioni`; pagina 3 raggiungibile (`101-121 di 121`); ricerca `Oasi` restituisce `1-17 di 17`; reload preserva `q/page/pageSize`; clear rimuove `q` e torna a pagina 1.
- Bug trovato e corretto durante lo smoke: `pageSize` default in URL scendeva a `10` quando il parametro mancava, perche' `Number(null) === 0`; fix applicato in `frontend/src/hooks/useSuperAdminOrganizationsQueryState.ts`.
- Screenshot: `test-results/smoke-super-admin-organizations-page3.png`, `test-results/smoke-super-admin-organizations-search.png`.

---
## Spec (Super Admin lotti tessere: modifica + eliminazione sicura - Feb 27, 2026)
- Obiettivo: permettere al super admin ASSONAM di modificare ed eliminare i lotti tessere di un'associazione senza introdurre inconsistenze su assegnazioni, range e disponibilita.
- Scope: model/schema `card_batches`, endpoint FastAPI super-admin, audit esistente, UI React nel modal `Lotti tessere` del super admin.
- Vincoli: solo super admin; range e anno modificabili solo in assenza di assegnazioni/link a soci; eliminazione consentita solo se nessuna tessera del lotto risulta assegnata o collegata a soci; minimizzare impatto su altre sezioni.

## Plan (Super Admin lotti tessere: modifica + eliminazione sicura)
- [x] Ricognizione finale di `CardBatch`, allocation/stock helpers, endpoint batch esistenti e UI modal lotti.
- [x] Backend/schema: aggiungere campi minimi al lotto (`is_enabled`, `notes`) con migration Alembic + fallback `init_db.py`; aggiornare allocation/stock helpers per rispettare lo stato attivo/disattivo.
- [x] Backend API: implementare PATCH/DELETE `/api/admin/organizations/{org_id}/card-lots/{lot_id}` con validazioni su assegnazioni reali, overlap range, audit e risposta batch aggiornata.
- [x] Frontend: estendere tabella lotti nel modal super-admin con azioni Modifica/Elimina, modal edit, doppia conferma delete, errori backend e campi disabilitati quando il range non e modificabile.
- [x] Test/verifiche: aggiungere pytest mirati per update/delete/allocazione con lotto disattivato, eseguire pytest selettivi + build frontend, poi compilare review.

## Review (Super Admin lotti tessere: modifica + eliminazione sicura - Feb 27, 2026)
- `card_batches` ora supporta stato manuale (`is_enabled`) e note (`notes`) tramite model, migration Alembic e bootstrap fallback in `init_db.py`.
- Il backend espone `PATCH/DELETE /api/admin/organizations/{org_id}/card-lots/{lot_id}` con vincoli su assegnazioni/link a soci, controllo overlap globale sui range e audit su `operation_logs`.
- Allocation e stock rispettano i lotti disattivati: i batch non abilitati non vengono piu considerati per nuove assegnazioni o disponibilita org-admin.
- La UI Super Admin dei lotti mostra badge stato coerenti, note, azioni `Modifica`/`Elimina`, modal edit con campi bloccati quando esistono assegnazioni e conferma forte `ELIMINA` per la cancellazione.
- Verifiche eseguite:
- `python -m pytest tests\\test_super_admin_card_lot_management.py tests\\test_super_admin_association_delete_release_range.py -q`
- `python -m pytest tests\\test_super_admin_organizations_pagination.py -q`
- `npm --prefix frontend run build`

- Smoke test UI (Feb 27, 2026): istanza locale `127.0.0.1:8012` su DB temporaneo `tmp_smoke_card_lots.db`; login super admin OK, ricerca associazione smoke OK, modal lotti OK, modifica lotto vuoto OK, eliminazione lotto vuoto OK, lotto con assegnazioni bloccato in UI OK.
- Screenshot smoke: `test-results/smoke-card-lots-initial.png`, `test-results/smoke-card-lots-final.png`.
