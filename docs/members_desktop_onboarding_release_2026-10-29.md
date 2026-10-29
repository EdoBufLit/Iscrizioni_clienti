# Soci desktop e completamento iscrizioni manuali — 29 ottobre 2026

## Comportamento

- Desktop: intestazione e KPI compatti; ricerca, filtri, conteggio e cronologia in una sola barra. Le azioni massive compaiono dopo la selezione. La checkbox della tabella seleziona la pagina senza aprire il profilo.
- I quattro KPI filtrano l'intero elenco con gli stessi criteri dei rispettivi conteggi, rimuovendo ricerca e filtri incompatibili. Documenti da verificare conta soci distinti, anche quando hanno più documenti.
- Click sulla riga apre Profilo rapido; Profilo apre la pagina completa. Nessuna apertura automatica della prima riga. Il pannello ha una chiusura esplicita, ripristina il focus e lascia espandere la tabella; overlay sotto 1440 px, affiancato da 1440 px.
- Stati italiani, date nel fuso Europe/Rome, esportazione singola denominata Esporta scheda socio e limitata al socio richiesto e all'associazione autenticata.
- La creazione manuale apre subito il profilo appena creato, anche se l'elenco precedente aveva filtri incompatibili. Invito email selezionato per impostazione predefinita quando è presente un indirizzo; errori di validazione leggibili, blocco del doppio invio e della chiusura durante il salvataggio.
- L'invito apre `/completa-iscrizione`: il socio sceglie la password e carica i documenti prima dell'attivazione. Documento di identità obbligatorio solo dove configurato dall'associazione; codice fiscale facoltativo. Documenti già in verifica o approvati non vengono sovrascritti; quelli rigettati possono essere sostituiti conservando lo storico.
- Il profilo amministratore presenta Invia invito al socio per le iscrizioni manuali da completare e Attiva socio/Completa attivazione. L'esito distingue attivazione effettiva, quota ancora necessaria e tessere esaurite. L'email di accesso/tessera resta successiva all'attivazione.

## Sicurezza e affidabilità

- Invito in outbox nella stessa transazione della creazione; nessun falso esito "email inviata" quando è solo accodata. Reinvii in attesa riusano il lavoro esistente, senza duplicati; limitazione dei reinvii recenti.
- Token firmato, monouso, durata 72 ore, vincolato a socio, associazione, email e versione delle credenziali. Token nel frammento URL, rimosso immediatamente dal browser. La sessione di completamento separata dura un'ora e non concede la normale sessione socio.
- Verifiche ripetute di associazione attiva, stato iscrizione, eliminazione e versione credenziali. Non è possibile usare l'invito per cambiare una password già impostata.
- Password e documenti salvati atomicamente; controlli di tipo/dimensione, deduplicazione dei tentativi ripetuti e pulizia dei file non referenziati. Lettura dei file fuori dalla transazione e dal lock del socio. Password iniziale revoca le vecchie credenziali temporanee.
- Nessuna migrazione. Login/reset ordinari e vecchio `/api/join/continue` preservati. Nessuna modifica alle integrazioni escluse dal perimetro.

## Verifiche prima del rilascio

- Backend completo: **1025 passed, 13 skipped**. Flusso API sintetico dalla creazione fino all'accesso con password dopo approvazione, con verifica di outbox e assenza di duplicati.
- Frontend completo: **306 passed in 52 file**; build TypeScript/Vite/PWA riuscita. Review indipendenti dei contratti, delle interazioni e del completamento iscrizione.
- PostgreSQL 16.12: **21 controlli** in uno schema QA isolato e poi rimosso. Due riscatti simultanei restituiscono rispettivamente 200 e 401; rollback atomico, upload senza lock mantenuto, retry senza duplicati e rotazione della versione delle credenziali verificati. Nessun dato reale usato e nessuna email consegnata dal collaudo.
- Browser su build reale e dati sintetici, chiaro/scuro: 390×844, 1280×720, 1366×768, 1440×900 e 1920×1080. A 1280×720 la prima riga passa da circa 841 a **353 px**, con **cinque righe complete** subito visibili. Nessun overflow orizzontale nei casi controllati.
- Verificati selezione contestuale, cronologia, chiusura con X/Escape e recupero focus, overlay e pannello affiancato, filtri mobili e accesso al socio pendente. Il file Excel scaricato per un singolo socio contiene esattamente quel record.
- Creazione manuale nel browser: profilo aperto immediatamente e un solo invito accodato. Pagina invito disponibile prima dell'attivazione, token rimosso dall'URL, validazione e focus dei campi vuoti verificati; nessuna password inserita tramite automazione UI.
- Evidenze e screenshot privati: `output/members-desktop-20261029/`. Nessuna email o modifica del profilo reale segnalato effettuata per il collaudo.

## Rilascio

Da completare dopo push: identificativo commit, pipeline/canary, corrispondenza degli asset pubblici e stato dei sette servizi runtime.

## Limiti e operazioni amministrative

- Il collaudo responsive usa viewport Chromium; non equivale a una prova su dispositivi Safari/iOS fisici.
- Per un socio creato prima di questo rilascio, aprire il profilo e usare Invia invito al socio. La sola pubblicazione del codice non invia retroattivamente email né attiva iscrizioni reali.
- L'accodamento dell'invito non certifica la consegna nella casella del destinatario; la consegna è responsabilità del worker email e del provider configurato.
