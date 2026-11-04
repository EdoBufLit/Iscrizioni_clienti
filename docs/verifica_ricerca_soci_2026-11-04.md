# Verifica ricerca soci — 4 novembre 2026

Segnalazione Golden Age: nessun risultato cercando nome e presunto cognome; un tentativo con email sarebbe fallito per poi funzionare.

## Riscontro in produzione

Ispezione tramite container web e sessione PostgreSQL con `SET TRANSACTION READ ONLY`, senza modificare dati o inviare messaggi.

- Tessera 26826, annualità 2026: presente, attiva, non eliminata. Nome Martina, cognome vuoto.
- `Martina fredi` e `Martha fredi`: zero risultati sia con filtro Attivi sia Tutti. I termini multipli vengono cercati nei campi nome/cognome; il cognome richiesto non è registrato.
- `Martina`: 64 risultati; la tessera si trova nella seconda pagina da 25 elementi.
- Email registrata e variante con una sola `d` al posto della doppia `dd`: entrambe restituiscono la socia, grazie alla gestione dei refusi già presente.
- `26826`: un risultato, quello corretto, sia in Attivi sia in Tutti.

## Verifica codice

Il frontend ignora risposte obsolete; la ricerca riparte dalla prima pagina al cambio query. La ricerca server precede la paginazione e conserva i filtri del tenant. Le API hanno `Cache-Control: no-store` e non sono incluse nella cache runtime PWA.

Test: 27 backend (`test_member_search.py`, `test_org_admin_member_filters.py`) e 8 frontend (`OrgAdminMembers.test.tsx`) superati, inclusi refusi, filtri, paginazione e risposte fuori ordine.

## Esito e limiti

Riprodotto l'esito delle immagini: è coerente con l'anagrafica incompleta. Il mancato risultato temporaneo con email non è stato riprodotto; gli allegati non mostrano quel tentativo né l'orario preciso. Non attribuirlo a una causa tecnica senza ulteriori evidenze. Nessuna modifica al codice applicativo o ai dati reali; nessun rilascio necessario per questa verifica.

## Miglioramento successivo richiesto

La ricerca combina ora le parole del nome con un frammento della parte locale dell'email quando il cognome è NULL, vuoto o composto da soli spazi. `Martina fredi` e l'ordine inverso possono trovare la scheda con nome Martina e indirizzo contenente `freddi`. Il risultato usa il badge esistente `Corrispondenza simile`; le corrispondenze esatte conservano la precedenza.

Un solo refuso complessivo tra nome e frammento email, almeno quattro caratteri per il frammento, dominio escluso. Filtri dell'associazione, stato, paginazione e selezione massiva condividono il comportamento. Nessun dato anagrafico viene modificato e non servono migrazioni.

Tre regressioni inizialmente fallite e poi superate. Verifica finale: 80 test ricerca/filtri/bulk superati; review indipendente senza blocker e controlli SQL/Python per il cognome vuoto allineati.

## Episodio del 3 novembre alle 15:02 Europe/Rome

L'orario precisato dall'utente corrisponde alle 14:02 UTC. Nessuna esecuzione GitHub Actions risulta creata il 3 novembre. Prima del rilascio odierno il container web era avviato dal 2 novembre alle 22:01:04 UTC, sull'immagine `0a91388`, con zero riavvii e nessun OOM.

I log PostgreSQL tra le 13:55 e le 14:10 UTC contengono tre checkpoint regolari (0,322 / 0,821 / 0,320 secondi), senza ERROR, FATAL, PANIC o timeout. Non emergono evidenze di un deploy, riavvio o errore database nel periodo indicato.

Non è stato possibile ricostruire la singola richiesta HTTP: il vecchio container web è stato sostituito dal rilascio odierno e i suoi log non sono più disponibili. Un iniziale output vuoto di `docker logs --since/--until` non è stato usato come prova di assenza di errori: sul database il file JSON conservava gli eventi non restituiti dal comando.

## Rilascio verificato

- Pubblicato su `Main` il commit `26b4b60ff9cb6dd43d2eebc1146cf5a0b1f1da69`.
- [Pipeline 41880000071](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/41880000071): build e deploy riusciti; `Final canary passed` confermato nel job 126750745463, concluso il 4 novembre alle 18:51 italiane.
- Sette servizi applicativi healthy sulla nuova immagine, zero riavvii/OOM; schema invariato `20261026_06_member_bulk`. Spazio disco e inode verificati (46% / 10% utilizzati).
- Prova sul database reale in transazione READ ONLY: `Martina fredi` restituisce un risultato, la tessera 26826, sia in Attivi sia in Tutti. Ricerca email e numero tessera ancora funzionanti. Nessuna modifica alle anagrafiche o invio reale.
- Health pubblico HTTPS con database disponibile e login amministratore HTTP 200. Nessuna modifica frontend inclusa nel rilascio.
