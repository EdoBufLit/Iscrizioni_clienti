# Association Self-Serve Member Signup & Portal

A minimal web application for association member signup, document upload, and member status verification.

## Features

- **Public Signup**: `/join/{org_slug}`
- **Document Upload**: ID and Fiscal Code (PDF/Image)
- **Member Portal**: Magic link login (no passwords)
- **Status Tracking**: Pending -> Active automation
- **Issuer Integration API**: `/api/integrations/members/issue` (API key scoped per association)

## Setup (Development)

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   cd frontend && npm install
   ```

2. **Initialize Database**
   ```bash
   # Run Alembic migrations (recommended)
   alembic upgrade head

   # Then seed data
   python init_db.py
   ```

3. **Environment Variables**
   Create a `.env` file or export these variables:

   | Variable | Description | Default |
   |----------|-------------|---------|
   | `SECRET_KEY` | Secret for sessions and token hashing | `supersecretkey` |
   | `BASE_URL` | Public URL of the app (for emails) | `http://localhost:8000` |
   | `FRONTEND_URL` | Public URL of SPA (for member magic-link) | _(empty)_ |
   | `INGEST_RATE_LIMIT_MAX_REQUESTS` | Max requests per IP+org for public ingest window | `20` |
   | `INGEST_RATE_LIMIT_WINDOW_SECONDS` | Public ingest rate-limit window in seconds | `300` |
   | `APP_DATA_DIR` | Base persistent data directory | `data` |
   | `UPLOAD_DIR` | Directory for uploaded files | `<APP_DATA_DIR>/uploads` |
   | `LOGIN_TOKEN_EXPIRE_MINUTES` | Login link validity | `15` |
   | `JOIN_TOKEN_EXPIRE_MINUTES` | Signup continue link validity | `120` |
   | `SKIP_CREATE_ALL` | Disable auto schema creation | `0` (dev) / `1` (prod) |

### Affiliazione Feature Flags (safe deploy)

- `AFFILIAZIONE_ENABLED=false` (default): public affiliation routes are hidden (`404`) while super-admin review endpoints remain available.
- `AFFILIAZIONE_ENABLED=true`: enables public affiliation flow.
- Frontend affiliation UI is runtime-gated by `GET /api/capabilities` and does not use `VITE_AFFILIAZIONE_ENABLED`.

### Stripe Is Optional

Stripe is optional for affiliation payments.

- If Stripe env vars are missing, the app still starts normally.
- Bonifico and contanti remain fully available.
- Card checkout is enabled only when all required env vars exist:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_ID`
- Webhook route remains reachable and returns `200` when Stripe is disabled.

### Optional affiliation video worker

The Remotion affiliation video worker is optional and controlled by deploy flag:

- `AFFILIATION_VIDEO_ENABLED=true` (default): video pipeline enabled (queue + render + UI status).
- `AFFILIATION_VIDEO_ENABLED=false`: UI shows "Video disattivato" and backend skips video queueing.
- `AFFILIATION_VIDEO_WORKER_ENABLED=false` (default): deploy runs without the `video-worker` profile.
- `AFFILIATION_VIDEO_WORKER_ENABLED=true`: deploy enables docker compose profile `video-worker`.
- `AFFILIATION_VIDEO_OUTPUT_DIR` defaults to `<APP_DATA_DIR>/videos/welcome`; generated files are served publicly as `/videos/welcome/{application_id}.mp4`.
- `GET /api/affiliazione/draft/{token}` now returns `welcome_video_ready`, `welcome_video_url`, and `welcome_video_error`. If the MP4 exists on disk, those fields override stale `latest_video_job.status`.

The video worker is decoupled from Stripe: missing `STRIPE_*` env vars does not disable rendering.

Manual run example:

```bash
docker compose --profile video-worker up -d --build affiliation-video-worker
```

4. **Run Application**
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

## Production Deployment

**IMPORTANT**: In production, database schema must be managed **exclusively** by Alembic.

### Deployment Checklist

```bash
# 1. Set environment variable to disable create_all
export SKIP_CREATE_ALL=1

# 2. Run Alembic migrations
alembic upgrade head

# 3. Start application
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Why SKIP_CREATE_ALL?

| Mode | `SKIP_CREATE_ALL` | Schema Management |
|------|-------------------|-------------------|
| Development | `0` (default) | `create_all()` + auto-stamp Alembic |
| Production | `1` | Alembic migrations only |

Using `create_all()` in production causes:
- "table already exists" errors on `alembic upgrade`
- Schema drift between code and database
- Lost migration history

### Database Migration Commands

```bash
# Check current migration version
alembic current

# Upgrade to latest
alembic upgrade head

# Create new migration (after model changes)
alembic revision --autogenerate -m "description"

# Rollback one version
alembic downgrade -1
```

### Runtime Build/Version Checks

Use these commands on production to confirm which backend build is serving requests:

```bash
# Public version payload (includes git_sha/build_time when env is set)
curl -s https://<your-domain>/api/version | jq

# Local compose health/version check
curl -s http://127.0.0.1:8000/api/version | jq

# Verify running containers and detect stale replicas
docker compose ps
docker compose logs web --tail=200
```

`/api/version` is intended for runtime diagnostics and returns `version`, `git_sha`, `build_time`, and `request_id`.

### Email Outbox Worker

Le email applicative vengono ora accodate nella tabella `email_outbox` e consegnate dal servizio `email-worker`.

```bash
# Avvia web + worker
docker compose up -d --build

# Applica le migrazioni dopo il deploy
docker compose exec -T web alembic upgrade head

# Log del worker
docker logs -f email-worker
```

Dettagli operativi e query utili sono in [`DEPLOY.md`](DEPLOY.md).

### Association Email Sender Modes

Il sistema supporta due modalita esplicite per il mittente email:

- `system`: usa il mittente storico ASSONAM via SMTP (`SMTP_FROM` per envelope SMTP, `EMAIL_FROM` come header visibile se configurato).
- `association`: usa Mailtrap API con `ASSOCIATION_MAIL_API_TOKEN` e `MAIL_FROM_DOMAIN` per comporre il mittente visibile, ad esempio `Golden Age Club <golden-age-club@notifiche.assonam.it>`.

Regole operative:

- `SMTP_FROM` e `EMAIL_FROM` restano invariati e continuano a coprire tutte le email ufficiali ASSONAM.
- `association` mode si attiva solo se `MAIL_FROM_DOMAIN` esiste e `organizations.communications_enabled=true`.
- Il nome visibile usa `email_from_name_override`, altrimenti `organization.name`, con fallback finale `ASSONAM`.
- La parte locale usa `sender_email_local_part`, altrimenti viene generata dal nome associazione; se resta vuota, fallback a `org-{id}`.
- `reply_to_email` viene applicato solo in `association` mode.
- Se configurazione sender o association mode non sono disponibili, il sistema fa fallback automatico e loggato a `system`.
- Se `association` mode e selezionato ma `ASSOCIATION_MAIL_API_TOKEN` manca o Mailtrap rifiuta il sender, l'invio fallisce esplicitamente senza ricadere su SMTP.

### Modulo Comunicazioni

`organizations.communications_enabled` e un flag commerciale con default `false` ed e gestito solo dal super admin ASSONAM.

- Super admin: puo attivare o disattivare il modulo dalla gestione associazioni.
- Org admin: puo vedere la sezione `Comunicazioni`, ma puo usarla solo quando il modulo e attivo.
- Se il modulo non e attivo, la UI org-admin mostra stato locked con messaggio `Modulo Comunicazioni non attivo. Contatta ASSONAM per abilitarlo.` e blocca test email, campagne, template e altre azioni operative.

### Org-admin Comunicazioni

La dashboard org-admin include ora la sezione `Comunicazioni` su `/org-admin/comunicazioni`.

- `Overview`: stato del pacchetto, sender attuale e scorciatoie verso template, form e campagne.
- `Campaigns`: composer + storico invii nello stesso flusso, con audience estimate, dettaglio recipient e stato `queued/processing/sent/failed`.
- `Templates`: libreria con template `system` ASSONAM read-only ma duplicabili, filtri `all/system/custom/archived`, creazione da zero e preview fake.
- `Forms & automations`: builder form pubblico collegato alla libreria template e alle azioni post-submit.
- `Sending settings`: configurazione sender associazione, preview live e test email con esito reale del provider.

Regole operative:

- Le campagne usano sempre `association` mode.
- Se `communications_enabled=false`, tutte le azioni operative org-admin del modulo restano bloccate.
- L'invio email di test usa lo stesso sender resolver dell'associazione ma viene eseguito subito, restituendo successo o errore reale del provider.
- Ogni invio campagna salva uno snapshot destinatari in `email_campaign_recipients` prima dell'accodamento nel worker email; i recipient transitano tra `queued`, `processing`, `sent` e `failed`.
- I placeholder supportati sono `{{nome_socio}}`, `{{nome_associazione}}`, `{{numero_tessera}}`, `{{data_scadenza}}`, `{{link_rinnovo}}`, `{{link_documento}}`.
- I template di sistema non si modificano direttamente: vanno duplicati in template associazione prima della personalizzazione.
- I form condividono lo stesso gating del modulo Comunicazioni: se il modulo non e attivo, la sezione resta visibile ma locked con CTA disabilitate.
- Ogni form puo usare azioni post-submit semplici: `save submission` sempre attivo, `notify admin`, `send user confirmation`, `create internal request` e collegamento a un template admin/user della libreria Comunicazioni.

### Stripe Connect Demo

Il sample Stripe Connect e completamente isolato dai flussi attuali di affiliazione, tessere e future quote associative reali.

- Flag runtime: `ENABLE_STRIPE_CONNECT_DEMO=true`.
- UI org-admin dedicata: `/org-admin/billing`.
- Demo storefront pubblico: `/stripe-demo/storefront/{connected_account_id}`.
- Connected account: mappato direttamente su `organizations.stripe_connected_account_id`.
- Demo products/storefront: servono solo per mostrare prodotti creati sul connected account e direct charge Checkout con `application_fee_amount`.
- Subscription piattaforma: resta separata dal demo storefront e usa `customer_account = connected_account_id`.
- Base URL demo: usa `BASE_URL` se valido, altrimenti fallback a `https://assonam.it`.
- Country account creation: usa `organizations.country` se valido/mappabile; fallback `IT`.

Webhook demo:

- Thin v2 account events: `POST /api/webhooks/stripe/thin`
- Billing/subscription events: `POST /api/webhooks/stripe/billing`

Nota importante: i percorsi e le etichette `demo` sono intenzionali per non confondere questo sample con il futuro flusso reale della quota associativa socio ASSONAM.

## Integration API (Issuer Tessera)

External management systems can issue members directly as active through:

- `POST /api/integrations/members/issue`
- Required header: `X-ASSONAM-API-KEY`
- Required API key scope: `issue_member`
- Integration keys are managed by ASSONAM super admin only
- Key ownership is enforced server-side: request data cannot switch organization

### Ingest endpoint (Option A, org_slug path)

Use the ingest endpoint as your bridge entrypoint for Pienissimo payloads:

- `POST /api/ingest/pienissimo/{org_slug}`
- Public endpoint (no auth header)
- Works only when the target organization has an active integration key with scope `issue_member` (paywall gating)
- Returns `402` with `integration_inactive` when integration is not active for that organization
- Accepts flexible payload field names and normalizes to issuer flow internally
- Does not require `X-ASSONAM-API-KEY` in input; it reuses configured integration key server-side

### Super-admin key management endpoints

Only super admin can create/rotate/disable keys for a target organization:

```http
GET    /api/super-admin/orgs/{org_id}/integration-keys?name=pienissimo
POST   /api/super-admin/orgs/{org_id}/integration-keys
POST   /api/super-admin/orgs/{org_id}/integration-keys/{id}/rotate
DELETE /api/super-admin/orgs/{org_id}/integration-keys/{id}
```

`raw_key` is returned only by `create` and `rotate` responses. In DB, only `key_hash` is stored.

### Super-admin association delete/archive with card-range release

To archive or purge a disabled association and release its card range for reuse:

```http
DELETE /api/admin/associations/{association_id}?mode=archive|purge&release_range=true&force=false|true
```

- `mode=archive` (default): soft-archive (`is_active=false`, `deleted_at` set), keeps historical records, and releases assigned card batches.
- `mode=purge`: hard-delete organization and related records.
- `force=true`: required for purge when dependencies exist.

Response shape:

```json
{
  "ok": true,
  "mode": "archive",
  "releasedRange": { "start": 18401, "end": 18700 },
  "archivedAssociationId": 12,
  "purgedAssociationId": null
}
```

### Migration note (integration keys)

If your database was created before this integration flow, run:

```bash
alembic upgrade head
```

This applies the latest integration-key migrations (including legacy unique-constraint cleanup).

### Request example

```http
POST /api/integrations/members/issue
X-ASSONAM-API-KEY: <raw-key>
Content-Type: application/json
```

```json
{
  "org_slug": "my-association",
  "external_customer_id": "cust_12345",
  "email": "socio@example.com",
  "first_name": "Mario",
  "last_name": "Rossi",
  "phone": "+39333111222",
  "fiscal_code": "RSSMRA80A01H501Z",
  "send_email": true
}
```

## Development

- **Database**: SQLite at `data/app.db`
- **Logs**: Output to stdout
- **Frontend**: React + Vite in `frontend/`

## Forms module

- Admin route legacy: `org-admin/forms` -> redirect verso `/org-admin/comunicazioni?tab=forms`
- Public route: `/forms/:orgSlug/:slug`
- Legacy compatibility route still accepted: `/forms/:slug`
- The frontend public page is a single dynamic route that fetches form structure from `GET /api/forms/{orgSlug}/{slug}` and submits to `POST /api/forms/{orgSlug}/{slug}/submit`.
- The org-admin experience is now a visual studio with clear sections: `Builder`, `Design`, `Automazioni`, `Risposte`, `Condividi`.
- Each form stores its own `public_slug`, fields, visibility (`public` or `members_only`), post-submit actions, and public-page design settings (`accent_color`, `submit_button_text`, `show_logo`, `cover_image_url`, `page_style`).
- Forms are part of the Comunicazioni workflow package: they reuse the email template library for admin notifications and user confirmations, and can create an internal org-admin request on submit.
- A form can also become booking-enabled: the same public route still saves the normal `form_submission`, but it additionally creates a linked row in `bookings` using the form-level `booking_field_mapping`.
- Booking-enabled forms are configured inside the existing Form Studio (`Automazioni` tab), while daily operations live in the dedicated org-admin page `/org-admin/prenotazioni` with day/week/list views and status updates.
- Phase 2 extends the same booking layer with `rooms` and `room_tables`: associations can configure sale, place round/square/rectangular tables on a polished 2D floor map, and assign a room/table manually to each booking.
- The room map is still driven by the existing booking records: no separate reservation engine or `booking_forms` tables were introduced.
- `GET /api/org-admin/rooms/{room_id}/map` returns the live occupancy state (`free`, `reserved`, `occupied`, `out_of_service`) for the selected date/time context, so the org-admin UI and the agenda share the same source of truth.
- Public forms are available only while the owning association has `communications_enabled=true`.

### Frontend Development

```bash
cd frontend
npm run dev    # Development server
npm run build  # Production build
```

## Dashboard Performance (Feb 07, 2026)

Migliorie applicate su dashboard socio/org-admin/super-admin per ridurre lag su typing:

- isolamento dei form/modali in componenti con stato locale (meno rerender globali)
- memoizzazione dei blocchi tabellari pesanti
- ricerca debounced e callback stabili
- spazi riservati (`min-height`) per ridurre layout shift (CLS)
- modalita `dashboard-perf-mode`: effetti glass/blur ridotti sulle route dashboard/admin
- modale "Aggiungi socio" spostata a submit `FormData` (quasi-uncontrolled) per ridurre lavoro per keypress

Dettagli operativi e guida di misurazione INP: vedi `README_INP.md`.
