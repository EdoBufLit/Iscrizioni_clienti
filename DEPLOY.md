# Deploy Notes

## Migrazioni

Dopo il deploy esegui:

```bash
docker compose exec -T web alembic upgrade head
```

Il workflow Hetzner continua a usare `docker compose up -d --build`; il nuovo servizio `email-worker` parte automaticamente perche definito nel `docker-compose.yml`.

## Worker Email

Vedere i log del worker:

```bash
docker logs -f email-worker
```

Eseguire un ciclo singolo manuale:

```bash
docker compose exec -T email-worker python -m app.workers.email_sender --once
```

## Coda Outbox

Verificare lo stato della coda:

```sql
SELECT
  id,
  email_type,
  to_email,
  status,
  priority,
  attempts,
  next_retry_at,
  sent_at,
  last_error
FROM email_outbox
ORDER BY priority ASC, next_retry_at ASC, created_at ASC;
```

Email bloccate o in retry:

```sql
SELECT id, email_type, to_email, status, attempts, next_retry_at, last_error
FROM email_outbox
WHERE status IN ('queued', 'failed', 'sending')
ORDER BY next_retry_at ASC, created_at ASC;
```

## Test Manuale

1. Esegui una migrazione: `docker compose exec -T web alembic upgrade head`
2. Enqueue una mail di test dal backend: `POST /api/super-admin/test-email`
3. Controlla `email_outbox` finche la riga passa da `queued` a `sent`
4. Segui i log con `docker logs -f email-worker`

Se SMTP non e configurato correttamente, la mail resta in `email_outbox` con `status='failed'` e `next_retry_at` valorizzato per il retry successivo.
