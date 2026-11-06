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
- Evidenze: `output/enrollment-qr-20261106/qa-report.json`, screenshot e PNG scaricati nella stessa directory. Nessuna modifica a dati reali per il collaudo. Deploy successivamente autorizzato dall'utente dopo le anteprime; esito da registrare a conclusione del rilascio.
