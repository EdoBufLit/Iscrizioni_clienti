# Account personale e Le mie tessere — 12 novembre 2026

## Comportamento

- Un account personale collega iscrizioni distinte. `Member` conserva ID, club, anagrafica, documenti, consensi, pagamenti, annualita, numero tessera e riferimenti Wallet/QR.
- `member_accounts` contiene email di accesso, password, versione credenziali e ultima iscrizione selezionata. Email uguali non provocano fusioni automatiche: le caselle condivise restano possibili. L'adozione dei profili legacy avviene al primo accesso verificato, senza backfill massivo dei dati.
- Le mie tessere elenca le iscrizioni collegate con club, numero, anno, scadenza e stato. La scelta del club cambia il contesto di tessera, documenti, prenotazioni e rinnovi. I profili in verifica sono visibili ma non selezionabili finche non sono accessibili.
- Il collegamento di un'iscrizione digitale esistente richiede associazione, numero e password valida dell'altra iscrizione. Un account gia collegato a piu iscrizioni non puo essere diviso da questo comando; e necessario l'intervento dell'assistenza. Non e stato introdotto un flusso self-service per tessere cartacee.
- Il cambio club invalida cache e tessera offline, aggiorna le altre schede e ricarica la dashboard. Offline rimane disponibile soltanto l'ultima tessera valida sincronizzata.
- Password e recupero password sono comuni alle iscrizioni collegate; la rotazione revoca tutte le sessioni e le prove precedenti. La cancellazione di un socio da un club non cancella l'account o le iscrizioni agli altri club.
- L'email di contatto dell'associazione e distinta dall'email personale di accesso, visibile in Profilo. I link spediti a un contatto diverso dall'email personale autorizzano soltanto l'iscrizione destinataria, senza elenco/cambio club o modifica della password comune.

## Migrazione e autorizzazioni

- Revisione Alembic `20261112_01_member_accounts`, successiva a `20261109_01_org_capacity`. Aggiunge tabella account, FK nullable `members.account_id` e scope nullable sulle prove di autenticazione.
- Nessuna rinumerazione, nessuna fusione per email/nome/codice fiscale e nessun invio automatico causato dalla migrazione. Le nuove API sono `GET /api/member/cards`, `POST /api/member/cards/{member_id}/select` e `POST /api/member/cards/link`.
- La selezione ricontrolla sul server proprieta, stato e versione credenziali. Il collegamento e registrato nell'audit e ruota le autorizzazioni per impedire che una prova emessa prima del collegamento acceda al nuovo insieme di club.
- Per un collegamento amministrativo eccezionale usare `ensure_member_account` e `link_member_to_account(..., trusted=True)` in una transazione con riscontri indipendenti e audit esplicito. Non duplicare numeri gia assegnati nella numerazione condivisa e non cambiare titolare sulla base della sola richiesta.

## Eccezione cartacea autorizzata

- Revisione additiva `20261112_02_paper_cards`: `card_namespace` distingue `digital` da `paper_exception` sia nel socio sia nello storico annuale. Il numero numerico resta conservato; il riferimento cartaceo viene mostrato con asterisco in area socio, amministrazione, presenze, esportazioni, email, PDF e Wallet.
- La numerazione cartacea e esclusa da occupazione, allocazione e rilascio del magazzino digitale. Il vincolo unico include il namespace. Lotto e scope della nuova cartacea restano vuoti; lo scope centrale del club resta invariato.
- L'import e riservato all'operatore, idempotente, con motivazione e audit. Non crea un incasso, non certifica pagamenti storici, non copia documenti o consensi e non invia email. Quota zero significa nessun nuovo addebito per questa digitalizzazione.
- QR digitali v1 e identita Wallet esistenti restano invariati. Le cartacee usano QR v2 firmati con namespace; il rinnovo digitale successivo conserva il vecchio riferimento cartaceo nello storico.
- La migrazione SQLite conserva anche figli con cancellazione a cascata, indici espressione e trigger; il downgrade rifiuta di fondere namespace quando esistono riferimenti cartacei.

## Verifiche prima del rilascio

- Backend completo definitivo: 1.244 test superati, 14 saltati, piu un test aggiuntivo del vero comando Alembic su SQLite. Sono inclusi account, cartacee, QR legacy, preferenza club, sessioni, rinnovi, rendering e Wallet.
- Frontend completo definitivo: 490 test superati. Build TypeScript/Vite/PWA riuscita.
- PostgreSQL 16.12 isolato sul solo schema di produzione: 18 controlli upgrade/downgrade/upgrade, preservazione di soci, numeri, credenziali e storico; 7 prove concorrenti, comprese revoche tra club, collegamenti concorrenti e rinnovo contro reset. Container e stage rimossi; inventario volumi invariato.
- Browser sulla build di produzione con 20 iscrizioni sintetiche, a 320x568, 390x844, 767x900, 768x900, 1024x768, 1440x900, 1440x600, chiaro/scuro. Elenco, stati, cambio tessera, QR, modale e documenti del club selezionato verificati. Una seconda scheda aperta sui documenti si aggiorna al nuovo club senza conservare i documenti del precedente. Nessun errore JavaScript o overflow orizzontale.
- Evidenze private in `output/member-accounts-20261112/`. Nessun dato personale reale usato nelle prove browser e nessuna email reale inviata.
- Estensione cartacea: browser ripetuto su tutti i layout, piu sei prove della cartacea marcata, verifica QR e download PDF reale. 21 scenari complessivi superati, inclusa seconda scheda. PostgreSQL: 25 controlli aggiuntivi sulla migrazione cartacea e sull'import, oltre ai 18 account e alle sette prove concorrenti. Test SQLite dedicati sulla migrazione cartacea superati.

## Caso segnalato e limite operativo

Il profilo Golden Age indicato dal cliente e stato trovato. Il numero comunicato per Frutta e verdura risulta gia assegnato a un'altra persona in Golden Age e non appartiene ai lotti del club richiesto. Dopo questo riscontro, l'utente ha autorizzato espressamente l'import cartaceo in namespace distinto con asterisco. L'applicazione dell'eccezione e prevista dopo il rilascio, con controllo di invariabilita dell'altro titolare, della vecchia tessera Golden Age e del magazzino.

## Rilascio

Da completare con commit, pipeline, migrazione e verifiche runtime dopo il deploy.
