# Procedura data breach

## Ruoli e contatti

- Incident owner provvisorio: **legale rappresentante ASSO.N.A.M. pro tempore**.
- Incident manager operativo: **da nominare per iscritto**.
- Referente tecnico e sostituto: **da nominare per iscritto**.
- Legale/DPO o consulente privacy: **da incaricare**.
- Canale iniziale: **asso.nam@email.it**; creare canale urgente alternativo conservato anche offline.
- Contatti delle associazioni titolari: estratti dall'anagrafica contrattuale, da completare.

ASSO.N.A.M. decide le notifiche per i propri trattamenti da titolare. Quando opera come responsabile, informa senza ingiustificato ritardo l'associazione titolare e le fornisce tutte le informazioni disponibili. Per incidenti multi-titolare viene istituito un coordinamento senza ritardare le scadenze individuali.

## Prime azioni

1. Aprire incidente con ora di scoperta, segnalante, sistemi e prima classificazione CIA: riservatezza, integrità, disponibilità.
2. Preservare log/snapshot in sola lettura e limitare l'accesso; non copiare PII nel ticket più del necessario.
3. Contenere: revoca token/sessioni, isolamento servizio, blocco coda, rotazione segreti o rollback controllato.
4. Identificare titolari, fornitori, categorie/volume di dati e interessati.
5. Informare incident owner, titolari locali e fornitori rilevanti con aggiornamenti progressivi.
6. Stabilire il momento di “conoscenza” e una deadline interna di 48 ore per la decisione, mantenendo il limite GDPR di 72 ore per la notifica del titolare all'autorità.

## Valutazione rischio

- tipo e sensibilità dei dati, inclusi documenti, C.F., credenziali e conversazioni;
- numero/categorie di interessati e durata;
- destinatari non autorizzati e possibilità di recupero;
- facilità di identificazione e conseguenze concrete;
- efficacia di cifratura, hashing, revoca e segregazione tenant;
- rischio di frode, discriminazione, danno reputazionale o perdita di controllo;
- probabilità e gravità residue dopo il contenimento.

Il titolare documenta sempre la decisione. Se il rischio è probabile, notifica il Garante senza ingiustificato ritardo e, ove possibile, entro 72 ore. Se il rischio è elevato, comunica la violazione agli interessati senza ingiustificato ritardo, salvo che ricorra e sia documentata una delle eccezioni previste dall'articolo 34 GDPR. Informazioni mancanti possono essere integrate progressivamente.

## Registro incidente

- ID, scoperta, cronologia e responsabili;
- descrizione fattuale, origine e sistemi;
- titolari, responsabili/sub-responsabili e Paesi coinvolti;
- categorie/volumi stimati senza duplicare i dati;
- contenimento, recupero, valutazione rischio e motivazione;
- notifiche/comunicazioni e relative date;
- root cause, azioni correttive, proprietari e scadenze;
- evidenza di chiusura e monitoraggio rafforzato.

## Scenari da provare

1. Chiave Pienissimo o Green API pubblicata.
2. Org-admin accede a dati di altra associazione.
3. Documento socio esposto da URL/file o backup.
4. Provider email invia a destinatari errati.
5. Compromissione super-admin/root o database.
6. Invio di testo/PII a provider AI non previsto.

Tabletop annuale e dopo ogni incidente significativo; prima esercitazione proposta entro 30 settembre 2026.
