# Registro lotti ASSONAM

## Creazione dal Registro lotti (super admin)

Il pulsante **Nuovo lotto** richiede associazione e quantità (da 1 a 100.000).
L'anteprima mostra l'anno corrente e l'intervallo previsto; il server ricalcola
l'intervallo nella transazione di creazione, quindi conferma quello definitivo.
Sono selezionabili anche le associazioni senza lotti, escluse quelle archiviate.

- `GET /api/super-admin/card-lots/preview?organization_id=…&quantity=…`
- `POST /api/super-admin/card-lots` con `organization_id`, `quantity`, `year`
  (opzionale per i client API) e `idempotency_key` UUID. Richiede super admin
  e verifica MFA recente quando prevista dalla configurazione esistente.
- Risposta: `{ok, item, reused}`; `item` usa lo stesso formato del Registro,
  inclusi `assigned`, `reserved` e `remaining` calcolati dalle occupazioni reali.

Il nuovo intervallo parte dopo il massimo storico nel gruppo di numerazione
dell'associazione, includendo tutti gli anni e i lotti disabilitati/rilasciati.
Un gruppo condiviso vuoto parte da 30.001; uno dedicato da 1. I lotti legacy
senza gruppo mantengono il dominio globale legacy delle API manuali. Eventuali
numeri già assegnati o prenotati oltre i lotti storici vengono protetti. I buchi
all'interno dei lotti esistenti restano disponibili per l'emissione delle tessere.

Creazione, movimento di carico e ricevuta di idempotenza nel registro attività
sono atomici. Ripetere la stessa richiesta restituisce lo stesso lotto; usare
la stessa chiave con dati diversi restituisce 409. Il form conserva dati e chiave
dopo una risposta incerta, evitando doppi lotti al nuovo tentativo.

Ordine dei lock PostgreSQL: associazione/gruppo di assegnazione, gruppo ricariche,
poi `card_batches IN SHARE ROW EXCLUSIVE MODE`, senza commit intermedi. La
creazione da ricarica acquisisce anche il lock della tabella già usato dalle API
manuali, così la verifica degli intervalli e la scrittura restano serializzate.
Non sono necessarie migration. Il flusso WhatsApp descritto sotto conserva la
propria regola di numerazione esclusivamente nel pool condiviso ASSONAM.

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
