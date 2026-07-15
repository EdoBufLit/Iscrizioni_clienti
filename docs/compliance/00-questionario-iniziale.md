# Questionario iniziale e decisioni ASSO.N.A.M.

> Compilato tecnicamente il 15 luglio 2026. Le voci “da formalizzare” richiedono un atto, una firma o un contratto che non può essere ricavato da una ricerca web.

## 1. Organizzazione e contatti

- Denominazione: **ASSO.N.A.M. - Associazione Nazionale Arti e Mestieri**.
- P.IVA: **IT11257860962**, verificata valida su VIES il 15 luglio 2026.
- C.F.: **97542050154**, da confermare con visura/certificato primario.
- Sede: **Via Sambucuccio d'Alando 10, 00162 Roma (RM)**.
- Sito: **https://assonam.it**.
- Email operativa e canale privacy provvisorio: **asso.nam@email.it**.
- Telefono: **+39 06 3972 4643**.
- Legale rappresentante, PEC e DPO: **da acquisire da visura/statuto/nomina; non verificati**.
- Responsabile interno privacy e incident manager: **legale rappresentante pro tempore fino a delega scritta; nominare referente tecnico e sostituto**.

Per ogni associazione affiliata devono essere conservati denominazione, C.F./P.IVA, sede, rappresentante, contatto privacy e accordo applicabile.

## 2. Decisione sui ruoli

| Ambito | Chi decide nei flussi attuali | Qualifica di lavoro |
|---|---|---|
| Affiliazione e amministrazione centrale | ASSO.N.A.M. | ASSO.N.A.M. titolare |
| Sicurezza, account centrali, antifrode e audit | ASSO.N.A.M. | ASSO.N.A.M. titolare |
| Ammissione locale, quota, documenti e libro soci | Associazione tramite org-admin | Associazione titolare; ASSO.N.A.M. responsabile tecnico |
| Moduli, prenotazioni e campagne locali | Associazione tramite org-admin | Associazione titolare; ASSO.N.A.M. responsabile tecnico |
| Eventuale registro/tessera nazionale | Decisioni da statuto/accordi non acquisiti | Valutare ASSO.N.A.M. titolare o contitolarità |
| Attività svolta dall'associazione solo su istruzioni ASSO.N.A.M. | ASSO.N.A.M. | Associazione responsabile limitatamente a tale attività |

Motivazione: un responsabile ex art. 28 non determina finalità proprie. Nel portale l'associazione sceglie auto-approvazione, documenti, quota, campagne ed eventi; l'inversione generale dei ruoli non è quindi sostenibile senza cambiare la governance effettiva.

## 3. Interessati e dati

- Interessati: aspiranti soci, soci, ex soci, amministratori, referenti associazioni, partecipanti a moduli/prenotazioni, interlocutori WhatsApp e fornitori.
- Categorie ordinarie: anagrafica, C.F., nascita, contatti, associazione, tessera, account, documenti, pagamento, preferenze marketing, comunicazioni, prenotazioni e dati tecnici.
- Categorie particolari/giudiziarie: **vietate per impostazione predefinita**; un form libero non deve raccoglierle senza nuova valutazione e base giuridica.
- Minori: il sistema può gestire date di nascita e consente alle singole associazioni di attivare un vincolo adulti. **Definire procedura per le organizzazioni che ammettono minori e consenso/rappresentanza applicabile**.
- Scala produzione al 15 luglio 2026: 4.534 soci, 1.122 documenti, 30 submission di moduli, 8.921 messaggi WhatsApp e 29.248 eventi webhook.

## 4. Finalità e comunicazioni

- Comunicazioni di servizio: iscrizione, verifica, documenti, pagamento, tessera, rinnovi e prenotazioni.
- Marketing iniziale: **solo email, per iniziative dell'associazione di iscrizione, con consenso separato e facoltativo**.
- Marketing autonomo ASSO.N.A.M., partner, WhatsApp/SMS promozionali, profilazione e cessione liste: **non coperti dal consenso implementato**.
- Pixel di apertura/link tracking: non abilitare per impostazione predefinita senza valutazione e informativa dedicate.

## 5. Infrastruttura e fornitori

- Dati primari: Hetzner NBG1, Norimberga, Germania (SEE), non Italia.
- Attivi/configurati: Cloudflare, provider email associazioni, Google Wallet, Green API, Evolution API, OpenAI, Telegram, Twilio, Stripe e SumUp.
- Pienissimo: bridge mantenuto per necessità operativa e registrato come rischio temporaneamente accettato.
- Decisione: non dichiarare assenza di trasferimenti extra SEE finché non sono archiviati DPA, sub-responsabili, sedi e garanzie di ogni servizio.

## 6. Conservazione adottata

- Pratica abbandonata: 30 giorni.
- Pratica presentata e chiusa/rifiutata: 180 giorni.
- Copia documento: entro 30 giorni dalla decisione, salvo obbligo specifico.
- Profilo socio operativo: rapporto + 12 mesi; storico minimo libro soci/tessera: 10 anni dalla cessazione.
- Contabilità: 10 anni, salvo accertamento/contenzioso.
- Marketing: stop immediato alla revoca; prova minimizzata 5 anni dall'ultimo uso/revoca.
- Log 30/90 giorni, audit admin 24 mesi, webhook grezzo 7 giorni, backup rolling 60 giorni.

I termini completi e lo stato di attuazione sono in `05-conservazione.md`.

## 7. Diritti, incidenti e accessibilità

- Canale privacy iniziale: **asso.nam@email.it**; creare preferibilmente `privacy@assonam.it` o PEC dedicata e pubblicarla.
- Coordinatore fino a delega: legale rappresentante pro tempore.
- SLA interno DSAR: presa in carico entro 2 giorni lavorativi; risposta GDPR entro un mese salvo proroga motivata.
- Incidenti: escalation immediata; decisione notifica entro la finestra GDPR di 72 ore.
- DPO: obbligo non dimostrato dai dati disponibili; decisione motivata da firmare e riesaminare con crescita, minori o categorie particolari.
- DPIA: approfondimento raccomandato per WhatsApp/AI, documenti e fornitori internazionali.
- EAA: applicabilità da concludere; obiettivo tecnico WCAG 2.2 AA indipendentemente dall'esenzione.

## 8. Evidenze ancora da acquisire

- [ ] Visura/statuto aggiornati, C.F., rappresentante e PEC.
- [ ] Nomina o decisione motivata sul DPO.
- [ ] DPA/accordi con ogni associazione.
- [ ] Contratti, DPA, sub-responsabili, regioni e garanzie dei fornitori.
- [ ] Nomina privacy/incident manager e canale alternativo.
- [ ] Verbale approvazione retention e piano di automazione.
- [ ] Screening minori, DPIA ed EAA firmati.
