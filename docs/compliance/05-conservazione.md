# Piano di conservazione e cancellazione

> Proposta tecnica interna aggiornata il 18 luglio 2026, da approvare formalmente prima di considerarla policy dell'ente. I valori sono criteri risk-based; il termine contabile decennale va coordinato con art. 2220 c.c. e disciplina fiscale. Validazione richiesta: legale rappresentante, commercialista e DPO o consulente privacy, se nominati.

| Categoria | Evento iniziale | Termine proposto | Metodo/eccezioni | Attuazione |
|---|---|---:|---|---|
| Pratica iniziata ma non presentata | Ultima attività | 30 giorni | Cancellazione, salvo richiesta/hold | Da automatizzare |
| Pratica presentata e chiusa/rifiutata | Decisione finale | 180 giorni | Cancellazione/anomizzazione; hold per contestazione | Parziale |
| Documento di identità | Verifica/decisione finale | 30 giorni | Eliminare file/copie; mantenere solo esito minimo | Outbox disponibile; policy da schedulare |
| Profilo socio operativo | Cessazione rapporto | 12 mesi | Poi separare/anomizzare dati non necessari | Da implementare |
| Storico minimo libro soci/tessera | Cessazione rapporto | 10 anni | Archivio ristretto: identità minima, periodo, numero/stato | Da separare dalla manutenzione attuale |
| Pagamenti e documenti contabili | Ultima registrazione/chiusura esercizio | 10 anni | Più a lungo per accertamento/contenzioso | Da verificare con commercialista |
| Payload provider pagamento | Stato terminale | 90 giorni | Minimizzare; conservare record contabile separato | Da automatizzare |
| Preferenza marketing | Revoca/fine finalità | Stop immediato | Nessun invio ulteriore | Implementato |
| Prova consenso/revoca | Ultimo invio o revoca | 5 anni | Registro minimizzato; hold per reclamo | Implementato nel DB, purge da pianificare |
| Suppression list | Revoca | Finché necessaria a evitare invii | Solo identificativo/hash e prova minima; rimuovere con nuovo consenso valido | Da formalizzare |
| Campagne e delivery | Chiusura campagna | 24 mesi | Aggregare/anomizzare statistiche successive | Da automatizzare |
| Form submission | Chiusura/review | 12 mesi | Prima se finalità esaurita; hold se contestata | Da automatizzare |
| Prenotazione | Data evento | 24 mesi | Minimizzare note/testi liberi | Da automatizzare |
| Chat/messaggi WhatsApp | Ultima attività | 180 giorni | Allegati anche prima se non necessari | Da automatizzare |
| Webhook grezzo | Stato terminale | 7 giorni | Conservare solo evento normalizzato minimo | Da automatizzare |
| Log applicativi | Creazione | 30 giorni | Rotazione; niente PII in chiaro | Redazione implementata, retention da verificare host |
| Log sicurezza | Creazione | 90 giorni | Hold per incidente | Da configurare/monitorare |
| Audit amministrativo | Creazione | 24 mesi | Hold per contenzioso | Da automatizzare |
| Token/sessioni scaduti | Scadenza/revoca | 30 giorni | Cancellazione hash/token e metadati non necessari | Da automatizzare |
| Modifica email/telefono socio | Conferma/cancellazione/scadenza | Valore proposto eliminato subito dopo conferma/cancellazione; richiesta scaduta entro 30 giorni | Conservare soltanto campo, esito, date e prova audit minimizzata; per l'email registrare l'esito delle due prove senza indirizzi/token in chiaro | Wipe conferma/cancellazione e doppia prova vecchia/nuova email implementati; purge scaduti da schedulare |
| Import CSV soci in staging | Commit/rollback o ultima attività | Payload eliminato subito a commit/rollback; anteprima abbandonata entro 7 giorni | Dati cifrati fino alla decisione; conservare conteggi/esito batch minimizzati | Wipe commit/rollback implementato; purge abbandonati da schedulare |
| Notifiche socio su rinnovi/scadenze | Invio/lettura | 24 mesi | Poi aggregare o cancellare; hold per contestazione | Da automatizzare |
| Richieste lotti e crediti tessere | Chiusura contabile | 10 anni | Snapshot quantità/prezzo, eventi pagato/da pagare e rettifiche; validare col commercialista | Registro append-only implementato; purge non previsto prima della validazione |
| DSAR e data breach | Chiusura | 5 anni | Registro ristretto e minimizzato | Registro organizzativo da creare |
| Backup rolling | Creazione | 60 giorni | Cifratura/accesso ristretto; niente ripristino fuori procedura | Backup esistente, rotazione/restore drill da formalizzare |

## Controllo annuale non distruttivo

Il rischio della precedente manutenzione globale distruttiva è stato chiuso a livello applicativo. L'endpoint storico non è più eseguibile; la nuova operazione annuale:

1. mostra un'anteprima con conteggi e impronta immutabile del perimetro;
2. richiede sessione super admin con autenticazione recente e frase di conferma;
3. è idempotente e disattiva soltanto le tessere annuali del periodo indicato;
4. non tocca tessere temporanee, anagrafica, documenti, pagamenti, numeri tessera o stock;
5. conserva termini annuali distinti, così il rinnovo non sovrascrive lo storico.

Questa disattivazione non è un job di retention e non cancella dati personali. L'eventuale cancellazione successiva deve restare in un processo separato con termini approvati, legal hold, report e prova di ripristino.

## Regole operative

- Ogni job deve produrre solo conteggi, ID tecnici e stato, mai il contenuto cancellato.
- Un errore genera retry, alert e ticket; nessuna cancellazione silenziosa parziale.
- Legal hold deve indicare motivo, ambito, approvatore, data inizio e riesame.
- Report trimestrale: candidati, cancellati, falliti, sotto hold e copie residue.
- Cambio termine = nuova versione, motivazione, approvatore e test.

Prossimo passo: approvare formalmente termini e responsabilità, implementare i job di purge ancora indicati come “da schedulare” e provare legal hold/restore drill prima della prima cancellazione automatica.
