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
