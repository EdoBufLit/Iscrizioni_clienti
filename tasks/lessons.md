# Lessons

- When a user reports runtime errors, add defensive guards around optional/unknown values and make the logger safe-by-default.
- If a logo needs true background removal, create a transparent asset instead of relying on blend modes.
- When onboarding spans multiple internal routes, persist in-progress state (run + stepIndex) per role and add bounded retries for TARGET_NOT_FOUND to avoid tour interruption on tab/route changes.
- When the user marks a layout requirement as non-negotiable, keep that element in a dedicated section and remove duplicate representations from KPI cards.
- When multiple entry points trigger the same auth gate ("Area riservata"), route all of them through one deterministic redirect flow to prevent first-click race/redirect issues.
- When INP remains high after rerender optimizations, prioritize paint/compositing hotspots (`presentationDelay`): reduce `backdrop-filter`, animated glass layers, and heavy global scene effects on data-entry dashboards.
- Per card con flip 3D, logo/overlay non devono stare nel layer preserve-3d: vanno estratti nel wrapper per evitare rotazioni indesiderate e testi specchiati.
- Se un flip 3D mostra ancora il fronte specchiato, ridurre il DOM a uno stage unico con facce dirette e rinforzare le proprieta 3D/backface anche inline per evitare override/bug browser.
- Quando il requisito e "Three.js reale", validare sempre in DOM la presenza di `<canvas>` (non solo componenti React) e non disattivare WebGL su heuristic low-power: degradare qualita, non la feature.
- Quando il requisito parla di "logo particellare riconoscibile", partire da un asset logo esplicito (SVG) e verificare subito con screenshot che la forma sia percepibile, non solo che l'animazione funzioni.
- Se il requisito richiede particle logo â€œpuroâ€, non mantenere mai un underlay immagine quando WebGL e attivo: il fallback statico va mostrato solo quando WebGL e disabilitato/non disponibile.
- Dopo una correzione su hero WebGL, validare sempre due viewport reali (desktop + mobile) e separare visivamente la zona canvas dalla zona copy/CTA per evitare sovrapposizioni percepite come bug.
- Se il feedback dice che l'hero object deve vivere nel background, evitare stage separati in flow verticale: oggetto WebGL e fallback statico devono stare nel layer scene dietro copy/CTA, con verifica screenshot desktop/mobile prima di chiudere.
- Quando il brand richiede coppie CTA coerenti su tutto il pubblico, non limitare il fix alla hero: applicare la palette (blu/giallo) a `btn-primary` e `btn-ghost` a livello `public-shell` per evitare mismatch tra pagine.
- Se l'utente chiede di eliminare una foto, non basta spostarla in un'altra sezione: va rimossa da tutti i mapping attivi e, se richiesto, cancellata anche dagli asset locali.
- La hero che funziona su desktop puo rompersi su mobile: validare sempre contrasto reale di H1/subtitle e usare fallback tipografici solidi + pannello copy leggero quando il background e fotografico.
- Quando il requisito mobile e "CTA-only", non inseguire tweak tipografici: nascondere completamente il blocco testo con `hidden md:block` e mantenere la gerarchia visuale tramite watermark leggero dietro i bottoni.
- React class ErrorBoundary con `<Link>` non funziona: il state `hasError` persiste durante la navigazione SPA. Usare `window.location.href` per garantire un reset completo.
- Backend che richiede config (es. statute_pdf_path) per TUTTE le entitÃ  blocca quelle senza config. Rendere i check condizionali: se l'org non ha statuto caricato, non richiederlo.
- Le API frontend che fanno `throw new Error("Join failed")` nascondono il vero errore backend. Sempre leggere `res.json().detail` prima di throw.
- In un flusso multi-step (join + register), se step 1 Ã¨ critico e step 2 Ã¨ opzionale, gestirli separatamente: marcare successo dopo step 1 e rendere step 2 non-bloccante.
- Download file con `<a href>` naviga il browser su errori (JSON error page). Usare `fetch()` + blob per gestire errori client-side e mostrare messaggi utili.
- MAI mettere `useMemo`/`useCallback`/altri hooks dopo `if (loading) return`. Viola le Rules of Hooks: React conta hooks per posizione e se un render ne chiama 0 e il successivo ne chiama 3, crasha con "Rendered more hooks than expected". Spostare TUTTI i hooks prima di qualsiasi return condizionale.
- Se il requisito dice che una capability e centralizzata (es. integrazioni), non esporre endpoint di gestione a ruoli tenant (org-admin): applicare ownership e autorizzazioni al livello richiesto fin dalla prima implementazione.
- Quando una capability passa a super-admin only, rimuovere subito anche la UI tenant (org-admin) e tutte le API calls client correlate, non solo il backend.
- Quando una credenziale e one-time (raw API key), la UI deve isolarla in un modal dedicato, consentire copia immediata e cancellarla dallo stato alla chiusura per evitare leak.
- Quando una route di provisioning puï¿½ colpire DB legacy, non fare commit() cieco: intercettare IntegrityError e gestire fallback/409 per evitare 500 lato UI.
- Se il requisito dice ingest pubblico senza auth, rimuovere anche variabili/env/header legacy (es. INGEST_SECRET) da config, CORS e documentazione, non solo dal controller.
- Quando il repository usa Vite + React Router, implementare nuove pagine pubbliche nel routing Vite esistente e non in struttura Next.js App Router.
- Nelle UI soci/tessere non usare mai card_no come proxy di attivazione: usare sempre is_active e status lifecycle calcolati dal backend per evitare falsi attivi su scaduti/eliminati.
- Nei template email usare logo PNG/JPG con URL assoluto stabile (preferibilmente frontend base), evitando SVG che molti client mail non renderizzano.
- I KPI tessere 'assegnate' devono usare soci attivi (is_member_active) e non il solo avanzamento next_no dei lotti, altrimenti i cancellati restano conteggiati.

- L'endpoint ingest pubblico non deve mai propagare 500 per collisioni legacy su card_no: l'allocazione deve saltare il numero occupato e continuare nel lotto.
- Per allocazioni da lotti, non affidarsi solo a next_no: cercare sempre il primo numero libero nel range per riempire i buchi lasciati dai soci eliminati.

- Se il requisito richiede riuso dopo soft delete (email, external_customer_id, card_no), quei campi vanno liberati esplicitamente nel delete e nella maintenance annuale.

- Se esistono vincoli unici su identificativi (es. external_customer_id), i record soft-deleted legacy vanno bonificati prima del provisioning per evitare 500 e trasformare i conflitti in 409 gestiti.

- Nelle pagine pubbliche ingest, i 409 non vanno mascherati come servizio inattivo: mostrare sempre il dettaglio backend (es. socio gia presente).

- Nei template email, il testo principale (nome socio) va forzato con colore scuro inline (!important) per evitare perdita di contrasto nei client che alterano i colori.

- Per compatibilita mobile email (es. Gmail app), logo e QR nelle mail tessera vanno inviati come immagini inline CID con fallback URL remoto.
- Per compatibilita reale mobile email, non usare solo immagini inline CID: mantenere URL assoluti HTTP(s) per logo e QR nella tessera.

- Quando il cliente chiede un logo specifico per uno slug, aggiungere un asset statico dedicato + fallback centralizzato nel resolver branding, mantenendo il logo istituzionale separato e senza sovrapporre testo critico.

- Se il cliente richiede un naming preciso in tessera per uno slug, applicare override centralizzato di club_display_name e riusarlo in tutti i render (preview FE, email, download) per evitare mismatch.

- Quando una personalizzazione brand nasce per un solo cliente/slug, il rendering speciale (watermark, naming) va sempre gated sullo slug per non impattare le altre organizzazioni.

- In deploy con SKIP_CREATE_ALL=1, ogni nuova colonna usata dai model va coperta da migration o fallback bootstrap: altrimenti l'app crasha in startup e va in restart loop (502).
- Quando un dominio usa soft-delete con vincoli legacy, servono due livelli di protezione: bonifica retroattiva globale all'avvio + cleanup runtime mirato prima dei controlli duplicati su join/register, altrimenti restano "tracce" che riemergono come 500/duplicati.
- Se il cliente richiede "nessuna traccia" dei soft-delete, la sola anonimizzazione non basta: serve hard purge delle righe `members.deleted_at` con cleanup FK (tokens/docs/payments/card_movements/operation_logs) e trigger all'avvio.
- Quando si rimuove una variabile da un componente React/TS (es. eliminando una branch condizionale), verificare sempre che non resti una dichiarazione `const x = ...` senza uso: TypeScript noUnusedLocals bloccherÃ  il build in CI/Docker.
- Quando il workspace e gia sporco e l'utente conferma di ignorare il rumore, continuare senza fermarsi, limitando le modifiche ai file strettamente rilevanti al task corrente.
- Se il cliente evidenzia un'area logo su screenshot reali, verificare sempre resa finale su card/download/thank-you (desktop+mobile) e adattare dimensioni/plate prima di considerare il task chiuso.
- Nel fallback SPA, non restituire mai `index.html` per path asset con estensione (`.js`, `.css`, ecc.): per file mancanti va restituito 404 reale, altrimenti si genera MIME mismatch e pagina bianca.
- Per micro-allineamenti logo su card multi-renderer (React/HTML/PDF/PNG), usare sempre centro geometrico + offset condiviso: evita drift visivo tra canali.
- Nei micro-tuning visuali richiesti su screenshot (2-3px), applicare passi piccoli e simmetrici su tutti i renderer per evitare over-correction.
- In fase finale di pixel-tuning, preferire step da 1px e fermarsi appena il feedback passa da "troppo a destra" a "quasi giusto".
- Quando il cliente specifica una direzione esplicita ("verso destra/sinistra"), applicare il delta solo in quella direzione e confermarlo nel commit message.
- Se il cliente continua con micro-adjust successivi, mantenere una scala monotona (es. -9, -7, -5, -4) e non saltare con offset grandi.
- Se i numeri tessera devono essere riutilizzabili dopo delete, non basta pulire member.card_no: va anche riavvolto card_batches.next_no (con lock) al numero rilasciato, altrimenti l’allocazione continua dal progressivo successivo.
- Se il cliente fornisce un `issuer_id`/`classId` ufficiale per integrazioni esterne (es. Google Wallet), allineare subito il naming canonico nel backend (o renderlo configurabile) invece di presumere un suffisso generico locale.
- Se un secret esiste in GitHub ma il runtime lo vede mancante, verificare sempre due passaggi distinti: export nel workflow CI/CD e pass-through nel `docker-compose` verso il container (averlo nel repo secrets UI non basta).
- Per CTA email che devono portare l'utente subito a una funzione autenticata (es. Google Wallet add), usare magic-link + deep-link `next` verso la pagina target invece di forzare prima l'area riservata/login manuale.
- L'etichetta Google Wallet "[SOLO TEST]" non è generata dal codice app: resta finché issuer/class non sono approvati in produzione da Google Wallet.
- Se l'utente corregge esplicitamente il focus (es. 'no intendo questo' con un nuovo prompt), fermarsi sul thread precedente e riallinearsi subito al nuovo scope prima di rispondere o fare push.
- Per evidenze UI con header/footer `sticky` o `fixed`, non usare screenshot `full_page` come prova finale: Playwright puo duplicare i layer durante lo stitching e far sembrare elementi in mezzo alla pagina. Usare screenshot viewport normale o disattivare temporaneamente lo sticky durante la cattura.
- Se una nuova capability operativa dipende da un dato configurabile lato super-admin (es. numero WhatsApp alert associazione), non fermarsi a model/API: nella stessa PR va esposta anche nella UI di gestione esistente, altrimenti la feature resta non operativa.
- Per Twilio Studio Flow via SDK Python, `executions.create()` richiede sempre `to` e `from_` top-level: i `parameters` servono solo come variabili del Flow e non sostituiscono gli argomenti obbligatori della create.
- Nei custom `RequestValidationError` handler FastAPI, non serializzare mai direttamente `exc.errors()` senza `jsonable_encoder`: il payload puo includere `bytes` (es. body form-urlencoded) e trasformare un 422 atteso in un 500.
- I webhook Twilio arrivano spesso come `application/x-www-form-urlencoded`: non modellare la route come body JSON obbligatorio, ma fare parsing esplicito di `request.form()` con campi opzionali ed `extra="allow"` per evitare 422/500 e retry aggressivi.
- Per i low-cards alert Twilio Studio, usare `organizations.whatsapp_e164` come sorgente canonica del destinatario e passare lo stesso valore sia come `to` top-level sia come `parameters.to`, altrimenti il Flow puo creare execution invalide o fallire con `missing to/from_`.
- Se una feature opzionale dipende da moduli/modelli non garantiti, non importarla mai top-level in `app.main`: usare import lazy condizionato da feature flag e fallback che mantiene il servizio up.
- Se una route opzionale usa modelli non garantiti, isolare i modelli in un modulo fallback dedicato e importarlo dalla route/service per evitare ImportError in produzione.
- [2026-03-05] Quando introduco CTA premium in navbar pubblica, verificare sempre breakpoint intermedi (1024/1280) con pay-off brand + badge: evitare badge separati che rubano spazio e usare fallback hamburger fino a layout realmente stabile.
- [2026-03-05] Se aggiorno checklist wizard (intro), allineare SEMPRE anche i `REQUIRED_DOCUMENT_TYPES` backend e i test helper di upload documenti per evitare submit incoerenti.
- [2026-03-05] Evitare side effects di persistenza all'ingresso pagina (es. creazione draft automatica): in funnel multi-step la creazione risorsa deve avvenire su azione esplicita utente per non sporcare dati e dashboard admin.
- [2026-03-05] In pannelli admin, mostrare azioni solo se semanticamente valide nello stato corrente (`can_approve`/stato) per prevenire UX fuorviante.
- [2026-03-05] Quando rimuovo un comportamento automatico richiesto dal cliente (autosave), verificare che non restino effetti collaterali da `useEffect` legacy prima del rilascio.
- Quando un worker usa Remotion/Chromium in Docker slim, includere sempre runtime libs browser (libnspr4, libnss3, libgtk-3-0, libgbm1, libasound2 e dipendenze X11) gia nel Dockerfile base, altrimenti il render fallisce a runtime con errori shared library.
- Nei deploy Docker Compose su host condivisi, fissare sempre COMPOSE_PROJECT_NAME e fare cleanup pre-up dei container stale per evitare conflitti di naming (... already in use) durante recreate.
- Se Remotion deve caricare audio statico, il file va sempre versionato in public/ e il componente deve poter renderizzare anche senza traccia audio (guardia audioEnabled) per evitare crash 404 in render headless.
- Quando il cliente chiede di ingrandire un elemento hero/card, verificare che cresca il componente reale e non solo il wrapper di sezione: prima controllare `w-full`, `max-width`, `flex/grid basis` e la resa bilanciata tra le colonne.
- Se la card e gia approvata come dimensione, i fix successivi devono agire solo sulla colonna testo: aumentare spazio utile con `minmax()`/`max-width` e stabilizzare le CTA senza alterare la card.
- Se a desktop una card laterale viene tagliata pur con composizione interna corretta, controllare prima la larghezza del wrapper esterno rispetto al `container-shell`: spesso serve piu spazio al contenitore, non altri ritocchi interni.
- Se il primo aumento del wrapper non basta a evitare clipping su screenshot reale, misurare il fabbisogno totale rispetto a sidebar+content width: spesso servono margini desktop piu decisi, non micro-adjust da 1rem.
- Se il cliente quantifica il fix layout (es. "20% più largo"), implementare quel rapporto in modo esplicito nel CSS/classi e non continuare con tentativi incrementali in `rem`.
- Se un child continua a sembrare "uguale a prima", verificare il parent che ne limita la larghezza visibile: allargare un box figlio dentro un shell troppo stretto non produce effetto percepibile.
- Quando la larghezza disponibile dipende da `sidebar + gap + content`, stimare il budget complessivo prima di scegliere il nuovo `max-width`: aumenti troppo prudenti del shell portano a iterazioni inutili.
- Se aggiungo colonne/tabelle usate subito dai model in ambienti dev/test che bootstrappano con `create_all()`, devo anche estendere il path di repair in `init_db.py`: un DB SQLite gia esistente non viene alterato da `create_all()` e rompe i test/local boot.
- Nelle migration Postgres che introducono boolean legacy, non posso fare `UPDATE ... SET col = FALSE` assumendo che il tipo sia gia boolean: prima devo normalizzare/castare eventuali colonne `INTEGER`, altrimenti l'upgrade fallisce con `expression is of type boolean`.
- Se un modulo e un entitlement commerciale opzionale, il flag di attivazione deve essere gestito solo dal super-admin: i tenant admin possono solo configurare e usare il modulo dopo l'abilitazione, mai attivarlo da soli.
## 2026-03-07 - Email flow verification must prove delivery, not just queueing

- Quando aggiungo un flusso email basato su outbox/worker, non basta verificare che esista una riga in `email_outbox`.
- Devo aggiungere almeno un test end-to-end che dreni il worker in `EMAIL_MODE=test` e controlli il destinatario finale catturato.
- Se il requisito utente riguarda "a quale email arriva", devo loggare e testare esplicitamente i recipient reali (`admin_ids`, `recipient_emails`) invece di inferirli solo dalla query backend.

## 2026-03-07 - Low-stock alerts must detect threshold crossing, not raw low values

- Un alert "tessere sotto 50" non va basato solo su `remaining < 50`.
- Se il requisito parla di "scendere sotto soglia", devo introdurre un gating che provi che l'organizzazione sia stata almeno una volta a `>= soglia` nello stesso dominio temporale del job.
- In pratica: gli org sempre a `0` o comunque sempre sotto soglia non devono ricevere alert iniziali solo perché il valore corrente e basso.
