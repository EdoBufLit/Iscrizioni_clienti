# Verifica Golden Age Club / Speakeasy - 21 settembre 2026

## Ambito e metodo

Controllo generale del messaggio inoltrato dal cliente: cambio logo della tessera
e avviso di tessera gia attiva nonostante la mancata reperibilita dei tesserati
di gennaio. Incluso l'esempio individuale indicato dall'utente; i dati personali
del socio non sono riportati in questo documento.

Codice live su `4eed20c`, coerente con l'ultimo rilascio applicativo. Letture del
database effettuate in transazioni PostgreSQL `READ ONLY`, con timeout query e
rollback finale. Nessun invio di email, registrazione, modifica tessera o deploy.

## Logo tessera

- Percorso normale: Soci e tessere > Tessere > Builder tessera > Logo associazione.
- Per `oasi-2` (Golden Age Club - Speakeasy, ID 6) e `golden-age-club` il design
  e deliberatamente bloccato: frontend disabilita upload/salvataggio e backend
  rifiuta modifica stile e logo con HTTP 403.
- Verificato sul codice live che `card_style_locked` e `true`. Attualmente
  `card_logo_url` non e impostato e non c'e un logo pubblico caricato: il logo
  effettivo e `/static/card-logos/oasi-2.png`.
- Il Logo Wallet nelle impostazioni e un campo diverso e non sostituisce il logo
  della tessera PDF. Non e stata richiesta ne eseguita la rimozione del blocco;
  nessun nuovo asset e stato fornito.

Riferimenti: `frontend/src/pages/org-admin/OrgAdminCards.tsx`,
`app/routes/org_admin.py` (`_serialize_org_membership_settings`,
`patch_org_membership_settings`, `upload_card_assets`),
`app/services/org_branding.py` (`resolve_card_logo_url`).

## Situazione generale e gennaio

- Nel database attuale ci sono 2.517 soci dell'associazione, tutti attivi con
  tessera 2026; nessun gruppo di email duplicate dopo trim/lowercase.
- Nessuna anagrafica con data iscrizione a gennaio. La prima `joined_at`
  conservata e il 19 febbraio 2026. Nessun audit di gennaio trovato per questa
  associazione; gli audit ingest disponibili iniziano il 18 febbraio.
- La verifica di attivita Python e il filtro SQL dell'elenco attivi concordano
  su tutti i 2.517 soci: zero soci attivi esclusi dal filtro di stato.
- 635 anagrafiche non hanno cognome; 428 hanno il solo nome segnaposto `Socio`.
  La ricerca per nome non puo recuperare un nominativo mai acquisito.
- I filtri aggiuntivi della UI (accesso, provenienza, documenti) possono
  restringere l'elenco; non sono parte del controllo pubblico per email.

L'assenza di date di gennaio nel database attuale non dimostra da sola se ci
fossero tesseramenti in un altro sistema, un import incompleto o dati storici
successivamente rimossi. Per stabilirlo occorre confrontare documentazione
originaria o storico Pienissimo: non e stata inventata una causa.

## Significato dell'avviso

Dopo l'invio dell'email a `/api/ingest/pienissimo/{org_slug}`, il backend cerca
un socio della stessa associazione, non eliminato, con la stessa email
normalizzata, tessera dell'anno corrente e stato realmente attivo. Solo se lo
trova restituisce `already_issued` con la tessera esistente; il retry non sposta
la data di iscrizione e non emette un altro numero.

Questa risposta prova la presenza della tessera al momento del controllo,
non il mese dell'iscrizione originaria. Inoltre, la pagina frontend aperta
direttamente con `card_token` puo visualizzare il testo in base ai parametri
del link, senza un nuovo controllo di attivita: il solo testo visualizzato
non sostituisce la verifica della tessera nel backend. La frase letterale
riportata nel messaggio del cliente non coincide con il testo corrente del
frontend, che recita «Hai gia una tessera attiva. Puoi scaricarla o verificarla qui.»

Riferimenti: `app/routes/ingest_pienissimo.py`
(`_find_active_member_for_email_year`, `ingest_pienissimo_member`),
`app/services/member_activity.py`,
`frontend/src/pages/PienissimoThankYouPage.tsx`.

## Esempio individuale indicato dall'utente

- Una sola anagrafica corrispondente al nominativo nell'associazione.
- Socio attivo 2026, creato il 19 settembre alle 23:43 ora italiana.
  `joined_at` e `decision_at` coincidono.
- Una sola emissione registrata nello storico disponibile, con esito `created`.
  Nessuna emissione di gennaio o riemissione documentata per questa anagrafica.
- Una email tessera con stato `sent` pochi secondi dopo la creazione; lo stato
  di invio non dimostra la ricezione nella casella del destinatario.
- Il resolver pubblico di socio attivo trova la stessa anagrafica per email.
- La funzione reale dell'elenco soci distribuita in produzione trova la stessa
  anagrafica in 6/6 verifiche: nome completo, cognome, ordine inverso, email,
  email con spazi e numero tessera. Tutti sono risultati esatti.
  Per questa verifica il contesto associazione e stato fornito localmente alla
  funzione, senza autenticazioni o aggiornamenti della sessione admin.

## Verifiche

- `python -m pytest tests/test_ingest_pienissimo.py tests/test_member_search.py -q`:
  32 test superati, incluse ripetizioni a mesi di distanza e download multipli
  senza modificare date, numero tessera o stock.
- Health live OK con database OK; disco 38%, inode 9%, cache build Docker assente.
- Solo documentazione aggiornata in locale; modifiche preesistenti preservate.
