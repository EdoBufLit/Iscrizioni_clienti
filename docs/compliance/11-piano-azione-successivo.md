# Piano di azione successivo (P3 e miglioramenti di prodotto)

> P3 indica miglioramenti strategici o di maturità: utili, ma non bloccanti per il rilascio dopo la chiusura e la verifica di P0, P1 e delle misure P2 essenziali. Non comprende il video di affiliazione.

## Prima del rilascio corrente

| Azione | Responsabile proposto | Evidenza di chiusura |
|---|---|---|
| Eseguire migrazioni su copia del database e poi in produzione | Tecnico | Alembic al singolo `head`, backup e rollback provato |
| Controllare pratiche legacy pendenti senza password | Tecnico + amministrazione | Conteggio, elenco minimizzato e recovery via email per gli eventuali casi |
| Verificare segreti, credenziali bootstrap e webhook Green API | Tecnico | Preflight superato senza segreti di default e smoke webhook autenticato |
| Approvare ruoli privacy, informativa e tempi di conservazione | Legale/DPO + titolari | Versione firmata, hash, DPA/ROPA coerenti |
| Eseguire smoke iscrizione, pagamento, tessera e org-admin | QA | Report automatico e browser senza regressioni |

## Entro 30 giorni

1. **MFA o passkey per super-admin e org-admin.** Priorità iniziale al super-admin, con codici di recupero e procedura di revoca. Criterio: accesso privilegiato impossibile con la sola password.
2. **Prova di ripristino backup.** Definire RPO/RTO, ripristinare database e file in ambiente isolato e verbalizzare tempi/esito. Criterio: prova completa almeno trimestrale.
3. **Monitoraggio e allarmi.** Alert su errori 5xx, login anomali, webhook rifiutati, outbox bloccate, cancellazioni fallite e scorte tessere. Criterio: allarme provato end-to-end e referente reperibile.
4. **Verifica accessibilità manuale WCAG 2.2 AA.** Tastiera, zoom 200/400%, contrasto e screen reader sui flussi iscrizione, pagamento, login, tessera e funzioni admin critiche. Criterio: issue tracciate, dichiarazione/canale feedback pubblicati se applicabili.

## Entro 60-90 giorni

1. **Conservazione automatizzata con legal hold.** Policy per pratiche incomplete/rifiutate, documenti, log, webhook e backup; simulazione prima della cancellazione. Criterio: report di cosa sarà eliminato, approvazione e audit dell'esecuzione.
2. **Gestione DSAR assistita.** Ricerca per interessato, esportazione dei sistemi coinvolti, checklist di identità e scadenze. Criterio: esercitazione completa senza includere dati di altri soci.
3. **Ruoli amministrativi granulari.** Separare gestione soci, contabilità, campagne e sola lettura. Criterio: matrice autorizzativa e test di isolamento per associazione.
4. **Rotazione programmata dei segreti.** Session key, provider, integrazioni e recovery documentato senza downtime evitabile. Criterio: prova in staging e registro della rotazione.

## Funzioni prodotto consigliate

- **Centro preferenze del socio:** revoca marketing già disponibile via link; estenderla a una pagina autenticata con cronologia essenziale e canali futuri separati.
- **Rinnovi e scadenze tessera:** promemoria configurabili, stato rinnovo e anteprima destinatari, senza invii promozionali impliciti.
- **Timeline operativa comprensibile:** eventi principali di pratica, pagamento, documenti e tessera visibili agli autorizzati, con dati tecnici minimizzati.
- **Correzione dati self-service controllata:** richiesta del socio, confronto prima/dopo e approvazione per i campi sensibili; nessuna modifica silenziosa al libro soci.
- **Dashboard qualità dati:** duplicati probabili, documenti in scadenza e pratiche bloccate, senza cambiare automaticamente lo stato dei soci.

Ogni funzione nuova deve partire da threat model, base giuridica/minimizzazione, criteri WCAG, test multiorganizzazione e piano di rollback.
