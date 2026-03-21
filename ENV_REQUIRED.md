# Environment Variables

All environment variables used by the application. Variables marked **required** must be set in production.

## Application

| Variable | Required | Default | Description |
|---|---|---|---|
| `SECRET_KEY` | **Yes** | `supersecretkey` | Secret key for signing session cookies and tokens. Use a long random string in production. |
| `BASE_URL` | **Yes** | `http://localhost:8000` | Public base URL of the application (e.g. `https://app.assonam.it`). Used for API redirects. |
| `FRONTEND_URL` | **Yes** | _(empty)_ | Public URL of the frontend (e.g. `https://assonam.it`). Used for magic links. If missing, falls back to `BASE_URL` + `/app`. |
| `INGEST_RATE_LIMIT_MAX_REQUESTS` | No | `20` | Max public ingest calls allowed per `org_slug + client_ip` within the rate-limit window. |
| `INGEST_RATE_LIMIT_WINDOW_SECONDS` | No | `300` | Duration (seconds) of the public ingest rate-limit window. |
| `DATABASE_URL` | No | `sqlite:///./data/app.db` (local) or `sqlite:////app/data/app.db` (Docker) | SQLAlchemy database URL. Switch to PostgreSQL with `postgresql+psycopg2://assonam:${POSTGRES_PASSWORD}@db:5432/assonam`. |
| `POSTGRES_PASSWORD` | No | _(empty)_ | Password for the bundled Docker Compose PostgreSQL service (`db`). Required only when using PostgreSQL. |
| `APP_DATA_DIR` | No | `<project_root>/data` (local) or `/app/data` (container) | Base directory for persistent application data. Used to resolve uploads and generated welcome videos. |
| `UPLOAD_DIR` | No | `<APP_DATA_DIR>/uploads` | Directory for storing uploaded member documents. |
| `SPA_DIR` | No | `frontend/dist` | Path to the built frontend SPA directory. |
| `AFFILIAZIONE_ENABLED` | No | `false` | Enables public affiliation endpoints (`/api/affiliazione/*`). If `false`, public affiliation routes return `404`. |

Note: frontend does not use a build-time affiliation flag. Public UI visibility is driven at runtime by `/api/capabilities` (backed by `AFFILIAZIONE_ENABLED`).

## Super Admin Credentials

The super admin account is bootstrapped from environment variables (no database record).

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUPER_ADMIN_EMAIL` | **Yes** | `admin@assonam.it` | Email address for the super admin login. |
| `SUPER_ADMIN_PASSWORD` | **Yes** | `admin` | Password for the super admin login. Must be changed in production. |

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
