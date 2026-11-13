# Comunicazioni centrali WhatsApp — 13 novembre 2026

## Comportamento

La pubblicazione Super Admin conserva email e campanella e accoda un avviso WhatsApp per ciascuna associazione destinataria con amministratore attivo e numero `whatsapp_e164` valido. Il mittente e il bot tessere restano quelli esistenti. Nell'anteprima sono indicati gli avvisi programmati e le esclusioni; il dettaglio mostra gli stati reali della coda.

Il template `nuova_comunicazione`, Content SID `HX87903e68c43b597b9d25dc4050b6dc0d`, risulta approvato da Meta come Marketing. L'invio valorizza sempre entrambe le variabili: `1` nome associazione, `2` solo ID numerico della comunicazione. Il pulsante usa `https://assonam.it/org-admin/comunicazioni-assonam?message={{2}}`. Il valore di esempio URL salvato su Twilio non viene usato per invii reali.

La configurazione applicativa usa `TWILIO_CENTRAL_COMMUNICATION_CONTENT_SID`, trasportata dalla variabile GitHub Actions omonima al bundle privato e all'ambiente condiviso dei servizi. Non sono state cambiate impostazioni del mittente, Messaging Service, webhook o flussi Studio esistenti.

## Affidabilità e accesso

La nuova tabella `affiliate_communication_whatsapp` partecipa alla transazione di pubblicazione: nessuna richiesta al provider prima del commit. Il vincolo comunicazione/associazione e il replay della pubblicazione evitano duplicazioni. Il worker WhatsApp esistente elabora la coda separatamente dai webhook, con batch centrale limitato a cinque.

Prima dell'invio sono ricontrollati associazione, numero, destinatario e amministratore. Soltanto HTTP429 viene ritentato automaticamente, al massimo tre tentativi. Timeout, risposte ambigue o interruzioni diventano esiti da verificare e non generano reinvii ciechi. `accepted` significa accettazione da Twilio, non conferma di consegna: la UI conserva questa distinzione. Numeri, errori grezzi del provider e dati di consegna non sono esposti all'Org Admin.

Il collegamento alla comunicazione attraversa login con codice, link email anche in nuova scheda e MFA. La destinazione è esplicita e validata sia frontend sia backend, limitata ai percorsi operativi Org Admin; login, callback e destinazioni esterne sono escluse.

La migrazione `20261113_01_central_whatsapp` è additiva e non genera notifiche retroattive. Il campione tecnico ID1 resta senza destinatari e invii.

## Verifiche prima del rilascio

- PostgreSQL16.12 isolato: 29 controlli su upgrade/downgrade/upgrade, preservazione dati base, assenza di backfill, indici/vincoli/CASCADE, rollback/replay e tre worker concorrenti con una sola chiamata al provider simulato. Container eliminato e volumi invariati.
- Browser sulla build reale e backend sintetico: pubblicazione, anteprima, invio simulato e storico a390/1440px, chiaro/scuro; deep link dopo codice e link email in nuova scheda. Sei scenari passati, senza errori JavaScript o overflow orizzontale. Screenshot verificati.
- Nessuna prova reale inviata alle associazioni. Il collaudo usa contatti sintetici, email in modalità test e un client WhatsApp simulato.

## Esito finale

Frontend finale: 578 test passati, TypeScript e build produzione riusciti. Rilascio e verifiche produzione da completare insieme alla correzione del tipo tessera richiesta durante il lavoro.
