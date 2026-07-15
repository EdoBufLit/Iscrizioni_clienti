# Checklist accordi privacy con le associazioni

> Stato: struttura pronta, accordi da far firmare. La direzione prevalente del DPA è **associazione titolare → ASSO.N.A.M. responsabile** per i trattamenti locali. Per finalità centrali o congiunte usare un allegato separato, non invertire genericamente i ruoli.

## Scelta del rapporto corretto

- [x] Mappate le decisioni effettive degli org-admin: ammissione, documenti, quota, moduli, prenotazioni e campagne.
- [x] Distinti i trattamenti propri di ASSO.N.A.M. da quelli locali.
- [ ] Confermare con statuto/accordi chi determina l'eventuale programma tessera o registro nazionale.
- [ ] Firmare un DPA art. 28 per i trattamenti locali delegati alla piattaforma.
- [ ] Firmare accordo controller-to-controller o art. 26 per finalità autonome/congiunte, se presenti.
- [ ] Usare “associazione responsabile di ASSO.N.A.M.” solo per una specifica attività eseguita senza finalità propria e su istruzioni documentate.

## Contenuto minimo DPA associazione → ASSO.N.A.M.

- [ ] Parti, contatti privacy, oggetto, durata, natura e finalità.
- [ ] Categorie di interessati e dati, inclusi documenti, pagamenti, moduli e messaggistica se abilitati.
- [ ] Istruzioni documentate e processo di modifica; divieto di usi autonomi.
- [ ] Obbligo di riservatezza, autorizzazioni per ruolo e formazione.
- [ ] Misure tecniche e organizzative collegate a versione/data verificabili.
- [ ] Assistenza per diritti, sicurezza, DPIA e consultazione preventiva.
- [ ] Notifica incidenti ad ASSO.N.A.M. e dall'ASSO.N.A.M. al titolare locale senza ingiustificato ritardo.
- [ ] Autorizzazione generale/specifica ai sub-responsabili, preavviso e diritto di opposizione motivata.
- [ ] Trasferimenti internazionali, DPA/SCC/DPF/TIA e misure supplementari.
- [ ] Audit/evidenze proporzionati e segnalazione di istruzioni illecite.
- [ ] Restituzione/export e cancellazione a fine servizio, inclusi tempi dei backup e legal hold.

## Allegato istruzioni proposto

1. Trattare dati soltanto per erogare iscrizione, libro soci, quota, tessera, moduli, prenotazioni e comunicazioni abilitate dal titolare locale.
2. Non usare le liste per marketing ASSO.N.A.M. o partner; il consenso attuale copre solo promozioni dell'associazione via email.
3. Non raccogliere categorie particolari/giudiziarie in campi liberi senza istruzione, base e valutazione dedicate.
4. Applicare separazione tenant, minimo privilegio e autenticazione degli amministratori.
5. Usare solo sub-responsabili presenti nel registro approvato.
6. Applicare il piano di conservazione e sospendere cancellazioni soltanto mediante legal hold registrato.
7. Inoltrare DSAR entro due giorni lavorativi e incidenti immediatamente.

## Allegato misure tecniche attuali

- [x] TLS pubblico e reverse proxy.
- [x] Password/token hashati e capability monouso/a scadenza.
- [x] Sessioni HttpOnly/SameSite, CSRF e rate limiting.
- [x] Isolamento per organizzazione e controlli autorizzativi testati.
- [x] Log minimizzati/redatti e audit amministrativo.
- [x] Backup PostgreSQL e outbox per cancellazioni file.
- [ ] MFA/passkey per super-admin e org-admin.
- [ ] Restore drill periodico con RPO/RTO firmati.
- [ ] Retention automatizzata completa e legal hold.
- [ ] Monitoraggio/alerting di sicurezza end-to-end.

## Pacchetto firme da produrre

1. DPA e istruzioni.
2. Misure tecniche e organizzative.
3. Elenco sub-responsabili/trasferimenti datato.
4. Matrice controller-to-controller/art. 26, se necessaria.
5. Contatti DSAR e incidenti.
6. Piano restituzione/cancellazione.

Proprietario: legale rappresentante ASSO.N.A.M. pro tempore. Scadenza proposta per le firme: 15 agosto 2026.
