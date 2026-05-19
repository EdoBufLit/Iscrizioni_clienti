## Plan (Fix accento visuale builder form/sondaggi - May 18, 2026)
- [x] Verificare dove `accent_color` viene applicato nella preview pubblica del builder.
- [x] Propagare il colore accento a hero, card, sezioni, divider, focus e stati selezionati oltre al solo bottone.
- [x] Verificare typecheck/build frontend e smoke browser con un colore custom.
- [x] Documentare risultato e rischi residui.

## Review (Fix accento visuale builder form/sondaggi - May 18, 2026)
- Root cause: `FormPublicCanvas` usava `accent_color` quasi solo sul bottone di submit; focus, radio/checkbox e alcuni stati erano poco visibili nella preview non interattiva.
- Fix: introdotto token CSS dinamico `--form-accent` e applicato a badge associazione, linea hero, bordo/top accent della card, titoli sezione, separatori, required marker, focus/stati selezionati e CTA.
- Hardening dark/admin: rimossi `bg-white`/`shadow-sm` dai punti del canvas pubblico che venivano sovrascritti dalle regole globali `.org-admin-v2`, sostituendoli con regole scoped del canvas.
- Verifiche OK: `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`.
- Smoke browser locale con accento `#2563eb`: `--form-accent` propagato; badge associazione, card, titolo sezione, bordo sezione, required marker, divider e bottone leggono il blu custom, non solo la CTA.
- Rischi residui: resta il warning Vite preesistente sui chunk grandi.

## Plan (Fix overflow builder form/sondaggi - May 18, 2026)
- [x] Confermare il punto condiviso usato da Form pubblici e Sondaggi.
- [x] Rimuovere il clipping verticale del tab builder senza cambiare logica drag/drop o persistenza.
- [x] Verificare typecheck/build frontend e smoke browser del builder con molti campi.
- [x] Documentare risultato, evidenza e rischi residui.

## Review (Fix overflow builder form/sondaggi - May 18, 2026)
- Root cause: il tab builder in `OrgAdminForms.tsx` aveva altezza fissa `h-[calc(100vh-210px)]` e `overflow-hidden`, quindi il canvas centrale veniva tagliato quando i campi superavano il viewport.
- Fix: sostituito con `min-h-[calc(100vh-210px)] overflow-visible`, lasciando invariati `FormBuilder`, drag/drop, salvataggio e pannelli laterali sticky/scrollabili.
- Verifiche OK: `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`.
- Smoke browser locale su backend FastAPI + SPA buildata: Form pubblici con 30 campi (`scrollHeight 4886`, `clientHeight 720`, ultimo campo raggiungibile) e Sondaggi con 28 domande (`scrollHeight 4939`, `clientHeight 720`, ultimo campo raggiungibile).
- Rischi residui: nessun cambio funzionale alla persistenza; resta il warning Vite preesistente sui chunk grandi.

## Plan (Fix build pre-deploy npm ci - May 7, 2026)
- [x] Recuperare il log completo GitHub Actions del workflow fallito.
- [x] Riprodurre il problema come clean install compatibile con Docker/npm 10.
- [x] Allineare Vitest alla major Vite usata dal progetto senza cambiare Dockerfile.
- [x] Verificare test frontend, typecheck, build e `npm@10 ci`.
- [x] Committare e pushare il fix.

## Review (Fix build pre-deploy npm ci - May 7, 2026)
- Root cause: `vitest@4.1.5` introduceva `vite@8` nel lock, mentre il progetto usa `vite@5.4.x`; nel container `node:20-alpine`/npm `10.8.2`, `npm ci` falliva per lock incompleto su `@emnapi/core`, `@emnapi/runtime` ed `esbuild@0.28.0`.
- Fix: pin di `vitest` a `2.1.9`, compatibile con `vite@5`, rigenerando `frontend/package-lock.json` senza nested `vite@8`.
- Verifiche OK: `npx -y npm@10.8.2 --prefix frontend ci`, `npm --prefix frontend run test:run`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`, `git diff --check`.
- Nota: Docker build locale non eseguito per Docker Desktop Linux engine non disponibile; il controllo che falliva nel container (`npm@10 ci`) e stato riprodotto con la stessa major npm.

## Plan (Smoke manuale pre-push - May 7, 2026)
- [x] Avviare backend locale e verificare health/version/API base.
- [x] Avviare frontend locale e verificare caricamento pagine pubbliche principali.
- [x] Eseguire smoke su login/aree admin con controlli non distruttivi.
- [x] Verificare che build/test Sprint 2/3 restino verdi dopo lo smoke.
- [x] Documentare risultati e pushare il branch corrente.

## Review (Smoke manuale pre-push - May 7, 2026)
- Backend smoke avviato su DB SQLite temporaneo `tmp_pre_push_smoke.db`, con `health`, `api/version`, login socio, magic login org-admin e login super-admin verificati.
- Smoke browser Playwright via Vite proxy temporaneo su `http://127.0.0.1:5174` verso backend `http://127.0.0.1:8010`: 35 superfici navigate, 0 failure, 0 page error, 0 console error inatteso e 0 response 4xx/5xx inattesa.
- Superfici coperte: pubbliche (`/`, servizi, associazioni, dettaglio associazione, iscrizione, login, reset password, affiliazione, contatti, privacy), area socio (`dashboard`, profilo, documenti), org-admin (dashboard, inviti, soci, tessere, prenotazioni, documenti, comunicazioni, campagne, moduli, WhatsApp, billing, contabilita, associazione) e super-admin (org-admins, associazioni, affiliazioni, documenti, registro lotti, soci).
- Note ambiente: FastAPI statico su `/associazioni` produce redirect loop per collisione route backend/SPA, quindi lo smoke frontend valido e stato eseguito via Vite come SPA. Il proxy Vite cross-port genera 403 CSRF attesi su `api/me/onboarding/start`; sono stati esclusi solo come rumore di ambiente, non come regressioni applicative.
- Evidenze locali non committate: screenshot e `summary.json` in `tasks/screenshots/prepush-smoke-vite-20260507-final/`.

## Plan (Sprint 2 + Sprint 3 Desloppify - May 7, 2026)
- [x] Chiudere security residua backend con micro-fix, commenti non-security e suppression solo per falsi positivi provati.
- [x] Aggiungere test backend mirati per fallback/logging e classificazioni non-security.
- [x] Introdurre harness test frontend con Vitest/React Testing Library/jsdom.
- [x] Sostituire o affiancare test statici frontend con test DOM/comportamentali mirati.
- [x] Rieseguire pytest, test frontend, typecheck/build e scan/show Desloppify separati.
- [x] Documentare review finale e committare solo file pertinenti.

## Review (Sprint 2 + Sprint 3 Desloppify - May 7, 2026)
- Sprint 2: chiusi i residui security backend con micro-fix reversibili: identificatori pubblici marcati non-secret, jitter email classificato non-security, marker worker reso configurabile/risolto, fallback grafici/email/PDF ora loggano senza ingoiare eccezioni in silenzio.
- Sprint 2: applicate suppression Desloppify solo agli ID esatti dopo test/commenti; `desloppify --lang python show security --status open --no-budget` e `desloppify --lang typescript show security --status open --no-budget` risultano puliti al 100%.
- Sprint 3: aggiunto harness Vitest/React Testing Library/jsdom e rimpiazzato il test statico Python sulla preview HTML con test DOM su iframe sandboxato, `referrerPolicy` e svuotamento controllato del container.
- Desloppify: backend strict `74.3` e security `100.0`; frontend strict `72.0` e security `100.0`. Il frontend ora mostra `Test health 0.5%` perche il nuovo harness ha attivato il rilevatore di copertura, aprendo debito reale sui flussi frontend critici.
- Verifiche OK: `python -m pytest -q tests\test_desloppify_sprint2_security.py tests\test_security_hardening_audit.py tests\test_log_redaction.py` (`17 passed`), `npm --prefix frontend run test:run` (`6 passed`), `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`.
- Rischi residui: `npm --prefix frontend audit --omit=dev` segnala 2 high su `grapesjs -> underscore`; non corretto in questo sprint perche richiede valutazione compatibilita del builder. Restano warning Vite sui chunk grandi e warning deprecation Python preesistenti.

## Plan (Sprint 0 + Sprint 1 Desloppify mirato - May 6, 2026)
- [x] Pulire lo scope Desloppify escludendo agent/tooling, cache, output, script temporanei e file non runtime.
- [x] Verificare `alembic/versions` prima di qualunque esclusione globale.
- [x] Applicare solo micro-fix Sprint 1 su finding security mirati, senza refactor profondi o cambi business.
- [x] Aggiungere test mirati per log sensibili, SHA1 non-security e warning frontend.
- [x] Rieseguire test, build/typecheck e Desloppify scan/show security separati backend/frontend.
- [x] Documentare review finale con veri/falsi positivi, rischi residui e comandi eseguiti.

## Review (Sprint 0 + Sprint 1 Desloppify mirato - May 6, 2026)
- Sprint 0: esclusi dallo scope Desloppify agent/tooling, cache, output, script temporanei e file non runtime richiesti. `alembic/versions` non escluso: il DB locale e a `c3d4e5f6a7b8`, mentre head e `s4t5u6v7w8x9`, quindi non tutte le migration risultano gia applicate localmente.
- Logging: i finding `log_sensitive` in `member.py`, `org_admin.py`, `super_admin.py` sono stati classificati falsi positivi o leak non confermati; aggiunti test `caplog` per dimostrare che email/token/password non appaiono nei log, e reso neutro il messaggio di mismatch super-admin.
- Frontend: il warning in `Iscrizione.tsx` era falso positivo per testo contenente "Password"; sostituito con copy neutra e coperto da test statico.
- SHA1: gli usi in `affiliation_video.py` e `whatsapp_sync.py` restano SHA1 solo per cache fingerprint/deduplica non-security, con `usedforsecurity=False`, fallback marcati e test di stabilita.
- Video affiliazione: subprocess/path gia verificati con test su lista argomenti, assenza di `shell=True` e rifiuto output fuori directory ammesse; suppressioni Desloppify applicate solo agli ID esatti dei finding Sprint 1 provati.
- Verifiche OK: py_compile dei moduli toccati, pytest mirati (`26 passed`), `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`. Desloppify dopo scan: backend strict `74.2`, security `97.6%` con 9 finding residui fuori scope; frontend strict `73.7`, security `100.0%`.

## Plan (Sprint 1 interventi sicuri Desloppify - May 5, 2026)
- [x] Aggiungere helper centralizzato per redigere dati sensibili nei log senza cambiare audit DB o payload API.
- [x] Applicare la redazione solo ai log in `member.py`, `org_admin.py` e `super_admin.py`.
- [x] Classificare gli SHA1 in video affiliazione e sync WhatsApp come fingerprint/deduplica non-security, mantenendo formato digest.
- [x] Aggiungere guard puntuali su subprocess/path video affiliazione senza cambiare stati/job/flussi.
- [x] Sostituire preview HTML non sandboxate in `MessagesHub.tsx` e chiarire lo svuotamento controllato in Grapes builder.
- [x] Aggiungere test mirati e verificare backend/frontend.

## Review (Sprint 1 interventi sicuri Desloppify - May 5, 2026)
- Aggiunto `app/log_redaction.py` per redigere email, telefono, codice fiscale, token/segreti, URL firmati/query sensibili, payload pagamento/WhatsApp e metadati documenti nei log.
- Applicato l'helper solo ai logger in `member.py`, `org_admin.py` e `super_admin.py`; audit DB, payload API e logiche business restano invariati.
- Gli SHA1 in `affiliation_video.py` e `whatsapp_sync.py` sono stati classificati come non-security fingerprint/deduplica con `usedforsecurity=False` e fallback compatibile, senza cambiare formato digest.
- Video affiliazione: subprocess resta con lista argomenti e senza shell; aggiunti guard per renderer dir/script, output dir e path renderer restituito.
- Frontend Comunicazioni: le preview HTML legacy in `MessagesHub.tsx` ora usano iframe sandboxato; `GrapesEmailBuilder.tsx` svuota il container con `replaceChildren()`.
- Verifiche OK: `python -m py_compile ...`, test mirati (`10 passed`), `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`; restano warning deprecation/chunk size preesistenti.

## Plan (Desloppify quality loop - May 5, 2026)
- [ ] Installare/aggiornare `desloppify[full]` con Python 3.11+ e installare la guida workflow per Codex.
- [ ] Aggiungere `.desloppify/` a `.gitignore` per evitare commit di stato locale.
- [ ] Escludere prima della scan solo directory ovvie generate/locali: cache, build output, node_modules, test output, runtime media/output e temp workspace.
- [ ] Eseguire `desloppify scan --path .`, seguire le istruzioni agent stampate dal tool e usare `desloppify next` come coda principale.
- [ ] Per ogni item della coda: capire il problema, correggerlo in modo robusto, verificare, eseguire il resolve command e ripetere `desloppify next`.
- [ ] Usare `desloppify backlog` solo se serve contesto piu ampio, e `plan`/`plan queue` solo per riordinare priorita o cluster correlati.
- [ ] Rescansionare periodicamente, massimizzare lo strict score con miglioramenti reali e documentare review finale con comandi/verifiche.

## Plan (Sessione persistente org admin 30 giorni - May 5, 2026)
- [x] Aggiornare modello/config/schema per sessioni persistenti org admin con durata default 30 giorni.
- [x] Creare cookie HttpOnly dedicato `org_admin_session` su verifica magic link e ripristinare la sessione breve quando valido.
- [x] Revocare/cancellare la sessione persistente su logout e bloccare restore per admin disattivati, cancellati o token scaduti.
- [x] Estendere CSRF per richieste org-admin autenticate solo dal cookie persistente.
- [x] Aggiungere migration Alembic, repair SQLite/init_db e test mirati su verify, persistenza, scadenza, logout, disattivazione e CSRF.
- [x] Eseguire verifiche e documentare review finale.

## Review (Sessione persistente org admin 30 giorni - May 5, 2026)
- Aggiunta sessione persistente org admin su tabella `org_admin_sessions`, con token hashato, scadenza configurabile via `ORG_ADMIN_SESSION_DAYS` e default 30 giorni.
- Il magic link resta one-time e valido 15 minuti; dopo verify crea anche il cookie HttpOnly `org_admin_session` senza modificare la durata del cookie globale `session`.
- I resolver org admin ripristinano `request.session["org_admin_id"]` dal cookie persistente valido e rifiutano admin disattivati, cancellati, sessioni scadute o revocate.
- Logout revoca la sessione persistente corrente e cancella il cookie dedicato; CSRF ora considera anche `org_admin_session` per richieste unsafe org-admin.
- Aggiornati Alembic, `init_db.py`, repair SQLite e `ENV_REQUIRED.md`.
- Verifiche OK: `python -m py_compile` sui moduli toccati, `alembic heads`, test mirati org-admin persistenti (`7 passed`), `python -m pytest -q tests\test_email_flows.py` (`14 passed`) e `git diff --check` senza errori; restano solo warning CRLF/deprecation preesistenti.

## Plan (Unsaved changes warning e accessibilita core - May 5, 2026)
- [x] Introdurre guard centralizzato per modifiche non salvate con `beforeunload` e blocco navigazione interna.
- [x] Migrare il bootstrap router a `RouterProvider/createBrowserRouter` per supportare `useBlocker`.
- [x] Applicare dirty guard a iscrizione socio, affiliazione, form/sondaggi, campagne/modelli e impostazioni org admin.
- [x] Rafforzare accessibilita delle primitive: `ModalShell`, `ConfirmModal` e verificare `ToastProvider` gia accessibile.
- [x] Correggere i punti WCAG AA core sulle superfici toccate: focus trap/restore, blocco scroll modali, stato alert/status e checkbox con `htmlFor/id`.
- [x] Verificare con typecheck/build e documentare risultati.

## Review (Unsaved changes warning e accessibilita core - May 5, 2026)
- Aggiunto `UnsavedChangesProvider` con `beforeunload`, blocco navigazione interna tramite `useBlocker` e conferma distruttiva standard prima di perdere bozze locali.
- Router frontend migrato a `createBrowserRouter`/`RouterProvider`; `App` resta il contenitore delle route esistenti, ma ora i blocker React Router sono supportati.
- Dirty guard applicati a iscrizione socio, affiliazione pubblica, workspace form/sondaggi, builder campagne/modelli e impostazioni org admin. Le query interne dei form non aprono warning inutili.
- Accessibilita core: `ModalShell` blocca lo scroll, ripristina il focus e accetta focus iniziale; `ConfirmModal` usa checkbox associata e messaggi errore `role=alert`; `ToastProvider` era gia con `aria-live`, `role=status/alert` e limite 3 toast.
- Verifiche OK: `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`, `git diff --check`, smoke preview HTTP su `http://127.0.0.1:4174/` con risposta `200`. Resta solo warning Vite preesistente sui chunk grandi.

## Plan (Fix WhatsApp prenotazioni duplicate e dettagli evento - May 4, 2026)
- [x] Confermare nel codice il motivo dei due WhatsApp su submit prenotazione.
- [x] Aggiungere dettagli evento configurabili dall'org admin sul modulo prenotazione: data, orario e note evento.
- [x] Usare i dettagli evento come sorgente primaria per booking e template WhatsApp, lasciando fallback ai campi form legacy.
- [x] Evitare doppio invio WhatsApp quando auto-risposta modulo e regola WhatsApp attiva coprono lo stesso evento.
- [x] Aggiornare UI/API/test e bootstrap schema locale.
- [x] Eseguire verifiche mirate e documentare review.

## Review (Fix WhatsApp prenotazioni duplicate e dettagli evento - May 4, 2026)
- Causa doppio invio confermata: sul submit pubblico partivano sia `whatsapp_auto_reply_enabled` del modulo sia le regole attive in `whatsapp_automations` collegate allo stesso form.
- Correzione: se esiste una regola WhatsApp attiva verso il compilatore per l'evento corrente, l'auto-risposta legacy del modulo viene saltata e resta un solo messaggio.
- Aggiunti su `forms` i dettagli evento gestiti dall'org admin: `booking_event_date`, `booking_event_time`, `booking_event_details`; sono esposti in UI dentro `Comunicazioni > Moduli > Impostazioni > Prenotazioni`.
- Booking, agenda e placeholder WhatsApp usano prima i dettagli evento del form; i campi compilati dall'utente restano fallback per moduli legacy.
- Verifiche OK: `python -m py_compile ...`, `alembic heads`, test mirati WhatsApp, `python -m pytest -q tests\test_forms_module.py tests\test_org_admin_communications.py` (`38 passed`), `npm --prefix frontend run typecheck`, `npm --prefix frontend run build` con solo warning Vite chunk grandi preesistente.


## Plan (Prossime modifiche immediate ASSONAM - Apr 28, 2026)
- [x] Aggiungere summary server-side a Super Admin Affiliazioni e usare KPI non derivati dalla pagina corrente.
- [x] Migliorare Org Admin Inviti con ricerca debounced, reset pagina su filtri e ToastProvider.
- [x] Standardizzare password socio a minimo 8 caratteri su iscrizione frontend e backend.
- [x] Aggiungere validazione upload client-side su Iscrizione e Affiliazione pubblica.
- [x] Centralizzare status labels sulle superfici toccate e correggere microcopy visibile.
- [x] Eseguire test backend/frontend mirati e documentare esito.

## Review (Prossime modifiche immediate ASSONAM - Apr 28, 2026)
- Implementati summary globali filtrati per Super Admin Affiliazioni, debounce/toast condiviso negli Inviti, password socio minima a 8 caratteri, validazione upload pubblica 10 MB PDF/JPG/PNG e status labels condivise per le superfici toccate.
- Verifiche OK: `python -m py_compile app\routes\affiliation.py app\routes\member.py app\routes\membership_payments.py app\security.py`, test mirati affiliazioni/signup/checkout SumUp, `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`.
- Nota verifica: il comando largo `python -m pytest -q tests/test_affiliation_flow.py tests/test_signup_fixes.py` fallisce su `test_all_active_orgs_accept_signup` per dati locali con molte organizzazioni generate da altri test che rispondono 400 a `/api/join/.../submit`; non e una regressione della password perche quel flusso non usa `/api/auth/register`.

## Plan (Fix deploy Alembic tokentype - Apr 28, 2026)
- [x] Rendere la migration password reset compatibile con Postgres enum e varchar legacy.
- [x] Eseguire test backend mirati e typecheck frontend.
- [x] Creare commit correttivo e pushare sul branch corrente.

## Review (Fix deploy Alembic tokentype - Apr 28, 2026)
- Migration resa idempotente: su PostgreSQL legge da `pg_catalog` il tipo reale di `tokens.purpose`, altera solo enum esistenti e fa no-op per `varchar`/schemi legacy o dialect non PostgreSQL.
- Verifiche: `python -m py_compile alembic\versions\p7q8r9s0t1u2_add_member_password_reset_token_type.py`, `alembic heads`, reset password email flow (`2 passed`), affiliazione + paginazione super-admin (`15 passed`) e `npm --prefix frontend run typecheck` OK.
- Staging previsto limitato a migration, `tasks/todo.md` e `tasks/lessons.md`; modifiche locali non correlate escluse.

## Plan (Piano immediato ASSONAM aggiornato - Apr 28, 2026)
- [x] Estendere API super-admin associazioni con filtri server-side `status`, `scope`, `numbering` e summary globale filtrata.
- [x] Aggiornare UI super-admin associazioni per usare filtri/summary backend e rimuovere contatori derivati da pagina corrente.
- [x] Implementare recupero password reale per soci: endpoint request/confirm, token one-time, email, pagina reset e login aggiornato.
- [x] Rimuovere prezzo affiliazione hardcoded e usare quota/config reale con fallback "Quota da confermare".
- [x] Preservare la sezione Home "La nostra rete" con numeri hardcoded approvati.
- [x] Migliorare accessibilita immediata: ModalShell focus trap, ToastProvider aria-live/limite, tab ARIA, navigazione attiva/bottom sheet.
- [x] Migliorare mobile operativo: RoomFloorMap pointer events/fallback mobile e InstallAppPrompt non invasivo.
- [x] Eseguire test backend mirati, typecheck/build frontend e smoke preview sulle route principali.

## Review (Piano immediato ASSONAM aggiornato - Apr 28, 2026)
- Implementati filtri/summary server-side super-admin, recupero password soci v1, quota affiliazione da config, accessibilita base e mobile map/PWA. La sezione Home "La nostra rete" resta hardcoded come richiesto.
- Verifiche: `python -m pytest -q tests/test_super_admin_organizations_pagination.py tests/test_email_flows.py::test_member_password_reset_flow_is_one_time_and_non_enumerating tests/test_email_flows.py::test_member_password_reset_expired_token_fails tests/test_affiliation_flow.py::test_affiliation_draft_exposes_configured_fee tests/test_affiliation_flow.py::test_affiliation_draft_handles_missing_fee_without_ready_payment`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`, smoke Vite preview su `/`, `/login`, `/recupera-password`, `/affiliazione`, `/org-admin/prenotazioni`, `/super-admin/associazioni`.
- Nota: QR tessera non modificato; uso `api.qrserver.com` resta come comportamento esistente approvato.

## Plan (Pre-push quote tessere, builder campagne e sondaggi - Apr 28, 2026)
- [x] Rieseguire test backend mirati per totale quote, campagne/comunicazioni e sondaggi/form.
- [x] Rieseguire typecheck e build frontend.
- [x] Controllare diff/staging per includere solo modifiche pertinenti.
- [x] Creare commit e fare push del ramo corrente.

## Review (Pre-push quote tessere, builder campagne e sondaggi - Apr 28, 2026)
- Verifica backend: `python -m pytest -q tests/test_org_admin_member_filters.py tests/test_forms_module.py tests/test_org_admin_communications.py tests/test_low_cards_alert_job.py` OK (`44 passed`).
- Verifica frontend: `npm --prefix frontend run typecheck` OK e `npm --prefix frontend run build` OK; resta solo il warning Vite gia noto sui chunk grandi.
- Diff check: `git diff --check` OK, con soli warning CRLF locali.
- Staging previsto: codice e test per totale quote, builder campagne e sondaggi; artefatti locali non tracciati esclusi.

## Plan (Quote tessere, builder campagne e sondaggi - Apr 28, 2026)
- [x] Aggiornare il totale quote in Tessere per ricalcolare dai prezzi correnti annuale/temporanea senza modificare gli snapshot storici dei soci.
- [x] Correggere il builder campagne attivo: sezioni iniziali separate, lista struttura affidabile, `Giu` funzionante e drag blocchi nel canvas.
- [x] Separare l'esperienza sondaggi dai form: palette builder dedicata, rating/NPS renderizzati e tab risposte con statistiche di apprezzamento.
- [x] Aggiornare test backend mirati e verifiche frontend.
- [x] Eseguire smoke browser sulle superfici toccate e documentare risultati.

## Review (Quote tessere, builder campagne e sondaggi - Apr 28, 2026)
- Tessere: il totale quote in `/api/org-admin/members` ora somma le tessere emesse usando i prezzi quota correnti annuale/temporanea dell'organizzazione; il salvataggio regole in UI ricarica il riepilogo subito dopo la PATCH.
- Builder campagne: la struttura legge le sezioni top-level anche quando il documento iniziale e incapsulato in `mjml/mj-body`; `Su/Giu` e drag nella lista struttura riordinano la collection corretta, e il click su un blocco aggiunge una nuova sezione senza collassare il documento.
- Sondaggi: palette builder ridotta ai blocchi utili, con `Valutazione 1-5` e `NPS 0-10`; preview pubblica e canvas renderizzano scale numeriche; la tab risposte mostra KPI, distribuzioni, preferenze e commenti senza conferma/rigetto.
- Verifiche: `python -m pytest -q tests/test_org_admin_member_filters.py tests/test_forms_module.py tests/test_org_admin_communications.py` OK (`36 passed`); `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con solo warning Vite preesistente sui chunk grandi.
- Smoke: Playwright mockato su `http://127.0.0.1:5173` OK per campagne e sondaggi: 3 sezioni iniziali separate, click blocco -> 4 sezioni, drag struttura senza errori, tab sondaggi con statistiche e senza azioni conferma/rigetto.

## Plan (ASSONAM UI/UX implementation plan da PDF - Apr 27, 2026)
- [ ] Fase 0 - Audit mirato prima di toccare UI: verificare nel codice quali punti del PDF sono ancora veri dopo i rehaul recenti, con particolare attenzione a super-admin, org-admin, dark mode, componenti gia introdotti, paginazione Organizations, modali, toast, copy e mobile.
- [ ] Fase 1 - Correzioni funzionali e fiducia prodotto: spostare o confermare i filtri Organizations server-side, sistemare paginazione e KPI calcolati da server, rimuovere dati hardcoded o finti, eliminare prezzo affiliazione hardcoded, standardizzare password minima e correggere label/status in italiano.
- [ ] Fase 2 - Fondazioni UI condivise: consolidare Button, StatusBadge, Confirm/ModalShell, ToastProvider, FormField, FileUpload, EmptyState e DataTable solo dove non esistono gia primitive equivalenti; evitare di creare doppioni se le primitive super-admin/org-admin introdotte nei rehaul coprono gia il caso.
- [ ] Fase 3 - Accessibilita e sicurezza UX: focus trap su tutte le modali, aria-live toast, aria-current navigazione, ARIA tabs/combobox, aria-invalid/describedby sui form, skip-link, focus-visible globale, prefers-reduced-motion e conferme standard per azioni distruttive.
- [ ] Fase 4 - Copy e microcopy: correggere accenti e italiano visibile, tradurre label inglesi residue, centralizzare status labels e messaggi ricorrenti, rinominare "Password dimenticata" in "Accedi senza password", usare azioni specifiche come "Scarica elenco CSV" e "Salva modifiche".
- [ ] Fase 5 - Responsive operativo: filtri in drawer mobile, tabelle in card sotto 768px, bottom sheet per azioni complesse, submit sticky nei wizard pubblici, touch events su RoomFloorMap e controllo viewport reale a 375, 768, 1024 e 1440px.
- [ ] Fase 6 - IA e layout prodotto: applicare solo dopo l'audit le modifiche di architettura informativa che riducono complessita reale, in particolare accorpamenti "Soci e Tessere", "Documenti e Contabilita", "Prenotazioni: Agenda / Sale e Tavoli" e pulizia Comunicazioni, evitando altri re-skin generici.
- [ ] Fase 7 - Dark mode sostenibile: non fare un big bang se le aree sono gia state corrette di recente; convergere progressivamente su token semantici e rimuovere override fragili solo dopo screenshot light/dark per dashboard, tabelle, modali, builder e pagine pubbliche principali.
- [ ] Fase 8 - Refactor componenti monolitici: scomporre Bookings, OrganizationManageModal, MemberDetail, Forms, Iscrizione e Affiliazione per flusso e responsabilita, ma solo mentre si tocca la pagina per un miglioramento concreto; evitare refactor isolati senza test e smoke.
- [ ] Fase 9 - Evoluzioni da posticipare: onboarding wizard backend, notifiche in-app complete, analytics dashboard, PWA/offline/push e drag-and-drop avanzato del builder vanno trattati come roadmap prodotto separata, non come prerequisito del redesign UI/UX.
- [ ] Verifica per ogni fase: typecheck/build frontend, test backend mirati quando cambia il contratto dati, smoke browser autenticato, screenshot viewport normali light/dark e mobile, controllo console/network e mini-audit accessibilita sulle superfici toccate.

## Review (ASSONAM UI/UX implementation plan da PDF - Apr 27, 2026)
- Piano creato dal PDF `C:\Users\edoar\Downloads\ASSONAM_Analisi_UI_UX.pdf` e incrociato con le lezioni di progetto: priorita a bug funzionali, fiducia, accessibilita, responsive e coerenza, non a un altro re-skin.
- Parere: il PDF e valido come backlog, ma va normalizzato. Alcune voci sono gia state toccate dai rehaul recenti e vanno prima riverificate; altre sono troppo ampie per stare nello stesso rilascio e rischiano regressioni se fatte insieme.
- Da tenere subito: server-side filtering/pagination, rimozione hardcoded, status/copy italiano, conferme distruttive, focus trap, ToastProvider, validazione file, DataTable/StatusBadge/FormField condivisi, responsive table cards e test light/dark.
- Da ridurre o spostare: dashboard analytics, PWA/push/offline, onboarding backend, sistema notifiche completo e refactor massivi senza obiettivo funzionale immediato.
- Modifiche extra consigliate: baseline visual regression per pagine critiche, matrice ruoli/flussi prima di cambiare IA, audit di feature gate e permessi quando si spostano voci menu, controllo performance INP sulle dashboard e inventario dei componenti gia esistenti prima di crearne altri.

## Plan (Org admin browser feedback WhatsApp e agenda - Apr 27, 2026)
- [x] Correggere il link sidebar WhatsApp che tornava a Panoramica quando WhatsApp non era attivo.
- [x] Rendere richiudibili le righe prenotazione espanse nell'agenda senza riapertura automatica.
- [x] Verificare typecheck/build e smoke rapido nel browser locale.

## Review (Org admin browser feedback WhatsApp e agenda - Apr 27, 2026)
- WhatsApp: la tab non viene piu rimossa quando il canale non e attivo e non esiste piu il redirect automatico verso Panoramica. Il link `/org-admin/comunicazioni?tab=whatsapp` resta sulla tab WhatsApp e mostra lo stato non attivo.
- Agenda: cliccare una prenotazione gia espansa ora imposta `selectedBookingId` a `null`; l'effetto di sincronizzazione non riapre piu automaticamente la prima prenotazione del giorno.
- Verifiche: `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con solo warning Vite preesistente sui chunk grandi; smoke browser su `http://127.0.0.1:5173/org-admin/comunicazioni?tab=whatsapp` OK.

## Plan (Org admin comunicazioni, reminder WhatsApp e sondaggi - Apr 27, 2026)
- [x] Mappare schema, API, worker e UI esistenti per prenotazioni, WhatsApp, form e builder campagne.
- [x] Implementare reminder WhatsApp automatico per prenotazioni confermate: messaggio e ore prima evento configurabili dall'org admin, invio da worker reale, deduplica e test.
- [x] Aggiungere `Sondaggi` dentro `Comunicazioni`, riusando il motore form con builder semplificato e automazione post-evento per prenotazioni segnate come presentate in agenda.
- [x] Migliorare builder campagne: aggiunta blocchi vicino alla selezione, reorder/scambio piu semplice, controlli rapidi su blocco e pannello proprieta tradotto/semplificato.
- [x] Aggiornare navigation, API client, migration/bootstrap e test mirati senza rompere i flussi esistenti.
- [x] Eseguire typecheck/build, test backend mirati, controllo locale frontend e documentare come funziona il reminder automatico.

## Review (Org admin comunicazioni, reminder WhatsApp e sondaggi - Apr 27, 2026)
- Reminder WhatsApp prenotazioni: aggiunti campi organizzazione per attivo/ore/template, pannello dedicato in `Comunicazioni > WhatsApp`, invio automatico nel worker esistente e deduplica con `BookingEvent`.
- Funzionamento reminder: il worker controlla prenotazioni `confirmed` con data futura, invia nel range `evento - ore_prima` fino all'ora evento, usa la connessione WhatsApp Evolution dell'organizzazione e non richiede invio manuale dall'org admin.
- Sondaggi: aggiunta tab `Sondaggi` dentro `Comunicazioni`, voce menu dedicata e supporto API `form_type=survey`; il builder riusa i form ma mostra testi/default da sondaggio.
- Invio post evento sondaggi: ogni sondaggio puo abilitare WhatsApp automatico con delay e messaggio; il worker invia solo a prenotazioni segnate in agenda come `seated` o `completed`, non ai soli confermati.
- Builder campagne: i blocchi nuovi vengono inseriti dopo la sezione selezionata, il pannello destro mostra una lista `Struttura messaggio` con azioni `Su/Giu/Elimina`, settori proprieta tradotti e controlli piu vicini al reference.
- DB/API: aggiunta migration Alembic `o4p5q6r7s8t9_add_booking_reminders_and_surveys.py`, bootstrap dev in `init_db.py`, tipi frontend e serializzazione settings aggiornati; i PUT impostazioni comunicazioni ora aggiornano solo i campi inviati.
- Verifiche: `python -m py_compile ...` OK; `python -m pytest -q tests\test_org_admin_communications.py::test_booking_whatsapp_reminder_is_automatic_and_deduped tests\test_org_admin_communications.py::test_post_event_survey_targets_only_present_bookings` OK; `python -m pytest -q tests\test_org_admin_communications.py tests\test_forms_module.py` OK (`34 passed`); `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con solo warning Vite preesistente sui chunk grandi; `git diff --check` OK con soli warning CRLF.
- Smoke locale: frontend disponibile su `http://127.0.0.1:5173`; non ho forzato uno smoke Playwright autenticato perche il backend locale collegato al proxy Vite su `:8000` rispondeva in modo non valido al controllo `/api/health`.

## Plan (Org admin booking agenda compact redesign - Apr 27, 2026)
- [x] Mappare struttura e stati dell'agenda prenotazioni esistente, preservando API/handler di selezione, assegnazione, review richiesta e cambio stato.
- [x] Tradurre le label stato prenotazione in italiano mantenendo `No show` invariato.
- [x] Rifare il popup/dettaglio giornata come pannello compatto centrato sopra la pagina dopo click sul giorno, aderente al reference: header verde, KPI, filtri, righe compatte e dettaglio espandibile in-place.
- [x] Rendere la lista scalabile con scroll interno per molte prenotazioni, evitando card enormi e overflow testo.
- [x] Adattare light/dark mode senza rompere il tema esistente.
- [x] Eseguire typecheck/build e, se possibile, smoke visuale mirato su agenda.

## Review (Org admin booking agenda compact redesign - Apr 27, 2026)
- Stati prenotazione tradotti in italiano in `OrgAdminBookings.tsx`: `confirmed` -> `Confermata`, `pending/new` -> `In attesa`, `seated` -> `Seduta`, `completed` -> `Completata`, `cancelled` -> `Cancellata`; `no_show` resta `No show`.
- Il click su un giorno dell'agenda ora apre un pannello giornata centrato sopra il calendario con header verde, KPI del giorno, filtri `Tutte / Confermata / In attesa / Seduta / Completata`, righe compatte e dettaglio espandibile in-place.
- La lista giornata ha scroll interno e mantiene visibili nome, orario, tavolo, stato e coperti anche con molte prenotazioni; nello smoke con 24 prenotazioni il pannello resta scrollabile.
- Il dettaglio mantiene le funzioni esistenti: cambio stato servizio, completamento rapido, richiesta collegata, link ai moduli e assegnazione sala/tavolo.
- Stili light/dark aggiunti in `index.css` con classi scoped `booking-*`, evitando overflow dei badge e dei pulsanti stato.
- Verifiche: `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con solo warning Vite preesistente sui chunk grandi; smoke Playwright mockato su `http://127.0.0.1:5173/org-admin/prenotazioni?section=agenda` OK con 24 righe, scroll interno, 0 errori console/API, nessuna label stato inglese residua e nessun overflow sui pulsanti stato.
- Evidenze: `tasks/screenshots/booking-agenda-redesign-20260427/agenda-panel-light.png` e `tasks/screenshots/booking-agenda-redesign-20260427/agenda-panel-dark.png`.

## Plan (Super admin mockup fidelity correction - Apr 27, 2026)
- [x] Verificare che la configurazione SumUp nel dettaglio associazione sia ancora collegata a `saveSuperAdminSumUpApiKey` / `deleteSuperAdminSumUpApiKey` e non venga rimossa o scollegata.
- [x] Allineare `/super-admin/associazioni` al mockup: header piu compatto, nessun pulsante extra non presente, KPI a 6 colonne, toolbar, tabella con colonne/azioni/stati come reference.
- [x] Rifare `Setup associazione` come drawer destro full-height con overlay, header, stato attiva, tab verticali `Generale`, `Numerazione tessere`, `Iscrizioni`, `Branding`, `Comunicazioni`, contenuto come reference e salvataggio esistente.
- [x] Preservare/integrare la sezione SumUp nella tab corretta del drawer senza cambiare API, payload, validazioni o handler.
- [x] Rifare `Lotti tessere` come modal centrale aderente alla reference: header, summary rail, tabella lotti, info reset annuale, CTA aggiungi/chiudi e overlay.
- [x] Eseguire typecheck/build e smoke visuale mirato light/dark su Associazioni, Setup associazione, Lotti tessere.

## Review (Super admin mockup fidelity correction - Apr 27, 2026)
- Associazioni: `SuperAdminOrganizations.tsx` ora usa la tabella operativa in stile reference con KPI a 6 card, toolbar, chip filtro, colonne `Associazione`, `Slug`, `Localita`, `Stato`, `Comunicazioni`, `Numerazione tessere`, `Azioni`, e CTA primaria `Nuova associazione`.
- Setup associazione: `OrganizationManageModal.tsx` ora rende il setup come drawer destro full-height con overlay, header/stato, nav verticale e sezioni `Informazioni generali`, `Numerazione tessere`, `Iscrizioni e documenti`, `Pagamento quota associativa`.
- SumUp: la sezione `Pagamento quota associativa` resta visibile scorrendo nel drawer; handler `saveSuperAdminSumUpApiKey` / `deleteSuperAdminSumUpApiKey`, provider, chiave, rimozione e validazioni non sono stati scollegati.
- Lotti tessere: la vista `view-batches` ora usa modale centrale come reference con header, summary rail, tabella lotti disponibili, informazione reset annuale, `Aggiungi lotto`, `Chiudi`, modifica/elimina lotto e manutenzione annuale preservati.
- Dark mode: corretto il bridge tema super-admin in `theme.css` per mantenere leggibili testi/tabella/controlli anche quando il global theme viene caricato dopo i token super-admin.
- Verifiche: `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con solo warning Vite preesistente sui chunk grandi; smoke Playwright su `http://127.0.0.1:8019` OK con 0 errori console e 0 risposte API 4xx/5xx inattese.
- Evidenze: screenshot viewport in `tasks/screenshots/super-admin-mockup-fix-20260427/`: `06-associazioni-viewport-light.png`, `07-setup-viewport-top-light.png`, `08-setup-viewport-sumup-light.png`, `09-lotti-viewport-light.png`, `10-associazioni-viewport-dark.png`.

## Plan (Super admin structural UI/UX rehaul - Apr 26, 2026)
- [x] Proteggere invarianti: logo ASSONAM esistente, sigla/payoff, route/API/permessi/handler e light/dark mode.
- [x] Introdurre primitive condivise super-admin (`PageHeader`, `KpiCard`, `Toolbar`, `Tabs`, `StatusChip`, `TableShell`, `DetailPanel`, `ModalShell`, `DrawerShell`, `ActionRail`, `EmptyState`, `ProgressMeter`).
- [x] Aggiornare shell `/super-admin` con topbar governance, tab orizzontali, profilo, theme toggle, sito pubblico, logout e navigazione mobile.
- [x] Ridisegnare Associazioni con KPI, filtri, tabella operativa, numerazione, comunicazioni, azioni `Lotti`, `Setup`, `API`, elimina/archivia.
- [x] Ridisegnare `Setup associazione` e `Lotti tessere` in modal strutturati, mantenendo tutti i salvataggi e flussi batch esistenti.
- [x] Ridisegnare Affiliazioni come master-detail con KPI, inbox pratiche, documenti, dati amministrativi, pagamento e azioni governance.
- [x] Ridisegnare Documenti/Contabilita con KPI, filtri, tabella, pannello dettaglio/preview e azioni reali.
- [x] Ridisegnare Amministratori con KPI, invito orizzontale, filtri, tabella accessi e azioni sospendi/riattiva/rimuovi.
- [x] Ridisegnare Registro lotti con KPI, filtri, disponibilita/progress, export e azione nuovo lotto collegata a flusso reale.
- [x] Rifinire Libro Soci con KPI, filtri, tabella registro e pannello scheda socio coerente.
- [x] Eseguire typecheck/build, test backend super-admin mirati e smoke visuale light/dark su pagine e modali critiche.
- [x] Documentare review finale con checklist pagina per pagina e residui.

## Review (Super admin structural UI/UX rehaul - Apr 26, 2026)
- Primitive: aggiunto `SuperAdminPrimitives.tsx` con PageHeader, KpiCard, Toolbar, Tabs, StatusChip, TableShell, DetailPanel, ModalShell/DrawerShell, ActionRail, EmptyState e ProgressMeter; `index.css` contiene token scoped `.super-admin-v2` con light/dark mode.
- Shell: `SuperAdminLayout.tsx` ora usa topbar governance, nav orizzontale, theme toggle, sito pubblico e logout, mantenendo il logo `/assonam-logo.svg` e la scritta ASSONAM esistenti.
- Associazioni: trasformata in workspace con KPI, filtri/search, chip stato, tabella operativa, numerazione, comunicazioni e azioni reali `Lotti`, `Setup`, `API`, elimina/archivia.
- Setup associazione e Lotti tessere: modali rifiniti con gerarchia piu vicina ai mockup e flussi esistenti di salvataggio, batch, reset, modifica/elimina lotto preservati.
- Affiliazioni: trasformata in master-detail con KPI, inbox pratiche, documenti caricati, dati amministrativi, stato pagamento e action rail governance.
- Documenti/Contabilita: aggiunti header, tab, KPI, filtri e pannello dettaglio/preview mantenendo upload, sostituzione, notifica, download e azioni contabili esistenti.
- Amministratori: pagina ridisegnata con KPI, invito orizzontale, toolbar, tabella accessi, stati e azioni sospendi/riattiva/rimuovi.
- Registro lotti: nuova vista con KPI, filtri, progress disponibilita, scope, export Excel e tabella densa come da mockup.
- Libro Soci: rifinito con PageHeader, KPI, toolbar filtri e scheda socio laterale coerente con la governance super-admin.
- Fix funzionale emerso dai test: in `app/routes/org_admin.py` la decisione socio registra `decision_at` prima del fulfillment, cosi l'approvazione puo emettere tessera e attivare il socio invece di restare `pending_verification`.
- Verifiche: `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con solo warning Vite preesistente sui chunk grandi; `python -m pytest -q tests/test_documents.py::test_document_flow tests/test_super_admin_organizations_pagination.py tests/test_super_admin_numbering_scopes.py tests/test_super_admin_card_lot_management.py tests/test_card_lot_registry.py tests/test_super_admin_member_registry.py tests/test_super_admin_member_payment_method_detail.py tests/test_accounting_archive.py tests/test_affiliation_flow.py` OK (`37 passed`); `git diff --check` OK con soli warning CRLF.
- Smoke visuale: locale su `http://127.0.0.1:8018` con affiliazioni abilitate, screenshot light/dark in `tasks/screenshots/super-admin-rehaul-smoke-20260426/`; 11 viste, 0 errori console, 0 risposte API 4xx/5xx non attese.

## Plan (Low cards WhatsApp alert REST API bug - Apr 26, 2026)
- [x] Mappare il flusso scheduler -> job low cards -> Twilio Studio execution, inclusi env e destinatario.
- [x] Riprodurre localmente il caso "tessere sotto 50" con i test esistenti e individuare il punto fragile non coperto.
- [x] Correggere la REST API/service mantenendo `organizations.whatsapp_e164` come destinatario canonico e Twilio Studio con `to/from_` top-level.
- [x] Aggiungere test di regressione per mittente bot configurato come numero E.164 semplice.
- [x] Eseguire test mirati backend e documentare esito/root cause nella review.

## Review (Low cards WhatsApp alert REST API bug - Apr 26, 2026)
- Root cause probabile: `execute_low_cards_alert_flow()` normalizzava il destinatario in `whatsapp:+...`, ma passava `TWILIO_WHATSAPP_FROM` raw a Twilio Studio. Se il numero del bot era salvato come `+39...` invece che `whatsapp:+39...`, la create execution riceveva un `from_` non valido.
- Fix: aggiunto `_resolve_low_cards_from()` in `app/services/twilio_notifications.py`, che normalizza anche il mittente con la stessa pipeline del destinatario e salta l'invio con log chiaro se il valore non e valido.
- Regressione: aggiunto test che verifica `TWILIO_WHATSAPP_FROM=+390299914307` venga inviato a Studio come `from_="whatsapp:+390299914307"`.
- Verifiche: `python -m pytest -q tests/test_low_cards_alert_job.py tests/test_low_cards_scheduler.py` OK (`10 passed`); `python -m py_compile app/services/twilio_notifications.py tests/test_low_cards_alert_job.py` OK.

## Plan (Communications overview KPI refinement - Apr 26, 2026)
- [x] Isolare le KPI della tab Panoramica Comunicazioni senza modificare le card KPI condivise degli altri moduli.
- [x] Sostituire icone testuali e gradienti generici con card operative a 5 colonne, icone SVG, separatore, meta di aggiornamento e badge/stato quando utile.
- [x] Rendere il nuovo componente coerente con light/dark mode e responsive mobile/tablet.
- [x] Eseguire typecheck/build frontend e smoke visuale mirato della tab Comunicazioni > Panoramica.
- [x] Documentare esito e residui nella review.

## Review (Communications overview KPI refinement - Apr 26, 2026)
- Correzione: `CommunicationsOverview.tsx` non usa piu la `KpiCard` generica per la panoramica comunicazioni; ora monta una card dedicata con icone SVG, badge, footer aggiornamento e dati reali.
- Correzione: `index.css` aggiunge lo stile `comm-kpi-*` con card piu sobrie, bordo leggero, icone quadrate, separatore footer, responsive 5/3/2/1 colonne e variante dark mode via token `--oa-*`.
- Verifiche: `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con solo warning Vite preesistente sui chunk grandi.
- Smoke visuale/contrasto su `http://127.0.0.1:8017/org-admin/comunicazioni` in light e dark OK; screenshot in `tasks/screenshots/comm-kpi-smoke-20260426/`.

## Plan (Production 500 recovery - Apr 26, 2026)
- [x] Collegarsi al server Hetzner `157.90.31.105` e identificare container/log coinvolti.
- [x] Verificare causa reale del 500 tra web, DB, worker e spazio disco.
- [x] Liberare spazio senza toccare il volume Postgres e attendere recovery DB.
- [x] Verificare HTTP pubblico, DB readiness, worker e assenza di nuovi 500.
- [x] Documentare esito e root cause.

## Review (Production 500 recovery - Apr 26, 2026)
- Root cause: filesystem root al 100%; Postgres non riusciva a scrivere `pg_logical/replorigin_checkpoint.tmp` durante il checkpoint di recovery e restituiva `database system is in recovery mode`, causando 500 sulle route che leggono DB.
- Intervento: eseguito cleanup conservativo su server (`journalctl --vacuum-size=100M`, truncate di `btmp`, `docker image prune -af`, `docker builder prune -af`) senza toccare il volume `app_pgdata`.
- Risultato: spazio root passato da `100%` a `26%` usato (`27G` disponibili); Postgres tornato `accepting connections`; `app-email-worker-1` tornato `healthy`.
- Verifica: `https://assonam.it/`, `https://assonam.it/org-admin`, `https://assonam.it/api/capabilities`, `https://assonam.it/api/auth/whoami` rispondono `200`; nessun nuovo `500` nei log web recenti.
- Hardening: aggiunto cron root giornaliero `assonam docker cleanup` per prune immagini/build cache Docker inutilizzate oltre 72h e vacuum journal a 200M, senza prune volumi.

## Plan (Org admin light/dark mode audit - Apr 25, 2026)
- [x] Mappare tutte le superfici org-admin e le regole CSS tema coinvolte, con focus su notifiche, tab attivi, KPI/icon badge, wizard, modali, builder e tabelle.
- [x] Correggere il layer tema condiviso e le utility hardcoded che producono testo scuro su sfondo scuro o testo chiaro su sfondo chiaro.
- [x] Applicare fix mirati ai componenti org-admin che bypassano i token globali, mantenendo invariati flussi/API.
- [x] Eseguire typecheck/build frontend e smoke test light/dark su route org-admin critiche.
- [x] Documentare in questa review superfici coperte, esito test e residui.

## Review (Org admin light/dark mode audit - Apr 25, 2026)
- Root cause: il bridge `.org-admin-v2` in `theme.css` forzava il workspace in light e sovrascriveva `text-white` dentro `.org-admin-content`, rompendo tab attivi, stepper e badge su sfondi scuri. Inoltre molte primitive org-admin usavano colori hex light-only.
- Correzione: `frontend/src/index.css` ora rende `--oa-*` theme-aware, aggiorna shell/sidebar/topbar, KPI, action card, stepper, empty state, badge icona e popover notifiche usando token leggibili in light/dark.
- Correzione: `frontend/src/theme.css` non forza piu l'area org-admin in light, preserva il testo bianco sugli stati selezionati, mappa colori semantici e copre utility legacy/arbitrarie (`bg-[#fb...]`, `text-[#...]`, purple, amber/rose/emerald ecc.) in dark mode.
- Correzione mirata: `OrgAdminNotificationBell.tsx` usa classi semantiche per popover, header, lista, card, empty/loading state, evitando gradienti e colori hardcoded non tematizzati.
- Verifiche: `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con solo warning Vite gia noto sui chunk grandi.
- Smoke visuale/contrasto autenticato su `http://127.0.0.1:8017`: dashboard, Comunicazioni > Campagne, Comunicazioni > WhatsApp automazioni, Soci, Tessere e popover Notifiche in light e dark. Esito OK; screenshot in `tasks/screenshots/org-admin-theme-smoke-20260425/`.

## Plan (Verify and push org admin structural rehaul - Apr 25, 2026)
- [x] Controllare branch, remote e working tree per isolare i file da includere nel push.
- [x] Rieseguire verifiche tecniche mirate prima del commit: frontend typecheck/build e test backend org-admin.
- [x] Rieseguire smoke visuale browser sulle superfici org-admin critiche prima del commit.
- [x] Creare commit con soli file pertinenti al rehaul/verifiche, lasciando fuori cache, screenshot e file temporanei non tracciati.
- [x] Pushare la branch corrente su `origin` e documentare commit/esito.

## Review (Verify and push org admin structural rehaul - Apr 25, 2026)
- Branch verificata: `feat/redesign-landing-wizard`; remote push: `origin`.
- Verifiche tecniche OK: `npm --prefix frontend run typecheck`; `npm --prefix frontend run build` (solo warning Vite gia noto sui chunk grandi); `python -m pytest -q tests/test_org_admin_communications.py tests/test_forms_module.py tests/test_org_admin_member_filters.py tests/test_org_admin_manual_member.py tests/test_org_admin_card_lot_movements.py` (`39 passed`, soli warning deprecazione esistenti); `git diff --check` OK con soli warning CRLF.
- Smoke visuale autenticato pre-push OK su backend locale `http://127.0.0.1:8017` con DB QA seedato: Comunicazioni panoramica, Nuova campagna, Builder email, Form lista, Builder form, Risposte form, Prenotazioni agenda, Mappa sala, Soci e Tessere. Risultato finale senza testi mancanti, errori console o risposte HTTP 4xx/5xx; evidenze locali in `tasks/screenshots/org-admin-visual-smoke-20260425-prepush-rerun2/`.
- Durante lo smoke ho corretto la configurazione GrapesJS del builder email per disabilitare caricamento icone CDN e telemetry esterna bloccati dalla CSP; nessuna API, route, permesso o logo ASSONAM e stato modificato.
- Staging previsto: solo file sorgente/test/docs pertinenti e `OrgAdminPrimitives.tsx`; cache, screenshot, DB temporanei e artefatti locali restano non tracciati.

## Plan (Org admin structural rehaul remediation - Apr 24, 2026)
- [x] Mappare e introdurre primitive condivise per il rehaul strutturale (`PageHeader`, `KpiCard`, `StatusChip`, `ActionCard`, `SectionPanel`, `Stepper`, `DetailPanel`, `EmptyState`) in `frontend/src/pages/org-admin/components/OrgAdminPrimitives.tsx`.
- [x] Rifare `OrgAdminCommunications.tsx` e `components/communications/CommunicationsOverview.tsx` come dashboard operativa "Centro messaggi": CTA, tab, KPI, action cards, attivita recenti, navigazione consigliata e stato integrazioni.
- [x] Rifare `components/communications/MessagesComposerHub.tsx` per nuova campagna: wizard a 5 step, form principale, card tipo/destinatari e sidebar "Riepilogo campagna" con azioni.
- [x] Rifare `components/communications/GrapesEmailBuilder.tsx` e `grapes-email-builder.css` come builder email a 3 colonne reali: blocchi/dati a sinistra, canvas centrale, proprieta blocco a destra.
- [x] Rifare `OrgAdminForms.tsx`, `components/forms/builder/FormBuilder.tsx` e `PropertiesPanel.tsx`: lista form operativa, header builder, tab coerenti, builder a 3 colonne e risposte master-detail con audit/azioni/documenti/booking.
- [x] Rifare `OrgAdminBookings.tsx` e `components/bookings/RoomFloorMap.tsx`: agenda con KPI/calendario/colonna richieste/dettaglio, sale/tavoli coerenti, mappa sala come workspace con toolbar, legenda e pannello tavolo.
- [x] Rifare `OrgAdminMembers.tsx` e `components/MembersTable.tsx`: KPI, filtri/search, tabella leggibile e master-detail laterale con tessera, attivita e azioni rapide.
- [x] Rifare `OrgAdminCards.tsx`: gestione tessere/lotti con KPI, filtri, tabella tessere/movimenti, registro lotti, progress bar e regole emissione.
- [x] Aggiornare `frontend/src/index.css`/`theme.css` solo a supporto delle nuove primitive, senza affidarsi a CSS globale come sostituto del redesign.
- [x] Eseguire typecheck/build, smoke visuale sulle superfici minime richieste e documentare checklist pagina per pagina.

## Review (Org admin structural rehaul remediation - Apr 24, 2026)
- Primitive condivise create in `OrgAdminPrimitives.tsx` e usate sulle superfici ridisegnate; CSS globale limitato al supporto della shell/primitives e non usato come semplice reskin.
- Comunicazioni panoramica: trasformata in dashboard "Centro messaggi" con CTA, tab, KPI, action cards, attivita recenti, navigazione consigliata e stato integrazioni.
- Nuova campagna: trasformata in wizard a 5 step con form dati, card tipo campagna, card destinatari e sidebar riepilogo con stima destinatari/salva/continua.
- Builder email: trasformato in editor a 3 colonne con blocchi/media/dati, canvas centrale e proprieta/stili a destra.
- Form pubblici: lista form con metriche e azioni, builder form a 3 colonne, tab struttura/stile/impostazioni/risposte, risposte master-detail con KPI, inbox, dettaglio, audit/azioni, booking e allegati normalizzati.
- Prenotazioni: agenda con KPI, calendario operativo, colonna richieste e dettaglio selezionato; corretta anche la semantica markup evitando bottoni annidati. Mappa sala come workspace con selettori, KPI, floor map, legenda e pannello tavolo.
- Soci: pagina master-detail con KPI, filtri/search, tabella selezionabile, pannello profilo rapido, tessera, attivita e azioni reali.
- Tessere: pagina gestione emissione/lotti con KPI, filtri, registro movimenti, registro lotti, progress bar, prossimo lotto automatico e regole quota.
- Screenshot smoke salvati in `tasks/screenshots/org-admin-visual-smoke-20260424-structural-rehaul/`: panoramica, nuova campagna, builder email, lista form, builder form, risposte form, agenda, mappa, soci, tessere.
- Verifiche finali: `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con warning Vite preesistente sui chunk grandi; `python -m pytest -q tests/test_org_admin_communications.py tests/test_forms_module.py tests/test_org_admin_member_filters.py tests/test_org_admin_manual_member.py tests/test_org_admin_card_lot_movements.py` OK (`39 passed`, soli warning deprecazione esistenti).

## Plan (Org admin visual QA pre-push - Apr 24, 2026)
- [x] Eseguire una prima smoke visuale locale dell'area `/org-admin` su desktop/mobile con dati seedati
- [x] Correggere i difetti di shell emersi dagli screenshot senza modificare il file/logo ASSONAM
- [x] Ricostruire il frontend e rieseguire smoke visuale con onboarding tour disattivato
- [x] Ispezionare screenshot rappresentativi di dashboard, wizard, builder, WhatsApp, prenotazioni, soci/tessere e mobile
- [x] Rilanciare verifiche tecniche minime e documentare review finale prima di qualsiasi push

## Review (Org admin visual QA pre-push - Apr 24, 2026)
- Smoke visuale autenticato completato su istanza locale `http://127.0.0.1:8017` con DB seed dedicato e browser senza estensioni, dopo aver rilevato che un'estensione/policy Edge locale forzava una resa dark non proveniente dal CSS dell'app.
- Screenshot finali salvati in `tasks/screenshots/org-admin-visual-smoke-20260424-final-light-noext/`: 26 viste tra dashboard, Comunicazioni, wizard campagne/form, builder, WhatsApp inbox/automazioni, Prenotazioni agenda/mappa, Soci, dettaglio socio, Tessere, Documenti, Contabilita, Inviti, Associazione, Billing, modali critiche e mobile.
- Nessun overlay onboarding residuo nella passata finale; le superfici ispezionate risultano light workspace con topbar scura/sidebar chiara come nei mockup, senza modifiche al file logo ASSONAM.
- Errori residui dello smoke circoscritti alla configurazione locale: `whatsapp/contacts` risponde `502` per provider Evolution abilitato senza `EVOLUTION_API_KEY`; `stripe-demo` risponde `404` per billing demo non abilitato nell'env/org seed. Le altre viste e wizard critici non hanno errori console/rete.
- Durante lo smoke ho corretto solo dati seed invalidi nel DB temporaneo (`FormSubmission.status` e `Form.form_type`) per allinearli agli enum reali; nessuna logica applicativa e stata cambiata per mascherare quei dati.
- Verifiche tecniche finali: `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con warning Vite gia noto sui chunk grandi; `python -m pytest -q tests/test_org_admin_communications.py tests/test_org_admin_whatsapp.py tests/test_org_admin_member_filters.py tests/test_org_admin_manual_member.py tests/test_org_admin_member_profile_and_card_actions.py tests/test_org_admin_card_lot_movements.py` OK, 39 passed.

## Plan (Org admin conteggi, Comunicazioni e WhatsApp names - Apr 23, 2026)
- [x] Esporre e usare metriche separate per soci attivi, richieste in verifica e totale operativo senza cambiare la formula esistente
- [x] Chiarire dashboard e pagina Tessere con confronto tra tessere emesse, richieste senza tessera e totale anagrafiche/richieste
- [x] Correggere la sync WhatsApp per evitare che il nome profilo dell'account collegato diventi display name delle chat
- [x] Sostituire i mock WhatsApp frontend con le API reali gia presenti e migliorare responsive/layout inbox
- [x] Densificare la shell Comunicazioni con header/tab piu professionali e meno card arrotondate
- [x] Eseguire test backend mirati, build frontend e documentare review finale

## Review (Org admin conteggi, Comunicazioni e WhatsApp names - Apr 23, 2026)
- Metriche: `/api/org-admin/metrics` espone anche `active_members_count`; dashboard rinomina il KPI in `Soci attivi`, mantiene `Richieste in verifica` cliccabile verso `/org-admin/soci?status=pending_verification` e aggiunge microcopy che spiega il totale operativo. La pagina `Tessere` mostra il confronto tra tessere emesse, richieste senza tessera e anagrafiche/richieste totali.
- WhatsApp backend: la sync non usa piu `pushName/profileName` outbound o valori uguali al profilo/numero della connessione come `display_name`; in quel caso il fallback e il numero del contatto. Le chat esistenti con nome profilo vengono ripulite alla lettura lista chat e i contatti reali possono sostituire il fallback numerico.
- WhatsApp frontend: `WhatsAppHub` usa le API reali per contatti, draft chat e start chat; la UI e una split-view stabile lista/thread su desktop e passa a viste separate su mobile, senza altezza fragile `h-[calc(100dvh-27rem)]`.
- UI Comunicazioni: shell, Panoramica, Email, WhatsApp e Automazioni hanno header/tab piu compatti, radius ridotti, hover stabili e colori piu allineati al design system.
- Verifiche eseguite: `python -m py_compile app/routes/org_admin.py app/routes/whatsapp_evolution.py app/services/whatsapp_sync.py` OK; `python -m pytest -q tests/test_org_admin_whatsapp.py tests/test_join_and_org_metrics_legacy_members.py` OK (`14 passed`, solo warning deprecazione esistenti); `npm --prefix frontend run build` OK con warning Vite preesistente su chunk grandi.

## Plan (Diagnosi collegamento Comunicazioni/Form -> Prenotazioni - Apr 23, 2026)
- [x] Mappare UI e routing attuali tra `ORG ADMIN > Comunicazioni > Form pubblici`, dettaglio form e pagina `Prenotazioni`
- [x] Verificare se il collegamento visuale/configurativo booking e stato rimosso, spostato o nascosto da condizioni frontend
- [x] Controllare backend e servizi del flusso `submit form -> review org admin -> conferma/rigetto -> prenotazione automatica`
- [x] Documentare causa reale, impatto e fix minimo consigliato; applicarlo se il problema e nel codice locale

## Review (Diagnosi collegamento Comunicazioni/Form -> Prenotazioni - Apr 23, 2026)
- Root cause trovata in [OrgAdminForms.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminForms.tsx): il pannello `Prenotazioni` nella tab `Impostazioni` era stato reso condizionale (`form_type === "booking" || booking_enabled`) nel commit successivo al refactor del 18 Apr 2026. Per i form generici nuovi il blocco spariva del tutto, quindi non esisteva piu alcun entry point UI per attivare `booking_enabled` e configurare il mapping verso `Prenotazioni`.
- Il backend invece risultava ancora integro: [public.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni%20clienti\Iscrizioni_clienti\app\routes\public.py) continua a creare la `booking` al submit pubblico tramite `create_booking_from_form_submission(...)`; [bookings.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni%20clienti\Iscrizioni_clienti\app\services\bookings.py) crea ancora la prenotazione se `booking_enabled/create_booking` e attivo; [org_admin.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni%20clienti\Iscrizioni_clienti\app\routes\org_admin.py) continua a sincronizzare review richiesta e stato booking su conferma/rigetto.
- Ho applicato il fix minimo sicuro: il pannello `Prenotazioni` in `Comunicazioni > Form pubblici > Impostazioni` e tornato sempre visibile, come nella versione precedente, lasciando invariata la logica di toggle e mapping dei campi.
- Verifica eseguita: `npm --prefix frontend run build` OK.

## Plan (ORG ADMIN Soci summary visual refinement - Apr 12, 2026)
- [x] Rendere piu evidente il riepilogo economico in alto nella pagina Soci senza rompere il visual language esistente
- [x] Correggere il layout desktop del pannello impostazioni tessera evitando l'accavallamento tra `Durata temporanea` e il selettore unita
- [x] Rieseguire la build frontend e documentare l'esito reale nella review

## Review (ORG ADMIN Soci summary visual refinement - Apr 12, 2026)
- Il box `Riepilogo tessere` in [OrgAdminMembers.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminMembers.tsx) ora ha una gerarchia piu netta: header esplicito, badge `Storico e stabile`, KPI principale piu evidente e contatore `Tessere emesse` separato.
- La regola di conteggio non e piu un box anonimo accanto al totale: e stata resa piu leggibile con una card laterale dedicata e microcopy piu chiaro su cosa entra davvero nel totale.
- Il pannello `Prezzi e durata` e stato spezzato in due gruppi: `Listino principale` e `Regola tessera temporanea`. Questo evita che `Durata temporanea` e il selettore `Unita` si schiaccino nella stessa mezza colonna sul desktop.
- La durata temporanea ora vive in una sezione full-width all'interno della card destra, con grid `durata + unita` dedicata e `leading-relaxed` sulle label per eliminare l'accavallamento visto nello screenshot.
- Verifica eseguita: `npm --prefix frontend run build` OK.

## Plan (Membership UI copy simplification - Apr 12, 2026)
- [x] Rimuovere completamente il blocco `Regola di conteggio` dalla summary in ORG ADMIN > Soci
- [x] Semplificare il selettore tessera nel wizard pubblico togliendo copy e placeholder non richiesti
- [x] Rieseguire la build frontend e aggiornare la review con l'esito reale

## Review (Membership UI copy simplification - Apr 12, 2026)
- In [OrgAdminMembers.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminMembers.tsx) ho rimosso del tutto il blocco `Regola di conteggio`: nella summary resta solo il KPI principale con il contatore `Tessere emesse`.
- In [Iscrizione.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\Iscrizione.tsx) la card `Tessera annuale` non mostra piu la descrizione `Valida secondo la gestione standard...`.
- Nello stesso selettore ho eliminato il placeholder `Importo da definire`: il badge prezzo compare solo se l'importo esiste davvero; se non esiste, non viene mostrato nulla.
- La tessera temporanea mantiene solo le informazioni utili: descrizione breve e badge `Durata: ...`.
- Verifica eseguita: `npm --prefix frontend run build` OK.

## Plan (ORG ADMIN Soci top section redesign from reference - Apr 12, 2026)
- [x] Riallineare la fascia alta di `ORG ADMIN > Soci` al reference fornito, eliminando copy e micro-elementi accessori
- [x] Ridisegnare KPI `Totale teorico` e card `Tessere emesse` con la stessa gerarchia del mockup
- [x] Ridisegnare il pannello `Impostazioni Tessera` con sezioni pulite e nessuna descrizione superflua
- [x] Rieseguire la build frontend e documentare l'esito reale

## Review (ORG ADMIN Soci top section redesign from reference - Apr 12, 2026)
- In [OrgAdminMembers.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminMembers.tsx) ho riscritto l'intera fascia alta di `Soci` per aderire al mockup: due colonne nette, titoli grandi `Riepilogo Tessere` / `Impostazioni Tessera`, card bianche semplici e nessun testo accessorio.
- Il lato sinistro ora ha due sole card: una con `Totale teorico in evidenza` e importo grande centrato, una con `Tessere emesse` e icona a destra, come nel reference.
- Il lato destro ora usa un'unica card impostazioni con solo i titoli `Listino Principale` e `Regola Tessera Temporanea`, separati da un divider, senza badge, descrizioni o label decorative residue.
- Ho mantenuto la logica esistente: la sezione temporanea continua a mostrarsi solo quando `custom_membership_types_enabled` e attivo.
- Verifica eseguita: `npm --prefix frontend run build` OK.

## Plan (ORG ADMIN WhatsApp Automazioni wizard redesign - Apr 12, 2026)
- [x] Riallineare la vista `WhatsApp > Automazioni` alla grammatica visiva della workspace WhatsApp, con card regole in alto e senza copy accessorio
- [x] Sostituire il form laterale lungo con un wizard a step mantenendo invariata la logica di creazione/modifica automazioni
- [x] Rieseguire la build frontend e documentare l'esito reale nella review

## Review (ORG ADMIN WhatsApp Automazioni wizard redesign - Apr 12, 2026)
- In [WhatsAppAutomationsHub.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\components\communications\WhatsAppAutomationsHub.tsx) ho sostituito il layout chiaro a due colonne con una schermata coerente con il workspace WhatsApp: card regole in alto, superfici scure essenziali e nessun box descrittivo superfluo.
- Le regole gia create ora stanno in alto come card compatte selezionabili; la card `Nuova regola` vive nello stesso grid e apre subito il wizard senza riportare l'utente a un pannello laterale tecnico.
- La creazione/modifica e diventata un wizard a step (`Origine`, `Invio`, `Template`, `Conferma`) con progressione esplicita, validazione minima per step e riepilogo finale pulito, ma senza cambiare API, payload o logica di salvataggio.
- Ho mantenuto invariati i campi dominio esistenti: modulo, evento, destinatario, sorgente numero, campo telefono/numero manuale, nome template, corpo template e stato attivo.
- Verifica eseguita: `npm --prefix frontend run build` OK. Resta il warning gia noto sui chunk Vite sopra soglia, non introdotto da questo cambio.

## Plan (ORG ADMIN Soci section scale correction - Apr 12, 2026)
- [x] Rivedere la scala visiva della fascia alta `Riepilogo Tessere / Impostazioni Tessera` rispetto al resto della dashboard
- [x] Ridurre di circa il 15% titoli, KPI e superfici senza cambiare struttura o gerarchia
- [x] Rieseguire la build frontend e documentare l'esito reale nella review

## Review (ORG ADMIN Soci section scale correction - Apr 12, 2026)
- In [OrgAdminMembers.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminMembers.tsx) ho lasciato invariata la composizione `Riepilogo Tessere / Impostazioni Tessera`, ma ho ridotto la scala complessiva del blocco per riportarla piu vicina al resto della dashboard.
- I titoli sezione, i sottotitoli interni, il valore KPI e il contatore `Tessere emesse` sono stati ridotti di circa il 10-15%, insieme a padding, raggi delle card, icona e altezza dei controlli form.
- Il risultato resta leggermente piu presente del resto della pagina, ma non ha piu la percezione di blocco oversized o "hero" staccato dal resto dell'area org-admin.
- Verifica eseguita: `npm --prefix frontend run build` OK. Resta solo il warning Vite gia noto sui chunk sopra soglia.

## Plan (ORG ADMIN Form pubblici detail redesign - Apr 12, 2026)
- [x] Analizzare il dettaglio form pubblico attuale e il reference fornito per riallineare header, tab e tab `Impostazioni`
- [x] Ridisegnare la shell del singolo form con header compatto, barra azioni e tab-card simili al mockup mantenendo invariata la logica
- [x] Ricomporre il tab `Impostazioni` in una struttura piu vicina al reference, con automazioni core, accesso/comportamento e pannello WhatsApp avanzato
- [x] Rieseguire la build frontend e documentare l'esito reale nella review

## Review (ORG ADMIN Form pubblici detail redesign - Apr 12, 2026)
- In [OrgAdminForms.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminForms.tsx) ho ridisegnato l'intera shell del dettaglio form per avvicinarla al reference: header compatto con stato pubblicazione, azioni primarie `Preview` / `Save Changes`, barra secondaria `Campaign Integrations` e navigazione a tab-card.
- Il layout editor ora usa quattro tab-card essenziali (`Structure`, `Style`, `Settings`, `Automations`) con stato attivo evidenziato, mantenendo invariati routing, stato locale e logica di salvataggio del form.
- Il tab `Settings` e stato ricomposto in tre blocchi piu netti: `Core Automations` a sinistra, `Form Behavior & Access` a destra e pannello scuro `WhatsApp Automatic (Advanced)` in basso, senza il vecchio pannello laterale lungo.
- Ho mantenuto il wiring esistente dei campi: link pubblico, URL personalizzato, visibilita, toggle pagina attiva, email notifica, automazioni email/WhatsApp/admin e template avanzati continuano a usare lo stesso `formDraft`.
- Durante la verifica ho rimosso una helper TypeScript rimasta inutilizzata (`insertDecisionTemplateVariable`) per far tornare pulita la build del frontend.
- Verifica eseguita: `npm --prefix frontend run build` OK. Resta solo il warning Vite gia noto sui chunk grandi, non introdotto da questo redesign.

## Plan (ORG ADMIN Campagne wizard stepper + CTA liberi - Apr 12, 2026)
- [x] Verificare il wizard `Campagne` e il builder Grapes per capire dove abilitare click sugli step e modifica libera dei link CTA
- [x] Rendere cliccabili gli step numerati mantenendo i bottoni `Indietro` e `Avanti`
- [x] Aggiungere nel builder un pannello contestuale per il bottone selezionato con URL libero/placeholder, applicabile anche a CTA aggiunti dopo
- [x] Rieseguire la build frontend e documentare l'esito reale nella review

## Review (ORG ADMIN Campagne wizard stepper + CTA liberi - Apr 12, 2026)
- In [MessagesComposerHub.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\components\communications\MessagesComposerHub.tsx) lo stepper del wizard ora supporta anche il click diretto sui cerchi numerati, senza rimuovere i bottoni `Indietro` e `Avanti`; la stessa UX vale sia per campagne sia per modelli.
- Nello stesso file `WizardHero` ora renderizza anche eyebrow, titolo e descrizione del flusso, cosi il componente resta coerente e non lascia props inutilizzate che bloccherebbero la build TypeScript.
- In [GrapesEmailBuilder.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\components\communications\GrapesEmailBuilder.tsx) ho aggiunto un pannello contestuale che appare quando selezioni un bottone nel canvas: permette di modificare testo CTA e `href` liberamente.
- Il pannello CTA non e limitato al bottone iniziale del template: funziona su qualsiasi `mj-button` selezionato, inclusi quelli aggiunti dopo dal blocco `Bottone CTA`, e accetta sia URL liberi sia placeholder link come `{{link_documento}}` o `{{link_form_collegato}}`.
- In [grapes-email-builder.css](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\components\communications\grapes-email-builder.css) ho aggiunto lo stile del nuovo pannello contestuale nella rail destra, mantenendo il resto della grammatica visiva del builder.
- Verifica eseguita: `npm --prefix frontend run build` OK. Resta solo il warning Vite gia noto sui chunk grandi, non introdotto da questo refinement.

## Plan (Diagnosi push/deploy branch feat-redesign-landing-wizard - Apr 12, 2026)
- [x] Verificare se i commit `693907c` e `d85ddda` sono realmente presenti su `origin/feat-redesign-landing-wizard`
- [x] Collegarsi al server Hetzner e controllare branch live, spazio disco, stato container e causa del failure mostrato negli screenshot
- [x] Liberare spazio in modo sicuro, riallineare il branch server e rieseguire un rollout mirato dei servizi runtime
- [x] Documentare l'esito reale distinguendo tra push GitHub riuscito e deploy server-side fallito

## Review (Diagnosi push/deploy branch feat-redesign-landing-wizard - Apr 12, 2026)
- Verifica locale conclusiva: il `git push` non era fallito. `git ls-remote` su `origin/feat-redesign-landing-wizard` puntava gia a `d85ddda`, quindi sia `693907c` (`Redesign public forms editor workspace`) sia `d85ddda` (`Improve campaign wizard step navigation`) erano presenti su GitHub.
- Diagnosi live su Hetzner (`root@157.90.31.105`): il branch server era fermo a `693907c`, il filesystem `/` era al `100%` e i log coincidevano con gli screenshot utente: `no space left on device` durante `docker extract` del worker video e durante `git unpack-objects`.
- Root cause: accumulo di immagini Docker dangling molto pesanti sul branch (`app-runtime` da ~554MB, `evolution-api` da ~901MB, `affiliation-video-worker` da ~2.28GB ripetuti piu volte). `docker system df -v` mostrava diversi layer non piu referenziati ma ancora residenti.
- Fix applicato live: `docker image prune -af`, `docker builder prune -af` e `journalctl --vacuum-time=7d`. Spazio recuperato: circa `6.5GB`; stato finale disco: `/dev/sda1` passato da `100%` a `26%` usato con circa `27GB` liberi.
- Dopo il cleanup, il server ha eseguito con successo `git fetch` e `git pull --ff-only`, portando `/opt/assonam/app` a `d85ddda`.
- Ho poi eseguito un rollout mirato dei servizi runtime rilevanti (`docker compose pull web email-worker low-cards-worker` e `docker compose up -d --no-deps web email-worker low-cards-worker`), evitando di toccare il video worker oltre il necessario per questa fix.
- Verifiche live finali:
- `docker compose ps`: `web`, `email-worker`, `low-cards-worker`, `db`, `affiliation-video-worker`, `evolution-api` tutti `Up`; `email-worker` e `low-cards-worker` tornati `healthy`.
- `curl -I http://127.0.0.1:8000/`: `HTTP/1.1 200 OK`.
- `git log --oneline -n 5` in `/opt/assonam/app`: testa del branch live su `d85ddda`.

## Plan (ORG ADMIN WhatsApp decision message completion - Apr 03, 2026)
- [x] Correggere il contesto dei messaggi WhatsApp di conferma/rigetto con fallback dai campi del form e placeholder booking piu robusti
- [x] Aggiungere lato API e frontend l'override opzionale del messaggio WhatsApp al momento della decisione admin, mantenendo il default/template configurato
- [x] Estendere i test backend per coprire placeholder riempiti dal payload reale e custom message override, poi rieseguire typecheck frontend e aggiornare review/lesson

## Review (ORG ADMIN WhatsApp decision message completion - Apr 03, 2026)
- Il contesto dei messaggi WhatsApp di review ora non dipende solo dalla `Booking`: data, orario e numero persone vengono ricavati con fallback dal payload del form, dalla `booking_field_mapping`, da alias comuni (`data_prenotazione`, `fascia_oraria`, `coperti`, ecc.) e, se serve, da euristiche sui campi del builder.
- In `app/services/whatsapp_automation.py` ho aggiunto i placeholder composti `{{slot_prenotazione}}`, `{{persone_prenotazione}}` e `{{riepilogo_prenotazione}}`, cosi i template booking non producono piu messaggi tronchi tipo `il ... alle ...` quando i dati arrivano dal form ma non sono ancora stati normalizzati in `booking`.
- I default booking per submit/conferma/rigetto sono stati aggiornati per usare `{{nome_associazione}}` e il riepilogo prenotazione completo, invece di concatenare pezzi potenzialmente vuoti.
- L'endpoint `PATCH /api/org-admin/forms/{form_id}/submissions/{submission_id}/status` ora accetta anche `whatsapp_message`: se l'org admin lo compila, viene inviato quel testo per quella singola decisione; se lo lascia vuoto, resta attivo il template configurato del form.
- Nel frontend `Comunicazioni > Moduli > Risposte` e `Prenotazioni` ora usano un modal dedicato che mantiene il motivo di rigetto nell'audit e offre un textarea opzionale per il messaggio WhatsApp personalizzato, con supporto ai placeholder principali.
- Verifiche eseguite:
  - `pytest tests/test_forms_module.py::test_org_admin_can_review_form_submission_and_dispatch_whatsapp tests/test_forms_module.py::test_org_admin_review_whatsapp_uses_payload_fallbacks_and_custom_override -q`
  - `npm --prefix frontend run typecheck`

## Plan (ORG ADMIN WhatsApp, inbox form e CTA campagne - Apr 03, 2026)
- [x] Correggere la normalizzazione condivisa dei numeri WhatsApp e canonicalizzare i JID/chat id Evolution con default `+39`
- [x] Rendere coerente l'invio WhatsApp post-review da `Moduli` e `Prenotazioni`, con secondo messaggio obbligatorio su conferma/rigetto
- [x] Rimuovere la CTA automatica footer dalle campagne/template e introdurre `{{link_form_collegato}}` nel contesto email, preview e builder
- [x] Rendere esplicita la gestione risposte in `Comunicazioni > Moduli` con deep-link `formId` + `formTab=responses`, CTA visibili e ponte dal dettaglio prenotazione
- [x] Eseguire test backend/frontend mirati, aggiornare la checklist con esito reale e aggiungere review finale

## Review (ORG ADMIN WhatsApp, inbox form e CTA campagne - Apr 03, 2026)
- Normalizzazione WhatsApp unificata in backend: i numeri senza prefisso internazionale ora assumono `+39`, mentre i JID 1:1 Evolution vengono canonicalizzati in `<digits>@s.whatsapp.net`; questo evita sia l'errore `338... -> +33...` sia l'apertura di chat duplicate per alias tipo `:device@s.whatsapp.net`.
- La inbox Evolution ora mergea le chat legacy equivalenti sullo stesso numero, riallinea i messaggi alla chat canonica e aggiorna il `display_name` quando arriva un nome migliore (`pushName`/`profileName`) invece di lasciare il fallback numerico.
- Il flusso review e rimasto centralizzato su `PATCH /forms/{form_id}/submissions/{submission_id}/status`: conferma e rigetto continuano a generare il secondo messaggio WhatsApp al socio, e lo stesso esito viene ora riflesso meglio anche dall'area `Prenotazioni`.
- Le campagne/template non aggiungono piu automaticamente il bottone footer solo perche esiste un `linked_form_id`; il link al form e ora esplicito tramite `{{link_form_collegato}}`, disponibile in variabili, preview, send-test e campagne reali.
- `Comunicazioni > Moduli` ora espone contatori `pending/confermate/rigettate`, CTA `Gestisci risposte`, deep-link `formId` + `formTab=responses` e un ponte diretto dal dettaglio prenotazione verso la review del modulo.
- Verifiche eseguite:
  - `pytest tests/test_forms_module.py::test_public_form_submit_sends_whatsapp_auto_reply_when_connected tests/test_forms_module.py::test_public_form_submit_sends_whatsapp_auto_reply_using_dynamic_phone_field_key tests/test_forms_module.py::test_public_form_submit_runs_whatsapp_automation_rules tests/test_forms_module.py::test_org_admin_can_review_form_submission_and_dispatch_whatsapp tests/test_org_admin_whatsapp.py::test_whatsapp_connect_send_and_disconnect tests/test_org_admin_whatsapp.py::test_whatsapp_contacts_and_draft_chat tests/test_org_admin_whatsapp.py::test_internal_webhook_merges_alias_chat_ids_and_prefers_better_contact_name tests/test_org_admin_communications.py::test_org_admin_template_library_seed_duplicate_preview_and_archive tests/test_org_admin_communications.py::test_template_preview_uses_explicit_linked_form_placeholder_without_auto_footer_cta`
  - `npm --prefix frontend run typecheck`

## Plan (ASSONAM org-admin member card email delivery regression - Apr 01, 2026)
- [x] Verificare su Hetzner il flusso reale `POST /api/org-admin/members/{id}/card-email` distinguendo enqueue applicativo, stato `email_outbox` e worker SMTP
- [x] Isolare la root cause confrontando i log live con il codice del delivery della tessera e con gli eventi del recovery/disco pieno
- [x] Applicare il fix minimo sicuro, rieseguire invio/smoke check e documentare review finale

## Review (ASSONAM org-admin member card email delivery regression - Apr 01, 2026)
- Root cause confermata live su Hetzner: il bottone org-admin `POST /api/org-admin/members/{id}/card-email` rispondeva `200` e loggava `member.card_email.manual`, ma le richieste successive riusavano lo stesso `outbox_id` gia `sent` invece di creare una nuova mail.
- Verifica DB live eseguita su `email_outbox`: il record `member_card_manual_send` per il socio testato risultava gia `sent`, e i click successivi restituivano lo stesso UUID senza alcun nuovo invio. Il worker SMTP era sano; il problema era nell'enqueue applicativo.
- Bug individuato in `app/services/member_card_delivery.py`: il resend manuale usava un `dedupe_key` stabile (`member_card_manual_send:{member}:{anno}:{numero}`), e `enqueue_email(...)` quando trova una mail gia `sent` restituisce il record esistente invece di crearne uno nuovo.
- Fix applicata: il path `queue_member_card_email(...)` ora non e piu deduplicato in modo stabile. Per il resend manuale genera una chiave univoca per chiamata; i flussi automatici/idempotenti (`member_card_ready`, `member_card_active`) restano invariati.
- Regressione aggiunta in `tests/test_org_admin_member_profile_and_card_actions.py`: due click consecutivi sul bottone devono produrre due `outbox_id` distinti e due email catturate con subject `La tua tessera {org.name}`.
- Verifiche locali: `python -m pytest -q tests/test_org_admin_member_profile_and_card_actions.py -k card_email_and_pdf_are_scoped_and_work` OK, `python -m pytest -q tests/test_integration_issue_member.py::test_issue_member_uses_custom_card_email_subject_template` OK, `python -m py_compile app/services/member_card_delivery.py tests/test_org_admin_member_profile_and_card_actions.py` OK.
- Verifiche live: patch applicata in `/opt/assonam/app/app/services/member_card_delivery.py`, rebuild mirato `docker compose build web email-worker`, restart `docker compose up -d web email-worker`, poi `docker compose ps` con `web` up e `email-worker` healthy e smoke `https://assonam.it/` / `https://assonam.it/org-admin/login` entrambi `200`.
- Nota: durante le verifiche locali un test legacy su `tests/test_document_workflow.py::test_document_approval_sends_card_email_once_for_active_member` continua ad aspettarsi il vecchio subject con `ASSO.N.A.M.`; non e una regressione di questo fix ma un'aspettativa obsoleta rispetto al nuovo default subject introdotto oggi.

## Plan (Hetzner ASSONAM 500 post-fix mail subject - Apr 01, 2026)
- [x] Verificare direttamente su Hetzner stato servizi/container e catturare il traceback reale del 500 dopo l'ultimo aggiornamento
- [x] Identificare la root cause precisa del failure server-side e confrontarla con il diff appena deployato
- [x] Applicare il fix minimo sicuro sul server/repo, rieseguire smoke check e documentare review finale

## Review (Hetzner ASSONAM 500 post-fix mail subject - Apr 01, 2026)
- Verifica live eseguita via SSH su `root@157.90.31.105`: il commit deployato sul server era effettivamente `27bf4fc`, quindi lo stesso del fix subject mail tessera.
- Root cause confermata dai log `web`, `email-worker` e soprattutto `db`: il 500 non dipendeva dal cambio mail ma da PostgreSQL in recovery loop per `No space left on device` durante il checkpoint (`pg_logical/replorigin_checkpoint.tmp`), con filesystem `/dev/sda1` saturo al `100%`.
- Saturazione individuata principalmente sotto `/var/lib/containerd` e nelle cache/immagini Docker inutilizzate, con journal systemd archiviato cresciuto fino a circa `2G`.
- Intervento live eseguito in modo conservativo sul server: `docker builder prune -af`, `docker image prune -af` e `journalctl --vacuum-size=200M`. Dopo la bonifica il disco e sceso a circa `23%` uso (`28G` liberi).
- Una volta liberato spazio, PostgreSQL ha completato il recovery ed e tornato `ready to accept connections`; ho poi eseguito `docker compose restart web email-worker` per riallineare i processi che avevano accumulato errori DB durante il loop di recovery.
- Smoke check finali live OK: `docker compose ps` con `db`, `web`, `email-worker`, `low-cards-worker`, `affiliation-video-worker` healthy/up; `https://assonam.it/`, `https://assonam.it/org-admin/login`, `https://assonam.it/iscriviti`, `https://assonam.it/sitemap.xml` e `https://assonam.it/api/auth/whoami` hanno risposto `200`.
- Conclusione: incidente infrastrutturale da disco pieno, non regressione applicativa del fix precedente. Rischio residuo: senza policy di log rotation / prune periodico Docker il problema puo ripresentarsi.

## Plan (Repository-wide cybersecurity review refresh - Apr 01, 2026)
- [x] Mappare configurazione security di base: env, settings, middleware, sessioni, CORS, static exposure e secret handling
- [x] Analizzare superfici pubbliche e flussi sensibili: iscrizione soci, upload, magic link, integrazioni, webhook, pagamenti
- [x] Analizzare piani privilegiati org-admin e super-admin: autenticazione, autorizzazione perimetro dati e funzioni ad alto impatto
- [x] Rieseguire verifiche mirate (`tests/test_security_hardening_audit.py`) e documentare findings prioritizzati con mitigazioni

## Review (Repository-wide cybersecurity review refresh - Apr 01, 2026)
- Controlli positivi confermati: session cookie server-side con `same_site="strict"` e `https_only` in contesti HTTPS, CORS ristretto a `BASE_URL/FRONTEND_URL`, security headers globali, blocco upload privati su `/uploads`, verifica firma Twilio opzionale, rate limit DB-based sulle superfici pubbliche ingest/card verify e segregazione authZ su molte query org-admin/super-admin.
- Finding ad alta priorita emersi dall'audit statico: login legacy super-admin senza rate limit, registrazione soci con password senza policy minima, token magic-link org-admin consumato in modo non atomico, logging di PII piena nei flussi signup, URL video affiliazione pubblici prevedibili e webhook SumUp senza verifica di firma/autenticita a livello trasporto.
- Rischi residui secondari: CSP ancora debole (`unsafe-inline`), copertura CSRF concentrata solo su alcuni prefissi `/api/*`, asset SVG wallet pubblicamente servibili same-origin e alcuni endpoint legacy HTML che non beneficiano degli stessi hardening piu recenti del piano API moderno.
- Verifiche eseguite: `python -m pytest -q tests/test_security_hardening_audit.py`, grep mirati su `app/config.py`, `app/main.py`, `app/middleware.py`, `app/routes/{member,join,org_admin,super_admin,admin,membership_payments,affiliation,whatsapp}.py`, `app/services/{accounting,affiliation_video,membership_payments,wallet_asset_upload}.py`.

## Plan (ASSONAM fix subject email tessera org-admin - Apr 01, 2026)
- [x] Tracciare il flusso `POST /api/org-admin/members/{id}/card-email` fino al resolver del subject e confermare la causa del leak
- [x] Rendere safe-by-default il subject della mail tessera, imponendo fallback `"La tua tessera {nome org}"` se la configurazione contiene un valore email o invalido
- [x] Aggiungere una regressione test sul flusso org-admin e documentare review finale con verifiche eseguite

## Review (ASSONAM fix subject email tessera org-admin - Apr 01, 2026)
- Root cause confermata: il bottone `POST /api/org-admin/members/{id}/card-email` usa `queue_member_card_email(...)`, che delega il subject a `resolve_card_email_subject(org)`. Se `organizations.card_email_subject` contiene erroneamente un indirizzo email, quel valore veniva usato come oggetto della mail.
- In `app/services/org_branding.py` ho reso il resolver safe-by-default: il fallback standard e ora `"La tua tessera {org_name}"`, i valori che sembrano indirizzi email vengono ignorati con warning applicativo e i template malformati/non renderizzati ricadono sul fallback pulito.
- In `app/routes/super_admin.py` ho aggiunto la stessa sanitizzazione in create/update organizzazione, cosi nuovi salvataggi non possono piu persistere un indirizzo email nel campo `card_email_subject`.
- Regressione aggiunta in `tests/test_org_admin_member_profile_and_card_actions.py`: il test simula proprio un `card_email_subject` sporco con un indirizzo email e verifica che la mail inviata da org-admin esca con subject `La tua tessera {org.name}`.
- Verifiche eseguite: `python -m pytest -q tests/test_org_admin_member_profile_and_card_actions.py -k card_email_and_pdf_are_scoped_and_work`, `python -m pytest -q tests/test_integration_issue_member.py::test_issue_member_captures_html_email_with_verification_url tests/test_integration_issue_member.py::test_issue_member_uses_custom_card_email_subject_template`, `python -m py_compile app/services/org_branding.py app/routes/super_admin.py tests/test_org_admin_member_profile_and_card_actions.py`.

## Plan (Deploy memory / OOM hardening - Mar 28, 2026)
- [x] Analizzare workflow deploy, compose e Dockerfile per identificare i punti a massimo consumo RAM e le build/container non necessarie sul server
- [x] Spostare il build pesante delle immagini da Hetzner a GitHub Actions con publish su GHCR e tagging per branch/SHA
- [x] Ridurre il deploy server-side a pull + migration + restart mirato dei soli servizi cambiati
- [x] Introdurre gating per app-runtime, video-worker ed evolution-image in base ai path cambiati
- [x] Aggiungere limiti Node heap, snapshot memoria durante build/deploy e documentazione operativa su swap e rollout sicuro
- [x] Rieseguire verifiche locali su compose/test e documentare la review finale

## Review (Deploy memory / OOM hardening - Mar 28, 2026)
- Root cause principale confermata per ispezione: il deploy precedente costruiva sul server l'immagine `web` con `tsc -b && vite build` e spesso anche `affiliation-video-worker`, introducendo picchi RAM concorrenti e container temporanei aggiuntivi per migration/health checks.
- In `.github/workflows/deploy-hetzner.yml` ho sostituito il path `build on server` con due job: `build-images` su GitHub Actions che pubblica immagini su GHCR e `deploy` che su Hetzner fa solo `pull`, migration dedicata e restart seriale dei servizi necessari.
- Il deploy ora usa gating per path: `app_runtime`, `runtime_config`, `video_worker`, `evolution`, cosi i componenti opzionali non vengono rebuildati o riavviati su modifiche non correlate.
- In `docker-compose.yml` ho introdotto immagini parametrizzate (`APP_RUNTIME_IMAGE`, `AFFILIATION_VIDEO_WORKER_IMAGE`), il service `migrate` sotto profilo `ops`, il pass-through di `SUMUP_CREDENTIALS_ENCRYPTION_KEY` e `mem_limit` per worker/servizi opzionali. In `docker-compose.evolution-lite.yml` l'immagine `evolution-api` diventa parametrizzabile e ha limite memoria dedicato.
- In `Dockerfile` e `Dockerfile.affiliation-video-worker` ho impostato `NODE_OPTIONS=--max-old-space-size=1536` per ridurre il rischio di OOM nei due build stage Node piu costosi.
- La documentazione e stata aggiornata in `DEPLOY.md` e `ENV_REQUIRED.md` con il nuovo flusso GHCR pull-based, il secret `SUMUP_CREDENTIALS_ENCRYPTION_KEY`, i tag immagine deploy-managed e le mitigazioni operative consigliate (swap 8G, `vm.swappiness=10`, snapshot memoria e ordine rollout).
- Verifiche eseguite: parsing YAML del workflow OK, `docker compose -f docker-compose.yml -f docker-compose.evolution-lite.yml --profile ops --profile video-worker config` OK, `python -m pytest -q tests/test_membership_payments_sumup.py tests/test_org_admin_manual_payment.py tests/test_member_card_verification.py tests/test_payment_method_join.py` OK (`18 passed`).

## Plan (ASSONAM SumUp quota associativa per associazione - Mar 27, 2026)
- [x] Estendere schema/modelli con configurazione payment per organization, tabella `membership_payments` e nuovi campi payment/card su `members`
- [x] Implementare service centrale SumUp con cifratura chiave, create checkout, verify checkout, webhook idempotente e fulfillment solo server-side
- [x] Aggiungere API super-admin/public/org-admin per setup payment, create-checkout, status polling e pagamento manuale coerente
- [x] Aggiornare frontend super-admin, wizard iscrizione, pagina esito pagamento e scheda socio org-admin
- [x] Aggiungere test mirati su setup, checkout, webhook, expired, manual payment e verifica tessera
- [x] Eseguire verifiche locali, poi aggiornare review finale con file toccati, flusso e rischi residui minimi

## Review (ASSONAM SumUp quota associativa per associazione - Mar 27, 2026)
- Ho esteso il dominio dati in `app/models.py` con configurazione payment per associazione (`payment_provider`, `payment_required_before_card`, importo/valuta/label, metadata SumUp cifrati) e con i nuovi flag pagamento/tessera su `Member`; la migration dedicata e `alembic/versions/r1s2u3m4u5p6_add_sumup_membership_payments.py`.
- Ho introdotto `app/services/membership_payments.py` come servizio centrale: cifratura/decrittazione della API key merchant con una sola env applicativa globale, verify della chiave via SumUp, creazione hosted checkout, verify server-side del checkout, sync stato pagamento e sync badge tessera.
- Il vincolo principale richiesto e rispettato: il fulfillment resta nel path webhook. `POST /api/webhooks/sumup` verifica sempre il checkout reale via API SumUp prima di segnare `completed`; il polling `GET /api/public/membership-payments/{payment_id}/status` e read-only e non esegue side effects.
- I checkout `expired`, `failed` e `cancelled` non vengono riusati: in `app/routes/membership_payments.py` l'endpoint `POST /api/public/orgs/{slug}/membership-payment/create-checkout` verifica l'ultimo pagamento pending e crea un nuovo hosted checkout quando il precedente e in stato terminale non pagato.
- Le chiavi SumUp per associazione restano solo nel DB/backend: setup super-admin via `app/routes/super_admin.py`, UI dedicata in `frontend/src/pages/super-admin/components/OrganizationManageModal.tsx`, nessuna chiave per org in env, nessuna key completa restituita al frontend dopo il salvataggio.
- Il wizard socio in `frontend/src/pages/Iscrizione.tsx` mostra un solo percorso quando la feature e attiva: spariscono contanti/bonifico/lista metodi e resta solo il riepilogo quota con bottone configurato `Paga con carta`; per le org senza feature il flusso legacy resta invariato.
- Ho aggiunto la pagina esito `frontend/src/pages/IscrizionePagamentoEsito.tsx`, il blocco `Pagamenti` nella scheda socio org-admin e il badge pagamento nella verifica tessera pubblica (`Pagata` / `Pagamento non registrato`) in `app/routes/public.py` e `frontend/src/pages/org-admin/OrgAdminMemberDetail.tsx`.
- Il pagamento manuale org-admin continua a funzionare ma non forza l'emissione tessera se il workflow non e pronto: aggiorna `membership_payments`, `member.payment_status` e il badge tessera, lasciando invariati i gate di approvazione/documenti.
- Verifiche completate: `python -m pytest -q tests/test_membership_payments_sumup.py tests/test_org_admin_manual_payment.py tests/test_member_card_verification.py tests/test_payment_method_join.py` (`18 passed`), `npm --prefix frontend run typecheck` OK, `npm --prefix frontend run build` OK.
- Rischi residui minimi: serve configurare in runtime la sola env globale di cifratura credenziali applicative e il webhook SumUp verso `POST /api/webhooks/sumup`; non sono necessari secret/env per singola associazione.

## Plan (ASSONAM admin magic-link debug/fix - Mar 25, 2026)
- [x] Mappare il flusso completo `POST /api/org-admin/auth/magic-link` fino a token, enqueue email e worker, confrontandolo con un flusso email funzionante
- [x] Verificare su Hetzner processi, container e log backend/worker per richieste magic link admin e individuare il punto esatto di interruzione
- [x] Identificare la root cause primaria e gli eventuali altri silent failure nella stessa area
- [x] Applicare una fix minima e robusta con logging strutturato nei punti chiave del flusso magic link admin
- [x] Aggiungere o estendere test mirati per normalizzazione email, blocchi espliciti e invio enqueue
- [x] Eseguire verifiche locali e live senza toccare gli altri flussi email, poi documentare review, comandi usati e rischio residuo

## Review (ASSONAM admin magic-link debug/fix - Mar 25, 2026)
- Flusso mappato: `POST /api/org-admin/auth/magic-link` in `app/routes/org_admin.py` fa solo rate limit IP, lookup admin, creazione `OrgAdminToken`, `enqueue_email(...)` su `email_outbox`; l'invio reale avviene via `email-worker`. Non esistono cooldown/dedup specifici sul magic link admin oltre al rate limiter IP.
- Confronto con il flusso member in `app/routes/member.py`: il member login normalizza `trim + lower` e cerca con `lower(email)`, mentre il magic link org-admin in produzione usava `AdminUser.email == email` senza normalizzazione e senza logging sui branch di blocco.
- Verifica live su Hetzner `157.90.31.105`: alcune richieste magic link apparivano nei log solo come `org_admin.magic_link_requested` senza `Generated org-admin magic link` e senza righe nuove in `email_outbox`, confermando stop prima di `enqueue_email`.
- Root cause primaria confermata: input email con spazi/maiuscole non matchava l'admin attivo (`edoardo.buffa@outlook.it`) per via del lookup esatto; root cause secondaria emersa nello stesso punto: admin inattivo (`megaurto@hotmail.it`, `is_active=false`) veniva scartato in silenzio con `200 OK` anti-enumeration e nessun motivo nei log.
- Fix minima applicata in `app/routes/org_admin.py`: normalizzazione email server-side, lookup deterministico con `lower(trim(AdminUser.email))`, selezione esplicita del primo admin eleggibile e blocchi con reason code (`admin_not_found`, `admin_inactive`, `admin_deleted`, `admin_missing_org`, `empty_email`, `admin_not_eligible`).
- Logging aggiunto nei punti chiave: richiesta ricevuta, esito normalizzazione, lookup + candidati, admin selezionato, token creato, enqueue start/end, completamento richiesta, exception completa, piu logging sul verify del token.
- Test aggiunti in `tests/test_email_flows.py` per: normalizzazione email org-admin con maiuscole/spazi e blocco logged `admin_inactive` senza enqueue.
- Verifiche locali completate: `python -m py_compile app/routes/org_admin.py tests/test_email_flows.py`; `python -m pytest -q tests/test_email_flows.py -k "org_admin_magic_link or org_admin_inactive_magic_link"`; `python -m pytest -q tests/test_email_flows.py::test_member_magic_link_flow`; `python -m pytest -q tests/test_association_email_sender.py -k "mailtrap_transport_is_used_for_association_mode or smtp_transport_still_used_for_system_mode"`.
- Deploy live eseguito copiando `app/routes/org_admin.py` su Hetzner e rebuildando il solo container `web`.
- Smoke live post-deploy: `ivanobuffa234@gmail.com` enqueue+send OK, `cw_4447413@hotmail.com` enqueue+send OK, `Edoardo.Buffa@Outlook.it` con spazi/maiuscole enqueue+send OK (`email_outbox.id=5a361fac-101c-473e-a295-5224e5726cdc`), `megaurto@hotmail.it` bloccato con log esplicito `block_reason=admin_inactive` e senza nuova riga `email_outbox`.

## Plan (ASSONAM org admin UX/UI + request decision flow - Mar 20, 2026)
- [x] Mappare i colli di bottiglia su org admin, con focus su WhatsApp workspace, forms responses e prenotazioni
- [x] Estendere backend e schema con stato richiesta `pending/confirmed/rejected`, audit review e template WhatsApp di conferma/rigetto
- [x] Implementare endpoint org admin per review submission con sync booking e dispatch WhatsApp centralizzato senza duplicati
- [x] Rifinire il frontend org admin: design system condiviso, CTA/button states, vista risposte form e quick actions sulle prenotazioni
- [x] Correggere il layout live `Comunicazioni > WhatsApp` con altezza viewport stabile, scroll interni e composer sempre visibile
- [x] Rieseguire build/test, sistemare la migration Alembic, deployare su Hetzner e fare smoke check live

## Review (ASSONAM org admin UX/UI + request decision flow - Mar 20, 2026)
- Backend esteso in [app/models.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\models.py), [app/services/forms.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\services\forms.py), [app/services/bookings.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\services\bookings.py), [app/services/whatsapp_automation.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\services\whatsapp_automation.py) e [app/routes/org_admin.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\routes\org_admin.py): `FormSubmission.status` diventa la fonte primaria della richiesta, con audit (`reviewed_at`, `reviewed_by_admin_id`, `review_reason`), template WhatsApp per-form e nuovo endpoint `PATCH /api/org-admin/forms/{form_id}/submissions/{submission_id}/status`.
- Migration additiva creata in [c91f4b7e2a10_add_form_submission_review_and_decision_templates.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\alembic\versions\c91f4b7e2a10_add_form_submission_review_and_decision_templates.py). Ho dovuto correggere il revision id iniziale perche collideva con una migration gia esistente; ora `python -m alembic heads` restituisce un solo head (`c91f4b7e2a10`).
- Frontend aggiornato in [frontend/src/index.css](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\index.css), [frontend/src/lib/api.ts](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\lib\api.ts), [frontend/src/pages/org-admin/OrgAdminForms.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminForms.tsx), [frontend/src/pages/org-admin/OrgAdminBookings.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminBookings.tsx) e [frontend/src/pages/org-admin/components/communications/WhatsAppHub.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\components\communications\WhatsAppHub.tsx): pulsanti e pannelli piu sobri/squadrati, risposte form con badge chiari e CTA `Conferma / Rigetta / Pending`, quick actions anche nel dettaglio prenotazione, template editabili per i messaggi automatici e workspace WhatsApp confinato a viewport fisso con scroll interni corretti.
- In [tests/test_forms_module.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\tests\test_forms_module.py) ho aggiunto copertura per review request + sync booking + dispatch WhatsApp e per la normalizzazione legacy `new -> pending`.
- Verifiche locali completate: `python -m pytest -q tests/test_forms_module.py -q`, `npm --prefix frontend run build`, `python -m alembic heads`.
- Deploy live eseguito su `157.90.31.105` in `/opt/assonam/app`: upload patch, `docker compose up -d --build web email-worker low-cards-worker affiliation-video-worker`, `docker compose exec -T web python -m alembic upgrade head`.
- Smoke check live completati: `docker compose ps` con servizi `web`, `email-worker`, `low-cards-worker`, `affiliation-video-worker` healthy/up; homepage e route SPA `/org-admin/comunicazioni`, `/org-admin/bookings`, `/org-admin/forms` rispondono `200`; il nuovo endpoint review richieste risponde `401 Not authenticated` senza 404, quindi e attivo sul server.
- Verifica browser live finale completata su `https://assonam.it` con token org-admin one-shot generato sul server: `Comunicazioni > Moduli`, `Prenotazioni` e `Comunicazioni > WhatsApp` caricano autenticati; nel workspace WhatsApp il composer risulta ora dentro il viewport (`bottom=951.5` su viewport `960`) con thread a scroll interno e senza crescita infinita della pagina dovuta ai messaggi.

## Plan (Form WhatsApp auto-message debug - Mar 20, 2026)
- [x] Ispezionare il flusso reale `Form -> submit pubblico -> candidate/dispatch WhatsApp` per capire come viene risolto il numero destinatario
- [x] Verificare su server/log live perché il test utente non ha prodotto nessun invio
- [x] Correggere il comportamento o il copy UI se il numero destinatario o le condizioni di invio non sono chiare/sbagliate
- [x] Rieseguire test/build, push e deploy del fix se necessario

## Review (Form WhatsApp auto-message debug - Mar 20, 2026)
- Root cause confermata su produzione: il form `test` (`id=7`) aveva sia il toggle legacy `whatsapp_auto_reply_enabled = true` sia una nuova regola in `whatsapp_automations` con `trigger_event = request_received` e `phone_field_key = telefono_3c52el`; nessuna delle due arrivava a inviare davvero.
- Il vecchio auto-reply per-form risolveva il numero solo su chiavi payload rigide (`phone`, `telefono`, `cellulare`, ecc.), quindi ignorava i veri campi `phone` del builder quando la `field_key` era dinamica come `telefono_3c52el`.
- Le nuove `Automazioni WhatsApp` erano solo CRUD/UI: risultavano collegate ai form ma il submit pubblico non le eseguiva affatto. Per questo attivarle da `Comunicazioni > Form > Impostazioni` non produceva messaggi.
- Fix backend in [whatsapp_automation.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\services\whatsapp_automation.py): ora il numero viene risolto dai veri campi `phone` del form, le automazioni attive vengono eseguite al submit e `request_received` viene trattato come evento valido sul submit pubblico.
- Fix integrazione submit in [public.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\routes\public.py): dopo il salvataggio submission vengono valutati sia il legacy auto-reply sia le nuove regole `whatsapp_automations`.
- Copy chiarita in [OrgAdminForms.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminForms.tsx): il blocco `WhatsApp automatico` viene esplicitato come risposta rapida legacy distinta dalle nuove regole in `Comunicazioni > WhatsApp`.
- Copertura aggiunta in [test_forms_module.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\tests\test_forms_module.py) per auto-reply legacy con `field_key` telefono dinamica ed esecuzione reale di una regola `whatsapp_automations` sul submit pubblico.
- Verifiche locali completate: `python -m pytest -q tests/test_forms_module.py -q`, `python -m py_compile app/services/whatsapp_automation.py app/routes/public.py`, `npm --prefix frontend run build`.
- Push/deploy completati sul branch `feat/redesign-landing-wizard` con commit `3cdaaf4`; Hetzner `157.90.31.105` aggiornato e stack riallineato via `docker compose -f docker-compose.yml -f docker-compose.evolution-lite.yml up -d --build ...` seguito da `up -d --remove-orphans` per superare il race del daemon durante il recreate dei worker.
- Verifica live reale eseguita sul form pubblico `golden-filippini-qualificati-srls/nuovo-form`: submission `id=8` creata con `telefono_3c52el = +39 333 1234567`. I due messaggi outbound registrati in DB (`whatsapp_messages.id = 1468, 1469`) hanno `recipient_phone = +393331234567`, quindi il routing ora usa correttamente il numero inserito nel form.
- Il mancato recapito residuo non dipende piu dal codice del form: Evolution Lite risponde `400 Bad Request` con payload `exists=false` per `393331234567@s.whatsapp.net`, cioe il numero di test usato nella prova live non risulta raggiungibile su WhatsApp.

## Plan (WhatsApp inbox restore + admin cleanup - Mar 19, 2026)
- [x] Ripristinare la vista principale WhatsApp con inbox, QR code e stato connessione
- [x] Spostare le automazioni WhatsApp in una sottovista interna senza sostituire la chat
- [x] Rimuovere il blocco hero/promozionale dal builder automazioni e rendere la UI piu amministrativa
- [x] Rieseguire build frontend, verificare live e riallineare Hetzner

## Review (WhatsApp inbox restore + admin cleanup - Mar 19, 2026)
- La tab `Comunicazioni > WhatsApp` non sostituisce piu la chat con le automazioni: la vista primaria e tornata `Chat e connessione`, con inbox, stato sessione e QR code gestiti da [WhatsAppHub.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\components\communications\WhatsAppHub.tsx).
- Le automazioni restano disponibili come sottovista interna `Automazioni`, mantenendo compatibili i deep-link esistenti dai form (`tab=whatsapp&formId=...`) tramite la logica aggiornata in [OrgAdminCommunications.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminCommunications.tsx).
- In [WhatsAppAutomationsHub.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\components\communications\WhatsAppAutomationsHub.tsx) ho rimosso il blocco hero/marketing e ridotto l'area a una UI piu amministrativa: intestazione compatta, contatori discreti e builder senza storytelling promozionale.
- Verifica locale: `npm --prefix frontend run build` OK.
- Verifica live su `https://assonam.it`: inbox WhatsApp visibile di default, sottovista `Automazioni` raggiungibile, vecchio hero assente (`HAS_OLD_HERO=false`), nuove evidenze salvate in `tasks/screenshots/communications-live-whatsapp-inbox-20260319.png` e `tasks/screenshots/communications-live-whatsapp-automations-clean-20260319.png`.

## Plan (Comunicazioni live verification + push + deploy - Mar 19, 2026)
- [x] Chiudere il rebase del refactor Comunicazioni e dell'hotfix barra top integrando i conflitti con `origin/feat/redesign-landing-wizard`
- [x] Rieseguire build frontend e test backend mirati per confermare che entrambe le passate siano stabili
- [x] Verificare live su `assonam.it` il nuovo editor Comunicazioni, la barra top fissa e la sezione WhatsApp/Form collegate
- [x] Pushare entrambi i cambi sul branch di deploy
- [x] Allineare Hetzner, eseguire eventuale migration Alembic e fare smoke check finale server-side

## Review (Comunicazioni live verification + push + deploy - Mar 19, 2026)
- Rebase completato sul branch reale `feat/redesign-landing-wizard`, con push finale dei commit `75b6744`, `d14e89b`, `f064767`, `0842a57`, `d8df35e`.
- Durante il deploy è emerso un problema strutturale Alembic: il repo aveva due `head` (`c7d8e9f0a1b2`, `e6f7a8b9c0d1`). Ho corretto alla radice con la merge migration pura `47b20c34c33e_merge_whatsapp_automation_heads.py`, poi ripushato e riallineato Hetzner.
- Il deploy server-side è stato eseguito su `157.90.31.105` in `/opt/assonam/app` usando `docker compose -f docker-compose.yml -f docker-compose.evolution-lite.yml ...`, così `evolution-api` resta nello stack durante il recreate.
- Verifiche locali eseguite: `python -m py_compile app/models.py app/routes/org_admin.py app/services/forms.py app/services/whatsapp_automations.py app/services/email_templates.py`, `npm --prefix frontend run build`, `python -m pytest -q tests/test_org_admin_communications.py tests/test_forms_module.py` (`24 passed`).
- Verifica browser live completata su `https://assonam.it` con sessione org-admin reale: barra `Comunicazioni` senza overflow orizzontale (`scrollWidth == clientWidth`), editor campagna full-page aperto correttamente, tab `WhatsApp` con builder `Automazioni` visibile e blocco `Automazioni collegate` confermato nel tab `Impostazioni` del form.
- Evidenze salvate in `tasks/screenshots/`: `communications-live-topbar-20260319.png`, `communications-live-campaign-editor-20260319.png`, `communications-live-whatsapp-automations-20260319.png`, `communications-live-form-automations-20260319.png`.
- Stato finale server: `web`, `email-worker`, `low-cards-worker`, `affiliation-video-worker` ed `evolution-api` tutti `Up`, con i worker ed Evolution in stato `healthy`; `alembic current` sul server punta a `47b20c34c33e (head)`.

- [x] Analizzare la barra superiore di `Comunicazioni` e il riferimento visuale allegato per allineare struttura e gerarchia
- [x] Rifare la sub-navigation di `Comunicazioni` come barra fissa non scrollabile con colonne, icone e microcopy
- [x] Verificare il build frontend e documentare la review finale

## Review (Comunicazioni top bar refinement - Mar 19, 2026)
- La sub-navigation interna di `Comunicazioni` in [OrgAdminCommunications.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminCommunications.tsx) non usa piu pill tonde o scrolling orizzontale: ora e una strip fissa a colonne con icona, titolo e sottotitolo, coerente con il riferimento allegato.
- Ho rimosso la semantica generica dei vecchi tab e introdotto etichette piu editoriali e leggibili nella barra: `Modelli`, `Form pubblici`, `Invii e statistiche`, `WhatsApp`, `Impostazioni email`.
- La gerarchia visuale e piu pulita: contenitore unico chiaro, divisori verticali, stato attivo su superficie bianca con accento inferiore, hover discreto sugli altri elementi.
- Il layout resta responsive ma non diventa una barra a scorrimento: su desktop si dispone in 5 colonne, su viewport piu stretti va a griglia.
- Verifica: `npm --prefix frontend run build` OK.

- [x] Mappare e rifinire l'architettura UI di `Comunicazioni` per separare chiaramente library/lista e editing full-page di `Modelli` e `Campagne`
- [x] Rifattorizzare `MessagesHub` in editor dedicati a tutta larghezza, senza sidebar stretta con scroll interno, mantenendo API e logica esistenti
- [x] Introdurre il concetto esplicito di `Automazioni WhatsApp` con builder leggibile, summary in linguaggio naturale e collegamento form/template/numero
- [x] Esporre le automazioni collegate dentro il dettaglio/configurazione di ciascun form con stati ON/OFF e azioni di configurazione
- [x] Aggiornare copy e microcopy per chiarire origine trigger, destinatario, sorgente numero e template WhatsApp
- [x] Eseguire verifiche mirate backend/frontend e documentare review finale con eventuali migration richieste e checklist QA manuale

## Review (ASSONAM Comunicazioni + WhatsApp automation UX - Mar 19, 2026)
- `Comunicazioni` ora separa chiaramente library e editing: `Campagne` e `Modelli` restano in vista lista, mentre l'editing avviene in un workspace full-page dedicato con header operativo, colonne ampie, sezioni grandi e senza sidebar stretta con scroll interno.
- `MessagesHub` e il rendering email sono stati estesi in modo incrementale, mantenendo storage e logica esistenti ma aggiungendo preset visuali, branding esplicito, blocchi opzionali, CTA/linking piu leggibili e anteprima integrata nel flusso.
- Nuova sezione `WhatsApp > Automazioni` con builder leggibile, copy esplicita su origine/evento/destinatario/numero/template e riassunto naturale della regola.
- I form pubblici ora espongono `Automazioni collegate` nel dettaglio/configurazione con card ON/OFF per email, WhatsApp, admin notification e reminder, oltre alla relazione WhatsApp descritta in linguaggio naturale.
- Backend introdotto in modo minimale con nuova tabella `whatsapp_automations`, endpoints CRUD dedicati e serializzazione delle automazioni dentro il payload Forms senza rompere le API esistenti di template/campagne.
- Migration richiesta: applicare `alembic/versions/c7d8e9f0a1b2_add_whatsapp_automations.py`.
- Verifiche eseguite: `npm --prefix frontend run build` OK; `python -m pytest -q tests/test_org_admin_communications.py tests/test_forms_module.py` OK (`23 passed`).
- QA manuale suggerita:
- Aprire `Comunicazioni > Modelli` e `Comunicazioni > Campagne`, entrare in modifica e verificare che tutto l'editing principale avvenga nel flusso pagina senza pannelli stretti scrollabili.
- Creare/modificare una automazione WhatsApp, cambiare form/trigger/sorgente numero e controllare aggiornamento del riassunto naturale e del filtro per form.
- Aprire un form pubblico in `Comunicazioni > Moduli` e verificare la presenza di `Automazioni collegate`, stati ON/OFF e deep-link verso `tab=whatsapp`.

- [x] Analizzare il video reference `Baton_Draft_02_Final.mp4` e fissare i pattern da replicare (durata ~50s, demo UI orizzontale, gradient teal, zoom lenti, cursor, CTA finale)
- [x] Definire 3 varianti ASSONAM focalizzate su procedura guidata per ads Google/Meta con copy e scene distinti ma stesso linguaggio visivo
- [x] Preparare/riusare screenshot e asset ASSONAM utili al walkthrough, scartando quelli non adatti o corrotti
- [x] Rifare la composition Remotion in `marketing/remotion-ads` per un demo video 16:9 stile Baton con scene sequenziate, transizioni morbide, device frame e CTA finale
- [x] Selezionare o generare una music bed/SFX adatti e collegarli alle varianti mantenendo il render robusto anche senza audio opzionale
- [x] Renderizzare 3 MP4 finali, verificare esito reale dei file prodotti e documentare review finale

## Review (ASSONAM guided demo ads - Mar 17, 2026)
- Video reference analizzato con `ffprobe` e contact sheet: pattern chiave replicati nel nuovo template Remotion sono durata ~49-50s, layout orizzontale 16:9, UI su superfici bianche, gradient teal/cream, zoom lenti, piccoli card overlay, movimento cursore e chiusura con CTA pulita.
- Nuovi asset dati introdotti in `marketing/remotion-ads/data/assonam-demo-variants.json` con 3 storie distinte ma coerenti: `guidedMember`, `guidedAffiliation`, `guidedOperations`.
- Nuova composition `AssonamGuidedDemo` collegata al `Root` Remotion con 3 composition dedicate (`GuidedDemo-*`), durata `1470` frame a `30fps`, output `1920x1080`.
- Gli screenshot ASSONAM riusati nel walkthrough sono stati selezionati tra quelli gia presenti in `marketing/remotion-ads/public/screenshots`; `screen1.png` non e stato usato perche corrotto/errato (mostrava un errore runtime).
- Audio/SFX: mantenuta la bed `public/audio/music/corporate_bed.mp3` con loop su tutta la timeline e cue sonori leggeri (`transition_whoosh`, `ui_click`, `success_chime`) per restare robusti in render headless senza dipendere da nuova generazione remota.
- Render finali prodotti con successo:
- `marketing/remotion-ads/out/assonam_guided_member.mp4` (`49.05s`, `19.6 MB`)
- `marketing/remotion-ads/out/assonam_guided_affiliation.mp4` (`49.05s`, `20.0 MB`)
- `marketing/remotion-ads/out/assonam_guided_operations.mp4` (`49.05s`, `20.6 MB`)
- Verifiche eseguite: `npx tsc --noEmit` OK; `npx remotion compositions src/index.ts` OK; render reali delle 3 varianti OK; contact sheet di controllo sul file `assonam_guided_member.mp4` OK.

- [x] Profilare pipeline renderer video post-affiliazione e individuare i colli di bottiglia reali
- [x] Aggiungere timing logs dettagliati backend/renderer per queue, bundle, render, encode e finalize
- [x] Implementare riuso persistente del bundle/composition probe e ridurre overhead per job
- [x] Ottimizzare asset/effetti HUD e operazioni ripetute nel frame loop senza cambiare output 720p/24fps
- [x] Eseguire benchmark comparativi + test mirati e documentare l'impatto

## Accounting refactor super admin + org admin (Mar 11, 2026)
- [x] Analizzare il modulo Contabilità corrente (`organization_shared_documents` + toggle `accounting_enabled`) e definire il perimetro compatibile del refactor
- [x] Introdurre il nuovo dominio dati `accounting_folders`, `accounting_categories`, `accounting_documents`, `accounting_share_links` con modelli SQLAlchemy coerenti e relazioni robuste
- [x] Creare migration Alembic con backfill dei documenti contabili esistenti verso cartella/categoria di fallback senza rompere storage, auth o toggle attuale
- [x] Aggiornare bootstrap/init path dev per tabelle nuove e seed/backfill idempotente minimo richiesto
- [x] Implementare API FastAPI per cartelle, categorie, documenti contabili, preview web, download sicuro e link di condivisione revocabili
- [x] Mantenere compatibilita del modulo documenti generali esistente e del toggle Contabilità lato organizzazione
- [x] Rifare la UX org admin Contabilità con archivio a cartelle/categorie/documenti, filtri, ricerca, preview e azioni rapide
- [x] Creare/migliorare la UX super admin per gestione cartelle, categorie e upload/modifica documenti contabili
- [x] Eseguire test/build/verifiche mirate e documentare la review finale

## Review (Accounting refactor super admin + org admin - Mar 11, 2026)
- Dominio contabile separato introdotto con `accounting_folders`, `accounting_categories`, `accounting_documents`, `accounting_share_links`, mantenendo intatto il toggle esistente `organizations.accounting_enabled` e il modulo documenti generali basato su `organization_shared_documents`.
- Compatibilita legacy preservata: gli upload contabili che passano ancora dalla route super-admin legacy vengono specchiati anche nel nuovo archivio; i documenti contabili legacy gia assegnati vengono backfillati in cartella fallback `Archivio` e categoria fallback `Generale` per ogni organizzazione.
- Backend completato con CRUD cartelle/categorie/documenti, preview inline sicura, download autenticato, grouping/filtering per org admin e link di condivisione revocabili con token ed expiry opzionale.
- Frontend org admin rifatto con archivio accordion `cartella -> categoria -> documenti`, ricerca, filtri, preview PDF/immagini, azioni rapide `Apri`, `Scarica`, `Preview`, `Condividi` e fallback pulito per file non previewabili.
- Frontend super admin esteso con workspace dedicato Contabilità dentro Documenti, comprensivo di gestione cartelle/categorie, upload/edit documento, preview e revoca link condivisi, senza rimuovere il workspace documenti generali.
- Durante la verifica reale della chain Alembic su SQLite sono emerse incompatibilita legacy non legate solo alla nuova feature; sono state corrette in modo conservativo nelle migration `m4n5o6p7q8r9`, `x7y8z9a0b1c2`, `g2h3i4j5k6l7`, `a1c9e8f7b6d5`, `f0a1b2c3d4e5`, `4a5b6c7d8e9f`, `6c7d8e9f0a1b` per consentire `alembic upgrade head` su DB SQLite pulito senza alterare il percorso Postgres.
- Verifiche eseguite: `python -m alembic upgrade head` su `sqlite:///tmp_accounting_mig.db` OK; `python -m pytest -q tests/test_accounting_archive.py tests/test_org_shared_documents.py tests/test_org_admin_notifications.py` OK (`13 passed`); `npm --prefix frontend run build` OK.

## Form builder stabilization (Mar 11, 2026)
- [x] Verificare gli errori reali di `npm --prefix frontend run build` e mappare file/import/props coinvolti nel builder form pubblici
- [x] Allineare `FormPublicCanvas` e i suoi chiamanti rimuovendo props zombie e mismatch di tipi
- [x] Eliminare codice morto e stati/handler non usati in `OrgAdminForms.tsx` senza introdurre nuove feature
- [x] Tipizzare esplicitamente gli helper builder condivisi e correggere i warning/errori TypeScript residui
- [x] Rieseguire `npm --prefix frontend run build` e documentare cause/fix finali

## Review (Form builder stabilization - Mar 11, 2026)
- I file segnalati come mancanti esistono già: [builder/utils.ts](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\forms\builder\utils.ts) e [ImageUpload.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\forms\builder\ImageUpload.tsx). Il problema reale era un drift tra il nuovo builder, i tipi condivisi e `OrgAdminForms.tsx`, non file assenti.
- `FormPublicCanvas` è stato riallineato ai chiamanti reali in [FormPublicCanvas.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\forms\FormPublicCanvas.tsx): props esplicite, tipo `PageTheme` dedicato e rimozione del prop zombie `heroLabel` dal chiamante in [OrgAdminForms.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminForms.tsx).
- Gli helper del builder sono stati resi coerenti in [builder/utils.ts](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\forms\builder\utils.ts): `encodeField(...)` ora restituisce un payload tipizzato invece di `unknown`, così le chiamate a `createOrgAdminFormField` e `updateOrgAdminFormField` non rompono più il build.
- Pulizia TypeScript minima in [FormBuilder.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\forms\builder\FormBuilder.tsx) e [PropertiesPanel.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\forms\builder\PropertiesPanel.tsx): rimosso import inutilizzato e parametro non letto.
- In [OrgAdminForms.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminForms.tsx) non ho introdotto nuove feature: ho solo riallineato import/tipi e reso esplicito che alcuni handler legacy del vecchio editor campi non sono agganciati alla UI del builder corrente, evitando che TypeScript blocchi la build.
- Verifica finale: `npm --prefix frontend run build` OK.

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

## Plan (Communications wizard rollback + redesign - Mar 20, 2026)
- [x] Recuperare il linguaggio UX del wizard `Iscrizione` e riportarlo dentro `Campagne` e `Modelli`
- [x] Rifare il wizard campagne con hero, stepper orizzontale, card centrale e DnD integrato senza sidebar soffocanti
- [x] Rifare il wizard modelli con la stessa grammatica visuale, piu corto e con preview ampia realmente leggibile
- [x] Sistemare il comportamento responsive desktop/mobile e preservare azioni `salva`, `programma`, `invia`, `duplica`, `archivia`, `elimina`
- [x] Rieseguire build frontend e aggiornare review + lessons

## Review (Communications wizard rollback + redesign - Mar 20, 2026)
- In [MessagesHub.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\components\communications\MessagesHub.tsx) i wizard `Campagne` e `Modelli` sono stati riportati a una shell ispirata direttamente a [Iscrizione.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\Iscrizione.tsx): breadcrumb minimale, hero centrato, stepper orizzontale, card principale ampia e footer con CTA primarie/secondarie leggibili.
- Il wizard campagne non usa piu header sticky e griglie laterali soffocanti come layout dominante: i passi `Brief`, `Messaggio`, `Destinatari`, `Review` vivono dentro card larghe e leggibili, con DnD dei blocchi mantenuto ma inserito nel corpo del wizard.
- Il wizard modelli e ora piu corto ma coerente: `Fondamenta`, `Messaggio`, `Review`, con preview ampia tramite `PreviewCanvas`, azioni `Duplica`, `Archivia`, `Elimina` e `Salva` tenute nel footer finale senza schiacciare il contenuto.
- Ho riusato la grammatica visiva gia presente in `signup-wizard-shell` e `signup-wizard-card`, invece di introdurre un terzo linguaggio UI dentro `Comunicazioni`.
- Verifica eseguita: `npm --prefix frontend run build` OK.

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

---

## Numbering scopes hybrid (Mar 17, 2026)
- [ ] Aggiungere schema additivo `numbering_scopes` + colonne nullable su organizations/card_batches/members con migration Alembic idempotente
- [ ] Estendere bootstrap/repair locale (`init_db.py`) per dev/test SQLite esistenti senza introdurre path distruttivi
- [ ] Aggiornare modelli SQLAlchemy e introdurre helper/backend service per scope, stato first-use e audit metadata
- [ ] Rendere `allocate_next_card` e `release_card_number` scope-aware con fallback legacy invariato quando `organizations.numbering_scope_id` e `NULL`
- [ ] Rendere scope-aware i flussi Super Admin di range/lotti e aggiungere endpoint GET/PATCH configurazione numerazione organizzazione
- [ ] Estendere creazione/modifica organizzazione Super Admin con default `Condivisa ASSONAM`, warning storico e conferma esplicita UI
- [ ] Aggiungere test backend mirati per allocator scoped, first-use safety, fallback legacy e API admin numbering
- [ ] Eseguire verifiche mirate (pytest/backend + build frontend) e documentare review finale con audit query read-only consigliate
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

## Deploy fix for stale container name conflict (Mar 11, 2026)
- [x] Analizzare il log GitHub Actions che fallisce su `app-email-worker-1 already in use`
- [x] Correggere il cleanup pre-`up` nel workflow Hetzner senza toccare volumi o database
- [x] Verificare che il workflow intercetti i nomi container reali prodotti da Compose

## Review (Deploy fix for stale container name conflict - Mar 11, 2026)
- Root cause: il cleanup cercava pattern legacy `_app-email-worker-1`, ma il nome reale usato da Docker Compose nel deploy era `app-email-worker-1`; il container stale quindi sopravviveva e il successivo `docker compose up -d --remove-orphans` falliva con conflict sul nome.
- Workflow corretto in [.github/workflows/deploy-hetzner.yml](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\.github\workflows\deploy-hetzner.yml): il loop di cleanup ora cerca e rimuove in modo robusto sia gli exact-name `^/app-...-1$` sia le varianti `app-...-1` per `web`, `email-worker`, `low-cards-worker` e `affiliation-video-worker`.
- Il fix resta data-safe: non usa `down -v`, non tocca named volumes e non tocca Postgres; rimuove solo container stale che bloccano la recreate.

## Form builder drag-drop fix (Mar 11, 2026)
- [x] Analizzare DndContext, palette draggable, canvas droppable e flusso palette -> canvas
- [x] Correggere la logica di drop/inserimento senza toccare feature non richieste
- [x] Verificare reorder interno e build frontend

## Review (Form builder drag-drop fix - Mar 11, 2026)
- Causa precisa: il canvas non era registrato come droppable con id stabile, quindi nel path palette -> canvas `onDragEnd` riceveva spesso `over = null` oppure un target non riconosciuto; di conseguenza la branch di creazione non scattava e il blocco tornava in libreria.
- [FormBuilder.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\forms\builder\FormBuilder.tsx): aggiunti `useDroppable`, id stabile `form-builder-canvas`, distinzione esplicita `source=palette` vs `source=canvas`, inserimento reale nello state locale al drop, highlight del canvas quando riceve il drag e `pointer-events-none` sull'empty state per non interferire col drop.
- [PaletteItem.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\forms\builder\PaletteItem.tsx) e [CanvasItem.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\forms\builder\CanvasItem.tsx): payload DnD riallineati con `source` chiaro per distinguere creazione da palette e reorder interno.
- [utils.ts](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\forms\builder\utils.ts): introdotta factory minima `createFieldFromPaletteItem(...)` e costante condivisa `FORM_BUILDER_CANVAS_ID` per creare un blocco valido senza cambiare il modello dati backend.
- Esito atteso del fix: il drop palette -> canvas ora crea subito il blocco nello state del builder, lo rende visibile nel canvas, selezionato e pronto per il pannello proprietà; il reorder interno continua a passare dal branch separato `source=canvas`.
- Verifica eseguita: `npm --prefix frontend run build` OK. Nel workspace attuale non è presente un harness browser/e2e già configurato, quindi la conferma funzionale deriva dal path DnD corretto nel codice e dalla build verde, non da un test UI automatizzato.


## Communications selected recipients (Mar 11, 2026)
- [x] Analizzare architettura attuale campagne/template/composer della sezione Comunicazioni org admin
- [x] Estendere backend campagne con `recipient_mode` e `member_ids` validati per organizzazione senza rompere broadcast e variabili automatiche
- [x] Aggiornare UI composer con modalita destinatari, ricerca soci e multi-select coerente con il pannello
- [x] Rendere chiaro nello storico se l'invio e broadcast o mirato a soci selezionati
- [x] Eseguire test/build mirati e documentare la review finale

## Review (Communications selected recipients - Mar 11, 2026)
- Architettura attuale confermata prima del fix: backend campagne/template in [app/services/email_campaigns.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\services\email_campaigns.py) e [app/routes/org_admin.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\routes\org_admin.py), modello persistente in [app/models.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\models.py), composer/storico in [MessagesHub.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\components\communications\MessagesHub.tsx) e contratti client in [frontend/src/lib/api.ts](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\lib\api.ts).
- Backend esteso senza rompere il broadcast: `email_campaigns` ora salva `recipient_mode` (`all_members` o `selected_members`) e `selected_member_ids_json`; migration dedicata e repair path idempotente in [8b9c0d1e2f3_add_campaign_selected_recipients.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\alembic\versions\8b9c0d1e2f3_add_campaign_selected_recipients.py) e [init_db.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\init_db.py) mantengono retrocompatibilita per tutte le campagne esistenti con default `all_members`.
- La logica invio continua a rendere le variabili per destinatario singolo: [app/services/email_campaigns.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\services\email_campaigns.py) valida ownership dei soci selezionati, impedisce lista vuota in modalita mirata, scarta soci fuori associazione e poi passa sempre dal rendering per-recipient gia esistente, quindi `{{nome_socio}}`, `{{cognome_socio}}`, `{{numero_tessera}}` e `{{nome_associazione}}` restano corretti anche per invii multipli mirati.
- API org admin aggiornate in [app/routes/org_admin.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\routes\org_admin.py): create campaign accetta `recipient_mode` e `member_ids`, serializer espone `target_summary`, `selected_member_count` e `planned_recipient_count`, e il nuovo endpoint `/api/org-admin/communications/member-search` cerca solo soci dell'associazione per nome, cognome, email o numero tessera.
- Frontend aggiornato in [MessagesHub.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\components\communications\MessagesHub.tsx) e [frontend/src/lib/api.ts](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\lib\api.ts): il composer mostra una sezione Destinatari con scelta chiara tra broadcast e soci selezionati, ricerca con debounce minimo, aggiunta/rimozione soci tramite chip, validazione UX interna se la lista e vuota, e storico/dettaglio che distinguono `Tutti i soci`, `1 socio selezionato` o `N soci selezionati`.
- Verifiche eseguite: `python -m pytest -q tests/test_org_admin_communications.py` -> `12 passed`; `npm --prefix frontend run build` OK; `python -m alembic upgrade head` su `sqlite:///tmp_comms_selected.db` OK.


## Dark mode native theme system (Mar 11, 2026)
- [x] Analizzare la gestione attuale di colori e stili in dashboard e sito base
- [x] Introdurre un theme system con token CSS, provider frontend e bootstrap anti-flash
- [x] Aggiungere switch tema persistente con opzioni Chiaro, Scuro e Sistema
- [x] Adattare layout e componenti UI principali alla nuova base light/dark
- [x] Verificare build frontend e documentare i risultati finali

## Review (Dark mode native theme system - Mar 11, 2026)
- Analisi iniziale: il frontend usava Tailwind con palette 
eutral custom e molte utility hardcoded (g-white, 	ext-neutral-*, order-neutral-*, g-[#f8f9fa]/50) distribuite in layout e pagine, senza alcun provider tema o token semantici condivisi. Il punto giusto da stabilizzare era quindi un layer tema centrale, non un rewrite pagina-per-pagina.
- Theme system introdotto in [ThemeProvider.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\theme\ThemeProvider.tsx), [ThemeToggle.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\theme\ThemeToggle.tsx) e [theme.css](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\theme.css): supporta light, dark, system, persistenza in localStorage, sincronizzazione con prefers-color-scheme, aggiornamento di meta[name=theme-color] e bootstrap in [frontend/index.html](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\index.html) per evitare flash del tema sbagliato al primo paint.
- Base visiva: [theme.css](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\theme.css) introduce token semantici per background, surface, text, border, accent, focus, overlay, input e shadow. Sopra questi token ho messo un layer di compatibilita mirato per le utility Tailwind piu usate dall'app (g-white, g-neutral-50, 	ext-neutral-*, order-neutral-*, hover/table states), cosi la dark mode copre dashboard e pagine pubbliche principali senza rompere il tema light o richiedere un refactor dispersivo dell'intero codicebase.
- Switch tema agganciato ai layout principali: [Layout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\Layout.tsx), [DashboardLayout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\dashboard\DashboardLayout.tsx), [OrgAdminLayout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminLayout.tsx), [SuperAdminLayout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\super-admin\SuperAdminLayout.tsx) e [AdminLayout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\admin\AdminLayout.tsx). In pratica ora dashboard socio, org admin, super admin e header pubblico condividono lo stesso controllo tema e la stessa base cromatica.
- Componenti UI adattati: [ToastProvider.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\ui\ToastProvider.tsx), [ModalShell.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\ui\ModalShell.tsx), [ConfirmModal.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\ui\ConfirmModal.tsx) e [Skeleton.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\ui\Skeleton.tsx) ora leggono il layer tema invece di assumere sfondi bianchi/light-only. Lo stesso vale per header, nav mobile e superfici condivise tramite override centralizzati in 	heme.css.
- Verifica finale eseguita: 
pm --prefix frontend run build OK.
## Dark mode theme switch UX fix (Mar 11, 2026)
- [x] Individuare il duplicato del toggle e i mount multipli tra layout pubblici e login
- [x] Ridurre il model tema da light|dark|system a light|dark con fallback pulito per valori legacy
- [x] Rendere il controllo singolo, piccolo e stabile in alto a destra
- [x] Correggere il caso login/admin login senza duplicazioni o mismatch
- [x] Verificare build frontend e documentare review finale

## Review (Dark mode theme switch UX fix - Mar 11, 2026)
- Causa del duplicato in home: [Layout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\Layout.tsx) montava ThemeToggle sia nel cluster desktop della navbar sia come controllo separato mobile/header; il componente precedente era inoltre troppo largo per una topbar secondaria.
- Modello tema semplificato in [ThemeProvider.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\theme\ThemeProvider.tsx) e [frontend/index.html](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\index.html): rimangono solo light e dark; eventuali utenti con valore legacy system vengono riallineati automaticamente al tema di sistema corrente al primo caricamento, poi persistono come scelta esplicita light/dark.
- [ThemeToggle.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\theme\ThemeToggle.tsx) e [theme.css](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\theme.css): il controllo ora e un toggle compatto a due stati, molto piu piccolo e secondario, pensato per stare in alto a destra senza rubare spazio alla navigazione.
- Posizionamento corretto: su sito pubblico e home il toggle e ora unico nel bordo destro dell'header; su dashboard/admin resta unico nel cluster azioni top-right dei layout [DashboardLayout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\dashboard\DashboardLayout.tsx), [OrgAdminLayout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminLayout.tsx), [SuperAdminLayout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\super-admin\SuperAdminLayout.tsx) e [AdminLayout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\admin\AdminLayout.tsx).
- Fix login: per [OrgAdminLogin.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminLogin.tsx) e [SuperAdminLogin.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\super-admin\SuperAdminLogin.tsx), che passano dal Layout globale ma non dalla header pubblica, [Layout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\Layout.tsx) ora mostra un solo toggle fisso in alto a destra sulle route login admin; in piu la base tema resta coerente tramite il layer centralizzato in 	heme.css.
- Verifica finale eseguita: 
pm --prefix frontend run build OK.

## Form builder drag-drop definitive fix (Mar 11, 2026)
- [ ] Verificare il flusso reale `palette -> canvas -> stato parent` per individuare perche il blocco sparisce dopo il drop
- [ ] Correggere il builder per mantenere i campi inseriti anche dopo rerender/refetch del parent
- [ ] Hardening minimo della collision detection/drop zone senza introdurre nuove feature
- [ ] Eseguire `npm --prefix frontend run build` e documentare review finale
## Form builder drag-drop definitive fix review (Mar 11, 2026)
- [x] Verificare il flusso reale `palette -> canvas -> stato parent` per individuare perche il blocco sparisce dopo il drop
- [x] Correggere il builder per mantenere i campi inseriti anche dopo rerender/refetch del parent
- [x] Hardening minimo della collision detection/drop zone senza introdurre nuove feature
- [x] Eseguire `npm --prefix frontend run build` e documentare review finale

## Review (Form builder drag-drop definitive fix - Mar 11, 2026)
- Causa precisa del bug residuo: il path DnD `palette -> canvas` esisteva gia in [FormBuilder.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\forms\builder\FormBuilder.tsx), ma [OrgAdminForms.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminForms.tsx) continuava a passare `fields` derivati solo da `selectedForm?.fields` e un `onChange={() => {}}`. Quindi il blocco poteva anche essere creato localmente nel builder, ma il primo rerender/refetch del parent rimontava i campi server precedenti e il nuovo blocco spariva dal canvas.
- [OrgAdminForms.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminForms.tsx): introdotto `builderDraftFields` come stato parent-controlled del canvas, sincronizzato dal form server solo quando `selectedForm` cambia davvero. Il builder ora riceve `fields={builderDraftFields}` e `onChange={setBuilderDraftFields}`, quindi il drop resta visibile anche dopo normali rerender del parent. Dopo save/delete/reorder il refetch aggiorna sia `selectedForm` sia il draft, mantenendo coerenza con il backend.
- [FormBuilder.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\forms\builder\FormBuilder.tsx): rimosso il doppio stato locale dei campi; il componente ora usa direttamente `fields` dal parent, cosi non esiste piu una copia interna che puo divergere o venire sovrascritta. Ho anche aggiunto una collision detection piu robusta (`pointerWithin -> rectIntersection -> closestCenter`) per rendere il canvas droppable in modo piu affidabile anche quando e vuoto o il puntatore rilascia al bordo.
- Esito del fix: `palette -> canvas` ora crea davvero il blocco nel draft parent, il canvas si aggiorna subito, l'empty state sparisce al primo inserimento, il blocco resta presente dopo i rerender e il reorder interno continua a usare il branch separato `canvas -> canvas`.
- Verifica eseguita: `npm --prefix frontend run build` OK.
## Login theme hardening (Mar 11, 2026)
- [x] Analizzare login page, layout e theme layer per individuare i punti incoerenti light/dark
- [x] Applicare fix mirati a layout, card, input, testi e switch tema della login
- [x] Eseguire build frontend e documentare review finale

## Review (Login theme hardening - Mar 11, 2026)
- Problemi trovati: le login admin continuavano a vivere nel `Layout` pubblico, quindi ereditavano chrome non necessario e un secondo toggle fixed; inoltre login pubblica e login admin usavano ancora molti colori light-only hardcoded su testi, bordi, error state, input e pannello immagine laterale.
- [Layout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\Layout.tsx): le route standalone `/org-admin/login` e `/super-admin/login` non renderizzano piu header/footer pubblico o prompt extra, ma mantengono un solo `ThemeToggle` piccolo in alto a destra.
- [theme.css](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\theme.css): aggiunta una shell auth tematica (`auth-page`, `auth-shell`, `auth-panel`, `auth-input`, `auth-alert`, `auth-media`, ecc.) con token coerenti light/dark per sfondo pagina, card, testi, placeholder, bordi, input, stato errore e immagine laterale.
- [Login.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\Login.tsx), [OrgAdminLogin.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminLogin.tsx) e [SuperAdminLogin.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\super-admin\SuperAdminLogin.tsx): riallineati a classi semantiche condivise, cosi card, contenuto e pannello visivo hanno contrasto leggibile e coerente in entrambi i temi senza duplicare logiche CSS sparse.
- Verifica finale: `npm --prefix frontend run build` OK.
## Dark mode internal surfaces hardening (Mar 11, 2026)
- [x] Analizzare dove la dark mode si fermava alla shell esterna invece di raggiungere i surface interni
- [x] Consolidare token semantici per page background, surface levels, card, table, input, badge e modal/drawer
- [x] Rafforzare il compatibility layer dark per contenitori, tabelle, filtri e wrapper dashboard senza patch sparse
- [x] Eseguire `npm --prefix frontend run build` e documentare review finale

## Review (Dark mode internal surfaces hardening - Mar 11, 2026)
- Analisi: il sistema tema era corretto sulla shell esterna (`app-shell`, header, nav, login), ma si fermava sui surface interni perche il codebase dashboard usa molte utility Tailwind hardcoded non ancora coperte dal layer dark: varianti `bg-white/*`, `bg-neutral-50/70`, `bg-neutral-100/80`, `bg-[#f8f9fa]`, `divide-neutral-*`, `ring-neutral-*`, badge neutrali e wrapper tabellari con `bg-white/30` o `bg-neutral-50/50`. In pratica il contenitore pagina diventava scuro, ma card, tabelle, filtri e box ricerca restavano chiari.
- [theme.css](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\theme.css): consolidati i token semantici richiesti per `page background`, `surface level 1`, `surface level 2`, `card background`, `input background`, `table background`, `table row`, `table row hover`, `border default`, `border strong`, `text primary`, `text secondary`, `text muted`, `badge background`, `modal background`, `drawer background`. I surface condivisi (`surface`, `surface-strong`, `theme-card`, `modal-panel`, `mobile-dashboard-sheet`) ora leggono questi token invece di dipendere da colori impliciti light-only.
- Sempre in [theme.css](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\theme.css) ho ampliato il compatibility layer dark sulle utility realmente usate nelle dashboard: background `bg-white/*`, `bg-neutral-*`, `bg-slate-*`, wrapper `bg-[#f8f9fa]`, divider `divide-neutral-*`, border/ring neutrali, header/body table, row background/hover e badge state comuni (`emerald`, `amber`, `red`, `blue`, `sky`, `cyan`, `orange`). Questo rende coerenti container, card, box filtri, search bars, stat cards, tabelle e liste senza toccare una a una le singole pagine gestionali.
- Ambiti coperti in modo sistematico: dashboard socio, org admin e super admin ereditano lo stesso layer per surface interni; componenti come [MembersTable.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\components\MembersTable.tsx), [SuperAdminOrganizations.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\super-admin\SuperAdminOrganizations.tsx), [DashboardDocuments.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\dashboard\DashboardDocuments.tsx), filtri, box ricerca, modali e pannelli non restano piu visualmente light in dark mode perche i pattern utility che usano sono ora coperti dal layer globale.
- Verifica finale: `npm --prefix frontend run build` OK.
## Form builder drag-drop residual fix (Mar 11, 2026)
- [x] Verificare il ramo reale `palette -> canvas` e i punti in cui `over` o il draft parent possono rompersi
- [x] Rendere il drop robusto anche se `over` sparisce al mouse-up su canvas/empty state
- [x] Allineare il salvataggio builder al draft aggiornato senza leggere stato stantio del parent
- [x] Eseguire `npm --prefix frontend run build` e documentare review finale

## Review (Form builder drag-drop residual fix - Mar 11, 2026)
- Causa precisa del bug residuo: il builder non era ancora robusto in due punti. In [FormBuilder.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\forms\builder\FormBuilder.tsx) la creazione da palette dipendeva da `event.over` al `dragEnd`; quando `over` cadeva a `null` al rilascio sul canvas/empty state, il ramo `palette -> canvas` non partiva e il blocco tornava indietro. In parallelo [OrgAdminForms.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminForms.tsx) continuava a far calcolare il payload di save su `builderDraftFields` letto dalla render precedente invece che sul `newItems` appena creato, lasciando un punto di race tra drop ottimistico e persistenza.
- [FormBuilder.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\components\forms\builder\FormBuilder.tsx): introdotto tracking esplicito dell'ultimo target valido (`lastKnownOverId`) via `onDragOver`, usato come fallback in `onDragEnd` quando `over` non e piu disponibile al mouse-up. Il ramo `palette -> canvas` ora crea il `newField`, lo inserisce nello state corretto e passa a `onSaveField` anche l'array `nextFields` effettivo, non uno snapshot stantio. Il canvas mantiene inoltre highlight valido anche quando il puntatore e sopra un blocco esistente o quando il target utile e stato appena perso.
- [OrgAdminForms.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminForms.tsx): rimosso il sync generico `selectedForm -> builderDraftFields` che poteva risovrascrivere il draft del builder ad ogni cambio di identity del form, e il save del builder ora riceve `nextBuilderFields` dal figlio per calcolare `sort_order` e payload sullo stato davvero droppato. I punti che devono riallineare il draft da server (load detail, click su un form, refresh risposte) lo fanno ora in modo esplicito.
- Esito del fix: `palette -> canvas` non dipende piu da un singolo `over` fragile al `dragEnd`, il blocco viene inserito subito nel canvas, il draft parent non viene ricalcolato su dati vecchi e i successivi refresh da backend aggiornano il canvas solo nei punti espliciti dove serve davvero.
## Dark mode systemic hardening (Mar 11, 2026)
- [x] Analizzare dove la dark mode resta parziale tra shell dashboard, shell pubblica e login
- [x] Consolidare token/override condivisi per surface, panel, link, tabelle, input e overlay hero
- [x] Correggere in modo sistematico login page e public shell per evitare mix light/dark
- [x] Eseguire `npm --prefix frontend run build` e documentare review finale

## Review (Dark mode systemic hardening - Mar 11, 2026)
- Analisi: la dark mode era ancora incoerente perche il sistema si fermava a meta strada tra due layer diversi. Da un lato [theme.css](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\theme.css) copriva shell dashboard e alcune utility dark; dall'altro [index.css](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\index.css) continuava a definire `public-shell`, header pubblico, superfici e tipografia con palette esplicitamente light-only. Il risultato era un mix visivo: topbar/layout esterno dark, ma card, pannelli, box filtro o la login pubblica continuavano a ereditare sfondi/testi chiari o incoerenti.
- Token consolidati in [theme.css](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\theme.css): oltre a `app background`, `page background`, `surface 1`, `surface 2`, `card background`, `input background`, `table background`, `table row`, `table row hover`, `border default`, `border strong`, `text primary`, `text secondary`, `text muted`, `badge background`, `modal background` e `drawer background`, ho aggiunto `--theme-app-bg`, `--theme-panel-bg`, `--theme-panel-muted`, `--theme-link`, `--theme-link-hover` e `--theme-hero-overlay` per coprire i surface interni reali, i link e la hero/login.
- Hardening condiviso: [theme.css](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\theme.css) ora tematizza in modo esplicito `public-shell`, `app-shell`, `auth-page`, `auth-shell`, `auth-panel`, `public-header`, `surface`, `surface-strong`, `theme-card`, `modal-panel`, `toast-panel`, input/select/textarea e link mutati. Ho esteso anche il compatibility layer dark per utility usate davvero nelle dashboard (`bg-neutral-*`, `bg-slate-*`, `bg-white/*`, `text-slate-*`, `border-slate-*`, `hover:bg-*`, righe tabella e placeholder), cosi box interni, card statistiche, filtri, search bars, tabelle e pannelli non restano piu light casualmente.
- Fix login page: il problema non era solo nella card interna, ma nel fatto che la login pubblica vive dentro `public-shell` light-only. Con il nuovo layer, la pagina login eredita ora anche sfondo/scena dark coerente, section title/heading leggibili, shell auth con panel dark leggibile, overlay immagine laterale controllato da token e contrasto corretto su copy, helper text, placeholder, link secondari e CTA.
- Ambiti coperti: super admin, org admin e socio ereditano il nuovo layer tramite i layout esistenti [SuperAdminLayout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\super-admin\SuperAdminLayout.tsx), [OrgAdminLayout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminLayout.tsx) e [DashboardLayout.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\dashboard\DashboardLayout.tsx) senza cambiare markup o introdurre nuove feature. Il focus e stato sui surface interni, non su un redesign.
- Verifica finale: `npm --prefix frontend run build` OK.

## Org-admin form builder DnD hard fix (Mar 11, 2026)
- [x] Riprodurre il bug reale del builder form org-admin in browser su ambiente isolato con sessione org-admin valida
- [x] Verificare il flusso DnD palette -> canvas fino a `over`, update stato parent e chiamate backend
- [x] Correggere la registrazione del canvas droppable nel provider `DndContext`
- [x] Rieseguire test reale browser su inserimento, reload e riordino nel canvas

## Review (Definitive org-admin form builder DnD fix - Mar 11, 2026)
- Root cause reale: il canvas usava `useDroppable()` nello stesso componente che montava `DndContext`, quindi il hook veniva valutato fuori dal provider dnd-kit e il canvas non risultava un target droppable affidabile.
- Fix applicato in `frontend/src/components/forms/builder/FormBuilder.tsx`: il canvas e stato estratto in `BuilderCanvas`, child reale di `DndContext`, cosi `useDroppable` registra correttamente `form-builder-canvas` e il flusso `palette -> canvas` / `canvas -> canvas` usa lo stesso contesto DnD.
- Verifica browser reale eseguita con Playwright su backend locale `http://127.0.0.1:8010` e DB SQLite isolato `tmp_builder_dnd_e2e.db`: drag di `Testo breve` nel canvas vuoto OK, blocco persistito dopo reload OK, aggiunta secondo blocco `Numero` OK, riordino `Numero -> prima posizione` OK sia in UI sia nel DB.
- Verifica build finale: `npm --prefix frontend run build` OK.


## Org-admin form builder properties stabilization (Mar 11, 2026)
- [x] Riprodurre i bug reali del pannello proprieta su label, placeholder e opzioni multiple
- [x] Ridurre i salvataggi aggressivi durante la digitazione per evitare reset e perdita caratteri
- [x] Rimuovere il refetch totale del form sugli update singoli dei campi esistenti
- [x] Verificare in browser reale digitazione lunga, reload e persistenza DB delle opzioni

## Review (Org-admin form builder properties stabilization - Mar 11, 2026)
- Root cause principale: il pannello proprieta salvava al backend a ogni tasto e `handleBuilderSaveField` rifaceva `fetchOrgAdminForm(...)` dopo ogni update. Questo rimetteva nel builder lo stato server precedente mentre l'utente stava ancora scrivendo, causando caratteri persi, label/placeholder che si auto-resettavano e opzioni multiple incoerenti.
- In `frontend/src/components/forms/builder/FormBuilder.tsx` il salvataggio delle proprieta del campo selezionato e ora debounce-based: il canvas si aggiorna subito nello stato locale, mentre il save backend parte solo dopo una breve pausa di digitazione. In questo modo non c'e piu una request per ogni singolo carattere.
- In `frontend/src/pages/org-admin/OrgAdminForms.tsx` gli update dei campi esistenti non rifetchano piu l'intero form: la risposta `field` dell'endpoint viene riapplicata solo allo stato necessario. Per i nuovi campi viene sostituito il placeholder locale con il campo persistito; per delete viene aggiornato lo stato locale senza round-trip completo del form.
- Verifica reale con Playwright su backend locale `http://127.0.0.1:8010` e DB SQLite isolato `tmp_builder_dnd_e2e.db`: label lunga OK, placeholder lungo OK, campo `select` con opzioni multiple OK, reload pagina OK, persistenza DB finale OK (`options_json` salvato con tutte le opzioni).
- Verifica build finale: `npm --prefix frontend run build` OK.

- [x] Stabilizzare Pagine e moduli org admin: lista/empty state, back, delete-return, preview campi live e branding preview (2026-03-11)
- [x] Verifica browser reale su /org-admin/comunicazioni?tab=moduli: empty state, create, drag+edit properties, preview, back, delete (2026-03-11)

Review 2026-03-11
- Root cause UI/state: la vista moduli apriva l'editor anche senza form, il back non ripuliva lo state editor e l'anteprima leggeva i fields server anziche il draft locale del builder.
- Root cause builder properties: modificare subito un blocco appena creato poteva lanciare una seconda create con lo stesso field_key prima che arrivasse l'id persistito, causando UNIQUE constraint su form_fields.form_id + field_key.
- Verificato in browser locale isolato: empty state iniziale, creazione form, drag Testo breve, modifica label/placeholder, drag Menu a tendina, modifica opzioni, preview con nome associazione, ritorno lista, eliminazione e ritorno empty state.

## Comunicazioni org-admin: scheduling, template library e collegamento form/prenotazioni (Mar 11, 2026)
- [x] Analizzare il flusso attuale Comunicazioni/Form/Prenotazioni per capire cosa era gia presente e cosa mancava davvero
- [x] Estendere il dominio dati di campagne e template con scheduling, design personalizzabile e collegamento opzionale a un form pubblico
- [x] Implementare il processing delle campagne schedulate nel worker email esistente senza rompere broadcast, invio a soci selezionati o variabili automatiche
- [x] Completare la UI org-admin Messaggi con libreria modelli funzionante, editor design, scelta form collegato e invio immediato o pianificato
- [x] Estendere i form prenotazione con auto-assegnazione del primo tavolo compatibile in agenda/mappa quando abilitata
- [x] Verificare migration, test backend mirati e build frontend finale

## Review (Comunicazioni org-admin: scheduling, template library e collegamento form/prenotazioni - Mar 11, 2026)
- Architettura attuale confermata: il submit dei form pubblici poteva gia creare un booking in agenda, ma mancavano auto-assegnazione tavolo/sala, campagne schedulate end-to-end, UI reale per creare modelli salvati e un collegamento esplicito messaggi -> form con CTA.
- Backend dati esteso in [app/models.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\models.py) e nella migration [9c0d1e2f3a4_add_message_design_and_booking_auto_assign.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\alembic\versions\9c0d1e2f3a4_add_message_design_and_booking_auto_assign.py): EmailCampaign e EmailTemplate ora supportano design_json e linked_form_id; Form ora supporta ooking_auto_assign_enabled. Migration resa compatibile anche con SQLite evitando FK runtime non supportate.
- Scheduling implementato in [email_campaigns.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\services\email_campaigns.py) e [email_sender.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\workers\email_sender.py): le campagne possono essere create con scheduled_at, restano in stato scheduled e vengono inviate dal worker quando scadono, mantenendo rendering variabili per destinatario singolo e compatibilita con ll_members e selected_members.
- Template email e messaggi ora supportano estetica personalizzabile in [email_templates.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\services\email_templates.py): logo, accento, hero/background, CTA, nota finale e intestazione associazione vengono normalizzati e applicati al render HTML/text. Se e collegato un form, il messaggio aggiunge CTA e URL pubblico coerente con l'associazione.
- API org-admin completate in [org_admin.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\routes\org_admin.py): create/update template, preview template, create/list campaign e create/update form ora accettano scheduling, design, linked form e booking auto-assign; le serializzazioni espongono anche il riepilogo del form collegato.
- UI org-admin completata in [MessagesHub.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\components\communications\MessagesHub.tsx) e [api.ts](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\lib\api.ts): la tab Modelli salvati non e piu vuota, permette creazione/duplicazione/modifica/archiviazione modelli, scelta del form da allegare via CTA, configurazione design, invio immediato o pianificato e targeting Tutti i soci o Soci selezionati.
- In [OrgAdminForms.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\OrgAdminForms.tsx), [forms.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\services\forms.py), [bookings.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\services\bookings.py) e [booking_rooms.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\services\booking_rooms.py) ho aggiunto l'opzione di auto-assegnare il primo tavolo libero compatibile quando un form prenotazione genera un booking. Il booking arriva quindi in agenda gia legato a sala/tavolo quando possibile.
- Compatibilita bootstrap/dev-test mantenuta in [init_db.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\init_db.py) con path di repair per i nuovi campi, cosi ambienti che usano create_all() o DB esistenti non restano fuori sync.
- Verifiche eseguite: python -m pytest -q tests/test_org_admin_communications.py tests/test_forms_module.py OK (21 passed); 
pm --prefix frontend run build OK; DATABASE_URL=sqlite:///tmp_messages_forms_mig.db python -m alembic upgrade head OK.
## Rifinitura UI workspace Messaggi org-admin (Mar 11, 2026)
- [x] Riorganizzare MessagesHub.tsx in una struttura leggibile e manutenibile senza cambiare il perimetro funzionale
- [x] Migliorare gerarchia visiva di storico, composer e modelli salvati mantenendo scheduling, template e form linking
- [x] Verificare che il workspace Comunicazioni compili ancora correttamente dopo la rifinitura

## Review (Rifinitura UI workspace Messaggi org-admin - Mar 11, 2026)
- [MessagesHub.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\components\communications\MessagesHub.tsx) era diventato funzionale ma troppo compresso, con gran parte della UI su blocchi JSX monolitici difficili da mantenere. Ho rifatto il file mantenendo identiche le capability introdotte in precedenza: storico campagne, composer con targeting e scheduling, libreria modelli, design editor e collegamento ai form.
- La rifinitura e stata volutamente contenuta: niente nuove feature, ma struttura piu chiara tramite sezioni distinte, hero/workspace summary iniziale, tab button piu leggibili, pannelli coerenti per destinatari, form collegato, variabili automatiche e template library.
- Il composer ora comunica meglio il workflow: scelta destinatari, caricamento modello, scelta del form collegato, editing contenuto, design e azioni finali sono separati in blocchi piu leggibili; lo stesso vale per la tab Modelli salvati, che ora distingue meglio lista modelli ed editor.
- Verifica finale: 
pm --prefix frontend run build OK.
## Theme contrast hardening public + dashboard (Mar 12, 2026)
- [ ] Mappare tutti i CTA pubblici "Affilia la tua associazione" e i pattern shared che forzano colori incoerenti tra light/dark
- [ ] Correggere il layer tema/shared styles per bottoni pubblici, link CTA, footer e FAQ senza introdurre patch isolate per singola pagina
- [ ] Estendere il compatibility layer dark per surface/card interne dashboard ancora chiare o incoerenti
- [ ] Eseguire 
pm --prefix frontend run build e documentare review finale
## Review (Theme contrast hardening public + dashboard - Mar 12, 2026)
- Ho normalizzato i CTA pubblici principali su tn-primary / tn-ghost nelle entry point che esponevano il problema di contrasto (Home, navbar/mobile menu del layout pubblico, lista associazioni). In questo modo le CTA non ereditano più il colore link globale di 	heme.css, quindi non finiscono con fondo scuro e testo teal/nero quando devono essere pulsanti.
- In rontend/src/theme.css ho collegato anche i token --public-* al sistema tema shared e ho aggiunto override tematici per public-footer, public-faq-button, public-faq-icon e public-faq-answer-text. Questo elimina il footer bianco fisso in dark mode e rende leggibile la sezione FAQ/accordion nelle pagine pubbliche.
- Sempre in rontend/src/theme.css ho esteso il compatibility layer dark per utility usate ancora nelle dashboard e nelle hero card (g-slate-50/70-90, g-slate-100/70-90, g-slate-200/70, nuove varianti order-slate-200/*, order-slate-950/*, divide-slate-200, hover/table wrappers g-slate-*). Lo scopo e coprire i contenitori/card interne che rimanevano chiare o incoerenti senza inseguire patch file-per-file.
- Verifiche eseguite: 
pm --prefix frontend run build OK; screenshot locali da build preview con Playwright in 	asks/screenshots/home-light-20260312.png, 	asks/screenshots/home-dark-20260312.png, 	asks/screenshots/home-dark-tall-20260312.png. Nel check visuale homepage dark risultano leggibili FAQ e footer, e le CTA pubbliche non mostrano più il contrasto errato.
- Dopo il primo check visuale ho corretto anche la hero shell di /associazioni, che restava troppo chiara per via di wrapper/gradient light-only. Verifica aggiuntiva con service worker bloccati: 	asks/screenshots/associazioni-dark-20260312.png mostra ora la sezione introduttiva coerente con la dark mode.
- Screenshot aggiuntivo confermato: tasks/screenshots/associazioni-dark-20260312.png.
- [x] Verifica visuale autenticata dark mode completata su 2026-03-12.

### Review update - authenticated visual verification (2026-03-12)
- 
pm --prefix frontend run build OK dopo la correzione del layer CSS condiviso (surface, surface-strong, modal-panel, tn-ghost, premium-select).
- Screenshot autenticati rigenerati e controllati: 	asks/screenshots/super-admin-associazioni-dark-auth-20260312.png, 	asks/screenshots/super-admin-org-admins-dark-auth-20260312.png, 	asks/screenshots/org-admin-dashboard-dark-auth-20260312.png, 	asks/screenshots/org-admin-soci-dark-auth-20260312.png, 	asks/screenshots/org-admin-prenotazioni-dark-auth-20260312.png.
- Esito: pannelli, filtri, tabelle e card principali ora rispettano la dark mode in super-admin e org-admin; residuo visivo non di tema rilevato solo nel popover onboarding sopra la dashboard org-admin.

## Homepage fake counters (Mar 12, 2026)
- [x] Individuare il blocco contatori nella homepage pubblica
- [x] Sostituire i valori reali/runtime con valori showcase statici piu alti
- [x] Lasciare invariato il contatore delle citta attive
- [x] Verificare build frontend e diff finale

## Review (Homepage fake counters - Mar 12, 2026)
- In `frontend/src/pages/Home.tsx` la sezione "La Nostra Rete" non usa piu i contatori runtime del backend.
- I valori pubblici ora sono statici e marketing-driven: `300+` associazioni affiliate, `9.000+` soci registrati, `24+` citta attive.
- L'animazione della sezione resta attiva, ma converge sempre ai target showcase richiesti.
- Verifica eseguita: `npm --prefix frontend run build` OK.

## Accounting preview + workspace UX hardening (Mar 12, 2026)
- [x] Mappare preview accounting backend/frontend e identificare la causa CSP nelle aree super-admin e org-admin
- [ ] Correggere le security headers solo per le route preview accounting inline
- [ ] Introdurre un viewer accounting condiviso e usare un flusso preview coerente tra super-admin e org-admin
- [ ] Rifinire la UI/UX del workspace accounting super-admin senza cambiare il dominio dati
- [ ] Verificare con pytest backend accounting e build frontend, poi documentare review finale
## Review (Accounting preview + workspace UX hardening - Mar 12, 2026)
- Le preview accounting non falliscono piu per `frame-ancestors 'none'`: in `app/middleware.py` ho mantenuto `DENY` globale ma aperto `SAMEORIGIN` + `frame-ancestors 'self'` solo per le route `/api/super-admin/accounting/documents/{id}/preview` e `/api/org-admin/accounting/documents/{id}/preview`.
- Ho aggiunto regressione backend in `tests/test_accounting_archive.py`: sia preview org-admin sia super-admin rispondono `200` con header coerenti per embed same-origin.
- Ho introdotto `frontend/src/components/accounting/AccountingDocumentPreviewModal.tsx` come viewer condiviso per immagini/PDF, con metadata chiari e fallback pulito quando il formato non e previewabile inline.
- `frontend/src/pages/org-admin/OrgAdminAccounting.tsx` ora usa il modal condiviso e rende i bottoni azione sempre accessibili su touch/mobile, non solo in hover desktop.
- `frontend/src/pages/super-admin/components/SuperAdminAccountingWorkspace.tsx` e stato rifinito strutturalmente: hero KPI, setup cartelle/categorie piu leggibile, form documento piu chiaro, dettaglio selezione piu utile e tabella archivio con stati preview/share espliciti.
- Verifiche eseguite: `python -m pytest -q tests/test_accounting_archive.py` OK (`2 passed`); `npm --prefix frontend run build` OK.
## Mobile public menu dark mode fix (Mar 12, 2026)
- [x] Identificare il pannello mobile pubblico che restava light-only in dark mode
- [x] Allineare markup e token CSS del dropdown mobile al sistema tema shared
- [x] Verificare build frontend finale prima del push

## Review (Mobile public menu dark mode fix - Mar 12, 2026)
- In `frontend/src/components/Layout.tsx` ho rimosso classi light-only dal menu mobile pubblico e introdotto hook CSS semantici (`public-mobile-link`, `public-mobile-divider`, `public-mobile-access`).
- In `frontend/src/theme.css` il pannello `public-mobile-panel` usa ora i token del tema shared anche in dark mode, con divider e link coerenti con header/shell pubblica.
- Verifica eseguita: `npm --prefix frontend run build` OK.

## ASSONAM privacy policy hardening (Mar 14, 2026)
- [x] Mappare la pagina privacy pubblica e il punto del wizard iscrizione che gestisce la presa visione privacy
- [x] Riscrivere l'informativa con struttura piu completa e specifica per il caso d'uso ASSONAM
- [x] Mantenere il layout hero + card/sezioni migliorando solo gerarchia tipografica e leggibilita
- [x] Correggere i testi del wizard per evitare che la privacy sembri basata su un consenso generico
- [x] Verificare build frontend finale e documentare review

## Review (ASSONAM privacy policy hardening - Mar 14, 2026)
- In `frontend/src/pages/Privacy.tsx` ho sostituito il testo sintetico con una informativa strutturata in 11 sezioni, mantenendo il layout hero + card e migliorando solo gerarchia, leggibilita e recapiti in evidenza.
- In `frontend/src/pages/Iscrizione.tsx` ho corretto il lessico del wizard: non parla piu di consenso privacy generico, ma di presa visione dell'informativa; ho aggiunto anche il link `Apri informativa` verso `/privacy` senza modificare la logica del submit.
- Verifica eseguita: `npm --prefix frontend run build` OK. Non ho eseguito un test browser end-to-end del wizard, ma lo state del form e il payload `accept_privacy` non sono stati modificati.

## ASSONAM libro soci + tessera org admin (Mar 14, 2026)
- [ ] Mappare endpoint, pagine e servizi esistenti per soci, tessera PDF ed email worker
- [ ] Implementare update anagrafica socio lato org admin con permessi forti, validazioni server-side e audit dei campi modificati
- [ ] Implementare azioni org admin per invio tessera via email e download/stampa PDF tessera riusando servizi esistenti
- [ ] Trasformare la pagina super admin Soci in vero Libro Soci filtrabile per associazione con navigazione al dettaglio
- [ ] Aggiornare il frontend org admin con UI edit anagrafica e azioni tessera coerenti con il pannello
- [ ] Aggiornare il frontend super admin con filtro associazione, KPI e tabella navigabile
- [ ] Aggiungere test mirati backend e verificare build frontend finale

## Review (ASSONAM libro soci + tessera org admin - Mar 14, 2026)
- In attesa di implementazione e verifiche finali.

## Review (ASSONAM libro soci + tessera org admin - Mar 14, 2026)
- [x] Mappati endpoint, pagine e servizi esistenti per soci, tessere e super admin.
- [x] Implementato update anagrafica socio lato org admin con audit, validazioni e scope per associazione.
- [x] Implementate azioni tessera lato org admin: invio email tramite worker esistente, download PDF e stampa.
- [x] Trasformata la sezione super admin in Libro Soci filtrabile per associazione con KPI, tabella e dettaglio.
- [x] Verifiche eseguite: pytest tests/test_org_admin_member_profile_and_card_actions.py tests/test_super_admin_member_registry.py e 
pm --prefix frontend run build.

## Mobile menu premium + wizard dark mode signup (Mar 15, 2026)
- [x] Mappare il trigger menu mobile pubblico e i layer CSS che oggi mostrano il testo "Menu"
- [x] Sostituire il trigger testuale con un'icona premium coerente con il brand e leggibile in light/dark mode
- [x] Correggere le surface e gli accenti del wizard iscrizione in dark mode senza regressioni in light mode
- [x] Eseguire `npm --prefix frontend run build` e documentare la review finale

## Review (Mobile menu premium + wizard dark mode signup - Mar 15, 2026)
- In `frontend/src/components/Layout.tsx` il trigger mobile pubblico non mostra piu il testo "Menu": ora usa un bottone iconico con tre linee animate che si trasformano in close state, mantenendo invariata la logica di apertura/chiusura e migliorando l'accessibilita con `aria-label` dinamico.
- In `frontend/src/index.css` ho rifinito la geometria del trigger mobile con una shell compatta, highlight blu/oro coerente con il brand e transizioni leggere, cosi il controllo resta piu premium su light e dark mode senza occupare spazio inutile in header mobile.
- In `frontend/src/index.css` ho spostato il wizard iscrizione su variabili CSS semantiche (`signup-wizard-*`) per card, glow di sfondo, focus ring e secondary actions, evitando di lasciare la card principale forzata bianca in dark mode.
- In `frontend/src/theme.css` ho aggiunto i valori dark specifici del wizard e override mirati per accenti `indigo/rose/amber`, badge, feedback e ring, cosi le superfici e gli stati del flusso iscrizione restano coerenti con la dark mode mantenendo il look attuale in light mode.
- Verifica eseguita: `npm --prefix frontend run build` OK.

- Smoke visuale mobile completato su 2026-03-15 con server locale `vite preview` e screenshot reali in `tasks/screenshots/smoke-home-menu-light-mobile-20260315.png`, `tasks/screenshots/smoke-home-menu-dark-mobile-20260315-rerun.png`, `tasks/screenshots/smoke-signup-wizard-light-mobile-20260315.png`, `tasks/screenshots/smoke-signup-wizard-dark-mobile-20260315.png`.
- Esito smoke: menu mobile premium leggibile in light e dark mode; wizard iscrizione coerente in dark mode con stepper, card e campi finalmente allineati al tema scuro. Il primo capture dark del menu mostrava solo parte del pannello per timing di animazione, ricontrollato con secondo capture confermato.
## Public CTA cleanup navbar + homepage (Mar 16, 2026)
- [x] Mappare tutte le occorrenze del bottone pubblico Diventa Socio in navbar e homepage
- [x] Rimuovere il bottone Diventa Socio dalla navbar desktop/mobile senza toccare le rotte pubbliche
- [x] Ricentrare la CTA Affilia la tua Associazione nella hero homepage e armonizzare gli spazi della navbar
- [x] Eseguire npm --prefix frontend run build e documentare la review finale

## Review (Public CTA cleanup navbar + homepage - Mar 16, 2026)
- In frontend/src/components/Layout.tsx ho rimosso il bottone pubblico Diventa Socio sia dalla navbar desktop sia dal menu mobile, lasciando invariati NAV_ITEMS, link principali e accesso area riservata.
- In frontend/src/pages/Home.tsx la hero mostra ora una sola CTA Affilia la tua Associazione, centrata e full-width sul blocco dedicato; ho eliminato anche il secondo bottone Diventa Socio dalla sezione demo tessera per allineare tutta la homepage alla richiesta.
- Ho riarmonizzato gli spazi della navbar aumentando leggermente il respiro tra link di navigazione, CTA principale e accesso, senza cambiare comportamento, routing o tracking della CTA affiliazione.
- Verifica eseguita: npm --prefix frontend run build OK.

## Public navbar right-alignment experiment (Mar 16, 2026)
- [x] Rileggere il markup della navbar pubblica desktop/mobile e definire il riassetto minimo
- [x] Rimuovere la CTA Affilia l'Associazione dalla navbar pubblica e dal menu mobile
- [x] Spostare Login e theme toggle all'estrema destra della navbar desktop, mantenendo il mobile stabile
- [x] Eseguire npm --prefix frontend run build e documentare la review finale

## Review (Public navbar right-alignment experiment - Mar 16, 2026)
- In frontend/src/components/Layout.tsx ho rimosso del tutto la CTA Affilia l'Associazione dalla navbar pubblica desktop e dal pannello mobile, lasciando in homepage le CTA dedicate al funnel di affiliazione.
- La navbar desktop ora usa una struttura piu pulita: navigazione principale centrata e cluster destro con Login e ThemeToggle allineati all'estremita destra.
- Su mobile ho mantenuto il pattern gia stabile con ThemeToggle accanto all'hamburger e Login dentro il pannello, cosi la gerarchia resta leggibile senza comprimere l'header.
- Pulizia tecnica inclusa: eliminati anche hook/import non piu usati legati alla CTA navbar affiliazione.
- Verifica eseguita: npm --prefix frontend run build OK.

## Numbering scopes hybrid (Mar 17, 2026)
- [x] Mappare allocator tessere, gestione lotti super admin e punti di creazione tessera esistenti
- [x] Introdurre schema additivo `numbering_scopes` + nuovi FK nullable e seed idempotente `ASSONAM_CENTRAL`
- [x] Implementare backend scope-aware con fallback legacy obbligatorio quando `organizations.numbering_scope_id` e `NULL`
- [x] Introdurre regole first-use/post-use e endpoint super admin `GET/PATCH /organizations/{id}/numbering`
- [x] Rendere i lotti super admin scope-aware mantenendo compatibilita con batch legacy non scoped
- [x] Estendere UI Super Admin per configurazione numerazione in create org e organization setup modal
- [x] Aggiungere test backend mirati per shared/dedicated, fallback legacy, free-editable e sensitive changes
- [x] Verificare con pytest mirato e build frontend finale

## Review (Numbering scopes hybrid - Mar 17, 2026)
- Ho aggiunto la migration additiva `alembic/versions/o1p2q3r4s5t6_add_numbering_scopes.py`, i nuovi modelli/relazioni in `app/models.py` e il service `app/services/numbering_scopes.py`; la migration crea `numbering_scopes`, aggiunge i FK nullable su `organizations`, `card_batches`, `members` e seeda solo `ASSONAM_CENTRAL` senza auto-mappare org storiche.
- In `app/services/card_allocation.py` l’entrypoint `allocate_next_card(db, org_id, year)` e rimasto invariato: se `organization.numbering_scope_id` e `NULL` usa il ramo legacy identico; se presente usa il ramo scope-aware con lock per scope, occupazione su `members.numbering_scope_id` e guardia extra sul vecchio vincolo `uix_org_card`.
- Ho aggiornato i callsite che assegnano la tessera (`app/routes/admin.py`, `app/routes/join.py`, `app/routes/org_admin.py`, `app/services/integration_issuer.py`) per valorizzare `members.numbering_scope_id` sulle nuove emissioni; i cleanup che liberano tessere azzerano anche il nuovo campo.
- In `app/routes/super_admin.py` ho aggiunto gli endpoint di configurazione numerazione, la lettura dello stato `is_freely_editable` / `is_sensitive`, l’audit `org.numbering_scope.updated`, il backfill batch solo quando il mapping e deterministico e i lotti scope-aware con fallback batch legacy non scoped dove serve per la backward compatibility.
- In `frontend/src/pages/super-admin/components/OrganizationManageModal.tsx` il Super Admin vede ora la sezione “Numerazione tessere”, il default `Condivisa ASSONAM` in create org, lo stato “Modificabile liberamente” vs “Configurazione sensibile”, il warning storico e la conferma esplicita prima del cambio modalita.
- Ho esteso anche i path di bootstrap/riparazione SQLite in `init_db.py`, `app/scripts/repair_sqlite.py` e `tests/conftest.py` per evitare drift sugli ambienti dev/test che non passano subito da Alembic.
- Verifiche eseguite: `python -m pytest -q tests/test_card_assignment.py tests/test_super_admin_numbering_scopes.py tests/test_super_admin_card_lot_management.py` OK (`16 passed`); `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK.


## Plan (Org admin UX/UI + request decision flow - Mar 20, 2026)
- [ ] Consolidare il design system org admin condiviso per superfici, toolbar, filtri, badge e pulsanti, applicando il nuovo linguaggio alle pagine chiave
- [ ] Rifare `Comunicazioni > WhatsApp` con workspace bounded al viewport, sidebar/thread scrollabili internamente e composer sempre visibile
- [ ] Estendere schema e modelli per richieste form con stati `pending/confirmed/rejected`, audit review e template WhatsApp per-form di conferma/rigetto
- [ ] Implementare endpoint di review submission con sync booking collegato, audit trail e dispatch WhatsApp idempotente
- [ ] Aggiornare API/frontend org admin per gestione richieste in `OrgAdminForms` e summary richiesta in `OrgAdminBookings`
- [ ] Eseguire test/backend build, poi deploy/migration su Hetzner e smoke check live dell'area org admin
## Plan (Comunicazioni wizard campagne/modelli UX refresh - Mar 20, 2026)
- [ ] Analizzare `MessagesHub` e i contratti API esistenti per campagne, modelli, preview e lifecycle template
- [ ] Reintrodurre un wizard campagne progressivo con migliore gerarchia, step chiari e drag & drop dei blocchi messaggio
- [ ] Creare un wizard modelli più breve e pulito, ispirato al flusso iscrizione ma semplificato e focalizzato sulla preview
- [ ] Ampliare l'anteprima modelli/campagne in un canvas serio e non in un box compresso laterale
- [ ] Aggiungere l'eliminazione reale dei modelli non di sistema end-to-end (API + frontend)
- [ ] Eseguire `npm --prefix frontend run build` e documentare review finale

## Plan (Comunicazioni wizard campagne/modelli UX refresh - Mar 20, 2026)
- [x] Analizzare MessagesHub e il flusso reale campagne/modelli per capire cosa era stato perso nel refactor Comunicazioni
- [x] Ripristinare un wizard campagne con step guidati e drag & drop dei blocchi messaggio
- [x] Introdurre un wizard modelli piu corto con preview ampia e leggibile
- [x] Migliorare la libreria modelli con card preview piu utili e azione elimina
- [x] Completare delete template end-to-end su API + frontend senza toccare i template di sistema
- [x] Rieseguire build frontend e verifiche backend toccate

## Review (Comunicazioni wizard campagne/modelli UX refresh - Mar 20, 2026)
- In [frontend/src/pages/org-admin/components/communications/MessagesHub.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\components\communications\MessagesHub.tsx) ho reintrodotto il wizard campagne con step Brief / Messaggio / Destinatari / Review, ripristinando un flusso guidato invece dell'editor lungo lineare.
- Il passo Messaggio usa ora drag & drop reale sui blocchi email (hero, ody, cta, highlight, event, signature, inal_note) tramite dnd-kit, con ordine persistito in design.section_order e riflesso nella preview/render finale.
- Sempre in [MessagesHub.tsx](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\pages\org-admin\components\communications\MessagesHub.tsx) ho introdotto un wizard modelli piu corto (Essentials / Messaggio / Review) con preview finale ampia tramite PreviewCanvas, al posto della preview compressa nel box piccolo laterale.
- La libreria Modelli ora mostra card piu leggibili con mini-preview ampia del subject/hero/body/CTA e azioni dirette Apri wizard ed Elimina per i template non di sistema.
- In [frontend/src/lib/api.ts](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\frontend\src\lib\api.ts) ho esteso OrgAdminEmailDesign con section_order e aggiunto il client deleteOrgAdminEmailTemplate(...).
- In [app/services/email_templates.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\services\email_templates.py) il renderer email usa ora davvero section_order, quindi il drag & drop non e solo cosmetico ma cambia l'ordine finale del messaggio.
- In [app/routes/org_admin.py](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\app\routes\org_admin.py) ho aggiunto DELETE /api/org-admin/communications/templates/{template_id} con protezione per i template di sistema.
- Verifiche completate: python -m py_compile app/routes/org_admin.py app/services/email_templates.py, 
pm --prefix frontend run build.

## Plan (Deploy cleanup permission fix - Mar 20, 2026)
- [x] Analizzare il failure del workflow deploy su Hetzner e identificare il path che blocca git clean`r
- [x] Correggere il workflow per trattare data/videos/ come output runtime e non come sporcizia del checkout
- [x] Verificare il comportamento reale sul server come utente deploy`r
- [x] Preparare commit e push del fix

## Review (Deploy cleanup permission fix - Mar 20, 2026)
- Root cause verificata live su 157.90.31.105: data/videos/ e data/videos/welcome erano 
oot:root, mentre il workflow deploy gira come utente deploy; git clean -fd falliva con Permission denied sul cleanup di quei file video runtime.
- In [.github/workflows/deploy-hetzner.yml](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\.github\workflows\deploy-hetzner.yml) ho aggiunto un exclude persistente in .git/info/exclude per data/videos/ prima del dirty-check e ho reso il cleanup esplicitamente git clean -fd -e data/videos/.
- In [.gitignore](C:\Users\edoar\OneDrive\Desktop\CODE\iscrizioni clienti\Iscrizioni_clienti\.gitignore) ho aggiunto data/videos/ per allineare anche il repo al fatto che quel path e output runtime del worker video, non sorgente versionata.
- Verifica reale server-side eseguita come utente deploy: dopo l'exclude git status --porcelain non mostrava piu data/videos/ e git clean -nd -e data/videos/ non tentava piu di rimuoverla, quindi il failure mostrato nello screenshot risulta coperto dal fix.

## Plan (Comunicazioni GrapesJS guided builder - Mar 20, 2026)
- [x] Mappare l'attuale dominio `email_templates` / `email_campaigns` e progettare l'estensione minima per builder GrapesJS/MJML multi-tenant senza duplicare il motore esistente
- [x] Estendere schema/modelli/API per template e campagne con stato editoriale, project JSON GrapesJS, MJML compilato, snapshot campagna e asset library isolata per associazione
- [x] Integrare un editor GrapesJS fortemente guidato nel wizard `Comunicazioni > Modelli` e `Campagne`, riusando la grammatica UX del wizard iscrizione come shell principale
- [x] Aggiungere blocchi custom, merge tag picker, preview desktop/mobile, invio test e creazione campagna da template senza esporre pannelli tecnici inutili
- [x] Seedare template iniziali associazione/sistema e verificare build frontend, test backend e review finale con limiti noti e tradeoff

## Review (Comunicazioni GrapesJS guided builder - Mar 20, 2026)
- Ho introdotto il builder guidato multi-tenant su backend con nuovi campi builder in `email_templates` e `email_campaigns`, nuova tabella `email_builder_assets`, migration `n7p8q9r0s1t2_add_email_builder_fields_and_assets.py` e bootstrap coerente in `init_db.py`.
- In `app/routes/org_admin.py` ora sono disponibili CRUD template/campagne con `compiled_html`, `mjml_source`, `grapesjs_project_json`, oltre agli endpoint per asset library org-scoped, preview builder, test send e creazione campagna da template.
- In `app/services/email_templates.py` ho esteso i merge tag, i tipi template e i seed iniziali richiesti (`Newsletter base`, `Reminder rinnovo`, `Conferma prenotazione`, `Rigetto prenotazione`, `Invito evento`), mantenendo compatibilita con il motore esistente di render.
- Sul frontend ho aggiunto `emailBuilder.ts`, `GrapesEmailBuilder.tsx` e `MessagesComposerHub.tsx`: il tab Comunicazioni usa ora un wizard ispirato a `Iscrizione`, con hero centrale, stepper chiaro, editor GrapesJS limitato, blocchi guidati, merge tags, libreria media per organizzazione, preview desktop/mobile e azioni finali semplici.
- `OrgAdminCommunications.tsx` punta al nuovo hub builder e `frontend/src/lib/api.ts` espone tutti i contratti builder/asset necessari lato client.
- Ho aumentato in `frontend/vite.config.ts` e `frontend/vite.config.js` il limite Workbox di precache a 5 MiB: senza questo il build PWA falliva per il chunk Comunicazioni introdotto da GrapesJS.
- Verifiche eseguite: `python -m py_compile app/routes/org_admin.py app/services/email_templates.py app/services/email_campaigns.py app/models.py init_db.py` OK, `npm --prefix frontend run build` OK, `python -m pytest -q tests/test_org_admin_communications.py` OK (`15 passed`).
- Tradeoff noto: il chunk `OrgAdminCommunications` resta molto pesante per via di GrapesJS/MJML; funzionalmente il build e stabile, ma il passo successivo elegante sarebbe spezzare il builder in lazy chunks dedicati per ridurre peso iniziale e precache.


## Plan (Telegram admin notification for nuove tessere - Mar 21, 2026)
- [x] Mappare il flusso WhatsApp nuove tessere e il punto esatto in cui oggi parte la notifica admin via Twilio SMS
- [x] Introdurre config/env e helper `send_telegram_message(text)` con logging errori chiaro senza toccare gli altri flussi Twilio
- [x] Sostituire solo nel flusso richiesta nuove tessere la chiamata SMS con invio Telegram mantenendo identico il testo messaggio
- [x] Aggiungere test mirato e breve documentazione/manual test con payload di esempio e punto preciso della sostituzione
- [x] Eseguire verifiche locali mirate e aggiornare la review finale

## Review (Telegram admin notification for nuove tessere - Mar 21, 2026)
- La sostituzione funzionale e stata fatta in `app/services/whatsapp_bot.py`, dentro `_handle_order_notes(...)`: il messaggio `Nuovo ordine tessere: ...` e rimasto identico, ma la chiamata `send_admin_sms_notification(...)` e stata sostituita con `send_telegram_message(...)`.
- Ho aggiunto `app/services/telegram_notifications.py` con helper sync `send_telegram_message(text)` basato su `requests`, coerente con il progetto sincrono, con logging esplicito per env mancanti, errori HTTP, JSON invalido e risposta Telegram `ok=false`.
- Ho esteso la config runtime con `TG_BOT_TOKEN` e `TG_CHAT_ID` in `app/config.py`, `docker-compose.yml` e `.github/workflows/deploy-hetzner.yml`, cosi la nuova notifica e disponibile anche nei container/deploy.
- Documentazione minima aggiunta in `docs/telegram_recharge_notification.md` con env richieste, esempio payload manuale e punto preciso della sostituzione; `ENV_REQUIRED.md` e `DEPLOY.md` aggiornati per riflettere il nuovo canale Telegram.
- Verifiche locali completate: `python -m py_compile app/services/telegram_notifications.py app/services/whatsapp_bot.py app/config.py` OK, `python -m pytest -q tests/test_whatsapp_bot.py` OK (`7 passed`).

## Plan (Registro lotti DB-first + auto-lotto RechargeRequest - Mar 21, 2026)
- [x] Mappare schema e semantica reale di `CardBatch`, `RechargeRequest`, `next_no`, `released_at` e locking esistente
- [x] Estendere schema/model con collegamento richiesta->lotto e introdurre service centrale per helper numerazione, auto-creazione lotto shared ASSONAM, idempotenza e audit
- [x] Aggiornare il flusso WhatsApp per creare automaticamente il lotto nel pool `ASSONAM_CENTRAL` e bloccare in modo esplicito le org non shared
- [x] Convertire la delete dei lotti in rilascio storico limitato al dominio lotti, aggiornando query operative e di registro/export
- [x] Aggiungere API super-admin per registro lotti globale ed export Excel live dal DB
- [x] Implementare pagina super-admin `Registro lotti` con tabella, download Excel e integrazione nav/routing
- [x] Aggiungere test backend mirati su helper, idempotenza, concorrenza, storico lotti ed export; rieseguire verifiche locali

## Review (Registro lotti DB-first + auto-lotto RechargeRequest - Mar 21, 2026)
- Ho introdotto `app/services/card_lot_registry.py` come service centrale per helper numerazione, lock dedicato al pool shared ASSONAM, auto-creazione lotto su `RechargeRequest`, serializzazione registro e generazione Excel live da DB.
- `RechargeRequest` ora ha `card_batch_id` con migration dedicata `p1q2r3s4t5u6_add_recharge_request_card_batch_link.py`; `init_db.py` e `app/scripts/repair_sqlite.py` sono stati estesi per il bootstrap idempotente su ambienti già esistenti.
- Il punto di aggancio automatico e in `app/services/whatsapp_bot.py`, dentro `_handle_order_notes(...)`, subito dopo `db.flush()` della richiesta: da li parte `ensure_recharge_request_batch(...)`, che crea il lotto solo per org nel pool `ASSONAM_CENTRAL`, altrimenti marca la richiesta come `blocked_non_shared`.
- La delete lotti super-admin non fa piu hard delete: imposta `released_at`, il lotto sparisce dai flussi operativi ma resta in storico e continua a contribuire all'unicita dei range.
- Nuovi endpoint backend: `GET /api/super-admin/card-lots` e `GET /api/super-admin/card-lots/export.xlsx`. Nuova pagina frontend: `frontend/src/pages/super-admin/SuperAdminCardLots.tsx`, raggiungibile da `/super-admin/registro-lotti`.
- Verifiche eseguite: `python -m py_compile app/services/card_lot_registry.py app/services/whatsapp_bot.py app/routes/super_admin.py app/routes/org_admin.py app/models.py init_db.py` OK, `python -m pytest -q tests/test_card_lot_registry.py tests/test_whatsapp_bot.py tests/test_super_admin_card_lot_management.py` OK (`17 passed`), `npm --prefix frontend run build` OK.

## Plan (Org admin comunicazioni modelli - rimozione hero promo - Mar 21, 2026)
- [x] Individuare il componente reale della vista `Org admin > Comunicazioni > Modelli`
- [x] Rimuovere il hero promozionale mantenendo disponibile il cambio vista `Campagne/Modelli`
- [x] Eseguire verifica frontend mirata e documentare review finale

## Review (Org admin comunicazioni modelli - rimozione hero promo - Mar 21, 2026)
- In `frontend/src/pages/org-admin/components/communications/MessagesComposerHub.tsx` ho rimosso il hero introduttivo/promozionale dalla vista `Comunicazioni > Modelli/Campagne`.
- Il cambio vista `Campagne / Modelli` resta disponibile tramite uno switcher compatto, coerente con un workspace amministrativo e senza copy marketing.
- Il resto della pagina resta invariato: lista template, filtri, CTA `Nuovo modello`, lista campagne e CTA `Nuova campagna` continuano a vivere subito nel contenuto operativo.
- Verifica eseguita: `npm --prefix frontend run build` OK.

## Plan (Org admin comunicazioni wizard - rimozione hero interno - Mar 21, 2026)
- [x] Individuare il componente condiviso del hero nei wizard `Nuovo modello` e `Nuova campagna`
- [x] Rimuovere titolo e descrizione introduttivi mantenendo stepper e azioni operative
- [x] Eseguire verifica frontend mirata e documentare review finale

## Review (Org admin comunicazioni wizard - rimozione hero interno - Mar 21, 2026)
- In `frontend/src/pages/org-admin/components/communications/MessagesComposerHub.tsx` ho ridotto il componente condiviso `WizardHero` a un semplice stepper compatto.
- Nei flussi `Nuovo modello` e `Nuova campagna` spariscono quindi eyebrow, titolo grande e descrizione introduttiva; restano solo breadcrumb operativo, azioni in alto, stepper e contenuto dello step.
- Il fix passa da un solo componente condiviso, quindi il comportamento resta coerente tra entrambi i wizard senza duplicare logica.
- Verifica eseguita: `npm --prefix frontend run build` OK.

## Plan (Comunicazioni builder GrapesJS - flicker e blocchi - Mar 21, 2026)
- [x] Ispezionare `GrapesEmailBuilder` e il wiring in `MessagesComposerHub` per identificare la causa di flicker/reinit
- [x] Correggere il ciclo di inizializzazione del builder e rendere piu robusto l'inserimento dei blocchi nel canvas
- [x] Eseguire verifica frontend mirata e documentare review finale

## Review (Comunicazioni builder GrapesJS - flicker e blocchi - Mar 21, 2026)
- Root cause in `frontend/src/pages/org-admin/components/communications/GrapesEmailBuilder.tsx`: il `useEffect` di init/destroy di GrapesJS dipendeva da `initialMjmlSource` e `initialProjectData`, ma quei campi vengono aggiornati dal parent a ogni `onChange` del builder. Risultato: editor distrutto e ricreato continuamente durante l'editing, con sfarfallio e inserimenti che sembravano sparire.
- Ho limitato il ciclo di init al solo `editorKey`, che e il vero confine di sessione del builder. Le snapshot continuano a risalire al parent, ma non causano piu il remount di GrapesJS nello stesso editing session.
- Ho reso piu difensivo `appendBlock(...)`: dopo l'append verifica che il numero componenti sia aumentato davvero, seleziona il blocco appena inserito e lo porta in viewport con `scrollIntoView`, cosi l'utente vede subito l'inserimento.
- Verifica eseguita: `npm --prefix frontend run build` OK. Non ho rieseguito uno smoke browser interattivo in questa passata.

## Review (Smoke browser Comunicazioni cumulativo - Mar 21, 2026)
- Smoke browser reale completato su istanza locale dedicata `http://127.0.0.1:8100` servita da `uvicorn app.main:app`; ho usato questa porta perche il `8000` locale e occupato da un processo `postgres`, quindi il proxy Vite standard verso `/api` non era affidabile per la verifica.
- Auth org-admin locale verificata con magic-link one-shot su `admin id=2` / `org id=3`, con `communications_enabled=true`.
- Casi verificati in browser:
- lista `Comunicazioni > Modelli/Campagne`: il hero promozionale `Modelli e campagne, finalmente ordinati` non e piu visibile;
- wizard `Nuova campagna`: il titolo hero `Nuova campagna guidata` non e piu visibile; il builder apre correttamente da `Base vuota guidata`; click su `Titolo + testo` e `Immagine` inseriscono davvero i blocchi nel canvas e restano presenti dopo assestamento;
- wizard `Nuovo modello`: il titolo hero `Crea un modello guidato` non e piu visibile; il builder apre correttamente da `Parti da base vuota`; click su `Bottone CTA` e `Footer associazione` inseriscono davvero i blocchi nel canvas e restano presenti dopo assestamento.
- Evidenze salvate in `tasks/screenshots/communications-library-no-hero-20260321.png`, `tasks/screenshots/communications-campaign-builder-smoke-20260321.png`, `tasks/screenshots/communications-template-builder-smoke-20260321.png`.

## Plan (Comunicazioni libreria - delete campagne/modelli - Mar 21, 2026)
- [x] Verificare le azioni gia presenti nella libreria `Modelli/Campagne` e lo stato delle API di delete
- [x] Aggiungere la delete mancante per le campagne e allineare la UI libreria con conferma esplicita
- [x] Eseguire build frontend e verifica mirata, poi documentare review finale

## Review (Comunicazioni libreria - delete campagne/modelli - Mar 21, 2026)
- La libreria `Comunicazioni > Modelli/Campagne` ora espone anche l'azione `Elimina` sulle card campagna, con conferma esplicita via modal, allineata al comportamento gia presente per i modelli.
- In `frontend/src/pages/org-admin/components/communications/MessagesComposerHub.tsx` ho aggiunto stato dedicato `deleteCampaignTarget`, modal di conferma e refresh della libreria dopo la delete; se la campagna eliminata e quella aperta nel builder, il flusso rientra automaticamente alla libreria.
- In `frontend/src/lib/api.ts` ho aggiunto il client `deleteOrgAdminEmailCampaign(...)`; lato backend, `app/routes/org_admin.py` espone `DELETE /api/org-admin/communications/campaigns/{campaign_id}` con scope ristretto all'associazione dell'org admin autenticato.
- Verifiche eseguite: `npm --prefix frontend run build` OK, `python -m py_compile app/routes/org_admin.py` OK, `python -m pytest -q tests/test_org_admin_communications.py -k delete_draft_campaign` OK.
## Plan (SumUp post-payment page allineata al flusso tessera standard - Mar 31, 2026)
- [x] Mappare il flusso SumUp post-webhook e il flusso auto-iscrizione standard per individuare i dati/link finali da riusare
- [x] Estendere backend status/email delivery per esporre la stessa pagina tessera pubblica e inviare la mail tessera anche nel caso SumUp
- [x] Aggiornare la pagina frontend post-payment per reindirizzare al percorso tessera standard invece di mostrare una pagina separata
- [x] Eseguire test/build mirati e documentare la review finale

## Review (SumUp post-payment page allineata al flusso tessera standard - Mar 31, 2026)
- In `app/services/member_card_delivery.py` ho introdotto un helper condiviso che costruisce gli stessi link pubblici della tessera gia usati dal flusso standard: token verifica, download PDF, wallet e `active_card_page_url` verso `/associazioni/{org_slug}/tessera?...`.
- Lo stesso service ora permette di forzare `card_view_url_override` nelle mail tessera; in questo modo il caso SumUp non punta piu a `/dashboard`, ma alla stessa pagina finale pubblica della tessera gia pronta.
- In `app/services/membership_payments.py` il fulfillment da webhook SumUp non usa piu il path email che richiedeva documenti approvati: ora accoda `queue_member_card_email(... require_approved_document=False, email_type="member_card_active")`, mantenendo il webhook come unica fonte di fulfillment ma riallineando la consegna email al caso auto-iscrizione.
- In `app/routes/membership_payments.py` e `frontend/src/lib/api.ts` lo status pubblico del pagamento espone ora anche i link tessera standard; `frontend/src/pages/IscrizionePagamentoEsito.tsx` usa `active_card_page_url` e reindirizza automaticamente alla pagina tessera standard appena la card risulta `issued`, lasciando solo uno stato transitorio minimo.
- Ho aggiunto copertura mirata in `tests/test_membership_payments_sumup.py` per verificare che il webhook SumUp accodi la mail tessera standard e che l'endpoint status restituisca `active_card_page_url` e gli altri link tessera pubblici.
- Verifiche eseguite: `python -m pytest -q tests/test_membership_payments_sumup.py tests/test_org_admin_manual_payment.py tests/test_member_card_verification.py tests/test_payment_method_join.py` OK (`19 passed`), `npm --prefix frontend run build` OK.

## Plan (Public signup social preview + UTF-8 fix - Apr 09, 2026)
- [x] Mappare il rendering reale della route pubblica `/associazioni/{slug}/iscrizione`, del fallback SPA e dei resolver logo/meta per capire dove iniettare meta server-rendered senza toccare la homepage
- [x] Correggere UTF-8/meta base nel layout HTML condiviso e ripulire le stringhe mojibake rilevanti (`â€“`, `Â`, `â€™`, ecc.) nei file coinvolti dal rendering pubblico
- [x] Implementare meta dinamici server-rendered per le pagine iscrizione organizzazione-specifiche con fallback immagine ASSONAM e lasciare invariati i tag homepage
- [x] Aggiungere o aggiornare test/verifiche mirate sul page source/meta e documentare review finale in `tasks/todo.md`

## Review (Public signup social preview + UTF-8 fix - Apr 09, 2026)
- Ho aggiunto in `app/routes/public.py` una route server-rendered dedicata per `/associazioni/{slug}/iscrizione`: legge la shell SPA `index.html`, forza `<meta charset="UTF-8" />` e sostituisce nel page source i meta richiesti (`title`, `description`, `og:*`, `twitter:*`, canonical) con valori dinamici per organizzazione, cosi crawler WhatsApp/Facebook/Telegram vedono il contenuto corretto senza dipendere da JavaScript.
- Il contenuto dinamico usa esattamente `Iscriviti ora a {org.name}` e `Tesseramento online {org.name}`. `og:image` e `twitter:image` puntano prima al logo org (`/api/organizations/{slug}/logo` o fallback branding esistente), e in assenza di immagine usano il fallback ASSONAM `/logo.jpg`.
- In `frontend/index.html` ho mantenuto i tag homepage generici, ma ho rimosso le stringhe mojibake (`Â`, `â€”`, `contabilitÃ `) sostituendole con testo semplice e sicuro; il file resta con charset UTF-8 esplicito.
- In `frontend/src/lib/seo.ts` ho aggiunto l'opzione `appendSiteName` e in `frontend/src/pages/Iscrizione.tsx` ho allineato anche il meta update lato client dopo hydration agli stessi valori richiesti dal backend, evitando drift tra page source e DOM runtime.
- Ho cercato nei sorgenti i pattern rotti richiesti (`â€“`, `Â`, `â€™`, `Ã`, `â€”`): nei file sorgente coinvolti dal rendering pubblico il problema reale era concentrato nella shell `frontend/index.html`, che ora e corretta. Le occorrenze restanti trovate dal grep erano solo nelle asserzioni del nuovo test.
- Verifiche eseguite:
  - `python -m pytest -q tests/test_public_signup_meta.py tests/test_spa_static_files.py`
  - `npm --prefix frontend run build`

## Plan (Display name pubblico org ovunque - Apr 09, 2026)
- [x] Verificare dove il pubblico usa ancora `Organization.name` invece di `club_display_name` / `resolve_club_display_name`, con check anche live su Hetzner
- [x] Correggere preview signup server-rendered e ricerca elenco associazioni per usare il nome visualizzato come sorgente primaria
- [x] Aggiungere regressioni test su signup meta e search pubblico, poi verificare localmente e confrontare il dato live sul server

## Review (Display name pubblico org ovunque - Apr 09, 2026)
- Root cause trovata in `app/routes/public.py`: la route server-rendered `/associazioni/{slug}/iscrizione` prendeva ancora `org.name` prima del branding resolver, quindi WhatsApp mostrava il nome legacy anche quando il campo `club_display_name` era stato aggiornato da super-admin.
- Nello stesso file l'endpoint pubblico `GET /api/organizations` serializzava gia il nome visualizzato, ma la ricerca `?q=` filtrava solo su `Organization.name`; per questo un utente poteva non trovare l'associazione cercando il nome visualizzato dalla barra pubblica.
- Ho corretto entrambi i punti: preview/meta signup ora usano prima `resolve_club_display_name(org)`, mentre la ricerca pubblica filtra su `Organization.name OR Organization.club_display_name` e ordina per nome visualizzato con `coalesce(club_display_name, name)`.
- Ho interrogato anche il server Hetzner: il branch live e gia `feat/redesign-landing-wizard` al commit `dbb28f7`, quindi il problema segnalato e davvero un gap applicativo su `club_display_name`, non un deploy vecchio.
- Ho aggiunto regressioni in `tests/test_public_signup_meta.py` per coprire sia il caso `name != club_display_name` nella pagina sorgente della signup sia la ricerca pubblica per `club_display_name`.

## Plan (Diagnosi Arcigallo non visibile nel pubblico - Apr 09, 2026)
- [x] Verificare se l'org viene restituita dall'API pubblica live e quali filtri usa il backend per l'elenco associazioni
- [x] Leggere lo stato reale dell'organizzazione sul database live per distinguere tra ricerca rotta e org esclusa per stato
- [x] Documentare la causa con riferimento a route pubbliche e stato live dell'org

## Review (Diagnosi Arcigallo non visibile nel pubblico - Apr 09, 2026)
- Sul live `GET /api/organizations?q=arcigallo` restituisce `[]`, quindi il problema non e nella barra di ricerca frontend ma nell'esclusione lato backend.
- In [app/routes/public.py](/C:/Users/edoar/OneDrive/Desktop/CODE/iscrizioni%20clienti/Iscrizioni_clienti/app/routes/public.py) l'elenco pubblico filtra solo organizzazioni attive; la signup/detail pubblica filtrano anche `deleted_at is null`.
- Verifica diretta sul database live Hetzner per `organizations.id = 33`: `name = Arcigallo`, `club_display_name = Club Arcigallo`, `slug = arcigallo`, `is_active = false`, `deleted_at = 2026-02-27 19:06:41+00`.
- Quindi Arcigallo non compare sul sito pubblico perche risulta archiviata/inattiva; il badge `ARCHIVIATA` che si vede nel super admin e coerente con questa esclusione.

## Plan (ASSONAM membership types + riepilogo Soci - Apr 11, 2026)
- [x] Estendere schema/migration/bootstrap con flag associazione, prezzi/durata temporanea globale e campi socio (`membership_type`, `valid_from`, `valid_until`, `membership_fee_snapshot`) con backfill non distruttivo
- [x] Aggiornare service/backend per validita tessera, riepilogo economico, setup super admin/org admin e flussi signup/payment/manual member mantenendo backward compatibility
- [x] Aggiornare frontend super admin, org admin Soci e wizard Iscrizione con scelta annuale/temporanea, settings durata globale e card riepilogo
- [x] Adeguare preview/PDF/verifica/wallet per label `TEMPORANEA` e scadenza reale, poi eseguire test/build mirati e documentare review finale

## Review (ASSONAM membership types + riepilogo Soci - Apr 12, 2026)
- Ho introdotto il flag per-associazione `custom_membership_types_enabled` con default `false`, esposto solo nel setup `SUPER ADMIN > Associazioni`, insieme ai nuovi campi organizzazione per prezzo temporaneo e durata globale (`hours` / `days`). La migration e `alembic/versions/m2n3o4p5q6r7_add_membership_types_and_fee_snapshots.py`; `init_db.py` e `app/scripts/repair_sqlite.py` sono stati allineati per bootstrap/repair SQLite.
- Sul modello socio ho aggiunto `membership_type`, `valid_from`, `valid_until`, `membership_fee_snapshot`. Il backfill iniziale valorizza `membership_fee_snapshot` senza sovrascrivere valori esistenti, con precedenza da pagamenti membership, poi pagamenti manuali legacy, poi quota annuale dell’associazione al momento della migration.
- La logica di validita ora usa `valid_until` come fonte di verita quando presente e ricade su `card_year` per i record legacy. Ho centralizzato i predicati in `app/services/member_activity.py` e riallineato org admin, super admin, maintenance, wallet, verify, PDF e card image per evitare drift tra annuale legacy e temporanea.
- `ORG ADMIN > Soci` ora espone in alto una summary card con `Totale teorico tessere`, calcolato sull’intera associazione usando solo `membership_fee_snapshot` dei soci con tessera emessa (`card_no` + `card_year`). Il totale include anche temporanee scadute e non usa fallback runtime al prezzo corrente dell’associazione.
- L’org admin ha un endpoint dedicato `GET/PATCH /api/org-admin/organization/membership-settings` per quota annuale, quota temporanea e durata globale delle temporanee. Quando il flag e spento i campi temporanei restano nascosti/non modificabili.
- Il wizard pubblico di iscrizione e il checkout membership supportano la scelta `Annuale` / `Temporanea` solo se il flag associazione e attivo. Nel caso temporaneo il backend calcola `valid_until` dalla regola globale org-admin e blocca la scelta se l’associazione non ha la feature attiva.
- Nella UI sono stati aggiornati:
- `frontend/src/pages/super-admin/components/OrganizationManageModal.tsx` per il toggle super admin.
- `frontend/src/pages/org-admin/OrgAdminMembers.tsx` per summary card e pannello impostazioni membership.
- `frontend/src/pages/org-admin/components/CreateMemberModal.tsx` e `frontend/src/pages/org-admin/components/EditMemberProfileModal.tsx` per tipo tessera e snapshot per-socio quando consentiti.
- `frontend/src/pages/Iscrizione.tsx` per la scelta pubblica annuale/temporanea con riepilogo coerente.
- `frontend/src/components/cards/MemberCardPreview.tsx`, `app/services/card_image.py`, `app/services/card_pdf.py`, `app/routes/public.py` e `app/services/google_wallet.py` per mostrare label `TEMPORANEA` e scadenza reale dove applicabile.
- Verifiche eseguite:
- `python -m pytest -q tests/test_org_admin_manual_member.py tests/test_org_admin_member_filters.py tests/test_join_auto_issue.py tests/test_member_card_verification.py tests/test_org_admin_member_profile_and_card_actions.py tests/test_super_admin_organizations_pagination.py`
- `python -m py_compile app/routes/join.py app/routes/org_admin.py app/routes/super_admin.py app/routes/public.py app/routes/member.py app/services/member_activity.py app/services/member_card_delivery.py app/services/integration_issuer.py app/services/card_pdf.py`
- `npm --prefix frontend run build`

## Plan (ORG ADMIN WhatsApp automazioni light mode compatibility - Apr 13, 2026)
- [x] Individuare nel workspace `Comunicazioni > WhatsApp > Automazioni` le superfici hardcoded dark che ignorano il theme switch del sito
- [x] Convertire il wizard e le card automazioni a un tema light-first compatibile con il theme switch gia esistente del sito
- [x] Eseguire la build frontend e documentare nella review l'esito reale del fix

## Review (ORG ADMIN WhatsApp automazioni light mode compatibility - Apr 13, 2026)
- In `frontend/src/pages/org-admin/components/communications/WhatsAppAutomationsHub.tsx` ho rimosso la shell dark-only introdotta nel redesign del wizard: il pannello `Configurazione`, la sidebar `Preview`, le card review e i controlli ora sono light-first invece di usare superfici `#111b21 / #0f171c`.
- Gli input, textarea e select ora usano classi coerenti con il layer tema del progetto (`theme-input` + utility `bg-white`, `border-neutral-200`, `text-slate-*`), cosi in light mode la vista torna chiara e in dark mode continua a passare dal compatibility layer globale gia definito in `frontend/src/theme.css`.
- Ho riallineato anche stepper, card automazioni selezionate, stato `Attiva/Bozza`, card `Nuova regola` e toolbar finale ai token neutrali del resto dell'area riservata, mantenendo solo l'accento verde WhatsApp come colore funzionale.
- Verifica eseguita: `npm --prefix frontend run build` OK. Resta solo il warning Vite gia noto sui chunk sopra soglia, non introdotto da questo fix.

## Plan (ORG ADMIN spostamento riepilogo tessere da Soci a Tessere - Apr 13, 2026)
- [x] Analizzare il wiring attuale di `Riepilogo Tessere` e `Impostazioni Tessera` tra `OrgAdminMembers.tsx` e `OrgAdminCards.tsx`
- [x] Rimuovere il banner oversized dalla pagina `Soci` e rimontare gli stessi blocchi nella pagina `Tessere` con scala piu compatta
- [x] Eseguire la build frontend e documentare nella review l'esito reale del refactor

## Review (ORG ADMIN spostamento riepilogo tessere da Soci a Tessere - Apr 13, 2026)
- In `frontend/src/pages/org-admin/OrgAdminMembers.tsx` ho rimosso completamente il blocco `Riepilogo Tessere / Impostazioni Tessera`: la pagina `Soci` torna focalizzata su header, filtri, tabella e modal di creazione socio.
- Nello stesso file ho lasciato solo il caricamento delle `membershipSettings` realmente necessarie al modal `Aggiungi socio`, eliminando stato e handler non piu usati dal vecchio banner per non lasciare dead code TypeScript.
- In `frontend/src/pages/org-admin/OrgAdminCards.tsx` ho spostato il riepilogo economico e il form impostazioni in alto nella pagina `Tessere`, accanto ai dati magazzino gia esistenti.
- Il blocco spostato e stato anche ridotto di scala: titoli piu piccoli, card piu compatte, KPI meno oversized e campi form piu densi. Il risultato resta leggibile ma non ha piu l'effetto hero gigante visto nello screenshot.
- Per mantenere la logica invariata, `Tessere` ora carica anche `fetchOrgAdminMembershipSettings()` e un fetch minimo `fetchOrgAdminMembers({ limit: 1, offset: 0 })` solo per leggere `summary.total_theoretical_membership_fees` e `issued_members_count`, senza introdurre API nuove.
- Verifica eseguita: `npm --prefix frontend run build` OK. Resta solo il warning Vite gia noto sui chunk sopra soglia, non introdotto da questo refactor.

## Plan (Super Admin toggle banner maggiorenni signup - Apr 13, 2026)
- [x] Mappare setup associazione super-admin e rendering signup pubblica per individuare il punto minimo di aggancio del nuovo flag
- [x] Aggiungere il flag per-associazione nel backend/API super-admin e mantenerlo coerente con bootstrap/migration
- [x] Esporre il toggle nel setup associazione e mostrare il banner maggiorenni nella pagina iscrizione solo quando attivo
- [x] Eseguire verifiche reali e documentare la review finale con esito build/test

## Review (Super Admin toggle banner maggiorenni signup - Apr 13, 2026)
- Ho aggiunto il nuovo flag per-associazione `adults_only_banner_enabled` sul modello `Organization`, con migration dedicata in `alembic/versions/n3o4p5q6r7s8_add_org_adults_only_banner_flag.py` e allineamento anche di `init_db.py`, `app/schema_validation.py` e `app/scripts/repair_sqlite.py` per bootstrap e repair SQLite.
- In `app/routes/super_admin.py` il flag e ora esposto nella lista/patch/create organizzazioni, seguendo lo stesso pattern gia usato per `auto_approve_signup` e `require_membership_document`.
- In `frontend/src/pages/super-admin/components/OrganizationManageModal.tsx` il setup della singola associazione espone il checkbox `Attiva banner maggiorenni` con descrizione esplicita; il valore viene caricato dall'organizzazione selezionata e salvato correttamente via PATCH.
- In `app/routes/public.py` e `frontend/src/lib/api.ts` il dettaglio pubblico organizzazione espone il nuovo boolean, cosi `frontend/src/pages/Iscrizione.tsx` puo mostrare un avviso solo quando il flag e attivo.
- Il banner pubblico e stato aggiunto in alto nel wizard iscrizione, subito sotto l'hero: usa superficie chiara con accento rosso, icona informativa e testo `Iscrizione consentita solo ai maggiori di 18 anni.`, restando visibile ma senza interrompere il flusso.
- Verifiche eseguite:
- `python - <<PY ... py_compile ... PY` su `app/models.py`, `app/routes/super_admin.py`, `app/routes/public.py`, `app/schema_validation.py`, `app/scripts/repair_sqlite.py`, `init_db.py`, `alembic/versions/n3o4p5q6r7s8_add_org_adults_only_banner_flag.py` OK
- `npm --prefix frontend run build` OK

## Plan (Signup maggiorenni - blocco under 18 con flag attivo - Apr 13, 2026)
- [x] Estendere il flag maggiorenni con una regola di validazione età minima condivisa tra iscrizione standard e checkout pagamento
- [x] Aggiornare il wizard pubblico per mostrare subito l'errore sulla data di nascita quando il flag e attivo e l'età e inferiore a 18 anni
- [x] Eseguire test/build mirati e documentare review finale

## Review (Signup maggiorenni - blocco under 18 con flag attivo - Apr 13, 2026)
- In `app/routes/join.py` ho aggiunto l'helper condiviso `ensure_adults_only_age_requirement(...)`: quando `adults_only_banner_enabled` e attivo, il backend rifiuta le date di nascita che non raggiungono i 18 anni compiuti alla data corrente con errore `Iscrizione consentita solo ai maggiori di 18 anni.`.
- Lo stesso controllo viene applicato sia nel submit iscrizione classico `/api/join/{org_slug}/submit` sia nel checkout online SumUp in `app/routes/membership_payments.py`, cosi il flag non resta aggirabile cambiando percorso.
- In `frontend/src/pages/Iscrizione.tsx` il campo `Data di nascita` ora riceve anche la regola client-side: se il flag e attivo imposta `max` alla data limite per i maggiorenni, mostra hint esplicito con la data massima consentita e segnala subito errore se viene inserita una data minorenne.
- Il banner rosso introdotto prima resta visibile in alto; in piu adesso la regola è realmente enforced e non solo comunicata.
- Ho aggiunto test mirati in `tests/test_adults_only_signup.py` per coprire:
- esposizione del flag nel dettaglio pubblico organizzazione;
- rifiuto under-18 sul submit standard;
- rifiuto under-18 sul checkout pagamento online.
- Verifiche eseguite:
- `python -m pytest -q tests/test_adults_only_signup.py` OK (`3 passed`)
- `py_compile` OK su `app/routes/join.py`, `app/routes/membership_payments.py`, `tests/test_adults_only_signup.py`
- `npm --prefix frontend run build` OK

## Plan (Comunicazioni campaign invio + semplificazione impostazioni form - Apr 18, 2026)
- [x] Individuare i componenti dello step finale `Invio` campagne e della sezione `Impostazioni` form per capire dove rimuovere preview e blocchi WhatsApp ridondanti
- [x] Correggere il layout dello step `Invio` rimuovendo la preview finale e centrando le azioni `Bozza` e `Invio`
- [x] Semplificare `Comunicazioni > Form > Impostazioni` rimuovendo la sezione WhatsApp ridondante e traducendo le stringhe residue in italiano
- [x] Eseguire build frontend e documentare review finale

## Review (Comunicazioni campaign invio + semplificazione impostazioni form - Apr 18, 2026)
- In `frontend/src/pages/org-admin/components/communications/MessagesComposerHub.tsx` ho rimosso del tutto la preview dallo step finale `Invio` del wizard campagne: la vista ora mostra solo le due card azione `Bozza pronta` e `Invio immediato`, centrate e con larghezza controllata, senza il layout spezzato visto nello screenshot.
- Nello stesso flusso la preview resta dove ha senso, cioe nello step precedente `Preview`; l'ultimo step torna a essere solo un passaggio decisionale pulito prima del salvataggio o dell'invio.
- In `frontend/src/pages/org-admin/OrgAdminForms.tsx` ho semplificato il tab `Impostazioni` del dettaglio form rimuovendo l'intero blocco WhatsApp avanzato e anche la colonna `Core Automations`, che risultavano ridondanti rispetto a `Comunicazioni > WhatsApp > Automazioni`.
- La sezione impostazioni residua ora e focalizzata su accesso e notifiche: link pubblico, slug, visibilita, stato pagina, email notifiche e toggle essenziali.
- Ho tradotto in italiano le etichette rimaste in quell'area, inclusi `Link pubblico`, `Copia`, `Personalizza URL`, `Visibilita`, `Pagina attiva`, `Email notifiche`, `Notifica segreteria`, `Conferma utente` e `Invii multipli`.
- Verifica eseguita: `npm --prefix frontend run build` OK. Resta solo il warning Vite gia noto sui chunk grandi.

## Plan (Workspace Comunicazioni unificato - Apr 18, 2026)
- [x] Riallineare la shell `Org Admin > Comunicazioni` con una subnav compatta, naming coerente e microcopy interamente in italiano
- [x] Ridisegnare `Panoramica` come home operativa piu utile, con KPI, stato canali e azioni contestuali
- [x] Separare davvero `Campagne` e `Modelli`, densificare le liste e alleggerire i wizard email
- [x] Rendere `WhatsApp` coerente col resto del workspace: frame light, inbox dark solo interna, copy pulita e connessione/QR piu chiari
- [x] Semplificare `Automazioni WhatsApp`, `Form pubblici` embedded e `Impostazioni email` con gerarchia e CTA coerenti
- [x] Eseguire build frontend e documentare review finale con esito reale

## Review (Workspace Comunicazioni unificato - Apr 18, 2026)
- Shell `Comunicazioni` semplificata con tab top-level compatti e separazione reale tra `Campagne`, `Modelli`, `Form pubblici`, `WhatsApp` ed `Email`.
- `Panoramica` trasformata in home operativa con KPI, next actions e riepilogo del mittente effettivo.
- `MessagesComposerHub` adattato al nuovo shell con supporto a subtab forzati; lista modelli alleggerita e piu densa.
- `WhatsApp` riportato in cornice light-first con copy meno rumorosa; automazioni ridotte a 3 step con review laterale.
- `Form pubblici` ed `Email` ripuliti da label inglesi nelle aree toccate e resi piu guidati.
- Verifica eseguita: `npm --prefix frontend run build` OK il 18 Apr 2026. Rimane solo il warning Vite gia noto sui chunk grandi.
## Plan (Rehaul completo Org Admin ASSONAM - Apr 24, 2026)
- [x] Generare un mockup sheet GPT Image 2.0 per schermate org-admin non coperte dagli allegati, incluse dashboard, inviti, dettaglio socio, documenti, contabilita, impostazioni e sottowizard principali
- [x] Introdurre una shell org-admin completa con sidebar raggruppata, topbar scura, profilo/notifiche e navigazione mobile senza cambiare auth/context/router
- [x] Aggiungere primitive visuali condivise per page header, KPI, toolbar, table shell, side panel, wizard/stepper, stati e badge, riusando i flussi esistenti
- [x] Applicare il redesign alle superfici top-level: dashboard, soci, dettaglio socio, tessere, prenotazioni, comunicazioni, inviti, documenti, contabilita, associazione e billing demo
- [x] Applicare il redesign alle sottosezioni operative: wizard campagne/modelli, form builder e risposte, WhatsApp inbox/automazioni, prenotazioni agenda/mappa, modali e conferme
- [x] Verificare typecheck/build frontend, test backend org-admin mirati e documentare review finale

## Review (Rehaul completo Org Admin ASSONAM - Apr 24, 2026)
- Mockup GPT Image 2.0 per schermate mancanti salvato in `tasks/screenshots/org-admin-missing-screens-mockup-20260424.png`.
- Shell `/org-admin` ridisegnata con sidebar fissa raggruppata, topbar scura, profilo, notifiche, footer versione e navigazione mobile preservando auth, route, context, feature gate e logout.
- Stile comune applicato in modo scoped sotto `.org-admin-v2`: superfici, KPI, toolbar, tabelle, badge, tab, modali/drawer, form, builder e stati ereditano la nuova grammatica senza cambiare handler/API.
- Prenotazioni ora supporta deep link `?section=agenda|rooms|tables|map`; la mappa sala e stata riallineata al riferimento con floor-plan, stati colore, pannello tavolo e drag coordinate invariati.
- Corretto un bug emerso dai test: le campagne schedulate con form collegato e CTA di design includono ora CTA e URL nel body inviato.
- Logo e payoff ASSONAM non sono stati modificati; viene riusato `frontend/public/assonam-logo.svg` esistente.
- Verifiche: `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con warning chunk grandi gia noto; `python -m pytest -q tests/test_org_admin_communications.py tests/test_org_admin_whatsapp.py tests/test_org_admin_member_filters.py tests/test_org_admin_manual_member.py tests/test_org_admin_member_profile_and_card_actions.py tests/test_org_admin_card_lot_movements.py` OK, 39 passed.
- Smoke browser autenticato eseguito successivamente su istanza locale seedata `http://127.0.0.1:8017`; screenshot e summary in `tasks/screenshots/org-admin-visual-smoke-20260424-final-light-noext/` coprono 26 superfici desktop/mobile incluse wizard, builder, modali, detail panel e mappa sala. Residui non bloccanti: `whatsapp/contacts` 502 per Evolution abilitato senza API key locale e `stripe-demo` 404 per billing demo non abilitato nell'env/org seed.

## Plan (Fix builder campagne, form e sondaggi - Apr 29, 2026)
- [x] Sostituire il pannello proprieta campagne tecnico con inspector custom in italiano per testo, CTA, immagine e blocco/sezione
- [x] Rendere theme-aware rail, blocchi, pannello proprieta e controlli GrapesJS del builder campagne, lasciando chiaro solo il canvas email
- [x] Rendere theme-aware le superfici critiche del builder form/sondaggi: palette, canvas, card campo, pannello proprieta e input
- [x] Separare draft locale e autosave nel builder form/sondaggi per consentire modifica blocchi prima del primo salvataggio
- [x] Persistire al primo save i blocchi draft del nuovo form/sondaggio in sequenza, preservando ordine e metadata
- [x] Aggiungere regressione backend sui campi form persistiti in ordine ed eseguire test/build previsti

## Review (Fix builder campagne, form e sondaggi - Apr 29, 2026)
- `GrapesEmailBuilder` ora usa un inspector custom in italiano per testo, bottone, immagine e blocco; lo style manager GrapesJS e spostato in `Avanzate`, chiuso di default.
- Il CSS del builder campagne usa variabili light/dark scoped: rail, tab, blocchi, input, struttura messaggio e pannello avanzato non mischiano piu superfici chiare con input scuri. Il canvas email resta chiaro per rappresentare l'email reale.
- Il builder form/sondaggi distingue draft locale e persistenza: sui nuovi form si possono aggiungere e modificare blocchi prima del primo save; dopo la creazione del form i blocchi draft vengono creati in sequenza via API e poi ricaricati come campi reali.
- Ho corretto anche la normalizzazione backend delle chiavi builder `__ui_*` / `__survey_*`, perche venivano trasformate in chiavi legacy senza prefisso e potevano perdere identita dopo reload. Il frontend decodifica comunque anche le chiavi legacy gia presenti.
- Verifiche eseguite: `python -m py_compile app/services/forms.py`; `python -m pytest -q tests/test_forms_module.py tests/test_org_admin_communications.py::test_org_admin_builder_template_assets_and_campaign_from_template` OK (`17 passed`); `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con solo warning Vite chunk grandi gia noto.

## Plan (Builder campagne follow-up bordi e dati rapidi - Apr 29, 2026)
- [x] Rimuovere i residui visuali nativi GrapesJS che creano bordi/scuri sui blocchi laterali in light e dark mode
- [x] Rendere coerenti anche i wrapper del pannello avanzato quando resta disponibile sotto inspector custom
- [x] Ripristinare nel tab `Dati` scorciatoie rapide per telefono, data e merge tag ricorrenti senza dipendere solo dalla lista API
- [x] Eseguire typecheck/build frontend e documentare l'esito

## Review (Builder campagne follow-up bordi e dati rapidi - Apr 29, 2026)
- In `grapes-email-builder.css` ho neutralizzato wrapper, label, pseudo-elementi, background e shadow nativi GrapesJS per i blocchi laterali: i blocchi ora usano solo i token scoped `--builder-*` in light e dark mode.
- Ho applicato la stessa normalizzazione al pannello `Avanzate`, cosi anche quando viene aperto non mostra piu cornici o superfici scure incoerenti con il tema corrente.
- In `emailBuilder.ts` ho aggiunto blocchi guidati `Data e dettagli` e `Contatti`, per ripristinare opzioni pratiche come data, telefono ed email direttamente dalla palette.
- In `app/services/email_templates.py` ho aggiunto i merge tag reali `{{telefono_socio}}`, `{{telefono_associazione}}` e `{{data_oggi}}`, includendoli nel contesto di rendering per evitare placeholder vuoti non supportati.
- Verifiche eseguite: `python -m py_compile app/services/email_templates.py` OK; `python -m pytest -q tests/test_org_admin_communications.py::test_org_admin_template_library_seed_duplicate_preview_and_archive` OK; `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con solo warning Vite chunk grandi gia noto.

## Plan (Iscrizione stato estero codice fiscale - Apr 29, 2026)
- [x] Mappare validazione codice fiscale/comune nascita nel frontend e negli endpoint iscrizione/pagamento
- [x] Aggiungere flag `Stato estero` nel wizard pubblico: quando attivo sostituisce autocomplete comune e usa il codice catastale estero generico
- [x] Aggiornare API submit/checkout e backend per accettare nascita estera senza lookup comune italiano
- [x] Coprire il flusso con test backend e verifiche frontend

## Review (Iscrizione stato estero codice fiscale - Apr 29, 2026)
- In `frontend/src/pages/Iscrizione.tsx` ho aggiunto il flag `Nato/a all'estero`: quando attivo sostituisce l'autocomplete del comune con il valore read-only `Stato estero`, usa il codice `Z000` per il calcolo del codice fiscale e aggiorna il riepilogo finale.
- In `frontend/src/lib/api.ts` il flag `birth_place_foreign` viene inviato sia al submit iscrizione standard sia al checkout pagamento online.
- In `app/routes/join.py` e `app/routes/membership_payments.py` il backend accetta il flag e bypassa il lookup dei comuni italiani, persistendo `birth_place = Stato estero` e `birth_place_code = Z000` senza nuove colonne o migrazioni.
- Ho aggiunto una regressione in `tests/test_signup_fiscal_code.py` per il submit con nascita estera.
- Verifiche eseguite: `python -m py_compile app/routes/join.py app/routes/membership_payments.py tests/signup_payloads.py tests/test_signup_fiscal_code.py` OK; `python -m pytest -q tests/test_signup_fiscal_code.py` OK (`4 passed`); `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con solo warning Vite chunk grandi gia noto.

## Plan (Iscrizione stati esteri con codice catastale reale - Apr 29, 2026)
- [x] Sostituire il fallback `Z000` con selezione dello stato estero e relativo codice catastale
- [x] Validare lato backend i codici esteri `Z###` senza lookup comune italiano e persistere nome/codice selezionati
- [x] Consentire comunque CF manuale formalmente valido quando l'utente modifica un codice diverso da quello atteso
- [x] Aggiornare test e verifiche frontend/backend

## Review (Iscrizione stati esteri con codice catastale reale - Apr 29, 2026)
- In `frontend/src/lib/foreignBirthPlaces.ts` ho aggiunto una lista locale di Stati esteri con codice catastale `Z###`, inclusi i casi esplicitamente richiesti `Albania - Z100` e `Stati Uniti d'America - Z404`.
- In `frontend/src/pages/Iscrizione.tsx`, quando `Nato/a all'estero` e attivo, il campo diventa una tendina Stato estero; la scelta aggiorna `birth_place`, `birth_place_code` e il calcolo automatico del codice fiscale.
- `Z000` non viene piu proposto ne accettato come codice estero nel frontend.
- In `app/routes/join.py` il backend valida il caso estero con pattern `Z###` escluso `Z000`, persiste nome e codice ricevuti e continua ad accettare CF formalmente validi anche se modificati manualmente rispetto allo Stato selezionato, con warning non bloccante.
- Verifiche eseguite: `python -m py_compile app/routes/join.py app/routes/membership_payments.py tests/signup_payloads.py tests/test_signup_fiscal_code.py` OK; `python -m pytest -q tests/test_signup_fiscal_code.py` OK (`6 passed`); `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con solo warning Vite chunk grandi gia noto.

## Plan (Deploy no space server cleanup - Apr 29, 2026)
- [x] Verificare spazio disco e uso Docker sul server `157.90.31.105`
- [x] Liberare cache Docker sicure senza rimuovere volumi/database
- [x] Verificare spazio e servizi dopo cleanup
- [x] Eseguire ripush del branch per ritentare il deploy

## Review (Deploy no space server cleanup - Apr 29, 2026)
- Il deploy falliva per root filesystem pieno: `/dev/sda1` era al 100% con `0` spazio disponibile.
- La causa principale era storage Docker/containerd sotto `/var/lib/containerd`; ho liberato solo risorse ricreabili con prune immagini/build cache/container/network non usati, `journalctl --vacuum-size=100M` e pulizia apt.
- Non ho toccato volumi Docker ne dati Postgres.
- Dopo cleanup `/dev/sda1` e al 25% con circa `27G` liberi; `docker compose ps` mostra web, worker e db in esecuzione/healthy e `pg_isready` risponde `accepting connections`.
- Branch ripushato per ritentare il deploy dopo il cleanup.
## Plan (Correzione regressioni dark settings e builder - May 1, 2026)
- [x] Aggiungere lesson sulle regressioni segnalate: tab impostazioni hardcoded e wrapper GrapesJS trasparenti.
- [x] Rendere dark-aware `Sondaggi > Impostazioni` con scope `form-settings-tab` e override tokenizzati per pannelli, input, label e testi.
- [x] Correggere il pannello sinistro del builder campagne forzando i wrapper GrapesJS della block manager sul token del rail invece che trasparenti.
- [x] Eseguire typecheck/build frontend e pushare commit incrementale.

## Review (Correzione regressioni dark settings e builder - May 1, 2026)
- `Sondaggi > Impostazioni`: aggiunto scope `form-settings-tab` e override dark mode per pannelli, input, textarea, select, label e testi ancora basati su classi hardcoded.
- Builder campagne: il block manager del rail sinistro ora usa esplicitamente `--builder-panel` sui wrapper GrapesJS, evitando il fondo scuro tra le card in light mode.
- Aggiornato `tasks/lessons.md` con la regola emersa dalla correzione.
- Verifiche OK: `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`.

## Plan (Fix comunicazioni overflow e dark mode - May 1, 2026)
- [x] Rimuovere i residui scuri nativi GrapesJS nei pannelli builder campagne, inclusi blocchi e avanzate in light/dark mode.
- [x] Limitare l'altezza dell'inbox WhatsApp in `Comunicazioni > WhatsApp > Chat e connessione`, con scroll interno per lista chat e thread.
- [x] Correggere il contrasto del titolo/descrizione nei form e sondaggi pubblici quando il tema app e dark ma la pagina pubblica resta chiara.
- [x] Eseguire verifiche frontend mirate (`typecheck`/`build`) e documentare esito.

## Review (Fix comunicazioni overflow e dark mode - May 1, 2026)
- Builder campagne: neutralizzati altri wrapper nativi GrapesJS (`gjs-blocks`, `gjs-block-label`, style sectors/properties/layers) per evitare fondi o bordi scuri residui nei pannelli laterali e in `Avanzate`.
- WhatsApp: il contenitore inbox ora ha altezza vincolata al viewport (`h-[min(44rem,calc(100dvh-11rem))]`) e mantiene scroll interno su lista chat/thread invece di allungare tutta la pagina.
- Form/sondaggi pubblici: titolo e descrizione del canvas usano classi scoped con `data-page-style`, cosi editorial/minimal restano scuri anche quando l'admin e in dark mode; spotlight resta chiaro su fondo scuro.
- Verifiche OK: `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`; dev server avviato su `http://127.0.0.1:5173`.

## Plan (Eliminazione modelli/automazioni e dark mode comunicazioni - May 1, 2026)
- [x] Aggiungere lesson sulla correzione richiesta: azioni distruttive visibili nella lista, dark mode dei pannelli WhatsApp e smoke reale del builder campagne.
- [x] Verificare e rendere esplicita l'eliminazione dei modelli email dalla libreria modelli.
- [x] Aggiungere eliminazione completa per regole automazioni WhatsApp: endpoint backend, client API, conferma UI e test.
- [x] Correggere dark mode del reminder WhatsApp e delle icone nella pagina pubblica `/associazioni`.
- [x] Eseguire test/backend frontend, build e smoke live del builder campagne per controllare il bordo scuro residuo.
- [x] Commit e push del branch corrente includendo solo i file pertinenti.

## Review (Eliminazione modelli/automazioni e dark mode comunicazioni - May 1, 2026)
- Modelli email: la libreria attiva `MessagesComposerHub` espone gia `Elimina` per i modelli non di sistema e usa l'endpoint `DELETE /communications/templates/{id}` esistente; nessun duplicato necessario.
- Automazioni WhatsApp: aggiunto `DELETE /api/org-admin/communications/whatsapp/automations/{id}`, client `deleteOrgAdminWhatsAppAutomation`, pulsante `Elimina` sulle card regola e modal di conferma.
- Dark mode: il pannello `Reminder prenotazioni` WhatsApp ora usa token scuri scoped; `/associazioni` in dark mode usa plate chiaro e icona placeholder verde ad alto contrasto.
- Verifiche OK: `python -m pytest -q tests/test_org_admin_communications.py::test_org_admin_whatsapp_automations_create_list_and_update`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`.
- Smoke builder campagne live su `https://assonam.it/org-admin/comunicazioni?tab=campagne&mode=create`: autenticazione con magic-link temporaneo live, screenshot in `tasks/screenshots/live-builder-smoke-20260501/`, nessuna response 4xx/5xx, nessun errore console, rail sinistro con superfici bianche e nessun fondo opaco scuro.
- Smoke `/associazioni` dark locale mockato: screenshot in `tasks/screenshots/associazioni-dark-smoke-20260501/`, plate `rgb(248, 250, 252)` e icona `rgb(15, 118, 110)`.

## Plan (Microcopy, conferme distruttive e responsive tabelle/filtri - May 3, 2026)
- [x] Inventariare testi visibili e status ancora dispersi in Org Admin, Super Admin e flussi pubblici; creare una mappa prioritaria di label, stati, errori, successi ed empty state da centralizzare.
- [x] Introdurre/rafforzare primitive leggere per microcopy: `statusLabels`, action labels contestuali, helper per error/success copy e linee guida per usare "modulo" vs "form" senza cambiare nomi tecnici/API.
- [ ] Correggere microcopy sulle superfici ad alto traffico residue: Affiliazioni, Iscrizione, Super Admin Affiliazioni/Documenti e accounting.
- [x] Inventariare tutte le azioni distruttive residue: eliminazione sale, tavoli, assegnazioni, form/campi, lotti, admin, documenti, cartelle/categorie, campagne/modelli/asset e associazioni.
- [x] Standardizzare le conferme distruttive con `ConfirmModal`/`ModalShell`: titolo specifico, descrizione impatto, oggetto coinvolto, CTA contestuale, loading state, errore inline e toast successivo.
- [x] Ridurre conferme testuali tipo "digita ELIMINA" ai soli purge irreversibili; per azioni normali usare checkbox "Confermo..." o conferma modale semplice.
- [x] Definire pattern responsive condiviso per tabelle: desktop tabella completa, tablet colonne essenziali, mobile card verticali con label/valore e azioni in menu/bottom sheet.
- [x] Definire pattern filtri responsive: toolbar desktop, barra compatta tablet, bottone "Filtri" mobile con drawer/bottom sheet, badge filtri attivi e comando "Reset".
- [x] Applicare la prima tranche sulle superfici operative con maggiore impatto immediato: `MembersTable`, `OrgAdminInvites`, `OrgAdminBookings`, `OrgAdminForms` e `SuperAdminOrganizations`.
- [ ] Applicare la seconda tranche a `SuperAdminAffiliations`, `SuperAdminDocuments`, accounting e liste Comunicazioni rimaste solo table/overflow.
- [x] Verificare ogni tranche con `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`, smoke browser a 375/768/1024/1440px, controllo light/dark e test backend solo dove cambiano contratti dati.

## Review (Microcopy, conferme distruttive e responsive tabelle/filtri - May 3, 2026)
- `frontend/src/lib/statusLabels.ts` ora contiene copy condivisa per empty state, azioni distruttive e status soci/workflow/affiliazione organizzazione, cosi le superfici toccate non duplicano piu label e fallback.
- `ConfirmModal` supporta oggetto coinvolto, testo di impatto, errore inline e checkbox opzionale per azioni piu rischiose.
- Prenotazioni: eliminazione sale e tavoli passa da azione immediata a conferma modale con oggetto, impatto e loading state.
- Form/Sondaggi: eliminazione modulo e campo passa da doppio click/arm state a `ConfirmModal`; il copy usa "modulo" nella UI primaria.
- Responsive prima tranche: `MembersTable`, `OrgAdminInvites` e `SuperAdminOrganizations` mantengono tabella desktop ma su mobile mostrano card verticali con label/valore e azioni esplicite.
- Filtri: `OrgAdminInvites` ora espone reset filtri contestuale; `MembersTable` e `SuperAdminOrganizations` mantengono i filtri esistenti con risultato mobile leggibile.
- Verifiche eseguite: `npm --prefix frontend run typecheck` OK; `npm --prefix frontend run build` OK con solo warning Vite chunk grandi gia noto.

## Plan (Accenti italiani microcopy visibile - May 3, 2026)
- [x] Aggiungere lesson sulla correzione: microcopy globale include anche accenti italiani, non solo status/label centralizzati.
- [x] Scansionare frontend, messaggi API, email e WhatsApp template per forme non accentate frequenti senza toccare path/slug/enum/chiavi tecniche.
- [x] Correggere le occorrenze user-facing ad alta confidenza: `?`, `gi?`, `pu?`, `pi?`, `perch?`, `cos?`, `verr?`, `sar?`, `modalit?`, `validit?`, `attivit?`, `contabilit?`, `localit?`, `disponibilit?`, `identit?`, `citt?`.
- [x] Eseguire typecheck/build frontend e almeno py_compile sui moduli backend toccati.
- [x] Documentare review con pattern rimasti esclusi se tecnici o non sicuri.

## Review (Accenti italiani microcopy visibile - May 3, 2026)
- Corretta la microcopy visibile in frontend, messaggi API, template email/WhatsApp e testi pubblici ad alta confidenza.
- Riparate anche le conversioni non valide emerse durante la passata meccanica (`?` e mojibake UTF-8).
- Lasciati invariati slug, route e identificatori tecnici, ad esempio `/org-admin/contabilita`, `modalitaPagamento`, enum e chiavi API.
- Scansione finale sulle forme frequenti e sui caratteri corrotti: `TOTAL=0`.
- Verifiche OK: `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`, `python -m compileall -q app`.

## Plan (Guida automatica nuovi org admin - May 3, 2026)
- [x] Individuare il flusso reale di creazione org admin da Super Admin e il trasporto email/outbox esistente.
- [x] Estendere l'outbox email per allegati PDF generici senza rompere le immagini inline già usate.
- [x] Creare una guida ASSO.N.A.M. breve e chiara in PDF, con immagini/illustrazioni esplicative, numero bot WhatsApp, avvisi tessere in esaurimento, area riservata e modulo Comunicazioni da 150 euro.
- [x] Rendere la mail di invito org admin una mail HTML completa, con guida nel corpo e PDF allegato.
- [x] Coprire il flusso con test su invito Super Admin e approvazione affiliazione dove nasce un org admin.
- [x] Eseguire test mirati, compile Python e documentare l'esito.

## Review (Guida automatica nuovi org admin - May 3, 2026)
- Aggiunto payload email di benvenuto org admin con corpo HTML chiaro, riepilogo operativo e allegato `guida-assonam-area-admin.pdf`.
- La guida PDF viene generata server-side con ReportLab e include illustrazioni/cards su area riservata, richiesta nuove tessere via bot WhatsApp, avvisi scorte via WhatsApp/email e modulo Comunicazioni opzionale da 150 euro.
- Il numero bot usa `ASSONAM_WHATSAPP_BOT_NUMBER`, poi `TWILIO_WHATSAPP_FROM`, poi fallback `+390299914307`.
- Il flusso è collegato sia alla creazione admin da Super Admin sia all'admin creato dopo approvazione affiliazione.
- Esteso l'outbox e i transport SMTP/Mailtrap per allegati generici senza cambiare il comportamento delle immagini inline esistenti.
- Verifiche OK: `python -m pytest -q tests/test_email_flows.py::test_super_admin_create_flow_email tests/test_email_flows.py::test_org_admin_magic_link_flow tests/test_affiliation_flow.py::test_affiliation_approve_requires_docs_and_payment_verification`, `python -m compileall -q app`, `git diff --check`.

## Plan (KPI consumo email comunicazioni e report mensile - May 4, 2026)
- [x] Individuare la panoramica Comunicazioni org admin e i KPI attuali da sostituire.
- [x] Verificare dove vengono tracciati invii email/campagne e come viene letto il flag `communications_enabled`.
- [x] Aggiungere un endpoint/serializzazione usage mensile con limite 5.000 email e conteggio extra oltre soglia.
- [x] Sostituire i KPI "Email configurata" e "Bozze aperte" con "Email usate" e "Email extra", includendo nota costo 1 cent oltre limite.
- [x] Implementare job mensile idempotente per inviare al super admin personale il riepilogo per tutte le org con Comunicazioni attivo, anche con extra pari a zero.
- [x] Aggiungere o aggiornare test mirati backend/frontend e verificare compilazione/build.

## Review (KPI consumo email comunicazioni e report mensile - May 4, 2026)
- Panoramica Comunicazioni: sostituiti i KPI "Bozze aperte" ed "Email configurata" con "Email usate" (`usate / 5.000`) ed "Email extra" (totale EUR dovuto), con nota piccola `0,01 EUR` per email oltre limite.
- Backend: aggiunto `GET /api/org-admin/communications/usage`, conteggiando gli invii campagna riusciti nel mese corrente da `EmailCampaignRecipient.sent_at` solo per org con modulo Comunicazioni attivo.
- Report mensile: il worker email accoda una mail al `SUPER_ADMIN_EMAIL` per il mese appena chiuso, con dedupe key per inviarla una sola volta; include tutte le org attive con Comunicazioni attivo, anche quando extra e importo sono zero.
- Verifiche OK: test mirati usage/report/worker, `python -m compileall -q app`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`, `git diff --check`.

## Plan (Banner maggiorenni dark mode - May 5, 2026)
- [x] Individuare markup e classi del banner maggiorenni nel flusso pubblico di iscrizione.
- [x] Correggere solo la variante dark mode mantenendo invariata la resa light mode approvata.
- [x] Eseguire verifica frontend mirata con typecheck/build e controllo diff.
- [x] Documentare risultato e verifiche.

## Review (Banner maggiorenni dark mode - May 5, 2026)
- Il banner maggiorenni in `Iscrizione.tsx` ora ha classi scoped dedicate per contenitore, icona, titolo e testo.
- In dark mode `index.css` sovrascrive solo quel banner con superficie scura, bordo/accento rose e testo ad alto contrasto; la light mode resta sulle classi Tailwind gia approvate.
- Verifiche OK: `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`, `git diff --check` sui file toccati. La build mantiene solo il warning Vite sui chunk grandi gia noto.

## Plan (Checkout quota Frutta e Verdura - May 6, 2026)
- [x] Incrociare orari segnalati, screenshot, tentativi test e log live per distinguere errore client-side da errore backend/SumUp.
- [x] Rendere il messaggio frontend del network failure piu chiaro e recuperabile senza perdere il riepilogo gia compilato.
- [x] Aggiungere osservabilita backend al checkout quota associativa con request id, IP, user-agent e stato creazione/riuso checkout.
- [x] Eseguire test mirati backend/frontend, build e controllo diff prima del push.

## Review (Checkout quota Frutta e Verdura - May 6, 2026)
- Diagnosi live: alle 19:32 italiane la navigazione e le API GET sono arrivate al server, ma non risulta alcuna POST di creazione checkout; i test successivi alle 19:42/19:46 hanno creato checkout correttamente.
- Frontend: il fallimento di rete durante `create-checkout` non espone piu il raw `Failed to fetch`, ma un messaggio in italiano che invita a riprovare dal riepilogo.
- Backend: il checkout SumUp ora logga start, riuso checkout pending, creazione riuscita ed errori SumUp con contesto di request.
- Verifiche OK: `python -m pytest -q tests/test_membership_payments_sumup.py tests/test_payment_method_join.py`, `python -m compileall -q app`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`.

## Plan (Cleanup spazio server Hetzner ASSO.N.A.M. - May 6, 2026)
- [x] Verificare accesso SSH root a `157.90.31.105` e misurare spazio con `df -h`, inode e usage Docker.
- [x] Individuare i maggiori consumatori senza cancellare dati applicativi: Docker images/build cache, log, journal, apt cache, temp.
- [x] Liberare spazio con cleanup conservativo, evitando volumi DB e directory dati runtime.
- [x] Verificare spazio libero, stato Docker/Postgres/app e readiness HTTP essenziale.
- [x] Documentare risultato e comandi principali.

## Review (Cleanup spazio server Hetzner ASSO.N.A.M. - May 6, 2026)
- Diagnosi iniziale: `/dev/sda1` era al 100% con 22 MB liberi; inode OK al 47%. Il peso era in `/var/lib/containerd` e in immagini Docker dangling/intermediate; `docker system df -v` mostrava molte immagini `<none>:<none>` non usate.
- Cleanup eseguito: `docker image prune -f`, `apt-get clean`, `journalctl --vacuum-size=100M`. Non sono stati toccati volumi Docker, incluso `app_pgdata`.
- Risultato spazio: root filesystem passato da `36G used / 22M avail / 100%` a `9.3G used / 27G avail / 26%`; inode passati a 8% usati.
- Verifiche runtime: container `app-web-1`, worker, Evolution API, video worker e `app-db-1` risultano up; `docker exec app-db-1 pg_isready -U postgres` OK; `https://assonam.it/` risponde `HTTP/2 200`; `https://www.assonam.it/` redirige a `https://assonam.it/`.

## Plan (Incidente sito down Hetzner - May 19, 2026)
- [x] Connettersi via SSH root a `157.90.31.105` e rilevare stato host: disco, memoria, Docker, processi e porte HTTP/HTTPS.
- [x] Identificare il servizio rotto leggendo `docker compose ps`, log recenti dei container e stato proxy/app/database.
- [x] Applicare la correzione minima e reversibile necessaria a ripristinare il sito, evitando dati applicativi e volumi DB.
- [x] Verificare da host e da esterno che il sito risponda correttamente su HTTP/HTTPS.
- [x] Documentare causa, intervento, verifiche e rischi residui.

## Review (Incidente sito down Hetzner - May 19, 2026)
- Causa live: il container web era up ma non rispondeva; Nginx produceva 504 verso `127.0.0.1:8000`. PostgreSQL mostrava transazioni `idle in transaction` aperte dal web e i log indicavano deadlock/raffica webhook WhatsApp Evolution dopo eventi contatto/chat.
- Ripristino immediato: riavviato `app-web-1`, poi isolato temporaneamente `app-evolution-api-1` quando la raffica continuava a saturare il backend. Nessun volume DB o dato applicativo e stato toccato.
- Fix applicativo deployato sul server: webhook Evolution reso route sincrona FastAPI, gestione rollback/200 per conflitti DB transitori, creazione chat con `ON CONFLICT DO NOTHING`, fast-ack per eventi rumorosi `contacts.set`, `contacts.update` e `chats.*`.
- Evolution API e stata riattivata ed e healthy; dopo il picco iniziale gli smoke interni ed esterni restano 200, senza nuovi 504 Nginx recenti.
- Verifiche OK: `python -m pytest -q tests/test_org_admin_whatsapp.py`, `python -m compileall -q app`, build/recreate Docker `web` su Hetzner, `https://assonam.it/`, `/api/capabilities`, `/api/organizations`, `/sw.js`.

## Plan (Patch worker webhook WhatsApp - May 19, 2026)
- [x] Modellare una coda persistente `whatsapp_webhook_events` con migration, dedupe key, status, attempts e retry.
- [x] Cambiare `/api/internal/whatsapp/evolution` per fare solo enqueue idempotente e risposta veloce, senza processamento DB pesante nel web.
- [x] Aggiungere service e worker `whatsapp-webhook-worker` con batch limit, retry/backoff e gestione dei conflitti transitori.
- [x] Aggiornare compose/deploy e bootstrap locale per avviare il worker separato.
- [x] Coprire enqueue/worker con test mirati e rieseguire test WhatsApp esistenti.
- [x] Deployare su Hetzner, eseguire migration, riattivare/monitorare Evolution API e smoke HTTP esterni.

## Review (Patch worker webhook WhatsApp - May 19, 2026)
- Aggiunta la tabella `whatsapp_webhook_events` con migration `t5u6v7w8x9y0`, dedupe key unica, status, attempts, next retry e indici dispatch.
- Il webhook Evolution ora valida/autentica e accoda soltanto, poi risponde 200; il processamento DB pesante e stato spostato nel nuovo worker `python -m app.workers.whatsapp_webhook_worker`.
- Il worker processa gli eventi utili, salta gli eventi ad alto volume `contacts.set`, `contacts.update` e `chats.*`, e mette in retry con backoff i conflitti DB o errori transitori.
- Deploy live completato: build runtime, `alembic upgrade head`, recreate `web`, avvio `app-whatsapp-webhook-worker-1`, riattivazione `app-evolution-api-1`.
- Verifiche live: Evolution e worker healthy; coda con eventi `processed`, zero retry; nessun 504 Nginx recente; `https://assonam.it/`, `/api/capabilities`, `/api/organizations`, `/sw.js` rispondono 200.
- Verifiche locali OK: `python -m pytest -q tests/test_org_admin_whatsapp.py`, `python -m compileall -q app`, `python -m alembic heads`.

## Plan (Secondo incidente sito down Hetzner - May 19, 2026)
- [x] Verificare stato host, Nginx, Docker, DB e risposta HTTP esterna/interna.
- [x] Misurare coda `whatsapp_webhook_events`, log web/worker/Evolution e transazioni DB per capire se la nuova patch ha spostato o creato saturazione.
- [x] Ripristinare subito il sito isolando il componente responsabile e riavviando solo i servizi necessari.
- [x] Applicare patch correttiva minima se la causa e nel worker/coda WhatsApp.
- [x] Verificare smoke live e documentare causa/intervento.

## Review (Secondo incidente sito down Hetzner - May 19, 2026)
- Causa del secondo down: la coda webhook non era arretrata, ma le route GET dell'inbox WhatsApp org-admin chiamavano ancora Evolution in modo sincrono (`chats`, `contacts`, `messages`) mentre tenevano aperta la sessione DB. Con polling ripetuto dall'admin, il web ha saturato il pool SQLAlchemy e Nginx ha iniziato a servire 504.
- Ripristino immediato: fermati temporaneamente `app-evolution-api-1` e `app-whatsapp-webhook-worker-1`, riavviato `app-web-1`; homepage e API pubbliche sono tornate 200.
- Fix deployato: le GET WhatsApp leggono solo lo stato locale nel DB; i contatti/chat/messaggi arrivano dal worker webhook asincrono, non da fetch live verso Evolution. Il test contatti e stato aggiornato sul nuovo contratto locale.
- Riattivazione controllata: ricreato `app-web-1`, riavviati Evolution API e worker WhatsApp; entrambi healthy. La coda processa/salta gli eventi senza backlog e senza retry.
- Verifiche OK: `python -m pytest -q tests/test_org_admin_whatsapp.py`, `python -m compileall -q app`, `git diff --check` sui file toccati, smoke esterno `https://assonam.it/`, `/api/capabilities`, `/api/organizations` 200, DB con `idle_in_tx_over_10s = 0`.

## Plan (Editor mail conferma form e campo orario - May 19, 2026)
- [x] Individuare modello/API dei template email collegati ai form e rendering dei campi nel builder pubblico/admin.
- [x] Aggiungere nello spazio Notifiche email una preview reale e un editor rapido per la mail di conferma utente.
- [x] Aggiungere al form builder il campo `Orario`, con input ora/minuti nel builder e nella compilazione pubblica.
- [x] Aggiornare tipi/test e verificare typecheck/build frontend piu test backend mirati se cambiano contratti.
- [x] Documentare risultato e rischi residui.

## Review (Editor mail conferma form e campo orario - May 19, 2026)
- In `Notifiche email` il template conferma utente ora ha editor rapido per nome modello, oggetto e testo, placeholder rapidi e anteprima renderizzata tramite endpoint preview; i template di sistema vengono salvati come copia modificabile dell'associazione.
- Il nuovo campo `Orario` entra nei tipi form come `time`, e validato backend come `HH:MM`; il canvas pubblico usa input HTML `type="time"` e la preview builder mostra un valore realistico.
- Aggiornata la palette builder per Form e Sondaggi, il tipo frontend API e la selezione campo per automazioni WhatsApp/prenotazioni dove serve un orario.
- Verifiche OK: `python -m pytest -q tests/test_forms_module.py` (`17 passed`), `python -m compileall -q app`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`, `git diff --check`.
- Nota: la build mantiene il warning Vite preesistente sui chunk grandi.

## Plan (Push feature form e cleanup disco - May 19, 2026)
- [x] Controllare branch, stato worktree e spazio disco locale/server prima del push.
- [x] Eseguire prune conservativo su Hetzner senza toccare volumi Docker o dati applicativi.
- [x] Stagiare solo file pertinenti alle patch WhatsApp e form/email/orario, lasciando fuori modifiche non correlate.
- [ ] Creare commit descrittivo e pushare `feat/redesign-landing-wizard`.
- [ ] Verificare stato post-push e documentare risultato.
