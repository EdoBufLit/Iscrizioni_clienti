# QA Checklist

Quick-reference for running builds, tests, and local verification.

---

## Prerequisites

- **Node.js** 20+ and **npm**
- **Python** 3.11+ and **pip**
- **Docker** (optional, for container build)

## 1. Frontend Build & Typecheck

```bash
cd frontend
npm ci
npx tsc --noEmit           # typecheck
npx vite build             # production build
```

**Expected:** zero errors, `dist/` directory with `index.html` + `assets/`.

## 2. Backend Syntax Check

```bash
# From repo root
python -m py_compile app/main.py
python -m py_compile app/routes/public.py
python -m py_compile app/routes/join.py
python -m py_compile app/routes/member.py
python -m py_compile app/routes/org_admin.py
python -m py_compile app/routes/super_admin.py
python -m py_compile app/routes/admin.py
python -m py_compile app/models.py
```

**Expected:** no output (silent success).

## 3. Automated Smoke Tests

```bash
# From repo root — install deps once
pip install -r requirements.txt

# Run the suite
python -m pytest tests/ -v
```

**Expected:** 26 tests pass. The test suite covers:

| Area | Tests |
|---|---|
| Health / Version | `GET /health`, `GET /version`, root redirect |
| Public API | List orgs, org detail, org detail 404, search |
| Join flow | Start join, duplicate email, unknown org |
| Member auth | Unauthenticated `/me`, magic link request, logout |
| Org admin guards | `/me`, `/metrics`, `/members`, `/cards`, `/cards/movements` all return 401 |
| Org admin magic link | Always returns `{"ok": true}` |
| Super admin guards | `/me`, `/org-admins`, create, patch, cards increase all return 401/403 |
| Super admin auth | Bad credentials → 401, logout → 200 |

## 4. Run Backend Locally

```bash
# From repo root
# Ensure .env exists (or set env vars inline)
export DATABASE_URL="sqlite:///data/app.db"
export SECRET_KEY="your-secret"
export BASE_URL="http://localhost:8000"
export SUPER_ADMIN_EMAIL="admin@assonam.it"
export SUPER_ADMIN_PASSWORD="admin"

uvicorn app.main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- SPA: http://localhost:8000/app/ (requires `frontend/dist/` to exist)

## 5. Run Frontend Dev Server

```bash
cd frontend
npm run dev
```

Opens Vite dev server (typically port 5173). **API calls are proxied** to
the backend at `http://localhost:8000` via `vite.config.ts` proxy settings.

## 6. Docker Build & Run

```bash
docker compose build
docker compose up -d
```

- App served at http://localhost:8000
- SPA at http://localhost:8000/app/
- Deep-link refresh (e.g. `/app/associazioni`) works via SPA fallback

## 7. Manual Smoke Tests

### Public Pages
- [ ] Home page loads at `/app/` with hero image, alternating section backgrounds
- [ ] Navigation links work (Lo Studio, Servizi, Associazioni, Contatti)
- [ ] Mobile navigation menu works
- [ ] Logo in header links to home
- [ ] `/app/nonexistent` shows 404 page

### Associations & Registration
- [ ] `/app/associazioni` shows association cards with "Diventa Socio" and "Registrati" links
- [ ] Clicking "Diventa Socio" navigates to `/app/associazioni/{slug}/iscrizione`
- [ ] Clicking "Registrati" navigates to `/app/registrati?org={slug}`
- [ ] `/app/registrati` form renders, validates, submits successfully
- [ ] Registration auto-logs in and redirects to `/app/dashboard`

### Member Auth
- [ ] `/app/login` renders with password mode by default
- [ ] "Registrati" button visible on login page
- [ ] Password login with correct creds → redirects to `/app/dashboard`
- [ ] Password login with wrong creds → falls back to magic link sent
- [ ] "Password dimenticata?" switches to magic link mode
- [ ] Magic link toggle works (password ↔ magic link)
- [ ] Logout button in dashboard works

### Member Dashboard
- [ ] `/app/dashboard` shows status cards (redirects to login if unauthenticated)
- [ ] `/app/dashboard/profilo` shows personal data + change password section
- [ ] Password change form validates min 8 chars and confirm match
- [ ] `/app/dashboard/documenti` shows empty state

### Org Admin
- [ ] `/app/org-admin/login` renders with side image
- [ ] Magic link flow works (request → email → callback → dashboard)
- [ ] `/app/org-admin` shows metrics cards and onboarding checklist
- [ ] `/app/org-admin/soci` shows member table with search/filter
- [ ] `/app/org-admin/tessere` shows card stock and movements
- [ ] Logout button works

### Super Admin
- [ ] `/app/super-admin/login` renders with side image and env var hint
- [ ] Correct creds → redirects to org-admins page
- [ ] Wrong creds → shows "Credenziali non valide" (not generic error)
- [ ] Server error → shows diagnostic message mentioning env vars
- [ ] Create org admin sends invite email
- [ ] Toggle active/inactive works
- [ ] Card stock increase with confirmation dialog

### Card Limits
- [ ] Exhausted stock shows red warning in org admin dashboard
- [ ] Low stock (≤10) shows amber warning
- [ ] New batch from super admin reflects in org admin view

### Email
- [ ] SMTP configured → emails sent via real SMTP
- [ ] SMTP not configured → emails logged to `email_log.txt`
- [ ] Magic link URLs use `BASE_URL` (not localhost in production)

## 8. API Contract Reference

All frontend API calls and their backend handlers:

| Frontend call | Backend route | Auth |
|---|---|---|
| `GET /api/organizations` | `public.py` | None |
| `GET /api/organizations/{slug}` | `public.py` | None |
| `POST /api/join/{org_slug}` | `join.py` | None (rate-limited) |
| `POST /api/join/continue` | `join.py` | Token |
| `POST /api/auth/login` | `member.py` | None (rate-limited) |
| `POST /api/auth/register` | `member.py` | None (rate-limited) |
| `POST /api/auth/change-password` | `member.py` | Session (`member_id`) |
| `POST /api/auth/logout` | `member.py` | None |
| `GET /api/auth/me` | `member.py` | Session (`member_id`) |
| `POST /api/org-admin/auth/magic-link` | `org_admin.py` | None (rate-limited) |
| `GET /api/org-admin/auth/verify` | `org_admin.py` | Token (rate-limited) |
| `GET /api/org-admin/auth/me` | `org_admin.py` | Session (`org_admin_id`) |
| `POST /api/org-admin/auth/logout` | `org_admin.py` | None |
| `GET /api/org-admin/metrics` | `org_admin.py` | Session (`org_admin_id`) |
| `GET /api/org-admin/members` | `org_admin.py` | Session (`org_admin_id`) |
| `GET /api/org-admin/members.csv` | `org_admin.py` | Session (`org_admin_id`) |
| `GET /api/org-admin/cards` | `org_admin.py` | Session (`org_admin_id`) |
| `GET /api/org-admin/cards/movements` | `org_admin.py` | Session (`org_admin_id`) |
| `POST /api/super-admin/auth/login` | `super_admin.py` | Credentials |
| `GET /api/super-admin/auth/me` | `super_admin.py` | Session (`admin_id` + SUPER_ADMIN) |
| `POST /api/super-admin/auth/logout` | `super_admin.py` | None |
| `GET /api/super-admin/org-admins` | `super_admin.py` | Session (`admin_id` + SUPER_ADMIN) |
| `POST /api/super-admin/org-admins` | `super_admin.py` | Session (`admin_id` + SUPER_ADMIN) |
| `PATCH /api/super-admin/org-admins/{id}` | `super_admin.py` | Session (`admin_id` + SUPER_ADMIN) |
| `POST /api/super-admin/orgs/{id}/cards/increase` | `super_admin.py` | Session (`admin_id` + SUPER_ADMIN) |
| `POST /api/super-admin/test-email` | `super_admin.py` | Session (`admin_id` + SUPER_ADMIN) |
| `GET /health` | `main.py` | None |
| `GET /version` | `main.py` | None |

## Known Limitations

- `datetime.utcnow()` deprecation warnings on Python 3.12+ (cosmetic, not blocking)
- Rate limiter is in-memory; resets on app restart
- No Playwright e2e tests yet — manual visual checks documented above
- Test database is file-based (`test_qa.db`), cleaned up after test run
