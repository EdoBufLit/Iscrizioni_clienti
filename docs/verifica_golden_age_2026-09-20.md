# Verifica Golden Age Club - Speakeasy — 20 settembre 2026

## Esito

Confermato un difetto di ricerca nell'elenco soci. La ricerca live cerca la
stringa intera separatamente in nome e cognome e non rimuove gli spazi dalla
query: un nome completo o un'email incollata con spazi possono non trovare il socio.

Non confermata la riemissione della tessera o la modifica della data di iscrizione
nei tentativi ripetuti esaminati. Per verificare il caso specifico segnalato dal
cliente restano necessari i nominativi/email e il link di registrazione.

## Evidenze in produzione

- Associazione `oasi-2`, ID 6. Checkout live `7d2def5`, uguale alla base locale.
- 2.494 soci, tutti attivi con numero tessera e anno 2026; provenienza Pienissimo.
- Nessun duplicato per email normalizzata tra le anagrafiche non eliminate.
  Questo non esclude che la stessa persona abbia usato email diverse.
- 632 anagrafiche prive di cognome; 426 riportano solo il segnaposto `Socio`.
  Il flusso Pienissimo accetta nome/cognome mancanti e applica questi valori di
  ripiego. I nominativi non acquisiti non possono essere recuperati dalla ricerca.
- Gli audit conservati contengono 37 tentativi `already_issued` su 34 soci.
  Ognuno dei 34 ha una sola emissione registrata e conserva una `joined_at`
  coerente con quella emissione (scarto inferiore a 60 secondi).
- Negli ultimi 30 giorni: 11 tentativi ripetuti su 8 soci. La funzione reale di
  elenco soci, sul codice live, trova 8/8 con email esatta, 0/8 con email circondata
  da spazi e 0/8 con nome e cognome insieme.
- Tutti i soci hanno `joined_at` presente. Nessuna `decision_at` successiva di
  oltre un giorno a `joined_at`.

Letture eseguite con transazione PostgreSQL `READ ONLY` e timeout delle query.
Per la verifica diretta della ricerca, il contesto associazione e stato fornito
localmente alla funzione per evitare l'aggiornamento della sessione amministratore.
Nessuna registrazione, invio email, emissione o modifica anagrafica eseguita in
produzione. Nessun dato personale dei soci riportato in questo documento.

## Correzione locale e verifiche

`app/routes/org_admin.py`: normalizza gli spazi della query e cerca ogni parola
nei campi nome/cognome, anche in ordine inverso. Restano i filtri per associazione,
stato e paginazione e le ricerche per email, codice fiscale e tessera.

- 7 test passati: filtri/ricerca soci, regressioni stato attivo e soci legacy.
- 26 test passati: ingest Pienissimo, emissione integrazione e verifica tessera.
- Nuova regressione: prima emissione a febbraio, ripetizione a giugno con email
  maiuscola/spazi e ID esterno diverso, poi due download PDF. Stessi socio, numero,
  token, date di iscrizione/validita, annualita e contatore del lotto; una sola
  emissione in audit.
- `python -m compileall -q app init_db.py` e `git diff --check` superati.

La correzione e locale, non ancora pubblicata. I dati incompleti non sono stati
modificati. La verifica generale richiesta e conclusa; il riscontro individuale
resta da confrontare con gli esempi del cliente.

## Altri rilievi fuori dalla correzione

Il filtro Eliminati aggiunge anche un confronto con stato `deleted`
incompatibile con il modello corrente: difetto separato, non applicabile ai
2.494 soci attivi di questa associazione. Lasciato invariato.

## Estensione successiva richiesta: similitudine

Aggiunta in locale la ricerca automatica per un refuso su nome o email: lettera
mancante, aggiunta, sbagliata o inversione adiacente. Esempio: `mario.rossi` trova
anche `mariu.rossi@example.com`. Le email complete vengono confrontate per intero,
cosi il solo dominio condiviso non basta a suggerire un altro indirizzo.

I risultati esatti precedono quelli simili; i suggerimenti hanno un badge
`Corrispondenza simile` e mostrano sempre i dati realmente registrati. Nessuna
correzione automatica, fusione o invio email. I filtri restano attivi e la
paginazione comprende entrambi i gruppi. I termini brevi e i numeri tessera
restano letterali; la tolleranza richiede almeno 4 caratteri e 3 lettere.

Il servizio applica un prefiltro SQL, legge i candidati a blocchi e carica le
anagrafiche complete della sola pagina. Nessuna dipendenza o estensione DB nuova.
Corretta anche la gestione UI delle risposte precedenti che arrivano in ritardo.

Verifiche finali: 56 test backend, 4 test frontend, typecheck/build, compileall,
diff check; smoke browser reale su desktop e mobile 390px in tema scuro.
Benchmark locale SQLite con 10.001 soci: 33.5-59.6 ms, inclusa una ricerca con
10.001 suggerimenti paginati. Nessuna pubblicazione eseguita.

L'esempio individuale successivamente fornito dall'utente e stato verificato
in produzione in sola lettura: socio presente con nome esatto, attivo 2026,
una sola emissione nello storico disponibile e invio email registrato. Questo
riscontro non dimostra la ricezione dell'email nella casella del destinatario.
