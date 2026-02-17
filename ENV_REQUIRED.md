# Environment Variables

All environment variables used by the application. Variables marked **required** must be set in production.

## Application

| Variable | Required | Default | Description |
|---|---|---|---|
| `SECRET_KEY` | **Yes** | `supersecretkey` | Secret key for signing session cookies and tokens. Use a long random string in production. |
| `BASE_URL` | **Yes** | `http://localhost:8000` | Public base URL of the application (e.g. `https://app.assonam.it`). Used for API redirects. |
| `FRONTEND_URL` | **Yes** | _(empty)_ | Public URL of the frontend (e.g. `https://assonam.it`). Used for magic links. If missing, falls back to `BASE_URL` + `/app`. |
| `DATABASE_URL` | No | `sqlite:///data/app.db` (local) or `sqlite:////app/data/app.db` (Docker) | SQLAlchemy database URL. Auto-detected based on environment. |
| `UPLOAD_DIR` | No | `<project_root>/data/uploads` | Directory for storing uploaded member documents. |
| `SPA_DIR` | No | `frontend/dist` | Path to the built frontend SPA directory. |

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
| `SMTP_FROM` | No | `noreply@assonam.it` | Sender address for outgoing emails. |
| `SMTP_USE_TLS` | No | `true` | Enable STARTTLS (`true`, `1`, or `yes` to enable). |

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

## Build Metadata (optional)

Set automatically by CI/CD pipelines. Not required for local development.

| Variable | Required | Default | Description |
|---|---|---|---|
| `GIT_SHA` | No | _(empty)_ | Git commit SHA, shown in the admin footer. |
| `BUILD_TIME` | No | _(empty)_ | ISO 8601 build timestamp. |
