# Registro lotti ASSONAM

## Punto esatto di aggancio

La creazione automatica del lotto e` stata agganciata nel flusso WhatsApp che genera la `RechargeRequest`:

- file: `app/services/whatsapp_bot.py`
- funzione: `_handle_order_notes(...)`
- punto: subito dopo `db.flush()` della `RechargeRequest`

Sostituzione introdotta:

```python
db.add(recharge_request)
db.flush()
created_batch = ensure_recharge_request_batch(db, recharge_request.id)
```

Il resto del flusso resta invariato: reset sessione WhatsApp, notifica Telegram admin e commit finale.

## Dominio del calcolo automatico

Il `max(range_end)` viene calcolato solo sui batch che appartengono esplicitamente al pool shared ASSONAM:

```sql
SELECT MAX(card_batches.end_no)
FROM card_batches
WHERE card_batches.numbering_scope_id = :assonam_central_scope_id
```

Note operative:

- nessun fallback automatico alla singola organizzazione
- nessuna inclusione euristica di batch `legacy` o `null-scope`
- i batch `null-scope` eventualmente presenti vengono esclusi e loggati
- i batch rilasciati restano nel dominio storico e continuano a bloccare il riuso dei numeri

## Esempio reale richiesto

Caso documentato:

- org: `CHICCO CLUB`
- `max_end` nel pool shared ASSONAM: `26300`
- qty richiesta: `300`

Risultato:

- `new_start = 26301`
- `new_end = 26600`
- formato UI/export: `26.301 - 26.600`

## Payload manuale di prova

Webhook WhatsApp di esempio:

```json
{
  "from": "whatsapp:+39336000123",
  "body": "no",
  "profile_name": "Mario Rossi"
}
```

Precondizioni del test manuale:

1. la sessione WhatsApp e` gia` arrivata allo stato `order_notes`
2. `session.data` contiene:

```json
{
  "association_id": 123,
  "association_name": "CHICCO CLUB",
  "requested_cards": 300
}
```

3. l'organizzazione `123` ha `numbering_scope_id = ASSONAM_CENTRAL`
4. nel DB esiste gia` un lotto shared ASSONAM con `end_no = 26300`

Esito atteso:

- nuova `recharge_requests` creata
- nuovo `card_batches` creato con `26301 - 26600`
- `recharge_requests.card_batch_id` valorizzato
- `recharge_requests.status = "lot_created"`

## Idempotenza

Strategia:

- se `recharge_requests.card_batch_id` e` gia` presente, `ensure_recharge_request_batch(...)` restituisce quel batch
- nessun secondo lotto viene creato

Prova minima:

1. invocare due volte `ensure_recharge_request_batch(db, recharge_request_id)`
2. verificare che `batch.id` resti identico
3. verificare che nel DB non compaia un secondo lotto per la stessa richiesta
