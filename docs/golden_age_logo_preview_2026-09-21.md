# Golden Age Club: anteprima logo, 21 settembre 2026

Preparazione locale richiesta dall'utente, con screenshot prima della pubblicazione. Nessun dato live modificato e nessuna email inviata.

## Marchio

- Sorgente: `C:/Users/edoar/Downloads/MARCHIO_GAC-01.png`, PNG RGBA 12500x12500.
- SHA256 originale: `fee822deabc110850779fac1cff7d907e75c931ab5c65b6964ed8e8bc205beda`.
- Ritaglio dei soli margini trasparenti: x=815, y=2359, larghezza=10887, altezza=8073.
- Ridimensionamento proporzionale Lanczos a 2400x1780, senza ridisegno o alterazioni cromatiche.
- Asset: `app/static/card-logos/golden-age-20260921.png`, 432298 byte.
- SHA256 asset: `ca863a8f752aeb483c173b117a29869063f58189e6d2e778a8aedebe1da906d2`.

Il marchio mantiene la trasparenza originale. Il nome versionato evita la cache del vecchio file, che rimane disponibile per i riferimenti storici.

## Resa

La tessera conserva il fondo bordeaux, il logo ASSONAM, i dati del socio e il QR. Il marchio completo ha ora uno spazio centrale dedicato, con rapporto d'aspetto preservato e opacita piena.

PNG scaricabile, immagine incorporata nelle nuove email, PDF e anteprime area socio/amministratore usano lo stesso asset. I due identificatori Golden Age (`oasi-2`, `golden-age-club`) condividono il trattamento dedicato. Gli altri circoli mantengono il rendering standard.

Nell'anteprima web la geometria SVG scala con la tessera e non con il viewport; i nomi lunghi si adattano alla larghezza disponibile. Nel PDF i sette dati del retro sono affiancati al QR: prima oltrepassavano il bordo inferiore della tessera.

## Evidenze

Artefatti in `output/golden-age-preview-20260921/`:

- `anteprima-golden-age.png`: tavola con PNG, area socio mobile e fronte PDF.
- `tessera-golden-age.pdf`: fronte e retro su due pagine A4.
- `tessera-prima.png`, `tessera-fronte.png`: confronto effettivo con dati dimostrativi identici.
- `area-socio-*.png`, `admin-*.png`, `conferma-pubblica-*.png`: screenshot della build frontend reale, API simulate.
- `email-*.png`, `email-fallback-*.png`, `download-*.png`: template applicativi renderizzati nel browser.
- `browser-checks.json`, `admin-browser-checks.json`: misure di contenimento, logo e assenza di errori JS.

Le anteprime statiche si rigenerano con `.venv/Scripts/python.exe scripts/preview_golden_age_card.py`. Usano solo dati fittizi e rendering locale.

Verifiche completate: 58 test backend mirati, 12 test frontend, TypeScript, build frontend, compilazione Python e controllo whitespace. Browser da 320 a 1440 px, tema scuro, fronte/retro e nome lungo; admin e pagina pubblica a 390/1440 px; template email/download a 390/800 px. PDF renderizzato e ispezionato con Poppler.

La verifica dei template email non equivale a una prova su tutti i client di posta. Le email gia consegnate conservano la vecchia immagine incorporata; i nuovi invii utilizzeranno il nuovo logo dopo la pubblicazione.

## Rilascio

Anteprima approvata dall'utente il 21 settembre, con richiesta di rimuovere il riquadro scuro nella conferma finale. Correzione completata: wrapper trasparente, oro piu scuro solo nella pagina in tema chiaro tramite CSS e colore originale in tema scuro. Asset della tessera invariato. Screenshot di entrambi i temi in `conferma-logo-light.png` e `conferma-logo-dark.png`, verificati a 320/390/1440 px.

Rilascio completato su Main con commit `dc8c3f6902fdd88322cb6c27af230b1b56ad6ab8`; workflow `35613574587` concluso con successo, incluso canary finale. Nessuna modifica ai dati o allo schema database necessaria.

Verifica browser sul sito reale: logo 2400x1780 e SHA256 identico all'asset approvato, trasparenza del wrapper, filtro chiaro/scuro corretto, nessun overflow o errore JS. Vista finale aperta con token dimostrativo nella query, senza emissioni o invii. Screenshot live `conferma-logo-live-light.png`, `conferma-logo-live-dark.png` e tavola `conferma-confronto.png`.

PNG e PDF generati anche nel runtime distribuito con dati fittizi. Health HTTPS 200, DB OK, worker sani e zero riavvii; disco 39%, inode 9%. Backup verificato prima del rilascio; dettagli in `tasks/todo.md`.
