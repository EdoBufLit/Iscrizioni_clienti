# Chiusura dei lotti per annualità — 2 novembre 2026

## Regola applicata

Dal **1 gennaio 2027 alle 00:00 Europe/Rome** tutti i lotti 2026 risultano chiusi, anche se hanno tessere residue. Restano nello storico 2026: anno, numeri, quantità, contatori, ordini, incassi, crediti e prenotazioni non vengono trasferiti o cancellati. Lo stock 2027 deriva dai nuovi acquisti per quell'anno; la sua assenza prima degli acquisti è prevista.

Le tessere già emesse sono indipendenti dall'apertura del lotto: quelle annuali 2026 conservano la validità fino al 1 gennaio 2027 incluso, come confermato dall'utente. Le temporanee già emesse mantengono la loro durata.

## Implementazione

- Guardie calcolate sul calendario italiano impediscono l'assegnazione da lotti passati anche se il worker non è ancora intervenuto o qualcuno prova a riabilitarli.
- Lo scheduler chiude i lotti prima della manutenzione delle tessere, con transazioni separate per associazione, rollback e retry. Modifica soltanto `is_enabled=False`; non imposta `released_at`, non libera numeri e non annulla checkout.
- L'anno di qualunque lotto esistente è immutabile, anche se inutilizzato. Le API bloccano riapertura, cambio anno, modifica dei numeri ed eliminazione dei lotti di annualità concluse. Sono bloccate anche nuove aperture manuali di annualità già passate.
- Un ordine 2026 processato dopo il cambio anno conserva il suo anno e genera soltanto un lotto 2026 già chiuso. Non diventa un acquisto 2027.
- Una prenotazione di pagamento 2026 non può più emettere una nuova tessera dal lotto chiuso. Un incasso confermato resta registrato con i suoi riferimenti per la verifica amministrativa; nessun trasferimento automatico di denaro o tessere al 2027.
- Anno predefinito e prossima chiusura usano Europe/Rome anche nell'ora in cui l'Italia è già nel nuovo anno e UTC è ancora nel precedente.
- Org Admin e Super Admin vedono `Chiuso per annualità`, con filtri dedicati e residuo storico esplicitamente non utilizzabile. Le azioni incompatibili sono nascoste; i riepiloghi dello stock disponibile escludono i vecchi lotti.

## Verifiche

- Confine italiano al microsecondo, anno UTC precedente, recupero annate vecchie, retry idempotente, rollback isolato per associazione.
- Snapshot invariato di soci, documenti, annualità emesse, range, contatori, ordini, crediti e prenotazioni; nessun rilascio o riutilizzo.
- Guardie di assegnazione e checkout prima del worker; incasso tardivo conservato senza emissione; API di modifica/eliminazione/creazione, filtro tenant e metadati di chiusura.
- Browser reale con dati sintetici: lotto 2026 chiuso e 52 tessere residue, leggibile su desktop e 390 px senza overflow. Nessun dato o messaggio reale usato nel collaudo.
- Nessuna migrazione né dipendenza nuova. Runbook aggiornato in [annual-membership-operations.md](annual-membership-operations.md).

Suite finale: **1.141 test backend superati, 13 saltati; 392 test frontend su 61 file**, build TypeScript/Vite/PWA riuscita. Review indipendente completata.

## Rilascio verificato

- Codice pubblicato su `Main`: `0a91388e32ac29124e65c490ca34a7d24d731f6c`.
- [Pipeline 41533150681](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/41533150681) e job deploy 125579084885 riusciti. `Final canary passed` verificato alle 23:05 del 2 novembre 2026 Europe/Rome.
- 62 controlli HTTPS e hash degli asset superati. Sette servizi sul nuovo SHA, tutti healthy, con zero restart/OOM. Schema invariato `20261026_06_member_bulk`.
- Il job di chiusura lotti ha eseguito il primo ciclo con successo e zero errori; la lettura della produzione conferma zero lotti di annualità precedenti ancora abilitati. Le tessere 2026 restano valide fino al 1 gennaio 2027 incluso; nessuna cancellazione di soci o dati.
- Server QA fermato, schede temporanee chiuse e viewport ripristinato. Evidenze private in `output/lot-closure-20261102/` e screenshot in `output/annual-rollover-20261101/closed-lot-mobile.jpg`.
