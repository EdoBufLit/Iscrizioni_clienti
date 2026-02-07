# Association Self-Serve Member Signup & Portal

A minimal web application for association member signup, document upload, and member status verification.

## Features

- **Public Signup**: `/join/{org_slug}`
- **Document Upload**: ID and Fiscal Code (PDF/Image)
- **Member Portal**: Magic link login (no passwords)
- **Status Tracking**: Pending -> Active automation

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
   | `UPLOAD_DIR` | Directory for uploaded files | `data/uploads` |
   | `LOGIN_TOKEN_EXPIRE_MINUTES` | Login link validity | `15` |
   | `JOIN_TOKEN_EXPIRE_MINUTES` | Signup continue link validity | `120` |
   | `SKIP_CREATE_ALL` | Disable auto schema creation | `0` (dev) / `1` (prod) |

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
