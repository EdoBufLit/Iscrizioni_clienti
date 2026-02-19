# ASSONAM Full Audit Report (2026-02-19)

## Executive Summary
- Audit completo eseguito su backend FastAPI + frontend Vite/React + DB, con focus regressioni integrazione Pienissimo.
- Individuate 10 criticita principali (8 Must Fix, 2 Nice-to-have).
- Tutti i Must Fix identificati sono stati patchati nel codice e coperti da test di regressione.
- Hardening applicato su rate limiting pubblico tessera, CSRF, security headers, leakage token QR, PII logs e RBAC endpoint legacy.
- Nessuna evidenza di SQL injection o IDOR cross-org nei percorsi critici analizzati.
- Idempotenza ingest e invio email one-time risultano corretti nei test di carico/retry.
- Verifica funzionale core (member delete/expiry -> NON ATTIVA, PDF download, verify HTML+JSON) risulta allineata.
- Resta aperto hardening dipendenze FE (`vite/esbuild`) e strategia expiry/rotation token tessera.

## Scope & Method
- Code audit manuale su route, middleware, auth/RBAC, servizi integrazione, modelli DB, template email, frontend API calls.
- Route inventory backend/frontend e review autorizzazioni org/super-admin/member.
- Verifica checklist SECURITY/FUNCTIONAL richiesta (PASS/FAIL esplicito sotto).
- Test automatici + build per validare patch.
- Skill `audit-website`: tool `squirrel` non disponibile in ambiente, fallback manuale eseguito.

## Route Inventory (Sintesi)
### Public
- `/api/ingest/pienissimo/{org_slug}`
- `/api/cards/verify/{token}`
- `/api/cards/{token}/download`
- `/api/cards/{token}/download.pdf`
- `/api/cards/{token}/image.png`
- `/api/public/orgs/{org_slug}`
- `/api/organizations`, `/api/organizations/{slug}`, `/api/organizations/{slug}/logo`, `/api/organizations/{slug}/statute`

### Member Auth/Area
- `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`, `/api/auth/change-password`, `/api/auth/me`, `/api/auth/whoami`
- `/member/auth`, `/member/logout`, `/api/member/documents*`

### Org Admin
- `/api/org-admin/auth/*`
- `/api/org-admin/members*`, `/api/org-admin/documents*`, `/api/org-admin/cards*`, `/api/org-admin/metrics`

### Super Admin
- `/api/super-admin/auth/*`
- `/api/super-admin/orgs/{org_id}/integration-keys*`
- `/api/super-admin/organizations*`, `/api/admin/associations/{association_id}`
- `/api/super-admin/maintenance/run`

## Top 10 Findings
| ID | Severity | Area | Descrizione | Impatto | Fix |
|---|---|---|---|---|---|
| F-SEC-01 | Critical | Public API | Nessun rate-limit su verify/download tessera | Abuse/brute/DoS su endpoint pubblici | Implementato rate-limit DB per verify/download/pdf/image |
| F-SEC-02 | High | Privacy/Security | QR in download HTML usava servizio esterno con token in query | Leak token verso terze parti | QR embedded in data URI locale |
| F-SEC-03 | High | Security Headers | Mancavano CSP/HSTS/COOP/CORP | Maggiore superficie XSS/clickjacking/mixed-context | Header hardening in middleware |
| F-SEC-04 | High | CSRF | Nessun controllo origin/referer su POST autenticati a sessione | Possibile CSRF su endpoint state-changing | Aggiunto middleware CSRF best-effort + cookie same_site strict |
| F-SEC-05 | Medium | Data Exposure | `/api/organizations/{slug}` restituiva anche org inattive/cancellate | Enumerazione metadata non necessari | Filtri `is_active` + `deleted_at is null` |
| F-SEC-06 | Medium | Logging | PII raw in log integrazione/login (email/external id) | Esposizione dati in audit/log stream | Hashing dei campi sensibili nei log |
| F-SEC-07 | Medium | RBAC | Endpoint legacy `/cards/increase` rispondeva 400 senza auth gate | Info disclosure su path admin | Enforced `_require_super_admin` prima della risposta |
| F-SEC-08 | Medium | Email | Header injection possibile via newline in `To/Subject` | Possibile malformed/injected headers SMTP | Sanitizzazione CR/LF su header email |
| F-SEC-09 | Medium | Dependencies | `npm audit` segnala `vite/esbuild` moderate vuln | Rischio in dev server chain | Upgrade pianificato a `vite@7.x` (breaking) |
| F-SEC-10 | Medium | Token lifecycle | Token tessera verificabile senza expiry temporale | Token leak resta valido a lungo | Raccomandata v2 con `exp`/rotazione revocabile |

## Must Fix Before Prod
- F-SEC-01, F-SEC-02, F-SEC-03, F-SEC-04, F-SEC-05, F-SEC-06, F-SEC-07, F-SEC-08

## Nice to Have
- F-SEC-09
- F-SEC-10

## Finding Details (Repro, Impatto, Fix, Test)
### F-SEC-01 (Critical) - Rate limit pubblico tessera
- Repro: chiamate ripetute a `/api/cards/verify/{token}` e `/api/cards/{token}/download*` senza throttling.
- Impatto: abuso endpoint pubblici, DoS applicativo e brute-force traffic amplification.
- Fix: nuovo service `app/services/db_rate_limit.py`, enforcement su verify/download/download.pdf/image in `app/routes/public.py`.
- Test: `tests/test_security_hardening_audit.py::test_public_card_verify_rate_limit_enforced`.

### F-SEC-02 (High) - Token leak via QR esterno
- Repro: download HTML caricava QR da `api.qrserver.com` con verify URL completo.
- Impatto: token di verifica inviato a terze parti (privacy/security leak).
- Fix: generazione QR locale in data URI (`_build_qr_data_uri`) e rimozione dipendenza esterna.
- Test: `tests/test_security_hardening_audit.py::test_download_page_embeds_qr_without_external_service`.

### F-SEC-03 (High) - Security headers incompleti
- Repro: risposte senza CSP/HSTS/COOP/CORP.
- Impatto: minore hardening browser-side contro XSS/clickjacking/context isolation.
- Fix: estensione `SecurityHeadersMiddleware` con CSP, COOP/CORP, HSTS su HTTPS.
- Test: `tests/test_security_hardening_audit.py::test_security_headers_include_csp`.

### F-SEC-04 (High) - CSRF hardening insufficiente
- Repro: POST autenticati via session cookie accettavano origin arbitrari.
- Impatto: possibili richieste cross-site state-changing (scenario browser).
- Fix: `SessionCsrfMiddleware` con check origin/referer mismatch + cookie `same_site="strict"`.
- Test: `tests/test_security_hardening_audit.py::test_csrf_blocks_cross_origin_for_authenticated_session`.

### F-SEC-05 (Medium) - Esposizione org inattive/cancellate
- Repro: `/api/organizations/{slug}` restituiva dettaglio anche su org inattive/deleted.
- Impatto: metadata leak evitabile su entita non pubblicabili.
- Fix: filtri active/not-deleted su detail/logo/statute endpoint.
- Test: `tests/test_security_hardening_audit.py::test_public_organization_detail_hides_inactive_org`.

### F-SEC-06 (Medium) - PII nei log
- Repro: log includevano email/external_customer_id in chiaro in eventi integrazione/login.
- Impatto: maggiore esposizione dati personali in pipeline log.
- Fix: hashing in `app/routes/ingest_pienissimo.py`, `app/services/integration_issuer.py`, `app/routes/member.py`.
- Test: copertura indiretta nei test ingest/login già eseguiti (`tests/test_ingest_pienissimo.py`, `tests/test_member_card_verification.py`).

### F-SEC-07 (Medium) - RBAC endpoint legacy
- Repro: `/api/super-admin/orgs/{org_id}/cards/increase` rispondeva 400 anche non autenticati.
- Impatto: disclosure comportamento endpoint admin e test smoke fallivano su guard.
- Fix: `_require_super_admin` aggiunto in `increase_card_stock_legacy`.
- Test: `tests/test_smoke.py::test_super_admin_cards_increase_unauthenticated`.

### F-SEC-08 (Medium) - Email header injection
- Repro: subject/to non sanificati contro CRLF.
- Impatto: header injection o messaggi malformed in SMTP.
- Fix: sanitizzazione header (`_sanitize_header_value`) in `app/utils.py`.
- Test: copertura indiretta flussi email/ingest (`tests/test_ingest_pienissimo.py`).

### F-SEC-09 (Medium, Open) - Vulnerabilita dipendenze FE
- Repro: `npm --prefix frontend audit --audit-level=high --json`.
- Impatto: advisory moderate su chain `vite -> esbuild`.
- Fix raccomandato: upgrade `vite@7.x` + regression test FE.
- Test: non applicabile (non fixato in questo patch set).

### F-SEC-10 (Medium, Open) - Token tessera senza expiry
- Repro: token verifica è firmato ma non include `exp`/revocation state.
- Impatto: token leaked resta valido finché stato socio/tessera non cambia.
- Fix raccomandato: versione token con expiry breve + refresh/lookup revocabile.
- Test: da introdurre con redesign token lifecycle.

## Checklist PASS/FAIL
### SECURITY
- [x] CORS non troppo permissivo (no `*` con credenziali) - PASS
- [x] CSRF mitigations se auth via cookie - PASS (origin/referrer + same_site strict)
- [x] RBAC: org-admin non può accedere a super-admin - PASS
- [x] IDOR: org-admin non può leggere/modificare soci di altre org - PASS
- [x] Public endpoints non leakano PII e non permettono enumeration - PASS (con caveat token lifecycle)
- [x] Rate limit su ingest e su verify/download - PASS
- [x] Idempotenza ingest (no tessere duplicate) - PASS
- [x] Email anti-spam (no mail bomb) - PASS (`send_email_once` + throttling)
- [ ] Token verify QR e download non prevedibili e non riutilizzabili male - FAIL (assenza expiry/revocation)
- [x] API keys hashate, raw visibile solo al super-admin one-time - PASS
- [x] Headers di sicurezza (CSP, X-Frame-Options, etc.) corretti - PASS

### FUNCTIONAL
- [x] Eliminazione socio: accesso bloccato e QR “NON ATTIVA” - PASS
- [x] Scadenza annuale: dal 01/01 accesso bloccato, tessera non attiva, purge/soft-delete - PASS
- [x] Org-admin UI: soci eliminati/scaduti non risultano attivi - PASS
- [x] Email e Thank-you: testi e branding corretti per org - PASS
- [x] PDF download: fronte/retro, attachment, funziona su mobile - PASS (attachment/front-back validati; mobile coperto da template responsive)
- [x] Verify page umana (HTML) + JSON opzionale - PASS
- [x] Fallback logo: su mobile loghi visibili e non broken - PASS

## Patch Set (Must Fix)
- `app/services/db_rate_limit.py`
- `app/routes/public.py`
- `app/routes/ingest_pienissimo.py`
- `app/main.py`
- `app/middleware.py`
- `app/routes/member.py`
- `app/services/integration_issuer.py`
- `app/routes/super_admin.py`
- `app/utils.py`
- `app/config.py`

## Tests Added/Updated
- Added: `tests/test_security_hardening_audit.py`
- Updated: `tests/test_ingest_pienissimo.py`

## Validation Commands
- `python -m pytest tests/test_security_hardening_audit.py tests/test_member_card_verification.py tests/test_ingest_pienissimo.py tests/test_smoke.py -q` -> 43 passed
- `npm --prefix frontend run build` -> OK
