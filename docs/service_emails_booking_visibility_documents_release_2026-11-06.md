# Email di servizio, prenotazioni soci e Documenti — 6 novembre 2026

## Modifiche

- Email di accesso, recupero, rinnovo e modifica contatti uniformate al layout transazionale con pulsante, allineamento e wrapping mobile. Link completi mantenuti nel testo semplice. Aggiornamento selettivo dei tre preset globali di rinnovo ancora originali; modelli personalizzati e contenuti delle campagne preservati.
- La pubblicazione nell'area socio si configura per ciascun form in Impostazioni → Prenotazioni: nascosto, permanente oppure fino a una data italiana inclusa. I form preesistenti restano nascosti; storico delle prenotazioni invariato. Eventi passati, form non prenotazione, bozze e associazioni disabilitate sono esclusi dalle proposte.
- Nuove richieste di rinnovo disponibili dal 1 gennaio 2027, ore 00:00 Europe/Rome, con blocco server e interfacce coerenti su area socio, wizard pubblico e amministrazione. I pagamenti già avviati possono completarsi. Conservata la validità annuale fino al 1 gennaio incluso e scadenza dal 2 gennaio.
- Documenti Super Admin: archivio prioritario, conteggi compatti, ricerca e filtri, upload e configurazione in finestre su richiesta. Righe compatte su mobile, nome file completo e azioni nel dettaglio; preview, modifica ed eliminazione mantengono il contesto senza sovrapporre finestre.

## Verifiche

- Backend completo: **1186 passati, 13 saltati**. Frontend completo: **462 passati, 73 file**. Build produzione e controllo diff riusciti.
- Documenti: **108 controlli browser** su viewport 320/390/768/1024/1280/1440 px, temi chiaro/scuro. Nessun overflow orizzontale; archivio iniziale con almeno due righe complete, azioni e finestre utilizzabili. A390px tre righe generali e quattro contabili complete; a1280×720 tre righe complete. Preview PDF, ritorno al dettaglio, selezione destinatari e comandi verificati con dati sintetici.
- Email: **48 controlli browser** su otto messaggi, 320/390/768px, chiaro/scuro. Nessun URL esteso visibile nel corpo HTML né overflow. Nessun invio reale per collaudo.
- Prenotazioni: **14 verifiche browser**, inclusa pubblicazione effettiva dal form amministrativo e comparsa nell'area socio, scadenza e conservazione dello storico.
- Rinnovo: **8 verifiche browser**, blocco reale prima del lancio e disponibilità con data simulata dal gennaio2027, mobile/desktop; API409 e nessun avvio anticipato.
- Entrambe le migrazioni provate anche su PostgreSQL in schema temporaneo con rollback finale: default nascosto, date, idempotenza, conservazione dei preset personalizzati e upgrade/downgrade. Head attesa `20261105_02_renewal_email`.
- Review indipendente senza blocker. Evidenze locali in `output/corrections-20261105/`; nessuna modifica ai dati reali per QA. Non effettuato collaudo fisico su client email iOS.

## Pubblicazione

Deploy autorizzato su Main; esito pipeline, canary e controlli online da registrare dopo la pubblicazione.
