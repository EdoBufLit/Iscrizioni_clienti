# Cambio anno e rinnovi annuali — 1 novembre 2026

## Regole confermate

- Le tessere 2026 restano valide fino al 1 gennaio 2027 incluso, fuso Europe/Rome; scadono il 2 gennaio alle 00:00. Nessuna modifica alla durata delle temporanee.
- La chiusura disattiva soltanto i termini annuali. Conserva anagrafica, credenziali, documenti, storico, pagamenti, numeri e riferimenti tessera. La vecchia tessera resta 2026; una nuova 2027 viene emessa al rinnovo, secondo le regole dell'associazione.
- Il socio scaduto può accedere con password o link email, recuperare la password e richiedere il rinnovo; la scadenza continua a bloccare i servizi che richiedono una tessera attiva.

## Correzioni

### Scadenza automatica e recupero

Il worker persistente esegue la chiusura ogni 300 secondi nella configurazione attuale. Recupera tutte le annate scadute, anche dopo un fermo; transazioni separate, rollback e retry mantengono indipendenti chiusura e comunicazioni. Il calendario resta autorevole per QR e accessi anche a worker fermo. I rinnovi già emessi per il 2027 non vengono disattivati dal passaggio 2026.

Un `valid_until` storico non può prorogare un'annuale oltre la sua fine anno; può anticiparla. Date di QR, PDF e Wallet, controlli runtime e filtri SQL usano lo stesso limite italiano. Le tessere storiche non ereditano la scadenza della tessera nuova.

### Area socio e Org Admin

Il rinnovo seleziona il 2027 anche dopo più annualità saltate, senza emettere anni già scaduti. I record legacy senza termine annuale vengono ricostruiti dall'emissione esistente. Rifiuti e rinnovi annullati non vengono riaperti implicitamente. Dopo un rinnovo immediato l'area aggiorna la tessera; le attese offline e di magazzino mostrano uno stato esplicito.

Nel profilo Org Admin di un socio annuale scaduto compare `Rinnova tessera 2027`, diretto a Quote e rinnovi con filtro esatto sul socio. Il filtro rispetta l'associazione e vale anche per CSV. Pagamenti obbligatori e approvazione restano quelli configurati. Il pagamento manuale completo deve coincidere con la quota; acconti e rettifiche si gestiscono in Incassi. Un checkout online aperto impedisce il doppio incasso manuale. Il servizio ricontrolla le credenziali dopo l'attesa di un lock.

### Wizard pubblico

La modalità `Già socio? Rinnova` richiede un accesso oppure un link email monouso. Mostra anno e quota prima della conferma e usa lo stesso servizio dei rinnovi riservati. Anche il form completo e il checkout iniziale riconoscono il socio annuale scaduto prima di modificare dati o documenti. Il nuovo invio non cambia nome, password, documenti o storico e non crea una seconda anagrafica.

Sessione, email e associazione sono verificate; i link scadono, sono monouso e legati alla versione delle credenziali. Le richieste anonime non autorizzano emissioni. Il cambio di tipologia non permette di riscrivere un socio esistente tramite il form iniziale: passa dall'area riservata.

## Verifiche

- Test di confine italiano/UTC,1 gennaio incluso e 2 gennaio, recupero annate precedenti e retry/rollback.
- Conservazione dei dati Member, documenti, credenziali e stock; rinnovi futuri, temporanee e decisioni annullate.
- Matrice 54 combinazioni runtime/SQL per tipo, anno, scadenza esplicita e confine.
- Rinnovo da area socio, Org Admin e wizard; email proof, isolamento tenant, credenziali revocate, nessuna sovrascrittura pubblica, anno saltato, pagamento parziale e checkout aperto.
- Collaudo browser locale con data applicativa simulata 2 gennaio 2027 e soli dati sintetici. Nessun pagamento, messaggio o modifica a soci reali usato per QA.
- Flussi browser completati: area socio 2026→2027 con aggiornamento immediato della tessera; Org Admin→profilo scaduto→Quote sul solo socio→incasso 25 euro/saldo 0/tessera 2027; wizard anonimo→email di prova→verifica server monouso→conferma 2027→tessera dello stesso socio. Quattro anagrafiche e quattro documenti originali conservati; nessun duplicato. Layout 320/390/1440 px, chiaro/scuro.
- Il link di rinnovo completa la verifica e imposta la sessione direttamente sul server prima del redirect al wizard, evitando interferenze con sessioni amministrative già presenti nello stesso browser. Il link non consente redirect esterni e non viene consumato se l'associazione è stata alterata.
- Nessuna migrazione né nuova dipendenza.
- Suite finale: **1.125 test backend superati, 13 saltati; 387 frontend su 60 file**. Build TypeScript/Vite/PWA riuscita. Review indipendenti su chiusura, rinnovi, sicurezza del wizard e pagamenti.
- Dopo la richiesta UI, card di rinnovo compatta con identità, passaggio 2026→2027 e quota affiancati. A 320 × 568 px il pulsante di conferma termina a 401 px e quello per il link email a 346 px: nessun overflow orizzontale o scroll interno. Verificati anche 390 × 844 e 1440 × 900, chiaro/scuro. Il footer pubblico segue normalmente la pagina; le operazioni principali non richiedono di raggiungerlo.

## Condizione operativa prima del nuovo anno

La lettura della produzione del 1 novembre rileva 14 associazioni con soci annuali e **zero lotti abilitati 2027**. Precisazione dell'utente del 2 novembre: questa assenza è prevista, perché lo stock 2027 deriverà dai nuovi acquisti. I lotti 2026 si chiudono al cambio anno e i residui restano nello storico 2026; non vengono trasferiti né rimessi in circolo. Vedi [chiusura dei lotti per annualità](card_lot_year_closure_release_2026-11-02.md).

Se manca disponibilità, il rinnovo confermato/pagato rimane in attesa della tessera. Lo scheduler riprova dopo il rifornimento. Nessun lotto è stato creato o modificato durante il collaudo.

Runbook: [annual-membership-operations.md](annual-membership-operations.md).

## Rilascio verificato

- Codice pubblicato su `Main`: `557921493676e3cfd55b6db28f4f88549166501f`.
- [Pipeline 41354470461](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/41354470461) riuscita; job deploy 124991904270, `Final canary passed: services stable, health 200, Alembic at head` alle 23:02 del 1 novembre 2026 Europe/Rome.
- 61 controlli HTTPS e hash degli asset riusciti, comprese la nuova pagina pubblica, le API protette e i componenti precedenti. Verifica browser della pagina pubblica compatta con nessun errore JavaScript; nessun invio o accesso a soci reali per il collaudo.
- Sette servizi runtime sul nuovo SHA, tutti healthy e senza restart/OOM. Schema invariato `20261026_06_member_bulk`, permessi Git `deploy:deploy 775`.
- Il worker annuale ha eseguito realmente un ciclo con `ok=true`, `purged_count=0` e `destructive_purge_disabled=true`; intervallo 300 secondi. La scadenza 2026 in produzione è `2027-01-01T23:59:59.999999+01:00`.
- Server locale di collaudo fermato; schede temporanee chiuse e viewport ripristinato. Evidenze private in `output/annual-rollover-20261101/`.
