# Rilascio completo portale — 27 ottobre 2026

Pubblicati su `Main` e in produzione tutti gli interventi approvati: piano precedente, UI/UX uniforme, riconciliazione incassi, operazioni multiple sui soci e presenze manuali tramite ricerca. Branding delle tessere conservato.

Correzione successiva dello stesso giorno: [barra azioni Soci e calendario dei solleciti](member_actions_release_2026-10-27.md). I solleciti sono stati rimossi da Soci e limitati alle annualità dal 2027 già iniziate, dopo la scadenza della tessera precedente.

## Identità del rilascio

- `f961b1d723512b48f283b1b686c40453c24e6236`: rilascio completo, 167 file. [Workflow riuscito](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/40560898243).
- `7000596a3132b1565f59ff5ac17110ea534b44a6`: correzioni emerse dal collaudo. Versione applicativa finale in produzione. [Workflow riuscito e canary finale superato](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/40562329742).
- Pipeline esistente con immagini immutabili, migrazioni, health check e canary. Il successivo commit di questo rapporto modifica soltanto documentazione.

## P1 — Sicurezza, correttezza e affidabilità

- Reset/cambio password socio con revoca delle sessioni e dei token precedenti; controlli su account e club non più idonei. Attivare MFA invalida le sessioni Org Admin che non l'hanno verificata. I vecchi cookie socio richiedono un nuovo accesso dopo la migrazione.
- Accesso differito e creazione socio: invii coerenti con l'attivazione, controlli e regressioni sui flussi di emissione, pagamento e rinnovo.
- Incassi: data effettiva, idempotenza, protezione dai doppi conteggi e incasso consultabile dopo l'emissione. Un tentativo successivo fallito non cancella un versamento completato.
- Concorrenza verificata anche su PostgreSQL: prenotazioni e numerazione tessere, checkout, credenziali, temporanee, allocazioni e operazioni multiple.
- Google Wallet: registro persistente, coda e worker dedicato; rinnovi sul pass annuale esistente, identità separate per temporanee, revoca e recupero errori. I/O provider separato dalle transazioni critiche.

### Difetti corretti durante il rilascio

1. Revisione Alembic di 33 caratteri oltre i 32 della colonna PostgreSQL: abbreviata prima della pubblicazione, con regressione.
2. Riuso di un ID socio dopo purga: vecchi abbinamenti contabili potevano contribuire al nuovo saldo. Le proiezioni verificano anche l'identità del socio corrente.
3. Ordine lock diverso tra purga e bulk: allineato e verificato con una regressione PostgreSQL che prova l'assenza del blocco incrociato.
4. Esclusione generale PNG dal contesto Docker: asset tessera/Wallet ora inclusi esplicitamente, con prova di un vero contesto Docker.
5. Apertura diretta di `/associazioni` e `/associazioni/{slug}`: rimosso il reindirizzamento alla stessa pagina, servendo la SPA e conservando i controlli sull'associazione.
6. Pulizia di un vecchio socio bloccata da riferimenti storici: scollegati i riferimenti nullable di campagne, form e import, conservando lo storico; figli gestiti anche sui vecchi SQLite senza foreign key attive. Prova riuscita sul clone dei dati reali.

## P2 — Funzioni corrette e aggiunte

### Tessere temporanee

Acquisto dall'area socio per soci già approvati, senza tessera valida e con club abilitato. Metodi del club, una sola richiesta aperta e durata dall'effettiva emissione. Per contanti/bonifico l'Org Admin conferma l'incasso prima dell'emissione. Account e storico conservati.

### Incassi, rettifica e riconciliazione

- Nuova pagina **Incassi**: inserimento manuale o CSV con anteprima, validazione e riconoscimento dei duplicati.
- Abbinamento esplicito a quote iniziali, rinnovi o temporanee, anche per più soci e con acconti. Residuo della quota e dell'incasso distinti; vietata l'allocazione oltre il disponibile.
- Esempio: bonifico 60 euro per due quote da 30; incasso 10 su quota 30 lascia 20 da saldare. Nessuna attribuzione automatica per sola somiglianza di nomi/importi.
- Rettifica di importo, data e metodo manuali; storno abbinamenti e annullamento contabile con motivazione e storico prima/dopo. Prima di ridurre sotto il già allocato occorre stornare gli abbinamenti.
- Fatti provider immutabili. Stornare non esegue rimborsi e non revoca automaticamente tessere già emesse.
- **Aggiorna pagamenti** allinea lo storico con riferimenti autorevoli, in blocchi e senza duplicazioni. [Contratto API](../tasks/accounting-api-20261026.md).

### Selezione multipla dei soci

- Singoli soci, selezione tra pagine o intero risultato filtrato con esclusioni. Cambio filtro azzera la selezione.
- Azioni: esportazione Excel, invio accesso e sollecito quota per annualità. Nessuna cancellazione o modifica finanziaria massiva.
- Anteprima con idonei/esclusi e motivo, conferma esplicita, selezione congelata, nuova verifica per ciascuna riga, blocchi riprendibili ed esiti individuali.
- Retry dei soli fallimenti; email accodata distinta da consegnata. Nessun invio dalla selezione/anteprima.
- Isolamento associazione/creatore, scadenza anteprime, idempotenza ed Excel protetto dalle formule. [Contratto API](../tasks/member-bulk-api-20261026.md).

### Presenze manuali

In **Presenze**, **Cerca socio** accanto allo scanner: ricerca per nome/cognome, email o tessera, scelta e conferma esplicita. Stesse regole QR di validità e unicità giornaliera Europe/Rome. Origine **Inserimento manuale** nello storico; stati già presente, vuoto, attesa ed errori. Passare alla ricerca interrompe la camera e ignora risposte obsolete.

## P2 — UI/UX, velocità e reattività

- Source Sans 3, base 16 px, palette petrolio e superfici neutre condivisi tra pubblico, iscrizione, accesso e aree riservate. Stati semantici, focus, controlli, navigazione e modali coerenti in chiaro/scuro.
- Ridotti gradienti, decorazioni e testi promozionali; migliorati percorsi e validazione. Artwork, loghi, font/colori delle tessere, QR e contenuti personalizzati builder preservati e separati dal tema UI.
- Modali lunghe scorrevoli su portatili bassi e tablet; presenze e bulk adattati agli schermi piccoli.
- Letture paginate, aggregati separati dai dettagli, protezioni da risposte fuori ordine e recupero capabilities dopo errori temporanei.
- Centro Quote: 500 soci in tre query. Form/prenotazioni e messaggi limitati ai dati necessari; saldi bulk in blocco, editor e pagine caricati su richiesta.
- Precache PWA da circa 7,25 MB/97 risorse a circa 1,08 MB/10 risorse. Verificato l'aggiornamento automatico da una vecchia copia alla nuova UI.

## Prove completate

- Backend finale **956 superati, 13 saltati**; frontend **129 superati in 34 file**. TypeScript, build Vite/PWA, compileall e diff check riusciti.
- PostgreSQL 16 su database/schemi isolati: **35 test più 2 regressioni lock order superati**. Numerazione condivisa, checkout, credenziali, temporanee, contabilità e bulk concorrenti.
- Backup completo ripristinato separatamente; tutte **sei migrazioni** da `9d5e7a31c802` a `20261026_06_member_bulk` riuscite. Gate sulla head esatta superato. Backup finale protetto conservato sul server, catalogo pg_restore verificato.
- Provider in sola lettura: autenticazione e classe Google Wallet HTTP200; token Cloudflare attivo e 254 email recenti con ID provider; merchant SumUp configurato letto con successo. Una precedente email fallita non reinviata.
- **22 verifiche HTTPS superate**: salute, pagine/API pubbliche, iscrizione, nuovi chunk, PNG Golden Age e nuove API protette con 401 senza sessione. Hash JS/CSS live uguali alla build verificata.
- Browser pubblico: home desktop/mobile, chiaro/scuro, directory e ricaricamento della pagina associazione, iscrizione con errori obbligatori e recupero password. Ultima prova mobile 390×844, documento 375 px, campi 16 px, Source Sans 3, nessun overflow orizzontale.
- Browser sull'immagine rilasciata con clone PostgreSQL e dati sintetici: presenza manuale persistita e non duplicata dal QR; incasso 30 euro/allocazione 10/residuo 20; bulk tre soci con un accodamento e due esclusioni motivate. Persistenza riletta dal DB. Nessun worker di consegna attivo nel collaudo.
- Inclusi i collaudi precedenti di temporanee, rettifica/storno/import CSV, Excel, selezione tra pagine/ripresa e responsive di modali/presenze. Viewport simulati: non equivalgono a dispositivi fisici.

## Stato finale in produzione

- Sette servizi runtime su `7000596`, tutti healthy, zero riavvii e nessun OOM al controllo finale. Worker video healthy sull'immagine del rilascio completo; Evolution healthy.
- Schema `20261026_06_member_bulk`; **345 job Wallet completati**, nessuno pendente/fallito al controllo.
- Timeout PostgreSQL: lock 5 s, statement 30 s, transazione inattiva 1 minuto. Checkout Git `deploy:deploy`.
- Rimossi container QA, clone DB, schemi temporanei, directory privata e tunnel. Volumi originali/backup conservati. Disco 51%, circa 18 GB liberi.
- `/version` mantiene metadata git/build null preesistenti: identità provata con checkout, immagini immutabili e asset live.
- Evidenze private in `output/release-complete-20261026/`. Ultimi screenshot e `browser-final-corrected.json` documentano PWA aggiornata e dimensioni mobile effettive. Database/export/credenziali/log fuori Git.

## Cosa serve ancora

Non risultano bloccanti P1 nel perimetro verificato. Rimangono adozione e limiti di collaudo:

1. Riconciliare i vecchi incassi senza riferimenti autorevoli e adattare gli estratti al CSV supportato. Non inclusi collegamento banca, multivaluta o rimborsi automatici.
2. Provare Safari/iPhone fisici e fotocamere reali. Usati browser Chromium con viewport simulati.
3. Se desiderato, pianificare una casella e una transazione di prova per consegna/addebito completi: verificati accesso provider, trasporti esistenti e accodamento, senza nuovi invii a soci o pagamenti reali.
4. Un'associazione ha SumUp abilitato senza credenziali: online correttamente non disponibile fino alla configurazione. Stripe già disabilitato, non configurato dal rilascio.

Esclusi come richiesto: webhook WhatsApp/Pienissimo, vecchio `/api/join/continue`, modifiche CI, aggiornamenti generalizzati dipendenze e pulizia/osservabilità P3.

## Ripristino

Preferire correzioni successive per problemi applicativi. La migrazione credenziali conserva la revoca e non supporta downgrade: non eseguire downgrade Alembic automatici. Ripristinare il DB richiede sospensione coordinata delle scritture e backup verificato.
