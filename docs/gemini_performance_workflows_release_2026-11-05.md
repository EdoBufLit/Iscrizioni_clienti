# Completamento reattività e flussi Gemini — 5 novembre 2026

## Perimetro completato

- Cache letture in memoria (30 secondi), deduplicazione, aggiornamenti in background con sottoscrizioni e prefetch su intento. Invalidazione prima/dopo mutazioni, ai cambi autenticazione e tra schede; risposte obsolete non ripopolano la cache.
- Layout pubblico, Home e Associazioni lazy; GSAP separato da motion/router; CSS esclusivo prenotazioni e Super Admin caricato dalle rispettive route. Polling sospeso quando nascosto/offline, senza sovrapposizioni. Aggiornamenti ottimistici di servizio, tavoli e notifiche con rollback e blocco doppi tap.
- Tessera offline limitata ai campi necessari, senza email/telefono/codice fiscale, associata alla sessione e con timestamp, durata massima e controllo scadenza italiana. Il QR mantiene la verifica autorevole server; la copia offline non attiva né rinnova tessere.
- Prenotazione rapida dai form attivi del proprio circolo, precompilazione attraverso stato router senza dati personali negli URL, mapping campi personalizzati e consensi non preselezionati.
- Timeline documenti/iscrizione nel riepilogo e, per i nuovi iscritti senza accesso ordinario, nel percorso esistente di completamento limitato. CTA al documento mancante, nessun ampliamento dei privilegi.
- Check-in con prenotazione confermata della giornata e serata realmente attiva; sala/tavolo, presenza e azione seduta. Controlli tenant, chiusure e associazione socio. Senza tavolo si apre l'assegnazione.
- Coda documenti dal KPI e da Soci; anteprime immagini/PDF autenticate, MIME consentiti, no-store e nosniff, decisioni con avanzamento e motivazione rigetto. Documenti già decisi non riproposti.
- Filtri salvati per amministratore/associazione, export XLSX coerente con ricerca/filtri e passaggio di tutti i destinatari al compositore campagne, senza invio automatico. Selezione paginata e mantenuta alla riapertura.

## Verifiche locali

- Suite backend completa: 1164 passati, 13 saltati.
- Suite frontend completa finale: 446 passati in 71 file.
- Build TypeScript/Vite/PWA riuscita, nessuna nuova dipendenza o migrazione.
- 70 screenshot delle superfici operative con browser reale a 320/390/768/1280/1440 px, entrambi i temi: tessera, prenotazioni, form precompilato, timeline limitata, coda documenti, segmenti Soci e Quote. Nessun overflow orizzontale o errore JavaScript nei percorsi collaudati.
- Ricaricamento PWA realmente offline con tessera e QR visibili verificato a 390 px; snapshot privo dei contatti. Prefill nome/email/telefono verificato nel form reale senza invio. Passaggio segmento al compositore verificato senza inviare campagne. Check-in, seduta con assegnazione preservata e apertura immediata del dettaglio mobile verificati; approvazione e rigetto con avanzamento reale della coda confermati.
- Collaudo con SQLite e utenti sintetici isolati su localhost:18171. Nessuna pratica, campagna, pagamento o anagrafica reale modificata per QA. Evidenze in output/gemini-completion-20261104.

- Altri 12 controlli browser su Home, Associazioni e login Super Admin, mobile/desktop chiaro/scuro, per validare layout lazy ed estrazione CSS.

## Limiti

- Offline richiede che la tessera sia stata sincronizzata online nella sessione; un nuovo dispositivo, sessione scaduta o storage disabilitato richiede rete. Restano i bypass PWA esistenti dei form pubblici; dopo apertura diretta di un form occorre risincronizzare l'area socio online prima di contare sul ricaricamento offline.
- Safari/iOS fisico non disponibile in questo collaudo. L'anteprima PDF inline dipende dal visualizzatore del browser, con apertura/download sempre disponibile.
- Restano chunk grandi dei builder email e Three.js, caricati sulle rispettive route; non attribuire al sito percentuali o tempi 4G non misurati.

## Pubblicazione

- Commit applicativo `0aa00f98d70be4fe1a3e2e7a8e9daa21df3b895e` pubblicato su `Main`.
- [Pipeline 41932497563](https://github.com/EdoBufLit/Iscrizioni_clienti/actions/runs/41932497563) e job deploy `126933321927` riusciti. `Final canary passed` verificato nel log alle **00:23:51 del 5 novembre 2026**, Europe/Rome.
- 74 controlli HTTPS e hash degli asset superati; altri 8 controlli browser live mobile/desktop senza overflow o errori JavaScript, inclusi login e gate socio/onboarding. Nessun invio o modifica di dati reali.
- Sette servizi applicativi healthy sull'immagine del nuovo SHA, zero restart/OOM. Schema invariato `20261026_06_member_bulk`, manutenzione annuale riuscita, nessuna migrazione o dipendenza nuova.
- Worker PWA aggiornato: 12 risorse di precache corrette, revisione HTML verificata sul file effettivo del server, CDN BYPASS senza Age. Le differenze di revisione locale dell'HTML derivano dai fine riga Windows; i chunk JavaScript/CSS verificati coincidono esattamente.
- Readiness server: disco 49%, inode 12%, footprint Docker controllato; nessuna pulizia distruttiva. Server QA locale fermato e browser headless chiusi.
- Evidenze, screenshot, log build/test, rapporti runtime/HTTPS/browser in `output/gemini-completion-20261104/`. La route `/version` non espone lo SHA: versione dimostrata da immagine dei container, repository server e hash degli asset.
