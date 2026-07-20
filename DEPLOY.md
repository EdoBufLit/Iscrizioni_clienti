# Deploy Notes

## Hetzner Workflow

Il workflow GitHub Actions `deploy-hetzner.yml` ora:

1. builda le immagini Docker pesanti in GitHub Actions e le pubblica su GHCR;
2. scrive `${APP_PATH}/.env` sul server con i tag immagine da usare;
3. esegue sul server solo `docker compose pull`, migration e restart mirato dei servizi toccati.

Questo evita i picchi RAM causati da `docker compose build` sul nodo Hetzner durante deploy.

Contenuto propagato nel file `.env`:

- ambiente esplicito `APP_ENV=production` (valore fisso del workflow, non un secret)
- env applicative gia esistenti (`SECRET_KEY`, `BASE_URL`, `FRONTEND_URL`, SMTP, Google Wallet, DB)
- credenziali Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`)
- nuove env WhatsApp/OpenAI:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `TWILIO_LOW_CARDS_FLOW_SID`
  - `TWILIO_ALERT_FLOW_SID`
  - `TWILIO_WHATSAPP_FROM`
  - `ADMIN_PHONE_E164`
  - `TWILIO_SMS_FROM`
  - `TG_BOT_TOKEN`
  - `TG_CHAT_ID`
  - `SUMUP_CREDENTIALS_ENCRYPTION_KEY`
  - `ENABLE_WHATSAPP`
  - `WHATSAPP_PROVIDER`
  - `GREEN_API_BASE_URL`
  - `GREEN_API_WEBHOOK_SECRET`
  - `GREEN_API_WEBHOOK_ALLOWED_IPS`

Image refs scritti automaticamente dal workflow:

- `APP_RUNTIME_IMAGE`
- `AFFILIATION_VIDEO_WORKER_IMAGE`
- `EVOLUTION_API_IMAGE`

Metadata build:

- `GIT_SHA`
- `BUILD_TIME`

## GitHub Secrets

Il deploy imposta direttamente `APP_ENV=production`. Prima del rollout il
backend rifiuta l'avvio se secret, URL pubblici HTTPS o credenziali bootstrap
super-admin sono mancanti/default; non viene dedotto un ambiente locale da
`localhost` o da URL vuoti.

Il Compose base richiede che `APP_ENV` sia valorizzato esplicitamente e quindi
interrompe gia `docker compose config` se manca. Anche avviando direttamente
l'immagine, l'assenza della variabile ricade su `production`, mai su `local`.

Le variabili `SUPER_ADMIN_*` servono al bootstrap e non ruotano un account già
presente nel database. Se l'istanza è nata con credenziali storiche di default,
verificare e ruotare anche quell'account prima del rollout; il gate runtime
controlla la configurazione, non può ricostruire la password dal relativo hash.

Creare o verificare in GitHub:

- `SECRET_KEY`
- `BASE_URL`
- `FRONTEND_URL`
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`
- `MFA_ENCRYPTION_KEY` (segreto casuale dedicato, almeno 32 caratteri; non riutilizzare `SECRET_KEY`)
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
- `TWILIO_LOW_CARDS_FLOW_SID`
- `TWILIO_ALERT_FLOW_SID`
- `TWILIO_WHATSAPP_FROM`
- `ADMIN_PHONE_E164`
- `TWILIO_SMS_FROM`
- `TG_BOT_TOKEN`
- `TG_CHAT_ID`
- `ENABLE_WHATSAPP`
- `WHATSAPP_PROVIDER`
- `SUMUP_CREDENTIALS_ENCRYPTION_KEY`

Green API webhook secrets are optional. Add these GitHub secrets only when
needed:

- `GREEN_API_BASE_URL` (optional; defaults to `https://api.green-api.com`)
- `GREEN_API_WEBHOOK_SECRET` (optional global `webhookUrlToken`)
- `GREEN_API_WEBHOOK_ALLOWED_IPS` (optional override of the documented official list)

The workflow derives `GREEN_API_WEBHOOK_REQUIRE_SECRET`: it writes `true` only
when `GREEN_API_WEBHOOK_SECRET` is non-empty, otherwise `false`. It must not be
hard-coded to `true`, because associations that have not configured
`webhookUrlToken` use the fail-closed source-IP fallback and do not require a
provider restart.

### Green API webhook authentication

The endpoint accepts a webhook only for a known active `idInstance` and then
applies this order:

1. if a per-association or global secret exists, the matching Bearer token is mandatory;
2. if no secret exists and strict mode is off, the proxy-resolved source IP must match `GREEN_API_WEBHOOK_ALLOWED_IPS`;
3. if strict mode is on but no secret exists, every request is rejected.

An allowed IP never bypasses a configured secret. The default list was checked
on 15 July 2026 against the
[official Green API Webhook Endpoint page](https://green-api.com/en/docs/api/receiving/technology-webhook-endpoint/).
To adopt a secret later, set the same value in Green API `webhookUrlToken` via
console/`setSettings` and in ASSONAM; no org-admin workflow changes are needed.

The host Nginx must forward `X-Forwarded-For`, and port 8000 must remain bound
to `127.0.0.1`, so `get_client_ip` can trust only the local/private proxy peer
instead of an arbitrary Internet header.

### Preflight identita legacy (non eseguire automaticamente)

Prima del rollout eseguire questa query **in sola lettura** sul PostgreSQL di
produzione. Conta i pending creati prima della capability di continuazione che
non hanno una password; quelli con tessera sono evidenziati separatamente.

```sql
SELECT
  COUNT(*) AS pending_totali,
  SUM(CASE WHEN password_hash IS NULL THEN 1 ELSE 0 END) AS pending_senza_password,
  SUM(
    CASE WHEN password_hash IS NULL AND card_no IS NOT NULL THEN 1 ELSE 0 END
  ) AS pending_senza_password_con_tessera
FROM members
WHERE deleted_at IS NULL
  AND LOWER(CAST(status AS text)) IN (
    'pending_docs', 'pending_verification', 'pending_cards'
  );

SELECT id, org_id, email, status, card_no, card_year
FROM members
WHERE deleted_at IS NULL
  AND password_hash IS NULL
  AND LOWER(CAST(status AS text)) IN (
    'pending_docs', 'pending_verification', 'pending_cards'
  )
ORDER BY (card_no IS NOT NULL) DESC, id ASC;
```

Se il conteggio non e zero, predisporre **prima** del deploy un recupero via
email con capability monouso, scadenza breve e hash nel database. Non
riabilitare il riuso della pratica basato sulla sola conoscenza dell'email o di
altri dati anagrafici.

Elencare anche gli account super-admin persistiti: la validazione delle env di
bootstrap non sostituisce la password gia hashata nel database.

```sql
SELECT id, email, role, is_active, created_at
FROM admin_users
WHERE org_id IS NULL
   OR LOWER(CAST(role AS text)) IN ('super_admin', 'superadmin')
ORDER BY id;
```

Il controllo seguente e in sola lettura e non stampa hash o password; segnala
se un account usa ancora la password bootstrap storica `admin`:

```bash
docker compose exec -T web python - <<'PY'
from app.db import SessionLocal
from app.models import AdminRole, AdminUser
from app.security import verify_password

db = SessionLocal()
try:
    admins = db.query(AdminUser).filter(AdminUser.role == AdminRole.SUPER_ADMIN).all()
    for admin in admins:
        historical_default = bool(
            admin.password_hash and verify_password("admin", admin.password_hash)
        )
        print(
            f"id={admin.id} email={admin.email} active={admin.is_active} "
            f"historical_default_password={historical_default}"
        )
finally:
    db.close()
PY
```

Se compare `historical_default_password=True`, ruotare la password prima di
proseguire usando una procedura amministrativa autenticata o uno script
controllato che chiami `get_password_hash`; non copiare password in SQL, log,
ticket o repository. Verificare poi il login con la nuova credenziale e
chiudere le sessioni browser precedenti.

## Migrazioni

Le migration vengono eseguite dal workflow con il service dedicato `migrate`, riusando l'immagine gia pullata invece di creare un secondo build path sul server.

Comando manuale equivalente:

```bash
docker compose --profile ops run --rm --no-deps migrate
```

## Verifica Env

File server:

```bash
cd /opt/assonam
grep -E 'OPENAI|TWILIO_LOW_CARDS_FLOW_SID|TWILIO_ALERT_FLOW_SID|TWILIO_WHATSAPP_FROM|TG_BOT_TOKEN|TG_CHAT_ID' .env
grep -E '^GREEN_API_(BASE_URL|WEBHOOK_SECRET|WEBHOOK_REQUIRE_SECRET|WEBHOOK_ALLOWED_IPS)=' .env
```

Dentro il container backend:

```bash
docker compose exec -T web /bin/sh -lc "printenv | grep OPENAI"
docker compose exec -T web /bin/sh -lc "printenv | grep TWILIO"
docker compose exec -T web /bin/sh -lc "printenv | grep TG_"
docker compose exec -T web /bin/sh -lc "printenv | grep '^GREEN_API_'"
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
docker logs -f --tail=200 app-low-cards-worker-1
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
docker compose exec -T low-cards-worker python - <<'PY'
from app.db import SessionLocal
from app.services.low_cards_alerts import run_low_cards_alert_job

db = SessionLocal()
try:
    print(run_low_cards_alert_job(db=db, force=True))
finally:
    db.close()
PY
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

1. Verifica i tag immagine applicati: `grep -E 'APP_RUNTIME_IMAGE|AFFILIATION_VIDEO_WORKER_IMAGE|EVOLUTION_API_IMAGE' .env`
2. Verifica la migration: `docker compose --profile ops run --rm --no-deps migrate`
3. Verifica env nel container: `docker compose exec -T web /bin/sh -lc "printenv | grep SUMUP_CREDENTIALS_ENCRYPTION_KEY"`
4. Prova il bot con `curl` o via Studio Twilio.
5. Esegui il job alert manuale: `docker compose exec -T low-cards-worker python -m app.workers.low_cards_alerts --force`
6. Controlla i log di `email-worker`, `low-cards-worker` e gli execution log di Twilio Studio.

Controlli rapidi worker su server:

```bash
docker compose ps
docker logs -f --tail=200 app-low-cards-worker-1
```

Se SMTP non e configurato correttamente, la mail resta in `email_outbox` con `status='failed'` e `next_retry_at` valorizzato per il retry successivo.

## Mitigazioni OOM consigliate

Host Hetzner:

```bash
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-assonam-swappiness.conf
```

Controlli memoria durante deploy:

```bash
free -m
docker stats --no-stream
ps -eo pid,ppid,rss,comm --sort=-rss | head -n 15
```

Ordine rollout sicuro:

1. `docker compose up -d db`
2. `docker compose pull ...`
3. `docker compose --profile ops run --rm --no-deps migrate`
4. `docker compose up -d --no-deps web`
5. `docker compose up -d --no-deps email-worker low-cards-worker`
6. Riavviare `affiliation-video-worker` o `evolution-api` solo se l'immagine o la loro compose specifica sono cambiate
