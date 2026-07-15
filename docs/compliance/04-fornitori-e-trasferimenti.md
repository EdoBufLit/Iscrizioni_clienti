# Registro fornitori, sub-responsabili e trasferimenti

> Evidenza tecnica rilevata il 15 luglio 2026. “Configurato” non dimostra che contratto, DPA e trasferimento siano già conformi: i documenti devono essere scaricati dall'account contraente e archiviati con data/versione.

| Servizio | Stato produzione | Uso/dati principali | Sede/accessi noti | Garanzia da archiviare | Stato compliance |
|---|---|---|---|---|---|
| Hetzner | Attivo | Server, PostgreSQL, file e backup | NBG1 Norimberga, Germania (SEE) | Contratto, DPA, subfornitori, regione server | Hosting primario verificato; documenti da archiviare |
| Cloudflare | Attivo | DNS/proxy/sicurezza e trasporto email; IP, header, destinatari/corpi email | Rete globale; possibili accessi extra SEE | Customer DPA, SCC/DPF, sub-responsabili | Verifica trasferimenti aperta |
| Provider API email associazioni/Mailtrap | Token configurato; comunicazioni abilitate per 2 org | Destinatari, mittente, corpo, allegati/metadati | Possibili trattamenti internazionali/USA | Entità contraente, DPA, SCC/DPF, retention | Aperto |
| Google Fonts | Attivo nel frontend | IP e metadati browser | Google, rete globale | Valutare auto-hosting o documentare base/garanzie | Aperto; rimozione consigliata |
| Google Wallet | Issuer configurato | Nome, email, associazione, numero/stato/scadenza tessera, URL verifica | Google, possibili accessi globali | DPA/termini, SCC, sub-responsabili | Aperto |
| SumUp | Abilitato per 2 org; credenziale presente per 1 | Email, importo, causale/riferimento e stato checkout | SEE e possibili trasferimenti dichiarati dal provider | DPA/termini, entità, SCC/DPF, retention | Aperto |
| Stripe | Demo abilitata; 1 connected account | Dati associazione, contatti, checkout/pagamento | Infrastruttura globale | Stripe DPA, SCC/DPF, connected-account terms | Aperto |
| Green API | WhatsApp attivo; webhook secret globale non configurato | Numeri, messaggi, metadati e webhook | Provider extra SEE; infrastruttura dichiarata in più Paesi | Contratto/DPA, SCC o altra base, TIA, subfornitori | **Rischio alto; priorità immediata** |
| Evolution API Lite | Attivo nello stesso stack | Copia/sincronizzazione chat WhatsApp | Server NBG1 Germania | Allegato tecnico, accessi e cancellazione | Locale SEE; retention da attuare |
| Twilio | Credenziali configurate | WhatsApp/SMS/flow, numeri e messaggi se invocati | Rete globale | Twilio DPA, SCC/DPF, sub-responsabili | Aperto |
| Telegram | Bot configurato | Associazione, numero/richiesta e alert | Possibili accessi extra SEE | Termini, base, minimizzazione; valutare rimozione PII | Aperto |
| OpenAI | Chiave configurata | Testo libero di messaggi non riconosciuti e metadati minimizzati | Possibili trattamenti internazionali secondo contratto | DPA, regione/data controls, SCC/DPF, no-training | **DPIA/TIA e minimizzazione richieste** |
| Pienissimo | Attivo per un flusso con chiave associazione | Dati socio/associazione/tessera | Da contratto | DPA, sedi, sub-responsabili, rotazione/revoca chiave | Rischio accettato temporaneamente |

## Decisione sulla localizzazione

La dichiarazione “i dati rimangono in Italia e non vi sono trasferimenti extra UE” è smentita dalla configurazione verificata:

- i dati primari sono in Germania, pur restando nel SEE;
- Cloudflare e Google ricevono almeno dati tecnici;
- messaggistica, email, wallet, pagamenti e AI possono comportare accessi o trasferimenti extra SEE.

Formula approvata per informativa/ROPA: **hosting primario nel SEE; possibili trasferimenti o accessi extra SEE tramite fornitori, disciplinati caso per caso mediante decisione di adeguatezza, DPF, SCC o altro strumento GDPR e relative misure**.

## Fascicolo da raccogliere per ogni servizio

- contratto/ordine e identità dell'entità contraente;
- DPA e lista sub-responsabili con data/versione;
- dati e funzioni effettivamente attivi;
- regioni di storage, supporto e accesso remoto;
- decisione di adeguatezza/DPF/SCC e Transfer Impact Assessment quando necessario;
- cifratura, segregazione, incident notification e tempi di cancellazione;
- procedura export/restituzione e gestione backup;
- proprietario interno e prossima revisione.

## Azioni prioritarie

1. Entro 7 giorni: acquisire DPA/trasferimenti Green API, Cloudflare/email e OpenAI; sospendere l'invio di dati non indispensabili se mancano basi adeguate.
2. Entro 30 giorni: completare Google, SumUp, Stripe, Twilio e Telegram; self-hostare Google Fonts.
3. Entro 60 giorni: introdurre gate fornitori e registro versionato dei sub-responsabili.
