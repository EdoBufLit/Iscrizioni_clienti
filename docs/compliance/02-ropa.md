# Registro delle attività di trattamento (ROPA)

> Registro di lavoro ai sensi dell'art. 30 GDPR. Proprietario: legale rappresentante ASSO.N.A.M. pro tempore. Ultimo aggiornamento tecnico: 18 luglio 2026.

## Registro ASSO.N.A.M. quale titolare

| ID | Trattamento/finalità | Interessati e dati | Base di lavoro | Destinatari/sistemi | Conservazione |
|---|---|---|---|---|---|
| T-01 | Affiliazione e amministrazione centrale | Associazioni, rappresentanti, contatti, documenti, pagamenti | Misure/rapporto; obblighi | Portale, Hetzner, email, Stripe/SumUp | Rapporto + 10 anni per contabilità/difesa |
| T-02 | Account centrali, sicurezza, antifrode e audit | Admin/soci: email, hash, sessioni, IP e log minimizzati | Legittimo interesse; obblighi sicurezza | Hetzner, Cloudflare, log/audit | 30 giorni log app; 90 sicurezza; 24 mesi audit |
| T-03 | Gestione tecnica tessera/registro centrale, se prevista | Soci: identità, associazione, numero/stato tessera | Da statuto/rapporto, da convalidare | Portale, pagina verifica, Google Wallet | Operativo + storico minimo 10 anni |
| T-04 | Assistenza centrale | Utenti/referenti: contatti, richiesta, cronologia | Richiesta/rapporto; legittimo interesse | Email, WhatsApp/Green, Twilio, Telegram, OpenAI se invocato | 180 giorni chat; ticket secondo necessità |
| T-05 | Conformità, DSAR e incidenti | Richiedenti/segnalanti: identità minima, richiesta, decisione | Obbligo legale | Registro ristretto, fornitori coinvolti | 5 anni dalla chiusura |

## Registro ASSO.N.A.M. quale responsabile per le associazioni

| ID | Trattamento per conto del titolare locale | Dati/interessati | Istruzioni/contratto richiesti | Sub-responsabili principali | Fine servizio |
|---|---|---|---|---|---|
| R-01 | Iscrizione, ammissione e libro soci | Aspiranti, soci/ex soci; anagrafica, C.F., contatti, documenti | DPA art. 28 + configurazione organizzazione | Hetzner, Cloudflare/email | Restituzione/export e cancellazione secondo retention/hold |
| R-02 | Quote e pagamenti | Soci; importo, stato, riferimenti | DPA + istruzioni su provider e riconciliazione | SumUp/Stripe | Payload 90 giorni; evidenza contabile secondo titolare |
| R-03 | Tessera, verifica e wallet | Soci; numero, stato, dati pubblicati | DPA + approvazione campi pubblici | Google Wallet, hosting | Disattivazione e cancellazione/scadenza documentata |
| R-04 | Comunicazioni e campagne | Soci/contatti; email, consenso, contenuto, delivery | DPA + distinzione servizio/marketing | Cloudflare/Mailtrap | Campagne/delivery 24 mesi; suppression minima |
| R-05 | Moduli, prenotazioni e messaggistica | Partecipanti; risposte, booking, numeri e messaggi | DPA + divieto categorie particolari non autorizzate | Green API/Evolution, Twilio, OpenAI, Telegram | 12/24/6 mesi secondo categoria |

## Trasferimenti e misure

- Dati primari: Hetzner NBG1, Germania, SEE.
- Accessi/trasferimenti extra SEE: possibili tramite fornitori globali; non dichiarati assenti. DPA, SCC/DPF, sub-responsabili e TIA devono essere collegati a ogni riga applicabile.
- Misure: HTTPS, hashing password/token, sessioni HttpOnly/SameSite revocabili, CSRF, MFA TOTP obbligatoria per super admin e facoltativa per org admin, recovery code, step-up per operazioni critiche, doppia prova monouso vecchia/nuova email per il cambio indirizzo, capability a scadenza, separazione tenant, rate limit distribuito, redazione log, registro audit consultabile/esportabile, backup e cancellazione file tramite outbox.
- Misure ancora da completare: restore drill periodico documentato, monitoraggio continuo dei job, retention automatizzata completa, legal hold, approvazione periodica degli accessi e decisione formale sull'obbligatorietà MFA per tutti gli org admin.

## Decisioni automatizzate

Non risultano decisioni esclusivamente automatizzate con effetti giuridici ai sensi dell'art. 22. L'auto-approvazione della tessera è una regola configurata dall'associazione e non una valutazione/profilazione algoritmica; eventuali eccezioni vanno riesaminate.

## Riesame

Riesame almeno annuale e a ogni cambio di finalità, categoria di dati, provider, Paese, retention o misura. Prossimo riesame proposto: 15 ottobre 2026 per chiudere contratti e trasferimenti.
