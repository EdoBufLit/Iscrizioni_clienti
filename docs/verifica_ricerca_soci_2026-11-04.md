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
