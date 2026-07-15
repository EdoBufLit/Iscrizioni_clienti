# Piano di conservazione e cancellazione

> Policy interna provvisoria adottata il 15 luglio 2026. I valori sono criteri risk-based; il termine contabile decennale va coordinato con art. 2220 c.c. e disciplina fiscale. Validazione formale: legale rappresentante/commercialista/DPO o consulente privacy.

| Categoria | Evento iniziale | Termine adottato | Metodo/eccezioni | Attuazione |
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
| DSAR e data breach | Chiusura | 5 anni | Registro ristretto e minimizzato | Registro organizzativo da creare |
| Backup rolling | Creazione | 60 giorni | Cifratura/accesso ristretto; niente ripristino fuori procedura | Backup esistente, rotazione/restore drill da formalizzare |

## Blocco noto da risolvere

La funzione di manutenzione annuale esistente può azzerare immediatamente dati identificativi dei soci annuali scaduti, mentre documenti/pagamenti collegati possono restare. Prima di schedularla in produzione occorre:

1. separare lo storico minimo del libro soci/tessera;
2. cancellare coerentemente documenti e payload non più necessari;
3. rispettare legal hold e richieste in corso;
4. eseguire una simulazione con conteggi aggregati e approvazione;
5. provare backup e ripristino senza reintrodurre dati scaduti nei sistemi operativi.

## Regole operative

- Ogni job deve produrre solo conteggi, ID tecnici e stato, mai il contenuto cancellato.
- Un errore genera retry, alert e ticket; nessuna cancellazione silenziosa parziale.
- Legal hold deve indicare motivo, ambito, approvatore, data inizio e riesame.
- Report trimestrale: candidati, cancellati, falliti, sotto hold e copie residue.
- Cambio termine = nuova versione, motivazione, approvatore e test.

Prossimo passo: modalità dry-run entro 31 agosto 2026; prima esecuzione solo dopo firma e restore drill.
