# API selezione multipla soci — 26 ottobre 2026

Prefisso `/api/org-admin/member-bulk`. Tutte le operazioni richiedono sessione Org Admin valida, MFA se configurata, associazione attiva e creatore dell'operazione corrente. Nessuna azione finanziaria o cancellazione massiva è inclusa.

## Anteprima

`POST /preview`

```json
{
  "request_key": "UUID-generato-dal-client",
  "action": "send_access",
  "membership_year": null,
  "selection": {
    "mode": "ids",
    "member_ids": [1, 2],
    "excluded_ids": [],
    "filters": null
  }
}
```

Azioni: `export`, `send_access`, `quote_reminder`. L'ultima richiede `membership_year` (2000–2200). Export e accesso non accettano un anno. Per `mode: filtered`, usare `filters` con gli stessi valori della lista soci (`q`, `status`, `access`, `source`, `docs`, `order`), nessun `member_ids`, ed eventualmente `excluded_ids`. Gli ID vengono congelati all'anteprima, massimo 10.000; oltre il limite si riceve un errore esplicito e nessun troncamento. Il filtro include gli stessi risultati fuzzy della lista. Cambiare i filtri in UI deve azzerare la selezione.

Dal 27 ottobre: `quote_reminder` disponibile soltanto da Quote e rinnovi. Il server permette annualita dal 2027 e non successive all'anno corrente Europe/Rome; preview/execute/retry anticipati danno409. Soci con tessera dell'annualita precedente ancora valida sono esclusi, anche se lo diventano dopo l'anteprima. Vecchie operazioni restano leggibili, con `unavailable_reason` e pulsanti non eseguibili quando il calendario ne vieta l'invio.

Gli identificativi e l'annualità sono interi stretti: booleani, stringhe numeriche e numeri frazionari vengono rifiutati.

Chiavi di richiesta riutilizzate con un payload diverso danno 409. Una richiesta identica restituisce l'operazione già creata.

## Risposta comune

```json
{
  "id": "UUID-run",
  "action": "send_access",
  "action_label": "Invia accesso",
  "membership_year": null,
  "selection_mode": "ids",
  "status": "preview",
  "selected_count": 2,
  "eligible_count": 1,
  "currency": "EUR",
  "outstanding_total_cents": null,
  "counts": {"pending": 1, "succeeded": 0, "skipped": 1, "failed": 0},
  "reason_counts": {"access_already_active": 1},
  "created_at": "2026-10-26T10:00:00+00:00",
  "expires_at": "2026-10-26T10:30:00+00:00",
  "started_at": null,
  "completed_at": null,
  "items": [
    {"member_id": 1, "name": "Nome Cognome", "status": "pending", "reason_code": null, "detail": null, "attempts": 0, "delivery_status": null},
    {"member_id": 2, "name": "Altro Socio", "status": "skipped", "reason_code": "access_already_active", "detail": "Il socio ha già un accesso attivo.", "attempts": 0, "delivery_status": null}
  ],
  "offset": 0,
  "limit": 50,
  "total": 2,
  "has_more": false,
  "can_execute": true,
  "can_retry_failed": false,
  "can_download": false
}
```

Stati operazione: `preview`, `running`, `completed`, `expired`. Stati riga: `pending`, `succeeded`, `skipped`, `failed`. Per le email `succeeded` significa **accodata**, non consegnata: mostrare «Accodati» e lo stato outbox `delivery_status` quando disponibile. Nessuna email parte dall'anteprima.

Per `quote_reminder` ogni riga contiene `amount_cents` (saldo all'anteprima) e `currency`; `outstanding_total_cents` è la somma di tali saldi per gli idonei iniziali e rimane leggibile dopo l'esecuzione. Per altre azioni i valori monetari sono null.

## Conferma, avanzamento, ripresa e download

- `POST /{id}/execute` body `{"request_key":"UUID-unico-per-blocco"}`: conferma esplicita ed elabora **massimo 25 righe**, restituisce la risposta comune. Ripetere con nuove chiavi finché `counts.pending > 0`; retry della stessa richiesta con la stessa chiave non elabora un altro blocco. Prima di ogni riga vengono rivalutati permessi, eleggibilità, indirizzo email e saldo. Il cambio destinatario dopo l'anteprima fa saltare la riga.
- `GET /{id}?offset=0&limit=50`: rilettura/paginazione (limit 1–100) e ripresa dopo interruzioni del browser. Le righe già elaborate non vengono reinviate.
- `GET ?limit=10&offset=0`: elenco delle operazioni recenti del creatore nell'associazione corrente, con `items`, `total`, `limit`, `offset`. Ogni sommario contiene `id`, `action`, `action_label`, `membership_year`, `status`, `created_at`, `selected_count`, `eligible_count` e `counts`, senza nomi o altri dati personali. Limite massimo 50.
- `POST /{id}/retry-failed` body `{"request_key":"UUID-unico"}`: rimette in attesa **solo le righe failed**, senza modificare riusciti o saltati; poi usare execute. Un errore del trasporto successivo all'accodamento viene gestito dall'outbox esistente, non duplicando l'azione bulk.
- `GET /{id}/export.xlsx`: solo `action: export` con operazione confermata e completata. Scarica i soci riusciti ancora accessibili/non eliminati; mai soci estranei all'associazione. Header `X-Exported-Count` comunica il numero effettivo del file. Formule Excel neutralizzate con il servizio esistente.

L'anteprima scade dopo 30 minuti se non confermata. Un'operazione iniziata resta riprendibile. Per email e saldi cambiati serve una nuova anteprima; nessun invio implicito al cambio filtro o alla selezione.
