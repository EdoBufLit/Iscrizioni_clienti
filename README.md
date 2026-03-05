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
   | `UPLOAD_DIR` | Directory for uploaded files | `data/uploads` |
   | `LOGIN_TOKEN_EXPIRE_MINUTES` | Login link validity | `15` |
   | `JOIN_TOKEN_EXPIRE_MINUTES` | Signup continue link validity | `120` |
   | `SKIP_CREATE_ALL` | Disable auto schema creation | `0` (dev) / `1` (prod) |

### Affiliazione Feature Flags (safe deploy)

- `AFFILIAZIONE_ENABLED=false` (default): public affiliation routes are hidden (`404`) while super-admin review endpoints remain available.
- `AFFILIAZIONE_ENABLED=true`: enables public affiliation flow.

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

- `AFFILIATION_VIDEO_WORKER_ENABLED=false` (default): deploy runs without the `video-worker` profile.
- `AFFILIATION_VIDEO_WORKER_ENABLED=true`: deploy enables docker compose profile `video-worker`.

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
