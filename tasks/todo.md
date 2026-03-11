- [x] Profilare pipeline renderer video post-affiliazione e individuare i colli di bottiglia reali
- [x] Aggiungere timing logs dettagliati backend/renderer per queue, bundle, render, encode e finalize
- [x] Implementare riuso persistente del bundle/composition probe e ridurre overhead per job
- [x] Ottimizzare asset/effetti HUD e operazioni ripetute nel frame loop senza cambiare output 720p/24fps
- [x] Eseguire benchmark comparativi + test mirati e documentare l'impatto

## Forms studio UX refinement (Mar 10, 2026)
- [x] Rivalutare il workspace Forms attuale rispetto ai punti UX richiesti e identificare i punti ancora troppo tecnici/confusi
- [x] Rifinire lista form e header editor per far percepire il prodotto come page builder condivisibile, non metadata editor
- [x] Rendere Builder, Design, Risposte e Condividi più visuali con migliore gerarchia e link pubblico prominente
- [x] Migliorare micro-copy, quick actions ed empty states senza rimuovere funzionalita esistenti
- [x] Eseguire build frontend e aggiornare review/lesson

## Review (Forms studio UX refinement - Mar 10, 2026)
- Direzione visuale ricavata dallo skill `ui-ux-pro-max`: premium light shell con forte contrasto, URL pubblico trattato come asset primario e tab editor con gerarchia più esplicita.
- `OrgAdminForms.tsx`: la library dei form ora comunica meglio che ogni card è una pagina condivisibile, con descrizione, URL visibile e quick actions esplicite (`Modifica`, `Preview`, `Copia link`, `Duplica`, `Apri`) senza nesting di button invalidi.
- Header editor rifatto come cockpit: link pubblico in evidenza subito sopra i tab, badge di stato, contatori chiave e micro-summary dei blocchi `Builder`, `Automazioni`, `Risposte`.
- Navigazione tab migliorata: da pill minimali a card-tab con label + hint, così la separazione tra `Builder`, `Design`, `Automazioni`, `Risposte`, `Condividi` è percepibile anche visivamente.
- `Condividi` ora sembra un launch panel e non un dettaglio nascosto: URL grande in hero scuro, CTA immediate e stato online/bozza + pubblico/solo soci visibili al primo sguardo.
- `FormPublicCanvas.tsx`: la preview e la pagina pubblica risultano più “pagina reale” grazie a top bar brandizzata, snapshot laterale più utile e footer contestuale, mantenendo invariato il motore campi.
- Verifica: `npm --prefix frontend run build` OK.

## Review (Ottimizzazione renderer video affiliazione - Mar 06, 2026)
- Bottleneck principali misurati: polling worker fino a 15s, rebundle per job, probe NVENC ripetuto, staging audio locale ripetuto e soprattutto `renderMedia` troppo lento con concurrency default 8 su questo host.
- Timing dettagliati aggiunti in backend (`job created/claimed/render/finalize/total`) e renderer (`audioPrepare`, `bundle`, `composition`, `render`, `nvencProbe`, `encode`, `finalize`, `total`) con payload JSON `timingsMs`, `bundleCacheHit`, `resolvedConcurrency`, `slowestFrames`.
- Bundle Remotion ora riusato su cache persistente per fingerprint, senza race tra processi; probe NVENC e audio locale condiviso vengono riusati quando non cambiano.
- Ottimizzazioni conservative HUD: glow/blur/shadow ridotti, rumore SVG statico, zoom globale alleggerito, eliminato `mixBlendMode` pesante nella scena completion; output invariato a 1280x720 / 24fps.
- Encoding finale accelerato da `veryfast` a `superfast` (libx264) e preset NVENC a `p4`; render intermedio su `ultrafast`.
- Benchmark locale renderer: baseline precedente osservata ~15.4s; dopo strumentazione il default Remotion implicito mostrava `render` ~111s con concurrency 8; tuning misurato: concurrency 4 ~57.5s total, concurrency 3 ~37.1s total, concurrency 2 ~16.6s cache-hit / ~17.5s cache-miss.
- Verifiche: `npm run build` in `video-renderer/services/welcome-video` OK; `python -m pytest -q tests/test_affiliation_video_service.py` OK.

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
- [x] Individuare perché il logo ASSONAM non viene renderizzato nella mail tessera inviata da flusso API/thank-you
- [x] Correggere URL logo nel template email integrazione usando asset compatibile client mail
- [x] Aggiungere regressione test su HTML email per evitare ritorno a SVG non compatibile
- [x] Eseguire test mirati integrazione/ingest e documentare risultato

## Review (Fix logo mail tessera API - Feb 19, 2026)
- `python -m pytest tests/test_integration_issue_member.py::test_issue_member_captures_html_email_with_verification_url -q` -> 1 passed
- `python -m pytest tests/test_ingest_pienissimo.py::test_ingest_retry_100x_is_idempotent_and_sends_email_once -q` -> 1 passed
- Fix applicato in `app/services/integration_issuer.py`: `logo_url` ora usa `frontend_base/logo-transparent.png` (PNG, più compatibile in email)

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
- Verifica funzionale: endpoint /api/org-admin/integrations/keys* non più registrati; GET/POST/PATCH/DELETE su path rimossi rispondono 404 (fallback API)
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
- `npm run build` (frontend) OK (attivitÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â  socio + reset filtri)
- `python -m alembic upgrade head` OK (actor_member_id)
- `npm run build` (frontend) OK (legenda attivitÃƒÆ’Ã‚Â )
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
- [x] Add dashboard counters for ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œda rivedereÃƒÂ¢Ã¢â€šÂ¬Ã‚Â and ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œrigettatiÃƒÂ¢Ã¢â€šÂ¬Ã‚Â
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
## Audit Log & AttivitÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â  Socio (Feb 02, 2026)
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
- ourSteps.ts`: Aggiunto `TourStep` type con `route` e `optional` properties
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
``sx
// In App.tsx routes
<Route path="/dashboard/*" element={
  <ProtectedRoute role="member">
    <DashboardLayout />
  </ProtectedRoute>
} />
```
**useAuth:**
``sx
const { user, loading, logout, refresh } = useAuth();
if (loading) return <Loading />;
if (!user) return <Navigate to="/login" />;
```
**apiClient:**
``sx
import { apiGet, apiPost } from "../lib/apiClient";
// With automatic retry and deduplication
const data = await apiGet<User[]>("/api/users");
const result = await apiPost<Result>("/api/users", { name: "John" });
```
---
## Alembic Migration Idempotency Fix (Feb 04, 2026)
### Problema
`alembic upgrade head` falliva con errori tipo:
- able member_payments already exists`
- `no such column: deleted_at`
### Causa
Il database era fuori sync con Alembic perchÃƒÆ’Ã‚Â©:
1. `init_db.py` usa `Base.metadata.create_all()` che crea tabelle bypassando Alembic
2. Alcune migrazioni aggiungono colonne che potrebbero non esistere nel DB attuale
3. Il DB locale potrebbe essere stato creato prima che le migrazioni fossero definite
### Fix Implementato
Rese idempotenti le migrazioni problematiche:
**`a1b2c3d4e5f6_add_member_payments.py`:**
- Aggiunto check `_table_exists()` prima di `create_table`
- Aggiunto check `_index_exists()` prima di `create_index`
- Se la tabella esiste giÃƒÆ’Ã‚Â , la migrazione passa senza errori
**`d3e4f5g6h7i8_add_performance_indexes.py`:**
- Aggiunto `_safe_create_index()` che verifica:
  - L'indice non esiste giÃƒÆ’Ã‚Â 
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
- [x] Implementare persistenza member (our_member_run`, our_member_step_index`) e ripristino su mount.
- [x] Implementare retry member su `TARGET_NOT_FOUND`/`ERROR` con max tentativi e avanzamento sicuro senza chiusura tour.
- [x] Aggiungere log temporanei member (`role`, `run`, `stepIndex`, `currentRoute`, callback joyride).
- [x] Aggiornare reset guida per pulire anche le nuove chiavi member.
- [x] Verificare con build frontend + aggiornare review + lessons.
## Review (Fix Tour Socio Route/Tab Resilience)
- [x] Tour member continua su cambi route/tab senza chiamare `endTour` su `TARGET_NOT_FOUND/ERROR`.
- [x] Stato in corso member persistito (our_member_run`, our_member_step_index`) e ripristinato al mount.
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
- Dati richiesti: `socio.nome`, `socio.cognome`, essera.numero`, essera.stato`, essera.anno`, `associazione.nome` da DB.
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
- [ ] Verifica allargata: `python -m pytest tests/test_member_card_verification.py tests/test_email_flows.py` NON completamente verde per failure preesistente su est_email_flows.py::test_member_magic_link_flow` (join 400 per statuto mancante su `my-association`).
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
- [x] Verifica addizionale: `python -m pytest tests/test_payment_method_join.py tests/test_optional_identity_document.py tests/test_documents.py tests/test_org_admin_manual_member.py` NON completamente verde per failure preesistenti su ests/test_documents.py` e ests/test_org_admin_manual_member.py`.
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
- Accessibilitï¿½: flip via click + Enter/Space, aria-label chiara, no text selection durante animazione.
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
- [x] Rinforzare `backface-visibility` e ransform-style` (incluse varianti WebKit) su stage e facce.
- [x] Verificare build frontend e aggiornare review.
## Review (Follow-up flip specchiato)
- [x] Front/back resi figli diretti dello stage ruotato, evitando layering ambiguo che mostrava il fronte specchiato.
- [x] Aggiunte proprieta 3D robuste (`preserve-3d`, `backface-visibility`, ranslateZ`) a livello CSS + inline sulle facce.
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
- [x] Eseguire verifica tecnica (build frontend + smoke checks backend) e documentare review in asks/todo.md`.
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
- `app/routes/public.py`: GET /sitemap.xml â€” static pages + active organizations from DB
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
- [x] Dipendenze aggiornate (`gsap`, hree`, `@react-three/fiber`, `@react-three/drei`) con lockfile rigenerato.
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
- [x] Dipendenze richieste presenti in `frontend/package.json`: hree`, `@react-three/fiber`, `@react-three/drei`, `gsap`.
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
- [x] Riprogettare hero composition (copy a sinistra, logo a destra, overlay leggibilitÃ ).
- [x] Limitare movimento a micro breathing/parallax e ridurre costi su mobile/low-power.
- [x] Eseguire build e produrre screenshot desktop/mobile.
## Review (Hero Particle Logo ASSONAM da SVG)
- [x] Asset sorgente creato: `frontend/public/logo-assonam-particle.svg`.
- [x] Particle logo implementato in `PublicHeroThree.client.tsx` con `SVGLoader` + `PointsMaterial` (niente mesh casuali).
- [x] Hero aggiornata con composizione copy-left/logo-right e fallback statico logo su low-power/no WebGL.
- [x] Rimossa qualsiasi immagine underlay quando WebGL Ã¨ attivo: in modalitÃ  WebGL il logo Ã¨ solo `THREE.Points`.
- [x] Sampling SVG reso piÃ¹ pulito con path vettoriali da contorni (no texture/no scanline overlay).
- [x] Build frontend verificata: `npm.cmd run build` OK.
- [x] Screenshot generati:
  - asks/screenshots/hero-desktop.png`
  - asks/screenshots/hero-mobile-390x844.png`
  - asks/screenshots/hero-mobile-360x800.png`
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
  - asks/screenshots/hero-desktop-final.png`
  - asks/screenshots/hero-mobile-final.png`
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
- [x] `frontend/src/index.css`: fallback logo mobile riposizionato (op: 68%`) e ridotto (`clamp(8.8rem, 34vw, 11.2rem)`).
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
- [x] `frontend/src/index.css`: fallback logo mobile abbassato (op: 78%`) e ridotto (`clamp(8.1rem, 30vw, 10.2rem)`).
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
- `frontend/src/components/ErrorBoundary.tsx` — Full navigation, error logging
- `frontend/src/lib/api.ts` — `joinOrganization` + `registerMember` error detail
- `frontend/src/pages/Iscrizione.tsx` — Real error messages, non-blocking registration
- `frontend/src/pages/org-admin/OrgAdminMemberDetail.tsx` — Fetch-based doc download
- `app/routes/join.py` — Conditional statute, is_active check, request_id in errors
- `app/middleware.py` — `RequestIdMiddleware` + `get_request_id`
- `app/main.py` — Register `RequestIdMiddleware`
### Files Created
- ests/test_signup_fixes.py` — 6 tests covering all fixes
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
- Vincoli: non alterare il flusso signup standard (resta pending/approvazione), usare API key scoped per associazione, evitare duplicati su retry (`external_customer_id`), mantenere compatibilità codice esistente.
## Plan (Integrazione Issuer Tessera API)
- [x] Estendere modelli (`Member` + `IntegrationApiKey`) e retro-compatibilità init DB.
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
- [x] Nota migrazioni legacy: `python -m alembic upgrade head` resta bloccato da una migration storica preesistente (`5f60c30665a2`, table `member_documents` già esistente), non da questa implementazione.
---
## Spec (Hotfix Alembic 5f60 Idempotenza - Feb 17, 2026)
- Obiettivo: rendere idempotente la migration storica `5f60c30665a2` (`member_documents`) per evitare crash su `alembic upgrade head` quando la tabella esiste già.
- Vincoli: usare SQLAlchemy inspector (`sa.inspect(op.get_bind())`), saltare creazione tabella/indici/constraint se già presenti.
## Plan (Hotfix Alembic 5f60 Idempotenza)
- [x] Aggiornare `upgrade()` con check esistenza tabella `member_documents`.
- [x] Proteggere creazione indice della migration con check `index exists`.
- [x] Rendere `downgrade()` safe (drop solo se tabella/indice esistono).
- [x] Verificare `alembic upgrade head` su DB vuoto e su DB con tabella già presente.
## Review (Hotfix Alembic 5f60 Idempotenza)
- [x] Modificata migration `alembic/versions/5f60c30665a2_add_member_documents_table.py` con helper `_table_exists` e `_index_exists`.
- [x] `upgrade()` ora ritorna subito se `member_documents` è già presente.
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
- [x] Test aggiunti: ests/test_org_admin_integration_keys.py`.
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
- [x] Aggiornare review finale in asks/todo.md`.
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
- Hardening test isolation: ests/test_signup_fixes.py` ora forza logout admin prima del test bulk su tutte le org attive.

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
- [ ] Allineare soft-delete socio e query/liste admin affinché tessera eliminata non risulti mai attiva.
- [ ] Aggiornare/aggiungere test regressione (QR verify JSON+HTML, delete->non attiva, login negato, lista attivi esclusa) ed eseguire test mirati.
## Review (Fix coerenza socio/tessera/accesso/QR)
## Execution Update (Fix coerenza socio/tessera/accesso/QR - Feb 19, 2026)
- [x] Aggiunta utility centrale in `app/services/member_activity.py` con `is_member_active`, `is_card_active`, reason codes e label utente.
- [x] Hardening auth member in `app/routes/member.py`: login/magic-link/session check bloccano account non attivo con HTTP 403 `account non attivo`.
- [x] Rifattorizzata verifica tessera in `app/routes/public.py` con content negotiation HTML/JSON e pagina mobile-readable con motivo NON ATTIVA.
- [x] Allineato soft-delete in `app/routes/org_admin.py` (deleted_at + status rejected) e filtri active in query admin/listing.
- [x] Aggiunti test regressione in ests/test_member_active_state_regression.py` + update test QR/login/send-access.
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
- [x] Aggiunti test regressione scadenza/maintenance in ests/test_member_card_expiration_maintenance.py`.
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
- [x] Tracciare spec e piano operativo in asks/todo.md`.
- [x] Implementare bonifica retroattiva globale dei soci `deleted_at` con identificativi ancora presenti (startup-safe/idempotente).
- [x] Hardening runtime su iscrizione/registrazione per pulire conflitti legacy prima dei controlli duplicati.
- [x] Aggiungere test regressione per ri-iscrizione dopo delete su associazioni diverse.
- [x] Eseguire test mirati e compilare Review con esiti.

## Execution Update (Cleanup soci eliminati multi-associazione - Feb 19, 2026)
- [x] Implementata utility condivisa `cleanup_deleted_member_traces` in `app/services/member_cleanup.py` per bonifica identificativi su soci `deleted_at`.
- [x] Hardening `app/routes/join.py`: cleanup pre-check signup (email/fiscal), matching email case-insensitive e gestione `IntegrityError` con HTTP 409 (no 500 generico).
- [x] Hardening `app/routes/member.py` (`/api/auth/register`): controllo duplicati scoped per org + cleanup pre-check su record deleted legacy.
- [x] Bonifica retroattiva globale collegata a startup in `init_db.py` (idempotente, con log conteggio righe pulite).
- [x] Aggiunti test regressione multi-associazione in ests/test_deleted_member_cleanup_multiorg.py`.

## Review (Cleanup soci eliminati multi-associazione - Feb 19, 2026)
- `python -m pytest tests/test_deleted_member_cleanup_multiorg.py tests/test_signup_fixes.py tests/test_member_active_state_regression.py -q` -> **10 passed**
- Esito: i soci soft-deleted legacy vengono bonificati (globale + runtime), la ri-iscrizione per associazione non lascia conflitti residui, e i conflitti legacy non esplodono più in 500 nel submit iscrizione.




- [x] Esteso fix con hard purge fisico dei soci `deleted_at` (cleanup FK) in `app/services/member_cleanup.py`, invocato in startup (`init_db.py`) e pre-check join/register.
- [x] Verifica locale purge on-demand: `purged_deleted_members=0` (DB locale già pulito).
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
  - ests/test_security_hardening_audit.py`, ests/test_ingest_pienissimo.py`

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
  - asks/screenshots/oasi2-card-download-desktop.png`
  - asks/screenshots/oasi2-thankyou-desktop.png`
  - asks/screenshots/oasi2-thankyou-mobile.png`
- Verifica visuale: card `oasi-2` con fondo mono-colore bordeaux, logo associazione posizionato in alto (non watermark), logo ASSONAM in alto a destra, campi testuali invariati.
- Verifica thank-you: logo header su plate nero con blur/backdrop, resa leggibile sia desktop che mobile.


---
## Spec (Allocazione tessere multi-lotto annuale + concurrency-safe - Feb 21, 2026)
- Obiettivo: supportare più lotti attivi nello stesso anno per associazione e garantire emissione continua senza blocco quando un lotto termina.
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
- Compatibilità: wrapper legacy `app/services/card.py` ora delega a `allocate_next_card(...)`.
- Emissione aggiornata nei flussi: `app/routes/join.py`, `app/routes/org_admin.py`, `app/routes/admin.py`, `app/services/integration_issuer.py`.
- Supporto anno lotto: `CardBatch.year` in `app/models.py`, migrazione `alembic/versions/n5o6p7q8r9s0_add_card_batch_year.py`, fallback bootstrap in `init_db.py`.
- KPI/sommari lotti super-admin: `app/routes/super_admin.py` usa conteggi reali su membri per `assigned/remaining` (non `next_no-start_no`) e supporta `year` nei payload lotto.
- Test obbligatori implementati in ests/test_card_assignment.py` (fallback A->B, A esaurito con B disponibile, esaurimento totale 409, concorrenza 10 parallele senza duplicati).
- Aggiornamento test regressione org-admin decision: ests/test_org_admin_decision.py` ora garantisce lotto disponibile per anno corrente.
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
  - ests/test_card_assignment.py`: nuovo test est_released_cards_are_reused_before_advancing_progressive`.
  - ests/test_member_active_state_regression.py`: atteso riuso dello stesso numero dopo delete/reissue.
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
- Nota compatibilità locale/test DB: aggiunto fallback bootstrap in `init_db.py` per colonna `members.card_delivered_at` e normalizzazione `signup_source` su schema legacy non ancora migrato.

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
- Test minimi aggiunti: ests/test_google_wallet.py` (loader file/b64 + endpoint no-creds + mock success).
- Comandi eseguiti:
  - `python -m py_compile app\\services\\google_wallet.py app\\routes\\member.py app\\models.py app\\config.py init_db.py tests\\test_google_wallet.py` -> **OK**
  - `python -m alembic upgrade head` -> **OK** (migrazione `q1r2s3t4u5v6`)
  - `python -m pytest tests\\test_google_wallet.py -q` -> **4 passed**
  - `npm --prefix frontend run build` -> **OK**
- Nota operativa: non ho usato il file JSON reale indicato nel prompt (`C:\\Users\\edoar\\Downloads\\...json`); va spostato in `secrets/` o montato come secret in produzione per evitare leak/commit accidentali.
- Live test (credenziali reali + issuer `3388000000023089481`): endpoint `POST /api/me/wallet/google/save-link` verificato in locale su DB temporaneo -> **200 OK**, `classId` e `objectId` persistiti, save URL generato.
- Fix runtime emerso dal live test: Google Wallet rifiutava `logo.sourceUri` con URL locale (`http://localhost:8000/...`) in create object (400). Aggiornato `app/services/google_wallet.py` per omettere il logo quando l'URL non è pubblico/raggiungibile (localhost/127.0.0.1).

---
## Spec (Email tessera pronta + CTA Wallet handoff + statuto + badge Pienissimo + test - Feb 23, 2026)
- Obiettivo: completare il flusso end-to-end post-verifica socio con email aggiornata (accesso area riservata + CTA Google Wallet Android + link tessera/statuto), aggiungere pagina frontend `/wallet/google/add`, mantenere/finire statuto area socio e fix badge Pienissimo, con test minimi backend.
- Vincoli: riuso endpoint `/api/me/wallet/google/save-link` e flussi auth/magic-link esistenti; nessuna nuova auth; nessun secret nei commit; nessuna regressione su dashboard/documenti/admin.
- Nota: campo origine iscrizione `signup_source` e statuto area socio sono già presenti da task precedenti, quindi questo task completa alias/coverage/test e rifiniture UI/email.

## Plan (Email tessera pronta + CTA Wallet handoff + statuto + badge Pienissimo + test)
- [ ] Ricognizione finale dei punti già implementati vs gap (email template/call-site, route wallet handoff, alias statuto, test coverage).
- [ ] Backend: arricchire email tessera pronta (CTA wallet handoff, area riservata, vedi tessera, statuto) e allineare copy "email"; riusare trigger idempotente esistente.
- [ ] Backend: aggiungere alias endpoint sicuro `GET /api/me/documents/statute` (download) e, se necessario, rifinire source admin (`signup_source=admin`).
- [ ] Frontend: nuova pagina pubblica `/wallet/google/add` con auto-redirect se autenticato, CTA login/magic-link se non autenticato, messaggi UX chiari; registrare route in `App.tsx`.
- [ ] Test: aggiornare/aggiungere pytest per email content + alias statuto + esposizione `signup_source` in lista org-admin + mantenere save-link mock test; build frontend e pytest mirati.
- [ ] Commit ordinati + preparazione descrizione PR (se il push/PR remoto non è disponibile, produrre testo PR pronto).

## Review (Email tessera pronta + CTA Wallet handoff + statuto + badge Pienissimo + test - Feb 23, 2026)
- [ ] Da compilare a fine implementazione.
## Review (Email tessera pronta + CTA Wallet handoff + statuto + badge Pienissimo + test - Feb 23, 2026) - Update
- Email essera pronta`: template `app/email_templates/member_card_email.py` esteso con CTA `Aggiungi a Google Wallet (Android)`, link area riservata, `Vedi la tua tessera`, `Scarica lo statuto`, copy aggiornato con "email" e nota iPhone.
- Trigger idempotente riusato (`card_delivered_at`) senza nuovi campi DB; call-site aggiornati in `app/services/member_card_delivery.py` e `app/services/integration_issuer.py` per passare URL frontend/handoff.
- Nuova pagina frontend pubblica `frontend/src/pages/WalletGoogleAdd.tsx` + route `/wallet/google/add` in `frontend/src/App.tsx`: auto-call `POST /api/me/wallet/google/save-link`, redirect a Google Wallet se auth, altrimenti CTA login + invio magic-link via `/api/auth/login` (password vuota).
- Backend statuto: alias download sicuro `GET /api/me/documents/statute` aggiunto in `app/routes/member.py` (riusa il controllo org del socio già esistente).
- Origine iscrizione admin: `create_org_member` ora imposta `signup_source='admin'` (`SignupSource.ADMIN`) in `app/routes/org_admin.py`; nessuna migration nuova richiesta perché il campo `signup_source` esiste già e la colonna è TEXT.
- Test backend aggiornati/aggiunti:
  - contenuto email post-verifica include CTA Wallet + link documenti/statuto + copy "email"
  - email integrazione include CTA Wallet handoff
  - alias statuto `/api/me/documents/statute`
  - scoping statuto per sessione/org (A vede A, B vede B)
  - org-admin manual create => `signup_source=admin`
  - lista org-admin espone `signup_source` (admin/pienissimo/web)
- FE test automatici non aggiunti: nel progetto non è presente setup Vitest/Playwright; verificata build Vite/TS invece.
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
- Test aggiunti: ests/test_org_admin_statute_upload.py` (`>10MB => 413`, non-PDF => 415, PDF valido => 200`).
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
- Backend gia' a `10 MB` in `app/services/statute_upload.py` con test dedicati (ests/test_org_admin_statute_upload.py`).
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
- Vincoli: compatibilità runtime con SQLite e Postgres, documentare backup/pgloader/rollback/verifica, nessun `DROP` automatico, nessuna rimozione supporto SQLite.

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
- Smoke test UI (Feb 27, 2026): eseguito su istanza locale isolata `127.0.0.1:8011` con DB temporaneo mp_smoke_super_admin_orgs.db` e 120 org seed + 1 org baseline di bootstrap (otal=121`).
- Evidenze smoke: login super-admin OK; `/super-admin/associazioni` mostra default `1-50 di 121 associazioni`; pagina 3 raggiungibile (`101-121 di 121`); ricerca `Oasi` restituisce `1-17 di 17`; reload preserva `q/page/pageSize`; clear rimuove `q` e torna a pagina 1.
- Bug trovato e corretto durante lo smoke: `pageSize` default in URL scendeva a `10` quando il parametro mancava, perche' `Number(null) === 0`; fix applicato in `frontend/src/hooks/useSuperAdminOrganizationsQueryState.ts`.
- Screenshot: est-results/smoke-super-admin-organizations-page3.png`, est-results/smoke-super-admin-organizations-search.png`.

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

- Smoke test UI (Feb 27, 2026): istanza locale `127.0.0.1:8012` su DB temporaneo mp_smoke_card_lots.db`; login super admin OK, ricerca associazione smoke OK, modal lotti OK, modifica lotto vuoto OK, eliminazione lotto vuoto OK, lotto con assegnazioni bloccato in UI OK.
- Screenshot smoke: est-results/smoke-card-lots-initial.png`, est-results/smoke-card-lots-final.png`.

---
## Spec (Org Admin tessere: tabella movimenti lotti live - Feb 27, 2026)
- Obiettivo: nella sezione Org Admin > Tessere mostrare nella tabella `Movimenti` i lotti assegnati da ASSONAM per l'anno corrente come range e quantita, senza contatori assegnate/libere.
- Vincoli: la tabella deve riflettere modifiche o eliminazioni fatte dal super admin sui lotti; impatto minimo su backend e frontend esistenti.

## Plan (Org Admin tessere: tabella movimenti lotti live)
- [ ] Verificare endpoint e UI attuali della tabella movimenti org-admin.
- [ ] Backend: far restituire a `/api/org-admin/cards/movements` i lotti correnti live da `card_batches` con range, quantita e stato, limitati all'anno corrente.
- [ ] Frontend: aggiornare tabella `Movimenti` in `OrgAdminCards` per mostrare data, range, quantita e stato dei lotti ASSONAM, senza colonne assegnate/libere.
- [ ] Test/verifiche: aggiungere pytest sul refresh live dopo patch/delete del super admin ed eseguire build frontend.
## Review (Org Admin tessere: tabella movimenti lotti live - Feb 27, 2026)
- `/api/org-admin/cards/movements` ora restituisce i lotti correnti live da `card_batches` per l'organizzazione dell'org admin, limitati all'anno corrente e non rilasciati, con `range_start`, `range_end`, `quantity` e `status_label`.
- La tabella `Movimenti` dell'area Org Admin mostra solo `Data`, `Range`, `Quantita'` e `Stato`; non espone piu' dettagli su assegnate/libere, che restano nelle altre sezioni.
- La vista e' live rispetto alle azioni del super admin: se un lotto viene modificato o eliminato da ASSONAM, l'org admin vede il nuovo range/stato oppure la sua rimozione al successivo refresh.
- Verifiche eseguite:
- `python -m pytest tests\\test_org_admin_card_lot_movements.py -q`
- `python -m pytest tests\\test_super_admin_card_lot_management.py tests\\test_card_assignment.py -q`
- `npm --prefix frontend run build`

- Smoke test UI (Feb 27, 2026): istanza locale `127.0.0.1:8013` su DB temporaneo mp_smoke_org_admin_movements.db`; login org-admin via token OK, tabella `Movimenti` mostra solo il lotto anno corrente con range `910000-910024` e quantita `25`, lotto anno precedente nascosto, refresh dopo PATCH super-admin OK (`910100-910109`, `Disattivo`, quantita `10`), refresh dopo DELETE OK con empty state.
- Screenshot smoke: est-results/smoke-org-admin-movements-initial.png`, est-results/smoke-org-admin-movements-updated.png`, est-results/smoke-org-admin-movements-deleted.png`.

## Spec (Org Admin metrics/cards 500: fix BOOLEAN is_enabled - Feb 27, 2026)
- Obiettivo: eliminare il 500 su `/api/org-admin/metrics` e `/api/org-admin/cards` in Postgres convertendo `card_batches.is_enabled` da `INTEGER` legacy a `BOOLEAN` reale, mantenendo compatibilita con i dati esistenti.
- Scope: migration Alembic su `card_batches`, model `CardBatch`, bootstrap/schema helper `init_db.py`, query/route che filtrano `is_enabled`, test regressione su stock e route org-admin.
- Vincoli: preferire fix schema-first; fallback query `= 1` solo se la migrazione fosse impossibile, ma va evitato. Default coerente: lotti attivi di default (`TRUE`).

## Plan (Org Admin metrics/cards 500: fix BOOLEAN is_enabled)
- [x] Analizzare model, migrazioni esistenti e query che usano `CardBatch.is_enabled`.
- [ ] Aggiungere migration Alembic sicura per convertire `card_batches.is_enabled` a `BOOLEAN` e allineare bootstrap/schema helpers.
- [ ] Allineare model e codice applicativo per usare `bool` coerente nei flussi org-admin/super-admin.
- [ ] Aggiungere test regressione su `_compute_org_card_stock`, `/api/org-admin/metrics` e `/api/org-admin/cards`.
- [ ] Verificare i comandi deploy applicabili nel contesto locale e documentare esito/review.

## Review (Org Admin metrics/cards 500: fix BOOLEAN is_enabled - Feb 27, 2026)
- Aggiunta migration Alembic 3u4v5w6x7y8_repair_card_batch_is_enabled_boolean.py` che normalizza `card_batches.is_enabled` a `BOOLEAN NOT NULL DEFAULT TRUE`; su Postgres converte in-place con `ALTER COLUMN ... TYPE boolean USING (...)`, preservando il comportamento legacy dei lotti senza flag esplicito (`NULL -> TRUE`).
- Allineato il model `CardBatch.is_enabled` a `server_default=sa.true()` e corretto il bootstrap `init_db.py` per aggiungere la colonna come `BOOLEAN DEFAULT TRUE`, con backfill compatibile sia con schemi boolean sia integer legacy.
- Rafforzati i read path che derivano lo stato lotto (`org_admin` e `super_admin`) per trattare correttamente anche eventuali valori legacy `0/1` durante la finestra di deploy.
- Aggiunto test regressione ests/test_org_admin_card_batch_boolean_regression.py` che verifica `_compute_org_card_stock`, `/api/org-admin/cards` e `/api/org-admin/metrics` con batch attivo/disattivo.
- Verifiche eseguite:
- `python -m pytest tests\test_org_admin_card_batch_boolean_regression.py tests\test_org_admin_card_lot_movements.py tests\test_super_admin_card_lot_management.py tests\test_member_active_state_regression.py -q`
- Smoke migration isolata: esecuzione diretta della nuova migration su tabella temporanea `card_batches(is_enabled INTEGER)` con esito OK; output finale `BOOLEAN`, `NOT NULL`, default `1`, valori convertiti `[(1,1),(2,0),(3,1)]`.
- Nota verifica: `alembic upgrade head` su DB SQLite completamente pulito fallisce ancora su una migration legacy preesistente (`m4n5o6p7q8r9`, colonna `members.deleted_at` non ancora presente in quella fase). Il problema non e introdotto da questo fix ma va corretto separatamente se serve supportare l'upgrade full-chain da zero su SQLite.
- Deploy locale non eseguito: Docker Engine non disponibile in questa sessione (`//./pipe/dockerDesktopLinuxEngine` non trovato). Comando previsto per il servizio app/web: `docker compose exec web alembic upgrade head` seguito da restart del servizio.


---
## Spec (Homepage CTA Affiliazione + funnel 3 scelte - Mar 05, 2026)
- Obiettivo: rendere immediata la scelta utente in homepage e navbar con tre percorsi chiari (associazione, socio, account esistente), dando priorita assoluta alla CTA `Affilia la tua Associazione`.
- Scope: frontend pubblico (`Layout`, `Home`, `App`, stili in `index.css`) con CTA prominente desktop/mobile, hero selector a 3 card, timeline/indicatori fiducia, sezione `Affiliazione in 3 passaggi`, FAQ dedicate, sticky CTA e tracking click base.
- Vincoli: mantenere design system Tailwind/components esistente, copy italiano breve/chiaro, responsive mobile-first, route CTA su `/affiliazione`; aggiunta pagina marketing `/affiliazione-info` consigliata.

## Plan (Homepage CTA Affiliazione + funnel 3 scelte)
- [x] Mappare componenti e stili pubblici esistenti (`Layout`, `Home`, `App`, `index.css`) e identificare punti di modifica.
- [x] Aggiornare navbar desktop/mobile con CTA primaria `Affilia la tua Associazione`, pulsante secondario `Diventa Socio` e `Area Riservata` outline.
- [x] Rifare hero con titolo/sottotitolo richiesti, selector a 3 card con microcopy, timeline 3-step e trust badges.
- [x] Aggiungere sticky floating CTA su scroll verso `/affiliazione` con hook tracking click.
- [x] Implementare sezione below-the-fold `Affiliazione in 3 passaggi` + FAQ 5 voci richieste.
- [x] Aggiungere route/pagine dedicate (`/affiliazione`, `/affiliazione-info`) e collegamenti CTA coerenti.
- [x] Verificare build frontend e aggiornare sezione review con esito.

## Review (Homepage CTA Affiliazione + funnel 3 scelte - Mar 05, 2026)
- `npm --prefix frontend run build` -> OK.
- Nuovo entrypoint `Affilia la tua Associazione` visibile in: navbar desktop, menu mobile (prima voce), hero card primaria, sticky CTA in scroll.
- Funnel home ora esplicita tre percorsi distinti (associazione / socio / account) con microcopy e gerarchia visiva coerente.
- Aggiunta pagina info marketing `/affiliazione-info` con checklist documenti e blocco pricing orientativo che rimanda al wizard `/affiliazione`.
---
## Spec (Affiliazione pubblica Wizard + pagamenti + super-admin review + integrazione org + Remotion - Mar 05, 2026)
- Obiettivo: implementare il flusso completo di affiliazione pubblica su `/affiliazione` con bozza resumable, upload documenti, pagamento Stripe/bonifico/contanti, review super-admin e provisioning organizzazione finale.
- Scope backend: nuovi modelli+tabelle affiliazioni/video jobs, endpoint pubblici wizard, endpoint super-admin review/approve/payment verify, webhook Stripe, integrazione creazione `Organization` e `AdminUser` org-admin.
- Scope frontend: wizard a massimo 6 step con autosave/resume, pagina submit con stato e video fullscreen; nuovo tab super-admin `Affiliazioni` con review documentale e decisioni.
- Scope video: supporto mode `review`, `payment_pending`, `approved` e coda render su `video_jobs`.
- Vincoli: nessuna rottura dei flussi esistenti; policy antifrode rispettata (pagamento Stripe non abilita automaticamente senza approvazione documenti).

## Plan (Affiliazione pubblica Wizard + pagamenti + super-admin review + integrazione org + Remotion)
- [ ] Aggiungere modelli SQLAlchemy e migration Alembic per `affiliation_applications`, `affiliation_people`, `affiliation_documents`, `affiliation_events`, `video_jobs`.
- [ ] Estendere configurazione (`app/config.py`) con variabili Stripe/bonifico/video e helper stato pagamento/approvazione.
- [ ] Implementare router backend dedicato affiliazioni con API pubbliche (draft token, autosave, upload docs, submit, status/resubmission, Stripe checkout, webhook).
- [ ] Implementare endpoint super-admin affiliazioni (list, detail, review documento, verify pagamento manuale, request-changes, approve, reject) con rule engine di approvazione.
- [ ] Integrare provisioning su approve: creazione Organization reale + org admin su email richiedente + invio invito e visibilita in lista associazioni standard.
- [ ] Integrare `video_jobs`: enqueue eventi da submit/approve, worker backend per rendering Remotion e API lettura stato/video.
- [ ] Aggiornare Remotion HUD (`video-renderer`) per mode finali conformi: `RICHIESTA IN REVISIONE`, `PAGAMENTO IN VERIFICA`, `AFFILIAZIONE APPROVATA`.
- [ ] Sostituire pagina frontend `/affiliazione` con wizard completo (<=6 step, autosave, resume link, checklist, scelta pagamento, submit outcome + video fullscreen + next steps).
- [ ] Aggiungere tab frontend super-admin `Affiliazioni` con tabella pratiche e pannello azioni operative.
- [ ] Verificare con pytest mirati backend + build frontend + review finale.

## Review (Affiliazione pubblica Wizard + pagamenti + super-admin review + integrazione org + Remotion - Mar 05, 2026)
- In corso.

## Execution Update (Affiliazione pubblica Wizard + pagamenti + super-admin review + integrazione org + Remotion - Mar 05, 2026)
- [x] Aggiungere modelli SQLAlchemy e migration Alembic per `affiliation_applications`, `affiliation_people`, `affiliation_documents`, `affiliation_events`, `video_jobs`.
- [x] Estendere configurazione (`app/config.py`) con variabili Stripe/bonifico/video e helper stato pagamento/approvazione.
- [x] Implementare router backend dedicato affiliazioni con API pubbliche (draft token, autosave, upload docs, submit, status/resubmission, Stripe checkout, webhook).
- [x] Implementare endpoint super-admin affiliazioni (list, detail, review documento, verify pagamento manuale, request-changes, approve, reject) con rule engine di approvazione.
- [x] Integrare provisioning su approve: creazione Organization reale + org admin su email richiedente + invio invito e visibilita in lista associazioni standard.
- [x] Integrare `video_jobs`: enqueue eventi da submit/approve, worker backend per rendering Remotion e API lettura stato/video.
- [x] Aggiornare Remotion HUD (`video-renderer`) per mode finali conformi: `RICHIESTA IN REVISIONE`, `PAGAMENTO IN VERIFICA`, `AFFILIAZIONE APPROVATA`.
- [x] Sostituire pagina frontend `/affiliazione` con wizard completo (<=6 step, autosave, resume link, checklist, scelta pagamento, submit outcome + video fullscreen + next steps).
- [x] Aggiungere tab frontend super-admin `Affiliazioni` con tabella pratiche e pannello azioni operative.
- [x] Verificare con pytest mirati backend + build frontend + review finale.

## Review Update (Affiliazione pubblica Wizard + pagamenti + super-admin review + integrazione org + Remotion - Mar 05, 2026)
- Backend completato con nuovi modelli/tabelle affiliazione, router pubblico `/api/affiliazione/*`, router super-admin `/api/super-admin/affiliations/*`, webhook Stripe e provisioning `Organization` + `AdminUser` in approvazione.
- Integrazione lista associazioni estesa con endpoint unificato `/api/admin/organizations-unified` che include pratiche pendenti come `In revisione`.
- Frontend completato con wizard `/affiliazione` a 6 step (autosave, resume link copiabile, upload documenti, pagamento Stripe/bonifico/contanti, submit con stato e next steps, overlay video).
- Frontend super-admin completato con tab `Affiliazioni` (lista, dettaglio, review documenti, verify pagamento manuale, approve/reject/request-changes).
- Remotion HUD aggiornato con mode dinamico `review|payment_pending|approved` e ending text coerente (`RICHIESTA IN REVISIONE`, `PAGAMENTO IN VERIFICA`, `AFFILIAZIONE APPROVATA`), passando `mode` fino al renderer CLI.
- Verifiche eseguite:
- `python -m pytest tests/test_affiliation_flow.py -q` -> **2 passed**.
- `npm --prefix frontend run build` -> **OK**.
- `npm --prefix video-renderer/services/welcome-video run build` -> **OK**.

## Spec (Remotion pipeline optimization: instant base video + async personalized render - Mar 05, 2026)
- Obiettivo: mostrare video immediato dopo submit affiliazione senza attesa, mantenendo tutti gli effetti HUD Remotion invariati.
- Scope video: pre-render base video generico (`/videos/welcome_base.mp4`) con testo finale `REGISTRATION RECEIVED` + `ASSOCIATION CONNECTING TO NETWORK`.
- Scope backend: job async non bloccante per render personalizzato, skip se file esiste, output su `data/videos/welcome/{application_id}.mp4`.
- Scope frontend: overlay HTML con nome associazione sopra il base video, pannello finale post-video, CTA ritorno home.
- Scope infra: ottimizzazione render/encode (1280x720, output 24fps, h264 crf23 veryfast + NVENC p5 fallback), worker container dedicato con node+ffmpeg.
- Vincoli: non rimuovere/simplificare effetti visivi Remotion esistenti.

## Plan (Remotion pipeline optimization: instant base video + async personalized render)
- [ ] Aggiornare renderer Remotion per template base/personalizzato e opzioni output/encoding ottimizzate.
- [ ] Implementare base template con testo finale richiesto e senza nome associazione hardcoded nel video.
- [ ] Aggiornare servizio backend video jobs per output `data/videos/welcome/{application_id}.mp4` + skip rendering se file gia presente.
- [ ] Garantire submit wizard non bloccante (no render sync) con enqueue job soltanto.
- [ ] Montare static route backend per video generati e adattare URL serializzati.
- [ ] Aggiornare UX frontend `/affiliazione` con playback istantaneo `/videos/welcome_base.mp4` + overlay HUD nome associazione + pannello finale.
- [ ] Aggiungere infrastruttura worker container (node/ffmpeg/remotion deps) in docker-compose.
- [ ] Generare e salvare asset `frontend/public/videos/welcome_base.mp4`.
- [ ] Eseguire verifiche (pytest mirato + build frontend + build renderer) e compilare review.

## Review (Remotion pipeline optimization: instant base video + async personalized render - Mar 05, 2026)
- In corso.

## Execution Update (Remotion pipeline optimization: instant base video + async personalized render - Mar 05, 2026)
- [x] Aggiornare renderer Remotion per template base/personalizzato e opzioni output/encoding ottimizzate.
- [x] Implementare base template con testo finale richiesto e senza nome associazione hardcoded nel video.
- [x] Aggiornare servizio backend video jobs per output `data/videos/welcome/{application_id}.mp4` + skip rendering se file gia presente.
- [x] Garantire submit wizard non bloccante (no render sync) con enqueue job soltanto.
- [x] Montare static route backend per video generati e adattare URL serializzati.
- [x] Aggiornare UX frontend `/affiliazione` con playback istantaneo `/videos/welcome_base.mp4` + overlay HUD nome associazione + pannello finale.
- [x] Aggiungere infrastruttura worker container (node/ffmpeg/remotion deps) in docker-compose.
- [x] Generare e salvare asset `frontend/public/videos/welcome_base.mp4`.
- [x] Eseguire verifiche (pytest mirato + build frontend + build renderer) e compilare review.

## Review Update (Remotion pipeline optimization: instant base video + async personalized render - Mar 05, 2026)
- Base video pre-renderizzato disponibile in `frontend/public/videos/welcome_base.mp4` (template `base`, testo finale: `REGISTRATION RECEIVED` + `ASSOCIATION CONNECTING TO NETWORK`).
- Frontend `/affiliazione` ora mostra immediatamente il video base fullscreen dopo submit e sovrappone il nome associazione via overlay HTML stile HUD (`Orbitron`), senza attendere il render personalizzato.
- Overlay post-video mostra pannello finale con copy richiesto: `Richiesta ricevuta` + `La tua affiliazione è ora in revisione.` e CTA `Torna alla homepage`.
- Pipeline backend render personalizzato resa non bloccante: su submit si enqueua il job; rimosso trigger sync render dal submit endpoint.
- Worker render personalizzato ottimizzato: output stabile `data/videos/welcome/{application_id}.mp4`; skip automatico se file gia presente; URL servito via `/generated-videos/welcome/{application_id}.mp4`.
- RenderHud ottimizzato: transcode finale 1280x720 @ 24fps, CRF 23, preset `veryfast`; se NVENC disponibile usa `h264_nvenc` preset `p5`, con fallback automatico a `libx264`.
- Aggiunta infrastruttura container dedicata `affiliation-video-worker` in `docker-compose.yml` con `Dockerfile.affiliation-video-worker` (node + ffmpeg + dipendenze remotion + worker Python).
- Redis queue non integrata perche nel progetto non esiste un servizio Redis attivo; mantenuta queue DB gia presente per i video jobs.
- Verifiche eseguite:
- `npm --prefix video-renderer/services/welcome-video run build` -> **OK**.
- `npm --prefix video-renderer/services/welcome-video run render-base` -> **OK** (asset base generato).
- `python -m py_compile app/services/affiliation_video.py app/routes/affiliation.py app/main.py app/config.py` -> **OK**.
- `python -m pytest tests/test_affiliation_flow.py -q` -> **2 passed**.
- `npm --prefix frontend run build` -> **OK**.
- `docker compose config` -> **OK** (warning env mancanti attesi in locale).

## Spec (Affiliazione wizard UX conversion intro screen + progress bar - Mar 05, 2026)
- Obiettivo: aumentare conversione del wizard `/affiliazione` introducendo schermata iniziale chiara pre-compilazione e progress bar step-by-step semplificata.
- Requisiti: intro con titolo/sottotitolo, checklist documenti, testo salvataggio bozza, trust badges, CTA `Inizia Affiliazione` che avvia step 1.
- Requisiti wizard: progress bar top con 5 step (`Associazione`, `Cariche`, `Documenti`, `Pagamento`, `Invio`) con highlight step corrente.
- Vincoli: mobile first, layout leggibile, nessuna regressione del flusso submit/video già implementato.

## Plan (Affiliazione wizard UX conversion intro screen + progress bar)
- [x] Aggiungere stato intro screen nel page component e CTA `Inizia Affiliazione` che attiva il wizard.
- [x] Inserire sezione intro con checklist richiesta, testo resumable e trust badges.
- [x] Sostituire i vecchi pulsanti step con progress bar semplificata a 5 step con highlight corrente.
- [x] Mantenere step submit/status senza confondere la progressione (5 step) e assicurare UX mobile chiara.
- [x] Eseguire build frontend e aggiornare review in asks/todo.md`.

## Review (Affiliazione wizard UX conversion intro screen + progress bar - Mar 05, 2026)
- Completato. Dettagli nel Review Update sottostante.
## Review Update (Affiliazione wizard UX conversion intro screen + progress bar - Mar 05, 2026)
- Stato: completato.
- Intro screen aggiunto in /affiliazione con titolo/sottotitolo, checklist documenti, messaggio resume e trust badges.
- CTA primaria Inizia Affiliazione ora avvia esplicitamente lo step 1 del wizard.
- Top progress bar implementata con 5 step (Associazione, Cariche, Documenti, Pagamento, Invio) e highlight dello step corrente.
- Rendering dei blocchi step condizionato a showIntroScreen per mantenere il funnel chiaro su desktop/mobile.
- Rifinito mobile wizard: progress step scrollabile orizzontalmente con chip min-width e CTA intro full-width su mobile (w-full sm:w-auto).
- Verifica tecnica: npm --prefix frontend run build -> OK.
## Spec (Homepage social proof stats section - Mar 05, 2026)
- Obiettivo: aggiungere subito sotto hero una sezione social proof con numeri piattaforma per aumentare fiducia e conversione affiliazioni.
- Requisiti: titolo `Gia scelto da associazioni in tutta Italia`, 3 card (`Associazioni Affiliate`, `Soci Registrati`, `Citta Attive`).
- Dati: valori da API `GET /api/stats/platform` con payload `{ organizations, members, cities }`.
- UX: animazione count-up 0->valore in 1 secondo, layout responsive (3 colonne desktop, stack mobile), glow/hover sottile e performance leggera.

## Plan (Homepage social proof stats section)
- [x] Implementare endpoint backend pubblico `/api/stats/platform` con conteggi aggregati e filtro record attivi/non eliminati.
- [x] Estendere client API frontend con tipo+funzione `fetchPlatformStats`.
- [x] Inserire sezione social proof in `Home.tsx` subito dopo hero con fetch dati e count-up animato 1s.
- [x] Aggiungere stile card (glow+hover) coerente palette ASSONAM e responsive mobile/desktop.
- [x] Eseguire test backend mirato + build frontend e documentare review.

## Review (Homepage social proof stats section - Mar 05, 2026)
- Completato. Dettagli nel Review Update sottostante.

## Review Update (Homepage social proof stats section - Mar 05, 2026)
- Aggiunto endpoint pubblico `GET /api/stats/platform` con payload `{ organizations, members, cities }` e cache TTL 60s per minimizzare impatto DB.
- Conteggi implementati: organizzazioni attive/non eliminate, soci non eliminati, citta distinte normalizzate (rim/lower`) da `organizations.city`.
- Frontend API client esteso con `PlatformStats` + `fetchPlatformStats`.
- Homepage: nuova sezione social proof subito sotto hero con titolo `Gia scelto da associazioni in tutta Italia` e 3 card statistiche (`Associazioni Affiliate`, `Soci Registrati`, `Citta Attive`).
- Count-up animato 0->valore in 1 secondo via `requestAnimationFrame`, avvio solo quando la sezione entra in viewport (IntersectionObserver) per performance.
- Styling: card con glow sottile, hover lift, numeri tabular, layout stack mobile / 3 colonne desktop in palette ASSONAM.
- Verifiche:
- `python -m pytest tests/test_smoke.py::test_platform_stats -q` -> 1 passed.
- `npm --prefix frontend run build` -> OK.

## Spec (Navbar CTA highlight affiliazione - Mar 05, 2026)
- Obiettivo: rendere Affilia la tua Associazione la CTA piu evidente in navbar desktop/mobile e rinforzare il funnel in hero.
- Requisiti: bottone primario con gradiente/glow/freccia, badge vicino CTA, voce mobile come primo elemento full-width, sticky CTA scroll >300px, microcopy hero Richiede circa 10 minuti.
- Vincoli: mantenere palette ASSONAM e component system attuale.

## Plan (Navbar CTA highlight affiliazione)
- [x] Aggiornare navbar pubblica desktop con badge vicino CTA e freccia nel bottone.
- [x] Rinforzare hover CTA desktop con scale 1.02 + glow piu forte.
- [x] Confermare mobile menu con CTA come primo elemento full-width.
- [x] Adeguare sticky CTA su homepage alla soglia scroll >300px verso /affiliazione.
- [x] Inserire microcopy Richiede circa 10 minuti sotto CTA hero principale.
- [x] Eseguire build frontend e documentare review.

## Review (Navbar CTA highlight affiliazione - Mar 05, 2026)
- Completato.
- Navbar desktop: aggiunto badge Per Associazioni vicino alla CTA Affilia la tua Associazione; bottone ora include freccia ->.
- Hover CTA desktop aggiornato con transform: scale(1.02) e glow rinforzato.
- Mobile menu: CTA Affilia la tua Associazione mantenuta come primo elemento e resa full-width (w-full).
- Sticky CTA homepage: soglia scroll aggiornata a >300px, route invariata /affiliazione.
- Hero: aggiunta microcopy sotto CTA primaria Richiede circa 10 minuti.
- Verifica tecnica: npm --prefix frontend run build -> OK.

## Spec (Homepage interactive membership card demo - Mar 05, 2026)
- Obiettivo: chiarire subito cosa fa la piattaforma ASSONAM mostrando una tessera digitale demo interattiva in homepage.
- Posizionamento: nuova sezione sotto social proof e prima del blocco Affiliazione in 3 passaggi.
- Contenuto richiesto: titolo/sezione, sottotitolo wallet, card demo con Association/Member/ID, QR placeholder, bottone Aggiungi a Wallet.
- Interazione: tilt 3D leggero su hover, glow card, QR pulse, modal informativa con CTA Affilia la tua Associazione e Scopri di piu.
- Vincoli: nessuna chiamata backend; responsive e coerente con palette ASSONAM.

## Plan (Homepage interactive membership card demo)
- [x] Estendere Home.tsx con stato modal e handlers per tilt interattivo della card.
- [x] Inserire nuova sezione demo immediatamente sotto social proof con copy e contenuti richiesti.
- [x] Aggiungere modal overlay con testo demo e due CTA verso /affiliazione e /affiliazione-info.
- [x] Definire stili dedicati in index.css (tilt, glow, QR pulse, responsive, reduced-motion).
- [x] Verificare compilazione frontend e aggiornare review.

## Review (Homepage interactive membership card demo - Mar 05, 2026)
- Sezione aggiunta sotto social proof con titolo Scopri come funziona una tessera digitale e sottotitolo wallet richiesto.
- Card demo interattiva implementata con dati statici: Association Golden Age Fitness, Member Mario Rossi, ID GA-00123.
- QR placeholder animato con pulse/ring e glow su card al passaggio mouse; tilt 3D leggero con reset automatico al mouse leave.
- Bottone Aggiungi a Wallet apre modal overlay con testo:
  - Questa e una demo.
  - Le associazioni affiliate ad ASSONAM possono emettere tessere digitali per tutti i soci.
- CTA modal implementate:
  - Affilia la tua Associazione -> /affiliazione
  - Scopri di piu -> /affiliazione-info
- Nessuna chiamata backend aggiunta per questa feature.
- Verifica tecnica: npm --prefix frontend run build -> OK.
## Spec (Association referral system + reward wheel - Mar 05, 2026)
- Obiettivo: permettere alle associazioni esistenti di invitare nuove associazioni all'affiliazione ASSONAM con tracking referral end-to-end.
- Referral link: supporto sia a `/invito/{slug}` sia a `/affiliazione?ref={slug}`.
- Persistenza: tabella `referrals` con campi richiesti (`id`, `referrer_org_id`, `application_id`, `status`, `created_at`) e metadati premio wheel.
- Wizard: se presente `ref`, mostrare `Invito da {organization_name}` e agganciare il referrer alla bozza.
- Stato referral: `pending` su draft, `approved` su approvazione super-admin, `rewarded` dopo spin wheel.
- Org Admin dashboard: card con link referral, azioni copy/share e statistiche (`Inviti inviati`, `Associazioni affiliate`, `Bonus ottenuti`).
- Reward wheel: spin solo su referral `approved`, premio chiaro con timing di erogazione, tracciamento e visibilità per super admin.
- Vincolo: nessuna regressione sui flussi esistenti di wizard/pagamenti/approvazione.

## Plan (Association referral system + reward wheel)
- [x] Backend DB: aggiungere modello `Referral` + migration Alembic idempotente e campi premio wheel.
- [x] Backend API pubblica: estendere create draft affiliazione per accettare `ref` (slug) e serializzare referral nel payload bozza.
- [x] Backend approvazione: su `approve` super-admin aggiornare referral collegato a `approved`.
- [x] Backend org-admin API: endpoint referral summary/link/list e endpoint spin wheel (`POST`) con validazioni stato e assegnazione premio.
- [x] Frontend wizard: leggere query `ref`, passarla in create draft e mostrare banner `Invito da ...`.
- [x] Frontend routing: aggiungere route `/invito/:slug` che reindirizza a `/affiliazione?ref=slug`.
- [x] Frontend org-admin dashboard: aggiungere card referral con link copy/share, statistiche e wheel interattiva.
- [x] Verifica: eseguire pytest mirato referral + build frontend + review finale.

## Review (Association referral system + reward wheel - Mar 05, 2026)
- Completato.

## Review Update (Association referral system + reward wheel - Mar 05, 2026)
- Backend: aggiunti `ReferralStatus` e modello `Referral` con relazioni verso `Organization` e `AffiliationApplication`.
- Migration: `alembic/versions/b1c2d3e4f5a6_add_referrals_table_and_rewards.py` crea tabella `referrals`, vincoli, indici e campi premio.
- Wizard backend (`/api/affiliazione/draft`): supporto `referral_slug` / query `ref`, attach referral `pending` quando slug valido, evento `referral_attached` (o `referral_ignored` se slug non valido).
- Approvazione super-admin: su `/api/super-admin/affiliations/{id}/approve` referral collegato passa a `approved` con `approved_at`.
- Org-admin backend: nuovi endpoint `/api/org-admin/referrals/summary` e `/api/org-admin/referrals/{referral_id}/spin` con validazioni stato, assegnazione premio weighted e audit `referral.rewarded`.
- Frontend wizard: query `ref` preservata e banner `Invito da {organization_name}` visibile quando referral presente.
- Frontend routing: nuova pagina `/invito/:slug` con redirect automatico a `/affiliazione?ref={slug}`.
- Frontend org-admin dashboard: card `Invita un'altra Associazione` con referral link, copy/share, statistiche e ruota premi con feedback premio/erogazione.
- Frontend super-admin affiliazioni: dettaglio referral e premio visibili nel pannello pratica.
- Verifiche eseguite:
- `python -m pytest tests/test_affiliation_flow.py tests/test_referral_system.py -q` -> **3 passed**.
- `npm --prefix frontend run build` -> **OK**.


## Spec (Stripe optional + feature flags + graceful degradation affiliazione - Mar 05, 2026)
- Obiettivo: rendere Stripe opzionale e impedire crash runtime/import/startup quando env Stripe mancanti.
- Feature flag backend: `AFFILIAZIONE_ENABLED` (default `false`) e `STRIPE_ENABLED` computato senza raise.
- Gating backend: endpoint pubblici affiliazione protetti da flag, Stripe checkout/webhook resilienti.
- Capability contract: nuovo `GET /api/capabilities` per gating frontend.
- Feature flag frontend: `VITE_AFFILIAZIONE_ENABLED` per CTA/navbar/hero e route guard `/affiliazione`.
- Wizard pagamento: fallback automatico a bonifico quando Stripe disabilitato con copy chiara.
- Deploy/docs: compose + documentazione aggiornati per Stripe opzionale.

## Plan (Stripe optional + feature flags + graceful degradation affiliazione)
- [x] Aggiornare `app/config.py` con nuove variabili/compute helper e logging warning safe su Stripe disabilitato.
- [x] Applicare gating backend su router affiliazione pubblico + endpoint `/api/capabilities`.
- [x] Hardening Stripe routes (checkout 503, webhook 200 no-op), submit guard Stripe disabled e payload `payment_config` coerente.
- [x] Aggiornare frontend con env flag `VITE_AFFILIAZIONE_ENABLED` (navbar/hero/routes).
- [x] Aggiornare wizard pagamento (`/affiliazione`) con capabilities fetch, opzione Stripe disabled, default bonifico, auto-switch + toast.
- [x] Aggiornare compose/docs per dichiarare Stripe opzionale.
- [x] Aggiungere sanity tests richiesti e verificare con pytest mirati + build frontend.

## Review (Stripe optional + feature flags + graceful degradation affiliazione - Mar 05, 2026)
- Completato.

## Review Update (Stripe optional + feature flags + graceful degradation affiliazione - Mar 05, 2026)
- Backend config (`app/config.py`): introdotti `AFFILIAZIONE_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `STRIPE_PUBLISHABLE_KEY`, helper `is_stripe_configured()` e property `STRIPE_ENABLED` (computed, no crash).
- Startup safety (`app/main.py`): warning esplicito quando Stripe è disabilitato; nessun raise per env mancanti.
- Feature flag backend affiliazione: public router affiliazione ora gated via dependency `ensure_public_affiliation_enabled` (`404` coerente quando flag off), admin/super-admin invariati.
- Stripe hardening (`app/routes/affiliation.py`):
- checkout Stripe ritorna `503` con messaggio `Stripe non configurato. Usa Bonifico o Contanti.` quando disabled;
- webhook Stripe ritorna `200` no-op quando disabled (niente crash/retry storm);
- selezione/submit con `payment_method=stripe` vengono rifiutati con `400` e messaggio guidato;
- `payment_config.stripe_enabled` serializzato dal flag computato.
- Capabilities endpoint (`app/routes/public.py`): aggiunto `GET /api/capabilities` con payload `{ affiliazioneEnabled, stripeEnabled }`.
- Frontend feature flag:
- nuovo helper `frontend/src/lib/features.ts` con `VITE_AFFILIAZIONE_ENABLED`;
- navbar/hero/mobile CTA nascoste quando flag off (`Layout.tsx`, `Home.tsx`);
- route `/affiliazione` e `/invito/:slug` redirect a home quando flag off (`App.tsx`).
- Wizard pagamento (`frontend/src/pages/Affiliazione.tsx`):
- fetch capabilities (`/api/capabilities`);
- opzione Stripe disabilitata con copy `Carta (Stripe) — presto disponibile`;
- default automatico a Bonifico quando Stripe non è disponibile;
- auto-switch da Stripe a Bonifico su bozze legacy con toast `Pagamento con carta non disponibile al momento. Abbiamo selezionato Bonifico.`;
- nota informativa: `Puoi completare l'invio e pagare con bonifico o contanti. Attivazione dopo verifica.`.
- Deploy/docs:
- `docker-compose.yml` aggiornato con env opzionali (`AFFILIAZIONE_ENABLED`, Stripe vars) con default safe;
- `ENV_REQUIRED.md` e `README.md` aggiornati per chiarire Stripe opzionale e feature flags.
- Test/sanity aggiunti:
- `tests/test_smoke.py`: check `STRIPE_ENABLED` false senza env, `/api/capabilities`, check minimo UI label Stripe disabled;
- `tests/test_affiliation_flow.py`: checkout Stripe `503` quando disabled e reject selezione Stripe `400`.
- Verifiche eseguite:
- `python -m pytest tests/test_affiliation_flow.py tests/test_smoke.py -q` -> **35 passed**.
- `python -m pytest tests/test_referral_system.py -q` -> **1 passed**.
- `npm --prefix frontend run build` -> **OK**.

## Spec (Fix deploy failure missing Dockerfile.affiliation-video-worker - Mar 05, 2026)
- Obiettivo: evitare failure deploy Hetzner per Dockerfile worker mancante e rendere il worker video opzionale/non bloccante.
- Vincolo: path Dockerfile referenziato in compose deve esistere in repo checkout del server.
- Strategia: usare compose profile `video-worker` (default off) + flag env `AFFILIATION_VIDEO_WORKER_ENABLED` per abilitazione esplicita.
- Workflow CI/CD: aggiungere sanity check `test -f Dockerfile.affiliation-video-worker` per fallire presto con errore chiaro.
- Documentazione: aggiornare README/ENV con nuova flag e modalità di attivazione worker.

## Plan (Fix deploy failure missing Dockerfile.affiliation-video-worker)
- [x] Verificare presenza Dockerfile worker e path attuale in `docker-compose.yml`.
- [x] Rendere opzionale il servizio `affiliation-video-worker` con profile compose `video-worker`.
- [x] Aggiungere flag env `AFFILIATION_VIDEO_WORKER_ENABLED` (default false) in compose e deploy workflow.
- [x] Aggiornare workflow Hetzner per sanity check Dockerfile e attivazione profile solo quando flag true.
- [x] Aggiornare README/ENV_REQUIRED con comportamento opzionale worker.
- [x] Eseguire sanity checks (`Test-Path`, `docker compose config`) e aggiornare review.

## Review (Fix deploy failure missing Dockerfile.affiliation-video-worker - Mar 05, 2026)
- Completato.

## Review Update (Fix deploy failure missing Dockerfile.affiliation-video-worker - Mar 05, 2026)
- Dockerfile worker individuato in root: `Dockerfile.affiliation-video-worker` (Node 20 + ffmpeg + `npm ci` + build renderer).
- Compose aggiornato (`docker-compose.yml`):
- aggiunta env `AFFILIATION_VIDEO_WORKER_ENABLED` in `x-app-env` con default `false`;
- `affiliation-video-worker` marcato con `profiles: ["video-worker"]` per evitare build/run di default.
- Workflow deploy Hetzner aggiornato (`.github/workflows/deploy-hetzner.yml`):
- step `actions/checkout` + sanity check `test -f Dockerfile.affiliation-video-worker`;
- `.env` runtime include `AFFILIATION_VIDEO_WORKER_ENABLED`;
- profile `video-worker` abilitato solo se secret/flag è `true`.
- Deploy safety: con flag false il comando standard `docker compose up -d --build` non include il worker profile, quindi il deploy non viene bloccato dal worker opzionale.
- Documentazione aggiornata:
- `ENV_REQUIRED.md` con variabile `AFFILIATION_VIDEO_WORKER_ENABLED`;
- `README.md` con istruzioni attivazione profile `video-worker`.
- Verifiche eseguite:
- `Test-Path Dockerfile.affiliation-video-worker` -> `True`;
- `docker compose -f docker-compose.yml config` -> `OK`.

## Spec (Deploy worker start reliability when enabled - Mar 05, 2026)
- Obiettivo: garantire che il deploy Hetzner avvii davvero `affiliation-video-worker` quando `AFFILIATION_VIDEO_WORKER_ENABLED=true`, evitando successi silenziosi.
- Requisiti: env flag scritto in `.env`, debug line esplicita, branch deploy con/without profile, sanity check post-deploy con fail chiaro.
- Vincolo: mantenere service name `affiliation-video-worker` coerente con `docker-compose.yml`.

## Plan (Deploy worker start reliability)
- [x] Aggiornare workflow per normalizzare e stampare `AFFILIATION_VIDEO_WORKER_ENABLED` dopo la generazione `.env`.
- [x] Rendere esplicita la logica deploy: `--profile video-worker` solo quando flag `true`.
- [x] Aggiungere sanity check post-deploy su `docker compose ... ps affiliation-video-worker` con fail chiaro se assente/non running.
- [x] Verificare coerenza nome servizio tra workflow e compose.

## Review (Deploy worker start reliability - Mar 05, 2026)
- Workflow aggiornato in `.github/workflows/deploy-hetzner.yml`:
- debug line aggiunta: `echo "AFFILIATION_VIDEO_WORKER_ENABLED=$AFFILIATION_VIDEO_WORKER_ENABLED"`.
- deploy branch esplicito:
- `true` -> `docker compose $COMPOSE_FILES --profile video-worker up -d --build`
- `false` -> `docker compose $COMPOSE_FILES up -d --build`
- sanity check post-deploy (solo se enabled):
- verifica presenza riga `affiliation-video-worker` in `docker compose ... ps affiliation-video-worker`
- verifica stato `up|running|healthy`, altrimenti `exit 1` con messaggio `::error::`.
- Coerenza servizio verificata: `docker-compose.yml` contiene `affiliation-video-worker`.
- Verifiche eseguite:
- `git diff -- .github/workflows/deploy-hetzner.yml` -> conferma modifiche.
- `rg -n "affiliation-video-worker|AFFILIATION_VIDEO_WORKER_ENABLED|--profile video-worker" .github/workflows/deploy-hetzner.yml docker-compose.yml` -> coerenza path/nomi.

## Spec (Fix frontend TS2307 missing modules - Mar 05, 2026)
- Obiettivo: risolvere errori build TypeScript TS2307 per moduli frontend mancanti (AffiliazioneInfo, Invito redirect, SuperAdminAffiliations, tracking utility).
- Verifica richiesta: controllare esistenza file, allineamento import in `App.tsx`, `Layout.tsx`, `Home.tsx`, e build frontend completa.
- Vincolo addizionale: fare sanity check backend import per evitare problemi analoghi di modulo mancante in deploy.

## Plan (Fix frontend TS2307 missing modules)
- [x] Verificare presenza dei 4 file richiesti nel filesystem frontend.
- [x] Verificare che gli import in App/Layout/Home puntino ai path corretti.
- [x] Assicurare implementazioni presenti e compatibili con gli import usati (`trackUiEvent`).
- [x] Eseguire `npm --prefix frontend run build` e confermare successo.
- [x] Eseguire sanity check backend import (`import app.main`) per prevenzione regressioni simili.
- [ ] Tracciare in Git i file frontend mancanti per evitare TS2307 in CI/deploy.
- [ ] Commit con messaggio richiesto.

## Review (Fix frontend TS2307 missing modules - Mar 05, 2026)
- File verificati: presenti in workspace
  - `frontend/src/pages/AffiliazioneInfo.tsx`
  - `frontend/src/pages/InvitoAffiliazioneRedirect.tsx`
  - `frontend/src/pages/super-admin/SuperAdminAffiliations.tsx`
  - `frontend/src/lib/tracking.ts`
- Import verificati in `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`, `frontend/src/pages/Home.tsx` -> coerenti.
- Build frontend:
  - `npm --prefix frontend run build` -> **OK**.
- Sanity backend import:
  - `python -c "import app.main; import app.routes.affiliation; import app.routes.public; print('backend_import_ok')"` -> **OK**.
- Root cause TS2307: file presenti localmente ma non tracciati in Git (quindi assenti in CI/build remoto).

## Spec (Fix PEP 668 in Dockerfile.affiliation-video-worker - Mar 05, 2026)
- Obiettivo: evitare errore `externally-managed-environment (PEP 668)` durante install Python deps nel worker image.
- Requisiti: usare venv `/opt/venv`, includere `python3-venv`, usare `pip` del venv, PATH aggiornato, sanity check `python -c`.
- Vincolo: non rompere pipeline Node/Remotion esistente.

## Plan (Fix PEP 668 worker Dockerfile)
- [x] Aggiornare pacchetti apt includendo `python3-venv`.
- [x] Creare virtualenv `/opt/venv` e aggiornare `PATH`.
- [x] Sostituire install Python deps con `pip` nel venv e aggiungere sanity check Python.
- [x] Tentare build Docker locale per validazione.

## Review (Fix PEP 668 worker Dockerfile - Mar 05, 2026)
- File aggiornato: `Dockerfile.affiliation-video-worker`.
- Modifiche applicate:
  - apt ora installa: `python3 python3-venv python3-pip ffmpeg ca-certificates`.
  - aggiunti:
    - `RUN python3 -m venv /opt/venv`
    - `ENV PATH="/opt/venv/bin:$PATH"`
  - install requirements ora via venv:
    - `RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt`
  - sanity check aggiunto:
    - `RUN python -c "import sys; print(sys.version)"`
- Build Docker locale tentata:
  - `docker build -f Dockerfile.affiliation-video-worker .`
  - non eseguibile in questo ambiente: Docker daemon non disponibile (`npipe ... dockerDesktopLinuxEngine ... file specified`).

## Spec (Hotfix startup crash optional affiliation import - Mar 05, 2026)
- Obiettivo: eliminare crash import-time (`ImportError: AffiliationApplication`) che manda giu il servizio prima del gating feature flag.
- Strategia hotfix: rendere l'import del modulo affiliazione lazy/condizionale in `app.main`, con fallback safe se import fallisce.
- Vincolo: app deve avviarsi quando `AFFILIAZIONE_ENABLED=false`, anche se modelli/routes affiliazione sono incompleti.
- Verifica: smoke test dedicato che importa `app.main` in processo separato con flag disabilitata.

## Plan (Hotfix startup crash optional affiliation import)
- [x] Rimuovere import top-level di `affiliation` da `app/main.py`.
- [x] Introdurre registrazione router affiliazione lazy (`_include_affiliation_routers`) con controllo flag e fallback safe su import error.
- [x] Mantenere inalterata la registrazione router core non opzionali.
- [x] Aggiungere smoke test su import `app.main` con `AFFILIAZIONE_ENABLED=false`.
- [x] Eseguire verifica locale con import diretto + pytest mirato.

## Review (Hotfix startup crash optional affiliation import - Mar 05, 2026)
- `app/main.py` aggiornato:
  - rimosso `affiliation` dall'import top-level dei router;
  - aggiunta funzione `_include_affiliation_routers()`:
    - se `AFFILIAZIONE_ENABLED=false` -> skip import/register con log info;
    - se `true` -> prova import runtime di `app.routes.affiliation`;
    - se import fallisce -> log exception e skip registration (service resta up);
  - registrazione router affiliazione sostituita con chiamata `_include_affiliation_routers()`.
- `tests/test_smoke.py` aggiornato:
  - nuovo test `test_app_main_imports_with_affiliazione_disabled` che avvia subprocess Python con env `AFFILIAZIONE_ENABLED=false` e verifica import `app.main` senza crash.
- Verifiche eseguite:
  - `python -c` (subprocess inline) con `AFFILIAZIONE_ENABLED=false` -> **OK** (`app_main_import_ok`).
  - `python -m pytest tests/test_smoke.py::test_app_main_imports_with_affiliazione_disabled -q` -> **1 passed**.

## Spec (Production hotfix web+worker+deploy robustness - Mar 05, 2026)
- Obiettivo: risolvere 502 in produzione da import-time crash affiliazione e stabilizzare worker video con controlli deploy robusti.
- Scope:
  - Web: import opzionale affiliazione e modelli fallback per evitare `ImportError`.
  - Worker: startup logs strutturati, validazioni config, marker readiness, loop resiliente.
  - Deploy: attesa health worker fino a 90s con dump log su failure.
- Vincolo: nessun workaround silenzioso lato deploy quando flag worker=true.

## Plan (Production hotfix web+worker+deploy)
- [x] Introdurre modulo modelli affiliazione resiliente (`app/models_affiliation.py`) e aggiornare import in route/service.
- [x] Stabilizzare worker `app.workers.affiliation_video_worker` con validazioni env + readiness marker.
- [x] Aggiungere healthcheck worker in `docker-compose.yml`.
- [x] Rafforzare workflow deploy Hetzner con wait-for-health (90s) e log dump su errore.
- [x] Estendere smoke test import main con `AFFILIAZIONE_ENABLED=true` e router presente.
- [x] Eseguire py_compile + pytest smoke mirati + tentativo build compose.

## Review (Production hotfix web+worker+deploy - Mar 05, 2026)
- Web:
  - `app/routes/affiliation.py` ora usa modelli affiliazione da `app.models_affiliation` (non da `app.models`), eliminando dipendenza fragile su classi non presenti.
  - nuovo `app/models_affiliation.py` con fallback:
    - usa classi da `app.models` quando disponibili;
    - altrimenti definisce classi SQLAlchemy minime (`AffiliationApplication`, `AffiliationPerson`, `AffiliationDocument`, `AffiliationEvent`, `VideoJob`, `Referral`) + enum richiesti.
- Worker:
  - `app/workers/affiliation_video_worker.py` aggiornato con:
    - logging startup strutturato (flags/env presence/ffmpeg/git sha);
    - check esplicito `DATABASE_URL` quando `AFFILIATION_VIDEO_WORKER_ENABLED=true`;
    - import lazy di `process_video_jobs_once` con errore chiaro;
    - marker readiness `/tmp/worker.ready` dopo init ok;
    - ciclo resiliente: su errori di ciclo logga e continua poll (no crash su queue vuota).
  - `app/services/affiliation_video.py` aggiornato per usare `app.models_affiliation`.
- Compose:
  - `docker-compose.yml` worker ora ha healthcheck:
    - `test -f /tmp/worker.ready`
    - `interval: 10s`, `timeout: 3s`, `retries: 12`.
- Deploy:
  - `.github/workflows/deploy-hetzner.yml`:
    - verifica `docker-compose.yml` presente nella directory target dopo `cd`;
    - quando worker enabled: attesa health fino a 90s via `docker inspect`;
    - su failure stampa `compose ps`, `logs affiliation-video-worker` e `logs web` prima di fallire.
- Test/verifiche eseguite:
  - `python -m py_compile app/main.py app/routes/affiliation.py app/models_affiliation.py app/services/affiliation_video.py app/workers/affiliation_video_worker.py` -> OK
  - `python -m pytest tests/test_smoke.py::test_app_main_imports_with_affiliazione_disabled tests/test_smoke.py::test_app_main_imports_with_affiliazione_enabled_router_present -q` -> 2 passed
  - smoke manual worker:
    - enabled=false -> exit 0 con log chiaro
    - enabled=true senza DATABASE_URL -> RuntimeError esplicito
  - `docker compose build web affiliation-video-worker` -> non eseguibile in questo ambiente (Docker daemon assente).

## Spec (Affiliazione end-to-end coherence hotfix - Mar 05, 2026)
- Obiettivo: ripristinare coerenza completa del flusso affiliazione (landing/nav responsive, wizard con validazioni reali, super-admin review, associazioni+stato, invite org-admin, video fullscreen, feature flags runtime) senza breaking changes DB/API.
- Vincoli: nessuna libreria pesante nuova, retrocompatibilita DB, errori espliciti FE/BE, niente token pratica in chiaro in UI.

## Plan (Affiliazione end-to-end coherence hotfix)
- [ ] Audit e fix responsive Landing/Navbar (desktop 1440, tablet 1024, mobile 390) con CTA stabili e no wrapping/schiacciamenti.
- [ ] Refactor wizard affiliazione: rimozione token/link box, validazione step-by-step, submit bloccato su required mancanti, stato inviato solo dopo submit reale.
- [ ] Hardening backend submit affiliazione: 422 dettagliato su campi mancanti, nessun cambio stato in errore, messaggi FE chiari.
- [ ] Super Admin: tab Affiliazioni completo (list/detail/approve/reject/under_review) e integrazione tab Associazioni con stato pratica + quick link.
- [ ] Org Admin: ripristino funzionalita Invita Associazione (menu/pagina/form/lista stato) con invio link wizard.
- [ ] Video guida affiliazione: disponibilita in prod + modal fullscreen (ESC, click outside, X).
- [ ] Debug feature flags (dev/admin) e allineamento gating runtime senza forced false.
- [ ] Verifica finale: build frontend, pytest mirati, checklist manuale viewport/stati.


---
## Todo (Mar 05, 2026 - Wizard docs + Navbar cleanup)
- [ ] Aggiungere documenti obbligatori mancanti (vicepresidente + segretario/tesoriere) su wizard FE e validazione BE
- [ ] Migliorare UI wizard affiliazione (intro, stepper, upload cards, form spacing/gerarchia)
- [ ] Sistemare navbar pubblica desktop/mobile (badge CTA, payoff brand, overlap testi)
- [ ] Verifica finale: build frontend + test backend affiliazione/capabilities

## Review (in corso)
- Root cause atteso: lista documenti richiesta incompleta in `DOC_ITEMS` FE e `REQUIRED_DOCUMENT_TYPES` BE; header pubblico con CTA troppo larga + badge separato e payoff sempre visibile su viewport intermedie.
## Todo (Mar 05, 2026 - Wizard docs + Navbar cleanup) [COMPLETATO]
- [x] Aggiungere documenti obbligatori mancanti (vicepresidente + segretario/tesoriere) su wizard FE e validazione BE
- [x] Migliorare UI wizard affiliazione (intro, stepper, upload cards, form spacing/gerarchia)
- [x] Sistemare navbar pubblica desktop/mobile (badge CTA, payoff brand, overlap testi)
- [x] Verifica finale: build frontend + test backend affiliazione/capabilities

## Review (Wizard docs + Navbar cleanup - Mar 05, 2026)
- Root cause confermata:
  - documenti obbligatori incompleti: `DOC_ITEMS` (frontend) e `REQUIRED_DOCUMENT_TYPES` (backend) mancavano vice presidente e segretario/tesoriere;
  - header pubblico sovraccarico su viewport intermedie: badge CTA separato + payoff brand sempre visibile + breakpoint nav troppo anticipato.
- Fix applicati:
  - documenti aggiunti in FE/BE: `documento_vicepresidente`, `documento_segretario_tesoriere`;
  - wizard UI rifinito: card/stepper/form controls/upload cards piu leggibili e coerenti;
  - navbar pubblica: rimosso badge separato invasivo, payoff visibile solo su 2XL, nav desktop da `xl`, menu mobile/tablet esteso fino a `< xl`.
- Verifiche:
  - `npm --prefix frontend run build` -> OK
  - `python -m py_compile app/routes/affiliation.py` -> OK
  - `python -m pytest -q tests/test_affiliation_flow.py tests/test_referral_system.py` -> 6 passed
  - `python -m pytest -q tests/test_smoke.py -k capabilities` -> 1 passed

## Todo (Mar 05, 2026 - Hero CTA + Draft hygiene)
- [x] Sistemare allineamento bottoni hero landing (CTA dritte e uniformi)
- [x] Rimuovere creazione automatica bozza vuota nel wizard affiliazione
- [x] Aggiungere eliminazione bozza da Super Admin (solo stato draft)
- [x] Nascondere azioni incoerenti su bozza (niente Approva/Rifiuta su draft)
- [x] Verifica finale: build frontend + test backend affiliazione

## Review (Hero CTA + Draft hygiene - Mar 05, 2026)
- Root cause:
  - hero: CTA con altezze/struttura diverse (una dentro colonna con microcopy) => aspetto storto.
  - wizard: bozza creata automaticamente all'apertura `/affiliazione` anche senza interazioni utente.
  - super admin: UI mostrava sempre azioni decisionali, anche su draft vuote.
- Fix:
  - hero: riga CTA uniforme (stessa altezza/stile), microcopy separata sotto la riga.
  - wizard: senza `token` non crea bozza; bozza creata solo al click `Inizia Affiliazione`.
  - super admin: endpoint `DELETE /api/super-admin/affiliations/{id}` (solo `draft` non inviate) + pulsante `Elimina bozza` in UI.
  - super admin UI: `Approva` visibile solo quando `can_approve=true`; su draft spariscono Approva/Rifiuta.
- Verifiche:
  - `python -m py_compile app/routes/affiliation.py` -> OK
  - `python -m pytest -q tests/test_affiliation_flow.py tests/test_referral_system.py` -> 7 passed
  - `npm --prefix frontend run build` -> OK

## Todo (Mar 05, 2026 - Disable realtime autosave)
- [x] Rimuovere autosave realtime della bozza wizard
- [x] Introdurre salvataggio bozza solo manuale
- [x] Aggiornare copy stato bozza per evitare ambiguita
- [x] Verifica build frontend

## Review (Disable realtime autosave - Mar 05, 2026)
- Root cause: era rimasto attivo un `useEffect` debounce su `dirtyCounter` che chiamava `persistDraft()` ad ogni modifica campo.
- Fix: eliminato il `useEffect` autosave; aggiunto pulsante esplicito `Salva bozza` nel pannello stato; submit continua a salvare prima dell'invio.
- Verifica: `npm --prefix frontend run build` -> OK

## Spec (Polish affiliation UX + invite wheel gating - Mar 05, 2026)
- Obiettivo: finalizzare UX affiliazione e flusso referral org-admin con separazione tab Inviti, ruota disponibile solo dopo approvazione super-admin, e audit esito ruota visibile anche al super-admin.
- Scope FE:
  - restyling wizard "Affilia la tua Associazione" (layout card centrale, stepper leggibile, CTA avanti/indietro/invia, stati chiari, mobile-safe);
  - nuovo modal video fullscreen post-iscrizione con animazione "ombre" via CSS keyframes e player responsive;
  - dashboard org-admin con sola panoramica KPI + nuova tab/pagina dedicata "Inviti" con tabella e azioni dettaglio/spin.
- Scope BE:
  - endpoint lista inviti org-admin con stato invito e `wheel_enabled` calcolato server-side;
  - hard-gating endpoint spin (409 se non disponibile);
  - persistenza esito ruota (`wheel_result`, `wheel_spun_at`, `wheel_spun_by_org_admin_id`) su tabella `referrals`;
  - serializzazione esito ruota in payload visibili a org-admin e super-admin.
- Vincoli: nessuna libreria pesante nuova, endpoint esistenti wizard/approvazione invariati, migrazione DB minima su `referrals`.

## Plan (Polish affiliation UX + invite wheel gating)
- [ ] Aggiornare `tasks/todo.md` con review finale e lista verifiche eseguite.
- [ ] FE wizard: applicare restyling estetico + micro UX senza alterare logica submit/API.
- [ ] FE video: introdurre componente fullscreen overlay con animazione ombre e fallback "Sto preparando il video...".
- [ ] BE referrals: aggiungere campi wheel result + endpoint lista inviti con `invite_status`/`wheel_enabled` + gating spin.
- [ ] FE org-admin: spostare inviti in nuova tab dedicata con tabella, dettaglio, ruota visibile solo quando `wheel_enabled=true`.
- [ ] Super-admin visibility: mostrare esito ruota persistito nel dettaglio pratica affiliazione.
- [ ] Aggiungere/aggiornare test backend referral; eseguire build frontend + pytest mirati.
- [ ] Preparare commit finale richiesto.

## Plan (Polish affiliation UX + invite wheel gating) [COMPLETATO]
- [x] Aggiornare `tasks/todo.md` con review finale e lista verifiche eseguite.
- [x] FE wizard: applicare restyling estetico + micro UX senza alterare logica submit/API.
- [x] FE video: introdurre componente fullscreen overlay con animazione ombre e fallback "Sto preparando il video...".
- [x] BE referrals: aggiungere campi wheel result + endpoint lista inviti con `invite_status`/`wheel_enabled` + gating spin.
- [x] FE org-admin: spostare inviti in nuova tab dedicata con tabella, dettaglio, ruota visibile solo quando `wheel_enabled=true`.
- [x] Super-admin visibility: mostrare esito ruota persistito nel dettaglio pratica affiliazione.
- [x] Aggiungere/aggiornare test backend referral; eseguire build frontend + pytest mirati.
- [x] Preparare commit finale richiesto.

## Review (Polish affiliation UX + invite wheel gating - Mar 05, 2026)
- Wizard affiliazione:
  - restyle completo in `frontend/src/pages/Affiliazione.tsx` con card centrale `max-w-4xl`, stepper leggibile, CTA coerenti `Indietro/Avanti/Invia`, stati di bozza/errori visibili, e nessun overflow mobile.
  - logica endpoint invariata: solo UI/micro UX e controlli navigazione step.
- Video post-iscrizione fullscreen:
  - nuovo componente `frontend/src/components/affiliation/FullscreenVideoOverlay.tsx` (`fixed inset-0`, close via `X`/ESC/click overlay, player responsive).
  - animazione "ombre" implementata in `frontend/src/index.css` con keyframes CSS (`fullscreen-video-shadow*`) + reveal fade/scale del player.
  - fallback preparazione video: placeholder "Sto preparando il video..." finche `video_url` non e pronto; polling leggero stato video nel wizard.
- Org Admin inviti separati dalla panoramica:
  - dashboard pulita con soli KPI+summary (`frontend/src/pages/org-admin/OrgAdminDashboard.tsx`).
  - nuova tab/pagina dedicata `Inviti` (`frontend/src/pages/org-admin/OrgAdminInvites.tsx`) con form invito, filtri, tabella pratiche, dettaglio e ruota.
  - routing/nav aggiornati (`frontend/src/App.tsx`, `frontend/src/pages/org-admin/OrgAdminLayout.tsx`).
- Wheel gating + persistenza esito:
  - backend: helper `invite_status` + `wheel_enabled` server-side e endpoint lista `GET /api/org-admin/referrals/invites` in `app/routes/org_admin.py`.
  - endpoint spin hard-gated (409 se non disponibile) e persistenza esito su referral (`wheel_result`, `wheel_spun_at`, `wheel_spun_by_org_admin_id`).
  - serializzazione esito disponibile sia per org-admin (summary/invites) sia per super-admin (`app/routes/affiliation.py` + UI `frontend/src/pages/super-admin/SuperAdminAffiliations.tsx`).
- DB:
  - nuovi campi modello referral in `app/models.py` e fallback `app/models_affiliation.py`.
  - migrazione Alembic aggiunta: `alembic/versions/e5f6a7b8c9d0_add_referral_wheel_audit_fields.py`.
  - compatibilita dev/test senza migrazione forzata: bootstrap colonne in `init_db.py`.
- Verifiche eseguite:
  - `npm --prefix frontend run build` -> OK
  - `python -m py_compile app/routes/org_admin.py app/routes/affiliation.py app/models.py app/models_affiliation.py tests/test_referral_system.py` -> OK
  - `python -m pytest -q tests/test_referral_system.py tests/test_affiliation_flow.py` -> 7 passed
  - `python -m alembic upgrade head` su DB legacy isolati -> fallisce per migrazioni storiche preesistenti (non bloccante per queste modifiche).

## Spec (Fix Chromium runtime libs for affiliation-video-worker - Mar 05, 2026)
- Obiettivo: risolvere crash `chrome-headless-shell: error while loading shared libraries: libnspr4.so` nel renderer video Remotion.
- Strategia: aggiornare `Dockerfile.affiliation-video-worker` installando runtime deps Chromium headless (nspr/nss/gtk/gbm/asound/x11/atk/pango/cairo ecc.), mantenendo immagine slim e senza nuove librerie applicative.
- Verifica: rebuild immagine worker, esecuzione `node dist/renderHud.cjs ...`, conferma generazione MP4 non vuoto.

## Plan (Fix Chromium runtime libs for affiliation-video-worker)
- [ ] Aggiornare `Dockerfile.affiliation-video-worker` con pacchetti sistema richiesti da Chromium headless + ffmpeg/ca-certificates.
- [ ] Rebuild immagine `affiliation-video-worker` con docker compose.
- [ ] Eseguire render smoke test (`AUDIO_SOURCE=local node dist/renderHud.cjs ...`) nel container.
- [ ] Verificare output MP4 generato e dimensione > 200KB.
- [ ] Aggiornare review e lessons, poi commit+push.

## Plan (Fix Chromium runtime libs for affiliation-video-worker) [AGGIORNAMENTO]
- [x] Aggiornare `Dockerfile.affiliation-video-worker` con pacchetti sistema richiesti da Chromium headless + ffmpeg/ca-certificates.
- [x] Rebuild immagine `affiliation-video-worker` con docker compose (tentato).
- [ ] Eseguire render smoke test (`AUDIO_SOURCE=local node dist/renderHud.cjs ...`) nel container.
- [ ] Verificare output MP4 generato e dimensione > 200KB.
- [ ] Aggiornare review e lessons, poi commit+push.

## Review (Fix Chromium runtime libs for affiliation-video-worker - Mar 05, 2026)
- File aggiornato: `Dockerfile.affiliation-video-worker`.
- Installate dipendenze runtime Chromium/Remotion richieste: `libnspr4`, `libnss3`, `libgtk-3-0`, `libgbm1`, `libasound2`, stack X11/Atk/Pango/Cairo, `fonts-liberation`, `xdg-utils`, oltre a `ffmpeg` e `ca-certificates`.
- Build locale tentata:
  - `docker compose --profile video-worker build affiliation-video-worker`
  - Esito: fallita per daemon Docker non disponibile in questo ambiente (`npipe ... dockerDesktopLinuxEngine ... file specified`).
- Azione successiva richiesta su host con Docker attivo: rebuild + smoke test render MP4.

## Spec (Fix deploy container name conflict on Hetzner - Mar 05, 2026)
- Obiettivo: evitare failure deploy `Error response from daemon: Conflict. The container name ... is already in use` durante `docker compose up -d --build`.
- Root cause attesa: container stale con prefissi hash (es. `_app-web-1`) o project name non stabile in ambiente remoto.

## Plan (Fix deploy container name conflict on Hetzner)
- [x] Forzare `COMPOSE_PROJECT_NAME` stabile nel workflow deploy SSH.
- [x] Aggiungere cleanup pre-deploy di container service stale per evitare collisioni nome.
- [x] Mantenere invariata la logica di healthcheck worker post-up.
- [ ] Verifica in GitHub Actions su prossimo run deploy.

## Review (Fix deploy container name conflict on Hetzner - Mar 05, 2026)
- File aggiornato: `.github/workflows/deploy-hetzner.yml`.
- Aggiunto `export COMPOSE_PROJECT_NAME="app"` all'inizio dello script remoto.
- Aggiunto cleanup pre-`up`:
  - `docker compose ... rm -f -s web email-worker low-cards-worker affiliation-video-worker || true`
  - rimozione container stale per pattern nome (`_app-web-1`, `_app-email-worker-1`, `_app-low-cards-worker-1`, `_app-affiliation-video-worker-1`).
- Effetto atteso: niente più collisioni `container name ... already in use` in fase Recreate/Up.

## Spec (Fix Remotion 404 welcome_hud_audio.wav - Mar 05, 2026)
- Obiettivo: evitare crash render HUD quando Remotion non trova `welcome_hud_audio.wav` su static server (`/public/...` 404).
- Requisiti: asset tracciato in `public/`, uso `staticFile("welcome_hud_audio.wav")` senza URL hardcoded, fallback no-audio se file assente.

## Plan (Fix Remotion 404 welcome_hud_audio.wav)
- [x] Tracciare asset audio in `video-renderer/services/welcome-video/public/welcome_hud_audio.wav`.
- [x] Aggiornare componente HUD per usare solo `staticFile("welcome_hud_audio.wav")`.
- [x] Aggiungere guardia in `renderHud` per disattivare audio se il file manca (no crash).
- [x] Rigenerare `dist` con `npm run build`.
- [x] Eseguire smoke test `node dist/renderHud.cjs` con output MP4.

## Review (Fix Remotion 404 welcome_hud_audio.wav - Mar 05, 2026)
- Build eseguita: `npm run build` (welcome-video) -> OK.
- Test eseguito:
  - `AUDIO_SOURCE=local node dist/renderHud.cjs --orgId 25 --orgName "Org Test" --mode review --template personalized --output out/welcome_test_25.mp4`
  - Esito: `status=done`, MP4 generato.
  - Output verificato: `out/welcome_test_25.mp4` size `1238266` bytes.

## Spec (Fix Remotion external logo assets in production - Mar 05, 2026)
- Obiettivo: evitare failure render HUD in produzione quando `logoUrl` punta a un asset esterno bloccato da CORP/CORS e garantire asset locali tracciati per logo/audio.
- Requisiti:
  - asset necessari presenti in `video-renderer/services/welcome-video/public/`;
  - se `logoUrl` e remoto, il renderer deve provare fetch + conversione in data URL base64;
  - se il fetch fallisce, usare fallback logo locale con `staticFile()`;
  - audio HUD sempre safe: `staticFile()` quando presente, fallback silenzioso senza crash;
  - rigenerare `dist`, validare con `node dist/renderHud.cjs`, preparare commit.

## Plan (Fix Remotion external logo assets in production) [COMPLETATO]
- [x] Tracciare logo locale stabile in `video-renderer/services/welcome-video/public/` e confermare l'audio HUD versionato.
- [x] Aggiornare `renderHud` per risolvere `logoUrl` remoto in data URL base64 con fallback logo locale.
- [x] Aggiornare il componente Remotion HUD per preferire `staticFile()` sui logo locali quando non arriva un asset inline.
- [x] Rigenerare `dist` e rieseguire smoke test `node dist/renderHud.cjs` con output MP4.
- [x] Documentare review finale e creare commit Git limitato ai file del fix.

## Review (Fix Remotion external logo assets in production - Mar 05, 2026)
- Asset locali:
  - aggiunto `video-renderer/services/welcome-video/public/logo-transparent.png` (fallback locale del logo ASSONAM);
  - confermato `video-renderer/services/welcome-video/public/welcome_hud_audio.wav` presente e usato via `staticFile()`.
- Renderer HUD:
  - `src/renderHud.ts` ora intercetta `logoUrl` HTTP(S), scarica l'immagine lato Node e la converte in data URL base64 (`logoStrategy=remote-inline`);
  - se il fetch fallisce, passa a fallback locale `logo-transparent.png` senza dipendere da asset cross-origin;
  - output JSON esteso con `logoStrategy` per debug operativo.
- Componente Remotion HUD:
  - `src/remotion/hud/AssonamHUDWelcome.tsx` e `Scene5Logo.tsx` supportano `logoAssetPath` e usano `staticFile()` per il fallback locale;
  - `maskImage` ora quota correttamente i data URL base64 per evitare rotture CSS durante il render.
- Verifiche eseguite (`video-renderer/services/welcome-video`):
  - `npm run build` -> OK;
  - `node dist/renderHud.cjs --orgId corp-logo --orgName "Org Test" --mode review --template personalized --logoUrl "https://assonam.it/logo-transparent.png" --output out/welcome_test_remote_logo.mp4` -> OK, MP4 generato (`1243173` bytes), `logoStrategy=remote-inline`;
  - `node dist/renderHud.cjs --orgId silent-audio --orgName "Org Silent" --mode review --template personalized --audio-local-path ".\\missing-audio-dir" --output out/welcome_test_silent.mp4` -> OK, MP4 generato (`1243219` bytes), `audioStrategy=silent-fallback`.

## Spec (Wizard affiliation idempotency + welcome-video reconciliation - Mar 05, 2026)
- Obiettivo: rendere robusto e idempotente il flusso di affiliazione pubblico e il welcome-video senza perdere dati e senza reset distruttivi DB.
- Scope:
  - GET draft deve esporre `welcome_video_ready`, `welcome_video_url`, `welcome_video_error` e considerare il file reale come source of truth.
  - Worker video deve marcare `done` solo quando l'MP4 esiste davvero, ma riconciliare a `done` anche se il renderer esce non-zero e il file esiste.
  - Wizard deve riusare la stessa pratica in base a identita stabile, evitare duplicati di application/people e supportare retry safe.
  - Frontend deve basarsi sui nuovi campi welcome video e usare sempre resume token/url backend.
- Vincoli: solo fix puntuali, migrazioni additive, update mirati; nessun DROP/DELETE massivo o reset DB.

## Plan (Wizard affiliation idempotency + welcome-video reconciliation)
- [ ] Audit completo di route/modelli/worker/UI e append review finale in questo file.
- [ ] Backend draft response: aggiungere campi `welcome_video_*` e riconciliazione file > DB.
- [ ] Worker video: render idempotente, verifica file post-node, no false failed quando il file esiste.
- [ ] Wizard backend: riuso pratica esistente, chiave identita stabile, retry safe submit/video e people upsert.
- [ ] Migrazione additiva per colonne/index idempotenza + bootstrap safe in `init_db.py`.
- [ ] Frontend wizard/API: persistenza server-side per step, video player su `welcome_video_ready`, retry generazione.
- [ ] Verifiche: pytest mirati, build frontend, smoke test GET draft con file MP4 presente.

## Review (Wizard affiliation idempotency + welcome-video reconciliation - Mar 06, 2026)
- Backend draft response ora espone `welcome_video_ready`, `welcome_video_url`, `welcome_video_error` e usa il file MP4 su disco come source of truth rispetto a job DB stale.
- Worker video reso idempotente: verifica file post-render, salva `done` solo con output reale, ma riconcilia a `done` anche quando Node esce non-zero e l'MP4 esiste.
- Wizard backend reso retry-safe: riuso application per identita stabile, `idempotency_key` persistita, create/submit/stripe/video-retry idempotenti, people upsert per ruolo.
- Frontend wizard aggiornato: nessun token generato lato client, resume sempre da backend, persistenza server-side sugli step, player basato su `welcome_video_ready` e retry video dedicato.
- Documentazione aggiornata: `APP_DATA_DIR`, default video path e nuovo contratto draft.
- Verifiche eseguite:
  - `python -m pytest -q tests/test_affiliation_flow.py tests/test_affiliation_video_service.py` -> `10 passed`
  - `npm --prefix frontend run build` -> OK
  - smoke `GET /api/affiliazione/draft/{token}` con file presente -> `welcome_video_ready=true`, `welcome_video_url=/videos/welcome/1.mp4`

## Spec (Live website audit - Mar 06, 2026)
- Obiettivo: eseguire audit live del sito pubblico piu probabile del progetto (`https://assonam.it`) usando `squirrel`, con scansione iniziale rapida e successiva scansione completa.
- Requisiti:
  - usare output `llm`;
  - eseguire prima `surface`, poi `full`;
  - non applicare fix senza prima presentare i risultati e il batch proposto;
  - documentare sintesi e prossimi passi in questa sezione.

## Plan (Live website audit - Mar 06, 2026)
- [x] Inizializzare/verificare configurazione `squirrel` locale per il progetto.
- [x] Eseguire audit `surface` live su `https://assonam.it` con output `llm`.
- [x] Eseguire audit `full` live su `https://assonam.it` con output `llm`.
- [x] Riassumere score, issue principali e batch di fix candidati.

## Review (Live website audit - Mar 06, 2026)
- Target audit confermato da repo e documentazione: `https://assonam.it`.
- Configurazione locale creata: `squirrel.toml`.
- Audit eseguiti:
  - `surface` -> report `tasks/tmp/assonam-surface-20260306.llm`, audit id `1c7e61b7`
  - `full` -> report `tasks/tmp/assonam-full-20260306.llm`, audit id `75131c64`
- Risultato invariato tra surface/full: `score 63`, grade `D`, `5 failed`, `54 warnings`, `69` URL crawled.
- Diff rispetto all'audit del `2026-02-28` (`af5300d6`): nessuna regression o improvement di score; variazioni limitate a nuovi asset bundle e +2 URL in sitemap.
- Root cause principale verificata con fetch live HTML (`/` e `/privacy`): il server restituisce shell SPA con solo `<div id="root"></div>` e meta condivisi, quindi crawler/no-JS non vedono H1, contenuto, landmark e link interni delle pagine marketing.
- Principali aree da correggere prima di un nuovo audit:
  - public pages crawlable/SSR-prerender per `/`, `/lo-studio`, `/servizi`, `/contatti`, `/privacy`;
  - title/description canonici per pagina invece di meta condivisi;
  - landmark a11y (`<main>`, skip link) e internal linking/footer privacy nel markup iniziale;
  - riduzione bundle JS principale (`/assets/index-DfPg34Rc.js`, 477.4 KB) e catena critica font/CSS;
  - header security `Strict-Transport-Security` e review CSP per rimuovere `unsafe-inline` dove possibile.
## Spec (Repository-wide cybersecurity review - Mar 06, 2026)
- Obiettivo: eseguire un audit di sicurezza end-to-end del repository applicando il lens cybersecurity-analyst.
- Scope:
  - backend FastAPI: auth/session, middleware, upload/download, integrazioni, ingest pubblici, webhook, admin boundaries;
  - configurazione/runtime: env defaults, docker/deploy exposure, static/public mounts;
  - frontend solo dove impatta la security posture (auth flow, token handling, public exposure).
- Output atteso:
  - findings ordinati per severita con file/linee, rischio, impatto e fix prioritizzati;
  - verifiche eseguite (test/security grep) e gap residui.
- Vincoli:
  - audit only, nessuna modifica applicativa salvo richiesta successiva del cliente;
  - validare i finding con traccia codice o test esistenti prima di chiudere.

## Plan (Repository-wide cybersecurity review - Mar 06, 2026)
- [ ] Mappare superfici di attacco e confini di trust (public, member, org-admin, super-admin, integrazioni, webhook).
- [ ] Verificare auth/session/CSRF/rate-limit e cercare bypass o dipendenze da header non trusted.
- [ ] Verificare exposure di file, upload/download, token pubblici, e path/public mounts.
- [ ] Verificare secret handling, bootstrap/admin defaults, config runtime e docker/deploy posture.
- [ ] Eseguire verifiche mirate (test security esistenti e grep su pattern sensibili) per confermare o smentire finding.
- [ ] Documentare review finale con finding ordinati per severita, open questions e rischi residui.

## Review (Repository-wide cybersecurity review - Mar 06, 2026)
- Findings confermati:
  - default `SECRET_KEY` / `SUPER_ADMIN_PASSWORD` + bootstrap automatico super-admin => rischio takeover se env mancanti;
  - mount pubblico di tutto `UPLOAD_DIR` su `/uploads` => bypass dei controlli auth sui file caricati;
  - trust diretto di `X-Forwarded-For` in rate-limit/audit => spoofing IP e aggiramento limiti;
  - webhook WhatsApp/Twilio senza verifica firma => richieste forgiate, spam admin SMS e scritture DB;
  - legacy `/admin/login` ignora `is_active` / `deleted_at` in code path legacy.
- Verifiche eseguite:
  - `python -m pytest -q tests/test_security_hardening_audit.py` -> `5 passed`
  - probe runtime `/uploads`: file temporaneo in `UPLOAD_DIR` scaricabile via `GET /uploads/security-audit-probe.txt` -> `200 probe-ok`
  - probe `get_client_ip()` con header spoofato `X-Forwarded-For: 1.2.3.4, 10.0.0.1` -> ritorna `1.2.3.4`
  - probe config defaults `Settings()` -> `SECRET_KEY=supersecretkey`, `SUPER_ADMIN_PASSWORD=admin`
- Gap residui:
  - non ho eseguito un harness dedicato per il legacy `/admin/login` su DB isolato; finding confermato per code inspection del path attivo.

## Spec (Security hardening end-to-end - Mar 06, 2026)
- Obiettivo: correggere i finding di sicurezza confermati senza rompere i flussi esistenti lato member, org-admin, super-admin, affiliazione, wallet e integrazioni.
- Scope:
  - backend: secret/bootstrap hardening, trusted proxy logic, webhook signature validation, chiusura path legacy admin, esposizione pubblica upload solo per asset safe;
  - frontend: rimozione esposizioni accidentali di token/public token/dati sensibili non necessari in UI;
  - test/docs: regressioni security e aggiornamento review finale.
- Vincoli:
  - mantenere funzionanti download autenticati documenti/statuti e asset wallet/logo pubblici necessari;
  - non rompere il dev locale con default insicuri, ma bloccare/neutralizzare il comportamento per deployment non-local.

## Plan (Security hardening end-to-end - Mar 06, 2026)
- [x] Hardening config/runtime: distinguere ambiente locale vs non-locale, bloccare secret/bootstrap insicuri fuori locale.
- [x] Hardening rete/auth: fidarsi di `X-Forwarded-For` solo tramite proxy trusted; chiudere login legacy `/admin`.
- [x] Hardening file exposure: rimuovere mount pubblico generico `/uploads` e introdurre serving pubblico limitato ai soli asset wallet/org necessari.
- [x] Hardening webhook: validare firma Twilio sul bot WhatsApp senza rompere i test.
- [x] Frontend sweep: rimuovere visualizzazione di token/public token e verificare che non vengano persistiti o mostrati dati riservati inutilmente.
- [x] Aggiungere/aggiornare test security + build frontend + pytest mirati e documentare review finale.

## Review (Security hardening end-to-end - Mar 06, 2026)
- Backend hardening completato:
  - `app/main.py` ora blocca startup non-local con `SECRET_KEY` insicuro e sostituisce il mount generico `/uploads` con un allowlist pubblico;
  - `app/bootstrap.py` non crea più un super-admin con credenziali di default fuori ambiente locale;
  - `app/middleware.py` accetta `X-Forwarded-For` solo da peer trusted (loopback/private), riducendo spoofing su rate limit e audit;
  - `app/routes/admin.py` e `app/routes/super_admin.py` limitano i login a `SUPER_ADMIN` attivi e non cancellati;
  - `app/routes/whatsapp.py` valida la firma Twilio quando `TWILIO_AUTH_TOKEN` è configurato.
- Esposizione file/token ridotta senza rompere i flussi esistenti:
  - nuovo handler `app/public_uploads.py` consente solo asset pubblici già necessari (`/uploads/org/<id>/wallet/*` e `/uploads/affiliation-videos/*`);
  - `app/routes/affiliation.py` non restituisce più `public_token`/`resume_url` nelle view super-admin e introduce `payment_config.reference_code`;
  - `frontend/src/pages/Affiliazione.tsx` mostra il riferimento pagamento al posto del token completo;
  - `frontend/src/pages/super-admin/SuperAdminAffiliations.tsx` non mostra più il token pubblico.
- Sweep frontend:
  - nessuna chiave API/Twilio/OpenAI/Google Wallet hardcodata o mostrata nel bundle sorgente `frontend/src`;
  - restano solo token funzionali nei flussi URL-based necessari (magic link, resume draft, card verification);
  - resta visibile la raw integration key one-time nel pannello super-admin dedicato, perché fa parte del flusso intenzionale di provisioning privilegiato e non di esposizione accidentale.
- Verifiche eseguite:
  - `python -m pytest -q tests/test_security_hardening_audit.py tests/test_affiliation_flow.py` -> `18 passed`
  - `npm --prefix frontend run build` -> OK
  - grep frontend su pattern sensibili -> nessuna esposizione accidentale residua rilevata.

## Spec (Post-fix smoke verification - Mar 06, 2026)
- Obiettivo: verificare che il batch di hardening security non abbia rotto i flussi esplicitamente sensibili per il progetto.
- Scope:
  - login con mail / magic link member e org-admin;
  - flussi tessera (verify/download) e asset wallet;
  - backend/API che alimenta `/pienissimo/thank-you/{org-slug}` e route SPA dedicata;
  - bot WhatsApp, inclusa la nuova validazione firma.

## Plan (Post-fix smoke verification - Mar 06, 2026)
- [x] Mappare test esistenti per i flussi richiesti.
- [x] Eseguire smoke suite pytest mirata sui path funzionali impattati o adiacenti alle modifiche.
- [x] Documentare esito, copertura effettiva e limiti residui.

## Review (Post-fix smoke verification - Mar 06, 2026)
- Smoke suite eseguita:
  - `python -m pytest -q tests/test_email_flows.py tests/test_member_card_verification.py tests/test_ingest_pienissimo.py tests/test_spa_static_files.py tests/test_whatsapp_bot.py tests/test_org_admin_statute_upload.py::test_org_admin_wallet_assets_upload_accepts_logo_and_hero tests/test_security_hardening_audit.py::test_whatsapp_webhook_rejects_invalid_signature_when_configured`
  - risultato: `30 passed`
- Flussi verificati:
  - login con mail/magic link member e org-admin -> OK (`tests/test_email_flows.py`);
  - tessere verify/download e route wallet correlate -> OK (`tests/test_member_card_verification.py`);
  - asset wallet pubblici `/uploads/org/<id>/wallet/*` dopo hardening upload -> OK (`tests/test_org_admin_statute_upload.py::test_org_admin_wallet_assets_upload_accepts_logo_and_hero`);
  - API ingest/Pienissimo che restituisce `card_verification_token`, `card_download_url` e payload thank-you -> OK (`tests/test_ingest_pienissimo.py`);
  - route SPA `/pienissimo/thank-you/:orgSlug` -> OK (`tests/test_spa_static_files.py`);
  - bot WhatsApp e parsing form/json -> OK (`tests/test_whatsapp_bot.py`);
  - blocco richieste WhatsApp con firma invalida quando Twilio auth token è configurato -> OK (`tests/test_security_hardening_audit.py::test_whatsapp_webhook_rejects_invalid_signature_when_configured`).
- Limiti residui:
  - nessun test live contro Twilio reale o browser manuale sulla pagina thank-you; la verifica resta comunque buona lato backend + route SPA + test funzionali esistenti.

## Spec (Affiliation wizard + member signup smoke verification - Mar 06, 2026)
- Obiettivo: verificare che il batch security non abbia rotto il wizard iscrizione associazioni e il flusso iscrizione soci.
- Scope:
  - wizard affiliazione: draft, submit, review/admin visibility, referral flow;
  - iscrizione soci: join multipart, web register, auto-approve/auto-issue, payment method, fiscal code, optional docs, cleanup multiorg.

## Plan (Affiliation wizard + member signup smoke verification - Mar 06, 2026)
- [x] Mappare test esistenti sui due flussi.
- [x] Eseguire suite pytest mirata sui test funzionali di affiliazione e signup.
- [x] Distinguere eventuali failure funzionali da test brittle di copy/UI statica.

## Review (Affiliation wizard + member signup smoke verification - Mar 06, 2026)
- Suite completa lanciata:
  - `python -m pytest -q tests/test_affiliation_flow.py tests/test_referral_system.py tests/test_smoke.py tests/test_signup_fixes.py tests/test_join_auto_issue.py tests/test_payment_method_join.py tests/test_signup_fiscal_code.py tests/test_optional_identity_document.py tests/test_deleted_member_cleanup_multiorg.py`
  - esito: `71 passed, 1 failed`
- Failure isolata:
  - `tests/test_smoke.py::test_affiliazione_payment_ui_contains_stripe_disabled_label`
  - causa: assertion statica su una copy precisa della UI Stripe nel file `frontend/src/pages/Affiliazione.tsx`, non su comportamento runtime del wizard.
- Verifica funzionale ripetuta escludendo quel test brittle:
  - `python -m pytest -q tests/test_affiliation_flow.py tests/test_referral_system.py tests/test_smoke.py tests/test_signup_fixes.py tests/test_join_auto_issue.py tests/test_payment_method_join.py tests/test_signup_fiscal_code.py tests/test_optional_identity_document.py tests/test_deleted_member_cleanup_multiorg.py -k "not affiliazione_payment_ui_contains_stripe_disabled_label"`
  - risultato: `71 passed, 1 deselected`
- Copertura verificata:
  - wizard affiliazione -> OK (`tests/test_affiliation_flow.py`, `tests/test_referral_system.py`);
  - iscrizione soci web/join/register -> OK (`tests/test_signup_fixes.py`, `tests/test_join_auto_issue.py`, `tests/test_payment_method_join.py`, `tests/test_signup_fiscal_code.py`, `tests/test_optional_identity_document.py`, `tests/test_deleted_member_cleanup_multiorg.py`);
  - smoke base route/join/auth -> OK (`tests/test_smoke.py`, esclusa solo la check testuale sulla copy Stripe).

## Spec (Dashboard card + login shell + public navbar UX - Mar 06, 2026)
- Obiettivo: correggere tre regressioni UX senza toccare logica non necessaria.
- Scope:
  - aumentare la leggibilita della tessera in area socio mantenendo flip e responsive;
  - centrare verticalmente la pagina login con footer pubblico stabile in fondo;
  - mostrare "Dashboard" al posto di "Login" nelle navbar pubbliche quando `whoami` segnala sessione autenticata.

## Plan (Dashboard card + login shell + public navbar UX - Mar 06, 2026)
- [x] Mappare i componenti reali coinvolti e la source of truth auth frontend.
- [x] Applicare fix UI mirati a tessera dashboard e layout login pubblico.
- [x] Aggiornare la navbar pubblica con CTA `Dashboard` role-aware.
- [x] Eseguire build frontend e documentare esito/regressioni residue.

## Review (Dashboard card + login shell + public navbar UX - Mar 06, 2026)
- Tessera socio ampliata nel blocco dashboard aumentando la larghezza utile del wrapper card e riequilibrando il rapporto testo/card, senza toccare flip, contenuti o integrazione Google Wallet.
- Pagina login pubblica riallineata con shell verticale piu robusta: maggiore offset sotto navbar fixed, contenuto centrato nello spazio disponibile e footer pubblico stabile in fondo grazie a `public-shell`/`public-main` elastici.
- Navbar pubblica resa auth-aware usando `fetchWhoAmI()` come source of truth reale del frontend: se la sessione esiste, il link `Login` diventa `Dashboard` e usa `redirect_to` del backend per puntare al pannello corretto (socio, org-admin, super-admin).
- Verifica: `npm --prefix frontend run build` -> OK.

## Review Addendum (Dashboard card correction - Mar 06, 2026)
- Corretto il fix precedente sulla sezione `La tua tessera`: il problema non era solo nella colonna destra ma nel fatto che `MemberCardPreview` non occupava realmente tutta la larghezza disponibile del suo slot.
- La sezione ora usa una griglia desktop bilanciata con colonna testo ampia e colonna tessera dedicata; la tessera cresce tramite `max-width` del componente reale, non tramite allargamento artificiale del wrapper esterno.
- `MemberCardPreview` ora forza `w-full` sul root, cosi fronte e retro scalano davvero insieme fino alla larghezza assegnata.

## Review Addendum (Dashboard text rebalance - Mar 06, 2026)
- Lasciata invariata la dimensione della tessera nella colonna destra.
- Riequilibrata la composizione desktop dando piu spazio minimo alla colonna testo tramite `minmax(...)`, senza allargare casualmente la sezione.
- Titolo e paragrafo ora hanno una larghezza naturale, e la CTA Google Wallet e stabilizzata in orizzontale con `inline-flex` e `whitespace-nowrap`.

## Review Addendum (Dashboard outer wrapper width - Mar 06, 2026)
- Lasciati invariati dimensione tessera, testo e layout interno.
- Allargato solo il contenitore esterno della sezione sui breakpoint desktop con margini negativi controllati, cosi la sezione dispone dello spazio necessario entro il dashboard shell.
- Obiettivo: evitare il taglio della tessera sul lato destro senza alterare la composizione interna gia approvata.

## Review Addendum (Dashboard outer wrapper width v2 - Mar 06, 2026)
- Il primo allargamento del wrapper era ancora insufficiente rispetto alla combinazione `sidebar + gap + content width` del dashboard.
- Aumentato ulteriormente solo il respiro orizzontale del contenitore esterno ai breakpoint desktop (`xl`/`2xl`), lasciando immutati tessera, testo e composizione interna.

## Review Addendum (Dashboard outer wrapper width v3 - Mar 06, 2026)
- Il requisito e stato reso esplicito: box esterno circa `20%` piu largo a desktop.
- Sostituiti i tweak incrementali in `rem` con widening percentuale diretto del contenitore (`120%` con compensazione simmetrica), lasciando invariati tessera e contenuto interno.

## Review Addendum (Dashboard shell width correction - Mar 06, 2026)
- Il widening sul solo wrapper figlio non era percepibile perché il vero vincolo era il `main` del dashboard.
- Corretto il punto giusto: il shell del dashboard member ora e piu largo (`max-w-[90rem]`) e la sezione tessera torna a larghezza normale, cosi il box risulta davvero piu ampio a schermo senza hack di overflow.

## Review Addendum (Dashboard shell width correction v2 - Mar 06, 2026)
- Il valore `90rem` restava ancora insufficiente rispetto allo spazio richiesto dalla sezione tessera.
- Il shell del dashboard member e stato ampliato ulteriormente a `max-w-[100rem]`, mantenendo invariati contenuto interno e card.

## Spec (Super Admin / Org Admin documenti e contabilità - Mar 06, 2026)
- Obiettivo: introdurre il modulo documenti condivisi tra Super Admin e Org Admin con separazione `general` / `accounting`, senza notifiche o email automatiche in questa fase.
- Scope:
  - flag persistente `accounting_enabled` sull'associazione;
  - upload documento master + assegnazioni a una/molte/tutte associazioni o sole associazioni con contabilità attiva;
  - archivio invii lato Super Admin;
  - tab `Documenti` e `Contabilità` lato Org Admin con filtri coerenti col flag e con i permessi;
  - migrazioni, permessi backend, API frontend e UI base coerente con le dashboard esistenti.

## Plan (Super Admin / Org Admin documenti e contabilità - Mar 06, 2026)
- [x] Mappare modelli, storage file, route Super Admin / Org Admin e pattern già esistenti per documenti/upload.
- [x] Aggiungere schema DB + migrazione per `accounting_enabled`, documenti master e assegnazioni.
- [x] Implementare endpoint/backend con validazione permessi e destinatari accounting.
- [x] Integrare frontend Super Admin e Org Admin con tab, form upload e liste documenti.
- [x] Verificare con test/build mirati e documentare l'esito.

## Review (Super Admin / Org Admin documenti e contabilità - Mar 06, 2026)
- Backend:
  - aggiunto `organizations.accounting_enabled` con default `false`;
  - introdotte le tabelle `organization_shared_documents` e `organization_shared_document_assignments`;
  - nuovi endpoint Super Admin per target list, upload/invio documento, archivio, dettaglio e download;
  - nuovi endpoint Org Admin per lista documenti assegnati per `kind` e download privato;
  - validazione backend che blocca documenti `accounting` verso associazioni senza `accounting_enabled`;
  - bootstrap dev/test reso resiliente su DB SQLite legacy tramite `init_db.py` (nuova colonna + nuove tabelle idempotenti).
- Frontend:
  - nuova sezione `Documenti` nel Super Admin con form upload + archivio invii;
  - toggle `Contabilità attiva` nel modal gestione associazione Super Admin;
  - nuove tab Org Admin `Documenti` e `Contabilità` con gating sul flag `accounting_enabled`;
  - navbar Org Admin resa dinamica senza toccare i flussi auth esistenti.
- Verifiche:
  - `python -m pytest -q tests/test_org_shared_documents.py` -> `4 passed`
  - `python -m pytest -q tests/test_org_admin_statute_upload.py tests/test_super_admin_organizations_pagination.py` -> `7 passed`
  - `npm --prefix frontend run build` -> OK

## Review Addendum (Accounting migration Postgres fix - Mar 07, 2026)
- Root cause: la migration `g2h3i4j5k6l7` assumeva che `organizations.accounting_enabled` fosse gia `BOOLEAN`, ma su alcuni ambienti Postgres legacy la colonna esisteva come `INTEGER`.
- Fix: la migration ora rileva il tipo reale della colonna, porta eventuali `NULL` a `0`, rimuove il default legacy e in Postgres converte esplicitamente a boolean con `postgresql_using="COALESCE(accounting_enabled, 0) <> 0"` prima di eseguire l'update a `FALSE`.
- Verifica: parsing Python della migration con `python -m py_compile alembic/versions/g2h3i4j5k6l7_add_org_documents_and_accounting_flag.py` -> OK.

## Spec (Org Admin notifications + email alerts - Mar 07, 2026)
- Obiettivo: estendere il modulo documenti/contabilita con notifiche in-app persistenti per Org Admin e invio email via worker outbox gia esistente.
- Scope:
  - campanellina notifiche in header Org Admin con badge unread e pannello lista;
  - notifiche per documento `general`, documento `accounting` e alert tessere < 50;
  - persistenza DB notifiche con mark-as-read e routing verso `Documenti`, `Contabilità`, `Tessere`;
  - invio email asincrono a tutti gli Org Admin attivi dell'associazione;
  - anti-duplicazione robusta del low-stock con reset quando si torna sopra soglia.

## Plan (Org Admin notifications + email alerts - Mar 07, 2026)
- [x] Mappare worker email, low-stock job, header Org Admin e punti di trigger dei documenti.
- [x] Aggiungere schema DB e backend notifiche con API read/read-all/unread-count.
- [x] Integrare trigger documento + low-stock con creazione notifiche e queue email.
- [x] Implementare campanellina premium nell'header Org Admin e collegare i link di navigazione.
- [x] Verificare con test backend mirati e build frontend, poi documentare l'esito.

## Review (Org Admin notifications + email alerts - Mar 07, 2026)
- Backend:
  - aggiunta la tabella persistente `org_admin_notifications` con stato read/unread, target route e timestamp per singolo Org Admin;
  - nuovi endpoint Org Admin per lista notifiche, conteggio unread, mark singolo e mark-all;
  - integrazione sul send documenti Super Admin che crea notifiche per `general`/`accounting` e accoda email via outbox worker agli Org Admin attivi;
  - estensione del job low-cards per inviare notifiche + email sotto soglia `< 50`, con anti-duplicazione basata sul latch `last_low_cards_alert_at` e reset automatico quando il numero torna sopra soglia.
- Frontend:
  - nuova campanellina notifiche nell'header Org Admin con badge unread, dropdown lista, click-to-read e `Segna tutto letto`;
  - link coerenti verso `/org-admin/documenti`, `/org-admin/contabilita` e `/org-admin/tessere`.
- Verifiche:
  - `python -m pytest -q tests/test_org_admin_notifications.py tests/test_low_cards_alert_job.py tests/test_org_shared_documents.py tests/test_low_cards_scheduler.py tests/test_email_worker_low_cards_isolation.py` -> `17 passed`
  - `python -m py_compile app/models.py app/routes/org_admin.py app/routes/super_admin.py app/services/low_cards_alerts.py app/services/org_admin_notifications.py alembic/versions/h3i4j5k6l7m8_add_org_admin_notifications.py` -> OK
  - `npm --prefix frontend run build` -> OK

## Review Addendum (Org Admin notification bell UX - Mar 07, 2026)
- La campanellina Org Admin ora enfatizza la presenza di notifiche non lette con beacon rosso pulsante, ring rosato e badge numerico piu evidente.
- Ogni notifica non letta puo essere chiusa singolarmente dal dropdown tramite `X` / azione `Chiudi`, senza aprire la sezione target; la chiusura usa l'endpoint di mark-as-read gia esistente.
- Apertura del dettaglio continua a marcare la notifica come letta e a navigare verso la sezione corretta.
- Verifica: `npm --prefix frontend run build` -> OK

## Review Addendum (Org Admin notification email recipients - Mar 07, 2026)
- Il recipient email e stato reso esplicito sul path notifiche: il sistema usa gli `AdminUser.email` degli Org Admin attivi dell'associazione, cioe le stesse credenziali login create/gestite dal Super Admin nella sezione `Amministratori`.
- Aggiunta normalizzazione/deduplica dei recipient e logging strutturato con `admin_ids` e `recipient_emails` su invio documento e alert low-cards, per rendere verificabile in produzione chi viene realmente messo in coda.
- Rafforzata la verifica automatica: nuovi test end-to-end drenano l'email worker in `EMAIL_MODE=test` e confermano che la consegna va alla mail login dell'Org Admin, non alla mail generica dell'associazione.
- Verifiche:
  - `python -m pytest -q tests/test_org_admin_notifications.py tests/test_low_cards_alert_job.py` -> `12 passed`
  - `python -m py_compile app/services/org_admin_notifications.py` -> OK

## Spec (Dashboard mobile bottom navigation - Mar 07, 2026)
- Obiettivo: rendere le dashboard ASSONAM piu simili a una web app su mobile con bottom navigation fissa, mantenendo invariata la navigazione desktop.
- Scope:
  - applicazione solo alle dashboard `Socio`, `Org Admin`, `Super Admin`;
  - componente condiviso con massimo 5 voci visibili e sheet `Altro` per azioni secondarie;
  - active state coerente con le route esistenti;
  - safe area / padding contenuto per evitare overlap con card, tabelle e CTA;
  - nessun cambiamento a backend, routing o landing pubblica.

## Plan (Dashboard mobile bottom navigation - Mar 07, 2026)
- [x] Ispezionare i layout dashboard Socio, Org Admin e Super Admin e annotare nav/azioni esistenti da replicare su mobile.
- [x] Implementare componente condiviso di mobile bottom navigation con voce Altro che apre bottom sheet.
- [x] Integrare la bottom nav nei tre layout dashboard con safe-area e padding contenuto, mantenendo desktop invariato.
- [x] Verificare build frontend e aggiornare tasks/todo.md con review del batch.

## Review (Dashboard mobile bottom navigation - Mar 07, 2026)
- Creato il componente condiviso [MobileDashboardNav.tsx](/C:/Users/edoar/OneDrive/Desktop/CODE/iscrizioni%20clienti/Iscrizioni_clienti/frontend/src/components/ui/MobileDashboardNav.tsx) con:
  - barra flottante mobile premium;
  - active state route-aware;
  - bottom sheet `Altro` con backdrop, chiusura e safe area;
  - supporto a link e azioni (`Esci`) senza cambiare il routing.
- Dashboard Socio:
  - sostituite su mobile le tabs top con bottom nav `Riepilogo`, `Profilo`, `Documenti`, `Esci`;
  - desktop invariato con sidebar attuale.
- Dashboard Org Admin:
  - bottom nav mobile con `Panoramica`, `Soci`, `Tessere`, `Documenti`, `Altro`;
  - nello sheet `Altro`: `Inviti`, `Associazione`, `Contabilità` solo se abilitata, `Rivedi guida`, `Torna al sito`, `Esci`;
  - top nav desktop mantenuta e nascosta sotto `md`.
- Dashboard Super Admin:
  - bottom nav mobile con `Associazioni`, `Affiliazioni`, `Documenti`, `Altro`;
  - nello sheet `Altro`: `Amministratori`, `Soci`, `Torna al sito`, `Esci`;
  - top nav desktop mantenuta e nascosta sotto `md`.
- Safe area:
  - aggiunta classe `dashboard-mobile-safe` per evitare che il contenuto finale venga coperto dalla barra.
- Verifica:
  - `npm --prefix frontend run build` -> OK

## Review Addendum (Org Admin notification dropdown mobile positioning - Mar 07, 2026)
- Corretto il menu notifiche Org Admin su mobile: prima il pannello era ancorato `absolute right-0` al bottone e su viewport stretti poteva uscire dal viewport a sinistra.
- Il dropdown ora su mobile usa positioning viewport-safe (`fixed left/right` sotto l'header mobile) e torna al posizionamento originale su `sm+`, quindi desktop resta invariato.
- Aggiunto anche un `max-height` responsive per evitare clipping verticale sui display bassi.
- Verifica: `npm --prefix frontend run build` -> OK

## Review Addendum (Low-cards threshold crossing rule - Mar 07, 2026)
- Root cause: il job low-cards considerava solo `remaining < 50`, quindi inviava alert anche alle associazioni che non avevano mai avuto almeno 50 tessere disponibili e risultavano da subito a `0` o comunque sotto soglia.
- Fix:
  - introdotto in [card_inventory.py](/C:/Users/edoar/OneDrive/Desktop/CODE/iscrizioni%20clienti/Iscrizioni_clienti/app/services/card_inventory.py) un helper bulk `get_total_cards_by_org(...)` per leggere la capacità totale provisionata dell'anno corrente;
  - il job in [low_cards_alerts.py](/C:/Users/edoar/OneDrive/Desktop/CODE/iscrizioni%20clienti/Iscrizioni_clienti/app/services/low_cards_alerts.py) ora scarta gli org con `total_capacity < 50`, quindi l'alert parte solo se l'associazione è stata davvero almeno a soglia e poi è scesa sotto;
  - mantenuto il reset già introdotto quando si torna sopra soglia, così il nuovo invio può ripartire solo dopo un nuovo attraversamento reale.
- Test aggiornati:
  - i casi low-cards che devono alertare ora usano batch iniziali `>= 50`;
  - aggiunta regressione esplicita per gli org sempre sotto soglia, che non devono creare né notifiche né email.
- Verifiche:
  - `python -m pytest -q tests/test_low_cards_alert_job.py tests/test_org_admin_notifications.py tests/test_low_cards_scheduler.py tests/test_email_worker_low_cards_isolation.py` -> `17 passed`
  - `python -m py_compile app/services/card_inventory.py app/services/low_cards_alerts.py` -> OK
- [x] Mappare tutti i popup browser/reload nelle dashboard Super Admin e Org Admin e definire i flussi da sostituire
- [x] Introdurre componenti frontend condivisi per modal, toast e button async state coerenti col tema ASSONAM
- [x] Sostituire confirm/prompt/alert/reload nei flussi CRUD dashboard senza rompere API o routing esistenti
- [x] Verificare build frontend e documentare il nuovo comportamento UX

## Spec (Dashboard UX without browser popups/reloads - Mar 07, 2026)
- Obiettivo: eliminare popup nativi browser e full page reload nelle dashboard Super Admin e Org Admin, introducendo una UX coerente con modali interni, toast globali e feedback asincrono dei bottoni.
- Scope:
  - sostituzione di `window.confirm`, `window.prompt`, `window.alert`, `location.reload` nei flussi dashboard rilevanti;
  - modali riusabili per conferma semplice e richiesta motivazione rifiuto;
  - toast globali per esiti success/error;
  - refetch mirato o update locale al posto di full refresh;
  - chiusura modali/pannelli con `X`, `ESC` e overlay quando coerente.

## Plan (Dashboard UX without browser popups/reloads - Mar 07, 2026)
- [x] Mappare tutti gli usi dashboard di confirm/prompt/alert/reload e i pattern UI gia presenti.
- [x] Implementare componenti condivisi minimi per modal, toast e action button async coerenti col tema.
- [x] Sostituire i flussi in Super Admin e Org Admin eliminando popup nativi e full reload.
- [x] Verificare build frontend, aggiornare review e ricontrollare regressioni UX principali.

## Review (Dashboard UX without browser popups/reloads - Mar 07, 2026)
- Creati componenti condivisi frontend per UX coerente nelle dashboard:
  - `ToastProvider` globale montato in `frontend/src/App.tsx`;
  - `ModalShell`, `ConfirmModal`, `PromptModal`, `AsyncActionButton` in `frontend/src/components/ui/`.
- Super Admin:
  - `frontend/src/pages/super-admin/SuperAdminAffiliations.tsx` non usa piu `window.confirm` / `window.prompt`; reject/modifiche/approve/delete bozza ora passano da modal interne con submit asincrono, toast e refresh mirato dei dati;
  - approvazione documento e verifica pagamento manuale mostrano stato loading/success/error sul bottone senza reload;
  - `frontend/src/pages/super-admin/components/OrganizationManageModal.tsx` sostituisce la conferma manutenzione annuale con `ConfirmModal` e aggiunge chiusura coerente via overlay/X/ESC ai pannelli principali;
  - `frontend/src/pages/super-admin/components/SuperAdminPienissimoIntegrationCard.tsx` sostituisce la conferma browser di disattivazione chiave con `ConfirmModal`, usa toast globali e mostra la raw key in un modal interno chiudibile con X/overlay.
- Org Admin:
  - `frontend/src/pages/org-admin/OrgAdminMemberDetail.tsx` elimina `confirm/alert` da decisione iscrizione e delete socio; ora usa modali interne, toast globali, action states e navigazione verso `/org-admin/soci` senza full reload;
  - `frontend/src/pages/org-admin/components/MemberDecisionPanel.tsx` usa `AsyncActionButton` per approve/reject con loading/success/error;
  - `frontend/src/pages/org-admin/components/RejectDocumentModal.tsx` ora usa `ModalShell`, quindi ha X, ESC e overlay close coerenti;
  - `frontend/src/pages/org-admin/OrgAdminDashboard.tsx` non usa piu `window.location.reload()` per il retry metriche.
- Dashboard socio:
  - `frontend/src/pages/dashboard/DashboardDocuments.tsx` sostituisce il reload completo con refetch mirato e usa toast globali per resubmit/statuto error.
- Verifiche:
  - `npm --prefix frontend run build` -> OK
  - grep sui path dashboard `frontend/src/pages/super-admin`, `frontend/src/pages/org-admin`, `frontend/src/pages/dashboard` -> nessun `window.confirm`, `window.prompt`, `window.alert`, `location.reload`

## Review Addendum (Residual frontend reload/navigation cleanup - Mar 07, 2026)
- `frontend/src/components/onboarding/ReviewGuideButton.tsx` non usa più `window.location.reload()`: dopo il reset backend/localStorage emette l'evento frontend `assonam:onboarding-reset`.
- `frontend/src/components/onboarding/OnboardingTour.tsx` ascolta quell'evento e riavvia Joyride in-place, senza buttare giù tutta la pagina.
- `frontend/src/components/ErrorBoundary.tsx` non usa più reload o hard navigation alla home: ora resetta internamente lo stato di errore, remounta il subtree figli e, sul comando `Torna alla home`, usa `history.pushState + popstate` per tornare alla root in SPA.
- Verifica:
  - `npm --prefix frontend run build` -> OK
  - grep frontend globale: nessun `window.confirm`, `window.prompt`, `window.alert`, `window.location.reload`, `location.reload`; restano solo navigazioni intenzionali via `window.location.href/assign` su flussi wallet/join esterni.

## Spec (Installable PWA + install prompt - Mar 07, 2026)
- Obiettivo: rendere ASSONAM installabile come PWA su browser compatibili, mantenendo invariata l'esperienza browser classica e senza introdurre caching rischioso su API, dashboard o sessioni.
- Scope:
  - integrazione PWA nel frontend Vite con `vite-plugin-pwa`;
  - manifest brandizzato ASSONAM con icone adeguate;
  - service worker conservativo con auto-update e caching limitato agli asset statici;
  - prompt/banner installazione leggero, dismissibile e non ripetitivo;
  - nessun impatto ai flussi auth/dashboard oltre all'installabilità.

## Plan (Installable PWA + install prompt - Mar 07, 2026)
- [x] Ispezionare entrypoint frontend, layout pubblico e asset esistenti per agganciare PWA e prompt senza toccare le dashboard.
- [x] Integrare `vite-plugin-pwa`, manifest e service worker con caching prudente e auto-update.
- [x] Aggiungere icone PWA coerenti col brand riusando gli asset pubblici esistenti.
- [x] Implementare banner/pill "Installa app" non invasivo con dismiss persistente e detection install state.
- [x] Verificare build frontend e output PWA generato senza regressioni evidenti.

## Review (Installable PWA + install prompt - Mar 07, 2026)
- Integrata la PWA Vite in modo conservativo:
  - `frontend/vite.config.ts` ora usa `vite-plugin-pwa` con manifest ASSONAM, `registerType: autoUpdate` e service worker prudente;
  - il runtime caching copre solo asset statici (`/assets/*.js|css`, immagini, font) e il fallback SPA esclude esplicitamente `/api`, `/member`, `/health`, `/version`;
  - nessuna cache runtime dedicata a API autenticate, dashboard o sessioni.
- Registrazione service worker:
  - `frontend/src/main.tsx` registra il SW solo in produzione e forza un check update al bootstrap.
- Metadati / installabilità:
  - `frontend/index.html` aggiunge `theme-color`, apple touch icon e capability meta per mobile web app;
  - aggiunte icone PWA dedicate in `frontend/public/` (`192`, `512`, `maskable`, `apple-touch-icon`) riusando il brand già presente.
- Prompt installazione:
  - nuovo componente `frontend/src/components/public/InstallAppPrompt.tsx`;
  - mostrato solo nel layout pubblico tramite `frontend/src/components/Layout.tsx`, quindi non invade le dashboard;
  - usa `beforeinstallprompt` quando disponibile, fallback leggero su iOS Safari, dismiss persistente in `localStorage`, auto-hide se l'app è già installata.
- Verifiche:
  - `npm --prefix frontend run build` -> OK
  - output build generato: `frontend/dist/manifest.webmanifest`, `frontend/dist/sw.js`
  - controllo su `frontend/dist/sw.js`: fallback SPA denylist su `/api`, `/member`, `/health`, `/version`, nessuna runtime cache dedicata a endpoint sensibili.
## Association Email Sender Modes (Mar 09, 2026)
- [x] Analizzare flussi email esistenti e individuare tutti i punti che devono restare in `system` mode
- [x] Aggiungere schema dati associazione (migration Alembic, model `Organization`, bootstrap/repair se necessario)
- [x] Introdurre helper per mittente associazione e aggiornare servizio email/outbox con `mode=\"system\"|\"association\"` + fallback esplicito
- [x] Esporre e salvare le impostazioni email associazione negli endpoint org-admin senza regressioni sui payload esistenti
- [x] Aggiungere UI org-admin minimale con preview live, salvataggio pulito e feedback inline
- [x] Verificare con test mirati/backend+frontend build e documentare review finale

## Review (Association Email Sender Modes - Mar 09, 2026)
- Backend: aggiunte colonne `communications_enabled`, `sender_email_local_part`, `email_from_name_override`, `reply_to_email` a `organizations` con migration `a1c9e8f7b6d5` + repair path in `init_db.py`.
- Sender service: nuovo modulo `app/services/email_sender.py` con helper richiesti (`sanitize_email_local_part`, `generate_email_local_part_from_name`, `build_association_from_name`, `build_association_from_email`, `build_association_from_header`) e resolver esplicito `system`/`association`.
- Delivery: `app/utils.py` e `app/services/email_outbox.py` ora propagano `mode`, snapshot associazione, `reply_to`, logging del sender finale e fallback hard a `system`; il test capture salva anche `from_name`, `from_email`, `from_header`, `reply_to`, `selected_mode`, `fallback_used`.
- Flussi attivati in `association` mode: magic link socio da area org-admin, login magic link socio, email iscrizione/join org-specifiche, invito referral org-admin, email tessera attiva/pronta. Le mail istituzionali ASSONAM/org-admin/super-admin restano in `system` mode.
- API/UI: `GET/PATCH /api/org-admin/organization` espongono e salvano le nuove impostazioni, restituendo preview `system`/`association`; `frontend/src/pages/org-admin/OrgAdminSettings.tsx` aggiunge sezione dedicata con preview live, fallback visibility, loading state, bottone con check verde e toast interno.
- Documentazione: aggiornati `README.md` e `ENV_REQUIRED.md` con `EMAIL_FROM`, `MAIL_FROM_DOMAIN` e spiegazione `system` vs `association`.
- Verifiche OK: `python -m compileall app tests`; `python -m pytest -q tests/test_association_email_sender.py tests/test_email_flows.py tests/test_org_admin_send_access.py tests/test_integration_issue_member.py tests/test_join_auto_issue.py tests/test_ingest_pienissimo.py`; `npm --prefix frontend run build`.
- Rischio residuo preesistente: `python -m alembic heads` mostra gia due head (`a1c9e8f7b6d5`, `h3i4j5k6l7m8`) e `python -m alembic upgrade heads` fallisce su una migration legacy precedente (`m4n5o6p7q8r9`, colonna `members.deleted_at` assente su SQLite). Non e stato introdotto da questa modifica ma impedisce una verifica Alembic completa su DB SQLite vuoto.
## Org Admin Comunicazioni (Mar 09, 2026)
- [x] Mappare routing, modello dati e outbox attuali per integrare campagne email senza toccare il modulo tessere
- [x] Aggiungere schema DB per campagne e destinatari (migration Alembic, model SQLAlchemy, repair/bootstrap se necessario)
- [x] Implementare service/backend per audience estimate, test email, draft/send campaign e storico con recipient snapshot
- [x] Agganciare l'outbox esistente per aggiornare delivery status/error_message dei recipient e stato campagna
- [x] Aggiungere sezione dashboard org admin Comunicazioni con tab Impostazioni/Campagne/Storico e UX pulita
- [x] Eseguire verifiche mirate backend/frontend, aggiornare review e documentazione breve README

## Review (Org Admin Comunicazioni - Mar 09, 2026)
- Backend: aggiunte tabelle `email_campaigns` e `email_campaign_recipients` con migration `c6d7e8f9a0b1_add_email_campaign_tables.py`, modelli SQLAlchemy e bootstrap tabelle in `init_db.py`.
- Service: nuovo `app/services/email_campaigns.py` per audience estimate, draft, invio, recipient snapshot e stato campagna; `app/services/email_outbox.py` aggiorna recipient/campaign status su invio riuscito e fallimento permanente senza rompere i retry.
- API org-admin: nuovi endpoint `/api/org-admin/communications/*` per settings, test email, audience estimate, create/send campaign, list/detail campaign e recipients history.
- Frontend: nuova pagina `frontend/src/pages/org-admin/OrgAdminCommunications.tsx` con tab `Impostazioni`, `Campagne`, `Storico`, preview live sender, test email, save draft, send campaign, storico e dettaglio destinatari; route e navigazione aggiunte in `App.tsx` e `OrgAdminLayout.tsx`.
- Compatibilita: `system` mode e flussi tessere restano invariati; le campagne usano `association` mode e bloccano l'invio quando `communications_enabled=false`.
- Verifiche OK: `python -m compileall app`, `npm --prefix frontend run build`, `python -m pytest -q tests/test_org_admin_communications.py`, `python -m pytest -q tests/test_association_email_sender.py tests/test_org_admin_communications.py tests/test_org_admin_send_access.py tests/test_email_flows.py`.

## Template Library Comunicazioni (Mar 09, 2026)
- [x] Mappare integration points per template library su modello comunicazioni, seed e composer campagne
- [x] Aggiungere schema DB e model `email_templates` con seed iniziale template di sistema
- [x] Implementare service/backend per list/detail/create/update/duplicate/archive, available variables e render preview
- [x] Integrare la libreria template nella UI Comunicazioni con filtro, editor, preview e azione "usa nel composer"
- [x] Aggiornare composer campagne per caricare subject/body dal template selezionato senza rompere il flusso esistente
- [x] Eseguire verifiche mirate e aggiornare review/README

## Review (Template Library Comunicazioni - Mar 09, 2026)
- Schema/model: aggiunta tabella `email_templates` con migration `d7e8f9a0b1c2_add_email_templates.py`, model SQLAlchemy e relazioni su `organizations` e `admin_users`.
- Seed: introdotti 8 template di sistema ASSONAM (`Benvenuto nuovo socio`, `Iscrizione approvata`, `Tessera disponibile`, `Rinnovo quota in scadenza`, `Sollecito quota gentile`, `Convocazione assemblea`, `Documento disponibile`, `Avviso evento`) tramite migration e bootstrap `init_db.py`.
- Backend: nuovo service `app/services/email_templates.py` con variabili disponibili, rendering placeholder, fake preview context e normalizzazione body HTML/testo; nuovi endpoint `/api/org-admin/communications/templates*` per list/detail/create/update/duplicate/archive/variables/preview.
- Campagne: il sender campagne ora rende i placeholder per destinatario al momento dell'accodamento outbox, quindi `{{nome_socio}}`, `{{numero_tessera}}` e le altre variabili funzionano anche nel body scritto manualmente.
- Frontend: la pagina `OrgAdminCommunications.tsx` ora include il tab `Template`, filtro system/personalizzati, editor semplice, preview fake, duplica/archivia/usa, e il composer campagne permette di selezionare e caricare un template nella bozza.
- Verifiche OK: `python -m compileall app tests`, `npm --prefix frontend run build`, `python -m pytest -q tests/test_org_admin_communications.py tests/test_association_email_sender.py tests/test_org_admin_send_access.py tests/test_email_flows.py`.
- [x] Rimuovere la possibilita per org-admin di attivare/disattivare `communications_enabled`
- [x] Bloccare via backend tutte le azioni operative Comunicazioni quando il modulo non e attivo
- [x] Aggiungere controllo super-admin per attivare/disattivare il modulo Comunicazioni per associazione
- [x] Aggiornare UI org-admin con stato locked, badge e CTA disabilitate
- [x] Aggiornare UI super-admin lista associazioni con badge/toggle modulo Comunicazioni
- [x] Eseguire test/build mirati e documentare review

## Review (Modulo Comunicazioni super-admin only - Mar 09, 2026)
- `communications_enabled` resta un entitlement commerciale con default `false` e puo essere aggiornato solo dagli endpoint super-admin organizzazione.
- Gli endpoint org-admin operativi del modulo (`settings` write, test email, audience estimate, create/send campaign, create/update/duplicate/archive/preview template) ora rispondono `403` con messaggio uniforme quando il modulo non e attivo.
- La UI org-admin mostra badge `Non attivo`, stato locked e CTA disabilitate sia in `Comunicazioni` sia nella sezione email dell'area impostazioni associazione.
- La UI super-admin espone badge stato + toggle rapido per il modulo Comunicazioni nella lista associazioni, con feedback toast pulito.
- Verifiche eseguite: `python -m compileall app tests`, `python -m pytest -q tests/test_org_admin_communications.py tests/test_association_email_sender.py`, `npm --prefix frontend run build`.

- [x] Aggiungere `MAIL_FROM_DOMAIN` al workflow deploy Hetzner che scrive `.env`
- [x] Propagare `MAIL_FROM_DOMAIN` al runtime del backend via docker compose
- [x] Verificare localmente che workflow e compose includano la variabile e documentare review

## Review (MAIL_FROM_DOMAIN deploy propagation - Mar 09, 2026)
- Aggiunta la riga `MAIL_FROM_DOMAIN=${{ secrets.MAIL_FROM_DOMAIN }}` nel blocco `.env` generato dal workflow Hetzner, quindi il secret viene scritto sul server durante il deploy.
- Aggiunta la variabile `MAIL_FROM_DOMAIN: ${MAIL_FROM_DOMAIN}` in `x-app-env` di `docker-compose.yml`, che viene riusato da `web`, `email-worker` e `low-cards-worker`.
- Nessuna modifica a `SMTP_FROM` o `EMAIL_FROM`; il fix tocca solo il threading della nuova env.
- Verifiche locali: `rg -n "MAIL_FROM_DOMAIN" .github/workflows/deploy-hetzner.yml docker-compose.yml` e `docker compose config --no-interpolate | Select-String -Pattern 'MAIL_FROM_DOMAIN' -Context 1,1`.

## Communication sender mismatch fix (Mar 09, 2026)
- [x] Ispezionare endpoint test Comunicazioni, composer campagne e path SMTP reale per trovare dove il sender torna a `system`
- [x] Correggere il send path SMTP per usare il sender risolto in `association mode` anche come envelope sender e aggiungere logging esplicito
- [x] Aggiungere regressione test sul parametro `from_addr` inviato a SMTP ed eseguire verifiche mirate

## Review (Communication sender mismatch fix - Mar 09, 2026)
- Root cause: endpoint test e campagne accodavano gia `mode="association"`, ma `app/utils.py` passava sempre `settings.SMTP_FROM` a `server.sendmail(...)`, quindi l'envelope sender restava `no-reply@assonam.it`.
- Fix: il path SMTP usa ora `sender_selection.from_email` come envelope sender, allineato alla stessa logica `resolve_email_sender(...)` usata dalla preview UI e dal `From` header MIME.
- Logging: aggiunti campi espliciti prima dell'invio (`selected_mode`, `communications_enabled`, `mail_from_domain_present`, `from_name`, `from_email`, `from_header`, `fallback_used`).
- Verifiche: `python -m compileall app tests`; `python -m pytest -q tests/test_association_email_sender.py tests/test_org_admin_communications.py`.

## Communications transport Mailtrap refactor (Mar 10, 2026)
- [x] Mappare send path attuali (test email, campagne, worker/outbox) e aggiornare config minima per il token Mailtrap
- [x] Introdurre transport Mailtrap dedicato per `association` mode con supporto `reply_to`, attachment inline e classificazione errori provider
- [x] Rendere il test-email org-admin sincrono con esito reale e allineare worker/status recipient su `queued -> processing -> sent/failed`
- [x] Aggiornare FE minimale, test mirati e nota README/ENV sulle sole env `MAIL_FROM_DOMAIN` e `ASSOCIATION_MAIL_API_TOKEN`

## Review (Communications transport Mailtrap refactor - Mar 10, 2026)
- `system` mode continua a usare il path SMTP esistente senza modificare `SMTP_HOST/PORT/USER/PASSWORD`, `SMTP_FROM` o `EMAIL_FROM`.
- `association` mode ora usa un transport dedicato Mailtrap API (`POST https://send.api.mailtrap.io/api/send`) alimentato da `ASSOCIATION_MAIL_API_TOKEN` e `MAIL_FROM_DOMAIN`; se il sender non e realmente risolvibile in association mode, il resolver fa ancora fallback esplicito a `system`.
- L'endpoint org-admin `POST /api/org-admin/communications/test-email` non accoda piu soltanto: invia subito, ritorna `provider_message_id` e propaga al frontend gli errori reali provider/configurazione (`502` permanente, `503` retryable).
- Il worker/outbox mantiene la struttura esistente ma le email campaign recipient passano ora da `queued` a `processing` quando il job viene claimato, poi a `sent` o `failed`; gli errori Mailtrap `401/403/422` diventano failure permanenti e non restano in retry infinito.
- Supporto preservato per immagini inline/CID sui flussi association mode esistenti (es. email tessera) tramite attachments base64 inline nella chiamata Mailtrap API.
- Deploy/runtime allineati: aggiunta propagazione di `ASSOCIATION_MAIL_API_TOKEN` in `.github/workflows/deploy-hetzner.yml` e `docker-compose.yml`.
- Verifiche OK: `python -m compileall app tests`; `python -m pytest -q tests/test_association_email_sender.py tests/test_org_admin_communications.py`; `python -m pytest -q tests/test_email_flows.py tests/test_org_admin_send_access.py tests/test_integration_issue_member.py tests/test_join_auto_issue.py`; `npm --prefix frontend run build`.

## Forms module MVP (Mar 10, 2026)
- [x] Mappare router, layout admin e routing pubblico esistenti per integrare il modulo Form senza pagine statiche duplicate
- [x] Aggiungere migration Alembic e modelli SQLAlchemy per `forms`, `form_fields` e `form_submissions`
- [x] Implementare API org-admin per CRUD form/campi, duplicate, activate/deactivate, submissions list/detail ed export CSV
- [x] Implementare API pubbliche `GET /api/forms/{slug}` e `POST /api/forms/{slug}/submit` con validazione payload e notifiche email base
- [x] Aggiungere UI org-admin builder/submissions ed esporre route pubblica dinamica frontend `/forms/:slug`
- [x] Eseguire verifiche mirate backend/frontend e aggiornare README con architettura `/forms/:slug`

## Review (Forms module MVP - Mar 10, 2026)
- Schema: aggiunte tabelle `forms`, `form_fields` e `form_submissions` con migration `e9f0a1b2c3d4_add_forms_module.py`, modelli SQLAlchemy e bootstrap idempotente in `init_db.py`.
- Backend org-admin: nuovi endpoint `/api/org-admin/forms*` per CRUD form, CRUD campi, duplicate, activate/deactivate, storico risposte, dettaglio submission ed export CSV.
- Backend pubblico: nuova API dinamica `/api/forms/{slug}` e `/api/forms/{slug}/submit` con controllo `public` vs `members_only`, validazione campi richiesti, blocco su invii multipli e notifiche email base via `system mode`.
- Frontend admin: nuova pagina `OrgAdminForms.tsx` con lista form, editor configurazione, builder campi, storico risposte e export senza refresh brutti.
- Frontend pubblico: nuova pagina dinamica `PublicFormPage.tsx` collegata alla route unica `/forms/:slug`, con rendering campi da DB, errori inline e success state chiaro.
- Verifiche OK: `python -m compileall app tests init_db.py`, `python -m pytest -q tests/test_forms_module.py`, `npm --prefix frontend run build`.

## Forms + Comunicazioni integration refactor (Mar 10, 2026)
- [x] Mappare UI Comunicazioni/Form e punti backend da unificare senza rompere campagne/template/trasporto email esistenti
- [x] Aggiungere gating backend Form su `communications_enabled` e blocco coerente anche sui form pubblici
- [x] Estendere schema/model Form con azioni post-submit e collegamento ai template email
- [x] Collegare submit form a template admin/user e creare richiesta interna semplice quando configurato
- [x] Rifattorizzare IA/frontend Comunicazioni con sezioni chiare `Overview`, `Campaigns`, `Templates`, `Forms & automations`, `Sending settings`
- [x] Integrare i Form dentro Comunicazioni, migliorare UX template creation/filter/editor e rimuovere l'impressione di modulo isolato
- [x] Verificare build/test mirati e aggiornare review/README

## Review (Forms + Comunicazioni integration refactor - Mar 10, 2026)
- Backend: i form sono ora gated da `communications_enabled` sia lato org-admin sia sulla route pubblica `/api/forms/{slug}`, con messaggio coerente `I Form richiedono il modulo Comunicazioni attivo.`.
- Schema/model: il form supporta azioni post-submit minimali (`notify_admin_on_submit`, `send_user_confirmation`, `admin_notification_template_id`, `user_confirmation_template_id`, `create_internal_request`, `create_booking`) con migration dedicata `f0a1b2c3d4e5_add_form_action_settings.py`.
- Workflow submit: `app/services/forms.py` collega i form alla libreria template Comunicazioni per notifiche admin/conferme utente e crea una richiesta interna semplice via `OrgAdminNotification` quando configurato.
- IA frontend: `Comunicazioni` e stata rifattorizzata in `Overview`, `Campaigns`, `Templates`, `Forms & automations`, `Sending settings`; la route legacy `/org-admin/forms` ora reindirizza alla tab form di Comunicazioni.
- UX: i form usano stati locked coerenti con CTA disabilitate, la libreria template espone creazione da zero e filtri `all/system/custom/archived`, e il builder form mostra chiaramente i collegamenti ai template admin/user.
- Verifiche: `python -m pytest -q tests/test_forms_module.py tests/test_org_admin_communications.py tests/test_association_email_sender.py`; `npm --prefix frontend run build`.

## Forms visual builder redesign (Mar 10, 2026)
- [x] Estendere il modello Form con i soli campi visuali minimi per una pagina pubblica configurabile
- [x] Esporre i nuovi campi design via backend/API senza rompere i form esistenti
- [x] Ridisegnare la lista form con card, stato, conteggi e quick actions piu chiare
- [x] Riscrivere l'editor form come workspace a tab: `Builder`, `Design`, `Automazioni`, `Risposte`, `Condividi`
- [x] Implementare builder visuale con libreria campi, canvas centrale, pannello impostazioni e drag & drop nativo
- [x] Ridisegnare la pagina pubblica `/forms/:slug` per usare i settaggi visuali e sembrare una landing page/form reale
- [x] Eseguire verifiche mirate e aggiornare review/README

## Review (Forms visual builder redesign - Mar 10, 2026)
- Schema/model: il form ora salva anche il design della pagina pubblica (`accent_color`, `submit_button_text`, `show_logo`, `cover_image_url`, `page_style`) tramite migration `0b1c2d3e4f5a_add_form_design_fields.py`.
- Backend/API: i nuovi campi sono serializzati nei payload org-admin/public senza rompere il modello esistente dei form o il flusso submit.
- Frontend org-admin: `OrgAdminForms.tsx` e diventato uno studio visuale con card list, quick actions e workspace a tab `Builder`, `Design`, `Automazioni`, `Risposte`, `Condividi`.
- Builder: aggiunta libreria campi visiva, canvas centrale con riordino drag & drop nativo e pannello impostazioni focalizzato sul campo selezionato; la chiave tecnica resta secondaria e auto-generata.
- Public page: la route `/forms/:slug` usa ora una resa piu vicina a una landing page attraverso il componente condiviso `FormPublicCanvas`, riusato anche nella preview admin del tab Design.
- Verifiche: `python -m compileall app init_db.py alembic/versions/0b1c2d3e4f5a_add_form_design_fields.py`; `python -m pytest -q tests/test_forms_module.py tests/test_org_admin_communications.py`; `npm --prefix frontend run build`.
- [x] Riprodurre e correggere il `422` nel salvataggio form dentro `Comunicazioni > Pagine e moduli`
- [x] Unificare la UI forms di Comunicazioni sul workspace forms mantenuto, eliminando il vecchio hub duplicato
- [x] Portare il link pubblico al formato `/forms/{org-slug}/{form-slug}` mantenendo compatibilita legacy
- [x] Rendere piu chiari dettaglio risposte, destinazioni notifiche e preview finale del form
- [x] Aggiungere affordance rapida elimina form e verificare con test/build mirati

## Review (Forms in Comunicazioni hardening - Mar 10, 2026)
- Root cause del `422`: `Comunicazioni > Pagine e moduli` stava ancora usando il vecchio `PublicFormsHub`, che serializzava payload diverso dal workspace forms mantenuto e inviava campi come `notification_email=""` senza normalizzazione coerente.
- Fix strutturale: `PublicFormsHub` ora e solo un wrapper del vero `OrgAdminFormsWorkspace`, quindi la UI live di Comunicazioni usa lo stesso builder mantenuto, gli stessi payload e lo stesso flusso di save/detail.
- URL pubblico: introdotto path preferito `/forms/:orgSlug/:slug` su frontend e backend, mantenendo compatibilita con la route legacy `/forms/:slug`; i payload form espongono ora anche `public_path`.
- UX forms: nel Builder sono visibili insieme contenuto pagina + canvas campi + preview finale; la share tab espone chiaramente il nuovo link con org slug; il dettaglio Risposte usa le label dei campi invece delle sole chiavi tecniche.
- Notifiche submit: le risposte restano sempre visibili nel sito e, se `notification_email` non e valorizzata, il backend fa fallback all'email del creator org-admin / primo org-admin attivo per l'invio notifica.
- Verifiche OK: `python -m compileall app tests/test_forms_module.py`; `python -m pytest -q tests/test_forms_module.py`; `npm --prefix frontend run build`.
## Forms bookings extension (Mar 10, 2026)
- [x] Estendere schema Form esistente con configurazione booking-enabled e aggiungere tabelle `bookings` + `booking_events`
- [x] Aggiornare model SQLAlchemy, bootstrap `init_db.py` e services forms/bookings senza duplicare il motore form
- [x] Integrare il submit pubblico per creare booking collegati a `form_submissions` quando il form e booking-enabled
- [x] Esporre API org-admin per configurazione booking sui form, list/detail/update bookings e agenda day/week
- [x] Estendere il builder forms con configurazione prenotazione e mapping campi dinamico
- [x] Aggiungere nuova sezione org-admin `Prenotazioni` con agenda/list/detail e stati aggiornabili
- [x] Eseguire test/build mirati e aggiornare README/review

## Review (Forms bookings extension - Mar 10, 2026)
- Il motore Forms e stato esteso, non duplicato: `forms` ora supporta `form_type`, `booking_enabled`, conferma manuale, mapping dinamico e override messaggio finale; `form_fields` e `form_submissions` restano le sorgenti canoniche del builder e del payload inviato.
- Il layer booking aggiunge solo `bookings` e `booking_events`: ogni submit pubblico salva sempre la submission e, se il form e booking-enabled, crea anche una prenotazione collegata con stato `pending` o `confirmed` in base alla configurazione del form.
- Backend org-admin: nuove API `GET /api/org-admin/bookings`, `GET /api/org-admin/bookings/{id}`, `PATCH /api/org-admin/bookings/{id}`, agenda day/week e dettaglio submission con booking collegato; tutto gated sullo stesso entitlement Forms/Comunicazioni.
- Frontend builder: il tab `Automazioni` del Form Studio consente ora di trasformare il form in prenotazione, mappare i campi dinamici (`customer_name`, `booking_date`, `party_size`, ecc.) e scegliere conferma/manuale + notifiche booking.
- Frontend operativo: nuova pagina `/org-admin/prenotazioni` con viste `Giorno`, `Settimana`, `Lista`, dettaglio laterale, timeline eventi e aggiornamento stato inline.
- Verifiche OK: `python -m compileall app tests init_db.py`; `python -m pytest -q tests/test_forms_module.py`; `npm --prefix frontend run build`.

## Prenotazioni & Agenda phase 2 (Mar 10, 2026)
- [x] Estendere schema e bootstrap con `rooms` e `room_tables`, riusando `bookings.room_id/table_id`
- [x] Aggiungere services/backend org-admin per CRUD sale, CRUD tavoli, stato mappa sala e assegnazione/disassegnazione prenotazioni
- [x] Introdurre controlli MVP su tavoli fuori servizio/inattivi e conflitti di assegnazione basilari
- [x] Estendere API client frontend per sale, tavoli, stato mappa e update booking con room/table
- [x] Ridisegnare `Prenotazioni` con sezioni `Agenda`, `Sale`, `Tavoli`, `Mappa sala` mantenendo il layer booking esistente
- [x] Implementare mappa 2D visuale con drag & drop tavoli, stati occupazione e salvataggio coordinate
- [x] Integrare assegnazione manuale sala/tavolo nel dettaglio prenotazione e rifletterla nella mappa
- [x] Eseguire test/build mirati e aggiornare review + README

## Review (Prenotazioni & Agenda phase 2 - Mar 10, 2026)
- Schema/model: aggiunte le tabelle `rooms` e `room_tables` con migration `2d3e4f5a6b7c_add_booking_rooms_and_tables.py`; `Booking.room_id` e `Booking.table_id` ora puntano al nuovo layer sale/tavoli senza duplicare forms o submissions.
- Bootstrap/dev safety: `init_db.py` crea e ripara in modo idempotente `rooms`, `room_tables` e relative colonne/flag, mantenendo coerente l'avvio locale su DB gia esistenti.
- Backend org-admin: nuovi endpoint per CRUD sale, CRUD tavoli, mappa sala (`GET/PUT /api/org-admin/rooms/{room_id}/map`) e assegnazione/disassegnazione prenotazioni (`POST/DELETE /api/org-admin/bookings/{id}/assignment`).
- Service layer: `app/services/booking_rooms.py` normalizza forme/capienze/coordinate, calcola lo stato occupazione (`free`, `reserved`, `occupied`, `out_of_service`) e blocca assegnazioni a tavoli inattivi, fuori servizio o gia occupati nella stessa fascia.
- Frontend: `OrgAdminBookings.tsx` e stato rifattorizzato in un workspace con sezioni `Agenda`, `Sale`, `Tavoli`, `Mappa sala`; la mappa 2D usa `RoomFloorMap.tsx` con drag & drop manuale e salva le coordinate reali dei tavoli.
- Integrazione booking: il dettaglio prenotazione ora mostra sala/tavolo risolti per nome, permette assegnazione manuale e aggiorna mappa/agenda sulla stessa sorgente dati.
- Verifiche OK: `python -m compileall app init_db.py tests/test_forms_module.py`; `python -m pytest -q tests/test_forms_module.py`; `npm --prefix frontend run build`.
## UX hardening Forms + Prenotazioni (Mar 10, 2026)
- [x] Riesaminare UX/UI di Forms, Prenotazioni, Comunicazioni e pagina pubblica del form rispetto all'obiettivo "sellable feature"
- [x] Correggere micro-copy, testi corrotti, gerarchia visiva e stati/CTA poco chiari nei workspace admin
- [x] Rifinire esperienza pubblica del form e la percezione end-to-end tra builder, condivisione, risposte e prenotazioni
- [x] Eseguire build/test mirati e documentare un report finale completo di funzionamento

## Review (UX hardening Forms + Prenotazioni - Mar 10, 2026)
- Audit UX eseguito su `Comunicazioni > Pagine e moduli`, `Form Studio`, `Prenotazioni & Agenda`, `Mappa sala` e route pubblica `/forms/:orgSlug/:slug`, tenendo come priorita chiarezza operativa, gerarchia visiva e percezione "pagina reale".
- `OrgAdminForms.tsx`: il workspace e stato rifinito nei punti piu ambigui del journey, con CTA primaria coerente (`Salva il form`), affordance di eliminazione piu netta, riepilogo risposte piu chiaro e dettaglio che spiega dove finisce ogni submit (backoffice + eventuale segreteria).
- `OrgAdminBookings.tsx`: agenda e dettaglio prenotazione ora mostrano meglio origine, note e assegnazione; nella gestione tavoli/mappa gli stati sono leggibili in linguaggio umano (`Libero`, `Riservato`, `Occupato`, `Fuori servizio`) e la selezione tavolo e piu informativa.
- `RoomFloorMap.tsx`: aggiunti hint espliciti di interazione e una legenda visuale coerente con gli stati del layer booking, per far sembrare la mappa uno strumento operativo e non solo tecnico.
- `PublicFormPage.tsx`: la pagina pubblica e stata incorniciata come vera landing/form page con blocchi introduttivi sopra il canvas, cosi l'utente capisce subito contesto, visibilita e cosa succede dopo l'invio.
- Comunicazioni generale riesaminato: la struttura tab esistente resta coerente; il beneficio principale arriva dal fatto che `Pagine e moduli` eredita ora un builder/preview piu comprensibile e una route pubblica piu "vendibile".
- Verifiche eseguite: `npm --prefix frontend run build`; `python -m pytest -q tests/test_forms_module.py`; `python -m pytest -q tests/test_org_admin_communications.py tests/test_forms_module.py`.

## Agenda calendar refactor (Mar 10, 2026)
- [x] Trasformare la vista Agenda di Prenotazioni in un calendario mensile visuale con navigazione mese/anno
- [x] Mostrare le prenotazioni direttamente nelle caselle giorno e aprire il dettaglio tramite popup/modal
- [x] Alleggerire la UI rimuovendo gli header ridondanti da Prenotazioni e Comunicazioni
- [x] Eseguire build frontend e documentare la review finale del refactor

## Review (Agenda calendar refactor - Mar 10, 2026)
- `OrgAdminBookings.tsx`: la vista `Agenda` non usa piu il vecchio switch `giorno/settimana/lista`, ma un calendario mensile visuale con caselle reali, badge giornalieri, booking cards compatte e navigazione esplicita mese/anno.
- Ogni giorno apre un popup operativo coerente con il design system tramite `ModalShell`: lista prenotazioni della giornata a sinistra, dettaglio/stato/assegnazione sala-tavolo a destra, senza affollare il calendario.
- La UI prenotazioni ora tratta la timeline mensile come elemento principale del prodotto e non come filtro secondario; il messaggio in pagina spiega subito che il click sulla casella apre il layer operativo.
- `OrgAdminCommunications.tsx`: rimosso l'header hero ridondante (`Spazio Comunicazioni` + card stato org) per lasciare il focus direttamente sui tab e sul contenuto utile.
- Header inutile rimosso anche nel flusso prenotazioni: resta solo il blocco tab/metriche necessario a navigare `Agenda`, `Sale`, `Tavoli`, `Mappa sala`, mentre il vero header della pagina e ora il calendario stesso.
- Verifica eseguita: `npm --prefix frontend run build`.

## Forms create 422 fix (Mar 10, 2026)
- [x] Riprodurre il 422 nella creazione form da `Comunicazioni > Pagine e moduli`
- [x] Correggere il draft iniziale e la validazione client per evitare submit vuoti verso l'API
- [x] Eseguire build frontend e aggiornare review/lessons

## Review (Forms create 422 fix - Mar 10, 2026)
- Root cause: il workspace forms apriva un draft completamente vuoto; se l'org admin cliccava subito `Salva il form`, il frontend inviava la create request e il backend rispondeva correttamente `422` per `title` mancante.
- `OrgAdminForms.tsx`: `Nuovo form` ora apre un draft gia seedato con titolo/slug iniziali (`Nuovo form`), quindi il percorso minimo di creazione non parte piu da uno stato invalido.
- `OrgAdminForms.tsx`: aggiunta anche una guardia client-side su `handleSaveForm(...)`; se il titolo viene svuotato manualmente, il submit viene bloccato prima della chiamata API con toast chiaro invece del 422 backend.
- Verifica eseguita: `npm --prefix frontend run build`.

## Manual booking 500 fix (Mar 10, 2026)
- [x] Riprodurre il 500 nella creazione prenotazione manuale da `Prenotazioni -> Agenda`
- [x] Correggere la route/backend di creazione manuale senza toccare i flussi booking esistenti
- [x] Aggiungere una verifica automatica del path manuale e rieseguire i test mirati
- [x] Allineare il refresh/sync della Mappa sala 2D con prenotazioni create o assegnate dall'agenda

## Review (Manual booking 500 fix - Mar 10, 2026)
- Root cause: la route `POST /api/org-admin/bookings` usava un filtro legacy su `Room.deleted_at` e `RoomTable.deleted_at`, ma il layer `rooms/room_tables` non espone quei campi; il primo tentativo di prenotazione manuale con sala/tavolo generava quindi un `500`.
- `app/routes/org_admin.py`: rimossa la dipendenza da `deleted_at` e allineata la validazione al modello reale (`association_id`, `room_id`); aggiunta anche la guardia esplicita `table_id` senza `room_id` con `400` chiaro.
- `tests/test_forms_module.py`: nuovo test end-to-end per la creazione manuale da org-admin agenda, inclusa creazione sala/tavolo, `POST /api/org-admin/bookings` e verifica presenza della prenotazione nella lista agenda.
- Verifica aggiuntiva confermata: il flusso automatico `form pubblico booking-enabled -> submission -> booking -> agenda org-admin` continua a funzionare ed è coperto dai test `test_booking_enabled_form_creates_booking_and_exposes_agenda` e `test_booking_rooms_tables_and_assignment_flow`.
- `frontend/src/pages/org-admin/OrgAdminBookings.tsx`: agenda, dettaglio booking e Mappa sala ora condividono lo stesso contesto (`room_id`, `booking_date`, `booking_time`, `table_id`); quando creo, seleziono o assegno una prenotazione, la mappa si sposta sulla sala corretta e evidenzia subito il tavolo collegato.
- Verifica eseguita: `python -m pytest -q tests/test_forms_module.py -k "manual_booking_from_agenda or booking_rooms_tables_and_assignment_flow or booking_enabled_form_creates_booking_and_exposes_agenda"`.

## Public membership document requirement toggle (Mar 10, 2026)
- [x] Individuare model/config associazione, endpoint super-admin e flow pubblico iscrizione socio
- [x] Aggiungere flag per-associazione retrocompatibile con default `false` e propagarlo negli endpoint già esistenti
- [x] Validare lato backend il documento nel submit pubblico solo quando il flag è attivo
- [x] Aggiornare UI super-admin e pagina pubblica iscrizione con messaggi/toggle coerenti
- [x] Eseguire test/build mirati e documentare review finale

## Review (Public membership document requirement toggle - Mar 10, 2026)
- `organizations`: aggiunto il flag `require_membership_document` con default `false` in [app/models.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\models.py) e migration dedicata [4a5b6c7d8e9f_add_require_membership_document_flag.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\alembic\versions\4a5b6c7d8e9f_add_require_membership_document_flag.py), più repair path SQLite in `init_db.py` e `app/scripts/repair_sqlite.py`.
- Super admin: il flag è serializzato e patchabile negli endpoint già esistenti in [app/routes/super_admin.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\routes\super_admin.py); la UI lo espone nel modal associazione in [OrganizationManageModal.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\super-admin\components\OrganizationManageModal.tsx) con toggle e helper text dedicati.
- Pubblico: [app/routes/public.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\routes\public.py) include il nuovo flag nella response `/api/organizations/{slug}`, così [Iscrizione.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\Iscrizione.tsx) può aggiornare copy, badge, label e blocco inline del passaggio 2 senza cambiare il flow quando il flag è spento.
- Backend submit: [app/routes/join.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\routes\join.py) ora impone il documento solo se `require_membership_document=true`; se esiste già una submission pendente con documento identity, la resubmission resta valida anche senza ricaricarlo.
- Retrocompatibilità confermata: con toggle disattivo il documento resta facoltativo e il submit continua a funzionare come prima; il comportamento è coperto dai test `test_join_submit_without_identity_document_ok` e `test_join_submit_requires_identity_document_when_org_flag_enabled`.
- Verifiche eseguite: `python -m pytest -q tests/test_optional_identity_document.py tests/test_org_admin_communications.py`; `npm --prefix frontend run build`.

## Deploy workflow hardening for Docker builder snapshot failures (Mar 10, 2026)
- [x] Individuare il workflow SSH realmente usato in produzione
- [x] Inserire diagnostica Docker e prune sicuro della sola build cache prima della build
- [x] Separare rebuild `--no-cache` e `up -d --remove-orphans` senza toccare volumi o dati
- [x] Riesaminare il diff per confermare che non vengano eseguiti comandi distruttivi su Postgres o named volumes

## Review (Deploy workflow hardening for Docker builder snapshot failures - Mar 10, 2026)
- Workflow modificato: [.github/workflows/deploy-hetzner.yml](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\.github\workflows\deploy-hetzner.yml).
- Prima del rebuild il server esegue solo diagnostica e cleanup sicuro della build cache: `docker system df || true`, `docker builder ls || true`, `docker buildx ls || true`, `docker builder prune -af || true`, `docker buildx prune -af || true`.
- Il deploy non usa `docker system prune --volumes`, non usa `docker volume prune`, non usa `down -v` e non rimuove alcun volume database.
- Il rebuild ora è esplicito e pulito: `docker compose ... build --no-cache`, seguito da `docker compose ... up -d --remove-orphans`, mantenendo invariati connessione SSH, env, compose files e logica di health check video-worker.

## Stripe Connect demo integration (Mar 10, 2026)
- [x] Isolare un package backend `stripe_connect_demo` con config helper, StripeClient dedicato e service commentato
- [x] Estendere `organizations` con mapping connected account + status subscription e aggiungere tabella webhook idempotency
- [x] Aggiungere route org-admin, storefront demo e webhook Stripe separate dai flussi Stripe già esistenti
- [x] Aggiungere UI org-admin `/org-admin/billing`, route storefront demo e wiring capability/nav
- [x] Documentare env/runtime e verificare build frontend + test backend mirati

## Review (Stripe Connect demo integration - Mar 10, 2026)
- Backend isolato in `app/integrations/stripe_connect_demo/` con `config.py`, `client.py` e `service.py`: tutte le chiamate Stripe passano da `StripeClient`, la country usa `Organization.country` con fallback `IT`, `BASE_URL` demo usa fallback `https://assonam.it`, e i commenti chiariscono Accounts v2, direct charge e uso di `customer_account`.
- Persistenza minima: migration [6c7d8e9f0a1b_add_stripe_connect_demo_fields.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\alembic\versions\6c7d8e9f0a1b_add_stripe_connect_demo_fields.py), nuovi campi `organizations.stripe_connected_account_id / stripe_platform_subscription_status / stripe_platform_subscription_id` e tabella `stripe_webhook_events` con unique index su `event_id`.
- Route nuove: [app/routes/stripe_connect_demo.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\routes\stripe_connect_demo.py) per account status/onboarding/demo-products/platform subscription/storefront checkout e [app/routes/stripe_webhooks.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\routes\stripe_webhooks.py) per thin/billing webhooks con early-return idempotente.
- Frontend: nuova pagina org-admin [OrgAdminStripeDemoBilling.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminStripeDemoBilling.tsx), nav condizionale in [OrgAdminLayout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminLayout.tsx), storefront pubblico demo in [StripeDemoStorefrontPage.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\StripeDemoStorefrontPage.tsx) e result page dedicata.
- Contratti client aggiornati in [frontend/src/lib/api.ts](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\lib\api.ts) e capability runtime estesa con `stripeConnectDemoEnabled`.
- Documentazione aggiornata in [README.md](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\README.md) e [ENV_REQUIRED.md](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\ENV_REQUIRED.md), marcando sempre `demo` per evitare confusione con il futuro flusso quota associativa reale.
- Verifiche eseguite: `python -m compileall app init_db.py tests/test_stripe_connect_demo.py`; `python -m pytest -q tests/test_stripe_connect_demo.py`; `npm --prefix frontend run build`.

## Deploy env propagation for Stripe Connect demo (Mar 11, 2026)
- [x] Verificare che il workflow Hetzner scriva tutte le nuove env Stripe demo nella `.env` remota
- [x] Verificare che `docker-compose.yml` passi le stesse env ai container backend runtime
- [x] Correggere i gap di propagazione senza toccare altre secret o servizi

## Review (Deploy env propagation for Stripe Connect demo - Mar 11, 2026)
- Workflow corretto in [.github/workflows/deploy-hetzner.yml](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\.github\workflows\deploy-hetzner.yml): il blocco che genera `.env` sul server ora scrive anche `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_THIN_WEBHOOK_SECRET`, `STRIPE_BILLING_WEBHOOK_SECRET`, `STRIPE_PLATFORM_PRICE_ID`, `STRIPE_REQUIRE_PUBLISHABLE_KEY` e `ENABLE_STRIPE_CONNECT_DEMO`.
- Runtime corretto in [docker-compose.yml](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\docker-compose.yml): `x-app-env` ora passa anche `STRIPE_THIN_WEBHOOK_SECRET`, `STRIPE_BILLING_WEBHOOK_SECRET`, `STRIPE_PLATFORM_PRICE_ID` e `ENABLE_STRIPE_CONNECT_DEMO` a `web`, `email-worker` e `low-cards-worker`.
- Verifica eseguita con `rg -n "STRIPE_THIN_WEBHOOK_SECRET|STRIPE_BILLING_WEBHOOK_SECRET|STRIPE_PLATFORM_PRICE_ID|ENABLE_STRIPE_CONNECT_DEMO" .github/workflows/deploy-hetzner.yml docker-compose.yml`.
