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
- `npm run build` (frontend) OK (attivitÃ  socio + reset filtri)
- `python -m alembic upgrade head` OK (actor_member_id)
- `npm run build` (frontend) OK (legenda attività)
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
- [x] Add dashboard counters for “da rivedere” and “rigettati”
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

## Audit Log & AttivitÃ  Socio (Feb 02, 2026)
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
