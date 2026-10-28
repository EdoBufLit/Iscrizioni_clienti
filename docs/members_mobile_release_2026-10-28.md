# Soci Org Admin: completamento mobile — 28 ottobre 2026

Completato il redesign lasciato da Gemini, preservando le sei modifiche locali iniziali e le regole sui solleciti già rilasciate. Baseline privata salvata prima degli interventi.

## Interfaccia completata

- Intestazione mobile compatta con numero dei risultati, aggiunta socio e menu delle azioni secondarie.
- Ricerca subito visibile; filtri avanzati nel pannello inferiore, conteggio dei filtri e pill rimovibili; scelte rapide Attivi, Da verificare, In scadenza e Tutti.
- Righe socio compatte con identità, tessera, email e stati pertinenti; selezione multipla esplicita, export/accesso e cronologia conservati. Branding delle tessere invariato.
- I due pannelli riusano ModalShell: focus contenuto, Escape, ritorno al comando di apertura e blocco dello sfondo. Chiusura passando a desktop; corpo scorrevole e comandi finali raggiungibili anche su schermi bassi. Controlli principali e checkbox con target di almeno 44 px.

## Problemi corretti prima del rilascio

- In scadenza apriva gli scaduti: introdotto il filtro reale delle tessere attive entro 30 giorni, con la stessa regola del KPI, inclusa la scadenza annuale legacy Europe/Rome.
- Da verificare usava un numero di documenti come numero di soci e perdeva le richieste senza documenti: nuovo conteggio deduplicato per socio, coerente col filtro. Include richieste in attesa e documenti pending/uploaded; esclude eliminati, rifiutati e stato scaduto. Mantiene la distinzione preesistente tra stato salvato e scadenza calcolata.
- Lista e selezione filtrata/bulk usano lo stesso query builder e mantengono l'isolamento tra associazioni. Nessuna nuova migrazione.
- Rimossi falsi avvisi di documenti mancanti basati sul solo conteggio zero. I documenti segnalati provengono da stato esplicito o workflow.
- Il booleano pagamento non viene presentato come prova di un debito: compare Quota da verificare soltanto con importo snapshot positivo e pagamento non confermato.
- Space sulla checkbox non apre più il profilo: link profilo e checkbox sono elementi separati. Termina selezione multipla azzera effettivamente gli ID.
- Ripristinata la corretta codifica degli accenti/commenti; nessun comando di sollecito nella pagina Soci.

## Prove

- Backend completo: **971 superati, 13 saltati**. Suite mirata finale filtri/KPI/bulk: **42 superati**, inclusi stato uploaded, deduplicazione, esclusioni, tenant estraneo e datetime aware.
- Frontend completo: **143 superati in 36 file**; TypeScript e build Vite/PWA riusciti. Precache 10 risorse / 1086,53 KiB; diff check e compileall riusciti.
- Review indipendenti funzionale/accessibilità e review finale del backend; nessun blocker residuo rilevato.
- Browser sulla build produzione locale con FastAPI e SQLite sintetico, senza mock nel percorso riuscito:390x844 chiaro/scuro,320x568,810x900 e1440x900. Primo elenco con 7 righe complete nel set di prova, nessun overflow orizzontale.
- Verificati filtri reali (2 soci da verificare con 4 documenti; 1 tessera in scadenza), pill/accesso/rimozione/reset/ordinamento, selezione da tastiera e sua terminazione, pannelli, focus e resize. Console senza errori.
- Pannello basso320x568: corpo 389 px con 646 px di contenuto scorrevole; footer raggiungibile entro 568 px. Focus circolare tra chiusura e comando finale; overflow del body ripristinato dopo chiusura/resize.
- Nessun invio, pagamento o modifica di profili reali per il collaudo. Backup protetto 600 con catalogo verificato: `before-members-mobile-20261028-170107.dump`, 188589208 byte.

## Rilascio

Commit `b96a79930da9f0eee94d96b457cee042612cae73` su Main, [pipeline 40732109356](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/40732109356). Build e deploy riusciti; canary finale superato e verificato nei log. Evidenze locali private in `output/members-mobile-20261028/`, fuori Git.

Controlli sulla versione aggiornata: 24 verifiche HTTPS riuscite, hash JS/CSS/chunk Soci corrispondenti alla build locale. Filtri review/expiring eseguiti in sola lettura sul PostgreSQL reale per tre associazioni, con controlli di isolamento e record eliminati. Sette servizi runtime sulla versione b96a799, tutti healthy, zero riavvii/OOM; schema invariato e 351 job Wallet completati al controllo. Disco 50%, circa 19 GB liberi; checkout deploy:deploy. Server QA locale fermato e browser ripristinato.

Limite: browser Chromium con viewport simulati, senza prove su Safari/iOS fisici. Eventuali export globali continuano a comprendere l'elenco completo; l'export dei selezionati mantiene il filtro della selezione.

## Seconda rifinitura Gemini, stesso giorno

Pubblicato su Main `e2cc1df48e88cd27b818d55b393be786db56f507`: intestazione mobile ridotta con nome associazione, toggle tema compatto, chip attenzione nascosti quando vuoti salvo filtro attivo, righe piu dense e meno badge ripetuti. Comportamento di filtri, selezione e collegamento al profilo conservato.

Review senza blocker; 143 test frontend in 36 file e build/typecheck riusciti. Browser 390x844 scuro/chiaro e 320x568: nessun overflow, pannello filtri/Escape e ripristino scroll riusciti. Ambiente sintetico chiuso, nessun invio reale. Evidenze private in `output/members-refinement-20261028/`.

[Pipeline 40758703512](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/40758703512): build e deploy riusciti, canary finale superato e confermato nei log. Controlli effettivi: 24 richieste HTTPS riuscite, hash asset uguali alla build, sette servizi sulla versione e2cc1df con zero riavvii/OOM, schema invariato. Nessuna modifica backend o migrazione.
