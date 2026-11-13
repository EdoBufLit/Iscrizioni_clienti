# Ricerca e filtri soci - 13 novembre 2026

## Problema e correzioni

Il registro Super Admin cercava la frase intera dentro il solo nome o il solo cognome. Una ricerca composta come `cristian col` non trovava `Cristian Collaudo`, anche con Tutti gli stati o Scaduti. Ora tutte le parole sono cercate tra nome e cognome, nello stesso modo dell'Org Admin. Ricerca per associazione, contatti e numero tessera preservata; spazi normalizzati.

La pagina Super Admin applicava anche risposte di richieste precedenti: cambiando stato o ricerca, un risultato vecchio poteva cancellare quello nuovo. Ora registro, errori, caricamento e dettaglio ignorano le richieste superate. Se si cambia filtro durante il debounce, la richiesta attende il nome attualmente scritto.

Il difetto non e stato riprodotto nell'Org Admin aggiornato: nessuna modifica preventiva ai suoi sorgenti. Aggiunte tre regressioni su cambio stato con nome gia scritto, cambio durante debounce e cache calda con risposte fuori ordine.

## Verifiche

- 24 confronti live READ ONLY prima del fix sui due ruoli: il profilo segnalato e presente con solo nome/cognome, ma Super Admin non lo trova con ricerca composta. Org Admin trova il profilo sia con Tutti sia con Scaduti; Attivi lo esclude correttamente.
- Test backend inizialmente fallente per la ricerca composta; sette regressioni frontend inizialmente fallenti per richieste obsolete/debounce. Suite finale: 521 test frontend su 81 file e 89 backend pertinenti superati. Build produzione e review indipendente completate.
- Otto scenari browser sulla build produzione e dati sintetici: Super/Org Admin, mobile390px e desktop1440px, chiaro/scuro. Nome prima/dopo filtro, ricerca parziale/invertita, scaduti in Tutti e richiesta Attivi vuota rilasciata dopo Scaduti senza perdere il risultato attuale.
- Nessuna modifica anagrafica, approvazione, email o cambio di validita delle tessere. Controlli produzione in transazione PostgreSQL REPEATABLE READ/READ ONLY.

Evidenze private: `output/member-filter-search-20261113/`.
