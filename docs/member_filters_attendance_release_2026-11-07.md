# Filtri soci e ricerca Presenze — rilascio 7 novembre 2026

## Modifiche

- Filtri soci Org Admin: stili condivisi desktop/mobile per gruppi, chip, selezione e footer. Finestra centrata da768px e larga al massimo672px; mobile con pannello inferiore e dimensioni precedenti. Scroll locale e footer accessibile anche su desktop basso.
- Presenze: sola ricerca manuale socio centrata da768px e inferiore su mobile. Neutralizzati i margini verticali ereditati dalla pagina per entrambi gli overlay.
- Nessun cambiamento a filtri/API, scansioneQR, postazioni scanner o registrazione ingressi. Nessuna migrazione aggiunta.

## Verifiche prima del rilascio

- Suite frontend completa:469test su74file superati; build TypeScript/Vite/PWA e review indipendente riuscite.
- Browser sulla build produzione con sessione locale autenticata e database sintetico:14layout filtri e12ricerca Presenze nei due temi, da320a1440px, inclusi767/768px e altezza600px.
- Filtri: centratura/posizione mobile, wrapping e bordi chip, footer visibile, ultimo ordinamento raggiungibile con scroll, filtro accesso con rispostaAPI200, reset, applicazione, Escape.
- Presenze: posizione verificata prima e dopo ricerca senza risultati, chiusura conEscape e pulsante; nessun ingresso registrato. Nessun overflow o erroreJavaScript rilevato.

## Pubblicazione e verifiche online

Commit applicativo `0a769b68b80bd9e0b0dedd35d3afefab784fdbeb` su `Main`. [Pipeline42310103403](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/42310103403), build128209129170 e deploy128209889725 completati con successo. Il job di deploy include il canary finale, saluteHTTP200 e revisioneAlembic a head.

- 37controlliHTTPS superati, inclusi25asset conSHA256 identico alla build locale: entrypoint, CSS e chunk OrgAdminMembers/OrgAdminAttendance con dipendenze. Salute applicazione e database regolari.
- 12controlli browser pubblici:Associazioni e login Org/SuperAdmin a390/1440px nei temi chiaro/scuro, senza errori o overflow.
- Sette servizi applicativi healthy sulla nuova immagine, zero riavvii/OOM. Disco51%, inode13%; risorseDocker verificate. Nessuna modifica a dati reali.
- La verifica autenticata dei pannelli è stata eseguita localmente su dati sintetici; online sono stati verificati gli asset identici, le pagine pubbliche e lo stato dei servizi. `/version` non espone loSHA nella configurazione corrente: versione confermata tramite immagineDocker, checkout server e hash degli asset.

Evidenze locali: `output/member-filters-20261106/`, reportQA, screenshot, logbuild/test, `workflow-release.json`, `public-release.json`, `runtime-final.json`, `live-browser-report.json`.
