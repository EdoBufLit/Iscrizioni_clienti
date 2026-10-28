# Dettaglio socio Org Admin — 28 ottobre 2026

## Modifiche

- Quattro schede: Profilo, Pagamenti, Documenti e note, Attività. Un'unica intestazione con iniziali, nome formattato, stato effettivo, tessera/scadenza e azioni Chiama, Email, Tessera, Modifica. La formattazione del nome non modifica i dati salvati.
- Pagamento, modifica profilo, decisione pendente e rigetto documenti si aprono in pannelli inferiori. Focus confinato e ripristinato, scroll interno e chiusura bloccata durante il salvataggio. I pagamenti falliti conservano i dati; quelli salvati non vengono riproposti quando fallisce il successivo aggiornamento.
- Pagamenti mostra saldo previsto, incassato netto e residuo dal servizio contabile esistente, con storico pagamenti e incassi collegati. Nessuna somma tra rappresentazioni duplicate legacy; importo di un incasso condiviso distinto dal saldo personale. Parziali, storni e rettifiche rimandano a Incassi. Le temporanee conservano il proprio flusso.
- Approvazioni concluse in sola lettura, con note e data restituite dal backend. Revisione dei documenti disponibile anche per soci già attivi. Stati e metadati leggibili, date UTC presentate in Europe/Rome.
- Contenitore tessera coerente con il tema; invio email principale e PDF/Stampa affiancati. Artwork, font, colori e sfondo QR delle tessere conservati. Corretto il riferimento alla finestra usata per caricare e stampare il PDF.
- Eliminazione come collegamento discreto in fondo, con nome del socio, avviso e casella di conferma prima dell'azione.
- Corretto il salvataggio di modifiche non correlate su profili importati con comune senza codice: coppia storica conservata, dati cambiati ancora validati dal server e dal form.

## Verifica

- 175 test frontend in 39 file; build TypeScript/Vite/PWA riuscita.
- 18 test backend pertinenti: decisioni, pagamento manuale, dettaglio metodo, modifica profilo, azioni tessera e cache SPA. Inclusi isolamento tra associazioni, persistenza delle note, validazione dei comuni modificati e risposte200/304 del service worker. Nessuna migrazione.
- Browser su build reale e database sintetico: quattro schede in 24 combinazioni, 320×568, 390×844, 810×900, 1280×600 e 1440×900, temi chiaro/scuro. Nessun overflow orizzontale e nessun form inizialmente aperto.
- Registrato pagamento locale da 30 euro, residuo aggiornato a zero, pannello chiuso e focus recuperato. Salvate note con comune storico; approvato e rigettato con motivazione un documento di socio attivo; verificata conferma eliminazione senza eseguirla; scaricato PDF e ispezionato il QR. Nessun errore browser rilevato.
- Screenshot, report responsive e log privati in `output/member-detail-20261028/`, esclusi da Git.

## Rilascio

- Commit applicativo: `a84b850b2e4433bf0e2328bca2482728f8047aa2`, Main.
- Workflow: [40775023780](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/40775023780).
- Primo rollout riuscito con Final canary passed, 27 controlli HTTPS e hash degli asset corrispondenti. Sette servizi runtime aggiornati e healthy, zero restart/OOM; schema invariato. Browser pubblico utilizzabile senza errori.
- Correzione cache: `c338439b3a0a7c30a9b231bf2329e4cd473d4e4c`, [workflow40776534028](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/40776534028).
- Secondo rollout riuscito con Final canary passed. Nuovamente 27 controlli HTTPS/asset e sette servizi runtime healthy, zero restart/OOM. Intestazioni verificate all'origine e su due richieste CDN nuove: BYPASS, nessuna Age e worker effettivo corrispondente all'immagine distribuita. La vecchia copia canonica resta HIT fino alla scadenza scelta dall'utente. Server locale di prova fermato, schede temporanee chiuse e viewport ripristinato.
- Rilevata cache Cloudflare preesistente del worker PWA (`/sw.js`, TTL14400 secondi): ritardava la sostituzione della shell in browser gia aperti. Corretta la risposta del singolo file con rivalidazione browser e no-store CDN; gli asset con hash conservano la cache lunga. **L'utente ha scelto di lasciare scadere la copia gia memorizzata**, senza purge. Credenziali purge non configurate in questo workspace/server. Riferimenti: [direttive CDN](https://developers.cloudflare.com/cache/concepts/cache-responses/) e [purge del singolo file](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-single-file/).

## Limiti

Le prove di scrittura e invio usano dati sintetici locali e non modificano soci reali. Non eseguiti nuovi invii email reali, stampa fisica o collaudo su dispositivo Safari/iOS. I collaudi automatici includono errori API, doppio invio, perdita del refresh dopo salvataggio, navigazione da tastiera e blocco delle chiusure durante l'invio.
