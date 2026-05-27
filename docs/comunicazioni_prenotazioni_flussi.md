# Flussi comunicazioni e prenotazioni

Sintesi operativa dei flussi org admin legati a form, prenotazioni, email, WhatsApp, serate prenotabili e builder messaggi.

## Mappa rapida

- `Form pubblico`: raccoglie dati cliente/socio, data, orario, pax, consenso e campi personalizzati.
- `Prenotazione`: viene creata dal submit del form quando il form e' di tipo booking o ha booking attivo.
- `Serate prenotabili`: regole org-level che decidono quali date/orari sono disponibili nei form booking.
- `Email`: invii accodati in outbox e processati dal worker, non inviati direttamente dalla request.
- `WhatsApp`: invii/risposte passano da Evolution API, automazioni e worker dedicati.
- `Builder email`: editor visuale per template/campagne, con salvataggio del contenuto prima di test e invii.

## Flusso prenotazione pubblica

1. Il cliente apre il link pubblico del form, ad esempio `/forms/{org}/{slug}`.
2. Il frontend carica configurazione form, campi, regole prenotazione e slot disponibili.
3. Se esistono serate attive per quella associazione, il form mostra solo date/orari validi secondo le regole.
4. Al submit, il backend valida payload, mapping campi e regole booking.
5. Viene creata una `Booking` con stato iniziale:
   - `pending` se serve conferma manuale dell'org admin.
   - `confirmed` se il form non richiede conferma manuale.
6. La prenotazione resta modificabile dall'org admin per dati operativi come nome, email, telefono, data, orario e numero persone.

Il payload originale del form resta disponibile come storico/audit, mentre i campi operativi della prenotazione diventano la sorgente usata da agenda, tavoli, reminder e comunicazioni.

## Serate e orari

Le serate sono configurate in `Org Admin > Prenotazioni > Serate`.

Ogni regola puo' essere:

- `Settimanale`: vale per un giorno della settimana.
- `Data specifica`: vale solo per una data.
- `Default`: usata come fallback quando non ci sono eventi specifici compatibili.
- `Attiva/Pausa`: decide se la regola entra nei form pubblici.

Gli orari si impostano con `Dalle` e `Alle`: il sistema genera automaticamente slot ogni 30 minuti. La modifica manuale degli slot resta disponibile come opzione avanzata.

Regole importanti:

- Se una serata attraversa mezzanotte, l'ordine resta quello configurato: `21:30, 22:00, ..., 23:30, 00:00, 00:30`.
- Se ci sono regole attive, il backend rifiuta date/orari fuori dagli slot disponibili.
- Se non ci sono regole attive, il form puo' ancora accettare orari liberi a step regolari.
- Gli slot duplicati vengono deduplicati preservando l'ordine, non ordinati alfabeticamente.

## Agenda, stato servizio e tavoli

In `Org Admin > Prenotazioni` l'admin vede richieste, agenda, dettaglio e mappa sala.

Azioni principali:

- Confermare o rifiutare una richiesta.
- Modificare dati prenotazione: nome, email, telefono, data, orario, pax.
- Aggiornare stato servizio anche da mobile: `N`, `A`, `C`, `S`, check, `x`, `No show`.
- Assegnare tavolo e sala.
- Vedere se un tavolo risulta occupato per data/orario/pax aggiornati.

Quando l'admin modifica data, orario o pax, le viste collegate devono usare i dati aggiornati: agenda, tavoli occupati/liberi, comunicazioni e reminder.

## Email automatiche

Gli invii email vengono accodati in `email_outbox` e processati dal worker email.

Tipi principali:

- `booking_pending_confirmation`: email al cliente quando arriva una richiesta booking in attesa.
- `form_submission_notification`: notifica interna/admin per una nuova compilazione form.
- `form_submission_confirmation`: ricevuta generica al compilatore del form.
- `booking_confirmed_status_update`: email cliente dopo conferma admin, se attiva.
- `booking_rejection`: email cliente dopo rifiuto, se configurata/prevista.
- Email campagne/newsletter/template dal modulo Comunicazioni.

Protezioni anti-duplicato:

- Se una richiesta booking invia gia' la mail `booking_pending_confirmation` al cliente, la ricevuta generica del form viene saltata per lo stesso destinatario.
- Se l'email admin coincide con l'email del cliente in un test/self-submit, la notifica admin viene saltata per evitare piu' email identiche alla stessa casella.

Variabili template:

- Formato consigliato: `{{nome_socio}}`, `{{cognome_socio}}`, `{{data_prenotazione}}`, `{{orario_prenotazione}}`, `{{numero_persone}}`, `{{email_socio}}`, `{{numero_whatsapp}}`.
- Sono supportati alias legacy tipo `@nome`, `@cognome`, `@data`, `@orario`, `@pax`, ma il formato con doppie graffe resta quello da mostrare agli utenti.
- Il mapping campi del form alimenta gli alias booking, quindi anche campi generati dal builder possono popolare nome, data, orario, pax, email e telefono.

## Builder email e campagne

Il builder email vive nel modulo `Org Admin > Comunicazioni`.

Uso previsto:

- Creare o modificare template.
- Comporre campagne.
- Fare test send.
- Usare variabili dinamiche del destinatario/form/prenotazione.
- Salvare contenuto HTML/testo e design prima dell'invio.

Il builder visuale viene forzato a sincronizzare il contenuto corrente prima di salvataggio e test, cosi' un invio di prova non parte con testo vecchio o parziale. La UI deve restare ampia e leggibile: il builder e' una superficie di lavoro, non un pannello laterale stretto.

## WhatsApp

WhatsApp passa da Evolution API e dalle automazioni configurate nell'area Comunicazioni.

Componenti:

- Connessione Evolution per associazione.
- Webhook in ingresso da Evolution.
- Worker WhatsApp/webhook per drenare eventi e automazioni.
- Regole di automazione con trigger, destinatario, template e sorgente telefono.

Flussi tipici:

- Auto-risposta dopo submit form, se esiste una regola attiva collegata a quel form.
- Messaggio dopo review/conferma/rifiuto admin, se esiste una regola attiva per quel trigger.
- Reminder prenotazione via WhatsApp, quando configurato.
- Risposte cliente a reminder o link azione, registrate sulla prenotazione quando riconosciute.

Sorgente telefono:

- Prima si usa il telefono operativo salvato sulla prenotazione.
- Se l'admin corregge il numero WhatsApp nel dettaglio prenotazione, i flussi successivi usano quel valore.
- Il payload originale del form resta come storico, non viene riscritto.

## Conferme e review admin

Quando l'admin conferma una prenotazione:

1. Lo stato passa a `confirmed`.
2. Viene salvato evento/audit sulla prenotazione.
3. Se attiva, parte email cliente di conferma admin.
4. Se configurata, parte automazione WhatsApp di conferma.
5. La prenotazione entra nella gestione operativa di agenda/tavoli/stato servizio.

Quando l'admin rifiuta:

1. Lo stato passa a rifiutata/cancellata secondo il flusso applicativo.
2. Viene salvato evento/audit.
3. Se configurata, parte comunicazione email/WhatsApp di rifiuto.

## Punti di configurazione per org admin

- `Prenotazioni > Serate`: date, giorni, slot orari, default e attivazione.
- `Prenotazioni > Agenda`: richieste, conferme, modifica dettagli, stato servizio.
- `Prenotazioni > Mappa sala`: sale, tavoli, assegnazioni e occupazione.
- `Comunicazioni > Template/Campagne`: email visuali e test.
- `Comunicazioni > Form`: impostazioni notifiche form e booking.
- `Comunicazioni > WhatsApp`: connessione, automazioni, template e trigger.

## Garanzie attuali

- Orari booking ordinati secondo la serata, anche oltre mezzanotte.
- Mobile mostra controlli stato servizio nelle card prenotazione.
- Modifica prenotazione impatta agenda e occupazione tavoli.
- Email booking/form evitano duplicati evidenti sullo stesso destinatario.
- Builder email sincronizza il contenuto prima di salvataggio/test.
- Template supportano variabili booking moderne e alias legacy.
