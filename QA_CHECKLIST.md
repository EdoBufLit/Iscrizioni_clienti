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
npm run typecheck        # tsc -b --noEmit
npm run build            # tsc -b && vite build
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

uvicorn app.main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- SPA: http://localhost:8000/app/ (requires `frontend/dist/` to exist)

## 5. Run Frontend Dev Server

```bash
cd frontend
npm run dev
```

Opens Vite dev server (typically port 5173). API calls proxy to the
backend at port 8000 if configured, otherwise use the built SPA served
by uvicorn.

## 6. Docker Build & Run

```bash
docker compose build
docker compose up -d
```

- App served at http://localhost:8000
- SPA at http://localhost:8000/app/
- Deep-link refresh (e.g. `/app/associazioni`) works via SPA fallback

## 7. Manual Frontend Checks

These should be verified visually after starting the app:

- [ ] Home page loads at `/app/`
- [ ] Navigation links work (Lo Studio, Servizi, Associazioni, Contatti)
- [ ] `/app/associazioni` shows association cards with "Diventa Socio" CTA
- [ ] Clicking "Diventa Socio" navigates to `/app/associazioni/{slug}/iscrizione`
- [ ] `/app/login` renders the member login form
- [ ] `/app/org-admin/login` renders the org admin login form
- [ ] `/app/super-admin/login` renders the super admin login form
- [ ] `/app/dashboard` redirects or shows unauthenticated state
- [ ] `/app/nonexistent` shows 404 page
- [ ] Logo in header links to home
- [ ] Mobile navigation menu works

## 8. API Contract Reference

All frontend API calls and their backend handlers:

| Frontend call | Backend route | Auth |
|---|---|---|
| `GET /api/organizations` | `public.py` | None |
| `GET /api/organizations/{slug}` | `public.py` | None |
| `POST /api/join/{org_slug}` | `join.py` | None (rate-limited) |
| `POST /api/join/continue` | `join.py` | Token |
| `POST /api/auth/login` | `member.py` | None (rate-limited) |
| `POST /api/auth/logout` | `member.py` | None |
| `GET /api/auth/me` | `member.py` | Session (`member_id`) |
| `POST /api/org-admin/auth/magic-link` | `org_admin.py` | None (rate-limited) |
| `GET /api/org-admin/auth/verify` | `org_admin.py` | Token (rate-limited) |
| `GET /api/org-admin/auth/me` | `org_admin.py` | Session (`org_admin_id`) |
| `POST /api/org-admin/auth/logout` | `org_admin.py` | None |
| `GET /api/org-admin/metrics` | `org_admin.py` | Session (`org_admin_id`) |
| `GET /api/org-admin/members` | `org_admin.py` | Session (`org_admin_id`) |
| `GET /api/org-admin/cards` | `org_admin.py` | Session (`org_admin_id`) |
| `GET /api/org-admin/cards/movements` | `org_admin.py` | Session (`org_admin_id`) |
| `POST /api/super-admin/auth/login` | `super_admin.py` | Credentials |
| `GET /api/super-admin/auth/me` | `super_admin.py` | Session (`admin_id` + SUPER_ADMIN) |
| `POST /api/super-admin/auth/logout` | `super_admin.py` | None |
| `GET /api/super-admin/org-admins` | `super_admin.py` | Session (`admin_id` + SUPER_ADMIN) |
| `POST /api/super-admin/org-admins` | `super_admin.py` | Session (`admin_id` + SUPER_ADMIN) |
| `PATCH /api/super-admin/org-admins/{id}` | `super_admin.py` | Session (`admin_id` + SUPER_ADMIN) |
| `POST /api/super-admin/orgs/{id}/cards/increase` | `super_admin.py` | Session (`admin_id` + SUPER_ADMIN) |
| `GET /health` | `main.py` | None |
| `GET /version` | `main.py` | None |

## Known Limitations

- `datetime.utcnow()` deprecation warnings on Python 3.12+ (cosmetic, not blocking)
- Rate limiter is in-memory; resets on app restart
- No Playwright e2e tests yet — manual visual checks documented above
- Test database is file-based (`test_qa.db`), cleaned up after test run
