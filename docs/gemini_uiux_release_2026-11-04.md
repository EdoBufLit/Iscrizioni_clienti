# Rilascio UI/UX Gemini — 4 novembre 2026

## Contenuto

Pubblicazione delle due fasi locali autorizzate dall'utente: stile e controlli condivisi nei temi chiaro/scuro, layout affiliazione, wizard iscrizione e pagina esito pagamento. Le modifiche migliorano validazioni, etichette, navigazione dei passaggi, persistenza della bozza e leggibilità responsive. Conservati i contratti di invio e il fulfillment server dei pagamenti.

La review ha corretto due regressioni con test prima falliti e poi superati: Escape sui suggerimenti del comune chiude il popup senza riaprirlo al ritorno del focus; un errore di polling termina spinner e `aria-busy`, lasciando annunciabile il messaggio.

## Verifiche

- Build TypeScript/Vite/PWA riuscita; 394 test frontend superati su 62 file.
- Review indipendenti di affiliazione, iscrizione ed esito pagamento, senza blocker residui.
- Browser sull'anteprima compilata: affiliazione e iscrizione a 390×844 e desktop 1440×900, temi chiaro/scuro, validazione dei campi obbligatori e riepilogo errori con focus. Nessun overflow orizzontale mobile. Esito pagamento senza identificativo mostra correttamente l'errore. Nessun errore console osservato durante lo smoke.
- Anteprima con proxy di sole letture delle API pubbliche; scritture, pratiche e pagamenti reali non eseguiti. Il salvataggio bozza è stato verificato mediante review del codice, senza una nuova pratica end-to-end.
- Nessuna migrazione o dipendenza nuova. Disco e inode del server verificati prima del rilascio (47% e 10% utilizzati).

## Pubblicazione completata

- Commit applicativo `232e3352bea697497ab9a898a31c5c1fe07c3613` pubblicato su `Main`.
- [Pipeline 41892340754](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/41892340754) e job deploy 126793764484 riusciti. `Final canary passed` verificato alle 20:05 del 4 novembre 2026, Europe/Rome.
- 63 controlli HTTPS e hash degli asset superati, inclusi affiliazione, iscrizione ed esito pagamento. Sette servizi applicativi healthy sulla nuova immagine, zero restart/OOM; schema invariato `20261026_06_member_bulk`.
- Browser live: affiliazione, apertura wizard e iscrizione socio verificati senza invii. La prima navigazione all'affiliazione durante il rollout ha mostrato un errore generico; un normale ricaricamento l'ha risolto e l'accesso successivo da una nuova scheda è riuscito. Non attribuita una causa certa all'episodio; nessun errore console disponibile.
- Server di anteprima fermato, schede temporanee chiuse e viewport ripristinato. Log build/test e rapporti HTTPS/runtime in `output/gemini-uiux-20261104/`.
