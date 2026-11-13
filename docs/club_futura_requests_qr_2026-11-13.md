# Richieste Org Admin e lettore QR - 13 novembre 2026

## Correzioni

- La lista Soci applica i parametri di un nuovo link anche quando la pagina e gia aperta. Prima conservava ricerca, filtri documenti/accesso e pagina precedenti, che potevano nascondere domande senza documenti. Anche Indietro ripristina i parametri corretti.
- Il collegamento dashboard Richieste in verifica apre tutti i workflow pending conteggiati dal riepilogo.
- Entrambi gli scanner usano TRY_HARDER di ZXing per leggere QR piccoli nei frame grandi. Riproduzione con payload tessera realistico, tre risoluzioni e 225 combinazioni: 142 frame decodificati prima, 225 dopo.
- Gli errori che arrestano il decoder mostrano un messaggio e permettono di riavviarlo. Le callback obsolete non riattivano uno scanner fermato.
- Nessun cambiamento alle regole di approvazione, validita, autorizzazione, stock o pagamento; nessuna migrazione. Dipendenza diretta ZXing dichiarata alla versione gia presente nel lockfile.

## Verifiche

- Installazione pulita con npm 10.8.2 riuscita; 499 test frontend su 80 file e 24 test backend pertinenti superati. TypeScript, build produzione e review indipendente completati.
- Caso segnalato identificato con conferma dell'utente: profilo presente in produzione e restituito dalla vera route elenco con filtro pending. Controlli eseguiti in transazione PostgreSQL REPEATABLE READ/READ ONLY e rollback finale.
- Browser sulla build produzione a 390 e 1440 px, chiaro/scuro: navigazione dashboard/richieste, nuova query su pagina gia montata, domanda senza documenti visibile; stream video sintetico con QR generato dal backend, decodifica ZXing effettiva e registrazione presenza sul backend locale, sia Org Admin sia postazione. Quattro scenari completati senza errori JS o overflow.
- Prove frontend con dati sintetici: nessuna approvazione, email, presenza o modifica anagrafica reale.

## Limiti

La riproduzione dimostra i difetti corretti; non prova quali filtri fossero nella sessione originaria ne quale frame avesse impedito la lettura sul telefono del club. Non e stata eseguita una prova su quel dispositivo fisico.

Evidenze locali private: `output/club-futura-20261113/`.
