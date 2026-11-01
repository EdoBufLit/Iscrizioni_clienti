# Runbook annualità, rinnovi e tessere

> Stato tecnico: 1 novembre 2026. Questo documento descrive il comportamento applicativo e non autorizza da solo operazioni in produzione.

## Regola temporale

- Una tessera annuale 2026 resta valida fino al **1 gennaio 2027 alle 23:59:59 Europe/Rome**.
- Diventa inattiva dal **2 gennaio 2027 alle 00:00 Europe/Rome**.
- Le tessere temporanee non partecipano alla chiusura annuale.
- Un rinnovo 2027 può convivere con il termine 2026 il 1 gennaio: il verificatore sceglie un termine annuale valido senza invalidare anticipatamente quello precedente.
- Un eventuale `valid_until` esplicito può anticipare la scadenza annuale, mai posticiparla. La durata delle temporanee resta indipendente.

## Chiusura automatica

- Il worker persistente `low-cards-worker` esegue la manutenzione annuale ogni 300 secondi nella configurazione attuale, in una transazione separata dagli avvisi e dai rinnovi.
- La manutenzione recupera tutte le annualità scadute, anche dopo un fermo. Il controllo di validità di QR e accessi usa comunque il calendario italiano: la scadenza è efficace anche se il worker non è disponibile.
- Cambia soltanto lo stato dei termini annuali; non elimina né anonimizza soci, credenziali, documenti, pagamenti, storico o numeri tessera. Non rinomina la vecchia tessera 2026 in 2027: il nuovo anno viene emesso soltanto con il rinnovo.
- I rinnovi già emessi per il nuovo anno e le temporanee restano conservati. Il socio scaduto mantiene l'accesso al proprio account per rinnovare, senza recuperare i servizi riservati a una tessera attiva prima dell'emissione.
- Per il recupero manuale non distruttivo: `python -m app.maintenance`. Il vecchio wrapper che nomina la cancellazione ignora ogni richiesta di purge.

## Chiusura annuale Super Admin

1. Aprire `Super Admin → Chiusura annuale`.
2. Richiedere l'anteprima: contiene periodo, conteggi, organizzazioni e hash del perimetro.
3. Controllare che non siano incluse tessere temporanee e che l'anno sia quello atteso.
4. Eseguire il passaggio MFA/step-up recente.
5. Inserire la frase di conferma mostrata dalla UI ed eseguire una sola volta.
6. Conservare nel registro audit ID esecuzione, hash anteprima, conteggi ed esito.

Retry con lo stesso perimetro e chiave idempotente non deve produrre una seconda disattivazione. L'endpoint storico di manutenzione distruttiva risponde `410 Gone`.

La chiusura non elimina soci, documenti, pagamenti, numeri tessera, lotti o disponibilità; modifica soltanto lo stato operativo delle tessere annuali interessate.

## Rinnovo socio e Centro Quote

- Il socio vede scadenza, stato del rinnovo e notifiche di servizio nella propria area.
- Il comando mostra l'annualità corretta anche dopo più anni senza rinnovo, senza richiedere il pagamento di annate intermedie. La finestra di rinnovo anticipato esistente resta di 60 giorni.
- Le notifiche di scadenza/rinnovo sono comunicazioni di servizio e non dipendono dal consenso marketing.
- L'Org Admin usa il Centro Quote per distinguere soci in scadenza, da rinnovare, in lavorazione e rinnovati.
- Nel profilo di un socio annuale scaduto, `Rinnova tessera ANNO` apre Quote e rinnovi filtrato sul suo ID. Il filtro è applicato anche all'export e resta limitato all'associazione dell'admin.
- Per quote gratuite lo stato contabile è `not_required`; per quote dovute si usa il flusso previsto dall'organizzazione.
- Il pagamento manuale completo deve corrispondere alla quota; acconti e rettifiche passano da Incassi e riconciliazione. Un checkout online ancora aperto blocca un secondo incasso manuale.
- Il wizard pubblico offre `Già socio? Rinnova`. Un accesso esistente o un link email monouso prova l'identità prima della conferma; il form completo intercetta il socio annuale scaduto prima di modificare dati e documenti. Non crea una seconda anagrafica né sostituisce la password con quella digitata nella nuova domanda.
- Il rinnovo segue le regole dell'associazione: pagamento obbligatorio, approvazione manuale oppure emissione automatica. Un rinnovo senza disponibilità rimane confermato/pagato in attesa della tessera; lo scheduler riprova dopo il rifornimento.
- Occorre predisporre lotti abilitati per l'anno di rinnovo: la disponibilità residua del 2026 non è automaticamente trasferita al 2027 e i vecchi numeri non vengono rimessi in circolo.

## Rifornimento tessere e crediti

- L'Org Admin richiede il numero di tessere dalla pagina Tessere.
- La richiesta deve indicare l'anno del lotto: sono ammessi soltanto l'anno corrente e quello successivo; l'anno resta immutabile nello storico della richiesta.
- Il sistema verifica preventivamente la modalità di numerazione e crea atomicamente lotto e credito; nessun lotto parziale deve restare in caso di errore.
- Il valore è uno snapshot immutabile di **EUR 1,00 per tessera**.
- La stessa richiesta idempotente non crea due lotti o due crediti.
- Il Super Admin riceve notifica e gestisce `da pagare/pagato`, note e riferimento nella sezione Crediti tessere.
- Ogni modifica contabile aggiunge un evento audit; non riscrive lo storico.

## Modifica dei contatti del socio

- Il cambio telefono diventa effettivo soltanto tramite il link monouso inviato all'email corrente del socio.
- Il cambio email richiede due prove distinte e monouso: autorizzazione dall'indirizzo attuale e conferma sul nuovo indirizzo.
- L'unicità dell'email segue il perimetro operativo dell'iscrizione (`associazione + anno tessera`), quindi la stessa persona può usare il proprio indirizzo in associazioni diverse.
- Il valore proposto è cifrato mentre la richiesta è pendente e viene eliminato dopo conferma o cancellazione; audit e notifiche non devono riportarlo in chiaro.

## MFA e sessioni Org Admin

- L'MFA TOTP resta facoltativa e non modifica il login degli amministratori che non la attivano.
- Prima di mostrare o attivare il primo secret TOTP, il sistema richiede un codice monouso inviato all'email corrente: 5 minuti di validità, massimo 5 tentativi e autorizzazione legata alla singola sessione.
- Le sessioni possono essere consultate e revocate; l'eventuale reset MFA da parte del Super Admin revoca anche le sessioni esistenti.

## Controlli prima di un rilascio

- Alembic presenta una sola head e completa upgrade/downgrade/upgrade su database temporaneo.
- Test automatici: iscrizione auto-approvata, pagamento idempotente, QR/verifica/PDF/Wallet, Pienissimo, annualità al 1/2 gennaio, isolamento tenant, MFA/step-up, rinnovi, quote e rifornimenti.
- Frontend: test, typecheck e build production.
- Smoke solo senza addebiti reali; verificare che un socio nuovo riceva subito la tessera quando l'opzione auto-approvata è attiva.
- In produzione: backup verificato, migrazione, health check, log, spazio disco e rollback point prima di dichiarare concluso il deploy.

## Azioni vietate nel runbook

- Nessuna cancellazione globale di soci o PII durante la chiusura annuale.
- Nessun riuso o rilascio dei numeri tessera causato dalla chiusura globale.
- Nessuna modifica manuale diretta al database per forzare un rinnovo o un credito.
- Nessun test con pagamento reale.
