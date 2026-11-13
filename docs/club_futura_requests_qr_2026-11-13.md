# Richieste Org Admin e lettore QR - 13 novembre 2026

## Correzioni

- La lista Soci applica i parametri di un nuovo link anche quando la pagina e gia aperta. Prima conservava ricerca, filtri documenti/accesso e pagina precedenti, che potevano nascondere domande senza documenti. Anche Indietro ripristina i parametri corretti.
- Il collegamento dashboard Richieste in verifica apre tutti i workflow pending conteggiati dal riepilogo.
- Entrambi gli scanner usano TRY_HARDER di ZXing per leggere QR piccoli nei frame grandi. Riproduzione con payload tessera realistico, tre risoluzioni e 225 combinazioni: 142 frame decodificati prima, 225 dopo.
- Gli errori che arrestano il decoder mostrano un messaggio e permettono di riavviarlo. Le callback obsolete non riattivano uno scanner fermato.
- Gli esiti rifiutati distinguono QR esterno/non valido, tessera non trovata, scaduta, non ancora attiva e di altra associazione. I messaggi del backend sono conservati in entrambi gli scanner, con gli stessi codici HTTP e senza dati personali di altri club.
- Nessun cambiamento alle regole di approvazione, validita, autorizzazione, stock o pagamento; nessuna migrazione. Dipendenza diretta ZXing dichiarata alla versione gia presente nel lockfile.

## Verifiche

- Installazione pulita con npm 10.8.2 riuscita; suite finale 509 test frontend su 80 file e 108 test backend pertinenti superati. TypeScript, build produzione e review indipendente completati.
- Caso segnalato identificato con conferma dell'utente: profilo presente in produzione e restituito dalla vera route elenco con filtro pending. Controlli eseguiti in transazione PostgreSQL REPEATABLE READ/READ ONLY e rollback finale.
- Browser sulla build produzione a 390 e 1440 px, chiaro/scuro: navigazione dashboard/richieste, nuova query su pagina gia montata, domanda senza documenti visibile; stream video sintetico con QR generato dal backend, decodifica ZXing effettiva e registrazione presenza sul backend locale, sia Org Admin sia postazione. Quattro scenari completati senza errori JS o overflow.
- Sedici scenari aggiuntivi nel browser verificano QR esterno, tessera scaduta, assente e di altro club su entrambi gli scanner, chiaro/scuro, tramite acquisizione video sintetica e backend reale. Tutti mostrano la causa prevista, senza registrare presenze. Corretto anche il contrasto degli esiti nella postazione: minimo misurato 5.49:1 in chiaro e 7.13:1 in scuro.
- Prove frontend con dati sintetici: nessuna approvazione, email, presenza o modifica anagrafica reale.

## Limiti

La riproduzione dimostra i difetti corretti; non prova quali filtri fossero nella sessione originaria ne quale frame avesse impedito la lettura sul telefono del club. Non e stata eseguita una prova su quel dispositivo fisico.

## Rilascio

- Commit applicativi `9e26671621b23521fddf042182a578e95f092a73` e `f15e7fff477f39cb54862c914fdc16c6f8a4603c` pubblicati su Main. [Pipeline finale 43481696544](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/43481696544) completata con build e deploy riusciti; Final canary passato alle 19:27:24 Europe/Rome.
- 38 controlli HTTPS superati: hash asset identici alla build, incluse dipendenze lazy ZXing, pagine e protezioni API. Checkout e immagini esatti, sette servizi applicativi healthy con zero restart/OOM, revisione Alembic invariata `20261112_02_paper_cards`. Disco 47%, inode 10%, due volumi persistenti e cache build assente.
- In produzione, controlli applicativi in transazione READ ONLY confermano richiesta restituita dal filtro pending e messaggi distinti per QR non valido, altro club, tessera assente e scaduta. Numero presenze invariato; nessuna approvazione o email reale. Server QA locale fermato.

Evidenze locali private: `output/club-futura-20261113/`, inclusi `workflow-final-release.json`, `release-verification.json`, `live-errors-readonly.json` e report browser.
