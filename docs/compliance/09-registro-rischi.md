# Registro dei rischi privacy e sicurezza

> Proprietario di default fino a delega: legale rappresentante ASSO.N.A.M. pro tempore. Revisione tecnica: 15 luglio 2026; prossima revisione: 15 ottobre 2026.

| ID | Rischio/scenario | P | I | Controlli/azione | Residuo/decisione | Proprietario |
|---|---|---:|---:|---|---|---|
| R-001 | Chiave condivisa Pienissimo compromessa o usata oltre il perimetro | Alta | Alta | Chiave per associazione, log minimizzati, revoca/rotazione, monitoraggio e rate limit | **Alto; accettato temporaneamente dal committente**, riesame trimestrale | Legale rappresentante + tecnico |
| R-002 | Ruoli descritti in modo contrario ai fatti | Media | Alta | Matrice funzionale, DPA associazione→ASSONAM, accordi art.26 separati | Medio; mitigare entro 30 giorni | Legale rappresentante |
| R-003 | Fornitori o trasferimenti senza DPA/SCC/TIA | Alta | Alta | Registro attivi, clausola trasparente, raccolta contratti | **Alto; Green/API email/OpenAI P0 documentale** | Legale rappresentante |
| R-004 | Retention non automatizzata o incoerente tra DB/file/backup | Alta | Alta | Policy, outbox file, dry-run, legal hold e restore drill | Alto finché non implementata | Tecnico + privacy |
| R-005 | Marketing senza prova/revoca | Bassa | Alta | Checkbox separata default-off, eventi consenso, suppression, unsubscribe e recheck invio | Basso; monitorare | Privacy + associazione titolare |
| R-006 | Testo libero/PII inviato a OpenAI, Telegram o WhatsApp oltre il necessario | Media | Alta | Minimizzazione, allowlist casi, DPA/TIA, retention e redazione | Medio-alto; DPIA raccomandata | Tecnico + privacy |
| R-007 | Compromissione account privilegiato/root | Media | Critica | Password non-default, sessioni/CSRF, audit; introdurre MFA/passkey e accesso SSH ristretto | Medio-alto | Tecnico |
| R-008 | Moduli raccolgono dati particolari o di minori senza base/procedura | Media | Alta | Divieto contrattuale/UI, review campi, screening minori/DPIA | Medio-alto | Associazione titolare + privacy |
| R-009 | 30 pratiche legacy pendenti senza password non possono essere sovrascritte anonimamente | Media | Media | Nessuna tessera già assegnata; restano approvabili; dopo attivazione accesso via magic link; non riaprire takeover via PII | Basso-medio; accettare con monitoraggio | Tecnico + associazioni |
| R-010 | Backup non verificato o ripristino reintroduce dati scaduti | Media | Alta | Backup pre-deploy, verifica archivio, restore drill e replay cancellazioni | Medio-alto | Tecnico |

## Condizioni accettazione R-001 Pienissimo

- Una associazione usa oggi la chiave per iscrizioni; nessuna alternativa immediata senza interruzione.
- L'accettazione copre soltanto il comportamento attuale, non nuovi dati/associazioni.
- Inventario, revoca, accessi limitati, log senza PII, alert e riesame trimestrale sono obbligatori.
- Abuso, chiave pubblicata, mancata attribuzione, ampliamento dati o alternativa sostenibile annullano l'accettazione.
- Firma/data formale: **da acquisire entro 31 luglio 2026**.

## Criterio di chiusura

Un rischio si chiude soltanto con evidenza verificata. Le accettazioni riportano motivazione, residuo, approvatore e scadenza; non sono a tempo indeterminato.
