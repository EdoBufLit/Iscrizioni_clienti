# QR iscrizione associazioni — 6 novembre 2026

## Funzione

- Org Admin: Associazione / QR iscrizione (`?tab=qr`).
- Super Admin: Associazioni / Setup / QR iscrizione.
- Anteprima locandina con invito e nome pubblico del club, copia link, download locandina PNG a 1200px di larghezza e solo QR PNG.
- Nome pubblico risolto con la stessa funzione usata dal branding esistente, fallback alla denominazione dell'associazione. Nomi lunghi a capo, testo XML escapato e dimensione adattata.
- Il link usa `FRONTEND_URL`, con fallback `BASE_URL`, e `/associazioni/{slug}/iscrizione`. Il codice viene generato localmente: nessun provider esterno, dipendenza o migrazione aggiunta.
- Endpoint autenticati `GET /api/org-admin/organization/enrollment-qr` e `GET /api/super-admin/organizations/{id}/enrollment-qr` (anche alias `/api/admin`). L'Org Admin non può selezionare un'altra organizzazione.
- Interfaccia con token tema esistenti; fondo bianco e margini di quattro moduli del QR preservati in entrambi i temi. Azioni QR indipendenti dal salvataggio delle impostazioni.

## Verifica

- Frontend: 469 test su 74 file superati; test del componente ripetuti dopo la rifinitura tipografica: 5/5.
- Backend: 7 test QR/paginazione associazioni superati, inclusi autenticazione, isolamento organizzazione, alias, admin disabilitato, club inesistente, origine configurata e nome pubblico. Prima del deploy autorizzato, suite completa: 1190 passati e 13 saltati.
- Build produzione, TypeScript e generazione PWA riusciti. Solo avvisi preesistenti Browserslist/chunk grandi e deprecazioni Python.
- Browser locale con sessioni autenticate e database sintetico isolato: entrambi i ruoli a 320/390/768/1440px, chiaro/scuro. Quattro download reali (locandina/QR per ciascun ruolo) decodificati con ZXing e confrontati con il link mostrato.
- Evidenze: `output/enrollment-qr-20261106/qa-report.json`, screenshot e PNG scaricati nella stessa directory. Nessuna modifica a dati reali per il collaudo. Deploy successivamente autorizzato dall'utente dopo le anteprime e completato come documentato sotto.


## Pubblicazione

Commit applicativo `f89bd9d2636516201b1bafbba6f6eac4083a72ae` pubblicato su `Main`. [Pipeline 42283958189](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/42283958189), build 128119840463 e deploy 128120734968 conclusi con successo. **Final canary passed alle 21:02:58 del 6 novembre 2026 Europe/Rome**: servizi stabili, health 200, Alembic a head.

- 23 controlli HTTPS superati: 11 asset con SHA256 identico alla build locale, inclusi componente QR, impostazioni Org Admin e Associazioni Super Admin; health/database corretti, iscrizione Jappa 200, tre endpoint QR protetti 401 senza sessione.
- 12 smoke browser pubblici superati su Associazioni e login dei due ruoli a 390/1440px nei temi chiaro/scuro, senza overflow o errori JavaScript.
- QR generato dal servizio della nuova immagine in una transazione PostgreSQL READ ONLY e decodificato con ZXing: `https://assonam.it/associazioni/jappa-club/iscrizione`.
- Sette servizi applicativi healthy sulla nuova immagine, zero restart/OOM, schema invariato `20261105_02_renewal_email`. `/version` non espone lo SHA per configurazione preesistente: versione confermata tramite immagine Docker e hash degli asset.
- Nessun dato reale modificato per QA. Verifica autenticata dei due ruoli e download locandina eseguiti localmente con dati sintetici; verifiche online limitate alle letture indicate.

Evidenze: `output/enrollment-qr-20261106/workflow-release.json`, `runtime-final.json`, `public-release.json`, `live-browser-report.json`, `live-generated-qr-report.json` e screenshot nella stessa directory.
