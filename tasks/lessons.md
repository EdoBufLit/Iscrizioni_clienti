- Se una nuova UI di configurazione mostra automazioni WhatsApp come attive o collegate al form, il backend deve gia eseguirle davvero sul submit pubblico: non va mai rilasciata una UX che sembra operativa ma e solo CRUD. Inoltre il resolver del numero deve usare i veri campi phone del form, non un elenco rigido di field_key legacy.
- Quando introduco un flusso pagamenti con redirect frontend, il redirect o il polling non devono mai fare fulfillment: webhook provider + verify server-side devono restare l'unica fonte autorevole per `completed`, mentre il polling serve solo a mostrare stato e retry.
- Quando il cliente chiede fedelta esatta a mockup admin, non basta un re-skin: prima della consegna servono screenshot viewport-to-viewport delle superfici critiche, inclusi drawer/modali fixed. Inoltre le integrazioni esistenti nel dettaglio (es. SumUp) vanno preservate esplicitamente nella nuova IA e verificate nello screenshot.
# Lessons

- Se l'utente contesta un builder visuale perche tratta il documento iniziale come un blocco unico, verificare il modello componenti reale del canvas: distinguere wrapper `mjml/mj-body` dalle sezioni top-level, testare `Su/Giu`, click blocco e drag in browser prima di dichiarare risolto.

- Quando un messaggio automatico di conferma/rigetto dipende da dati inseriti nel form, il testo non deve mai leggere solo la `booking` persistita: servono fallback dal payload reale, placeholder compositi sicuri (`slot`/`riepilogo`) e un override per-decision opzionale nella UI di review.

- Se in un workspace admin esiste gia una vista operativa primaria (es. inbox WhatsApp con QR/chat), una nuova capability secondaria (es. automazioni) non deve mai sostituirla: va introdotta come sottovista discreta, senza hero promozionali o blocchi marketing.
- Se il cliente chiede una modifica UI in area gia live e il flusso implica rilascio, non chiudere dopo build/test locali: completare sempre push, deploy, migration eventuale e smoke check live prima di considerare il task finito.

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
- Se un cliente segnala che un rehaul e rimasto un reskin, la correzione deve entrare nei componenti pagina e nei flussi operativi: non dichiarare riuscito un redesign se layout, gerarchia, master-detail, wizard e builder restano sostanzialmente uguali.
- Se uno stepper numerato in un wizard sembra interattivo, la UX deve consentire anche il click diretto sugli step oltre ai bottoni `Indietro`/`Avanti`; e nei builder email i CTA non devono essere implicitamente vincolati al form collegato se l'utente si aspetta URL liberi per ogni bottone.
- Se un utente segnala "push fallito" con screenshot di CI/CD o server, verificare subito `git ls-remote` e lo stato del branch live: distinguere sempre tra `git push` riuscito e deploy fallito per infrastruttura (es. disco pieno) prima di rispondere.
- Per evidenze UI con header/footer `sticky` o `fixed`, non usare screenshot `full_page` come prova finale: Playwright puo duplicare i layer durante lo stitching e far sembrare elementi in mezzo alla pagina. Usare screenshot viewport normale o disattivare temporaneamente lo sticky durante la cattura.
- Se una nuova capability operativa dipende da un dato configurabile lato super-admin (es. numero WhatsApp alert associazione), non fermarsi a model/API: nella stessa PR va esposta anche nella UI di gestione esistente, altrimenti la feature resta non operativa.
- Per Twilio Studio Flow via SDK Python, `executions.create()` richiede sempre `to` e `from_` top-level: i `parameters` servono solo come variabili del Flow e non sostituiscono gli argomenti obbligatori della create.
- Nei custom `RequestValidationError` handler FastAPI, non serializzare mai direttamente `exc.errors()` senza `jsonable_encoder`: il payload puo includere `bytes` (es. body form-urlencoded) e trasformare un 422 atteso in un 500.
- I webhook Twilio arrivano spesso come `application/x-www-form-urlencoded`: non modellare la route come body JSON obbligatorio, ma fare parsing esplicito di `request.form()` con campi opzionali ed `extra="allow"` per evitare 422/500 e retry aggressivi.
- Per i low-cards alert Twilio Studio, usare `organizations.whatsapp_e164` come sorgente canonica del destinatario e passare lo stesso valore sia come `to` top-level sia come `parameters.to`, altrimenti il Flow puo creare execution invalide o fallire con `missing to/from_`.
- Se una feature opzionale dipende da moduli/modelli non garantiti, non importarla mai top-level in `app.main`: usare import lazy condizionato da feature flag e fallback che mantiene il servizio up.
- Se una route opzionale usa modelli non garantiti, isolare i modelli in un modulo fallback dedicato e importarlo dalla route/service per evitare ImportError in produzione.
- Quando introduco KPI economici storici su tessere/soci, non devo mai usare fallback runtime al prezzo attuale dell'organizzazione: serve uno snapshot persistito e, per i legacy, un backfill non distruttivo da evidenze storiche prima di esporre il totale.
- Se una tessera temporanea ha durata configurabile ma il cliente la vuole uniforme per associazione, la durata va modellata come regola globale gestita dall'org admin e non come override per-socio o setting super-admin.
- Se aggiungo un nuovo pannello impostazioni in area admin con label uppercase e campi compositi, devo validare subito il breakpoint desktop reale: i controlli secondari come `durata + unita` vanno su una riga dedicata o in una sezione full-width, non compressi nella stessa mezza colonna.
- Se il cliente chiede di semplificare un blocco KPI/copy, rimuovere senza esitazioni tutto il testo accessorio non decisionale: nelle superfici operative il focus deve restare sul numero principale, non sulle spiegazioni.
- Se il cliente fornisce un mockup esplicito e chiede di seguirlo "esattamente", il layout va riallineato alla struttura del reference e non reinterpretato: titoli, gerarchia e quantità di copy devono combaciare, eliminando ogni residuo del design precedente.
- Se il cliente vuole che una sottovista adotti "esattamente" la grammatica di un'altra vista gia approvata, non basta riusarne i colori: anche struttura, ordine dei blocchi e densita delle card devono ricalcare quel workspace, con zero testo accessorio.
- Se un redesign operativo risulta visivamente "troppo grande", il fix corretto e ridurre la scala complessiva del blocco, non cambiare struttura: headline, padding e KPI vanno riportati entro circa il 10-15% sopra la baseline della dashboard.
- Se il reference di un editor operativo mostra una pagina di settings molto specifica, non basta cambiare il tab interno: vanno riallineati anche header, barra azioni e navigazione del dettaglio, altrimenti la schermata continua a sembrare un altro prodotto.
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
- Quando introduco una nuova env applicativa usata in produzione, devo tracciarla fino in fondo: GitHub Secret, step deploy che scrive `.env` e `docker-compose`/runtime container, altrimenti la feature sembra rotta solo dopo il deploy.
- Se una preview email usa il sender corretto ma il provider rifiuta comunque il messaggio, verificare anche l'envelope sender passato a `server.sendmail(...)`: non basta correggere il solo header `From`.
- Se un modulo usa un provider diverso per un sottoinsieme di email (es. association mode), il test-email admin non deve limitarsi ad accodare: deve chiamare davvero quel transport e restituire subito l’errore provider/config reale al frontend.
- Se una capability nasce dentro un pacchetto commerciale piu ampio (es. Form dentro Comunicazioni), non va esposta come modulo isolato: gating, IA, template e automazioni devono essere progettati insieme gia dal primo MVP.
- Se esistono due UI diverse per la stessa capability operativa, la versione live dentro il percorso principale (es. `Comunicazioni > Pagine e moduli`) va unificata subito sul workspace mantenuto: lasciare un hub legacy duplicato porta a bug reali non coperti dai test del modulo corretto.
- Se il cliente chiede una nuova capability verticale (es. prenotazioni), prima estendere il motore configurabile gia esistente con un layer di mapping/config e solo dopo aggiungere viste operative dedicate: evitare sempre sistemi paralleli `*_forms` duplicati.
- Se una feature ha gia tutte le funzioni richieste ma continua a essere percepita come "editor tecnico", trattare link pubblico, stato e workflow summary come elementi di primo livello nel layout: la gerarchia visiva è parte del prodotto, non rifinitura opzionale.
- Se una vista operativa ruota attorno a un oggetto temporale ricorrente (es. prenotazioni giornaliere), il calendario deve essere il canvas principale e il dettaglio va spostato in popup/drawer: filtri e header non devono competere con la lettura del mese.
- Nei workspace admin con tab gia chiari, evitare hero/header introduttivi ridondanti: se non aggiungono decisioni o azioni, vanno rimossi per lasciare spazio al contenuto operativo.
- Se un workflow di creazione parte da un draft nuovo, il frontend non deve inizializzarlo in uno stato che il backend rifiuta subito: seed minimo valido o validazione client obbligatoria prima del `POST`, altrimenti il primo click produce 422 evitabili.
- Se sposto una feature su un nuovo layer dati (es. `rooms` / `room_tables`), devo ripulire tutte le query dai filtri legacy del modello precedente (`deleted_at` o simili): il codice puo compilare ma il primo path runtime specifico esplode con `500`.
- Se due viste operano sullo stesso oggetto ma con filtri propri (es. agenda prenotazioni e mappa sala 2D), dopo create/select/assign devo sincronizzare esplicitamente il contesto condiviso (`room_id`, data, ora, tavolo): aggiornare solo la lista principale lascia UI secondarie apparentemente "ferme" pur con backend corretto.
- Se introduco route opzionali dietro feature flag lette a import-time (es. demo Stripe), nei test devo impostare il flag in `tests/conftest.py` prima di importare `app.main`; mutare solo `settings` dentro il test non registra retroattivamente i router.
- Nei sample payment/demo che convivono con flussi Stripe reali già presenti, nomi route, etichette UI e documentazione devono contenere esplicitamente `demo` per impedire ambiguità future con il prodotto reale.
- Quando aggiungo nuove env applicative per una feature backend opzionale, devo verificare subito l'intera catena deploy: GitHub Secret -> workflow che scrive `.env` -> `docker-compose` runtime. Aggiornare solo codice e docs non basta e il problema emerge solo dopo deploy.
- Nei cleanup Docker pre-deploy non devo assumere pattern legacy dei nomi container (`_app-...`). Se il deploy usa `COMPOSE_PROJECT_NAME=app`, i nomi reali da intercettare sono `app-...-1`; il filtro del workflow va verificato contro il nome effettivo visto nei log errore.
- Se una migration nuova tocca tabelle che il repo può già creare via `create_all()` o bootstrap, il downgrade non deve dropparle alla cieca: va reso conservativo e non distruttivo, lasciando la tabella intatta quando la provenance non è certa.
- Quando sostituisco un editor esistente con un builder UI, devo rimuovere subito stati/handler legacy non più usati e tipizzare esplicitamente helper condivisi (`props`, payload field, callback) prima di chiudere: altrimenti `npm run build` si rompe per dead code, import drift o ritorni `unknown`.
## 2026-03-07 - Email flow verification must prove delivery, not just queueing

- Quando aggiungo un flusso email basato su outbox/worker, non basta verificare che esista una riga in `email_outbox`.
- Devo aggiungere almeno un test end-to-end che dreni il worker in `EMAIL_MODE=test` e controlli il destinatario finale catturato.
- Se il requisito utente riguarda "a quale email arriva", devo loggare e testare esplicitamente i recipient reali (`admin_ids`, `recipient_emails`) invece di inferirli solo dalla query backend.

## 2026-03-07 - Low-stock alerts must detect threshold crossing, not raw low values

- Un alert "tessere sotto 50" non va basato solo su `remaining < 50`.
- Se il requisito parla di "scendere sotto soglia", devo introdurre un gating che provi che l'organizzazione sia stata almeno una volta a `>= soglia` nello stesso dominio temporale del job.
- In pratica: gli org sempre a `0` o comunque sempre sotto soglia non devono ricevere alert iniziali solo perché il valore corrente e basso.

- Se un theme switch viene richiesto come controllo discreto e unico, non duplicarlo tra breakpoint/layout diversi: deve esistere un solo mount per pagina, piccolo, in alto a destra, e il model tema va ridotto ai soli stati realmente richiesti dal cliente.
- Se un fix DnD sembra corretto ma il parent passa ancora props derivate dal server e ignora `onChange`, il blocco puo apparire e poi sparire al rerender: verificare sempre il flusso completo `drop -> state parent -> refetch` prima di dichiarare risolto il drag & drop.
- Se una login admin e una route standalone, non deve ereditare header/footer del layout pubblico: per evitare toggle duplicato, spacing incoerente e mismatch light/dark serve una shell auth dedicata con token tema condivisi.
- Se una dark mode sembra corretta solo sulla shell, verificare sempre il compatibility layer delle utility reali usate dai surface interni (`bg-white/*`, `bg-neutral-*`, `divide-*`, `ring-*`, badge state classes): senza questo passaggio card, tabelle e filtri restano light anche con layout esterno dark.
- Se il drag & drop usa dnd-kit con palette esterna, non basta avere `onDragEnd`: va conservato anche l'ultimo target valido visto in `onDragOver`, perche su canvas vuoto o al mouse-up `over` puo diventare `null` e annullare la creazione del blocco.
- Se un builder salva subito dopo un drop ottimistico, il callback di persistenza non deve leggere il draft del parent dalla render precedente: bisogna passargli i `nextFields` appena costruiti o il payload verra calcolato su stato stantio.
- Se il sito pubblico ha un proprio `index.css` con shell e surface hardcoded light-only, la dark mode non si risolve toccando solo card/layout dashboard: bisogna sovrascrivere anche `public-shell`, `public-header`, `section-title/heading` e i controlli form del layer pubblico.
- Quando la login usa componenti semantici ma vive dentro una shell pubblica separata, verificare sempre entrambi i layer: `auth-*` e `public-shell`. Se uno resta light-only, il risultato finale e una pagina mista con sfondo chiaro e card dark.


- Se un target `useDroppable()` vive nello stesso componente che restituisce `DndContext`, il hook legge il contesto sbagliato e il drop puo fallire in modo intermittente o sembrare bloccato in palette: il droppable va sempre montato in un child reale del provider.
- Se l'utente contesta un fix DnD, non basta la build o la lettura del codice: va riprodotto in browser con sessione reale e verificati almeno inserimento, persistenza dopo reload e reorder successivo prima del commit.


- Se un pannello proprieta salva a ogni keypress e poi rifetch-a l'intero form, i campi controllati possono perdere caratteri o resettarsi mentre l'utente digita: per editor builder serve update locale immediato + save debounce, e gli update singoli non devono fare refetch totale del documento.

- 2026-03-11: Nel form builder non basta debounciare il save delle proprieta. Per i blocchi appena creati serve distinguere il ciclo create->persisted-id dal ciclo update: se l'utente modifica label/placeholder/opzioni prima che arrivi l'id definitivo, bisogna accodare l'update e flusharlo solo dopo aver sostituito il record temporaneo, altrimenti il frontend ritenta una create e rompe il vincolo unico del field_key.
- 2026-03-11: Nelle viste studio/lista non usare l'assenza di dati come trigger implicito dell'editor. Serve uno state esplicito lista vs editor, altrimenti back, delete e ingresso nella sezione diventano incoerenti.
- Se una nuova capability backend vive sia su migration Alembic sia su bootstrap/create_all, devo aggiornare nello stesso task anche init_db.py: nei test e negli ambienti dev locali il repair path puo essere la vera sorgente di schema, non Alembic.
- Se aggiungo campagne schedulate, non basta salvare scheduled_at nel model o serializzarlo in API: devo collegare esplicitamente il processamento al worker reale, altrimenti la UI promette scheduling ma nessuna campagna parte davvero.
- Se una sezione UI esiste gia come placeholder (Modelli salvati), prima di estendere il backend verificare se il buco reale e nel composer/lista frontend: altrimenti il dominio dati e corretto ma la feature resta percepita come sempre vuota.
- Quando collego messaggi e form, il link al form non deve vivere solo come id tecnico nel payload: serve serializzare anche un summary con URL pubblico, cosi preview, template e campagne possono renderizzare una CTA comprensibile senza logica duplicata nel frontend.- Quando una nuova sezione admin e stata completata in fretta per chiudere il flusso end-to-end, fare una seconda passata dedicata alla leggibilita del componente principale prima di considerarla davvero manutenibile: JSX monolitico e feature corretta non sono una buona chiusura.
- Se il cliente chiede di eliminare una pagina pubblica, rimuovere sempre anche tutte le referenze runtime collegate: navbar, route frontend, sitemap backend e checklist operative, non solo il file .tsx.
- Nei wizard multi-step dentro un unico `form`, il submit finale non deve dipendere dal semplice cambio di step o dalla sostituzione del bottone sotto al cursore: la conferma conclusiva va protetta con un handler esplicito e non deve poter partire nello stesso click che porta all'ultimo step.

- Se Alembic segnala multiple heads, verificare sempre gli id reali con 'alembic heads' e 'alembic history --verbose' e creare una merge migration pura nel repo senza toccare le revisioni esistenti.

- Nei deploy su checkout persistente del server, non assumere mai working tree pulito: prima di git checkout bisogna gestire modifiche locali e file untracked in modo robusto (stash nominato o strategia equivalente), altrimenti il push Git va a buon fine ma il deploy fallisce durante lo switch di branch.

- Se il cliente segnala che una UI rimossa gli piaceva, non sostituirla con un editor piu povero solo per semplificare il layout: bisogna ripristinare il flusso apprezzato oppure offrire subito un wizard equivalente o migliore, mantenendo le affordance chiave.

- Se il deploy usa un checkout persistente con artefatti runtime generati da container (es. data/videos/welcome), il workflow deve escluderli esplicitamente da git status e git clean; altrimenti basta un owner diverso (oot vs deploy) per bloccare il deploy anche se il push GitHub e corretto.

- Mar 20, 2026: su UX sensibile non devo sostituire un wizard gia approvato con una shell nuova senza riallinearmi esplicitamente al riferimento migliore del prodotto. Se esiste un wizard canonico forte (qui Iscrizione), va riusato come grammatica primaria prima di provare varianti.


- Mar 20, 2026: quando integro un editor terzo pesante (es. GrapesJS) in un flusso business-critical, devo prima ancorarlo a una grammatica UX gia validata dal prodotto e verificare desktop/mobile prima di dichiarare il wizard accettabile. La potenza del builder non giustifica una UX piu tecnica o piu fragile del flusso precedente.

- Mar 21, 2026: nei flussi numerici shared non devo mai introdurre fallback o domini di calcolo impliciti. Prima verifico il pool reale, la query esatta e la semantica dei campi esistenti (
ext_no, storico eleased_at), poi implemento solo regole esplicite e dimostrabili dal dominio.

- Mar 21, 2026: quando il dominio numerico shared dipende dal DB reale, prima di difendere la query devo verificare se lo scope ufficiale e stato contaminato da org/batch di test in produzione. In quel caso il bug puo essere di dato, non di formula, e la correzione deve ripristinare il perimetro ufficiale prima di cambiare codice.

- Mar 28, 2026: se un deploy fallisce per timeout/OOM non devo attribuirlo subito a un memory leak runtime. Prima devo separare build, migration e rollout, misurare i picchi RAM del percorso di deploy e spostare fuori dal server le build pesanti che possono saturare il nodo anche quando il runtime resta stabile.
- Mar 28, 2026: quando implemento secret per-organization salvati nel DB, devo distinguere in modo esplicito tra `secret applicativo globale di cifratura` e `secret business inserito dal Super Admin`. Non devo mai presentare la chiave globale di cifratura come se fosse la key merchant dell'associazione.
- Mar 31, 2026: se un nuovo flusso di pagamento emette comunque la tessera finale gia prevista dal prodotto, non devo introdurre una pagina post-payment parallela con UX ridotta. Devo riusare la stessa destinazione finale, gli stessi link pubblici e la stessa mail tessera del flusso standard per evitare esperienze divergenti.

- Quando l'utente corregge un workflow di review dicendo che dopo la decisione admin deve partire una seconda comunicazione al destinatario, trattare submit iniziale e post-review come eventi distinti obbligatori e coprirli entrambi nei test.
- Se esiste un `club_display_name` / nome visualizzato tenant, tutte le superfici pubbliche user-facing devono usare quella sorgente come primaria: page source SEO, preview social, payload elenco pubblico e filtri di ricerca non devono leggere solo `Organization.name`.
- Se un feature flag pubblico comunica anche una regola business vincolante (es. `solo maggiorenni`), non basta mostrare il banner: nello stesso task devo implementare anche la validazione lato frontend e il blocco lato backend sugli endpoint reali.
- Apr 24, 2026: quando un rehaul visuale include asset brand espliciti, trattare logo e payoff come invarianti: riusare i file esistenti e verificare lo status dell'asset prima di chiudere.
- Apr 26, 2026: dopo ogni deploy/push che puo ricostruire immagini Docker su server piccolo, verificare subito `df -h /` e `docker system df`; se il disco arriva al 100%, Postgres puo restare in recovery e causare 500 anche quando il codice applicativo e corretto. Il cleanup deve liberare immagini/cache/log senza toccare il volume DB, poi va verificato `pg_isready`, stato worker e HTTP pubblico.
- Apr 26, 2026: quando un rehaul admin viene richiesto da mockup espliciti, implementare prima primitive e struttura pagina (KPI, toolbar, master-detail, drawer/modal) e solo dopo rifinire CSS; non chiudere mai con sola shell/palette, e trattare logo/payoff brand come invarianti non modificabili.
- Se una voce sidebar resta visibile anche quando una feature non e attiva, la route deve comunque renderizzare uno stato vuoto/disabled: non filtrare la tab o fare redirect silenziosi che sembrano refresh bloccati.
- Nelle UI con riga espandibile controllata da id selezionato, il toggle di chiusura deve avere precedenza sugli effect di auto-selezione; altrimenti `null` viene sovrascritto e la riga non si chiude mai.
