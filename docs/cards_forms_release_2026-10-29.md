# Tessere e Form pubblici - 29 ottobre 2026

## Modifiche

- Tessere separata in Magazzino, Ordini e Design. Indicatori da dati reali: quote effettivamente incassate e disponibilita del magazzino, senza confondere attivi con numeri consumati/riservati.
- Richiesta rifornimento in pannello inferiore: costo esplicito, anno corretto, nessun addebito online; protezione dal doppio invio e riutilizzo dello stesso identificativo dopo un esito di rete incerto. Esito salvato distinto dal successivo aggiornamento della pagina.
- Storico richieste e lotti con stati contabili reali, note su richiesta, paginazione e filtri sul server prima della paginazione. Storici non contabilizzati non presentati come debito.
- Su telefono/tablet: pulsante Filtri, pannello con campi interi, applicazione esplicita e pill rimovibili, secondo la correzione dell'utente. Selezione anno leggibile anche a 320 pixel.
- Una sola anteprima tessera con fronte/retro, quattro colori, impostazioni avanzate e regole economiche comprimibili. Bozze conservate passando tra le schede. Artwork dedicato e branding preservati; anteprima generica senza sovrapposizioni.
- Completato refactor Gemini dei Form pubblici: card responsive, stato, link/copia, contatori leggibili, Risposte/Builder e menu contestuale. Creazione contestuale anche in Comunicazioni.
- Duplicazione form tramite endpoint atomico esistente: conserva campi, canvas e impostazioni e crea una bozza. Lock sincroni delle azioni, gestione degli errori clipboard e del refresh, menu da tastiera e conferma eliminazione riferita alla card corretta.
- Corretto il valore predefinito instabile dei template e lo stato riutilizzato della conferma; card/pulsanti/contatori rientrano nel viewport anche con titoli lunghi.

## Verifiche prima del rilascio

- Frontend finale: 243 test superati in 46 file, inclusi 14 test delle nuove card Form e quattro regressioni del layout pubblico. Typecheck e build TypeScript/Vite/PWA riusciti.
- Backend: 63 test pertinenti superati, inclusi filtri, disponibilita, rifornimenti, validazioni, isolamento associazione, CRUD/duplicazione form e controlli pubblici antiabuso.
- Review indipendente conclusa senza blocker; corretto lo stato della conferma segnalato dalla review.
- Browser su build reale e dati sintetici: magazzino/ordini/design, rifornimento 2027 senza alterare stock2026, paging e totali, salvataggio regole/design/logo e permessi artwork dedicato. Matrice iniziale di 18 casi tra 320,390,810,1280 e1440 pixel e temi chiaro/scuro; ulteriori verifiche dopo la correzione filtri e anteprima.
- Form: creazione/salvataggio impostazioni, copia link, duplicazione, attivazione, conferma eliminazione annullata; card misurate a320/390/810/1440 pixel, senza tagli dei contenuti. Aggiunto un campo dal builder, inviata una risposta sintetica e verificati contatore e inbox dopo caricamento. Notifiche disabilitate e nessun provider esterno coinvolto nella prova.
- Nessun invio, pagamento o modifica di dati reali durante il collaudo. Evidenze private in `output/cards-workspace-20261029/`, escluse da Git.

## Rilascio

Push principale `bac42de`, pipeline40943150977 riuscita con Final canary passed. Il controllo aggiuntivo del link pubblico ha individuato un errore preesistente del layout: con preferenza riduci animazioni, GSAP riceveva riferimenti nulli nelle pagine senza intestazione, inclusi i form pubblici. Correzione limitata agli effetti delle pagine con intestazione, pubblicata in `61b0ddc` con pipeline40943731154; quattro regressioni dedicate superate e apertura reale del form pubblico confermata nel browser dopo rebuild.

- Codice runtime `61b0ddc7b0dd0da798e6f01eaf9b07425e645567`: sette servizi healthy, zero restart/OOM; schema invariato `20261026_06_member_bulk`, 353 job Wallet completati. Disco57%,16GB disponibili; checkout deploy:deploy.
- 37 controlli HTTPS riusciti; hash JS/CSS effettivi corrispondenti alla build locale, inclusi moduli Tessere e Form. API riservate senza sessione rispondono401.
- PostgreSQL16: 440 controlli in transazione REPEATABLE READ/READ ONLY su tre associazioni, rollback finale. Totali/stati/paging/lot options e assenza di risultati da lotti di altre associazioni verificati senza scritture.
- Browser produzione: form pubblico reale con sette campi, pagina login Org Admin e home mobile390x844; nessun overflow o errore di rendering. Nessun invio o login di collaudo in produzione.
- Worker PWA canonico in BYPASS, senza Age, con header di rivalidazione e CDN no-store; contiene la nuova shell. La vecchia cache segnalata nel rilascio precedente e scaduta naturalmente come richiesto dall'utente.
- Server e schede QA propri chiusi, viewport ripristinato. Nessuna migrazione; webhook WhatsApp/Pienissimo, endpoint legacy e pulizia P3 fuori perimetro.

Anche la seconda pipeline40943731154 e completata con successo; Final canary passed confermato nei log. Il rilascio e concluso su Main.

## Limiti

Viewport Chromium simulati; nessun dispositivo Safari/iOS fisico. Nessun nuovo addebito o consegna email reale utilizzato come prova. Le operazioni distruttive sono verificate nei test isolati; nel browser la conferma viene annullata.
