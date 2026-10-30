# Area socio, comunicazioni e pagine contabili — 30 ottobre 2026

## Area socio e documenti

- Il riepilogo presenta prima la tessera digitale, con comando Mostra QR, stato sintetico e Google Wallet. Artwork e verifiche della tessera invariati. Annualità, rinnovi e comunicazioni seguono la tessera; il pannello temporanea non compare quando la tessera corrente è valida.
- Lo stato considera anche scadenza e lifecycle della tessera: un workflow ancora active con card non_attiva non viene presentato come tessera valida e conserva i percorsi di rinnovo/temporanea.
- La navigazione mobile contiene Riepilogo, Prenotazioni, Documenti e Profilo. Esci è nel Profilo, con protezione dai doppi click e gestione degli errori; resta disponibile nell'header desktop.
- Documentazione offre il primo caricamento di identità e codice fiscale: scelta file e invio esplicito, controllo PDF/JPG/PNG e 10 MB, conferma e stato In verifica. Reinvio dei rigettati con note dell'associazione; i documenti approvati o in verifica non sono sovrascrivibili. Lo statuto occupa una sola riga con nome, dimensione effettiva e download.
- Gli upload dalla dashboard, dall'onboarding e dal percorso di correzione generano una notifica nel campanello Org Admin con collegamento a Soci → profilo → Documenti e note. Le notifiche restano isolate per associazione.
- Dopo approvazione/rigetto scompaiono Approva/Rigetta. Le decisioni sono protette anche sul server; retry identici non duplicano operazioni. Un documento sostituito resta nello storico e non riceve comandi per una nuova decisione.
- Il rigetto conserva le note, crea una notifica nel nuovo campanello socio e accoda l'email con link di correzione. Dal campanello si apre il documento interessato, anche quando Documentazione era già aperta; la pagina aggiorna i dati e porta il focus al documento.
- Per un rigettato corrente, l'Org Admin può usare Reinvia richiesta al socio: invito deduplicato, cooldown e rinnovo dei link scaduti senza cambiare note o decisione. L'interfaccia distingue email accodata, non disponibile, fallita e decisione già salvata.

## Editor comunicazioni super admin

- Formattazione con grassetto, corsivo, sottolineatura, evidenziazione, titoli, citazioni, elenchi, emoji e collegamenti. Immagini tramite URL HTTPS raster e descrizione obbligatoria; nessun nuovo hosting pubblico di file.
- Quattro stili: Comunicazione, Avviso, Stato dei servizi e Novità della piattaforma. Anteprima condivisa con storico e inbox Org Admin; email prodotta con gli stessi contenuti consentiti.
- Documento strutturato versionato, validato prima del salvataggio; 20.000 caratteri, 80 blocchi, 1.000 segmenti e sei immagini. Rendering React senza HTML arbitrario e HTML email costruito con escaping e allowlist. URL o proprietà non ammessi vengono rifiutati.
- Le comunicazioni esistenti restano testo semplice. Audience, revisione dei destinatari e idempotenza dell'invio conservate. Nessuna migrazione e nessuna nuova dipendenza.

## Quote, incassi, archivio e allineamenti

- Quote e rinnovi e Incassi e riconciliazione hanno KPI compatti, quattro su desktop e due per riga su telefono, intestazioni ridotte, ricerca e Filtri contestuali, campi completi e filtri applicati rimovibili.
- Quote usa schede mobili leggibili, conserva annualità e azioni economiche e mostra le operazioni massive solo dopo selezione. Durante il cambio di annualità non è possibile operare sulle vecchie righe; l'anno del pagamento viene fissato all'apertura del form. Solleciti dal 2027, senza anticipi, come già concordato.
- Incassi conserva saldi, abbinamenti, rettifiche e annullamenti; guida comprimibile e righe più dense. Le prove visuali comprendono pagatori e riferimenti lunghi e un incasso annullato.
- Movimenti → Archivio contabile segue il tema anche nell'intestazione: rimossa la fascia con gradiente bianco. Filtri in pannello, file a capo senza troncamento e azioni Visualizza/Scarica/Condividi accessibili. Permessi di anteprima, download e condivisione conservati. La ricerca mantiene il focus e scarta risposte obsolete.
- Org Admin usa un'altezza condivisa per brand laterale e banner, compresa la variante compatta Soci. Nel browser i rispettivi bordi inferiori coincidono. Super Admin usa un header con navigazione orizzontale, senza una seconda sidebar da allineare; verificato il layout esistente.

## Verifiche

- Backend completo: **1.077 passed, 13 skipped**. Frontend completo: **369 passed, 59 file**. Build TypeScript/Vite/PWA e review indipendenti concluse.
- Regressioni di sicurezza e concorrenza: ownership dei file, decisioni finali, deduplicazione email/notifiche, upload fuori dai lock, sessioni limitate, cambio profilo durante richieste pendenti, risposte tardive dopo upload, cambio annualità e anno del pagamento.
- Browser su dati sintetici: tessera e QR visibili senza scorrere a 390×844 e 320×568; a320 il blocco tessera termina a circa407px, prima della barra inferiore a463px. Branding preservato e pannello temporanea assente con tessera valida.
- Verificato l'intero giro socio → upload → campanello Org Admin → rigetto motivato → campanello socio → reinvio → approvazione. Due versioni conservate, una notifica di rigetto al socio, due notifiche upload agli amministratori e un'email di rigetto accodata con note e finalità di servizio. Nessuna consegna email reale nel collaudo.
- Editor verificato con formattazione, emoji, immagine HTTPS effettivamente caricata, anteprima server e destinatari. Nessun invio reale. Quote, Incassi e Archivio verificati su desktop1440 e telefono320/390, chiaro/scuro, con testi lunghi e senza overflow orizzontale.
- Evidenze private e screenshot: `output/member-area-20261029/`. I nomi/indirizzi e i documenti degli screenshot sono sintetici. Nessun profilo, incasso o comunicazione reale modificato per il collaudo.

## Rilascio e limiti

- Codice pubblicato su Main con `f8eb170eb5ecdba1901854b40558e9a5d3f14210`; pipeline 41128856669.
- 56 controlli HTTPS superati, inclusi hash degli asset effettivi di dashboard socio, editor e pagine contabili. Health pubblico200 con database disponibile; accesso anonimo a documenti/notifiche correttamente negato.
- Browser pubblico: `/dashboard/documenti` porta al login senza sessione, pagina utilizzabile e nessun errore console.
- Sette servizi runtime sul nuovo commit, healthy con zero restart/OOM; trasporto email normale configurato e schema invariato. Endpoint nuovi verificati nell'app distribuita, conteggi controllati in sola lettura su tre associazioni.
- Service worker attuale in BYPASS senza Age, con rivalidazione browser e CDN no-store; contenuto corrispondente alla nuova shell.
- QA locale arrestato, schede temporanee chiuse e viewport ripristinato. Pipeline build/deploy completata con successo; Final canary passed verificato nei log del job124315148519 alle22:16 del30ottobre2026 (Europe/Rome): servizi stabili, health200 e Alembic alla revisione prevista.

Le prove mobili usano viewport Chromium, senza dispositivo Safari/iOS fisico. Le immagini esterne devono essere pubblicamente accessibili e consentire l'incorporamento: un server terzo può impedirlo. L'accodamento email non certifica la consegna nella casella del destinatario. Nessuna migrazione, nessuna modifica alle integrazioni escluse o al vecchio `/api/join/continue`.
