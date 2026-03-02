# Deploy Notes

## Hetzner Workflow

Il workflow GitHub Actions `deploy-hetzner.yml` ora scrive `${APP_PATH}/.env` sul server prima di eseguire `docker compose up -d --build`.

Contenuto propagato nel file `.env`:

- env applicative gia esistenti (`SECRET_KEY`, `BASE_URL`, `FRONTEND_URL`, SMTP, Google Wallet, DB)
- credenziali Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`)
- nuove env WhatsApp/OpenAI:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `TWILIO_ALERT_FLOW_SID`
  - `TWILIO_WHATSAPP_FROM`
  - `ADMIN_PHONE_E164`
  - `TWILIO_SMS_FROM`

Metadata build:

- `GIT_SHA`
- `BUILD_TIME`

## GitHub Secrets

Creare o verificare in GitHub:

- `SECRET_KEY`
- `BASE_URL`
- `FRONTEND_URL`
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`
- `DATABASE_URL`
- `POSTGRES_PASSWORD`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
- `SMTP_USE_TLS`
- `GOOGLE_WALLET_ISSUER_ID`
- `GOOGLE_APPLICATION_CREDENTIALS`
- `GOOGLE_WALLET_SA_B64`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `TWILIO_ALERT_FLOW_SID`
- `TWILIO_WHATSAPP_FROM`
- `ADMIN_PHONE_E164`
- `TWILIO_SMS_FROM`

## Migrazioni

Dopo il deploy esegui:

```bash
docker compose exec -T web alembic upgrade head
```

## Verifica Env

File server:

```bash
cd /opt/assonam
grep -E 'OPENAI|TWILIO_ALERT_FLOW_SID|TWILIO_WHATSAPP_FROM' .env
```

Dentro il container backend:

```bash
docker compose exec -T web /bin/sh -lc "printenv | grep OPENAI"
docker compose exec -T web /bin/sh -lc "printenv | grep TWILIO"
```

## Worker

`email-worker` continua a gestire solo la coda `email_outbox`.
`low-cards-worker` esegue invece il job periodico `low_cards_alert_job` con intervallo configurato da `LOW_CARDS_ALERT_JOB_INTERVAL_SECONDS`.

Log outbox email:

```bash
docker logs -f email-worker
```

Log low-cards:

```bash
docker logs -f low-cards-worker
```

Esecuzione singola outbox email:

```bash
docker compose exec -T email-worker python -m app.workers.email_sender --once
```

Esecuzione manuale solo alert low-cards:

```bash
docker compose exec -T low-cards-worker python -m app.workers.low_cards_alerts
docker compose exec -T low-cards-worker python -m app.workers.low_cards_alerts --force
docker compose exec -T low-cards-worker python -m app.workers.low_cards_scheduler --once
```

## Endpoint Manuali

Trigger manuale job alert via super admin:

```http
POST /api/super-admin/alerts/low-cards/run
Content-Type: application/json

{"force": false}
```

Bot WhatsApp compatibile con Twilio Studio HTTP POST:

```http
POST /api/whatsapp/bot
Content-Type: application/json

{"from":"whatsapp:+39333111222","body":"ordino tessere","profile_name":"Mario"}
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

1. Esegui la migration: `docker compose exec -T web alembic upgrade head`
2. Verifica env nel container: `docker compose exec -T web /bin/sh -lc "printenv | grep OPENAI"`
3. Prova il bot con `curl` o via Studio Twilio.
4. Esegui il job alert manuale: `docker compose exec -T low-cards-worker python -m app.workers.low_cards_alerts --force`
5. Controlla i log di `email-worker`, `low-cards-worker` e gli execution log di Twilio Studio.

Se SMTP non e configurato correttamente, la mail resta in `email_outbox` con `status='failed'` e `next_retry_at` valorizzato per il retry successivo.
