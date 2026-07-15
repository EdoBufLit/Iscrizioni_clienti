# Fascicolo compliance ASSO.N.A.M.

> **Stato al 15 luglio 2026:** compilazione tecnica e policy interna provvisoria completate. Restano necessarie la firma del legale rappresentante, la verifica con visura/statuto, la raccolta dei contratti dei fornitori e la validazione di un consulente privacy. Il fascicolo non sostituisce un parere legale.

## Identità utilizzata

| Voce | Valore | Evidenza/stato |
|---|---|---|
| Denominazione | ASSO.N.A.M. - Associazione Nazionale Arti e Mestieri | VIES, 15 luglio 2026 |
| Partita IVA | IT11257860962 | Valida su VIES, 15 luglio 2026 |
| Codice fiscale | 97542050154 | Fonti camerali commerciali concordi; confermare con visura/certificato |
| Sede | Via Sambucuccio d'Alando 10, 00162 Roma (RM) | VIES e sito pubblico |
| Sito | https://assonam.it | Produzione attiva |
| Email operativa/privacy | asso.nam@email.it | Pubblicata sul sito; formalizzare come canale privacy |
| Telefono | +39 06 3972 4643 | Pubblicato sul sito |
| PEC, legale rappresentante, DPO | Non verificati | Non inventare; acquisire atto/visura e nomine |

## Matrice dei ruoli adottata

I ruoli GDPR derivano da chi decide concretamente finalità e mezzi essenziali, non dall'etichetta scelta dalle parti.

- **ASSO.N.A.M. titolare autonomo** per affiliazione centrale, amministrazione e fatturazione proprie, sicurezza e prevenzione abusi, account centrali e tutela dei propri diritti.
- **Associazione locale titolare autonomo** quando decide ammissione, campi/documenti, quota, libro soci, moduli, prenotazioni e proprie campagne.
- **ASSO.N.A.M. responsabile ex art. 28** quando fornisce la piattaforma per le finalità determinate dall'associazione locale.
- **Associazione responsabile di ASSO.N.A.M.** soltanto per attività circoscritte svolte esclusivamente su istruzioni documentate di ASSO.N.A.M., senza finalità proprie.
- **Contitolarità ex art. 26** da valutare per eventuali finalità nazionali realmente determinate insieme, come uno specifico registro o programma tessere centrale.

L'indicazione iniziale “ASSO.N.A.M. titolare e associazione responsabile” è quindi registrata come assetto contrattuale desiderato, ma non è estesa automaticamente ai flussi locali perché il portale attribuisce agli org-admin decisioni autonome. Per renderla applicabile occorrerebbe cambiare sia gli accordi sia l'effettiva governance delle decisioni.

## Infrastruttura e trasferimenti verificati

- Database PostgreSQL e file primari: server Hetzner `NBG1`, Norimberga, Germania (SEE), non Italia.
- DNS/proxy e trasporto email Cloudflare attivi.
- Configurati in produzione: Mailtrap/API email associazioni, Google Wallet, Green API/WhatsApp, Evolution API locale, OpenAI, Telegram, Twilio, Stripe e SumUp.
- Il 15 luglio 2026 risultavano 69 associazioni, 4.534 soci, 1.122 documenti socio, 8.921 messaggi WhatsApp e 29.248 webhook; due associazioni avevano SumUp abilitato e una credenziali SumUp configurate.

Non è possibile dichiarare “dati soltanto in Italia” o “nessun trasferimento extra SEE”. L'hosting primario è nel SEE, ma alcuni fornitori possono comportare accessi o trasferimenti internazionali. Il registro fornitori indica le verifiche contrattuali ancora necessarie.

## Policy di conservazione adottata

La policy risk-based è dettagliata in [05-conservazione.md](05-conservazione.md). I termini principali sono: 30 giorni per pratiche abbandonate, 180 giorni per pratiche chiuse/rifiutate, 30 giorni dopo la verifica per copie dei documenti, rapporto + 12 mesi per dati operativi socio, 10 anni per storico minimo e contabilità, 7 giorni per webhook grezzi e 60 giorni per backup rolling.

La policy è approvata come obiettivo operativo del progetto, ma non è ancora interamente automatizzata. Prima di schedulare cancellazioni va corretta/verificata anche la manutenzione annuale esistente, che può anonimizzare dati del socio prima di aver separato lo storico minimo necessario.

## Documenti del fascicolo

1. [Questionario e decisioni](00-questionario-iniziale.md)
2. [Mappa dati e ruoli](01-mappa-dati-e-ruoli.md)
3. [Registro dei trattamenti](02-ropa.md)
4. [Checklist accordi art. 28/26](03-dpa-art28-checklist.md)
5. [Fornitori e trasferimenti](04-fornitori-e-trasferimenti.md)
6. [Conservazione](05-conservazione.md)
7. [Procedura DSAR](06-procedura-dsar.md)
8. [Procedura data breach](07-procedura-data-breach.md)
9. [Screening DPIA, DPO ed EAA](08-screening-dpia-dpo-eaa.md)
10. [Registro rischi](09-registro-rischi.md)
11. [Checklist pubblicazione](10-checklist-pubblicazione-privacy.md)
12. [Piano P3](11-piano-azione-successivo.md)

## Chiusure formali ancora necessarie

1. Acquisire visura/statuto, legale rappresentante, PEC e decisione motivata sul DPO.
2. Firmare DPA art. 28 associazione → ASSO.N.A.M. e, dove necessario, accordi controller-to-controller/art. 26.
3. Archiviare DPA, sub-responsabili, sedi, SCC/DPF e valutazioni dei trasferimenti per ogni fornitore attivo.
4. Nominare per iscritto referente privacy, incident manager e sostituti.
5. Approvare e implementare i job di retention, legal hold e prova di ripristino.
6. Completare DPIA/valutazione fornitori per WhatsApp, AI e dati di eventuali minori.
7. Eseguire verifica manuale WCAG 2.2 AA e concludere lo screening EAA.

## Fonti normative essenziali

- [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj/ita)
- [EDPB 07/2020 su titolare e responsabile](https://www.edpb.europa.eu/documents/guideline/guidelines-072020-on-the-concepts-of-controller-and-processor-in-the-gdpr_en)
- [EDPB 05/2020 sul consenso](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en)
- [Garante: attività promozionale e spam](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/2542348)
- [Direttiva (UE) 2019/882 - European Accessibility Act](https://eur-lex.europa.eu/eli/dir/2019/882/oj/ita)

## Controllo versione

- Proprietario documentale: legale rappresentante ASSO.N.A.M. pro tempore.
- Compilazione tecnica: 15 luglio 2026.
- Revisione ordinaria: almeno annuale e a ogni cambio di finalità, fornitore, Paese, retention o misura rilevante.
- Prossima revisione proposta: 15 ottobre 2026.
