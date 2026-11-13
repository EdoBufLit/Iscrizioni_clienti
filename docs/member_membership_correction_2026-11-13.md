# Correzione temporanea in annuale — 13 novembre 2026

## Funzione

Org Admin e Super Admin possono aprire il dettaglio socio, scegliere **Correggi tipo tessera** e confermare **Annuale**. Il comando serve a correggere la scelta di una temporanea fatta per errore, anche prima dell'approvazione. Non introduce il passaggio inverso da annuale emessa a temporanea.

La domanda ancora in verifica conserva stato, decisione e iter di approvazione; non riceve un numero o una tessera per effetto della correzione. Una tessera già emessa conserva numero, anno, namespace, titolare e magazzino. La validità annuale segue l'anno già emesso: la correzione non è un rinnovo o una nuova emissione.

Il comando dedicato conserva quota registrata e pagamenti: non crea incassi, acquisti o nuovi debiti. Richieste di acquisto temporaneo, checkout con prenotazioni ancora aperte o rinnovi in corso devono essere risolti prima della correzione. Soci rigettati o eliminati restano esclusi. Una tessera di un'annualità ormai scaduta non viene resa attiva oggi cambiandone il tipo.

## API e controllo

- `PATCH /api/org-admin/members/{id}/membership-type`
- `PATCH /api/super-admin/members/{id}/membership-type`
- Corpo: `{"membership_type":"annual"}`.

L'Org Admin opera soltanto sui propri soci; il Super Admin usa lo stesso servizio e le stesse regole. Operazione transazionale con lock coerenti con i flussi tessere e pagamenti, sincronizzazione dello storico annuale per le carte emesse e audit dell'attore. Il replay non deve creare nuove righe di storico o audit.

Il comando non modifica credenziali, account personale, collegamenti ad altri club o documenti. Nessuna migrazione aggiuntiva richiesta.

Il QR firmato della tessera corrente conserva lo stesso token e riconosce il termine annuale risultante. Il ledger della vecchia temporanea e i QR di altre emissioni conservano stato e scadenza storici. I pass Wallet correnti mantengono il proprio `object_id` e vengono sincronizzati come annuali; i pass storici non vengono convertiti. Un termine annuale gia esistente conserva quota, valuta, provenienza e identita d'emissione.

## Collaudo e rilascio

- Backend mirato: 45 controlli su correzione, flusso profilo, storico e Wallet; 14 controlli QR e verifica tessera, incluso token invariato dopo la correzione.
- PostgreSQL16.12 isolato: 17 controlli su due correzioni concorrenti con un solo audit/termine, concorrenza nei due ordini con acquisto temporaneo, rollback, pending senza carta, account/pagamenti/stock invariati. Nessuna chiamata al provider; container rimosso e volumi invariati.
- Browser sulla build reale: otto scenari Org Admin/Super Admin, 390/1440px, chiaro/scuro, temporanea scaduta a runtime e domanda pending. Conferma, risposta API, mantenimento identita/quote/workflow e aggiornamento del dettaglio verificati; nessun errore JavaScript o overflow. Screenshot verificati.
- Frontend completo: 578 test passati; TypeScript e build produzione riusciti. Review indipendente finale su QR, Wallet, storico e autorizzazioni senza blocchi.

Rilascio e verifica produzione in corso. Nessuna correzione viene applicata a profili reali come prova.
