# Azioni Soci e calendario solleciti — 27 ottobre 2026

## Correzione richiesta

Semplificare il blocco delle azioni multiple in Org Admin → Soci e togliere i solleciti quota dalla lista. Mantenerli in Quote e rinnovi a partire dal 2027, senza sollecitare adesso annualità future mentre le tessere sono ancora valide.

## Interfaccia

- Barra compatta con selezione pagina e conteggio; Esporta, Invia accesso e Azzera compaiono soltanto quando esiste una selezione.
- Eliminati selettore dell'annualità e pulsante sollecito dalla pagina Soci. Azioni esplicite del contesto: export/accesso in Soci, solleciti in Quote e rinnovi.
- Cronologia raccolta in un solo pulsante; ultima operazione e operazioni precedenti all'interno del pannello espandibile. Un sollecito recuperato dalla cronologia Soci resta consultabile, con collegamento a Quote e rinnovi; non è eseguibile da Soci.
- “Seleziona tutti i risultati” compare solo se estende la selezione oltre la pagina o ripristina esclusioni. Conservati selezione tra pagine, esclusioni e anteprima/conferma prima dell'invio.
- Desktop su una riga quando lo spazio lo permette; telefono con azioni e cronologia disposte senza sovrapposizioni. Corretto anche il fondo delle schede socio mobile, usando superfici del tema invece del bianco traslucido in dark.
- Branding delle tessere invariato.

## Regole dei solleciti

- Nessun sollecito quota nel 2026. Annualità consentite dal 2027 fino all'anno corrente, calcolato in Europe/Rome.
- Quote e rinnovi non propone automaticamente l'anno successivo dopo il 2027. Annualità future consultabili, ma senza checkbox/comandi di sollecito.
- Guard condiviso del server su anteprima, esecuzione, retry e API manuale: 409 se l'annualità non è ancora iniziata o precede il 2027. Il vincolo vale anche per anteprime salvate prima della correzione.
- In anteprima e prima di ogni accodamento si ricontrolla la validità della tessera dell'annualità precedente. Se è ancora valida, il socio viene escluso con motivo.
- Promemoria automatici di rinnovo senza più anticipo a 60/30/7 giorni: soltanto dopo la scadenza, con deduplicazione. Il worker mantiene le operazioni di assegnazione/attivazione tessere.
- La validità annuale esistente comprende tutto il 1° gennaio dell'anno successivo. Per una tessera annuale 2026 standard il primo giorno successivo alla scadenza è quindi il **2 gennaio 2027**. La regola di validità non è stata cambiata.

## Verifica prima del rilascio

- Backend completo: **968 superati, 13 saltati**; frontend completo: **139 superati in 35 file**. Build TypeScript/Vite/PWA riuscita; diff check e scansione delle stringhe modificate riusciti.
- Regressioni: anticipo nel 2026, annualità futura, confine UTC/Europe-Rome, 1 gennaio ancora valido e 2 gennaio scaduto; vecchie anteprime/retry; API manuale; saldo effettivo e rinnovo già completato.
- Regressioni UI: Soci senza solleciti, barra vuota senza azioni disabilitate, selezione tra pagine, selezione globale, storia/ripresa e sollecito storico consultabile ma non eseguibile da Soci anche nel 2027.
- Browser su build produzione locale con FastAPI/SQLite e dati sintetici: 1440/1280 desktop, 640 tablet e 390/320 telefono, temi chiaro/scuro. Nessun overflow orizzontale; tutti i pulsanti entro la barra, touch target almeno44px.
- Prova reale isolata: tre selezionati conservati alla pagina successiva; tutti32 poi esclusione a31; cambio ricerca azzera; anteprima accessi3 senza confermare. Database locale: una preview, zero email accodate. Nel 2026 Quote e rinnovi non espone comandi o checkbox di sollecito.
- Review indipendente: risolti esecuzione dalla cronologia fuori contesto e conflitto responsive al pixel640; nessun ulteriore blocker rilevato.
- Produzione prima del rilascio, lettura aggregata: nessun `membership_fee_reminder` o `renewal_reminder` pendente/in invio. Nessun invio, pagamento o profilo reale modificato per il collaudo.
- Backup protetto600: `before-members-toolbar-20261027-203346.dump`, 188565256 byte, catalogo1154 voci verificato. Nessuna nuova migrazione in questa correzione.

## Rilascio

Commit applicativo `bfa9049756eec8a55ef019fc4b835194e2a2f915`, pubblicato su Main con la [pipeline 40579910901](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/40579910901). Build e deploy riusciti; canary finale di stabilità superato, verificato anche nei log del job.

Controlli dopo avvio: 24 richieste HTTPS pubbliche riuscite, hash di JS/CSS e chunk Soci/Quote/Bulk uguali alla build locale, sette servizi runtime healthy con zero riavvii/OOM. Regole del calendario importate dall'immagine effettivamente in esecuzione e verificate in sola lettura: 2026 bloccato, annualità pre-2027/future bloccate, confine Europe/Rome corretto. Schema invariato alla head `20261026_06_member_bulk`; 346 job Wallet completati. Nessun sollecito pendente prima o dopo il rollout. Disco 53%, circa 17 GB liberi, permessi checkout deploy:deploy. Server locale QA fermato e browser ripristinato.

Evidenze e screenshot locali in `output/members-toolbar-20261027/`, esclusi da Git.

Limiti: browser Chromium con viewport simulati, senza dispositivi Safari/iOS fisici; nessun nuovo invio email a soci. I messaggi già consegnati prima della correzione non vengono modificati.
