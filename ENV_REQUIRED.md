# Environment Variables

All environment variables used by the application. Variables marked **required** must be set in production.

## Application

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_ENV` | **Yes** | `production` outside Compose; required by Compose | Explicit environment: `local`, `test`, `staging`, or `production`. The Hetzner workflow writes `production`; local development must opt in with `APP_ENV=local`. |
| `SECRET_KEY` | **Yes** | `supersecretkey` | Secret key for signing session cookies and tokens. Use a long random string in production. |
| `BASE_URL` | **Yes** | `http://localhost:8000` | Public base URL of the application (e.g. `https://app.assonam.it`). Used for API redirects. |
| `FRONTEND_URL` | **Yes** | _(empty)_ | Public URL of the frontend (e.g. `https://assonam.it`). Used for magic links. If missing, falls back to `BASE_URL` + `/app`. |
| `ORG_ADMIN_SESSION_DAYS` | No | `30` | Duration in days for the persistent org-admin browser session cookie. |
| `INGEST_RATE_LIMIT_MAX_REQUESTS` | No | `20` | Max public ingest calls allowed per `org_slug + client_ip` within the rate-limit window. |
| `INGEST_RATE_LIMIT_WINDOW_SECONDS` | No | `300` | Duration (seconds) of the public ingest rate-limit window. |
| `DATABASE_URL` | No | `sqlite:///./data/app.db` (local) or `sqlite:////app/data/app.db` (Docker) | SQLAlchemy database URL. Switch to PostgreSQL with `postgresql+psycopg2://assonam:${POSTGRES_PASSWORD}@db:5432/assonam`. |
| `POSTGRES_PASSWORD` | No | _(empty)_ | Password for the bundled Docker Compose PostgreSQL service (`db`). Required only when using PostgreSQL. |
| `APP_DATA_DIR` | No | `<project_root>/data` (local) or `/app/data` (container) | Base directory for persistent application data. Used to resolve uploads and generated welcome videos. |
| `UPLOAD_DIR` | No | `<APP_DATA_DIR>/uploads` | Directory for storing uploaded member documents. |
| `SPA_DIR` | No | `frontend/dist` | Path to the built frontend SPA directory. |
| `AFFILIAZIONE_ENABLED` | No | `false` | Enables public affiliation endpoints (`/api/affiliazione/*`). If `false`, public affiliation routes return `404`. |
| `SUMUP_CREDENTIALS_ENCRYPTION_KEY` | **Yes** (SumUp feature) | _(empty)_ | Global server-side encryption key used to protect per-organization SumUp API keys stored in DB. Must be a long random secret and must stay stable across deploys. |

Deployment validation is fail-closed for `APP_ENV=staging` and
`APP_ENV=production`: `SECRET_KEY` must contain at least 32 characters and must
not be a known default; `BASE_URL` and `FRONTEND_URL` must be public HTTPS
origins without paths, credentials, query strings, or local/private hosts; and
the super-admin email/password must not use bootstrap defaults. Environment
classification never depends on URL hostnames.

Note: frontend does not use a build-time affiliation flag. Public UI visibility is driven at runtime by `/api/capabilities` (backed by `AFFILIAZIONE_ENABLED`).

## Super Admin Credentials

The super-admin account is stored in the database. These variables are used only
to bootstrap it when no super-admin exists; changing them does not rotate an
already persisted account. Verify separately that an existing account was not
created with the historical default password.

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUPER_ADMIN_EMAIL` | **Yes** | `admin@assonam.it` | Email address for the super admin login. The default is rejected in staging/production. |
| `SUPER_ADMIN_PASSWORD` | **Yes** | `admin` | Password for the super admin login. The default is rejected in staging/production. |

## SMTP (Email)

When `SMTP_HOST` is empty the application falls back to writing emails to `email_log.txt` instead of sending them. Configure all SMTP variables for production email delivery.

| Variable | Required | Default | Description |
|---|---|---|---|
| `SMTP_HOST` | **Yes** (prod) | _(empty)_ | SMTP server hostname (e.g. `smtp.gmail.com`). |
| `SMTP_PORT` | No | `587` | SMTP server port. |
| `SMTP_USER` | **Yes** (prod) | _(empty)_ | SMTP authentication username. |
| `SMTP_PASSWORD` | **Yes** (prod) | _(empty)_ | SMTP authentication password or app-specific password. |
| `SMTP_FROM` | No | `noreply@assonam.it` | SMTP envelope sender used for delivery. Remains the canonical ASSONAM transport sender. |
| `EMAIL_FROM` | No | `SMTP_FROM` | Visible `From` header used by `system` mode. Leave unchanged for official ASSONAM emails. |
| `SMTP_USE_TLS` | No | `true` | Enable STARTTLS (`true`, `1`, or `yes` to enable). |
| `MAIL_FROM_DOMAIN` | No | _(empty)_ | Visible sender domain used only in `association` mode (example: `notifiche.assonam.it`). If missing, all association emails fall back to `system` mode. |
| `ASSOCIATION_MAIL_API_TOKEN` | No | _(empty)_ | Mailtrap API Bearer token used only for `association` mode delivery. If missing, association-mode sends fail explicitly instead of reusing SMTP. |

## WhatsApp / Twilio

Required for the WhatsApp bot and the low-cards alert flow.

| Variable | Required | Default | Description |
|---|---|---|---|
| `TWILIO_ACCOUNT_SID` | **Yes** (Twilio features) | _(empty)_ | Twilio Account SID used by `twilio-python`. |
| `TWILIO_AUTH_TOKEN` | **Yes** (Twilio features) | _(empty)_ | Twilio Auth Token used by `twilio-python`. |
| `TWILIO_LOW_CARDS_FLOW_SID` | Recommended (low-cards alerts) | _(empty)_ | Preferred Twilio Studio Flow SID (`FW...`) for low-cards WhatsApp alerts. Falls back to `TWILIO_STUDIO_FLOW_SID` / `TWILIO_ALERT_FLOW_SID` if unset. |
| `TWILIO_ALERT_FLOW_SID` | **Yes** (low-cards alerts) | _(empty)_ | Twilio Studio Flow SID (`FW...`) for the low-cards WhatsApp alert. |
| `TWILIO_WHATSAPP_FROM` | **Yes** (low-cards alerts) | _(empty)_ | WhatsApp sender used for Studio execution (example: `whatsapp:+390299914307`). |
| `TWILIO_SMS_FROM` | No | _(empty)_ | Legacy SMS sender kept for backward compatibility. The nuove tessere admin notification no longer uses it. |
| `ADMIN_PHONE_E164` | No | _(empty)_ | Legacy admin phone kept for backward compatibility. The nuove tessere admin notification no longer uses it. |
| `TG_BOT_TOKEN` | **Yes** (nuove tessere admin notification) | _(empty)_ | Telegram bot token used by `send_telegram_message(text)` for the WhatsApp bot recharge request alert. |
| `TG_CHAT_ID` | **Yes** (nuove tessere admin notification) | _(empty)_ | Telegram chat id that receives the nuove tessere admin notification sent by the WhatsApp bot flow. |
| `LOW_CARDS_ALERT_JOB_INTERVAL_SECONDS` | No | `300` | How often the dedicated `low-cards-worker` re-checks organizations for low-card alerts. |

Association-level storage:

- `organizations.whatsapp_e164`: preferred destination number for low-cards alerts.
- The low-cards alert worker sends only when `whatsapp_e164` is populated and valid.

## WhatsApp / Green API

Green API webhook authentication is dual and fail-closed. A configured
per-association or global secret always takes precedence and must match; an
official source IP never bypasses a missing or wrong configured secret. When no
secret exists, the request is accepted only if its proxy-resolved source IP is
allowed **and** `idInstance` belongs to an active configured association.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ENABLE_WHATSAPP` | No | `false` | Enables the WhatsApp communication runtime. |
| `WHATSAPP_PROVIDER` | No | `green_api` | Default provider for new connections. |
| `GREEN_API_BASE_URL` | No | `https://api.green-api.com` | Green API base URL. |
| `GREEN_API_WEBHOOK_SECRET` | Recommended | _(empty)_ | Global fallback `webhookUrlToken`. If set, every connection without its own secret must present this Bearer token. |
| `GREEN_API_WEBHOOK_REQUIRE_SECRET` | No | `false` | Explicit strict mode. With no global/per-association secret, `true` rejects every webhook; `false` uses the official-IP fallback. A configured secret is always required regardless of this flag. |
| `GREEN_API_WEBHOOK_ALLOWED_IPS` | No | Current official Green API list below | Comma-separated IPv4/IPv6 addresses or CIDRs used only when no secret is configured. Invalid entries, an empty deployed list, and `0.0.0.0/0` or `::/0` fail closed. |
| `WHATSAPP_WEBHOOK_MAX_BODY_BYTES` | No | `524288` | Maximum canonical Green API webhook payload size. |

Default source addresses, checked on **15 July 2026** against the
[Green API Webhook Endpoint documentation](https://green-api.com/en/docs/api/receiving/technology-webhook-endpoint/):

```text
46.101.109.139,51.250.12.167,51.250.84.44,51.250.95.149,89.169.137.216,158.160.49.84,165.22.93.202,167.172.162.71,104.248.252.93,158.160.139.176,64.226.111.11,207.154.255.195
```

Operational rules:

- No provider restart or settings change is required to use the IP fallback.
- To enable a secret, configure the same value as Green API `webhookUrlToken`
  (console or `setSettings`) and in the association setup or global env.
- The Hetzner workflow sets `GREEN_API_WEBHOOK_REQUIRE_SECRET=true` only when
  the global GitHub secret is non-empty; otherwise it leaves the verified-IP
  fallback active. Per-association secrets are still enforced automatically.
- The backend is exposed only on host loopback. Nginx must forward the real
  source through `X-Forwarded-For`; the application resolves it with
  `get_client_ip` only when the direct peer is a trusted local/private proxy.
- Re-check the provider document periodically. If Green API changes its
  addresses, update this env before the old addresses are retired.

## WhatsApp / Evolution API Lite

Optional internal-only connector for a separate Evolution API Lite container running in the same Docker network as ASSONAM.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ENABLE_WHATSAPP_EVOLUTION` | No | `false` | Enables ASSONAM runtime awareness of the internal Evolution API Lite connector and instructs deploy automation to provision the extra service when `EVOLUTION_API_KEY` is also configured. |
| `EVOLUTION_API_BASE_URL` | No | `http://evolution-api:8080` | Internal base URL used by ASSONAM containers to reach the Evolution API Lite service over the Docker network. |
| `EVOLUTION_API_KEY` | Yes (Evolution Lite enabled) | _(empty)_ | Shared API key between ASSONAM and Evolution Lite. Must match Evolution Lite `AUTHENTICATION_API_KEY`. |

Runtime notes:

- Evolution Lite uses the same PostgreSQL server already configured by `DATABASE_URL`, but a separate database named `evolution`.
- The deploy workflow renders a minimal runtime file at `secrets/evolution-api-lite.env` with only:
- `SERVER_PORT`
- `SERVER_URL`
- `DATABASE_PROVIDER`
- `DATABASE_CONNECTION_URI`
- `AUTHENTICATION_API_KEY`
- No Redis, subdomain or dedicated HTTPS endpoint is required for the initial internal test setup.

## OpenAI

Optional fallback for generic bot replies outside the tessere ordering flow.

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | No | _(empty)_ | Enables OpenAI fallback in `POST /api/whatsapp/bot`. If missing, the bot uses a static fallback reply. |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | Chat Completions model used by the WhatsApp bot fallback. |

## Affiliazione / Stripe (optional)

Stripe is optional. The affiliation flow still works with bank transfer and cash when Stripe is not configured.

| Variable | Required | Default | Description |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | No | _(empty)_ | Stripe secret key. Required only if you want card checkout enabled. |
| `STRIPE_WEBHOOK_SECRET` | No | _(empty)_ | Stripe webhook signing secret. Required only if card checkout is enabled. |
| `STRIPE_PRICE_ID` | No | _(empty)_ | Stripe Price ID used by Checkout. Required only if card checkout is enabled. |
| `STRIPE_PUBLISHABLE_KEY` | No | _(empty)_ | Publishable key (needed only if your frontend directly uses Stripe.js). |
| `STRIPE_THIN_WEBHOOK_SECRET` | No | _(empty)_ | Stripe signing secret for the thin v2 account-events webhook used by the Stripe Connect demo. |
| `STRIPE_BILLING_WEBHOOK_SECRET` | No | _(empty)_ | Stripe signing secret for the normal billing/subscription webhook used by the Stripe Connect demo. |
| `STRIPE_PLATFORM_PRICE_ID` | No | _(empty)_ | Recurring platform Price ID used by the Stripe Connect demo subscription checkout. |
| `STRIPE_REQUIRE_PUBLISHABLE_KEY` | No | `false` | If `true`, backend marks Stripe configured only when `STRIPE_PUBLISHABLE_KEY` is present. |
| `STRIPE_AFFILIATION_PRICE_CENTS` | No | `9000` | Informational affiliation amount shown in UI (bonifico/contanti summary). |
| `ENABLE_STRIPE_CONNECT_DEMO` | No | `false` | Enables the isolated Stripe Connect demo routes, org-admin billing page, demo storefront, and webhook handlers. |
| `AFFILIATION_VIDEO_ENABLED` | No | `true` | Enables affiliation welcome-video pipeline (enqueue + worker processing + UI states). When `false`, UI shows "Video disattivato". |
| `AFFILIATION_VIDEO_WORKER_ENABLED` | No | `false` | Enables the optional Remotion affiliation video worker profile at deploy time (`video-worker`). |
| `AFFILIATION_VIDEO_RENDERER_DIR` | No | `/app/video-renderer/services/welcome-video` | Path to Remotion renderer sources/build inside the container. |
| `AFFILIATION_VIDEO_OUTPUT_DIR` | No | `<APP_DATA_DIR>/videos/welcome` | Directory for generated personalized affiliation videos. Public URL remains `/videos/welcome/{application_id}.mp4`. |

Runtime behavior:

- `STRIPE_ENABLED` is computed automatically from env presence (no startup crash on missing values).
- If Stripe is disabled, checkout endpoint returns `503` with guidance to use bonifico/contanti.
- Stripe webhook endpoint stays reachable and returns `200` when Stripe is disabled (no retry storm).
- Video worker does not require Stripe env vars. Required baseline for worker execution: `DATABASE_URL` + `AFFILIATION_VIDEO_ENABLED=true` + `AFFILIATION_VIDEO_WORKER_ENABLED=true`.
- The affiliation video worker is optional: with `AFFILIATION_VIDEO_WORKER_ENABLED=false` deploy does not start/build the `video-worker` profile by default.
- `GET /api/affiliazione/draft/{token}` exposes `welcome_video_ready`, `welcome_video_url`, and `welcome_video_error`. If the MP4 already exists on disk, these fields take precedence over stale DB job status.

Webhook smoke test for Twilio WhatsApp:

```bash
curl -i -X POST "http://localhost:8000/api/whatsapp/bot" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "Body=ciao&From=whatsapp:+393891605511&To=whatsapp:+390299914307&MessageSid=SM123&WaId=393891605511&ProfileName=Test&NumMedia=0"
```

Expected result: HTTP `200`.

## Integration API Keys

No dedicated environment variable is required for issuer integrations. Keys are stored in DB table `integration_api_keys` as salted hashes (`sha256(raw_key + SECRET_KEY)`).

Integration keys are managed only by ASSONAM super admin using:

- `GET /api/super-admin/orgs/{org_id}/integration-keys?name=pienissimo`
- `POST /api/super-admin/orgs/{org_id}/integration-keys`
- `POST /api/super-admin/orgs/{org_id}/integration-keys/{id}/rotate`
- `DELETE /api/super-admin/orgs/{org_id}/integration-keys/{id}`

External issuer requests must send:

- Header: `X-ASSONAM-API-KEY: <raw-key>`
- Scope in DB (`scopes` JSON): `issue_member`
- Organization scoping via `org_id` on the API key record

## Ingest Endpoint (Pienissimo bridge)

- `POST /api/ingest/pienissimo/{org_slug}`
- Public endpoint (no auth header)
- Request is accepted only if organization has an active integration key with scope `issue_member`
- If integration is inactive/missing, endpoint returns `402` (`integration_inactive`)
- Endpoint normalizes flexible payload fields and calls internal issuer logic for the resolved org.

## Build Metadata (optional)

Set automatically by CI/CD pipelines. Not required for local development.

| Variable | Required | Default | Description |
|---|---|---|---|
| `GIT_SHA` | No | _(empty)_ | Git commit SHA, shown in the admin footer. |
| `BUILD_TIME` | No | _(empty)_ | ISO 8601 build timestamp. |

Deploy-managed image refs:

- `APP_RUNTIME_IMAGE`
- `AFFILIATION_VIDEO_WORKER_IMAGE`
- `EVOLUTION_API_IMAGE`

These are written automatically by the Hetzner deploy workflow so the server can `docker compose pull` prebuilt GHCR images instead of building on-host.
